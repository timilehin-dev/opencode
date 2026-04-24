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

// ── 1. Database Health Check ──────────────────────────────────────────────
async function checkDatabase() {
  const pool = new pg.Pool({
    connectionString: process.env.SUPABASE_DB_URL,
    connectionTimeoutMillis: 10000,
    statement_timeout: 15000,
  });

  try {
    await pool.query('SELECT 1');
    report.database.connected = true;

    // Key metrics
    const metrics = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM agent_tasks WHERE status = 'pending') AS pending_tasks,
        (SELECT COUNT(*) FROM agent_tasks WHERE status = 'failed' AND created_at > NOW() - INTERVAL '24 hours') AS recent_failures,
        (SELECT COUNT(*) FROM agent_tasks WHERE status = 'running' AND started_at < NOW() - INTERVAL '15 minutes') AS stale_running,
        (SELECT COUNT(*) FROM project_tasks WHERE status = 'in_progress' AND started_at < NOW() - INTERVAL '30 minutes') AS stale_project_tasks,
        (SELECT COUNT(*) FROM agent_routines WHERE enabled = true) AS active_routines,
        (SELECT COUNT(*) FROM agent_workflows WHERE status = 'active') AS active_workflows,
        (SELECT COUNT(*) FROM proactive_notifications WHERE is_read = FALSE) AS unread_notifications,
        (SELECT COUNT(*) FROM task_board WHERE status NOT IN ('done', 'cancelled')) AS open_taskboard_items,
        (SELECT COUNT(*) FROM conversations) AS total_conversations,
        (SELECT COUNT(*) FROM memory_entries) AS total_memories
    `);

    report.database.metrics = metrics.rows[0];

    // Recover stale tasks
    if (Number(metrics.rows[0].stale_running) > 0) {
      const r = await pool.query(
        "UPDATE agent_tasks SET status = 'pending', started_at = NULL WHERE status = 'running' AND started_at < NOW() - INTERVAL '15 minutes'"
      );
      report.actions_required.push(`Recovered ${r.rowCount} stale running tasks`);
    }

    if (Number(metrics.rows[0].stale_project_tasks) > 0) {
      const r = await pool.query(
        "UPDATE project_tasks SET status = 'pending', retries = COALESCE(retries, 0) WHERE status = 'in_progress' AND started_at < NOW() - INTERVAL '30 minutes'"
      );
      report.actions_required.push(`Recovered ${r.rowCount} stale project tasks`);
    }

    console.log('Database: connected');
    console.log('Metrics:', JSON.stringify(metrics.rows[0], null, 2));

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

  // Check for hardcoded strings that should be constants
  try {
    const hardCoded = execSync(
      'rg "ollama|gemma4|localhost:11434" src/ --type ts --type tsx -l 2>/dev/null || true',
      { encoding: 'utf-8' }
    ).trim();
    if (hardCoded) {
      report.improvements.push('Hardcoded Ollama URLs found — should use env vars');
    }
  } catch { /* no matches */ }

  console.log(`Found ${report.improvements.length} improvement opportunities`);
}

// ── 3. Dependency Check ──────────────────────────────────────────────────
function checkDependencies() {
  console.log('\n--- Dependency Check ---');

  try {
    // Check for outdated packages (just report, don't update)
    const outdated = execSync('npm outdated --json 2>/dev/null || true', { encoding: 'utf-8' });
    if (outdated.trim()) {
      const deps = JSON.parse(outdated);
      const count = Object.keys(deps).length;
      if (count > 0) {
        report.improvements.push(`${count} outdated npm packages — consider updating in next shift`);
        console.log(`Outdated packages: ${count}`);
      }
    }
  } catch {
    console.log('Could not check outdated packages');
  }

  // Check for security vulnerabilities
  try {
    const audit = execSync('npm audit --json 2>/dev/null || true', { encoding: 'utf-8' });
    const auditData = JSON.parse(audit);
    const vulns = auditData.metadata?.vulnerabilities || {};
    const totalVulns = Object.values(vulns).reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0);
    if (totalVulns > 0) {
      report.actions_required.push(`${totalVulns} npm security vulnerabilities — run npm audit fix`);
    }
    console.log(`Security vulnerabilities: ${totalVulns}`);
  } catch {
    console.log('Could not run npm audit');
  }
}

// ── 4. Generate Report ───────────────────────────────────────────────────
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
  if (report.database.metrics && Object.keys(report.database.metrics).length > 0) {
    const m = report.database.metrics;
    console.log(`Pending tasks: ${m.pending_tasks}`);
    console.log(`Recent failures (24h): ${m.recent_failures}`);
    console.log(`Active routines: ${m.active_routines}`);
    console.log(`Active workflows: ${m.active_workflows}`);
    console.log(`Unread notifications: ${m.unread_notifications}`);
    console.log(`Open taskboard items: ${m.open_taskboard_items}`);
    console.log(`Total conversations: ${m.total_conversations}`);
    console.log(`Total memories: ${m.total_memories}`);
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
    checkDependencies();
  }

  generateReport();

  // Exit with error if there are critical actions required
  if (report.actions_required.length > 0) {
    console.log('\n⚠️  Actions required — flagging for AI Chief Engineer review');
    process.exit(0); // Don't fail the workflow, just flag it
  }
}

main().catch(e => {
  console.error('Autonomous engineer failed:', e);
  process.exit(1);
});
