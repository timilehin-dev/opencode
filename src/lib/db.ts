// ---------------------------------------------------------------------------
// Claw Analytics — SQLite-backed persistence for analytics, automations,
// and conversation history. Uses better-sqlite3 for synchronous access
// in serverless environments.
// ---------------------------------------------------------------------------

import Database from "better-sqlite3";
import { join } from "path";

// ---------------------------------------------------------------------------
// Singleton DB connection
// ---------------------------------------------------------------------------

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  const dbPath = process.env.DATABASE_URL
    ? process.env.DATABASE_URL.replace("file:", "")
    : join(process.cwd(), "db", "analytics.db");

  _db = new Database(dbPath, { verbose: process.env.NODE_ENV === "development" ? console.log : undefined });
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  initSchema(_db);
  return _db;
}

export function getDbInstance(): Database.Database {
  return getDb();
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

function initSchema(db: Database.Database) {
  db.exec(`
    -- Analytics events (chat messages, tool calls, etc.)
    CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,           -- 'chat_message' | 'tool_call' | 'agent_switch' | 'page_view'
      agent_id TEXT NOT NULL,
      agent_name TEXT,
      data TEXT DEFAULT '{}',       -- JSON blob with event-specific data
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Agent conversation history (persistent across sessions)
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,     -- UUID per chat session
      agent_id TEXT NOT NULL,
      role TEXT NOT NULL,           -- 'user' | 'assistant' | 'system'
      content TEXT NOT NULL,
      tool_calls TEXT,              -- JSON array of tool call data
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Automation rules
    CREATE TABLE IF NOT EXISTS automations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      trigger_type TEXT NOT NULL,   -- 'schedule' | 'event' | 'manual'
      trigger_config TEXT NOT NULL DEFAULT '{}', -- JSON: cron expression or event config
      action_type TEXT NOT NULL,    -- 'agent_task' | 'notification' | 'webhook'
      action_config TEXT NOT NULL DEFAULT '{}',  -- JSON: what to do
      agent_id TEXT,                -- which agent to use (if applicable)
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at TEXT,
      last_status TEXT,             -- 'success' | 'error' | null
      run_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Automation execution history
    CREATE TABLE IF NOT EXISTS automation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      automation_id INTEGER NOT NULL,
      status TEXT NOT NULL,         -- 'running' | 'success' | 'error'
      result TEXT DEFAULT '{}',     -- JSON: execution result
      duration_ms INTEGER,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE
    );

    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics_events(type, created_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_agent ON analytics_events(agent_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id, agent_id);
    CREATE INDEX IF NOT EXISTS idx_automations_enabled ON automations(enabled);
    CREATE INDEX IF NOT EXISTS idx_automation_logs_time ON automation_logs(created_at);
  `);
}

// ---------------------------------------------------------------------------
// Analytics — Event Tracking
// ---------------------------------------------------------------------------

export function trackEvent(event: {
  type: string;
  agentId: string;
  agentName?: string;
  data?: Record<string, unknown>;
}) {
  const db = getDb();
  db.prepare(
    `INSERT INTO analytics_events (type, agent_id, agent_name, data) VALUES (?, ?, ?, ?)`
  ).run(event.type, event.agentId, event.agentName || null, JSON.stringify(event.data || {}));
}

// ---------------------------------------------------------------------------
// Analytics — Queries
// ---------------------------------------------------------------------------

export interface AnalyticsSummary {
  totalMessages: number;
  totalToolCalls: number;
  agentUsage: { agentId: string; agentName: string; messages: number; toolCalls: number }[];
  recentActivity: { type: string; agentId: string; agentName: string; data: Record<string, unknown>; createdAt: string }[];
  dailyMessageCounts: { date: string; count: number }[];
  toolUsage: { toolName: string; count: number }[];
}

export function getAnalyticsSummary(days: number = 7): AnalyticsSummary {
  const db = getDb();
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const totalMessages = (
    db.prepare(`SELECT COUNT(*) as c FROM analytics_events WHERE type = 'chat_message' AND created_at >= ?`).get(since) as { c: number }
  ).c;

  const totalToolCalls = (
    db.prepare(`SELECT COUNT(*) as c FROM analytics_events WHERE type = 'tool_call' AND created_at >= ?`).get(since) as { c: number }
  ).c;

  // Agent usage breakdown
  const agentUsage = db.prepare(`
    SELECT agent_id as agentId, agent_name as agentName,
      SUM(CASE WHEN type = 'chat_message' THEN 1 ELSE 0 END) as messages,
      SUM(CASE WHEN type = 'tool_call' THEN 1 ELSE 0 END) as toolCalls
    FROM analytics_events
    WHERE created_at >= ?
    GROUP BY agent_id
    ORDER BY messages DESC
  `).all(since) as { agentId: string; agentName: string; messages: number; toolCalls: number }[];

  // Recent activity (last 50)
  const recentActivity = db.prepare(`
    SELECT type, agent_id as agentId, agent_name as agentName, data, created_at as createdAt
    FROM analytics_events
    ORDER BY created_at DESC
    LIMIT 50
  `).all().map((row: unknown) => {
    const r = row as Record<string, unknown>;
    return {
      ...r,
      data: typeof r.data === "string" ? JSON.parse(r.data) : r.data,
    };
  }) as AnalyticsSummary["recentActivity"];

  // Daily message counts
  const dailyMessageCounts = db.prepare(`
    SELECT DATE(created_at) as date, COUNT(*) as count
    FROM analytics_events
    WHERE type = 'chat_message' AND created_at >= ?
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `).all(since) as { date: string; count: number }[];

  // Tool usage
  const toolUsage = db.prepare(`
    SELECT json_extract(data, '$.toolName') as toolName, COUNT(*) as count
    FROM analytics_events
    WHERE type = 'tool_call' AND created_at >= ?
    GROUP BY toolName
    ORDER BY count DESC
    LIMIT 15
  `).all(since) as { toolName: string; count: number }[];

  return { totalMessages, totalToolCalls, agentUsage, recentActivity, dailyMessageCounts, toolUsage };
}

// ---------------------------------------------------------------------------
// Conversation History
// ---------------------------------------------------------------------------

export function saveConversationMessage(msg: {
  sessionId: string;
  agentId: string;
  role: string;
  content: string;
  toolCalls?: unknown[];
}) {
  const db = getDb();
  db.prepare(
    `INSERT INTO conversations (session_id, agent_id, role, content, tool_calls) VALUES (?, ?, ?, ?, ?)`
  ).run(
    msg.sessionId,
    msg.agentId,
    msg.role,
    msg.content,
    msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
  );
}

export function getConversationHistory(sessionId: string, agentId: string, limit: number = 50) {
  const db = getDb();
  return db.prepare(
    `SELECT role, content, tool_calls as toolCalls, created_at as createdAt
     FROM conversations
     WHERE session_id = ? AND agent_id = ?
     ORDER BY created_at ASC
     LIMIT ?`
  ).all(sessionId, agentId, limit) as {
    role: string;
    content: string;
    toolCalls: string | null;
    createdAt: string;
  }[];
}

// ---------------------------------------------------------------------------
// Automations
// ---------------------------------------------------------------------------

export interface Automation {
  id: number;
  name: string;
  description: string;
  triggerType: "schedule" | "event" | "manual";
  triggerConfig: Record<string, unknown>;
  actionType: string;
  actionConfig: Record<string, unknown>;
  agentId: string | null;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  runCount: number;
  createdAt: string;
  updatedAt: string;
}

export function createAutomation(data: {
  name: string;
  description?: string;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  actionType: string;
  actionConfig: Record<string, unknown>;
  agentId?: string;
}): Automation {
  const db = getDb();
  const result = db.prepare(
    `INSERT INTO automations (name, description, trigger_type, trigger_config, action_type, action_config, agent_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    data.name,
    data.description || "",
    data.triggerType,
    JSON.stringify(data.triggerConfig),
    data.actionType,
    JSON.stringify(data.actionConfig),
    data.agentId || null,
  );
  return getAutomation(result.lastInsertRowid as number)!;
}

export function getAutomation(id: number): Automation | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM automations WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return automationFromRow(row);
}

export function getAllAutomations(): Automation[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM automations ORDER BY created_at DESC`).all() as Record<string, unknown>[];
  return rows.map(automationFromRow);
}

export function updateAutomation(id: number, data: Partial<{
  name: string;
  description: string;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  actionType: string;
  actionConfig: Record<string, unknown>;
  agentId: string;
  enabled: boolean;
}>): Automation | null {
  const db = getDb();
  const existing = getAutomation(id);
  if (!existing) return null;

  const sets: string[] = [];
  const values: unknown[] = [];

  if (data.name !== undefined) { sets.push("name = ?"); values.push(data.name); }
  if (data.description !== undefined) { sets.push("description = ?"); values.push(data.description); }
  if (data.triggerType !== undefined) { sets.push("trigger_type = ?"); values.push(data.triggerType); }
  if (data.triggerConfig !== undefined) { sets.push("trigger_config = ?"); values.push(JSON.stringify(data.triggerConfig)); }
  if (data.actionType !== undefined) { sets.push("action_type = ?"); values.push(data.actionType); }
  if (data.actionConfig !== undefined) { sets.push("action_config = ?"); values.push(JSON.stringify(data.actionConfig)); }
  if (data.agentId !== undefined) { sets.push("agent_id = ?"); values.push(data.agentId); }
  if (data.enabled !== undefined) { sets.push("enabled = ?"); values.push(data.enabled ? 1 : 0); }

  if (sets.length === 0) return existing;

  sets.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE automations SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  return getAutomation(id);
}

export function deleteAutomation(id: number): boolean {
  const db = getDb();
  const result = db.prepare(`DELETE FROM automations WHERE id = ?`).run(id);
  return result.changes > 0;
}

// Record an automation execution
export function logAutomationRun(data: {
  automationId: number;
  status: "running" | "success" | "error";
  result?: Record<string, unknown>;
  durationMs?: number;
  errorMessage?: string;
}) {
  const db = getDb();
  db.prepare(
    `INSERT INTO automation_logs (automation_id, status, result, duration_ms, error_message)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    data.automationId,
    data.status,
    JSON.stringify(data.result || {}),
    data.durationMs || null,
    data.errorMessage || null,
  );

  // Update the automation's last run info
  if (data.status === "success" || data.status === "error") {
    db.prepare(`
      UPDATE automations
      SET last_run_at = datetime('now'),
          last_status = ?,
          run_count = run_count + 1,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(data.status, data.automationId);
  }
}

export function getAutomationLogs(automationId?: number, limit: number = 20) {
  const db = getDb();
  if (automationId) {
    return db.prepare(
      `SELECT * FROM automation_logs WHERE automation_id = ? ORDER BY created_at DESC LIMIT ?`
    ).all(automationId, limit) as Record<string, unknown>[];
  }
  return db.prepare(
    `SELECT * FROM automation_logs ORDER BY created_at DESC LIMIT ?`
  ).all(limit) as Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function automationFromRow(row: Record<string, unknown>): Automation {
  return {
    id: row.id as number,
    name: row.name as string,
    description: row.description as string,
    triggerType: row.trigger_type as "schedule" | "event" | "manual",
    triggerConfig: typeof row.trigger_config === "string" ? JSON.parse(row.trigger_config) : (row.trigger_config as Record<string, unknown>),
    actionType: row.action_type as string,
    actionConfig: typeof row.action_config === "string" ? JSON.parse(row.action_config) : (row.action_config as Record<string, unknown>),
    agentId: row.agent_id as string | null,
    enabled: Boolean(row.enabled),
    lastRunAt: row.last_run_at as string | null,
    lastStatus: row.last_status as string | null,
    runCount: row.run_count as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
