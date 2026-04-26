// ---------------------------------------------------------------------------
// Klawhub — A2A (Agent-to-Agent) Real-Time Communication Protocol (Phase 4)
//
// Enables agents to communicate asynchronously, share context, broadcast
// to teams, and collaborate via persistent channels. Uses Supabase as the
// persistence layer with real-time inbox processing.
//
// KEY CAPABILITIES:
// 1. Async message passing (fire-and-forget + response tracking)
// 2. Broadcast to multiple agents or entire team
// 3. Shared context store (versioned key-value with scoped access)
// 4. Collaboration channels (persistent multi-agent conversations)
// 5. Priority inbox with unread tracking
// 6. Correlation IDs for request-response pattern matching
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface A2AMessage {
  id: string;
  fromAgent: string;
  toAgent: string;
  type: "request" | "response" | "broadcast" | "context_share" | "handoff" | "collaboration";
  topic: string;
  payload: Record<string, unknown>;
  timestamp: string;
  status: "pending" | "delivered" | "completed" | "failed";
  priority?: "low" | "normal" | "high" | "urgent";
  correlationId?: string;
  parentMessageId?: string;
  isRead?: boolean;
}

export interface A2AInboxItem {
  id: number;
  fromAgent: string;
  type: string;
  topic: string;
  payload: Record<string, unknown>;
  priority: string;
  createdAt: string;
  correlationId: string | null;
}

export interface A2ASharedContext {
  id: number;
  contextKey: string;
  agentId: string;
  content: Record<string, unknown>;
  contentText: string;
  tags: string[];
  scope: "global" | "project" | "session" | "agent";
  version: number;
  createdAt: string;
}

export interface A2AChannel {
  id: number;
  name: string;
  description: string;
  channelType: string;
  projectId: number | null;
  createdBy: string;
  members: string[];
  isActive: boolean;
  lastMessageAt: string | null;
  messageCount: number;
}

export interface A2AChannelMessage {
  id: number;
  channelId: number;
  agentId: string;
  content: string;
  messageType: string;
  metadata: Record<string, unknown>;
  createdAt: string;
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
// Database helpers — use shared pool from @/lib/db
// ---------------------------------------------------------------------------

import { query as dbQuery } from "@/lib/db";

async function queryDb<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  try {
    const result = await dbQuery(sql, params);
    return result.rows as T[];
  } catch (error) {
    console.error("[A2A] Query failed:", error);
    return [];
  }
}

function parseJsonSafely(val: unknown): Record<string, unknown> {
  if (!val) return {};
  if (typeof val === "object") return val as Record<string, unknown>;
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return {}; }
  }
  return {};
}

function parseArraySafely(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return []; }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Phase 4: Enhanced A2A Message Functions (Priority + Correlation + Read)
// ---------------------------------------------------------------------------

/** Send an A2A message with priority, correlation ID, and parent tracking. */
export async function sendA2AMessage(msg: {
  fromAgent: string;
  toAgent: string;
  type: A2AMessage["type"];
  topic: string;
  payload: Record<string, unknown>;
  priority?: "low" | "normal" | "high" | "urgent";
  correlationId?: string;
  parentMessageId?: number;
}): Promise<A2AMessage | null> {
  try {
    const rows = await queryDb<{
      id: string; from_agent: string; to_agent: string; type: string;
      topic: string; payload: unknown; status: string; priority: string;
      created_at: string; correlation_id: string | null; parent_message_id: number | null; is_read: boolean;
    }>(
      `INSERT INTO a2a_messages (from_agent, to_agent, type, topic, payload, status, priority, correlation_id, parent_message_id)
       VALUES ($1, $2, $3, $4, $5, 'delivered', $6, $7, $8)
       RETURNING id, from_agent, to_agent, type, topic, payload, status, priority, created_at, correlation_id, parent_message_id, is_read`,
      [
        msg.fromAgent, msg.toAgent, msg.type, msg.topic,
        JSON.stringify(msg.payload),
        msg.priority || "normal",
        msg.correlationId || null,
        msg.parentMessageId || null,
      ],
    );

    if (rows.length > 0) {
      const row = rows[0];
      return {
        id: String(row.id),
        fromAgent: row.from_agent,
        toAgent: row.to_agent,
        type: row.type as A2AMessage["type"],
        topic: row.topic,
        payload: parseJsonSafely(row.payload),
        timestamp: row.created_at,
        status: row.status as A2AMessage["status"],
        priority: row.priority as A2AMessage["priority"],
        correlationId: row.correlation_id || undefined,
        parentMessageId: row.parent_message_id ? String(row.parent_message_id) : undefined,
        isRead: row.is_read,
      };
    }
    return null;
  } catch (error) {
    console.error("[A2A] Failed to send message:", error);
    return null;
  }
}

/** Send a response to a specific message (auto-links via parentMessageId + correlationId). */
export async function sendA2AResponse(msg: {
  fromAgent: string;
  toAgent: string;
  topic: string;
  payload: Record<string, unknown>;
  parentMessageId: number;
  correlationId?: string;
  priority?: "low" | "normal" | "high" | "urgent";
}): Promise<A2AMessage | null> {
  return sendA2AMessage({
    ...msg,
    type: "response",
    correlationId: msg.correlationId,
    parentMessageId: msg.parentMessageId,
  });
}

// ---------------------------------------------------------------------------
// Phase 4: Broadcast — send to multiple agents at once
// ---------------------------------------------------------------------------

/** Broadcast a message to multiple agents (or ALL agents if targets is empty). */
export async function broadcastA2AMessage(msg: {
  fromAgent: string;
  targets?: string[];
  topic: string;
  payload: Record<string, unknown>;
  priority?: "low" | "normal" | "high" | "urgent";
  correlationId?: string;
}): Promise<{ sent: number; agents: string[] }> {
  const ALL_AGENTS = ["general", "mail", "code", "data", "creative", "research", "ops"];
  const targets = (msg.targets || ALL_AGENTS).filter(a => a !== msg.fromAgent);

  let sent = 0;
  const successfulAgents: string[] = [];

  // Send all messages in parallel for speed
  const results = await Promise.all(
    targets.map(async (agent) => {
      const result = await sendA2AMessage({
        fromAgent: msg.fromAgent,
        toAgent: agent,
        type: "broadcast",
        topic: msg.topic,
        payload: msg.payload,
        priority: msg.priority || "normal",
        correlationId: msg.correlationId,
      });
      return { agent, success: !!result };
    })
  );

  for (const r of results) {
    if (r.success) {
      sent++;
      successfulAgents.push(r.agent);
    }
  }

  console.log(`[A2A] Broadcast from ${msg.fromAgent} to ${sent}/${targets.length} agents: ${msg.topic.slice(0, 60)}`);
  return { sent, agents: successfulAgents };
}

// ---------------------------------------------------------------------------
// Phase 4: Priority Inbox
// ---------------------------------------------------------------------------

/** Get agent's inbox — unread messages first, sorted by priority, then time. */
export async function getAgentInbox(
  agentId: string,
  limit: number = 50,
): Promise<A2AInboxItem[]> {
  try {
    const rows = await queryDb<{
      id: number; from_agent: string; type: string; topic: string;
      payload: unknown; priority: string; created_at: string; correlation_id: string | null;
    }>(
      `SELECT id, from_agent, type, topic, payload, priority, created_at, correlation_id
       FROM get_agent_inbox($1, $2)`,
      [agentId, limit],
    );

    return rows.map((row) => ({
      id: row.id,
      fromAgent: row.from_agent,
      type: row.type,
      topic: row.topic,
      payload: parseJsonSafely(row.payload),
      priority: row.priority,
      createdAt: row.created_at,
      correlationId: row.correlation_id,
    }));
  } catch (error) {
    console.error("[A2A] Failed to get inbox:", error);
    return [];
  }
}

/** Mark messages as read. Returns count of messages marked. */
export async function markMessagesRead(
  agentId: string,
  messageIds: number[],
): Promise<number> {
  try {
    const rows = await queryDb<{ mark_messages_read: number }>(
      `SELECT mark_messages_read($1, $2::bigint[])`,
      [agentId, messageIds],
    );
    return rows[0]?.mark_messages_read || 0;
  } catch (error) {
    console.error("[A2A] Failed to mark messages read:", error);
    return 0;
  }
}

/** Get unread message count for an agent. */
export async function getUnreadCount(agentId: string): Promise<number> {
  try {
    const rows = await queryDb<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM a2a_messages WHERE to_agent = $1 AND is_read = FALSE`,
      [agentId],
    );
    return parseInt(rows[0]?.count || "0", 10);
  } catch (error) {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Phase 4: Shared Context Store (Versioned)
// ---------------------------------------------------------------------------

/** Store or update shared context (auto-versions). Returns context ID. */
export async function shareContext(ctx: {
  contextKey: string;
  agentId: string;
  content: Record<string, unknown>;
  contentText?: string;
  tags?: string[];
  accessAgents?: string[];
  scope?: "global" | "project" | "session" | "agent";
  projectId?: number;
  sessionId?: string;
}): Promise<number | null> {
  try {
    const rows = await queryDb<{ upsert_shared_context: number }>(
      `SELECT upsert_shared_context($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        ctx.contextKey,
        ctx.agentId,
        JSON.stringify(ctx.content),
        ctx.contentText || "",
        JSON.stringify(ctx.tags || []),
        ctx.accessAgents || [],
        ctx.scope || "project",
        ctx.projectId || null,
        ctx.sessionId || null,
      ],
    );
    const ctxId = rows[0]?.upsert_shared_context;
    if (ctxId) {
      console.log(`[A2A] Context stored: ${ctx.contextKey} v${ctxId} by ${ctx.agentId}`);
    }
    return ctxId || null;
  } catch (error) {
    console.error("[A2A] Failed to share context:", error);
    return null;
  }
}

/** Query shared context by key, scope, or tags. */
export async function queryContext(filters: {
  contextKey?: string;
  agentId?: string;
  scope?: string;
  projectId?: number;
  tags?: string[];
  limit?: number;
}): Promise<A2ASharedContext[]> {
  try {
    let query = `SELECT id, context_key, agent_id, content, content_text, tags, scope, version, created_at
                 FROM a2a_shared_context WHERE is_latest = TRUE`;
    const params: unknown[] = [];

    if (filters.contextKey) {
      params.push(filters.contextKey);
      query += ` AND context_key = $${params.length}`;
    }
    if (filters.agentId) {
      params.push(filters.agentId);
      query += ` AND agent_id = $${params.length}`;
    }
    if (filters.scope) {
      params.push(filters.scope);
      query += ` AND scope = $${params.length}`;
    }
    if (filters.projectId) {
      params.push(filters.projectId);
      query += ` AND project_id = $${params.length}`;
    }
    if (filters.tags && filters.tags.length > 0) {
      params.push(filters.tags);
      query += ` AND tags ?| $${params.length}`;  // postgres array overlap
    }

    query += ` ORDER BY updated_at DESC`;
    if (filters.limit) {
      params.push(filters.limit);
      query += ` LIMIT $${params.length}`;
    }

    const rows = await queryDb<{
      id: number; context_key: string; agent_id: string; content: unknown;
      content_text: string; tags: unknown; scope: string; version: number; created_at: string;
    }>(query, params);

    return rows.map((row) => ({
      id: row.id,
      contextKey: row.context_key,
      agentId: row.agent_id,
      content: parseJsonSafely(row.content),
      contentText: row.content_text,
      tags: parseArraySafely(row.tags),
      scope: row.scope as A2ASharedContext["scope"],
      version: row.version,
      createdAt: row.created_at,
    }));
  } catch (error) {
    console.error("[A2A] Failed to query context:", error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Phase 4: Collaboration Channels
// ---------------------------------------------------------------------------

/** Get or create a collaboration channel. */
export async function getOrCreateChannel(params: {
  name: string;
  channelType?: string;
  projectId?: number;
  members?: string[];
}): Promise<number | null> {
  try {
    const rows = await queryDb<{ get_or_create_channel: number }>(
      `SELECT get_or_create_channel($1, $2, $3, $4)`,
      [
        params.name,
        params.channelType || "project",
        params.projectId || null,
        params.members || [],
      ],
    );
    return rows[0]?.get_or_create_channel || null;
  } catch (error) {
    console.error("[A2A] Failed to get/create channel:", error);
    return null;
  }
}

/** Post a message to a channel. */
export async function postToChannel(channelId: number, msg: {
  agentId: string;
  content: string;
  messageType?: string;
  metadata?: Record<string, unknown>;
}): Promise<number | null> {
  try {
    const rows = await queryDb<{ id: number }>(
      `INSERT INTO a2a_channel_messages (channel_id, agent_id, content, message_type, metadata)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        channelId,
        msg.agentId,
        msg.content,
        msg.messageType || "message",
        JSON.stringify(msg.metadata || {}),
      ],
    );

    // Update channel's last_message_at and message_count
    await queryDb(
      `UPDATE a2a_channels SET last_message_at = NOW(), message_count = message_count + 1, updated_at = NOW() WHERE id = $1`,
      [channelId],
    );

    return rows[0]?.id || null;
  } catch (error) {
    console.error("[A2A] Failed to post to channel:", error);
    return null;
  }
}

/** Get recent messages from a channel. */
export async function getChannelMessages(
  channelId: number,
  limit: number = 50,
): Promise<A2AChannelMessage[]> {
  try {
    const rows = await queryDb<{
      id: number; channel_id: number; agent_id: string; content: string;
      message_type: string; metadata: unknown; created_at: string;
    }>(
      `SELECT id, channel_id, agent_id, content, message_type, metadata, created_at
       FROM a2a_channel_messages WHERE channel_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [channelId, limit],
    );

    return rows.map((row) => ({
      id: row.id,
      channelId: row.channel_id,
      agentId: row.agent_id,
      content: row.content,
      messageType: row.message_type,
      metadata: parseJsonSafely(row.metadata),
      createdAt: row.created_at,
    })).reverse();
  } catch (error) {
    console.error("[A2A] Failed to get channel messages:", error);
    return [];
  }
}

/** Get channels an agent is a member of. */
export async function getAgentChannels(agentId: string): Promise<A2AChannel[]> {
  try {
    const rows = await queryDb<{
      id: number; name: string; description: string; channel_type: string;
      project_id: number | null; created_by: string; members: string[];
      is_active: boolean; last_message_at: string | null; message_count: number;
    }>(
      `SELECT id, name, description, channel_type, project_id, created_by, members,
              is_active, last_message_at, message_count
       FROM a2a_channels
       WHERE is_active = TRUE AND ($1 = ANY(members) OR created_by = $1)
       ORDER BY last_message_at DESC NULLS LAST`,
      [agentId],
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      channelType: row.channel_type,
      projectId: row.project_id,
      createdBy: row.created_by,
      members: parseArraySafely(row.members),
      isActive: row.is_active,
      lastMessageAt: row.last_message_at,
      messageCount: row.message_count,
    }));
  } catch (error) {
    console.error("[A2A] Failed to get agent channels:", error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Legacy A2A Message Functions (backwards compat — kept for existing code)
// ---------------------------------------------------------------------------

/** Get messages between two agents. */
export async function getA2AMessages(
  agent1: string,
  agent2: string,
  limit: number = 50,
): Promise<A2AMessage[]> {
  try {
    const rows = await queryDb<{
      id: string; from_agent: string; to_agent: string; type: string;
      topic: string; payload: unknown; status: string; priority: string;
      created_at: string; correlation_id: string | null; is_read: boolean;
    }>(
      `SELECT id, from_agent, to_agent, type, topic, payload, status, priority, created_at, correlation_id, is_read
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
      payload: parseJsonSafely(row.payload),
      timestamp: row.created_at,
      status: row.status as A2AMessage["status"],
      priority: row.priority as A2AMessage["priority"],
      correlationId: row.correlation_id || undefined,
      isRead: row.is_read,
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
    const rows = await queryDb<{
      id: string; from_agent: string; to_agent: string; type: string;
      topic: string; payload: unknown; status: string; priority: string;
      created_at: string; correlation_id: string | null; is_read: boolean;
    }>(
      `SELECT id, from_agent, to_agent, type, topic, payload, status, priority, created_at, correlation_id, is_read
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
      payload: parseJsonSafely(row.payload),
      timestamp: row.created_at,
      status: row.status as A2AMessage["status"],
      priority: row.priority as A2AMessage["priority"],
      correlationId: row.correlation_id || undefined,
      isRead: row.is_read,
    })).reverse();
  } catch (error) {
    console.error("[A2A] Failed to get agent messages:", error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Legacy A2A Task Functions
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
    const rows = await queryDb<{
      id: string; initiator_agent: string; assigned_agent: string; task: string;
      context: string; status: string; delegation_chain: unknown; created_at: string;
    }>(
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
        delegationChain: parseArraySafely(row.delegation_chain),
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
      delegationChain: parseArraySafely(row.delegation_chain),
    }));
  } catch (error) {
    console.error("[A2A] Failed to get tasks:", error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Agent Handoff Protocol (enhanced with priority)
// ---------------------------------------------------------------------------

export async function sendAgentHandoff(handoff: AgentHandoff): Promise<{
  messageId: string | null;
  taskId: string | null;
}> {
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
    priority: handoff.priority === "high" ? "urgent" : handoff.priority === "medium" ? "normal" : "low",
  });

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

// ---------------------------------------------------------------------------
// Phase 4: Maintenance — Expire old messages
// ---------------------------------------------------------------------------

/** Run the expiration function to clean up old messages. */
export async function expireOldMessages(): Promise<void> {
  try {
    await queryDb(`SELECT expire_old_a2a_messages()`);
    console.log("[A2A] Expired old messages");
  } catch (error) {
    console.error("[A2A] Failed to expire messages:", error);
  }
}
