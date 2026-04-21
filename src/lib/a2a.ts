// ---------------------------------------------------------------------------
// Claw — A2A (Agent-to-Agent) Communication Protocol
//
// Enables agents to communicate, share context, and collaborate.
// Uses Supabase as the persistence layer for messages and tasks.
//
// HANDOFF PROTOCOL:
// When an agent hands off a task to another agent, use the standard format:
// {
//   from: "general",
//   to: "mail",
//   task: "Send follow-up email to client",
//   context: "Client asked about pricing. Here's the email thread...",
//   priority: "high" | "medium" | "low",
//   deadline: "2026-04-19T09:00:00Z",
//   callback: true  // send results back to general when done
// }
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface A2AMessage {
  id: string;
  fromAgent: string;
  toAgent: string;
  type: "request" | "response" | "broadcast" | "context_share" | "handoff";
  topic: string;
  payload: Record<string, unknown>;
  timestamp: string;
  status: "pending" | "delivered" | "completed" | "failed";
}

export interface AgentHandoff {
  from: string;
  to: string;
  task: string;
  context: string;
  priority: "high" | "medium" | "low";
  deadline?: string;
  callback: boolean;
}

export interface A2ATask {
  id: string;
  initiatorAgent: string;
  assignedAgent: string;
  task: string;
  context: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  result?: string;
  createdAt: string;
  completedAt?: string;
  delegationChain: string[];
}

// ---------------------------------------------------------------------------
// Database helpers — module-level singleton pool with proper config
// (H5 fix: no more pool-per-call, no connection leaks)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Pool } = require("pg");

let _a2aPool: ReturnType<typeof Pool> | null = null;

function getA2APool(): ReturnType<typeof Pool> | null {
  if (_a2aPool) return _a2aPool;
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.warn("[A2A] SUPABASE_DB_URL not configured — A2A features disabled");
    return null;
  }
  _a2aPool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 10000,
  });

  // Handle pool errors (prevent crashes)
  _a2aPool.on("error", (err: Error) => {
    console.error("[A2A] Unexpected pool error:", err.message);
  });

  return _a2aPool;
}

// Execute a query with automatic error handling — never leaks connections
async function queryDb<T>(sql: string, params: unknown[]): Promise<T[]> {
  const pool = getA2APool();
  if (!pool) return [];
  const result = await pool.query(sql, params);
  return result.rows as T[];
}

// ---------------------------------------------------------------------------
// A2A Message Functions
// ---------------------------------------------------------------------------

/** Send an A2A message between agents. */
export async function sendA2AMessage(msg: {
  fromAgent: string;
  toAgent: string;
  type: A2AMessage["type"];
  topic: string;
  payload: Record<string, unknown>;
}): Promise<A2AMessage | null> {
  try {
    const rows = await queryDb<{ id: string; from_agent: string; to_agent: string; type: string; topic: string; payload: unknown; status: string; created_at: string }>(
      `INSERT INTO a2a_messages (from_agent, to_agent, type, topic, payload, status)
       VALUES ($1, $2, $3, $4, $5, 'delivered')
       RETURNING id, from_agent, to_agent, type, topic, payload, status, created_at`,
      [msg.fromAgent, msg.toAgent, msg.type, msg.topic, JSON.stringify(msg.payload)],
    );

    if (rows.length > 0) {
      const row = rows[0];
      return {
        id: String(row.id),
        fromAgent: row.from_agent,
        toAgent: row.to_agent,
        type: row.type as A2AMessage["type"],
        topic: row.topic,
        payload: typeof row.payload === "string" ? JSON.parse(row.payload) : (row.payload as Record<string, unknown>),
        timestamp: row.created_at,
        status: row.status as A2AMessage["status"],
      };
    }
    return null;
  } catch (error) {
    console.error("[A2A] Failed to send message:", error);
    return null;
  }
}

/** Get messages between two agents. */
export async function getA2AMessages(
  agent1: string,
  agent2: string,
  limit: number = 50,
): Promise<A2AMessage[]> {
  try {
    const rows = await queryDb<{ id: string; from_agent: string; to_agent: string; type: string; topic: string; payload: unknown; status: string; created_at: string }>(
      `SELECT id, from_agent, to_agent, type, topic, payload, status, created_at
       FROM a2a_messages
       WHERE (from_agent = $1 AND to_agent = $2) OR (from_agent = $2 AND to_agent = $1)
       ORDER BY created_at DESC
       LIMIT $3`,
      [agent1, agent2, limit],
    );

    return rows.map((row) => ({
      id: String(row.id),
      fromAgent: row.from_agent,
      toAgent: row.to_agent,
      type: row.type as A2AMessage["type"],
      topic: row.topic,
      payload: typeof row.payload === "string" ? JSON.parse(row.payload) : (row.payload as Record<string, unknown>),
      timestamp: row.created_at,
      status: row.status as A2AMessage["status"],
    })).reverse();
  } catch (error) {
    console.error("[A2A] Failed to get messages:", error);
    return [];
  }
}

/** Get all messages for a specific agent. */
export async function getAgentA2AMessages(
  agentId: string,
  limit: number = 50,
): Promise<A2AMessage[]> {
  try {
    const rows = await queryDb<{ id: string; from_agent: string; to_agent: string; type: string; topic: string; payload: unknown; status: string; created_at: string }>(
      `SELECT id, from_agent, to_agent, type, topic, payload, status, created_at
       FROM a2a_messages
       WHERE from_agent = $1 OR to_agent = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [agentId, limit],
    );

    return rows.map((row) => ({
      id: String(row.id),
      fromAgent: row.from_agent,
      toAgent: row.to_agent,
      type: row.type as A2AMessage["type"],
      topic: row.topic,
      payload: typeof row.payload === "string" ? JSON.parse(row.payload) : (row.payload as Record<string, unknown>),
      timestamp: row.created_at,
      status: row.status as A2AMessage["status"],
    })).reverse();
  } catch (error) {
    console.error("[A2A] Failed to get agent messages:", error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// A2A Task Functions
// ---------------------------------------------------------------------------

/** Create a new A2A delegation task. */
export async function createA2ATask(task: {
  initiatorAgent: string;
  assignedAgent: string;
  task: string;
  context?: string;
  delegationChain?: string[];
}): Promise<A2ATask | null> {
  try {
    const rows = await queryDb<{ id: string; initiator_agent: string; assigned_agent: string; task: string; context: string; status: string; delegation_chain: unknown; created_at: string }>(
      `INSERT INTO a2a_tasks (initiator_agent, assigned_agent, task, context, status, delegation_chain)
       VALUES ($1, $2, $3, $4, 'pending', $5)
       RETURNING id, initiator_agent, assigned_agent, task, context, status, delegation_chain, created_at`,
      [
        task.initiatorAgent,
        task.assignedAgent,
        task.task,
        task.context || "",
        JSON.stringify(task.delegationChain || [task.initiatorAgent, task.assignedAgent]),
      ],
    );

    if (rows.length > 0) {
      const row = rows[0];
      return {
        id: String(row.id),
        initiatorAgent: row.initiator_agent,
        assignedAgent: row.assigned_agent,
        task: row.task,
        context: row.context,
        status: row.status as A2ATask["status"],
        createdAt: row.created_at,
        delegationChain: typeof row.delegation_chain === "string" ? JSON.parse(row.delegation_chain) : (row.delegation_chain as string[]),
      };
    }
    return null;
  } catch (error) {
    console.error("[A2A] Failed to create task:", error);
    return null;
  }
}

/** Update an A2A task status. */
export async function updateA2ATaskStatus(
  taskId: string,
  status: A2ATask["status"],
  result?: string,
): Promise<boolean> {
  try {
    const numId = parseInt(taskId.split("-").pop() || "0", 10);
    if (isNaN(numId)) return false;

    if (status === "completed") {
      await queryDb(
        `UPDATE a2a_tasks SET status = $1, result = $2, completed_at = NOW() WHERE id = $3`,
        [status, result || null, numId],
      );
    } else {
      await queryDb(
        `UPDATE a2a_tasks SET status = $1, result = $2 WHERE id = $3`,
        [status, result || null, numId],
      );
    }
    return true;
  } catch (error) {
    console.error("[A2A] Failed to update task:", error);
    return false;
  }
}

/** Get A2A tasks for an agent. */
export async function getAgentA2ATasks(
  agentId: string,
  status?: A2ATask["status"],
  limit: number = 20,
): Promise<A2ATask[]> {
  try {
    let query = `SELECT * FROM a2a_tasks WHERE initiator_agent = $1 OR assigned_agent = $1`;
    const params: (string | number)[] = [agentId];

    if (status) {
      query += ` AND status = $2`;
      params.push(status);
      query += ` ORDER BY created_at DESC LIMIT $3`;
      params.push(limit);
    } else {
      query += ` ORDER BY created_at DESC LIMIT $2`;
      params.push(limit);
    }

    const rows = await queryDb<Record<string, unknown>>(query, params);

    return rows.map((row) => ({
      id: String(row.id),
      initiatorAgent: row.initiator_agent as string,
      assignedAgent: row.assigned_agent as string,
      task: row.task as string,
      context: row.context as string,
      status: row.status as A2ATask["status"],
      result: row.result as string | undefined,
      createdAt: row.created_at as string,
      completedAt: row.completed_at as string | undefined,
      delegationChain: typeof row.delegation_chain === "string" ? JSON.parse(row.delegation_chain) : (row.delegation_chain as string[]),
    }));
  } catch (error) {
    console.error("[A2A] Failed to get tasks:", error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Agent Handoff Protocol — Standard task handoff between agents
// ---------------------------------------------------------------------------

/**
 * Send a structured handoff from one agent to another.
 * Creates both an A2A message (type: "handoff") and an A2A task.
 * If callback=true, the receiving agent is expected to send results back.
 */
export async function sendAgentHandoff(handoff: AgentHandoff): Promise<{
  messageId: string | null;
  taskId: string | null;
}> {
  // Send handoff message
  const msg = await sendA2AMessage({
    fromAgent: handoff.from,
    toAgent: handoff.to,
    type: "handoff",
    topic: handoff.task,
    payload: {
      task: handoff.task,
      context: handoff.context,
      priority: handoff.priority,
      deadline: handoff.deadline || null,
      callback: handoff.callback,
    },
  });

  // Create a task for tracking
  const task = await createA2ATask({
    initiatorAgent: handoff.from,
    assignedAgent: handoff.to,
    task: handoff.task,
    context: handoff.context,
    delegationChain: [handoff.from, handoff.to],
  });

  console.log(`[A2A] Handoff: ${handoff.from} -> ${handoff.to}: ${handoff.task.slice(0, 80)}... (priority: ${handoff.priority})`);

  return {
    messageId: msg?.id || null,
    taskId: task?.id || null,
  };
}
