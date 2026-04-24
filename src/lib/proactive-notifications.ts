// ---------------------------------------------------------------------------
// Klawhub — Proactive Notifications System
//
// API-driven notification system where agents can proactively send notifications
// to the user. Uses pg Pool with SUPABASE_DB_URL (same pattern as activity.ts).
//
// Different from notification-context.tsx (client-side only) and
// notification-delivery.ts (webhook config).
// ---------------------------------------------------------------------------

import { query } from "@/lib/db";

// ---------------------------------------------------------------------------
// Deduplication cache — prevents sending identical notifications repeatedly
// Key: `${agentId}:${type}:${title}`, Value: timestamp
// Entries expire after DEDUP_TTL_MS
// ---------------------------------------------------------------------------

const _dedupCache = new Map<string, number>();
const DEDUP_TTL_MS = 5 * 60 * 1000; // 5 minutes

function isDuplicate(agentId: string, type: string, title: string): boolean {
  const key = `${agentId}:${type}:${title}`;
  const now = Date.now();
  const lastSent = _dedupCache.get(key);
  if (lastSent && now - lastSent < DEDUP_TTL_MS) {
    return true; // Duplicate within TTL window
  }
  _dedupCache.set(key, now);
  // Periodically prune expired entries to prevent unbounded growth
  if (_dedupCache.size > 1000) {
    for (const [k, ts] of _dedupCache) {
      if (now - ts >= DEDUP_TTL_MS) _dedupCache.delete(k);
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProactiveNotification {
  id: string;
  agentId: string;
  agentName: string;
  type: "info" | "alert" | "task_update" | "routine_result" | "handoff" | "reminder" | "insight" | "project_complete";
  title: string;
  body: string;
  priority: "low" | "normal" | "high" | "urgent";
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// SQL Schema
// ---------------------------------------------------------------------------

export const PROACTIVE_NOTIFICATIONS_SCHEMA = `
CREATE TABLE IF NOT EXISTS proactive_notifications (
  id BIGSERIAL PRIMARY KEY,
  agent_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'alert', 'task_update', 'routine_result', 'handoff', 'reminder', 'insight', 'project_complete')),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  action_url TEXT,
  action_label TEXT,
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proactive_notif_unread ON proactive_notifications(is_read, created_at DESC) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_proactive_notif_agent ON proactive_notifications(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proactive_notif_type ON proactive_notifications(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proactive_notif_priority ON proactive_notifications(priority, created_at DESC) WHERE is_read = FALSE;
`;

// ---------------------------------------------------------------------------
// sendProactiveNotification — Create a new notification
// ---------------------------------------------------------------------------

export async function sendProactiveNotification(params: {
  agentId: string;
  agentName: string;
  type: ProactiveNotification["type"];
  title: string;
  body: string;
  priority?: ProactiveNotification["priority"];
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Record<string, unknown>;
}): Promise<ProactiveNotification | null> {
  if (!process.env.SUPABASE_DB_URL) return null;

  // Deduplication check — skip if the same notification was sent within TTL
  if (isDuplicate(params.agentId, params.type, params.title)) {
    return null;
  }

  try {
    const result = await query(
      `INSERT INTO proactive_notifications (agent_id, agent_name, type, title, body, priority, action_url, action_label, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, agent_id, agent_name, type, title, body, priority, action_url, action_label, metadata, is_read, created_at`,
      [
        params.agentId,
        params.agentName,
        params.type,
        params.title,
        params.body,
        params.priority || "normal",
        params.actionUrl || null,
        params.actionLabel || null,
        JSON.stringify(params.metadata || {}),
      ],
    );

    if (result.rows.length > 0) return mapRow(result.rows[0]);
    return null;
  } catch (err) {
    console.warn("[ProactiveNotifications] Failed to send notification:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// getUnreadNotifications — Fetch unread notifications
// ---------------------------------------------------------------------------

export async function getUnreadNotifications(limit = 20): Promise<ProactiveNotification[]> {
  if (!process.env.SUPABASE_DB_URL) return [];

  try {
    const result = await query(
      `SELECT id, agent_id, agent_name, type, title, body, priority, action_url, action_label, metadata, is_read, created_at
       FROM proactive_notifications
       WHERE is_read = FALSE
       ORDER BY
         CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 WHEN 'low' THEN 4 END,
         created_at DESC
       LIMIT $1`,
      [limit],
    );
    return result.rows.map(mapRow);
  } catch (err) {
    console.warn("[ProactiveNotifications] Failed to fetch unread:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// getRecentNotifications — Fetch recent notifications (read + unread)
// ---------------------------------------------------------------------------

export async function getRecentNotifications(limit = 50): Promise<ProactiveNotification[]> {
  if (!process.env.SUPABASE_DB_URL) return [];

  try {
    const result = await query(
      `SELECT id, agent_id, agent_name, type, title, body, priority, action_url, action_label, metadata, is_read, created_at
       FROM proactive_notifications
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    );
    return result.rows.map(mapRow);
  } catch (err) {
    console.warn("[ProactiveNotifications] Failed to fetch recent:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// markNotificationRead — Mark a single notification as read
// ---------------------------------------------------------------------------

export async function markNotificationRead(id: string): Promise<boolean> {
  if (!process.env.SUPABASE_DB_URL) return false;

  try {
    const numId = parseInt(id, 10);
    if (isNaN(numId)) return false;

    await query(
      `UPDATE proactive_notifications SET is_read = TRUE WHERE id = $1`,
      [numId],
    );
    return true;
  } catch (err) {
    console.warn("[ProactiveNotifications] Failed to mark read:", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// markAllRead — Mark all notifications as read
// ---------------------------------------------------------------------------

export async function markAllRead(): Promise<number> {
  if (!process.env.SUPABASE_DB_URL) return 0;

  try {
    const result = await query(
      `UPDATE proactive_notifications SET is_read = TRUE WHERE is_read = FALSE`,
    );
    return result.rowCount || 0;
  } catch (err) {
    console.warn("[ProactiveNotifications] Failed to mark all read:", err);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// getNotificationCount — Get unread count
// ---------------------------------------------------------------------------

export async function getNotificationCount(): Promise<number> {
  if (!process.env.SUPABASE_DB_URL) return 0;

  try {
    const result = await query(
      `SELECT COUNT(*) as count FROM proactive_notifications WHERE is_read = FALSE`,
    );
    return parseInt(result.rows[0]?.count || "0", 10);
  } catch (err) {
    console.warn("[ProactiveNotifications] Failed to get count:", err);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// getNotificationsSince — Get notifications created after a timestamp
// ---------------------------------------------------------------------------

export async function getNotificationsSince(since: string, limit = 50): Promise<ProactiveNotification[]> {
  if (!process.env.SUPABASE_DB_URL) return [];

  try {
    const result = await query(
      `SELECT id, agent_id, agent_name, type, title, body, priority, action_url, action_label, metadata, is_read, created_at
       FROM proactive_notifications
       WHERE created_at > $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [since, limit],
    );
    return result.rows.map(mapRow);
  } catch (err) {
    console.warn("[ProactiveNotifications] Failed to fetch since:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

function mapRow(row: Record<string, unknown>): ProactiveNotification {
  return {
    id: String(row.id),
    agentId: row.agent_id as string,
    agentName: row.agent_name as string,
    type: row.type as ProactiveNotification["type"],
    title: row.title as string,
    body: row.body as string,
    priority: row.priority as ProactiveNotification["priority"],
    actionUrl: (row.action_url as string) || undefined,
    actionLabel: (row.action_label as string) || undefined,
    metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : (row.metadata as Record<string, unknown> | undefined),
    isRead: row.is_read as boolean,
    createdAt: row.created_at as string,
  };
}
