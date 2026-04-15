// ---------------------------------------------------------------------------
// Claw — Supabase Client & Database Layer
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
    const { error } = await supabase.from("health_check").select("id").limit(1);
    // If the table doesn't exist, it's an error but Supabase IS connected
    return !error || error.code === "42P01"; // 42P01 = undefined table
  } catch {
    return false;
  }
}

export { getSupabase as getDb };

// ---------------------------------------------------------------------------
// SQL Schema — Run this in the Supabase SQL Editor to set up tables
// ---------------------------------------------------------------------------

export const SCHEMA_SQL = `
-- ============================================================
-- Claw AI — Supabase Database Schema
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
-- Row Level Security (optional — tighten if needed)
-- For a personal app with anon key, you may want to keep RLS off.
-- ============================================================

-- For now, disable RLS on all tables (personal single-user app).
-- Uncomment and customize if you add auth later:
-- ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;
`;
