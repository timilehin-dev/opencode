// ---------------------------------------------------------------------------
// Klawhub — Supabase Client & Database Layer
// v2.5 — A2A routing, services sidebar, agent history persistence
//
// Hybrid approach: Uses Supabase when configured (NEXT_PUBLIC_SUPABASE_URL +
// NEXT_PUBLIC_SUPABASE_ANON_KEY env vars), falls back to localStorage when not.
//
// This means the app works immediately without Supabase, and gets persistent
// cloud storage the moment you add the env vars.
// ---------------------------------------------------------------------------

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Client Singleton
// ---------------------------------------------------------------------------

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (_supabase) return _supabase;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return null;

  _supabase = createClient(url, key, {
    auth: {
      persistSession: false, // We don't use auth for now — single-user app
    },
  });

  return _supabase;
}

/** Check if Supabase is configured and reachable. */
export async function isSupabaseReady(): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    // Query an actual table that exists — agent_memory
    const { error } = await supabase.from("agent_memory").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// SQL Schema — Run this in the Supabase SQL Editor to set up tables
// ---------------------------------------------------------------------------

export const SCHEMA_SQL = `
-- ============================================================
-- Klawhub — Supabase Database Schema
-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard)
-- ============================================================

-- 1. Analytics Events
CREATE TABLE IF NOT EXISTS analytics_events (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('chat_message', 'tool_call', 'agent_switch', 'page_view', 'automation_run')),
  agent_id TEXT NOT NULL,
  agent_name TEXT,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Conversations
CREATE TABLE IF NOT EXISTS conversations (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tool_calls JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Automations
CREATE TABLE IF NOT EXISTS automations (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('schedule', 'event', 'manual')),
  trigger_config JSONB NOT NULL DEFAULT '{}',
  action_type TEXT NOT NULL CHECK (action_type IN ('agent_task', 'notification', 'webhook')),
  action_config JSONB NOT NULL DEFAULT '{}',
  agent_id TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  last_status TEXT CHECK (last_status IN ('success', 'error')),
  run_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Automation Logs
CREATE TABLE IF NOT EXISTS automation_logs (
  id BIGSERIAL PRIMARY KEY,
  automation_id BIGINT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'error')),
  result JSONB DEFAULT '{}',
  duration_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. User Preferences
CREATE TABLE IF NOT EXISTS user_preferences (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Agent Memory (persistent context per agent)
CREATE TABLE IF NOT EXISTS agent_memory (
  id BIGSERIAL PRIMARY KEY,
  agent_id TEXT NOT NULL,
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'preference', 'context', 'instruction')),
  content TEXT NOT NULL,
  importance INTEGER DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Indexes for performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_analytics_type_time ON analytics_events(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_agent_time ON analytics_events(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_session_agent ON conversations(session_id, agent_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_automations_enabled ON automations(enabled) WHERE enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_auto_logs_time ON automation_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_memory_agent ON agent_memory(agent_id, category);

-- ============================================================
-- Row Level Security — RLS_FIX_SQL at bottom of file handles all tables.
-- Run that SQL once in Supabase SQL Editor.
-- ============================================================

-- ============================================================
-- 7. Reminders (scheduled notifications for autonomous agents)
-- ============================================================
CREATE TABLE IF NOT EXISTS reminders (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  reminder_time TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'fired', 'dismissed', 'snoozed')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  repeat_config JSONB DEFAULT '{}',
  assigned_agent TEXT,
  context JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  fired_at TIMESTAMPTZ
);

-- 8. Todos (task management for autonomous coworker agents)
-- ============================================================
CREATE TABLE IF NOT EXISTS todos (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done', 'archived')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  due_date DATE,
  due_time TIMESTAMPTZ,
  category TEXT DEFAULT 'general',
  tags TEXT[] DEFAULT '{}',
  assigned_agent TEXT,
  context JSONB DEFAULT '{}',
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'agent', 'automation', 'delegation')),
  source_agent TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Contacts (relationship / address book for agent workspace)
-- ============================================================
CREATE TABLE IF NOT EXISTS contacts (
  id BIGSERIAL PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  email TEXT UNIQUE,
  phone TEXT,
  company TEXT,
  role TEXT,
  notes TEXT DEFAULT '',
  tags TEXT[] DEFAULT '{}',
  context JSONB DEFAULT '{}',
  is_vip BOOLEAN DEFAULT FALSE,
  frequency TEXT DEFAULT 'occasional' CHECK (frequency IN ('never', 'rare', 'occasional', 'regular', 'frequent', 'vip')),
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_interaction TIMESTAMPTZ,
  interaction_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Workspace Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_reminders_status_time ON reminders(status, reminder_time ASC);
CREATE INDEX IF NOT EXISTS idx_reminders_priority ON reminders(priority);
CREATE INDEX IF NOT EXISTS idx_reminders_assigned_agent ON reminders(assigned_agent);
CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);
CREATE INDEX IF NOT EXISTS idx_todos_priority ON todos(priority);
CREATE INDEX IF NOT EXISTS idx_todos_category ON todos(category);
CREATE INDEX IF NOT EXISTS idx_todos_assigned_agent ON todos(assigned_agent);
CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company) WHERE company IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_vip ON contacts(is_vip) WHERE is_vip = TRUE;
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(first_name, last_name);
CREATE INDEX IF NOT EXISTS idx_contacts_tags ON contacts USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_todos_tags ON todos USING GIN(tags);
`;

// ---------------------------------------------------------------------------
// Phase 3 SQL — Agent Task Queue & Delegation Tracking
// For the setup API route /api/setup/phase3
// ---------------------------------------------------------------------------
export const PHASE3_SCHEMA_SQL = `
-- Agent Task Queue (background tasks)
CREATE TABLE IF NOT EXISTS agent_tasks (
  id BIGSERIAL PRIMARY KEY,
  agent_id TEXT NOT NULL,
  task TEXT NOT NULL,
  context TEXT DEFAULT '',
  trigger_type TEXT NOT NULL DEFAULT 'manual' CHECK (trigger_type IN ('manual', 'automation', 'cron', 'delegation', 'event', 'autonomous', 'proactive_assessment', 'a2a_inbox', 'project')),
  trigger_source TEXT DEFAULT '',
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'normal', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  result TEXT DEFAULT '',
  error TEXT DEFAULT '',
  tool_calls JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Recurring task support
  recurring_enabled BOOLEAN DEFAULT FALSE,
  recurring_interval TEXT DEFAULT NULL,
  next_run_at TIMESTAMPTZ DEFAULT NULL,
  -- Task chaining support
  parent_task_id BIGINT DEFAULT NULL REFERENCES agent_tasks(id),
  chain_to_agent TEXT DEFAULT NULL,
  chain_task TEXT DEFAULT NULL,
  chain_on_success BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent ON agent_tasks(agent_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_recurring ON agent_tasks(recurring_enabled, next_run_at) WHERE recurring_enabled = TRUE;

-- Delegations (A2A tracking)
CREATE TABLE IF NOT EXISTS delegations (
  id BIGSERIAL PRIMARY KEY,
  initiator_agent TEXT NOT NULL,
  assigned_agent TEXT NOT NULL,
  task TEXT NOT NULL,
  context TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  result TEXT DEFAULT '',
  delegation_chain TEXT[] DEFAULT '{}',
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_delegations_status ON delegations(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delegations_initiator ON delegations(initiator_agent, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delegations_assigned ON delegations(assigned_agent, created_at DESC);
`;

// ---------------------------------------------------------------------------
// Key Usage Table — For smart API key rotation
// Run this in the Supabase SQL Editor if key_usage table doesn't exist
// ---------------------------------------------------------------------------
export const KEY_USAGE_SCHEMA_SQL = `
-- Key Usage Tracking (for smart rotation)
CREATE TABLE IF NOT EXISTS key_usage (
  key_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  key_label TEXT NOT NULL,
  tokens_used BIGINT NOT NULL DEFAULT 0,
  requests_today BIGINT NOT NULL DEFAULT 0,
  usage_date TEXT NOT NULL DEFAULT CURRENT_DATE,
  last_used_at TIMESTAMPTZ,
  last_error TEXT,
  error_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_key_usage_provider ON key_usage(provider);
CREATE INDEX IF NOT EXISTS idx_key_usage_date ON key_usage(usage_date);
`;

// ---------------------------------------------------------------------------
// Phase 2 SQL — Agent Activity Log + Persistent Agent Status
// For the setup API route /api/setup/phase2
// ---------------------------------------------------------------------------
export const PHASE2_SCHEMA_SQL = `
-- Agent Activity Log (for Ops Feed)
CREATE TABLE IF NOT EXISTS agent_activity (
  id BIGSERIAL PRIMARY KEY,
  agent_id TEXT NOT NULL,
  agent_name TEXT,
  action TEXT NOT NULL,
  detail TEXT DEFAULT '',
  tool_name TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_agent_time ON agent_activity(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_time ON agent_activity(created_at DESC);

-- Agent Status (persistent)
CREATE TABLE IF NOT EXISTS agent_status (
  agent_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'busy', 'error', 'offline')),
  current_task TEXT,
  last_activity TIMESTAMPTZ,
  tasks_completed INTEGER NOT NULL DEFAULT 0,
  messages_processed INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

// ---------------------------------------------------------------------------
// Workspace Tables SQL — DEPRECATED
// This was a DUPLICATE of tables already in SCHEMA_SQL (reminders, todos, contacts).
// Kept as an empty export for backward compatibility. Consumers should use SCHEMA_SQL.
// ---------------------------------------------------------------------------
export const WORKSPACE_SCHEMA_SQL = '';

// ---------------------------------------------------------------------------
// RLS Fix SQL — Run this ONCE in Supabase SQL Editor to fix RLS on all tables
// Supabase enables RLS by default; this adds permissive policies for anon access.
// ---------------------------------------------------------------------------
export const RLS_FIX_SQL = `
-- Enable RLS and add permissive policies for all Klawhub tables
DO $$ DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN (
      'analytics_events','conversations','automations','automation_logs',
      'user_preferences','agent_memory','reminders','agent_tasks',
      'delegations','key_usage','agent_activity','agent_status',
      'todos','contacts','learning_insights','skill_executions',
      'skill_evaluations','skill_evolution','skills',
      'agent_skills','workflows','workflow_steps','workflow_step_validations',
      'a2a_messages','a2a_shared_context','a2a_channels',
      'a2a_channel_messages','a2a_tasks','agent_routines',
      'task_board','workflow_executions'
    )
  LOOP
    EXECUTE format('ALTER TABLE IF EXISTS %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('CREATE POLICY IF NOT EXISTS "Allow all on ' || tbl || '" ON ' || tbl || ' FOR ALL USING (true) WITH CHECK (true)', tbl);
  END LOOP;
END $$;
`;
