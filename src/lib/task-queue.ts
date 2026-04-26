// ---------------------------------------------------------------------------
// Klawhub — Phase 3: Task Queue Manager
// Uses raw pg Pool (same pattern as activity.ts)
// ---------------------------------------------------------------------------

import { query } from "@/lib/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentTask {
  id: number;
  agent_id: string;
  task: string;
  context: string;
  trigger_type: string;
  trigger_source: string;
  priority: string;
  status: string;
  result: string;
  error: string;
  tool_calls: unknown[];
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// createTask — Create a new task in the queue
// ---------------------------------------------------------------------------

export class TaskQueueError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "TaskQueueError";
  }
}

export async function createTask(params: {
  agent_id: string;
  task: string;
  context?: string;
  trigger_type?: string;
  trigger_source?: string;
  priority?: string;
}): Promise<number> {
  if (!process.env.SUPABASE_DB_URL) {
    throw new TaskQueueError("SUPABASE_DB_URL not configured");
  }

  try {
    const result = await query(
      `INSERT INTO agent_tasks (agent_id, task, context, trigger_type, trigger_source, priority)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        params.agent_id,
        params.task,
        params.context || "",
        params.trigger_type || "manual",
        params.trigger_source || "",
        params.priority || "medium",
      ],
    );
    const id = Number(result.rows[0]?.id);
    if (!id) {
      throw new TaskQueueError("INSERT succeeded but no id was returned");
    }
    return id;
  } catch (err) {
    if (err instanceof TaskQueueError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[TaskQueue] Failed to create task:", msg);
    throw new TaskQueueError(`Database error: ${msg}`, err);
  }
}

// ---------------------------------------------------------------------------
// getNextTask — Poll for next pending task for an agent
// ---------------------------------------------------------------------------

export async function getNextTask(agentId: string): Promise<AgentTask | null> {
  if (!process.env.SUPABASE_DB_URL) return null;

  try {
    // Priority order: critical > high > medium > low, then by created_at ASC
    const result = await query(
      `SELECT * FROM agent_tasks
       WHERE agent_id = $1 AND status = 'pending'
       ORDER BY
         CASE priority
           WHEN 'critical' THEN 0
           WHEN 'high' THEN 1
           WHEN 'medium' THEN 2
           WHEN 'low' THEN 3
           ELSE 2
         END,
         created_at ASC
       LIMIT 1`,
      [agentId],
    );

    if (result.rows.length === 0) return null;
    return result.rows[0] as AgentTask;
  } catch (err) {
    console.warn("[TaskQueue] Failed to get next task:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// getAnyPendingTask — Get any pending task across all agents
// ---------------------------------------------------------------------------

export async function getAnyPendingTask(): Promise<AgentTask | null> {
  if (!process.env.SUPABASE_DB_URL) return null;

  try {
    const result = await query(
      `SELECT * FROM agent_tasks
       WHERE status = 'pending'
       ORDER BY
         CASE priority
           WHEN 'critical' THEN 0
           WHEN 'high' THEN 1
           WHEN 'medium' THEN 2
           WHEN 'low' THEN 3
           ELSE 2
         END,
         created_at ASC
       LIMIT 1`,
    );

    if (result.rows.length === 0) return null;
    return result.rows[0] as AgentTask;
  } catch (err) {
    console.warn("[TaskQueue] Failed to get any pending task:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// startTask — Mark task as running
// ---------------------------------------------------------------------------

export async function startTask(taskId: number): Promise<void> {
  if (!process.env.SUPABASE_DB_URL) return;

  try {
    await query(
      `UPDATE agent_tasks SET status = 'running', started_at = NOW() WHERE id = $1`,
      [taskId],
    );
  } catch (err) {
    console.warn("[TaskQueue] Failed to start task:", err);
  }
}

// ---------------------------------------------------------------------------
// completeTask — Complete a task with result
// ---------------------------------------------------------------------------

export async function completeTask(
  taskId: number,
  result: string,
  toolCalls?: unknown[],
): Promise<void> {
  if (!process.env.SUPABASE_DB_URL) return;

  try {
    await query(
      `UPDATE agent_tasks
       SET status = 'completed', result = $1, tool_calls = $2, completed_at = NOW()
       WHERE id = $3`,
      [
        result.slice(0, 10000), // Cap result at 10k chars
        JSON.stringify(toolCalls || []),
        taskId,
      ],
    );
  } catch (err) {
    console.warn("[TaskQueue] Failed to complete task:", err);
  }
}

// ---------------------------------------------------------------------------
// failTask — Fail a task
// ---------------------------------------------------------------------------

export async function failTask(taskId: number, error: string): Promise<void> {
  if (!process.env.SUPABASE_DB_URL) return;

  try {
    await query(
      `UPDATE agent_tasks
       SET status = 'failed', error = $1, completed_at = NOW()
       WHERE id = $2`,
      [error.slice(0, 5000), taskId],
    );
  } catch (err) {
    console.warn("[TaskQueue] Failed to mark task as failed:", err);
  }
}

// ---------------------------------------------------------------------------
// cancelTask — Cancel a task
// ---------------------------------------------------------------------------

export async function cancelTask(taskId: number): Promise<void> {
  if (!process.env.SUPABASE_DB_URL) return;

  try {
    await query(
      `UPDATE agent_tasks
       SET status = 'cancelled', completed_at = NOW()
       WHERE id = $1 AND status = 'pending'`,
      [taskId],
    );
  } catch (err) {
    console.warn("[TaskQueue] Failed to cancel task:", err);
  }
}

// ---------------------------------------------------------------------------
// getRecentTasks — Get recent tasks for dashboard
// ---------------------------------------------------------------------------

export async function getRecentTasks(limit = 20): Promise<AgentTask[]> {
  if (!process.env.SUPABASE_DB_URL) return [];

  try {
    const result = await query(
      `SELECT * FROM agent_tasks
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    );
    return result.rows as AgentTask[];
  } catch (err) {
    console.warn("[TaskQueue] Failed to fetch recent tasks:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// getPendingTaskCount — Get pending task count
// ---------------------------------------------------------------------------

export async function getPendingTaskCount(): Promise<number> {
  if (!process.env.SUPABASE_DB_URL) return 0;

  try {
    const result = await query(
      `SELECT COUNT(*) as count FROM agent_tasks WHERE status = 'pending'`,
    );
    return Number(result.rows[0]?.count || 0);
  } catch (err) {
    console.warn("[TaskQueue] Failed to count pending tasks:", err);
    return 0;
  }
}
