// ---------------------------------------------------------------------------
// Klawhub — Phase 4 Schema (Unique Tables Only)
//
// This file contains ONLY the tables that were introduced in Phase 4 and are
// NOT defined elsewhere. Duplicates have been removed:
//
//   - A2A_TABLES removed → see a2a-schema.ts (canonical, more columns)
//   - PHASE2_TABLES removed → see supabase.ts PHASE2_SCHEMA_SQL (canonical)
//   - MEMORY_MIGRATION removed → see unified-schema.ts MEMORY_SCHEMA_ENHANCEMENTS_SQL (canonical)
//
// For the complete schema setup, use UNIFIED_SETUP_SQL from unified-schema.ts.
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
// Learning Insights — Defensive migration to ensure CHECK constraints match code
// ---------------------------------------------------------------------------

const LEARNING_MIGRATION = `
DO $$
BEGIN
  -- Ensure learning_insights table exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'learning_insights') THEN
    RETURN;
  END IF;

  -- Drop and re-create insight_type constraint to match code types
  ALTER TABLE learning_insights DROP CONSTRAINT IF EXISTS learning_insights_insight_type_check;
  ALTER TABLE learning_insights ADD CONSTRAINT learning_insights_insight_type_check
    CHECK (insight_type IN ('preference', 'correction', 'pattern', 'skill_gain', 'workflow'));

  -- Drop and re-create source constraint to match code types
  ALTER TABLE learning_insights DROP CONSTRAINT IF EXISTS learning_insights_source_check;
  ALTER TABLE learning_insights ADD CONSTRAINT learning_insights_source_check
    CHECK (source IN ('user_feedback', 'correction', 'pattern_detection', 'routine_result'));

EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Learning insights migration skipped: %', SQLERRM;
END $$;
`;

// ---------------------------------------------------------------------------
// Complete Phase 4 Schema — Only unique tables (no duplicates)
// ---------------------------------------------------------------------------

export const PHASE4_SCHEMA_SQL = `
-- ============================================================
-- Klawhub — Phase 4: New Tables Only
--
-- NOTE: Duplicates removed in Step 5:
--   - A2A tables → see a2a-schema.ts (canonical source)
--   - Phase 2 tables → see supabase.ts PHASE2_SCHEMA_SQL
--   - Agent memory migration → see unified-schema.ts MEMORY_SCHEMA_ENHANCEMENTS_SQL
//
-- Run via POST /api/setup/phase4?action=setup
// For full setup, use UNIFIED_SETUP_SQL from unified-schema.ts.
-- ============================================================

-- Phase 4 New Tables
${PHASE4_NEW_TABLES}

-- Task Board
${TASK_BOARD_TABLE}

-- Agent Routines
${AGENT_ROUTINES_TABLE}

-- Learning Insights Migration
${LEARNING_MIGRATION}
`;

// ---------------------------------------------------------------------------
// Individual table SQL exports (for selective setup)
// ---------------------------------------------------------------------------

export const PROACTIVE_NOTIFICATIONS_TABLE_SQL = PHASE4_NEW_TABLES;
export const LEARNING_INSIGHTS_TABLE_SQL = PHASE4_NEW_TABLES;
export const TASK_BOARD_TABLE_SQL = TASK_BOARD_TABLE;
export const AGENT_ROUTINES_TABLE_SQL = AGENT_ROUTINES_TABLE;
export const LEARNING_MIGRATION_SQL = LEARNING_MIGRATION;

// Backward-compat re-exports: these tables are defined in their canonical sources
// NOTE: MEMORY_MIGRATION_SQL is exported from unified-schema.ts (not here)
// to avoid circular dependency.
export { A2A_SCHEMA_SQL as A2A_TABLES_SQL } from "./a2a-schema";
export { PHASE2_SCHEMA_SQL as PHASE2_TABLES_SQL } from "./supabase";

// ---------------------------------------------------------------------------
// Table list for setup endpoint reporting (unique to this file only)
// ---------------------------------------------------------------------------

export const PHASE4_TABLE_LIST = [
  "proactive_notifications",
  "learning_insights",
  "task_board",
  "agent_routines",
];
