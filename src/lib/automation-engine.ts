// ---------------------------------------------------------------------------
// Claw — Phase 3: Automation Engine
// Evaluates enabled automations and triggers agent tasks when conditions match
// Uses raw pg Pool (same pattern as activity.ts)
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-require-imports */
const { Pool } = require("pg");
/* eslint-enable @typescript-eslint/no-require-imports */

import { createTask } from "@/lib/task-queue";

function getPool() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) throw new Error("SUPABASE_DB_URL is not configured.");
  return new Pool({ connectionString });
}

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
// evaluateAutomations — Check all enabled automations and evaluate triggers
// ---------------------------------------------------------------------------

export async function evaluateAutomations(): Promise<{
  triggered: number;
  tasksCreated: number;
  errors: string[];
}> {
  const result = { triggered: 0, tasksCreated: 0, errors: [] as string[] };

  if (!process.env.SUPABASE_DB_URL) return result;

  const pool = getPool();
  try {
    // 1. Fetch all enabled automations
    const automationsResult = await pool.query(
      `SELECT id, name, description, trigger_type, trigger_config, action_type, action_config, agent_id, enabled, last_run_at, last_status, run_count
       FROM automations
       WHERE enabled = true`,
    );
    const automations: Automation[] = automationsResult.rows;

    for (const automation of automations) {
      try {
        const wasTriggered = await processAutomation(automation);
        if (wasTriggered) {
          result.triggered++;
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
  } finally {
    await pool.end();
  }

  return result;
}

// ---------------------------------------------------------------------------
// processAutomation — Evaluate a single automation's trigger
// ---------------------------------------------------------------------------

async function processAutomation(automation: Automation): Promise<boolean> {
  const pool = getPool();

  try {
    let shouldTrigger = false;

    if (automation.trigger_type === "schedule") {
      shouldTrigger = evaluateScheduleTrigger(automation);
    } else if (automation.trigger_type === "event") {
      shouldTrigger = await evaluateEventTrigger(automation, pool);
    }

    if (!shouldTrigger) return false;

    // Automation was triggered — create a task in the queue
    const actionConfig = automation.action_config || {};
    const agentId = (actionConfig.agent_id as string) || automation.agent_id || "general";
    const taskDescription = (actionConfig.task as string) || automation.description || automation.name;

    const taskId = await createTask({
      agent_id: agentId,
      task: taskDescription,
      context: (actionConfig.context as string) || `Triggered by automation: ${automation.name}`,
      trigger_type: "automation",
      trigger_source: `automation:${automation.id}`,
      priority: (actionConfig.priority as string) || "medium",
    });

    if (taskId > 0) {
      // Log the run to automation_logs
      await pool.query(
        `INSERT INTO automation_logs (automation_id, status, result, duration_ms)
         VALUES ($1, 'success', $2, 0)`,
        [
          automation.id,
          JSON.stringify({
            type: "automation_triggered",
            task_id: taskId,
            agent_id: agentId,
            trigger_type: automation.trigger_type,
          }),
        ],
      );

      // Update last_run_at and run_count
      await pool.query(
        `UPDATE automations SET last_run_at = NOW(), last_status = 'success', run_count = run_count + 1 WHERE id = $1`,
        [automation.id],
      );

      console.log(`[AutomationEngine] Triggered automation ${automation.id} (${automation.name}) -> task #${taskId}`);
      return true;
    }

    return false;
  } catch (err) {
    console.warn(`[AutomationEngine] Error processing automation ${automation.id}:`, err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// evaluateScheduleTrigger — Check if schedule-based automation should fire
// ---------------------------------------------------------------------------

function evaluateScheduleTrigger(automation: Automation): boolean {
  const config = automation.trigger_config || {};
  const intervalMinutes = (config.interval_minutes as number) || 60;

  if (!automation.last_run_at) {
    // Never run before — trigger it
    return true;
  }

  const lastRun = new Date(automation.last_run_at);
  const now = new Date();
  const elapsedMs = now.getTime() - lastRun.getTime();
  const elapsedMinutes = elapsedMs / (1000 * 60);

  return elapsedMinutes >= intervalMinutes;
}

// ---------------------------------------------------------------------------
// evaluateEventTrigger — Check if event-based automation should fire
// ---------------------------------------------------------------------------

async function evaluateEventTrigger(
  automation: Automation,
  pool: ReturnType<typeof getPool>,
): Promise<boolean> {
  const config = automation.trigger_config || {};
  const eventType = (config.event_type as string) || "";

  if (!eventType) return false;

  // Check for matching events in agent_activity since last_run_at
  const sinceDate = automation.last_run_at || new Date(Date.now() - 60 * 60 * 1000).toISOString(); // default: last hour

  const result = await pool.query(
    `SELECT COUNT(*) as count FROM agent_activity
     WHERE action = $1 AND created_at > $2
     LIMIT 1`,
    [eventType, sinceDate],
  );

  const count = Number(result.rows[0]?.count || 0);

  // If there's at least one matching event and we haven't run recently, trigger
  if (count > 0) {
    // Cooldown: don't trigger more than once per interval (default 5 min)
    const cooldownMinutes = (config.cooldown_minutes as number) || 5;
    if (automation.last_run_at) {
      const elapsed = (Date.now() - new Date(automation.last_run_at).getTime()) / (1000 * 60);
      return elapsed >= cooldownMinutes;
    }
    return true;
  }

  return false;
}
