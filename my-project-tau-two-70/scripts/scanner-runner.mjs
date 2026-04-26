#!/usr/bin/env node
/**
 * KlawHub Scanner Runner — Proactive External Service Scanner
 *
 * Runs as a GitHub Actions workflow (every 10 minutes) or via repository_dispatch.
 * This is the PULL arm of the proactive system — it reaches OUT to external services
 * to detect changes and creates trigger_events for the trigger engine to process.
 *
 * Scanners:
 *   - GitHub: New issues, PRs, failing CI, Dependabot alerts
 *   - Gmail: New unread emails (urgent/important detection)
 *   - Vercel: Recent deployment status changes, build failures
 *
 * Flow:
 *   1. Check scan_state for each source's last cursor
 *   2. Call external API with since/cursor filter
 *   3. Compare results against known state
 *   4. Write NEW events to trigger_events table
 *   5. Run the trigger engine to match events → agent_tasks
 *   6. Update scan_state cursor
 *
 * Usage: node scripts/scanner-runner.mjs [--source github|gmail|vercel|all] [--dry-run]
 */

import pg from 'pg';

const { Pool } = pg;
const SOURCE = process.argv.find(a => a.startsWith('--source'))?.split('=')[1] || 'all';
const DRY_RUN = process.argv.includes('--dry-run');

if (!process.env.SUPABASE_DB_URL) {
  console.error('ERROR: SUPABASE_DB_URL environment variable is required.');
  process.exit(1);
}

console.log(`[Scanner] Starting at ${new Date().toISOString()} (source: ${SOURCE}, dry-run: ${DRY_RUN})`);

let pool;

async function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.SUPABASE_DB_URL + '?pgbouncer=true&prepare=false',
      connectionTimeoutMillis: 10000,
      statement_timeout: 30000,
      max: 3,
    });
  }
  return pool;
}

// ─── GitHub Configuration ────────────────────────────────────────────────────

function getGitHubRepo() {
  // Default repo — can be overridden via env or scan_state metadata
  return process.env.GITHUB_REPO || 'timilehin-dev/my-project-tau-two-70';
}

function getGitHubHeaders() {
  const pat = process.env.CLAW_GITHUB_PAT;
  if (!pat) return {};
  return {
    'Authorization': `Bearer ${pat}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'KlawHub-Scanner/1.0',
  };
}

// ─── GitHub Scanner ──────────────────────────────────────────────────────────

async function scanGitHub(db, scanState) {
  const startTime = Date.now();
  const repo = getGitHubRepo();
  const headers = getGitHubHeaders();
  const lastScan = scanState?.last_scan_at || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  console.log(`[github] Scanning ${repo} since ${lastScan}...`);
  const events = [];

  // 1. Scan for new/open issues
  try {
    const since = lastScan.split('T')[0]; // YYYY-MM-DD format for GitHub API
    const issueRes = await fetch(`https://api.github.com/repos/${repo}/issues?state=all&since=${since}&per_page=30`, { headers });
    if (issueRes.ok) {
      const issues = await issueRes.json();
      for (const issue of issues) {
        // Skip PRs (GitHub returns PRs in the issues endpoint)
        if (issue.pull_request) continue;

        const eventTime = new Date(issue.created_at);
        if (eventTime <= new Date(lastScan)) continue;

        // Determine event type based on issue state and activity
        const updatedTime = new Date(issue.updated_at);
        const eventType = issue.state === 'open' ? 'issue_opened' : 'issue_closed';
        const severity = issue.labels?.some(l => l.name === 'bug') ? 'high' :
                         issue.labels?.some(l => l.name === 'urgent') ? 'critical' : 'normal';

        events.push({
          source: 'github',
          event_type: eventType,
          external_id: `github:issue:${issue.number}`,
          title: `${eventType === 'issue_opened' ? 'New issue' : 'Issue closed'}: #${issue.number} — ${issue.title}`,
          payload: {
            issue_number: issue.number,
            title: issue.title,
            state: issue.state,
            labels: issue.labels?.map(l => l.name) || [],
            author: issue.user?.login,
            url: issue.html_url,
            body_preview: (issue.body || '').substring(0, 500),
            repository: repo,
          },
          severity,
          event_timestamp: issue.created_at,
        });
      }
      console.log(`[github] Found ${issues.length} issues (filtered to ${events.length} new)`);
    } else {
      console.warn(`[github] Issues API returned ${issueRes.status}: ${await issueRes.text()}`);
    }
  } catch (err) {
    console.warn(`[github] Error scanning issues:`, err.message);
  }

  // 2. Scan for recent PRs
  try {
    const since = lastScan.split('T')[0];
    const prRes = await fetch(`https://api.github.com/repos/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=10`, { headers });
    if (prRes.ok) {
      const prs = await prRes.json();
      const prEvents = [];
      for (const pr of prs) {
        const eventTime = new Date(pr.updated_at);
        if (eventTime <= new Date(lastScan)) continue;

        let eventType = 'pr_updated';
        if (pr.merged_at && new Date(pr.merged_at) > new Date(lastScan)) eventType = 'pr_merged';
        else if (pr.state === 'closed' && !pr.merged_at) eventType = 'pr_closed';
        else if (new Date(pr.created_at) > new Date(lastScan)) eventType = 'pr_opened';

        const severity = pr.draft ? 'low' :
                         (pr.mergeable_state === 'dirty' || pr.mergeable === false) ? 'high' : 'normal';

        prEvents.push({
          source: 'github',
          event_type: eventType,
          external_id: `github:pr:${pr.number}`,
          title: `${eventType.replace(/_/g, ' ')}: #${pr.number} — ${pr.title}`,
          payload: {
            pr_number: pr.number,
            title: pr.title,
            state: pr.state,
            draft: pr.draft,
            merged: !!pr.merged_at,
            author: pr.user?.login,
            url: pr.html_url,
            body_preview: (pr.body || '').substring(0, 500),
            repository: repo,
            additions: pr.additions,
            deletions: pr.deletions,
          },
          severity,
          event_timestamp: pr.updated_at,
        });
      }
      events.push(...prEvents);
      console.log(`[github] Found ${prs.length} PRs (filtered to ${prEvents.length} new)`);
    }
  } catch (err) {
    console.warn(`[github] Error scanning PRs:`, err.message);
  }

  // 3. Scan for recent commits (detect CI failures via checks)
  try {
    const commitRes = await fetch(`https://api.github.com/repos/${repo}/commits?per_page=10`, { headers });
    if (commitRes.ok) {
      const commits = await commitRes.json();
      for (const commit of commits) {
        const eventTime = new Date(commit.commit.author.date);
        if (eventTime <= new Date(lastScan)) continue;

        events.push({
          source: 'github',
          event_type: 'new_commit',
          external_id: `github:commit:${commit.sha}`,
          title: `New commit: ${commit.sha.substring(0, 7)} — ${commit.commit.message.split('\n')[0]}`,
          payload: {
            sha: commit.sha,
            message: commit.commit.message,
            author: commit.commit.author.name,
            url: commit.html_url,
            repository: repo,
          },
          severity: 'low',
          event_timestamp: commit.commit.author.date,
        });
      }
      console.log(`[github] Checked recent commits`);
    }
  } catch (err) {
    console.warn(`[github] Error scanning commits:`, err.message);
  }

  return { events, durationMs: Date.now() - startTime };
}

// ─── Gmail Scanner ───────────────────────────────────────────────────────────

/**
 * Gmail scanning uses the Google OAuth credentials already configured for the agents.
 * It fetches recent unread messages and classifies them by urgency.
 */
async function getGoogleAccessToken() {
  // Exchange refresh token for access token (same flow as agent tools)
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    console.warn('[gmail] Missing Google OAuth credentials — skipping Gmail scan');
    return null;
  }

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!res.ok) {
      console.warn(`[gmail] Token exchange failed: ${res.status}`);
      return null;
    }

    const data = await res.json();
    return data.access_token;
  } catch (err) {
    console.warn('[gmail] Error getting access token:', err.message);
    return null;
  }
}

async function scanGmail(db, scanState) {
  const startTime = Date.now();
  const accessToken = await getGoogleAccessToken();
  if (!accessToken) return { events: [], durationMs: Date.now() - startTime, skipped: true };

  console.log('[gmail] Scanning for new unread emails...');
  const events = [];

  try {
    // Fetch unread messages from the last scan
    const lastScan = scanState?.last_scan_at
      ? new Date(new Date(scanState.last_scan_at).getTime() / 1000).toISOString()  // Gmail uses seconds
      : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Search for unread messages
    const searchQuery = `is:unread after:${lastScan.split('T')[0].replace(/-/g, '/')}`;
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}&maxResults=20`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!listRes.ok) {
      console.warn(`[gmail] List messages failed: ${listRes.status}`);
      return { events: [], durationMs: Date.now() - startTime };
    }

    const listData = await listRes.json();
    const messages = listData.messages || [];

    // Fetch full details for each message (batch)
    for (const msg of messages) {
      const detailRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From,Subject,Date,To,Importance,Labels`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!detailRes.ok) continue;
      const detail = await detailRes.json();

      const headers = {};
      for (const h of detail.payload?.headers || []) {
        headers[h.name.toLowerCase()] = h.value;
      }

      const subject = headers.subject || '(no subject)';
      const from = headers.from || 'unknown';
      const date = headers.date || '';
      const labels = detail.labelIds || [];
      const historyId = detail.historyId;

      // Classify urgency
      let severity = 'normal';
      let eventType = 'email_received';

      const isUrgent = labels.includes('UNREAD') && (
        labels.includes('IMPORTANT') ||
        labels.includes('STARRED') ||
        subject.match(/\b(urgent|asap|critical|immediate|action required)\b/i) ||
        from.match(/noreply\@(github|vercel|supabase)\.com/i)  // CI/deploy notifications
      );

      if (isUrgent) {
        severity = 'high';
        eventType = 'email_urgent';
      } else if (labels.includes('CATEGORY_UPDATES') || labels.includes('CATEGORY_PROMOTIONS')) {
        severity = 'low';
      }

      events.push({
        source: 'gmail',
        event_type: eventType,
        external_id: `gmail:${msg.id}`,
        title: `${eventType === 'email_urgent' ? 'Urgent email' : 'New email'}: ${subject}`,
        payload: {
          message_id: msg.id,
          thread_id: detail.threadId,
          subject,
          from,
          to: headers.to,
          date,
          labels,
          snippet: detail.snippet?.substring(0, 300) || '',
          history_id: historyId,
        },
        severity,
        event_timestamp: detail.internalDate ? new Date(parseInt(detail.internalDate)).toISOString() : new Date().toISOString(),
      });
    }

    console.log(`[gmail] Found ${events.length} new unread emails (${events.filter(e => e.severity === 'high').length} urgent)`);
  } catch (err) {
    console.warn('[gmail] Error scanning Gmail:', err.message);
  }

  return { events, durationMs: Date.now() - startTime };
}

// ─── Vercel Scanner ──────────────────────────────────────────────────────────

async function scanVercel(db, scanState) {
  const startTime = Date.now();
  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    console.warn('[vercel] No VERCEL_TOKEN configured — skipping Vercel scan');
    return { events: [], durationMs: Date.now() - startTime, skipped: true };
  }

  console.log('[vercel] Scanning for deployment status changes...');
  const events = [];

  try {
    // List recent deployments
    const depRes = await fetch('https://api.vercel.com/v6/deployments?limit=10', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!depRes.ok) {
      console.warn(`[vercel] Deployments API returned ${depRes.status}`);
      return { events: [], durationMs: Date.now() - startTime };
    }

    const deployments = await depRes.json();
    const lastScan = scanState?.last_scan_at || new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    for (const dep of deployments.deployments || []) {
      const createdTime = new Date(dep.created);
      if (createdTime <= new Date(lastScan)) continue;

      let eventType = 'deploy_created';
      let severity = 'normal';

      if (dep.state === 'READY') {
        eventType = 'deploy_succeeded';
        severity = 'low';
      } else if (dep.state === 'ERROR') {
        eventType = 'deploy_failed';
        severity = 'high';
      } else if (dep.state === 'BUILD_ERROR') {
        eventType = 'build_failed';
        severity = 'critical';
      } else if (dep.state === 'CANCELED') {
        eventType = 'deploy_cancelled';
        severity = 'low';
      } else if (dep.state === 'QUEUED' || dep.state === 'BUILDING') {
        eventType = 'deploy_started';
        severity = 'low';
      }

      events.push({
        source: 'vercel',
        event_type: eventType,
        external_id: `vercel:deploy:${dep.uid}`,
        title: `${eventType.replace(/_/g, ' ')}: ${dep.name} — ${dep.state}`,
        payload: {
          deployment_id: dep.uid,
          project: dep.name,
          state: dep.state,
          url: dep.url,
          target: dep.target,
          created: dep.created,
          creator: dep.creator?.username,
          production: dep.target === 'production',
          regions: dep.regions || [],
        },
        severity,
        event_timestamp: dep.created,
      });
    }

    console.log(`[vercel] Found ${events.length} recent deployments`);
  } catch (err) {
    console.warn('[vercel] Error scanning Vercel:', err.message);
  }

  return { events, durationMs: Date.now() - startTime };
}

// ─── Trigger Engine ──────────────────────────────────────────────────────────

/**
 * Evaluates unprocessed trigger_events against enabled triggers.
 * Matches events by (source, event_type) and applies filter_config.
 * Creates agent_tasks for matched events.
 */
async function runTriggerEngine(db) {
  console.log('\n[trigger-engine] Evaluating unprocessed events...');
  const result = { matched: 0, tasksCreated: 0, notificationsSent: 0, errors: [] };

  try {
    // Get all pending events, prioritized by severity
    const events = await db.query(
      `SELECT * FROM trigger_events
       WHERE status = 'pending'
       ORDER BY
         CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 WHEN 'normal' THEN 4 ELSE 5 END,
         created_at ASC
       LIMIT 50
       FOR UPDATE SKIP LOCKED`
    );

    if (events.rows.length === 0) {
      console.log('[trigger-engine] No pending events to evaluate');
      return result;
    }

    // Get all enabled triggers
    const triggers = await db.query(
      `SELECT * FROM triggers WHERE enabled = TRUE`
    );

    if (triggers.rows.length === 0) {
      console.log('[trigger-engine] No enabled triggers — skipping all events');
      // Mark events as skipped
      for (const event of events.rows) {
        await db.query("UPDATE trigger_events SET status = 'skipped', processed_at = NOW() WHERE id = $1", [event.id]);
      }
      return result;
    }

    console.log(`[trigger-engine] Evaluating ${events.rows.length} events against ${triggers.rows.length} triggers`);

    for (const event of events.rows) {
      let matched = false;

      // Find matching triggers for this event
      for (const trigger of triggers.rows) {
        // Match source and event_type
        if (trigger.source !== event.source) continue;
        if (trigger.event_type !== event.event_type) continue;

        // Check cooldown
        if (trigger.last_triggered_at) {
          const elapsed = (Date.now() - new Date(trigger.last_triggered_at).getTime()) / 1000;
          if (elapsed < trigger.cooldown_seconds) {
            console.log(`  [trigger-engine] Trigger "${trigger.name}" on cooldown (${Math.round(trigger.cooldown_seconds - elapsed)}s remaining)`);
            continue;
          }
        }

        // Apply filter_config if present
        if (trigger.filter_config && Object.keys(trigger.filter_config).length > 0) {
          const passes = applyFilters(trigger.filter_config, event.payload);
          if (!passes) {
            console.log(`  [trigger-engine] Event #${event.id} did not pass filters for trigger "${trigger.name}"`);
            continue;
          }
        }

        // MATCH! Execute the trigger action
        matched = true;
        console.log(`  [trigger-engine] MATCH: Event #${event.id} (${event.event_type}) → Trigger "${trigger.name}"`);

        try {
          const actionConfig = trigger.action_config || {};
          const priority = actionConfig.priority || event.severity === 'critical' ? 'critical' :
                          event.severity === 'high' ? 'high' : 'medium';

          switch (trigger.action_type) {
            case 'create_task': {
              const agentId = actionConfig.agent_id || trigger.agent_id || 'general';
              const taskTemplate = actionConfig.task_template || buildDefaultTaskPrompt(event);

              // Interpolate template with event data
              const taskPrompt = taskTemplate
                .replace('{{event_type}}', event.event_type)
                .replace('{{title}}', event.title)
                .replace('{{severity}}', event.severity)
                .replace('{{payload}}', JSON.stringify(event.payload, null, 2))
                .replace('{{source}}', event.source);

              const taskResult = await db.query(
                `INSERT INTO agent_tasks (agent_id, task, context, trigger_type, trigger_source, priority)
                 VALUES ($1, $2, $3, 'proactive_scan', $4, $5)
                 RETURNING id`,
                [
                  agentId,
                  taskPrompt,
                  JSON.stringify({
                    source: 'proactive-scanner',
                    trigger_id: trigger.id,
                    trigger_name: trigger.name,
                    event_id: event.id,
                    event_type: event.event_type,
                    severity: event.severity,
                  }),
                  `trigger:${trigger.id}:event:${event.id}`,
                  priority,
                ]
              );

              result.tasksCreated++;
              console.log(`    → Created task #${taskResult.rows[0].id} for ${agentId} (priority: ${priority})`);

              // Update event
              await db.query(
                `UPDATE trigger_events SET status = 'processed', matched_trigger_id = $1, matched_agent_task_id = $2, processing_result = $3, processed_at = NOW() WHERE id = $4`,
                [trigger.id, taskResult.rows[0].id, JSON.stringify({ action: 'create_task', agent_id: agentId, task_id: taskResult.rows[0].id }), event.id]
              );

              // Update trigger stats
              await db.query(
                `UPDATE triggers SET last_triggered_at = NOW(), fire_count = fire_count + 1, last_result = $1 WHERE id = $2`,
                [JSON.stringify({ event_id: event.id, task_id: taskResult.rows[0].id }), trigger.id]
              );
              break;
            }

            case 'send_notification': {
              const notifTitle = actionConfig.notification_title || event.title;
              const notifBody = actionConfig.notification_body || `New event detected: ${event.title}`;

              await db.query(
                `INSERT INTO proactive_notifications (agent_id, agent_name, type, title, body, priority, metadata)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                  actionConfig.agent_id || 'ops',
                  actionConfig.agent_name || 'Scanner',
                  'event',
                  notifTitle,
                  notifBody,
                  event.severity === 'critical' ? 'high' : event.severity === 'high' ? 'high' : 'normal',
                  JSON.stringify({ source: 'proactive-scanner', trigger_id: trigger.id, event_id: event.id, payload: event.payload }),
                ]
              );

              result.notificationsSent++;
              await db.query(
                `UPDATE trigger_events SET status = 'processed', matched_trigger_id = $1, processed_at = NOW() WHERE id = $2`,
                [trigger.id, event.id]
              );
              await db.query(
                `UPDATE triggers SET last_triggered_at = NOW(), fire_count = fire_count + 1 WHERE id = $1`,
                [trigger.id]
              );
              break;
            }

            case 'send_a2a_message': {
              const targetAgent = actionConfig.agent_id || 'general';
              const message = actionConfig.message || `Proactive scan detected: ${event.title}\n\nEvent data: ${JSON.stringify(event.payload, null, 2)}`;

              await db.query(
                `INSERT INTO a2a_messages (from_agent, to_agent, type, topic, payload, priority, status)
                 VALUES ($1, $2, 'request', $3, $4, $5, 'delivered')`,
                [
                  'ops',
                  targetAgent,
                  `Proactive Scan: ${event.event_type}`,
                  JSON.stringify({ source: 'proactive-scanner', trigger_id: trigger.id, event: event, message }),
                  event.severity === 'critical' ? 'urgent' : event.severity === 'high' ? 'high' : 'normal',
                ]
              );

              await db.query(
                `UPDATE trigger_events SET status = 'processed', matched_trigger_id = $1, processed_at = NOW() WHERE id = $2`,
                [trigger.id, event.id]
              );
              await db.query(
                `UPDATE triggers SET last_triggered_at = NOW(), fire_count = fire_count + 1 WHERE id = $1`,
                [trigger.id]
              );
              break;
            }

            default:
              console.log(`    → Unknown action type: ${trigger.action_type}`);
              await db.query(
                `UPDATE trigger_events SET status = 'skipped', matched_trigger_id = $1, processing_result = $2, processed_at = NOW() WHERE id = $3`,
                [trigger.id, JSON.stringify({ reason: 'unknown_action_type' }), event.id]
              );
          }
        } catch (err) {
          console.error(`    → Error executing trigger action:`, err.message);
          result.errors.push(`Trigger "${trigger.name}": ${err.message}`);
          await db.query(
            `UPDATE trigger_events SET status = 'error', error_message = $1 WHERE id = $2`,
            [err.message, event.id]
          );
        }

        break; // Only match first trigger per event
      }

      if (!matched) {
        // No trigger matched — mark as skipped
        await db.query("UPDATE trigger_events SET status = 'skipped', processed_at = NOW() WHERE id = $1", [event.id]);
      }
    }

    result.matched = result.tasksCreated + result.notificationsSent;
    console.log(`[trigger-engine] Results: ${result.tasksCreated} tasks created, ${result.notificationsSent} notifications sent, ${result.errors.length} errors`);
  } catch (err) {
    console.error('[trigger-engine] Error:', err.message);
    result.errors.push(err.message);
  }

  return result;
}

// ─── Filter Application ──────────────────────────────────────────────────────

function applyFilters(filterConfig, payload) {
  for (const [key, expected] of Object.entries(filterConfig)) {
    if (expected === undefined || expected === null) continue;

    const actual = getNestedValue(payload, key);
    if (actual === undefined) return false;

    // Array match (e.g., labels includes 'bug')
    if (Array.isArray(expected) && Array.isArray(actual)) {
      if (!expected.some(e => actual.includes(e))) return false;
    } else if (Array.isArray(expected)) {
      if (!expected.includes(actual)) return false;
    } else if (typeof expected === 'string' && expected.startsWith('!')) {
      // Negation (e.g., "!draft" means skip if draft is truthy)
      if (actual) return false;
    } else if (typeof expected === 'string' && expected.includes('*')) {
      // Wildcard match
      const regex = new RegExp('^' + expected.replace(/\*/g, '.*') + '$');
      if (!regex.test(String(actual))) return false;
    } else {
      if (actual !== expected) return false;
    }
  }
  return true;
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

function buildDefaultTaskPrompt(event) {
  return `[PROACTIVE SCAN] New ${event.source} event: ${event.event_type}\n\nTitle: ${event.title}\nSeverity: ${event.severity}\n\nEvent data:\n{{payload}}\n\nPlease investigate this event and take appropriate action. If this is an urgent issue, respond immediately. If it requires another agent's attention, use a2a_send_message to route it.`;
}

// ─── Event Deduplication & Insertion ─────────────────────────────────────────

async function insertEvents(db, events, source) {
  let inserted = 0;
  let duplicates = 0;

  for (const event of events) {
    if (DRY_RUN) {
      console.log(`  [dry-run] Would insert: ${event.event_type} — ${event.title}`);
      inserted++;
      continue;
    }

    try {
      // Dedup by external_id
      if (event.external_id) {
        const existing = await db.query(
          "SELECT id FROM trigger_events WHERE external_id = $1 LIMIT 1",
          [event.external_id]
        );
        if (existing.rows.length > 0) {
          duplicates++;
          continue;
        }
      }

      await db.query(
        `INSERT INTO trigger_events (source, event_type, external_id, title, payload, severity, event_timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [event.source, event.event_type, event.external_id, event.title, JSON.stringify(event.payload), event.severity, event.event_timestamp]
      );
      inserted++;
    } catch (err) {
      console.warn(`  [${source}] Error inserting event:`, err.message);
    }
  }

  console.log(`  [${source}] Inserted ${inserted} events, skipped ${duplicates} duplicates`);
  return { inserted, duplicates };
}

// ─── Scan State Management ──────────────────────────────────────────────────

async function initScanState(db, source) {
  const existing = await db.query("SELECT * FROM scan_state WHERE source = $1", [source]);
  if (existing.rows.length === 0) {
    await db.query(
      "INSERT INTO scan_state (source, cursor, metadata) VALUES ($1, NULL, '{}')",
      [source]
    );
    return null;
  }
  return existing.rows[0];
}

async function updateScanState(db, source, status, error, itemsFound, itemsProcessed) {
  await db.query(
    `UPDATE scan_state
     SET last_scan_at = NOW(), last_scan_status = $1, last_scan_error = $2,
         items_found = COALESCE(items_found, 0) + $3, items_processed = COALESCE(items_processed, 0) + $4
     WHERE source = $5`,
    [status, error || null, itemsFound || 0, itemsProcessed || 0, source]
  );
}

async function insertScanLog(db, source, status, eventsFound, eventsCreated, triggersFired, errorMessage, durationMs) {
  await db.query(
    `INSERT INTO scan_logs (source, status, events_found, events_created, triggers_fired, error_message, duration_ms, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [source, status, eventsFound || 0, eventsCreated || 0, triggersFired || 0, errorMessage || null, durationMs || 0]
  );
}

// ─── Default Triggers Seeding ────────────────────────────────────────────────

async function seedDefaultTriggers(db) {
  console.log('[setup] Checking for default triggers...');

  const defaults = [
    {
      name: 'GitHub Issue Created',
      description: 'Auto-assign new GitHub issues to Code Agent for investigation',
      source: 'github', event_type: 'issue_opened',
      action_type: 'create_task',
      action_config: { agent_id: 'code', priority: 'high', task_template: '[PROACTIVE] New GitHub issue detected.\n\n{{title}}\n\nEvent data:\n{{payload}}\n\nPlease investigate this issue. If it\'s a bug, analyze the codebase and propose a fix. If it\'s a feature request, assess feasibility and comment on the issue.' },
    },
    {
      name: 'GitHub PR Merged',
      description: 'Notify team when a PR is merged',
      source: 'github', event_type: 'pr_merged',
      action_type: 'send_notification',
      action_config: { notification_title: 'PR Merged', notification_body: '{{title}}' },
    },
    {
      name: 'GitHub PR Opened',
      description: 'Review new pull requests via Code Agent',
      source: 'github', event_type: 'pr_opened',
      action_type: 'create_task',
      action_config: { agent_id: 'code', priority: 'medium', task_template: '[PROACTIVE] New pull request needs review.\n\n{{title}}\n\nEvent data:\n{{payload}}\n\nPlease review this PR. Check for code quality, potential bugs, and suggest improvements via PR comments.' },
    },
    {
      name: 'Urgent Email Alert',
      description: 'Route urgent/unimportant emails to Mail Agent',
      source: 'gmail', event_type: 'email_urgent',
      action_type: 'create_task',
      action_config: { agent_id: 'mail', priority: 'high', task_template: '[PROACTIVE] Urgent email detected!\n\n{{title}}\n\nEvent data:\n{{payload}}\n\nPlease read this email immediately and take the appropriate action. If it requires a response, draft and send one. If it needs another agent\'s attention, route it via a2a_send_message.' },
    },
    {
      name: 'Vercel Deploy Failed',
      description: 'Investigate failed Vercel deployments',
      source: 'vercel', event_type: 'deploy_failed',
      action_type: 'create_task',
      action_config: { agent_id: 'ops', priority: 'high', task_template: '[PROACTIVE] Vercel deployment failed!\n\n{{title}}\n\nEvent data:\n{{payload}}\n\nPlease investigate this deployment failure. Check the deployment logs, identify the root cause, and create a fix if possible. Notify the team via proactive notification.' },
    },
    {
      name: 'Vercel Build Error',
      description: 'Critical build failures need immediate attention',
      source: 'vercel', event_type: 'build_failed',
      action_type: 'create_task',
      action_config: { agent_id: 'code', priority: 'critical', task_template: '[PROACTIVE] Critical: Vercel build error detected!\n\n{{title}}\n\nEvent data:\n{{payload}}\n\nThis is a build failure, not just a runtime error. Please check the commit that caused this, identify the build error, and fix it immediately.' },
    },
  ];

  for (const trigger of defaults) {
    const existing = await db.query(
      "SELECT id FROM triggers WHERE name = $1",
      [trigger.name]
    );

    if (existing.rows.length === 0) {
      await db.query(
        `INSERT INTO triggers (name, description, source, event_type, action_type, action_config, agent_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'system')`,
        [trigger.name, trigger.description, trigger.source, trigger.event_type,
         trigger.action_type, JSON.stringify(trigger.action_config),
         trigger.action_config.agent_id || trigger.agent_id]
      );
      console.log(`  [setup] Created default trigger: ${trigger.name}`);
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const db = await getPool();
  const totalResults = { eventsFound: 0, eventsCreated: 0, triggersFired: 0, errors: [] };

  try {
    // Seed default triggers on first run
    await seedDefaultTriggers(db);

    // Initialize scan states
    const sources = SOURCE === 'all'
      ? ['github', 'gmail', 'vercel']
      : [SOURCE];

    for (const source of sources) {
      const scanState = await initScanState(db, source);
      const logId = await db.query(
        "INSERT INTO scan_logs (source, status) VALUES ($1, 'started') RETURNING id",
        [source]
      );

      // Mark scan as running
      await db.query("UPDATE scan_state SET last_scan_status = 'running' WHERE source = $1", [source]);

      let scanResult;
      switch (source) {
        case 'github':
          scanResult = await scanGitHub(db, scanState);
          break;
        case 'gmail':
          scanResult = await scanGmail(db, scanState);
          break;
        case 'vercel':
          scanResult = await scanVercel(db, scanState);
          break;
        default:
          console.warn(`Unknown source: ${source}`);
          continue;
      }

      // Insert events
      if (scanResult.events.length > 0) {
        const { inserted } = await insertEvents(db, scanResult.events, source);
        totalResults.eventsFound += scanResult.events.length;
        totalResults.eventsCreated += inserted;

        // Update scan state
        await updateScanState(db, source, 'success', null, scanResult.events.length, inserted);
        await db.query(
          "UPDATE scan_logs SET status = 'completed', events_found = $1, events_created = $2, duration_ms = $3, completed_at = NOW() WHERE id = $4",
          [scanResult.events.length, inserted, scanResult.durationMs, logId.rows[0].id]
        );
      } else {
        await updateScanState(db, source, scanResult.skipped ? 'skipped' : 'success', null, 0, 0);
        await db.query(
          "UPDATE scan_logs SET status = 'completed', events_found = 0, events_created = 0, duration_ms = $1, completed_at = NOW() WHERE id = $2",
          [scanResult.durationMs, logId.rows[0].id]
        );
      }
    }

    // Run the trigger engine to match events → tasks
    if (!DRY_RUN && totalResults.eventsCreated > 0) {
      const engineResult = await runTriggerEngine(db);
      totalResults.triggersFired = engineResult.matched;
      totalResults.errors.push(...engineResult.errors);
    }

    // Print summary
    console.log('\n═══════════════════════════════════════════════');
    console.log('  SCANNER RUNNER — SUMMARY');
    console.log('═══════════════════════════════════════════════');
    console.log(`  Sources scanned:   ${sources.join(', ')}`);
    console.log(`  Events found:      ${totalResults.eventsFound}`);
    console.log(`  Events created:    ${totalResults.eventsCreated}`);
    console.log(`  Triggers fired:    ${totalResults.triggersFired}`);
    console.log(`  Errors:            ${totalResults.errors.length}`);
    if (totalResults.errors.length > 0) {
      totalResults.errors.forEach(e => console.log(`    - ${e}`));
    }
    console.log('═══════════════════════════════════════════════\n');

    // Persist to automation_logs
    if (!DRY_RUN) {
      try {
        await db.query(
          `INSERT INTO automation_logs (automation_id, status, result, metadata)
           VALUES ('scanner-runner', 'completed', $1, $2)
           ON CONFLICT (automation_id) DO UPDATE SET status = 'completed', result = $1, metadata = $2, updated_at = NOW()`,
          [
            JSON.stringify(totalResults),
            JSON.stringify({ timestamp: new Date().toISOString(), sources, mode: DRY_RUN ? 'dry-run' : 'live' }),
          ]
        );
      } catch { /* non-critical */ }
    }
  } catch (err) {
    console.error('Scanner runner failed:', err);
    process.exit(1);
  } finally {
    if (pool) await pool.end();
  }
}

main();
