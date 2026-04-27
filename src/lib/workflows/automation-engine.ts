// ---------------------------------------------------------------------------
// Klawhub — Automation Engine
// Evaluates enabled automations and triggers agent tasks when conditions match
// Supports: cron-style schedules, event triggers, manual triggers
// Uses raw pg Pool (same pattern as activity.ts)
// ---------------------------------------------------------------------------

import { query } from "@/lib/core/db";

import { createTask } from "@/lib/tasks/task-queue";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Automation {
  id: number;
  name: string;
  description: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  action_type: string;
  action_config: Record<string, unknown>;
  agent_id: string | null;
  enabled: boolean;
  last_run_at: string | null;
  last_status: string | null;
  run_count: number;
}

// ---------------------------------------------------------------------------
// Cron Parser — lightweight cron expression matcher
// Supports: minute hour day month weekday
// ---------------------------------------------------------------------------

function cronShouldFire(cronExpr: string): boolean {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length < 5) return false;

  const now = new Date();
  const fields = [
    { value: now.getMinutes(), expr: parts[0] },      // minute
    { value: now.getHours(), expr: parts[1] },        // hour
    { value: now.getDate(), expr: parts[2] },         // day
    { value: now.getMonth() + 1, expr: parts[3] },    // month (1-12)
    { value: now.getDay(), expr: parts[4] },           // weekday (0=Sun)
  ];

  // All 5 fields must match (within 1-minute window)
  const minuteMatch = now.getSeconds() < 60; // just fire within the minute

  return minuteMatch && fields.every(({ value, expr }) => matchesField(value, expr));
}

function matchesField(value: number, expr: string): boolean {
  if (expr === "*") return true;

  // Handle comma-separated values
  const parts = expr.split(",");
  return parts.some((part) => matchesSingleValue(value, part.trim()));
}

function matchesSingleValue(value: number, expr: string): boolean {
  // Handle */N (every N)
  const stepMatch = expr.match(/^\*\/(\d+)$/);
  if (stepMatch) {
    const step = parseInt(stepMatch[1], 10);
    return step > 0 && value % step === 0;
  }

  // Handle N-M (range)
  const rangeMatch = expr.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1], 10);
    const max = parseInt(rangeMatch[2], 10);
    return value >= min && value <= max;
  }

  // Handle N-M/S (range with step)
  const rangeStepMatch = expr.match(/^(\d+)-(\d+)\/(\d+)$/);
  if (rangeStepMatch) {
    const min = parseInt(rangeStepMatch[1], 10);
    const max = parseInt(rangeStepMatch[2], 10);
    const step = parseInt(rangeStepMatch[3], 10);
    if (value < min || value > max) return false;
    return step > 0 && (value - min) % step === 0;
  }

  // Exact match
  const num = parseInt(expr, 10);
  if (!isNaN(num)) return value === num;

  return false;
}

// ---------------------------------------------------------------------------
// evaluateAutomations — Check all enabled automations and evaluate triggers
// ---------------------------------------------------------------------------

export async function evaluateAutomations(): Promise<{
  triggered: number;
  tasksCreated: number;
  errors: string[];
}> {
  const result = { triggered: 0, tasksCreated: 0, errors: [] as string[] };

  if (!process.env.SUPABASE_DB_URL) return result;

  try {
    const automationsResult = await query(
      `SELECT id, name, description, trigger_type, trigger_config, action_type, action_config, agent_id, enabled, last_run_at, last_status, run_count
       FROM automations
       WHERE enabled = true`,
    );
    const automations: Automation[] = automationsResult.rows;

    for (const automation of automations) {
      try {
        const { triggered, tasksCreated } = await processAutomation(automation);
        if (triggered) {
          result.triggered++;
          result.tasksCreated += tasksCreated;
        }
      } catch (error) {
        const msg = `Automation ${automation.id} (${automation.name}): ${error instanceof Error ? error.message : "Unknown error"}`;
        result.errors.push(msg);
        console.warn(`[AutomationEngine] ${msg}`);
      }
    }
  } catch (err) {
    result.errors.push(`Failed to fetch automations: ${err instanceof Error ? err.message : "Unknown"}`);
    console.warn("[AutomationEngine] Failed to evaluate automations:", err);
  }

  return result;
}

// ---------------------------------------------------------------------------
// processAutomation — Evaluate a single automation's trigger
// ---------------------------------------------------------------------------

async function processAutomation(automation: Automation): Promise<{ triggered: boolean; tasksCreated: number }> {
  let shouldTrigger = false;

  if (automation.trigger_type === "schedule") {
    shouldTrigger = evaluateScheduleTrigger(automation);
  } else if (automation.trigger_type === "event") {
    shouldTrigger = await evaluateEventTrigger(automation);
  }

  if (!shouldTrigger) return { triggered: false, tasksCreated: 0 };

  // Automation was triggered — execute action
  const actionConfig = automation.action_config || {};
  const agentId = (actionConfig.agent_id as string) || automation.agent_id || "general";
  const taskDescription = (actionConfig.task as string) || automation.description || automation.name;

  let taskId = -1;

  if (automation.action_type === "agent_task") {
    taskId = await createTask({
      agent_id: agentId,
      task: taskDescription,
      context: `Triggered by automation: ${automation.name}`,
      trigger_type: "automation",
      trigger_source: `automation:${automation.id}`,
      priority: (actionConfig.priority as string) || "medium",
    });
  } else if (automation.action_type === "notification") {
    // Notification action: create a task for the general agent to send a notification
    const notificationMsg = (actionConfig.message as string) || taskDescription;
    taskId = await createTask({
      agent_id: "general",
      task: `Send a proactive notification: ${notificationMsg}`,
      context: `Auto-notification from automation: ${automation.name}`,
      trigger_type: "automation",
      trigger_source: `automation:${automation.id}:notification`,
      priority: "low",
    });
  }

  if (taskId > 0) {
    // Log the run as "queued" — the task hasn't executed yet
    // The executor will update this log when the task completes (or fails)
    await query(
      `INSERT INTO automation_logs (automation_id, status, result, duration_ms)
       VALUES ($1, 'queued', $2, 0)`,
      [
        automation.id,
        JSON.stringify({
          type: "automation_queued",
          task_id: taskId,
          agent_id: agentId,
          trigger_type: automation.trigger_type,
        }),
      ],
    );

    // Update last_run_at and run_count — but use 'queued' as last_status
    // The actual status will be updated by the executor when the task finishes
    await query(
      `UPDATE automations SET last_run_at = NOW(), last_status = 'queued', run_count = run_count + 1 WHERE id = $1`,
      [automation.id],
    );

    console.log(`[AutomationEngine] Triggered "${automation.name}" (#${automation.id}) -> task #${taskId} for agent ${agentId}`);
    return { triggered: true, tasksCreated: 1 };
  }

  return { triggered: true, tasksCreated: 0 };
}

// ---------------------------------------------------------------------------
// evaluateScheduleTrigger — Check if schedule-based automation should fire
// Supports both cron expressions and interval_minutes
// ---------------------------------------------------------------------------

function evaluateScheduleTrigger(automation: Automation): boolean {
  const config = automation.trigger_config || {};

  // Priority 1: Cron expression (more precise)
  const cronExpr = config.cron as string || config.schedule as string;
  if (cronExpr) {
    // Don't re-trigger within the same minute
    if (automation.last_run_at) {
      const lastRun = new Date(automation.last_run_at);
      const now = new Date();
      const diffMs = now.getTime() - lastRun.getTime();
      // Only fire if last run was more than 55 seconds ago (avoid double-fire within same minute)
      if (diffMs < 55_000) return false;
    }
    return cronShouldFire(cronExpr);
  }

  // Priority 2: Interval-based (fallback)
  const intervalMinutes = (config.interval_minutes as number) || 60;

  if (!automation.last_run_at) {
    return true; // Never run before
  }

  const lastRun = new Date(automation.last_run_at);
  const now = new Date();
  const elapsedMinutes = (now.getTime() - lastRun.getTime()) / (1000 * 60);

  return elapsedMinutes >= intervalMinutes;
}

// ---------------------------------------------------------------------------
// evaluateEventTrigger — Check if event-based automation should fire
// ---------------------------------------------------------------------------

async function evaluateEventTrigger(
  automation: Automation,
): Promise<boolean> {
  const config = automation.trigger_config || {};
  const eventType = (config.event as string) || (config.event_type as string) || "";

  if (!eventType) return false;

  const sinceDate = automation.last_run_at
    ? automation.last_run_at
    : new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const result = await query(
    `SELECT COUNT(*) as count FROM agent_activity
     WHERE action = $1 AND created_at > $2
     LIMIT 1`,
    [eventType, sinceDate],
  );

  const count = Number(result.rows[0]?.count || 0);

  if (count > 0) {
    const cooldownMinutes = (config.cooldown_minutes as number) || 5;
    if (automation.last_run_at) {
      const elapsed = (Date.now() - new Date(automation.last_run_at).getTime()) / (1000 * 60);
      return elapsed >= cooldownMinutes;
    }
    return true;
  }

  return false;
}
