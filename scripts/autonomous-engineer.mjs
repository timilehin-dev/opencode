#!/usr/bin/env node
/**
 * KlawHub Autonomous Engineer — Chief Intelligence Loop
 *
 * Runs as part of the twice-daily GitHub Actions workflow (9 AM & 9 PM WAT).
 * This is the proactive intelligence layer — the system's self-awareness engine.
 *
 * Phase 2 Vision (current skeleton):
 *   - Monitors system health, agent performance, and task completion rates
 *   - Proactively detects problems and CREATES tasks for specialist agents
 *   - Makes autonomous decisions: "I detected X, I'm assigning it to Code Agent"
 *   - Reviews its own actions and learns from outcomes
 *   - Communicates findings to the team via A2A messages and notifications
 *
 * Usage: node scripts/autonomous-engineer.mjs [--mode full|monitor|act|report]
 *
 * Modes:
 *   full      — Complete cycle: monitor → analyze → act → report (default)
 *   monitor   — Health checks and metrics collection only
 *   act       — Take autonomous actions based on findings
 *   report    — Generate and publish report only
 */

import pg from 'pg';

const MODE = process.env.MODE || process.argv.find(a => a.startsWith('--mode'))?.split('=')[1] || 'full';

// ── Configuration ──────────────────────────────────────────────────────────

const CONFIG = {
  // Thresholds for autonomous action
  thresholds: {
    staleTaskMinutes: 15,        // Tasks running >15min are considered stale
    staleProjectTaskMinutes: 30, // Project tasks running >30min
    highFailureRate: 0.3,        // >30% failure rate triggers investigation
    lowSuccessRate: 0.5,         // <50% success rate triggers process review
    maxPendingTasks: 20,         // >20 pending tasks triggers triage
    maxUnreadMessages: 10,       // >10 unread A2A messages triggers processing
  },
  // Which agents to notify for different issue types
  routing: {
    deployment: 'ops',
    code_quality: 'code',
    data_anomaly: 'data',
    schedule_conflict: 'mail',
    performance: 'ops',
    unknown: 'general',
  },
};

// ── State ───────────────────────────────────────────────────────────────────

const state = {
  timestamp: new Date().toISOString(),
  mode: MODE,
  health: { database: false, build: 'unknown' },
  metrics: {},
  findings: [],      // Issues detected
  actions: [],       // Actions taken
  decisions: [],     // Autonomous decisions made
  errors: [],
};

let pool;

// ── Database Connection ────────────────────────────────────────────────────

async function getPool() {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.SUPABASE_DB_URL + '?pgbouncer=true&prepare=false',
      connectionTimeoutMillis: 10000,
      statement_timeout: 15000,
      max: 3,
    });
  }
  return pool;
}

// ── Phase 1: Monitor ──────────────────────────────────────────────────────
// Collect system health metrics and detect anomalies

async function collectMetrics() {
  console.log('[monitor] Collecting system metrics...');
  const db = await getPool();

  try {
    await db.query('SELECT 1');
    state.health.database = true;
  } catch (err) {
    state.health.database = false;
    state.errors.push(`Database connection failed: ${err.message}`);
    return;
  }

  try {
    const metrics = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM agent_tasks WHERE status = 'pending') AS pending_tasks,
        (SELECT COUNT(*) FROM agent_tasks WHERE status = 'running') AS running_tasks,
        (SELECT COUNT(*) FROM agent_tasks WHERE status = 'failed' AND created_at > NOW() - INTERVAL '24 hours') AS recent_failures,
        (SELECT COUNT(*) FROM agent_tasks WHERE status = 'completed' AND created_at > NOW() - INTERVAL '24 hours') AS recent_successes,
        (SELECT COUNT(*) FROM agent_tasks WHERE status = 'running' AND started_at < NOW() - INTERVAL '15 minutes') AS stale_running,
        (SELECT COUNT(*) FROM project_tasks WHERE status = 'in_progress' AND started_at < NOW() - INTERVAL '30 minutes') AS stale_project_tasks,
        (SELECT COUNT(*) FROM agent_routines WHERE is_active = true) AS active_routines,
        (SELECT COUNT(*) FROM agent_workflows WHERE status NOT IN ('completed', 'failed')) AS active_workflows,
        (SELECT COUNT(*) FROM proactive_notifications WHERE is_read = FALSE) AS unread_notifications,
        (SELECT COUNT(*) FROM task_board WHERE status NOT IN ('done', 'cancelled')) AS open_taskboard_items,
        (SELECT COUNT(*) FROM a2a_messages WHERE is_read = FALSE) AS unread_a2a_messages,
        (SELECT COUNT(*) FROM conversations) AS total_conversations,
        (SELECT COUNT(*) FROM agent_memory) AS total_memories,
        (SELECT COUNT(*) FROM agent_tasks) AS total_tasks,
        (SELECT COUNT(*) FROM skills WHERE is_active = true) AS active_skills
    `);

    state.metrics = metrics.rows[0];
    console.log('[monitor] Metrics collected:', JSON.stringify(state.metrics, null, 2));
  } catch (err) {
    console.error('[monitor] Metrics query failed:', err.message);
    state.errors.push(`Metrics query: ${err.message}`);
  }
}

// ── Phase 2: Analyze ──────────────────────────────────────────────────────
// Analyze metrics, detect anomalies, and generate findings

function analyzeMetrics() {
  console.log('[analyze] Running anomaly detection...');
  const m = state.metrics;
  if (!m || !Object.keys(m).length) return;

  const t = CONFIG.thresholds;

  // Stale task recovery
  if (Number(m.stale_running) > 0) {
    state.findings.push({
      severity: 'high',
      type: 'stale_tasks',
      message: `${m.stale_running} tasks stuck in 'running' >15min`,
      action: 'recover',
    });
  }

  if (Number(m.stale_project_tasks) > 0) {
    state.findings.push({
      severity: 'high',
      type: 'stale_project_tasks',
      message: `${m.stale_project_tasks} project tasks stuck >30min`,
      action: 'recover',
    });
  }

  // Failure rate analysis
  const recentFailures = Number(m.recent_failures || 0);
  const recentSuccesses = Number(m.recent_successes || 0);
  const total = recentFailures + recentSuccesses;
  if (total > 5) {
    const failureRate = recentFailures / total;
    if (failureRate > t.highFailureRate) {
      state.findings.push({
        severity: 'critical',
        type: 'high_failure_rate',
        message: `${(failureRate * 100).toFixed(1)}% failure rate (${recentFailures}/${total} tasks in 24h)`,
        action: 'investigate',
      });
    }
  }

  // Pending task backlog
  if (Number(m.pending_tasks) > t.maxPendingTasks) {
    state.findings.push({
      severity: 'medium',
      type: 'task_backlog',
      message: `${m.pending_tasks} pending tasks (threshold: ${t.maxPendingTasks})`,
      action: 'triage',
    });
  }

  // Unread A2A messages
  if (Number(m.unread_a2a_messages || 0) > t.maxUnreadMessages) {
    state.findings.push({
      severity: 'medium',
      type: 'a2a_backlog',
      message: `${m.unread_a2a_messages} unread inter-agent messages`,
      action: 'process',
    });
  }

  console.log(`[analyze] Found ${state.findings.length} issues`);
}

// ── Phase 3: Act ──────────────────────────────────────────────────────────
// Take autonomous actions based on findings (Phase 2 will expand this significantly)

async function takeActions() {
  console.log('[act] Processing findings...');
  const db = await getPool();

  for (const finding of state.findings) {
    switch (finding.action) {
      case 'recover': {
        // Recover stale tasks
        try {
          const r = await db.query(
            "UPDATE agent_tasks SET status = 'pending', started_at = NULL WHERE status = 'running' AND started_at < NOW() - INTERVAL '15 minutes'"
          );
          if (r.rowCount > 0) {
            state.actions.push(`Recovered ${r.rowCount} stale tasks`);
            state.decisions.push({
              finding: finding.type,
              decision: 'auto_recover',
              reason: 'Tasks exceeded 15min running threshold — reset to pending for retry',
            });
          }
        } catch (err) {
          state.errors.push(`Recovery failed: ${err.message}`);
        }

        // Recover stale project tasks
        try {
          const r = await db.query(
            "UPDATE project_tasks SET status = 'pending', retries = COALESCE(retries, 0) WHERE status = 'in_progress' AND started_at < NOW() - INTERVAL '30 minutes'"
          );
          if (r.rowCount > 0) {
            state.actions.push(`Recovered ${r.rowCount} stale project tasks`);
          }
        } catch (err) {
          state.errors.push(`Project recovery failed: ${err.message}`);
        }
        break;
      }

      case 'investigate': {
        // Phase 2: Create investigation task for Ops agent
        state.actions.push(`Flagged for investigation: ${finding.message}`);
        state.decisions.push({
          finding: finding.type,
          decision: 'flag_for_review',
          reason: 'Failure rate exceeds threshold — requires Ops agent investigation',
          target_agent: CONFIG.routing.performance,
        });
        // TODO (Phase 2): schedule_agent_task for ops agent to investigate
        break;
      }

      case 'triage': {
        state.actions.push(`Task backlog noted: ${finding.message}`);
        state.decisions.push({
          finding: finding.type,
          decision: 'flag_for_review',
          reason: 'Pending task count exceeds threshold — may need General agent triage',
        });
        break;
      }

      case 'process': {
        state.actions.push(`A2A backlog noted: ${finding.message}`);
        break;
      }
    }
  }

  console.log(`[act] Took ${state.actions.length} actions, made ${state.decisions.length} decisions`);
}

// ── Phase 4: Report ───────────────────────────────────────────────────────

async function generateReport() {
  console.log('\n═════════════════════════════════════════════');
  console.log('  AUTONOMOUS ENGINEER — SHIFT REPORT');
  console.log('═════════════════════════════════════════════');
  console.log(`Mode: ${MODE}`);
  console.log(`Timestamp: ${state.timestamp}`);
  console.log(`Database: ${state.health.database ? 'CONNECTED' : 'DISCONNECTED'}`);

  if (state.metrics && Object.keys(state.metrics).length > 0) {
    const m = state.metrics;
    console.log('\n── Metrics ──');
    console.log(`  Pending tasks:    ${m.pending_tasks}`);
    console.log(`  Running tasks:    ${m.running_tasks}`);
    console.log(`  Failed (24h):     ${m.recent_failures}`);
    console.log(`  Completed (24h):  ${m.recent_successes}`);
    console.log(`  Active routines:  ${m.active_routines}`);
    console.log(`  Active workflows: ${m.active_workflows}`);
    console.log(`  Unread A2A:       ${m.unread_a2a_messages || 0}`);
    console.log(`  Total memories:   ${m.total_memories}`);
    console.log(`  Active skills:    ${m.active_skills}`);
  }

  if (state.findings.length > 0) {
    console.log('\n── Findings ──');
    state.findings.forEach((f, i) => console.log(`  ${i + 1}. [${f.severity}] ${f.message}`));
  }

  if (state.decisions.length > 0) {
    console.log('\n── Decisions ──');
    state.decisions.forEach((d, i) => console.log(`  ${i + 1}. ${d.decision}: ${d.reason}`));
  }

  if (state.actions.length > 0) {
    console.log('\n── Actions Taken ──');
    state.actions.forEach((a, i) => console.log(`  ${i + 1}. ${a}`));
  }

  if (state.errors.length > 0) {
    console.log('\n── Errors ──');
    state.errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
  }

  console.log('═════════════════════════════════════════════\n');
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Autonomous Engineer starting... (mode: ${MODE})`);

  try {
    // Always monitor
    await collectMetrics();

    if (MODE === 'full' || MODE === 'monitor') {
      analyzeMetrics();
    }

    if (MODE === 'full' || MODE === 'act') {
      await takeActions();
    }

    await generateReport();

    // Persist report to DB for dashboard visibility
    if (state.health.database && (MODE === 'full' || MODE === 'report')) {
      const db = await getPool();
      try {
        await db.query(
          `INSERT INTO automation_logs (automation_id, status, result, metadata)
           VALUES ('autonomous-engineer', 'completed', $1, $2)
           ON CONFLICT (automation_id) DO UPDATE SET status = 'completed', result = $1, metadata = $2, updated_at = NOW()`,
          [
            JSON.stringify({ findings: state.findings.length, actions: state.actions.length, decisions: state.decisions.length }),
            JSON.stringify(state),
          ]
        );
      } catch (err) {
        console.error('Failed to persist report:', err.message);
      }
    }
  } catch (err) {
    console.error('Autonomous engineer failed:', err);
    process.exit(1);
  } finally {
    if (pool) await pool.end();
  }
}

main();
