#!/usr/bin/env node
/**
 * KlawHub Autonomous Engineer — Chief Intelligence Loop
 *
 * Runs as part of the twice-daily GitHub Actions workflow (9 AM & 9 PM WAT).
 * This is the proactive intelligence layer — the system's self-awareness engine.
 *
 * Phase 2: Full autonomous action capability
 *   - Monitors system health, agent performance, and task completion rates
 *   - Proactively detects problems and CREATES tasks for specialist agents
 *   - Uses LLM to make intelligent decisions about what to do
 *   - Routes issues to the correct agent via agent_tasks table
 *   - Sends A2A messages to coordinate between agents
 *   - Creates proactive notifications for user visibility
 *   - Reviews outcomes of previous autonomous actions
 *
 * Usage: node scripts/autonomous-engineer.mjs [--mode full|monitor|act|report|llm-plan]
 *
 * Modes:
 *   full      — Complete cycle: monitor → analyze → LLM plan → act → review → report (default)
 *   monitor   — Health checks and metrics collection only
 *   act       — Take autonomous actions based on findings (no LLM)
 *   llm-plan  — Use LLM to generate an action plan (dry-run, no execution)
 *   report    — Generate and publish report only
 */

import pg from 'pg';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

const MODE = process.env.MODE || process.argv.find(a => a.startsWith('--mode'))?.split('=')[1] || 'full';

// ── Configuration ──────────────────────────────────────────────────────────

const CONFIG = {
  // Thresholds for autonomous action
  thresholds: {
    staleTaskMinutes: 15,
    staleProjectTaskMinutes: 30,
    highFailureRate: 0.3,
    lowSuccessRate: 0.5,
    maxPendingTasks: 20,
    maxUnreadMessages: 10,
    lowRoutineSuccessRate: 0.4,
    stuckWorkflowMinutes: 60,
  },
  // Which agents to route different issue types to
  routing: {
    deployment: 'ops',
    code_quality: 'code',
    data_anomaly: 'data',
    schedule_conflict: 'mail',
    performance: 'ops',
    workflow_failure: 'ops',
    routine_failure: 'ops',
    high_task_backlog: 'general',
    unknown: 'general',
  },
  // Engineer identity
  engineer: {
    id: 'ops',
    name: 'Ops Agent',
    role: 'Autonomous Engineer',
  },
};

// ── State ───────────────────────────────────────────────────────────────────

const state = {
  timestamp: new Date().toISOString(),
  mode: MODE,
  health: { database: false },
  metrics: {},
  findings: [],
  actions: [],
  decisions: [],
  llmPlan: null,
  errors: [],
  actionReview: {},
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

// ── LLM Provider (reuse execute-tasks pattern) ──────────────────────────────

let _ollamaKeyIdx = 0;

function getOllamaKeys() {
  return [
    process.env.OLLAMA_CLOUD_KEY_1,
    process.env.OLLAMA_CLOUD_KEY_2,
    process.env.OLLAMA_CLOUD_KEY_3,
    process.env.OLLAMA_CLOUD_KEY_4,
    process.env.OLLAMA_CLOUD_KEY_5,
    process.env.OLLAMA_CLOUD_KEY_6,
  ].filter(Boolean);
}

function nextOllamaKey() {
  const keys = getOllamaKeys();
  if (keys.length === 0) throw new Error('No OLLAMA_CLOUD_KEY configured.');
  return keys[_ollamaKeyIdx++ % keys.length];
}

function getProvider() {
  const provider = createOpenAI({
    apiKey: nextOllamaKey(),
    baseURL: process.env.OLLAMA_BASE_URL || 'https://ollama.com/v1',
  });
  return provider.chat('gemma4:31b-cloud');
}

// ── Phase 1: Monitor ──────────────────────────────────────────────────────

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
        (SELECT COUNT(*) FROM agent_routines WHERE is_active = true AND last_status = 'failed' AND last_run_at > NOW() - INTERVAL '24 hours') AS failed_routines_24h,
        (SELECT COUNT(*) FROM agent_workflows WHERE status NOT IN ('completed', 'failed')) AS active_workflows,
        (SELECT COUNT(*) FROM agent_workflows WHERE status = 'running' AND updated_at < NOW() - INTERVAL '60 minutes') AS stuck_workflows,
        (SELECT COUNT(*) FROM proactive_notifications WHERE is_read = FALSE) AS unread_notifications,
        (SELECT COUNT(*) FROM task_board WHERE status NOT IN ('done', 'cancelled')) AS open_taskboard_items,
        (SELECT COUNT(*) FROM a2a_messages WHERE is_read = FALSE) AS unread_a2a_messages,
        (SELECT COUNT(*) FROM conversations) AS total_conversations,
        (SELECT COUNT(*) FROM agent_memory) AS total_memories,
        (SELECT COUNT(*) FROM agent_tasks) AS total_tasks,
        (SELECT COUNT(*) FROM skills WHERE is_active = true) AS active_skills,
        (SELECT COUNT(*) FROM automations WHERE enabled = true) AS active_automations
    `);

    state.metrics = metrics.rows[0];
    console.log('[monitor] Metrics collected:', JSON.stringify(state.metrics, null, 2));
  } catch (err) {
    console.error('[monitor] Metrics query failed:', err.message);
    state.errors.push(`Metrics query: ${err.message}`);
  }
}

// ── Expanded Monitoring: Detailed checks ──────────────────────────────────

async function detailedHealthChecks() {
  console.log('[monitor] Running detailed health checks...');
  const db = await getPool();
  const details = {};

  // 1. Check for recently failed tasks — get the error messages
  try {
    const failedTasks = await db.query(`
      SELECT agent_id, task, error, created_at
      FROM agent_tasks
      WHERE status = 'failed' AND created_at > NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC LIMIT 10
    `);
    details.recentFailures = failedTasks.rows;
  } catch (err) {
    console.warn('[monitor] Could not fetch failure details:', err.message);
  }

  // 2. Check routine health — which routines are failing
  try {
    const failingRoutines = await db.query(`
      SELECT r.id, r.name, r.agent_id, r.last_status, r.last_error, r.last_run_at, r.failure_count
      FROM agent_routines r
      WHERE r.is_active = true AND r.last_status = 'failed'
      ORDER BY r.last_run_at DESC LIMIT 10
    `);
    details.failingRoutines = failingRoutines.rows;
  } catch (err) {
    console.warn('[monitor] Could not fetch routine details:', err.message);
  }

  // 3. Check stuck workflows
  try {
    const stuckWorkflows = await db.query(`
      SELECT w.id, w.name, w.status, w.agent_id, w.updated_at,
             (SELECT COUNT(*) FROM workflow_steps WHERE workflow_id = w.id AND status NOT IN ('completed', 'skipped')) AS remaining_steps
      FROM agent_workflows w
      WHERE w.status = 'running' AND w.updated_at < NOW() - INTERVAL '60 minutes'
      LIMIT 5
    `);
    details.stuckWorkflows = stuckWorkflows.rows;
  } catch (err) {
    console.warn('[monitor] Could not fetch workflow details:', err.message);
  }

  // 4. Check agent activity in last 24h — which agents are active vs idle
  try {
    const agentActivity = await db.query(`
      SELECT agent_id, COUNT(*) as actions, MAX(created_at) as last_action
      FROM agent_activity
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY agent_id
      ORDER BY actions DESC
    `);
    details.agentActivity24h = agentActivity.rows;
  } catch (err) {
    console.warn('[monitor] Could not fetch agent activity:', err.message);
  }

  // 5. Check for overdue project tasks
  try {
    const overdueTasks = await db.query(`
      SELECT pt.id, pt.title, pt.status, pt.project_id, pt.due_date,
             p.name as project_name
      FROM project_tasks pt
      JOIN projects p ON pt.project_id = p.id
      WHERE pt.status NOT IN ('completed', 'cancelled')
        AND pt.due_date IS NOT NULL
        AND pt.due_date < CURRENT_DATE
      ORDER BY pt.due_date ASC LIMIT 10
    `);
    details.overdueProjectTasks = overdueTasks.rows;
  } catch (err) {
    console.warn('[monitor] Could not fetch overdue tasks:', err.message);
  }

  return details;
}

// ── Phase 2: Analyze ──────────────────────────────────────────────────────

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
      auto: true,
    });
  }

  if (Number(m.stale_project_tasks) > 0) {
    state.findings.push({
      severity: 'high',
      type: 'stale_project_tasks',
      message: `${m.stale_project_tasks} project tasks stuck >30min`,
      action: 'recover',
      auto: true,
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
        action: 'create_task',
        target_agent: CONFIG.routing.performance,
        auto: true,
      });
    }
  }

  // Pending task backlog
  if (Number(m.pending_tasks) > t.maxPendingTasks) {
    state.findings.push({
      severity: 'medium',
      type: 'task_backlog',
      message: `${m.pending_tasks} pending tasks (threshold: ${t.maxPendingTasks})`,
      action: 'create_task',
      target_agent: CONFIG.routing.high_task_backlog,
      auto: true,
    });
  }

  // Unread A2A messages backlog
  if (Number(m.unread_a2a_messages || 0) > t.maxUnreadMessages) {
    state.findings.push({
      severity: 'medium',
      type: 'a2a_backlog',
      message: `${m.unread_a2a_messages} unread inter-agent messages`,
      action: 'notify',
    });
  }

  // Failed routines
  if (Number(m.failed_routines_24h || 0) > 0) {
    state.findings.push({
      severity: 'medium',
      type: 'routine_failures',
      message: `${m.failed_routines_24h} routines failed in last 24h`,
      action: 'create_task',
      target_agent: CONFIG.routing.routine_failure,
      auto: true,
    });
  }

  // Stuck workflows
  if (Number(m.stuck_workflows || 0) > 0) {
    state.findings.push({
      severity: 'high',
      type: 'stuck_workflows',
      message: `${m.stuck_workflows} workflows appear stuck (>60min without update)`,
      action: 'create_task',
      target_agent: CONFIG.routing.workflow_failure,
      auto: true,
    });
  }

  console.log(`[analyze] Found ${state.findings.length} findings`);
}

// ── Phase 3: LLM-Assisted Planning ────────────────────────────────────────

async function generateLLMPlan(details) {
  console.log('[llm-plan] Asking LLM to analyze findings and plan actions...');

  const findingsSummary = state.findings.map((f, i) =>
    `${i + 1}. [${f.severity}] ${f.type}: ${f.message}`
  ).join('\n');

  const detailsSummary = [];

  if (details.recentFailures?.length > 0) {
    detailsSummary.push(
      'Recent Task Failures:\n' +
      details.recentFailures.map(f =>
        `  - Agent: ${f.agent_id}, Task: ${f.task?.substring(0, 100)}, Error: ${f.error?.substring(0, 200)}`
      ).join('\n')
    );
  }

  if (details.failingRoutines?.length > 0) {
    detailsSummary.push(
      'Failing Routines:\n' +
      details.failingRoutines.map(r =>
        `  - Routine: ${r.name}, Agent: ${r.agent_id}, Failures: ${r.failure_count}, Error: ${r.last_error?.substring(0, 200)}`
      ).join('\n')
    );
  }

  if (details.stuckWorkflows?.length > 0) {
    detailsSummary.push(
      'Stuck Workflows:\n' +
      details.stuckWorkflows.map(w =>
        `  - Workflow: ${w.name}, Remaining Steps: ${w.remaining_steps}, Agent: ${w.agent_id}`
      ).join('\n')
    );
  }

  if (details.overdueProjectTasks?.length > 0) {
    detailsSummary.push(
      'Overdue Project Tasks:\n' +
      details.overdueProjectTasks.map(t =>
        `  - "${t.title}" (Project: ${t.project_name}, Due: ${t.due_date})`
      ).join('\n')
    );
  }

  if (details.agentActivity24h?.length > 0) {
    detailsSummary.push(
      'Agent Activity (24h):\n' +
      details.agentActivity24h.map(a =>
        `  - ${a.agent_id}: ${a.actions} actions, last: ${a.last_action}`
      ).join('\n')
    );
  }

  const systemPrompt = `You are the KlawHub Autonomous Engineer — a proactive system intelligence layer. You analyze system health data and decide what autonomous actions to take. You manage a team of 7 AI agents: general (Chief Orchestrator), mail (Email/Calendar), code (Software Engineer), data (Data Analyst), creative (Content Strategist), research (Research Analyst), and ops (Operations Engineer).

You must respond with ONLY a valid JSON array of action objects. Each action must have:
- "type": one of "recover_stale", "create_agent_task", "send_a2a_message", "send_notification", "skip"
- "finding": which finding this addresses
- "agent": target agent ID (for create_agent_task and send_a2a_message)
- "priority": "critical", "high", "medium", or "low"
- "task": the exact task description to assign (for create_agent_task)
- "message": the exact message content (for send_a2a_message)
- "notification_title": title for user notification (for send_notification)
- "notification_body": body for user notification (for send_notification)
- "reason": why you chose this action

Rules:
- Prefer creating agent_tasks over just notifying — be ACTION-oriented
- For high failure rates, create an investigation task for ops agent
- For routine failures, create a diagnostic task for ops agent
- For stuck workflows, create a recovery task for ops agent
- For overdue project tasks, create a triage task for general agent
- Always explain your reasoning
- Don't create duplicate tasks for the same issue
- Keep task descriptions specific and actionable`;

  const userPrompt = `## Current System State

### Metrics
${JSON.stringify(state.metrics, null, 2)}

### Findings (${state.findings.length})
${findingsSummary}

### Detailed Health Data
${detailsSummary.join('\n\n') || 'No additional details available.'}

## Your Task
Based on the above system state, decide what autonomous actions to take. Remember: you are proactively maintaining this system. Respond with a JSON array of action objects.`;

  try {
    const result = await generateText({
      model: getProvider(),
      system: systemPrompt,
      prompt: userPrompt,
      maxTokens: 4096,
    });

    const responseText = result.text.trim();
    // Extract JSON from the response (handle markdown code blocks)
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('[llm-plan] LLM did not return valid JSON array');
      state.errors.push('LLM plan: invalid response format');
      return [];
    }

    const plan = JSON.parse(jsonMatch[0]);
    state.llmPlan = plan;
    console.log(`[llm-plan] LLM generated ${plan.length} action(s)`);
    plan.forEach((action, i) => console.log(`  ${i + 1}. [${action.type}] → ${action.agent || 'system'}: ${action.task || action.message || action.notification_title}`));
    return plan;
  } catch (err) {
    console.error('[llm-plan] LLM planning failed:', err.message);
    state.errors.push(`LLM planning: ${err.message}`);
    return [];
  }
}

// ── Phase 4: Execute Actions ──────────────────────────────────────────────

async function executeAction(action, db) {
  switch (action.type) {
    case 'recover_stale':
      return executeRecovery(db, action);
    case 'create_agent_task':
      return executeCreateTask(db, action);
    case 'send_a2a_message':
      return executeA2AMessage(db, action);
    case 'send_notification':
      return executeNotification(db, action);
    case 'skip':
      state.decisions.push({ finding: action.finding, decision: 'skip', reason: action.reason });
      return null;
    default:
      console.warn(`[act] Unknown action type: ${action.type}`);
      return null;
  }
}

// --- Action: Recover stale tasks (direct DB fix, no LLM needed) ---

async function executeRecovery(db, action) {
  let recovered = 0;

  try {
    const r1 = await db.query(
      "UPDATE agent_tasks SET status = 'pending', started_at = NULL WHERE status = 'running' AND started_at < NOW() - INTERVAL '15 minutes'"
    );
    recovered += r1.rowCount || 0;
  } catch (err) {
    state.errors.push(`Recovery failed: ${err.message}`);
  }

  try {
    const r2 = await db.query(
      "UPDATE project_tasks SET status = 'pending', retries = COALESCE(retries, 0) WHERE status = 'in_progress' AND started_at < NOW() - INTERVAL '30 minutes'"
    );
    recovered += r2.rowCount || 0;
  } catch (err) {
    state.errors.push(`Project recovery failed: ${err.message}`);
  }

  if (recovered > 0) {
    state.actions.push(`Recovered ${recovered} stale tasks`);
    state.decisions.push({
      finding: action.finding,
      decision: 'auto_recover',
      reason: action.reason || 'Tasks exceeded running time threshold — reset to pending for retry',
    });
  }

  return recovered;
}

// --- Action: Create a task for a specialist agent ---

async function executeCreateTask(db, action) {
  const { agent, priority, task, finding, reason } = action;

  if (!agent || !task) {
    console.warn(`[act] Missing agent or task in create_agent_task action`);
    return null;
  }

  try {
    const result = await db.query(
      `INSERT INTO agent_tasks (agent_id, task, context, trigger_type, trigger_source, priority, status)
       VALUES ($1, $2, $3, 'autonomous', 'chief-engineer', $4, 'pending')
       RETURNING id`,
      [
        agent,
        task,
        JSON.stringify({
          source: 'autonomous-engineer',
          finding: finding,
          shift: state.timestamp,
          reason: reason,
          metrics_snapshot: {
            pending: state.metrics.pending_tasks,
            failed_24h: state.metrics.recent_failures,
            running: state.metrics.running_tasks,
          },
        }),
        priority || 'medium',
      ]
    );

    const taskId = result.rows[0].id;
    const agentNames = {
      general: 'Klawhub General',
      mail: 'Mail Agent',
      code: 'Code Agent',
      data: 'Data Agent',
      creative: 'Creative Agent',
      research: 'Research Agent',
      ops: 'Ops Agent',
    };

    state.actions.push(`Created task #${taskId} for ${agentNames[agent] || agent}: "${task.substring(0, 80)}${task.length > 80 ? '...' : ''}"`);
    state.decisions.push({
      finding: finding,
      decision: 'create_agent_task',
      target_agent: agent,
      task_id: taskId,
      reason: reason,
    });

    console.log(`[act] Created task #${taskId} for ${agent} (priority: ${priority})`);

    // Also log agent activity
    try {
      await db.query(
        `INSERT INTO agent_activity (agent_id, agent_name, action, detail, metadata)
         VALUES ($1, $2, 'task_created', $3, $4)`,
        [agent, agentNames[agent] || agent, task.substring(0, 200), JSON.stringify({ source: 'autonomous-engineer', task_id: taskId })]
      );
    } catch { /* non-critical */ }

    return taskId;
  } catch (err) {
    console.error(`[act] Failed to create task for ${agent}:`, err.message);
    state.errors.push(`Task creation failed (${agent}): ${err.message}`);
    return null;
  }
}

// --- Action: Send an A2A message to an agent ---

async function executeA2AMessage(db, action) {
  const { agent, message, finding, reason } = action;

  if (!agent || !message) {
    console.warn(`[act] Missing agent or message in send_a2a_message action`);
    return null;
  }

  try {
    const result = await db.query(
      `INSERT INTO a2a_messages (from_agent, to_agent, type, topic, payload, priority, status)
       VALUES ($1, $2, 'request', $3, $4, $5, 'delivered')
       RETURNING id`,
      [
        'ops', // from the Ops Agent (engineer runs as ops)
        agent,
        `Chief Engineer: ${finding || 'System Assessment'}`,
        JSON.stringify({
          source: 'autonomous-engineer',
          finding: finding,
          message: message,
          shift: state.timestamp,
          metrics: {
            pending: state.metrics.pending_tasks,
            failed_24h: state.metrics.recent_failures,
          },
        }),
        'high',
      ]
    );

    const msgId = result.rows[0].id;
    state.actions.push(`Sent A2A message #${msgId} to ${agent}: "${message.substring(0, 80)}${message.length > 80 ? '...' : ''}"`);
    state.decisions.push({
      finding: finding,
      decision: 'send_a2a_message',
      target_agent: agent,
      message_id: msgId,
      reason: reason,
    });

    console.log(`[act] Sent A2A message #${msgId} to ${agent}`);
    return msgId;
  } catch (err) {
    console.error(`[act] Failed to send A2A message to ${agent}:`, err.message);
    state.errors.push(`A2A message failed (${agent}): ${err.message}`);
    return null;
  }
}

// --- Action: Send a proactive notification to the user ---

async function executeNotification(db, action) {
  const { notification_title: title, notification_body: body, priority } = action;

  if (!title) {
    console.warn('[act] Missing notification_title in send_notification action');
    return null;
  }

  try {
    const result = await db.query(
      `INSERT INTO proactive_notifications (agent_id, agent_name, type, title, body, priority, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        CONFIG.engineer.id,
        CONFIG.engineer.name,
        'insight',
        title,
        body || '',
        priority || 'normal',
        JSON.stringify({
          source: 'autonomous-engineer',
          shift: state.timestamp,
          findings: state.findings.length,
          actions: state.actions.length,
        }),
      ]
    );

    const notifId = result.rows[0].id;
    state.actions.push(`Sent notification to user: "${title}"`);
    console.log(`[act] Sent notification #${notifId}: ${title}`);
    return notifId;
  } catch (err) {
    console.error('[act] Failed to send notification:', err.message);
    state.errors.push(`Notification failed: ${err.message}`);
    return null;
  }
}

// ── Phase 5: Review Previous Actions ──────────────────────────────────────

async function reviewPreviousActions() {
  console.log('[review] Checking outcomes of previous autonomous actions...');
  const db = await getPool();

  try {
    // Look at tasks created by autonomous-engineer in the last 24h
    const previousTasks = await db.query(`
      SELECT id, agent_id, task, status, result, error, created_at, completed_at,
             EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - created_at)) AS duration_seconds
      FROM agent_tasks
      WHERE trigger_type = 'autonomous' AND trigger_source = 'chief-engineer'
        AND created_at > NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC LIMIT 20
    `);

    if (previousTasks.rows.length === 0) {
      state.actionReview = { message: 'No previous autonomous actions to review' };
      return;
    }

    const completed = previousTasks.rows.filter(t => t.status === 'completed');
    const failed = previousTasks.rows.filter(t => t.status === 'failed');
    const pending = previousTasks.rows.filter(t => t.status === 'pending');
    const running = previousTasks.rows.filter(t => t.status === 'running');

    const successRate = previousTasks.rows.length > 0
      ? (completed.length / previousTasks.rows.length * 100).toFixed(1)
      : 'N/A';

    const avgDuration = completed.length > 0
      ? (completed.reduce((sum, t) => sum + Number(t.duration_seconds || 0), 0) / completed.length).toFixed(1)
      : 'N/A';

    state.actionReview = {
      total: previousTasks.rows.length,
      completed: completed.length,
      failed: failed.length,
      pending: pending.length,
      running: running.length,
      successRate: `${successRate}%`,
      avgDurationSeconds: avgDuration,
      recentFailures: failed.slice(0, 3).map(t => ({
        task: t.task?.substring(0, 100),
        error: t.error?.substring(0, 200),
      })),
    };

    console.log(`[review] Previous 24h autonomous actions: ${completed.length} completed, ${failed.length} failed, ${pending.length} pending (${successRate}% success)`);

    // If success rate is low, create a finding for this shift
    if (Number(successRate) < 50 && previousTasks.rows.length >= 3) {
      state.findings.push({
        severity: 'medium',
        type: 'autonomous_action_quality',
        message: `Previous autonomous actions have ${successRate}% success rate (${failed.length}/${previousTasks.rows.length} failed)`,
        action: 'notify',
      });
    }
  } catch (err) {
    console.warn('[review] Could not review previous actions:', err.message);
  }
}

// ── Phase 6: Report ───────────────────────────────────────────────────────

async function generateReport() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('  AUTONOMOUS ENGINEER — SHIFT REPORT');
  console.log('═══════════════════════════════════════════════');
  console.log(`Mode: ${MODE}`);
  console.log(`Timestamp: ${state.timestamp}`);
  console.log(`Database: ${state.health.database ? 'CONNECTED' : 'DISCONNECTED'}`);

  if (state.metrics && Object.keys(state.metrics).length > 0) {
    const m = state.metrics;
    console.log('\n── System Metrics ──');
    console.log(`  Pending tasks:    ${m.pending_tasks}`);
    console.log(`  Running tasks:    ${m.running_tasks}`);
    console.log(`  Failed (24h):     ${m.recent_failures}`);
    console.log(`  Completed (24h):  ${m.recent_successes}`);
    console.log(`  Active routines:  ${m.active_routines}`);
    console.log(`  Active workflows: ${m.active_workflows}`);
    console.log(`  Unread A2A:       ${m.unread_a2a_messages || 0}`);
    console.log(`  Total memories:   ${m.total_memories}`);
    console.log(`  Active skills:    ${m.active_skills}`);
    console.log(`  Active automations: ${m.active_automations || 0}`);
  }

  if (state.findings.length > 0) {
    console.log('\n── Findings ──');
    state.findings.forEach((f, i) => console.log(`  ${i + 1}. [${f.severity.toUpperCase()}] ${f.type}: ${f.message}`));
  } else {
    console.log('\n── Findings: None — system is healthy ──');
  }

  if (state.llmPlan && state.llmPlan.length > 0) {
    console.log('\n── LLM Action Plan ──');
    state.llmPlan.forEach((a, i) => console.log(`  ${i + 1}. [${a.type}] → ${a.agent || 'system'}: ${a.reason}`));
  }

  if (state.decisions.length > 0) {
    console.log('\n── Decisions Executed ──');
    state.decisions.forEach((d, i) => console.log(`  ${i + 1}. ${d.decision}: ${d.reason}`));
  }

  if (state.actions.length > 0) {
    console.log('\n── Actions Taken ──');
    state.actions.forEach((a, i) => console.log(`  ${i + 1}. ${a}`));
  }

  if (state.actionReview && state.actionReview.total > 0) {
    console.log('\n── Previous Action Review (24h) ──');
    console.log(`  Success rate: ${state.actionReview.successRate} (${state.actionReview.completed}/${state.actionReview.total})`);
    console.log(`  Avg duration: ${state.actionReview.avgDurationSeconds}s`);
  }

  if (state.errors.length > 0) {
    console.log('\n── Errors ──');
    state.errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
  }

  console.log('═══════════════════════════════════════════════\n');
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Autonomous Engineer starting... (mode: ${MODE})`);

  try {
    // Phase 1: Always collect metrics
    await collectMetrics();

    // Phase 1b: Detailed health checks (in full/llm-plan mode)
    let details = {};
    if (MODE === 'full' || MODE === 'llm-plan') {
      details = await detailedHealthChecks();
    }

    // Phase 2: Analyze
    if (MODE === 'full' || MODE === 'monitor') {
      analyzeMetrics();
    }

    // Phase 3: LLM Planning (full/llm-plan mode)
    if ((MODE === 'full' || MODE === 'llm-plan') && state.findings.length > 0) {
      const plan = await generateLLMPlan(details);

      if (MODE === 'llm-plan') {
        // Dry-run: just report the plan, don't execute
        await generateReport();
        return;
      }

      // Phase 4: Execute LLM plan
      if (plan.length > 0) {
        console.log(`[act] Executing ${plan.length} LLM-planned actions...`);
        const db = await getPool();
        for (const action of plan) {
          await executeAction(action, db);
        }
      }
    } else if (MODE === 'full' && state.findings.length === 0) {
      console.log('[act] No findings — system is healthy. No actions needed.');
    } else if (MODE === 'act') {
      // act mode without LLM — use rule-based actions only
      console.log('[act] Rule-based action mode (no LLM)...');
      const db = await getPool();
      for (const finding of state.findings) {
        if (finding.auto) {
          await executeAction({ ...finding, type: finding.action, reason: finding.message }, db);
        }
      }
    }

    // Phase 5: Review previous actions (full mode only)
    if (MODE === 'full') {
      await reviewPreviousActions();
    }

    // Phase 6: Report
    await generateReport();

    // Persist report to DB
    if (state.health.database) {
      const db = await getPool();
      try {
        await db.query(
          `INSERT INTO automation_logs (automation_id, status, result, metadata)
           VALUES ('autonomous-engineer', 'completed', $1, $2)
           ON CONFLICT (automation_id) DO UPDATE SET status = 'completed', result = $1, metadata = $2, updated_at = NOW()`,
          [
            JSON.stringify({
              findings: state.findings.length,
              actions: state.actions.length,
              decisions: state.decisions.length,
              errors: state.errors.length,
              mode: MODE,
            }),
            JSON.stringify(state),
          ]
        );
      } catch (err) {
        console.error('Failed to persist report:', err.message);
      }
    }

    // Send a summary notification if actions were taken
    if (state.actions.length > 0 && state.health.database) {
      const db = await getPool();
      try {
        const title = state.errors.length > 0
          ? `Chief Engineer: ${state.actions.length} actions taken, ${state.errors.length} errors`
          : `Chief Engineer: ${state.actions.length} autonomous actions completed`;

        const body = state.actions.map(a => `• ${a}`).join('\n');

        await db.query(
          `INSERT INTO proactive_notifications (agent_id, agent_name, type, title, body, priority, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            CONFIG.engineer.id,
            CONFIG.engineer.name,
            'routine_result',
            title,
            body,
            state.findings.some(f => f.severity === 'critical') ? 'high' : 'normal',
            JSON.stringify({
              source: 'autonomous-engineer',
              shift: state.timestamp,
              findings: state.findings.length,
              actions_taken: state.actions,
              decisions: state.decisions,
              action_review: state.actionReview,
            }),
          ]
        );
        console.log('[notify] Summary notification sent to user');
      } catch (err) {
        console.error('Failed to send summary notification:', err.message);
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
