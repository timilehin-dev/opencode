#!/usr/bin/env node
/**
 * KlawHub Autonomous Engineer — Monitoring Script
 *
 * Runs as part of the twice-daily GitHub Actions workflow.
 * Performs system health checks, identifies improvements, and generates
 * an actionable report for the AI Chief Engineer to act on.
 *
 * Usage: node scripts/autonomous-engineer.mjs [--mode full|monitor-only|build-check]
 */

import pg from 'pg';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

const MODE = process.env.MODE || process.argv.find(a => a.startsWith('--mode'))?.split('=')[1] || 'full';

const report = {
  timestamp: new Date().toISOString(),
  mode: MODE,
  build: { status: 'skipped', errors: [], warnings: [] },
  database: { connected: false, metrics: {} },
  workflows: { recent: [], failures: [] },
  issues: { open: 0, stale: [] },
  improvements: [],
  actions_required: [],
};

// ── Helper: safe query that returns null if table doesn't exist ──────────
async function safeQuery(pool, sql) {
  try {
    const result = await pool.query(sql);
    return result.rows?.[0] || null;
  } catch (e) {
    if (e.code === '42P01' || e.message.includes('does not exist')) {
      return null; // table not found — skip gracefully
    }
    throw e;
  }
}

// ── 1. Database Health Check ──────────────────────────────────────────────
async function checkDatabase() {
  const pool = new pg.Pool({
    connectionString: process.env.SUPABASE_DB_URL,
    connectionTimeoutMillis: 10000,
    statement_timeout: 15000,
    max: 3,
  });

  try {
    await pool.query('SELECT 1');
    report.database.connected = true;

    // Key metrics (each wrapped individually so one missing table doesn't kill the check)
    const metrics = {};

    // Pending tasks
    const pending = await safeQuery(pool, "SELECT COUNT(*)::int AS pending_tasks FROM agent_tasks WHERE status = 'pending'");
    if (pending) metrics.pending_tasks = pending.pending_tasks;

    // Recent failures
    const failures = await safeQuery(pool, "SELECT COUNT(*)::int AS recent_failures FROM agent_tasks WHERE status = 'failed' AND created_at > NOW() - INTERVAL '24 hours'");
    if (failures) metrics.recent_failures = failures.recent_failures;

    // Stale running tasks
    const stale = await safeQuery(pool, "SELECT COUNT(*)::int AS stale_running FROM agent_tasks WHERE status = 'running' AND started_at < NOW() - INTERVAL '15 minutes'");
    if (stale) metrics.stale_running = stale.stale_running;

    // Stale project tasks
    const stalePT = await safeQuery(pool, "SELECT COUNT(*)::int AS stale_project_tasks FROM project_tasks WHERE status = 'in_progress' AND started_at < NOW() - INTERVAL '30 minutes'");
    if (stalePT) metrics.stale_project_tasks = stalePT.stale_project_tasks;

    // Active routines
    const routines = await safeQuery(pool, 'SELECT COUNT(*)::int AS active_routines FROM agent_routines WHERE is_active = true');
    if (routines) metrics.active_routines = routines.active_routines;

    // Active workflows
    const workflows = await safeQuery(pool, "SELECT COUNT(*)::int AS active_workflows FROM agent_workflows WHERE status NOT IN ('completed', 'failed')");
    if (workflows) metrics.active_workflows = workflows.active_workflows;

    // Unread notifications
    const notifs = await safeQuery(pool, 'SELECT COUNT(*)::int AS unread_notifications FROM proactive_notifications WHERE is_read = FALSE');
    if (notifs) metrics.unread_notifications = notifs.unread_notifications;

    // Open taskboard items
    const taskboard = await safeQuery(pool, "SELECT COUNT(*)::int AS open_taskboard_items FROM task_board WHERE status NOT IN ('done', 'cancelled')");
    if (taskboard) metrics.open_taskboard_items = taskboard.open_taskboard_items;

    // Conversations
    const convos = await safeQuery(pool, 'SELECT COUNT(*)::int AS total_conversations FROM conversations');
    if (convos) metrics.total_conversations = convos.total_conversations;

    // Memories
    const memories = await safeQuery(pool, 'SELECT COUNT(*)::int AS total_memories FROM agent_memory');
    if (memories) metrics.total_memories = memories.total_memories;

    report.database.metrics = metrics;

    console.log('Database: connected');
    console.log('Metrics:', JSON.stringify(metrics, null, 2));

    // Recover stale tasks
    if (metrics.stale_running > 0) {
      try {
        const r = await pool.query(
          "UPDATE agent_tasks SET status = 'pending', started_at = NULL WHERE status = 'running' AND started_at < NOW() - INTERVAL '15 minutes'"
        );
        report.actions_required.push(`Recovered ${r.rowCount} stale running tasks`);
      } catch (e) {
        report.improvements.push(`Failed to recover stale tasks: ${e.message}`);
      }
    }

    if (metrics.stale_project_tasks > 0) {
      try {
        const r = await pool.query(
          "UPDATE project_tasks SET status = 'pending', retries = COALESCE(retries, 0) WHERE status = 'in_progress' AND started_at < NOW() - INTERVAL '30 minutes'"
        );
        report.actions_required.push(`Recovered ${r.rowCount} stale project tasks`);
      } catch (e) {
        report.improvements.push(`Failed to recover stale project tasks: ${e.message}`);
      }
    }
  } catch (error) {
    console.error('Database check failed:', error.message);
    report.database.connected = false;
    report.actions_required.push(`DATABASE ISSUE: ${error.message}`);
  } finally {
    await pool.end();
  }
}

// ── 2. Codebase Quality Scan ─────────────────────────────────────────────
function scanCodebase() {
  console.log('\n--- Codebase Scan ---');

  // Check for TODO/FIXME/HACK comments
  try {
    const todos = execSync(
      'rg -l "TODO|FIXME|HACK|XXX" src/ --type ts --type tsx 2>/dev/null || true',
      { encoding: 'utf-8' }
    ).trim();
    const todoFiles = todos.split('\n').filter(Boolean);
    if (todoFiles.length > 0) {
      report.improvements.push(`${todoFiles.length} files with TODO/FIXME/HACK comments — review and resolve`);
    }
  } catch { /* no rg matches */ }

  // Check for console.log in src/ (not __tests__)
  try {
    const logs = execSync(
      'rg -c "console\\.log" src/ --type ts --type tsx -g "!__tests__" 2>/dev/null | rg -v ":0$" || true',
      { encoding: 'utf-8' }
    ).trim();
    const logFiles = logs.split('\n').filter(Boolean);
    if (logFiles.length > 5) {
      report.improvements.push(`${logFiles.length} files with console.log — consider using proper logger`);
    }
  } catch { /* no matches */ }

  // Check for any @ts-ignore or @ts-nocheck
  try {
    const ignores = execSync(
      'rg -c "@ts-ignore|@ts-nocheck" src/ --type ts --type tsx 2>/dev/null | rg -v ":0$" || true',
      { encoding: 'utf-8' }
    ).trim();
    const ignoreFiles = ignores.split('\n').filter(Boolean);
    if (ignoreFiles.length > 0) {
      report.improvements.push(`${ignoreFiles.length} files with @ts-ignore/@ts-nocheck — type safety issue`);
    }
  } catch { /* no matches */ }

  console.log(`Found ${report.improvements.length} improvement opportunities`);
}

// ── 3. Generate Report ───────────────────────────────────────────────────
function generateReport() {
  const reportPath = '/tmp/engineer-report.json';
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport written to ${reportPath}`);

  // Summary
  console.log('\n═══════════════════════════════════════');
  console.log('  AUTONOMOUS ENGINEER SHIFT SUMMARY');
  console.log('═══════════════════════════════════════');
  console.log(`Mode: ${MODE}`);
  console.log(`Database: ${report.database.connected ? 'CONNECTED' : 'DISCONNECTED'}`);

  if (Object.keys(report.database.metrics).length > 0) {
    const m = report.database.metrics;
    console.log(`Pending tasks: ${m.pending_tasks ?? 'N/A'}`);
    console.log(`Recent failures (24h): ${m.recent_failures ?? 'N/A'}`);
    console.log(`Active routines: ${m.active_routines ?? 'N/A'}`);
    console.log(`Active workflows: ${m.active_workflows ?? 'N/A'}`);
    console.log(`Unread notifications: ${m.unread_notifications ?? 'N/A'}`);
    console.log(`Open taskboard items: ${m.open_taskboard_items ?? 'N/A'}`);
    console.log(`Total conversations: ${m.total_conversations ?? 'N/A'}`);
    console.log(`Total memories: ${m.total_memories ?? 'N/A'}`);
  }

  console.log(`\nImprovements identified: ${report.improvements.length}`);
  report.improvements.forEach((i, idx) => console.log(`  ${idx + 1}. ${i}`));
  console.log(`\nActions required: ${report.actions_required.length}`);
  report.actions_required.forEach((a, idx) => console.log(`  ${idx + 1}. ${a}`));
  console.log('═══════════════════════════════════════');
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Autonomous Engineer starting... (mode: ${MODE})`);

  if (MODE === 'full' || MODE === 'monitor-only') {
    await checkDatabase();
  }

  if (MODE === 'full') {
    scanCodebase();
  }

  generateReport();

  // Exit cleanly — the notify job handles Discord separately
  if (report.actions_required.length > 0) {
    console.log('\n⚠️  Actions required — flagging for AI Chief Engineer review');
  }
}

main().catch(e => {
  console.error('Autonomous engineer failed:', e);
  process.exit(1);
});
