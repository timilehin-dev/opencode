/**
 * KlawHub Autonomous Engineer — Discord Notifier
 *
 * Called by the autonomous-engineer.yml workflow after the monitoring job completes.
 * Posts a summary to Discord with a trigger mention to wake the AI Chief Engineer.
 *
 * Environment variables:
 *   DISCORD_WEBHOOK_URL — Discord webhook for the channel
 *   ENGINEER_REPORT_PATH — Path to the JSON report (default: /tmp/engineer-report.json)
 */

import { readFileSync } from 'fs';

const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
const reportPath = process.env.ENGINEER_REPORT_PATH || '/tmp/engineer-report.json';

if (!webhookUrl) {
  console.error('DISCORD_WEBHOOK_URL not set — skipping Discord notification');
  process.exit(0);
}

let report;
try {
  report = JSON.parse(readFileSync(reportPath, 'utf-8'));
} catch {
  console.error('Could not read engineer report');
  process.exit(1);
}

const m = report.database?.metrics || {};
const time = new Date(report.timestamp).toLocaleString('en-GB', { timeZone: 'Africa/Lagos' });

// Build the message
const lines = [];

lines.push('## 🤖 Autonomous Engineer Shift Report');
lines.push(`**Time:** ${time} | **Mode:** ${report.mode}`);
lines.push('');

// Database status
lines.push(report.database?.connected
  ? '**Database:** Connected'
  : '🔴 **Database:** DISCONNECTED — needs attention');
lines.push('');

// Key metrics (only if we have them)
if (Object.keys(m).length > 0) {
  lines.push('### System Metrics');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Pending Tasks | ${m.pending_tasks || 0} |`);
  lines.push(`| Recent Failures (24h) | ${m.recent_failures || 0} |`);
  lines.push(`| Active Routines | ${m.active_routines || 0} |`);
  lines.push(`| Active Workflows | ${m.active_workflows || 0} |`);
  lines.push(`| Unread Notifications | ${m.unread_notifications || 0} |`);
  lines.push(`| Open Taskboard Items | ${m.open_taskboard_items || 0} |`);
  lines.push(`| Total Conversations | ${m.total_conversations || 0} |`);
  lines.push(`| Total Memories | ${m.total_memories || 0} |`);
  lines.push('');
}

// Actions required
if (report.actions_required?.length > 0) {
  lines.push('### Actions Required');
  report.actions_required.forEach(a => lines.push(`- ${a}`));
  lines.push('');
}

// Improvements
if (report.improvements?.length > 0) {
  lines.push('### Improvement Opportunities');
  report.improvements.forEach(i => lines.push(`- ${i}`));
  lines.push('');
}

// Trigger mention for the AI engineer
lines.push('---');
if (report.actions_required?.length > 0 || report.improvements?.length > 0) {
  lines.push('<@1492961209530580992> Time for your engineering shift. Review the report above and ship improvements.');
} else {
  lines.push('<@1492961209530580992> System is healthy. Consider proactive improvements for the autonomous vision.');
}

const content = lines.join('\n');

// Send to Discord
try {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: content.slice(0, 2000), // Discord message limit
      username: 'KlawHub Engineer',
      avatar_url: 'https://avatars.githubusercontent.com/u/0',
    }),
  });

  if (response.ok) {
    console.log('Discord notification sent successfully');
  } else {
    const text = await response.text();
    console.error(`Discord webhook failed: ${response.status} ${text}`);
  }
} catch (err) {
  console.error('Discord notification error:', err.message);
}
