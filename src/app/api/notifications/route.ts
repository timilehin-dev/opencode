// POST /api/notifications
// Smart polling endpoint — checks Gmail, Calendar, GitHub for changes
// Client sends known IDs; server returns only genuinely new notifications.
//
// Designed for Vercel serverless (no persistent state between invocations).
// Deduplication is client-driven via seenIds.

import { NextRequest, NextResponse } from 'next/server';
import {
  gGmailListMessages,
  gGmailGetMessage,
  gCalListEvents,
} from '@/lib/integrations/google';
import { listIssues, listPullRequests } from '@/lib/integrations/github';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SeenIds {
  email?: string[];
  calendar?: string[];
  github?: string[]; // "issue-{number}" | "pr-{number}"
}

interface NotificationPayload {
  id: string;
  type: 'email' | 'calendar' | 'github' | 'system';
  priority: 'urgent' | 'high' | 'normal' | 'low';
  title: string;
  body: string;
  timestamp: string;
  sourceId: string;
  actionUrl: string;
  actionLabel: string;
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body: { seenIds?: SeenIds } = await req.json().catch(() => ({}));
    const seenIds = body.seenIds ?? {};

    const knownEmailIds = new Set(seenIds.email ?? []);
    const knownEventIds = new Set(seenIds.calendar ?? []);
    const knownGithubIds = new Set(seenIds.github ?? []);

    const notifications: NotificationPayload[] = [];
    const newSeenIds: SeenIds = {
      email: [],
      calendar: [],
      github: [],
    };

    // Current live counts (for badges / overview)
    const currentCounts = {
      unreadEmails: 0,
      upcomingEvents: 0,
      openIssues: 0,
      openPRs: 0,
    };

    // ---------------------------------------------------------------
    // 1. Gmail — unread messages
    // ---------------------------------------------------------------
    try {
      // Only fetch unread emails from the last 7 days to avoid stale notifications
      // Gmail API newer_than operator uses day/month/year format (e.g., "7d"), not epoch seconds
      const listRes = await gGmailListMessages(`is:unread newer_than:7d`, undefined, 10);
      currentCounts.unreadEmails = listRes.resultSizeEstimate ?? listRes.messages?.length ?? 0;

      if (listRes.messages?.length) {
        // Fetch only messages we haven't seen before (batch of 5 concurrent)
        const unseen = listRes.messages.filter((m) => !knownEmailIds.has(m.id));

        if (unseen.length > 0) {
          const fetched: {
            id: string;
            from: string;
            subject: string;
            date: string;
            labelIds: string[];
            internalDate: string;
          }[] = [];

          // Batch fetch (5 at a time to avoid rate limits)
          for (let i = 0; i < unseen.length; i += 5) {
            const batch = unseen.slice(i, i + 5);
            const results = await Promise.allSettled(
              batch.map(async (m) => {
                const msg = await gGmailGetMessage(m.id, 'metadata');
                const headers = msg.payload?.headers ?? [];
                const get = (name: string) =>
                  headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
                return {
                  id: msg.id,
                  from: get('From'),
                  subject: get('Subject') || '(No subject)',
                  date: get('Date'),
                  labelIds: msg.labelIds ?? [],
                  internalDate: msg.internalDate,
                };
              }),
            );

            for (const r of results) {
              if (r.status === 'fulfilled') fetched.push(r.value);
            }
          }

          for (const msg of fetched) {
            const isImportant =
              msg.labelIds.includes('IMPORTANT') ||
              msg.labelIds.includes('STARRED') ||
              msg.labelIds.includes('INBOX');
            const priority: NotificationPayload['priority'] = isImportant ? 'high' : 'normal';

            const sender = msg.from.match(/^(.+?)\s*<.*>$/)
              ? msg.from.match(/^(.+?)\s*<.*>$/)![1].trim().replace(/"/g, '')
              : msg.from;

            notifications.push({
              id: `email-${msg.id}`,
              type: 'email',
              priority,
              title: `New email from ${sender}`,
              body: msg.subject,
              timestamp: msg.internalDate
                ? new Date(parseInt(msg.internalDate)).toISOString()
                : new Date().toISOString(),
              sourceId: msg.id,
              actionUrl: '/gmail',
              actionLabel: 'View',
            });

            newSeenIds.email!.push(msg.id);
          }
        }

        // Track ALL current IDs (including previously seen) so next poll is accurate
        for (const m of listRes.messages) {
          if (!newSeenIds.email!.includes(m.id)) {
            newSeenIds.email!.push(m.id);
          }
        }
      }
    } catch (err) {
      console.error('[notifications] Gmail check failed:', err);
    }

    // ---------------------------------------------------------------
    // 2. Calendar — events in next 2 hours
    // ---------------------------------------------------------------
    try {
      const now = new Date();
      const twoHoursOut = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const events = await gCalListEvents(
        'primary',
        now.toISOString(),
        twoHoursOut.toISOString(),
        15,
      );

      for (const evt of events) {
        if (evt.status === 'cancelled') continue;

        const startStr = evt.start?.dateTime || evt.start?.date || '';
        if (!startStr) continue;

        const startMs = new Date(startStr).getTime();
        currentCounts.upcomingEvents++;

        if (knownEventIds.has(evt.id)) {
          newSeenIds.calendar!.push(evt.id);
          continue;
        }

        const minsUntil = Math.floor((startMs - Date.now()) / 60_000);
        let priority: NotificationPayload['priority'] = 'normal';
        if (minsUntil <= 5) priority = 'urgent';
        else if (minsUntil <= 30) priority = 'high';
        else if (minsUntil <= 60) priority = 'normal';

        const timeLabel =
          minsUntil <= 0
            ? 'Starting now!'
            : `In ${minsUntil}m`;

        notifications.push({
          id: `cal-${evt.id}`,
          type: 'calendar',
          priority,
          title: `Upcoming: ${evt.summary || 'Event'}`,
          body: `${timeLabel}${evt.location ? ` · ${evt.location}` : ''}`,
          timestamp: startStr,
          sourceId: evt.id,
          actionUrl: '/calendar',
          actionLabel: 'View',
        });

        newSeenIds.calendar!.push(evt.id);
      }
    } catch (err) {
      console.error('[notifications] Calendar check failed:', err);
    }

    // ---------------------------------------------------------------
    // 3. GitHub — open issues + PRs
    // ---------------------------------------------------------------
    try {
      const [issues, prs] = await Promise.all([
        listIssues('open', 1, 10).catch(() => [] as { number: number; title: string; user: { login: string }; labels: { name: string }[]; created_at: string }[]),
        listPullRequests('open', 1, 10).catch(() => [] as { number: number; title: string; user: { login: string }; created_at: string }[]),
      ]);

      currentCounts.openIssues = issues.length;
      currentCounts.openPRs = prs.length;

      for (const issue of issues) {
        const key = `issue-${issue.number}`;
        if (knownGithubIds.has(key)) {
          newSeenIds.github!.push(key);
          continue;
        }

        const hasLabel = issue.labels?.length > 0;
        notifications.push({
          id: `gh-issue-${issue.number}`,
          type: 'github',
          priority: hasLabel ? 'high' : 'normal',
          title: `Issue: ${issue.title}`,
          body: `#${issue.number} · ${issue.user?.login ?? 'someone'}`,
          timestamp: issue.created_at,
          sourceId: key,
          actionUrl: '/github',
          actionLabel: 'View',
        });

        newSeenIds.github!.push(key);
      }

      for (const pr of prs) {
        const key = `pr-${pr.number}`;
        if (knownGithubIds.has(key)) {
          newSeenIds.github!.push(key);
          continue;
        }

        notifications.push({
          id: `gh-pr-${pr.number}`,
          type: 'github',
          priority: 'normal',
          title: `PR: ${pr.title}`,
          body: `#${pr.number} · ${pr.user?.login ?? 'someone'}`,
          timestamp: pr.created_at,
          sourceId: key,
          actionUrl: '/github',
          actionLabel: 'View',
        });

        newSeenIds.github!.push(key);
      }
    } catch (err) {
      console.error('[notifications] GitHub check failed:', err);
    }

    // ---------------------------------------------------------------
    // Sort: urgent first, then by timestamp (newest first)
    // ---------------------------------------------------------------
    const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
    notifications.sort((a, b) => {
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    return NextResponse.json({
      success: true,
      notifications,
      currentCounts,
      newSeenIds,
    });
  } catch (error) {
    console.error('[notifications] Unhandled error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to check notifications' },
      { status: 500 },
    );
  }
}
