// ---------------------------------------------------------------------------
// /api/webhooks/github — GitHub Webhook Receiver
//
// Receives push events from GitHub webhooks and converts them into
// trigger_events for the proactive scanning system.
//
// Supported events:
//   - issues (opened, closed, labeled, assigned)
//   - pull_request (opened, closed, synchronize, review_requested)
//   - push (new commits)
//   - deployment_status (deploy success/failure)
//   - workflow_run (CI success/failure)
//   - repository_vulnerability_alert (Dependabot alerts)
//
// Setup: Configure your GitHub repo webhook to point to this URL
//        with a shared secret for signature verification.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { query } from '@/lib/core/db';

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || '';

function verifySignature(payload: string, signature: string | null) {
  if (!WEBHOOK_SECRET) {
    // No secret configured — accept all (dev mode)
    console.warn('[webhook:github] No GITHUB_WEBHOOK_SECRET set — skipping signature verification');
    return true;
  }
  if (!signature) return false;

  const expected = 'sha256=' + crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

function getEventInfo(body: any, eventType: string | null) {
  const repo = body.repository?.full_name || 'unknown';
  const action = body.action || '';
  const sender = body.sender?.login || 'unknown';

  switch (eventType) {
    case 'issues': {
      const issue = body.issue || {};
      return {
        event_type: `issue_${action || 'updated'}`,
        external_id: `github:issue:${issue.number}`,
        title: `Issue ${action}: #${issue.number} — ${issue.title}`,
        severity: issue.labels?.some((l: any) => l.name === 'bug') ? 'high' :
                  issue.labels?.some((l: any) => l.name === 'urgent') ? 'critical' : 'normal',
        payload: {
          issue_number: issue.number,
          title: issue.title,
          state: issue.state,
          action,
          labels: issue.labels?.map((l: any) => l.name) || [],
          author: issue.user?.login,
          url: issue.html_url,
          body_preview: (issue.body || '').substring(0, 500),
          assignees: issue.assignees?.map((a: any) => a.login) || [],
          repository: repo,
          sender,
        },
      };
    }

    case 'pull_request': {
      const pr = body.pull_request || {};
      const merged = action === 'closed' && pr.merged;
      return {
        event_type: merged ? 'pr_merged' : `pr_${action || 'updated'}`,
        external_id: `github:pr:${pr.number}`,
        title: `PR ${merged ? 'merged' : action}: #${pr.number} — ${pr.title}`,
        severity: (pr.draft ? 'low' :
                   pr.mergeable === false || pr.mergeable_state === 'dirty' ? 'high' : 'normal'),
        payload: {
          pr_number: pr.number,
          title: pr.title,
          state: pr.state,
          action,
          draft: pr.draft,
          merged,
          author: pr.user?.login,
          url: pr.html_url,
          body_preview: (pr.body || '').substring(0, 500),
          additions: pr.additions,
          deletions: pr.deletions,
          base_branch: pr.base?.ref,
          head_branch: pr.head?.ref,
          repository: repo,
          sender,
        },
      };
    }

    case 'push': {
      const commits = body.commits || [];
      const ref = body.ref || '';
      return {
        event_type: ref.includes('tags') ? 'tag_push' : 'push',
        external_id: `github:push:${body.after || body.before}`,
        title: `Push to ${ref}: ${commits.length} commit(s) by ${sender}`,
        severity: 'low',
        payload: {
          ref,
          before: body.before,
          after: body.after,
          commits: commits.map((c: any) => ({ message: c.message, author: c.author?.username, url: c.url })),
          forced: body.forced,
          repository: repo,
          sender,
        },
      };
    }

    case 'workflow_run': {
      const run = body.workflow_run || {};
      return {
        event_type: run.conclusion === 'success' ? 'ci_success' :
                    run.conclusion === 'failure' ? 'ci_failure' :
                    `ci_${run.status || 'unknown'}`,
        external_id: `github:ci:${run.id}`,
        title: `CI ${run.conclusion || run.status}: ${run.name} on ${run.head_branch}`,
        severity: run.conclusion === 'failure' ? 'high' : 'low',
        payload: {
          workflow_name: run.name,
          workflow_id: run.workflow_id,
          run_id: run.id,
          status: run.status,
          conclusion: run.conclusion,
          head_branch: run.head_branch,
          head_sha: run.head_sha,
          run_number: run.run_number,
          url: run.html_url,
          actor: run.actor?.login,
          repository: repo,
          sender,
        },
      };
    }

    case 'repository_vulnerability_alert': {
      const alert = body.alert || {};
      return {
        event_type: 'vulnerability_alert',
        external_id: `github:vuln:${alert.ghsa_id}`,
        title: `Security alert: ${alert.summary || 'Dependency vulnerability'} in ${repo}`,
        severity: alert.severity === 'critical' ? 'critical' :
                  alert.severity === 'high' ? 'high' : 'medium',
        payload: {
          ghsa_id: alert.ghsa_id,
          cve_id: alert.cve?.id,
          severity: alert.severity,
          summary: alert.summary,
          url: alert.html_url,
          dependency: alert.dependency?.package?.name,
          vulnerable_version: alert.vulnerable_version_range,
          patched_version: alert.patched_version,
          repository: repo,
          sender,
        },
      };
    }

    case 'deployment_status': {
      const ds = body.deployment_status || {};
      const deployment = body.deployment || {};
      return {
        event_type: ds.state === 'success' ? 'deploy_succeeded' :
                    ds.state === 'failure' ? 'deploy_failed' : `deploy_${ds.state}`,
        external_id: `github:deploy:${ds.id}`,
        title: `GitHub Deployment ${ds.state}: ${deployment.environment || 'unknown'}`,
        severity: ds.state === 'failure' ? 'high' : 'low',
        payload: {
          deployment_id: ds.id,
          state: ds.state,
          environment: deployment.environment,
          description: ds.description,
          target_url: ds.target_url,
          repository: repo,
          sender,
        },
      };
    }

    default:
      return {
        event_type: `github_${eventType}`,
        external_id: `github:${eventType}:${Date.now()}`,
        title: `GitHub event: ${eventType}`,
        severity: 'low',
        payload: { ...body, _event_type: eventType, repository: repo, sender },
      };
  }
}

export async function POST(request: NextRequest) {
  try {
    const bodyText = await request.text();
    const signature = request.headers.get('x-hub-signature-256');
    const eventType = request.headers.get('x-github-event');
    const deliveryId = request.headers.get('x-github-delivery');

    // Verify signature
    if (!verifySignature(bodyText, signature)) {
      console.error('[webhook:github] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const body = JSON.parse(bodyText);
    const eventInfo = getEventInfo(body, eventType);

    // Dedup check
    const existing = await query(
      'SELECT id FROM trigger_events WHERE external_id = $1 LIMIT 1',
      [eventInfo.external_id]
    );

    if (existing.rows.length > 0) {
      return NextResponse.json({ ok: true, deduplicated: true, event: eventInfo.event_type });
    }

    await query(
      'INSERT INTO trigger_events (source, event_type, external_id, title, payload, severity, status) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)',
      ['github', eventInfo.event_type, eventInfo.external_id, eventInfo.title, eventInfo.payload, eventInfo.severity, 'pending']
    );

    console.log(`[webhook:github] Received ${eventType} → ${eventInfo.event_type}: ${eventInfo.title}`);

    return NextResponse.json({
      ok: true,
      event: eventInfo.event_type,
      title: eventInfo.title,
      delivery_id: deliveryId,
    });
  } catch (err) {
    console.error('[webhook:github] Error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Handle GET for webhook verification (GitHub sends this when setting up the webhook)
export async function GET(request: NextRequest) {
  return NextResponse.json({
    name: 'KlawHub GitHub Webhook Receiver',
    supported_events: [
      'issues', 'pull_request', 'push', 'workflow_run',
      'repository_vulnerability_alert', 'deployment_status',
    ],
    configured: !!WEBHOOK_SECRET,
  });
}
