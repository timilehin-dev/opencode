// ---------------------------------------------------------------------------
// Task Board — Shared Kanban board for inter-agent coordination
// Agents can create tasks, assign them, update status, and pick up work.
// Columns: backlog, in_progress, waiting, done
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaskBoardItem {
  id: string;
  title: string;
  description: string;
  status: "backlog" | "in_progress" | "waiting" | "done";
  priority: "high" | "medium" | "low";
  assignedAgent: string | null;
  createdBy: string;
  delegationChain: string[];
  context: string;
  parentTaskId: string | null;
  deadline: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

import { query } from "@/lib/db";

// ---------------------------------------------------------------------------
// Task Board Schema (CREATE TABLE IF NOT EXISTS)
// ---------------------------------------------------------------------------

export const TASK_BOARD_SCHEMA = `
CREATE TABLE IF NOT EXISTS task_board (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'in_progress', 'waiting', 'done')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  assigned_agent TEXT DEFAULT NULL,
  created_by TEXT NOT NULL,
  delegation_chain JSONB DEFAULT '[]'::jsonb,
  context TEXT DEFAULT '',
  parent_task_id INTEGER DEFAULT NULL,
  deadline TIMESTAMPTZ DEFAULT NULL,
  tags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_board_status ON task_board(status);
CREATE INDEX IF NOT EXISTS idx_task_board_assigned_agent ON task_board(assigned_agent);
CREATE INDEX IF NOT EXISTS idx_task_board_priority ON task_board(priority);
CREATE INDEX IF NOT EXISTS idx_task_board_created_by ON task_board(created_by);
`;

// ---------------------------------------------------------------------------
// CRUD Functions
// ---------------------------------------------------------------------------

/** Create a new task on the board. */
export async function createTask(task: {
  title: string;
  description?: string;
  priority?: "high" | "medium" | "low";
  assignedAgent?: string | null;
  createdBy: string;
  context?: string;
  parentTaskId?: number | null;
  deadline?: string | null;
  tags?: string[];
  delegationChain?: string[];
}): Promise<TaskBoardItem | null> {
  try {
    const result = await query(
      `INSERT INTO task_board (title, description, status, priority, assigned_agent, created_by, delegation_chain, context, parent_task_id, deadline, tags)
       VALUES ($1, $2, 'backlog', $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        task.title,
        task.description || "",
        task.priority || "medium",
        task.assignedAgent || null,
        task.createdBy,
        JSON.stringify(task.delegationChain || [task.createdBy]),
        task.context || "",
        task.parentTaskId || null,
        task.deadline || null,
        JSON.stringify(task.tags || []),
      ],
    );

    if (result.rows.length > 0) return mapRow(result.rows[0]);
    return null;
  } catch (error) {
    console.error("[TaskBoard] Failed to create task:", error);
    return null;
  }
}

/** Update a task's status, assignment, or other fields. */
export async function updateTask(
  taskId: number,
  updates: Partial<Pick<TaskBoardItem, "title" | "description" | "status" | "priority" | "assignedAgent" | "context" | "deadline" | "tags">>,
): Promise<TaskBoardItem | null> {
  try {
    const setClauses: string[] = ["updated_at = NOW()"];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (updates.title !== undefined) { setClauses.push(`title = $${paramIdx++}`); values.push(updates.title); }
    if (updates.description !== undefined) { setClauses.push(`description = $${paramIdx++}`); values.push(updates.description); }
    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramIdx++}`);
      values.push(updates.status);
      if (updates.status === "done") {
        setClauses.push(`completed_at = $${paramIdx++}`);
        values.push(new Date().toISOString());
      }
    }
    if (updates.priority !== undefined) { setClauses.push(`priority = $${paramIdx++}`); values.push(updates.priority); }
    if (updates.assignedAgent !== undefined) { setClauses.push(`assigned_agent = $${paramIdx++}`); values.push(updates.assignedAgent); }
    if (updates.context !== undefined) { setClauses.push(`context = $${paramIdx++}`); values.push(updates.context); }
    if (updates.deadline !== undefined) { setClauses.push(`deadline = $${paramIdx++}`); values.push(updates.deadline); }
    if (updates.tags !== undefined) { setClauses.push(`tags = $${paramIdx++}`); values.push(JSON.stringify(updates.tags)); }

    values.push(taskId);
    const querySql = `UPDATE task_board SET ${setClauses.join(", ")} WHERE id = $${paramIdx} RETURNING *`;
    const result = await query(querySql, values);

    if (result.rows.length > 0) return mapRow(result.rows[0]);
    return null;
  } catch (error) {
    console.error("[TaskBoard] Failed to update task:", error);
    return null;
  }
}

/** Get tasks from the board, optionally filtered. */
export async function getTasks(filters?: {
  status?: TaskBoardItem["status"];
  assignedAgent?: string;
  createdBy?: string;
  priority?: TaskBoardItem["priority"];
  parentTaskId?: number | null;
  limit?: number;
}): Promise<TaskBoardItem[]> {
  try {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (filters?.status) { conditions.push(`status = $${paramIdx++}`); values.push(filters.status); }
    if (filters?.assignedAgent) { conditions.push(`assigned_agent = $${paramIdx++}`); values.push(filters.assignedAgent); }
    if (filters?.createdBy) { conditions.push(`created_by = $${paramIdx++}`); values.push(filters.createdBy); }
    if (filters?.priority) { conditions.push(`priority = $${paramIdx++}`); values.push(filters.priority); }
    if (filters?.parentTaskId !== undefined) { conditions.push(`parent_task_id ${filters.parentTaskId === null ? "IS NULL" : `= $${paramIdx++}`}`); if (filters.parentTaskId !== null) values.push(filters.parentTaskId); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filters?.limit || 100;
    values.push(limit);

    const result = await query(
      `SELECT * FROM task_board ${where} ORDER BY
        CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
        created_at DESC
       LIMIT $${paramIdx}`,
      values,
    );

    return result.rows.map(mapRow);
  } catch (error) {
    console.error("[TaskBoard] Failed to get tasks:", error);
    return [];
  }
}

/** Get task board summary (counts per status). */
export async function getTaskBoardSummary(): Promise<{
  backlog: number;
  in_progress: number;
  waiting: number;
  done: number;
  total: number;
  highPriority: number;
}> {
  try {
    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'backlog') AS backlog,
        COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
        COUNT(*) FILTER (WHERE status = 'waiting') AS waiting,
        COUNT(*) FILTER (WHERE status = 'done') AS done,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE priority = 'high' AND status != 'done') AS high_priority
      FROM task_board
    `);

    const row = result.rows[0];
    return {
      backlog: parseInt(row.backlog) || 0,
      in_progress: parseInt(row.in_progress) || 0,
      waiting: parseInt(row.waiting) || 0,
      done: parseInt(row.done) || 0,
      total: parseInt(row.total) || 0,
      highPriority: parseInt(row.high_priority) || 0,
    };
  } catch (error) {
    console.error("[TaskBoard] Failed to get summary:", error);
    return { backlog: 0, in_progress: 0, waiting: 0, done: 0, total: 0, highPriority: 0 };
  }
}

/** Delete a task. */
export async function deleteTask(taskId: number): Promise<boolean> {
  try {
    await query("DELETE FROM task_board WHERE id = $1", [taskId]);
    return true;
  } catch (error) {
    console.error("[TaskBoard] Failed to delete task:", error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

function mapRow(row: Record<string, unknown>): TaskBoardItem {
  return {
    id: String(row.id),
    title: row.title as string,
    description: row.description as string,
    status: row.status as TaskBoardItem["status"],
    priority: row.priority as TaskBoardItem["priority"],
    assignedAgent: row.assigned_agent as string | null,
    createdBy: row.created_by as string,
    delegationChain: typeof row.delegation_chain === "string" ? JSON.parse(row.delegation_chain) : (row.delegation_chain as string[]),
    context: row.context as string,
    parentTaskId: row.parent_task_id ? String(row.parent_task_id) : null,
    deadline: row.deadline ? String(row.deadline) : null,
    tags: typeof row.tags === "string" ? JSON.parse(row.tags) : (row.tags as string[]),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    completedAt: row.completed_at ? String(row.completed_at) : null,
  };
}
