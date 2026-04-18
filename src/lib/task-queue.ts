// ---------------------------------------------------------------------------
// Claw — Phase 3: Task Queue Manager
// Uses raw pg Pool (same pattern as activity.ts)
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-require-imports */
const { Pool } = require("pg");
/* eslint-enable @typescript-eslint/no-require-imports */

function getPool() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) throw new Error("SUPABASE_DB_URL is not configured.");
  return new Pool({ connectionString });
}

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

export async function createTask(params: {
  agent_id: string;
  task: string;
  context?: string;
  trigger_type?: string;
  trigger_source?: string;
  priority?: string;
}): Promise<number> {
  if (!process.env.SUPABASE_DB_URL) return -1;

  const pool = getPool();
  try {
    const result = await pool.query(
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
    return Number(result.rows[0]?.id || -1);
  } catch (err) {
    console.warn("[TaskQueue] Failed to create task:", err);
    return -1;
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// getNextTask — Poll for next pending task for an agent
// ---------------------------------------------------------------------------

export async function getNextTask(agentId: string): Promise<AgentTask | null> {
  if (!process.env.SUPABASE_DB_URL) return null;

  const pool = getPool();
  try {
    // Priority order: critical > high > medium > low, then by created_at ASC
    const result = await pool.query(
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
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// getAnyPendingTask — Get any pending task across all agents
// ---------------------------------------------------------------------------

export async function getAnyPendingTask(): Promise<AgentTask | null> {
  if (!process.env.SUPABASE_DB_URL) return null;

  const pool = getPool();
  try {
    const result = await pool.query(
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
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// startTask — Mark task as running
// ---------------------------------------------------------------------------

export async function startTask(taskId: number): Promise<void> {
  if (!process.env.SUPABASE_DB_URL) return;

  const pool = getPool();
  try {
    await pool.query(
      `UPDATE agent_tasks SET status = 'running', started_at = NOW() WHERE id = $1`,
      [taskId],
    );
  } catch (err) {
    console.warn("[TaskQueue] Failed to start task:", err);
  } finally {
    await pool.end();
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

  const pool = getPool();
  try {
    await pool.query(
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
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// failTask — Fail a task
// ---------------------------------------------------------------------------

export async function failTask(taskId: number, error: string): Promise<void> {
  if (!process.env.SUPABASE_DB_URL) return;

  const pool = getPool();
  try {
    await pool.query(
      `UPDATE agent_tasks
       SET status = 'failed', error = $1, completed_at = NOW()
       WHERE id = $2`,
      [error.slice(0, 5000), taskId],
    );
  } catch (err) {
    console.warn("[TaskQueue] Failed to mark task as failed:", err);
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// cancelTask — Cancel a task
// ---------------------------------------------------------------------------

export async function cancelTask(taskId: number): Promise<void> {
  if (!process.env.SUPABASE_DB_URL) return;

  const pool = getPool();
  try {
    await pool.query(
      `UPDATE agent_tasks
       SET status = 'cancelled', completed_at = NOW()
       WHERE id = $1 AND status = 'pending'`,
      [taskId],
    );
  } catch (err) {
    console.warn("[TaskQueue] Failed to cancel task:", err);
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// getRecentTasks — Get recent tasks for dashboard
// ---------------------------------------------------------------------------

export async function getRecentTasks(limit = 20): Promise<AgentTask[]> {
  if (!process.env.SUPABASE_DB_URL) return [];

  const pool = getPool();
  try {
    const result = await pool.query(
      `SELECT * FROM agent_tasks
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    );
    return result.rows as AgentTask[];
  } catch (err) {
    console.warn("[TaskQueue] Failed to fetch recent tasks:", err);
    return [];
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// getPendingTaskCount — Get pending task count
// ---------------------------------------------------------------------------

export async function getPendingTaskCount(): Promise<number> {
  if (!process.env.SUPABASE_DB_URL) return 0;

  const pool = getPool();
  try {
    const result = await pool.query(
      `SELECT COUNT(*) as count FROM agent_tasks WHERE status = 'pending'`,
    );
    return Number(result.rows[0]?.count || 0);
  } catch (err) {
    console.warn("[TaskQueue] Failed to count pending tasks:", err);
    return 0;
  } finally {
    await pool.end();
  }
}
