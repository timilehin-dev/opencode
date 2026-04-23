// ---------------------------------------------------------------------------
// Klawhub — Comprehensive Supabase Setup Script (Phase 4)
//
// Contains ALL table schemas needed for the full application, including
// Phase 4 new tables (proactive_notifications, learning_insights) plus
// all existing tables from prior phases.
//
// Exported as PHASE4_SCHEMA_SQL for the /api/setup/phase4 endpoint.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Phase 4 — New tables for Proactive Notifications + Self-Learning
// ---------------------------------------------------------------------------

const PHASE4_NEW_TABLES = `
-- ============================================================
-- Proactive Notifications (Task 9)
-- Agent-generated notifications sent proactively to the user
-- ============================================================
CREATE TABLE IF NOT EXISTS proactive_notifications (
  id BIGSERIAL PRIMARY KEY,
  agent_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'alert', 'task_update', 'routine_result', 'handoff', 'reminder', 'insight')),
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

-- ============================================================
-- Learning Insights (Task 10)
-- Self-learning system — agents learn from interactions
-- ============================================================
CREATE TABLE IF NOT EXISTS learning_insights (
  id BIGSERIAL PRIMARY KEY,
  agent_id TEXT NOT NULL,
  insight_type TEXT NOT NULL DEFAULT 'preference' CHECK (insight_type IN ('preference', 'correction', 'pattern', 'skill_gain', 'workflow')),
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'user_feedback' CHECK (source IN ('user_feedback', 'correction', 'pattern_detection', 'routine_result')),
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.50 CHECK (confidence >= 0 AND confidence <= 1),
  application_count INTEGER NOT NULL DEFAULT 0,
  last_applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_agent ON learning_insights(agent_id, insight_type);
CREATE INDEX IF NOT EXISTS idx_learning_confidence ON learning_insights(confidence DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_applied ON learning_insights(last_applied_at DESC);
`;

// ---------------------------------------------------------------------------
// A2A Communication Tables (from a2a.ts)
// ---------------------------------------------------------------------------

const A2A_TABLES = `
-- A2A Messages (Agent-to-Agent communication)
CREATE TABLE IF NOT EXISTS a2a_messages (
  id BIGSERIAL PRIMARY KEY,
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'request' CHECK (type IN ('request', 'response', 'broadcast', 'context_share', 'handoff')),
  topic TEXT NOT NULL DEFAULT '',
  payload JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'delivered' CHECK (status IN ('pending', 'delivered', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_a2a_msg_from ON a2a_messages(from_agent, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_a2a_msg_to ON a2a_messages(to_agent, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_a2a_msg_status ON a2a_messages(status, created_at DESC);

-- A2A Tasks (Agent delegation tracking)
CREATE TABLE IF NOT EXISTS a2a_tasks (
  id BIGSERIAL PRIMARY KEY,
  initiator_agent TEXT NOT NULL,
  assigned_agent TEXT NOT NULL,
  task TEXT NOT NULL,
  context TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  result TEXT,
  delegation_chain JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_a2a_task_status ON a2a_tasks(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_a2a_task_initiator ON a2a_tasks(initiator_agent, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_a2a_task_assigned ON a2a_tasks(assigned_agent, created_at DESC);
`;

// ---------------------------------------------------------------------------
// Task Board (from taskboard.ts)
// ---------------------------------------------------------------------------

const TASK_BOARD_TABLE = `
-- Task Board (shared Kanban for inter-agent coordination)
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
// Agent Routines (from agent-routines.ts)
// ---------------------------------------------------------------------------

const AGENT_ROUTINES_TABLE = `
-- Agent Routines (scheduled background tasks)
CREATE TABLE IF NOT EXISTS agent_routines (
  id SERIAL PRIMARY KEY,
  agent_id TEXT NOT NULL,
  name TEXT NOT NULL,
  task TEXT NOT NULL,
  context TEXT DEFAULT '',
  interval_minutes INTEGER NOT NULL DEFAULT 60,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_run TIMESTAMPTZ,
  next_run TIMESTAMPTZ NOT NULL,
  last_result TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_routines_agent_id ON agent_routines(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_routines_next_run ON agent_routines(next_run);
CREATE INDEX IF NOT EXISTS idx_agent_routines_is_active ON agent_routines(is_active);
`;

// ---------------------------------------------------------------------------
// Phase 2 tables (from supabase.ts PHASE2_SCHEMA_SQL)
// ---------------------------------------------------------------------------

const PHASE2_TABLES = `
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
// Agent Memory — Update CHECK constraint to include new categories
// The table may already exist from Phase 1; we ALTER the constraint.
// ---------------------------------------------------------------------------

const MEMORY_MIGRATION = `
-- Update agent_memory category CHECK to include new categories
-- Drop the existing constraint (if exists) and add the new one
DO $$
BEGIN
  -- Try to drop the old constraint (ignore if it doesn't exist)
  ALTER TABLE agent_memory DROP CONSTRAINT IF EXISTS agent_memory_category_check;

  -- Add the new, expanded constraint
  ALTER TABLE agent_memory ADD CONSTRAINT agent_memory_category_check
    CHECK (category IN ('general', 'preference', 'context', 'instruction', 'episodic', 'semantic', 'procedural'));

  -- Ensure the index exists
  CREATE INDEX IF NOT EXISTS idx_agent_memory_agent ON agent_memory(agent_id, category);
EXCEPTION WHEN OTHERS THEN
  -- If agent_memory table doesn't exist yet, create it with the full constraint
  CREATE TABLE IF NOT EXISTS agent_memory (
    id BIGSERIAL PRIMARY KEY,
    agent_id TEXT NOT NULL,
    category TEXT DEFAULT 'general' CHECK (category IN ('general', 'preference', 'context', 'instruction', 'episodic', 'semantic', 'procedural')),
    content TEXT NOT NULL,
    importance INTEGER DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_agent_memory_agent ON agent_memory(agent_id, category);
END $$;
`;

// ---------------------------------------------------------------------------
// Complete Phase 4 Schema — Everything combined
// ---------------------------------------------------------------------------

export const PHASE4_SCHEMA_SQL = `
-- ============================================================
-- Klawhub — Phase 4: Complete Database Schema
-- Includes ALL tables from prior phases + new Phase 4 tables
-- Run via POST /api/setup/phase4?action=setup
-- ============================================================

-- Phase 4 New Tables
${PHASE4_NEW_TABLES}

-- A2A Communication
${A2A_TABLES}

-- Task Board
${TASK_BOARD_TABLE}

-- Agent Routines
${AGENT_ROUTINES_TABLE}

-- Phase 2 Tables
${PHASE2_TABLES}

-- Agent Memory Migration
${MEMORY_MIGRATION}
`;

// ---------------------------------------------------------------------------
// Individual table SQL exports (for selective setup)
// ---------------------------------------------------------------------------

export const PROACTIVE_NOTIFICATIONS_TABLE_SQL = PHASE4_NEW_TABLES;
export const LEARNING_INSIGHTS_TABLE_SQL = PHASE4_NEW_TABLES;
export const A2A_TABLES_SQL = A2A_TABLES;
export const TASK_BOARD_TABLE_SQL = TASK_BOARD_TABLE;
export const AGENT_ROUTINES_TABLE_SQL = AGENT_ROUTINES_TABLE;
export const PHASE2_TABLES_SQL = PHASE2_TABLES;
export const MEMORY_MIGRATION_SQL = MEMORY_MIGRATION;

// ---------------------------------------------------------------------------
// Table list for setup endpoint reporting
// ---------------------------------------------------------------------------

export const PHASE4_TABLE_LIST = [
  "proactive_notifications",
  "learning_insights",
  "a2a_messages",
  "a2a_tasks",
  "task_board",
  "agent_routines",
  "agent_activity",
  "agent_status",
  "agent_memory",
];
