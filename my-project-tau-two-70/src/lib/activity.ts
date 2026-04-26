// ---------------------------------------------------------------------------
// Klawhub — Phase 2: Activity & Status Data Access Layer
// Uses raw pg Pool (same pattern as workspace.ts)
// ---------------------------------------------------------------------------

import { query } from "@/lib/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActivityEvent {
  id: number;
  agent_id: string;
  agent_name: string | null;
  action: string;
  detail: string;
  tool_name: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface AgentStatusDB {
  agent_id: string;
  status: string;
  current_task: string | null;
  last_activity: string | null;
  tasks_completed: number;
  messages_processed: number;
  updated_at: string;
}

export interface DashboardMetrics {
  messagesToday: number;
  toolCallsToday: number;
  tasksDone: number;
  activeDelegations: number;
}

// ---------------------------------------------------------------------------
// logActivity — Fire-and-forget activity logging
// ---------------------------------------------------------------------------

export async function logActivity(opts: {
  agentId: string;
  agentName?: string;
  action: string;
  detail: string;
  toolName?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!process.env.SUPABASE_DB_URL) return;

  try {
    await query(
      `INSERT INTO agent_activity (agent_id, agent_name, action, detail, tool_name, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        opts.agentId,
        opts.agentName || null,
        opts.action,
        opts.detail || "",
        opts.toolName || null,
        JSON.stringify(opts.metadata || {}),
      ],
    );
  } catch (err) {
    console.warn("[Activity] Failed to log activity:", err);
  }
}

// ---------------------------------------------------------------------------
// getRecentActivity — Fetch recent activity events
// ---------------------------------------------------------------------------

export async function getRecentActivity(limit = 50): Promise<ActivityEvent[]> {
  if (!process.env.SUPABASE_DB_URL) return [];

  try {
    const result = await query(
      `SELECT id, agent_id, agent_name, action, detail, tool_name, metadata, created_at
       FROM agent_activity
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    );
    return result.rows.map(rowToActivityEvent);
  } catch (err) {
    console.warn("[Activity] Failed to fetch recent activity:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// persistAgentStatus — Upsert agent status to DB
// Uses INSERT ... ON CONFLICT for atomic upsert
// ---------------------------------------------------------------------------

export async function persistAgentStatus(
  agentId: string,
  update: {
    status?: string;
    currentTask?: string | null;
    lastActivity?: string | null;
    tasksCompleted?: number;
    messagesProcessed?: number;
  },
): Promise<void> {
  if (!process.env.SUPABASE_DB_URL) return;

  try {
    await query(
      `INSERT INTO agent_status (agent_id, status, current_task, last_activity, tasks_completed, messages_processed, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (agent_id) DO UPDATE SET
         status = EXCLUDED.status,
         current_task = EXCLUDED.current_task,
         last_activity = EXCLUDED.last_activity,
         tasks_completed = agent_status.tasks_completed + EXCLUDED.tasks_completed,
         messages_processed = agent_status.messages_processed + EXCLUDED.messages_processed,
         updated_at = NOW()`,
      [
        agentId,
        update.status || "idle",
        update.currentTask ?? null,
        update.lastActivity ?? null,
        update.tasksCompleted ?? 0,
        update.messagesProcessed ?? 0,
      ],
    );
  } catch (err) {
    console.warn("[Activity] Failed to persist agent status:", err);
  }
}

// ---------------------------------------------------------------------------
// getAllPersistedStatuses — Get all agent statuses from DB
// ---------------------------------------------------------------------------

export async function getAllPersistedStatuses(): Promise<Record<string, AgentStatusDB>> {
  if (!process.env.SUPABASE_DB_URL) return {};

  try {
    const result = await query(
      `SELECT agent_id, status, current_task, last_activity, tasks_completed, messages_processed, updated_at
       FROM agent_status
       ORDER BY agent_id`,
    );
    const map: Record<string, AgentStatusDB> = {};
    for (const row of result.rows) {
      map[row.agent_id] = rowToAgentStatus(row);
    }
    return map;
  } catch (err) {
    console.warn("[Activity] Failed to fetch agent statuses:", err);
    return {};
  }
}

// ---------------------------------------------------------------------------
// getDashboardMetrics — Aggregated metrics for the Metrics Row
// ---------------------------------------------------------------------------

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  if (!process.env.SUPABASE_DB_URL) {
    return { messagesToday: 0, toolCallsToday: 0, tasksDone: 0, activeDelegations: 0 };
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Messages today (chat_message action from today)
    const messagesResult = await query(
      `SELECT COUNT(*) as count FROM agent_activity
       WHERE action IN ('chat_message', 'status_change')
         AND created_at >= $1`,
      [today.toISOString()],
    );

    // Tool calls today
    const toolCallsResult = await query(
      `SELECT COUNT(*) as count FROM agent_activity
       WHERE action = 'tool_call'
         AND created_at >= $1`,
      [today.toISOString()],
    );

    // Tasks done (from agent_status, sum tasks_completed)
    const tasksResult = await query(
      `SELECT COALESCE(SUM(tasks_completed), 0) as count FROM agent_status`,
    );

    // Active delegations (agents currently busy)
    const delegationsResult = await query(
      `SELECT COUNT(*) as count FROM agent_status WHERE status = 'busy'`,
    );

    return {
      messagesToday: parseInt(messagesResult.rows[0]?.count || "0", 10),
      toolCallsToday: parseInt(toolCallsResult.rows[0]?.count || "0", 10),
      tasksDone: parseInt(tasksResult.rows[0]?.count || "0", 10),
      activeDelegations: parseInt(delegationsResult.rows[0]?.count || "0", 10),
    };
  } catch (err) {
    console.warn("[Activity] Failed to fetch dashboard metrics:", err);
    return { messagesToday: 0, toolCallsToday: 0, tasksDone: 0, activeDelegations: 0 };
  }
}

// ---------------------------------------------------------------------------
// Row Converters
// ---------------------------------------------------------------------------

function rowToActivityEvent(row: Record<string, unknown>): ActivityEvent {
  return {
    id: Number(row.id),
    agent_id: row.agent_id as string,
    agent_name: row.agent_name as string | null,
    action: row.action as string,
    detail: row.detail as string,
    tool_name: row.tool_name as string | null,
    metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : (row.metadata as Record<string, unknown> | null),
    created_at: row.created_at as string,
  };
}

function rowToAgentStatus(row: Record<string, unknown>): AgentStatusDB {
  return {
    agent_id: row.agent_id as string,
    status: row.status as string,
    current_task: row.current_task as string | null,
    last_activity: row.last_activity as string | null,
    tasks_completed: Number(row.tasks_completed || 0),
    messages_processed: Number(row.messages_processed || 0),
    updated_at: row.updated_at as string,
  };
}
