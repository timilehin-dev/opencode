// ---------------------------------------------------------------------------
// Claw — A2A (Agent-to-Agent) Communication Protocol
//
// Enables agents to communicate, share context, and collaborate.
// Uses Supabase as the persistence layer for messages and tasks.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface A2AMessage {
  id: string;
  fromAgent: string;
  toAgent: string;
  type: "request" | "response" | "broadcast" | "context_share";
  topic: string;
  payload: Record<string, unknown>;
  timestamp: string;
  status: "pending" | "delivered" | "completed" | "failed";
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
// Database helpers (using pg directly for performance)
// ---------------------------------------------------------------------------

function getPgPool() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool } = require('pg');
    const connectionString = process.env.SUPABASE_DB_URL;
    if (!connectionString) return null;
    return new Pool({ connectionString });
  } catch {
    return null;
  }
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
  const pool = getPgPool();
  if (!pool) return null;

  try {
    const result = await pool.query(
      `INSERT INTO a2a_messages (from_agent, to_agent, type, topic, payload, status)
       VALUES ($1, $2, $3, $4, $5, 'delivered')
       RETURNING id, from_agent, to_agent, type, topic, payload, status, created_at`,
      [msg.fromAgent, msg.toAgent, msg.type, msg.topic, JSON.stringify(msg.payload)]
    );

    await pool.end();

    if (result.rows.length > 0) {
      const row = result.rows[0];
      return {
        id: String(row.id),
        fromAgent: row.from_agent,
        toAgent: row.to_agent,
        type: row.type,
        topic: row.topic,
        payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
        timestamp: row.created_at,
        status: row.status,
      };
    }
    return null;
  } catch (error) {
    console.error('[A2A] Failed to send message:', error);
    return null;
  }
}

/** Get messages between two agents. */
export async function getA2AMessages(
  agent1: string,
  agent2: string,
  limit: number = 50,
): Promise<A2AMessage[]> {
  const pool = getPgPool();
  if (!pool) return [];

  try {
    const result = await pool.query(
      `SELECT id, from_agent, to_agent, type, topic, payload, status, created_at
       FROM a2a_messages
       WHERE (from_agent = $1 AND to_agent = $2) OR (from_agent = $2 AND to_agent = $1)
       ORDER BY created_at DESC
       LIMIT $3`,
      [agent1, agent2, limit]
    );

    await pool.end();

    return result.rows.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      fromAgent: row.from_agent as string,
      toAgent: row.to_agent as string,
      type: row.type as A2AMessage["type"],
      topic: row.topic as string,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : (row.payload as Record<string, unknown>),
      timestamp: row.created_at as string,
      status: row.status as A2AMessage["status"],
    })).reverse();
  } catch (error) {
    console.error('[A2A] Failed to get messages:', error);
    return [];
  }
}

/** Get all messages for a specific agent. */
export async function getAgentA2AMessages(
  agentId: string,
  limit: number = 50,
): Promise<A2AMessage[]> {
  const pool = getPgPool();
  if (!pool) return [];

  try {
    const result = await pool.query(
      `SELECT id, from_agent, to_agent, type, topic, payload, status, created_at
       FROM a2a_messages
       WHERE from_agent = $1 OR to_agent = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [agentId, limit]
    );

    await pool.end();

    return result.rows.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      fromAgent: row.from_agent as string,
      toAgent: row.to_agent as string,
      type: row.type as A2AMessage["type"],
      topic: row.topic as string,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : (row.payload as Record<string, unknown>),
      timestamp: row.created_at as string,
      status: row.status as A2AMessage["status"],
    })).reverse();
  } catch (error) {
    console.error('[A2A] Failed to get agent messages:', error);
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
  const pool = getPgPool();
  if (!pool) return null;

  try {
    const result = await pool.query(
      `INSERT INTO a2a_tasks (initiator_agent, assigned_agent, task, context, status, delegation_chain)
       VALUES ($1, $2, $3, $4, 'pending', $5)
       RETURNING id, initiator_agent, assigned_agent, task, context, status, delegation_chain, created_at`,
      [
        task.initiatorAgent,
        task.assignedAgent,
        task.task,
        task.context || '',
        JSON.stringify(task.delegationChain || [task.initiatorAgent, task.assignedAgent])
      ]
    );

    await pool.end();

    if (result.rows.length > 0) {
      const row = result.rows[0];
      return {
        id: String(row.id),
        initiatorAgent: row.initiator_agent,
        assignedAgent: row.assigned_agent,
        task: row.task,
        context: row.context,
        status: row.status,
        createdAt: row.created_at,
        delegationChain: typeof row.delegation_chain === 'string' ? JSON.parse(row.delegation_chain) : row.delegation_chain,
      };
    }
    return null;
  } catch (error) {
    console.error('[A2A] Failed to create task:', error);
    return null;
  }
}

/** Update an A2A task status. */
export async function updateA2ATaskStatus(
  taskId: string,
  status: A2ATask["status"],
  result?: string,
): Promise<boolean> {
  const pool = getPgPool();
  if (!pool) return false;

  try {
    const numId = parseInt(taskId.split('-').pop() || '0', 10);
    if (isNaN(numId)) return false;

    if (status === 'completed') {
      await pool.query(
        `UPDATE a2a_tasks SET status = $1, result = $2, completed_at = NOW() WHERE id = $3`,
        [status, result || null, numId]
      );
    } else {
      await pool.query(
        `UPDATE a2a_tasks SET status = $1, result = $2 WHERE id = $3`,
        [status, result || null, numId]
      );
    }

    await pool.end();
    return true;
  } catch (error) {
    console.error('[A2A] Failed to update task:', error);
    return false;
  }
}

/** Get A2A tasks for an agent. */
export async function getAgentA2ATasks(
  agentId: string,
  status?: A2ATask["status"],
  limit: number = 20,
): Promise<A2ATask[]> {
  const pool = getPgPool();
  if (!pool) return [];

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

    const result = await pool.query(query, params);
    await pool.end();

    return result.rows.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      initiatorAgent: row.initiator_agent as string,
      assignedAgent: row.assigned_agent as string,
      task: row.task as string,
      context: row.context as string,
      status: row.status as A2ATask["status"],
      result: row.result as string | undefined,
      createdAt: row.created_at as string,
      completedAt: row.completed_at as string | undefined,
      delegationChain: typeof row.delegation_chain === 'string' ? JSON.parse(row.delegation_chain) : (row.delegation_chain as string[]),
    }));
  } catch (error) {
    console.error('[A2A] Failed to get tasks:', error);
    return [];
  }
}
