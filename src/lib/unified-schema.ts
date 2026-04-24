// ---------------------------------------------------------------------------
// Klawhub — Unified Database Schema
//
// Single entry-point for ALL table DDL across the entire application.
// Imports and re-exports schema SQL constants from their original files,
// and provides a UNIFIED_SETUP_SQL that concatenates them in correct
// dependency order.
//
// NOTE: No code was deleted — this file only ADDS a consolidated view.
//       Individual phase routes still work independently.
// ---------------------------------------------------------------------------

// Re-export all schema SQL constants from their original source files.
// This allows consumers to import from either the original file or here.

// Core tables (analytics, conversations, automations, user_preferences, agent_memory,
// reminders, todos, contacts) + their indexes
export { SCHEMA_SQL } from "@/lib/supabase";

// Phase 2 — Agent activity log + persistent agent status
export { PHASE2_SCHEMA_SQL } from "@/lib/supabase";

// Phase 3 — Agent task queue + delegation tracking
export { PHASE3_SCHEMA_SQL } from "@/lib/supabase";

// Key usage tracking (smart API key rotation)
export { KEY_USAGE_SCHEMA_SQL } from "@/lib/supabase";

// Workspace tables (reminders, todos, contacts) — DUPLICATE of tables already in SCHEMA_SQL.
// Kept here as a re-export for backwards-compat but NOT included in the unified setup
// to avoid double CREATE TABLE (which is harmless but wasteful).
export { WORKSPACE_SCHEMA_SQL } from "@/lib/supabase";

// RLS fix — enables Row Level Security + permissive policies on all Klawhub tables
export { RLS_FIX_SQL } from "@/lib/supabase";

// Self-learning insights table (also duplicated inside PHASE4_SCHEMA_SQL in supabase-setup.ts)
export { LEARNING_INSIGHTS_SCHEMA } from "@/lib/self-learning";

// Phase 4 tables (proactive_notifications, learning_insights, a2a_messages, a2a_tasks,
// task_board, agent_routines, agent_activity, agent_status, agent_memory migration)
// NOTE: Phase 2 tables (agent_activity, agent_status) are ALSO in PHASE4_SCHEMA_SQL.
//       This is safe due to CREATE TABLE IF NOT EXISTS.
export { PHASE4_SCHEMA_SQL, PHASE4_TABLE_LIST } from "@/lib/supabase-setup";

// Individual Phase 4 sub-tables for selective setup
export {
  PROACTIVE_NOTIFICATIONS_TABLE_SQL,
  A2A_TABLES_SQL,
  TASK_BOARD_TABLE_SQL,
  AGENT_ROUTINES_TABLE_SQL,
  PHASE2_TABLES_SQL as PHASE4_PHASE2_TABLES_SQL,
  MEMORY_MIGRATION_SQL,
} from "@/lib/supabase-setup";

// ---------------------------------------------------------------------------
// Workflow tables schema (Phase 7B)
//
// These tables (agent_workflows, workflow_steps, workflow_executions) are
// currently defined inline in /api/workflows/setup/route.ts and are NOT
// available as a standalone export. We define them here so the unified
// setup can include them.
// ---------------------------------------------------------------------------

export const WORKFLOW_SCHEMA_SQL = `
-- Agent Workflows
CREATE TABLE IF NOT EXISTS agent_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  agent_id VARCHAR(100) NOT NULL,
  query TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'planning',
  strategy JSONB DEFAULT '{}',
  total_steps INTEGER DEFAULT 0,
  completed_steps INTEGER DEFAULT 0,
  failed_steps INTEGER DEFAULT 0,
  quality_score NUMERIC(5,2),
  error_message TEXT,
  schedule_interval INTEGER DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_workflows_agent ON agent_workflows(agent_id);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON agent_workflows(status);

-- Workflow Steps
CREATE TABLE IF NOT EXISTS workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES agent_workflows(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  skill_id VARCHAR(100),
  skill_name VARCHAR(100),
  status VARCHAR(50) DEFAULT 'pending',
  input_context TEXT,
  output_result TEXT,
  output_summary TEXT,
  validation_score NUMERIC(5,2),
  validation_feedback TEXT,
  error_message TEXT,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 2,
  duration_ms INTEGER,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workflow_id, step_number)
);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow ON workflow_steps(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_status ON workflow_steps(status);

-- Workflow Executions (audit log for workflow engine events)
-- NOTE: This table was referenced in workflow-engine.ts logExecution() but was
-- missing from all schema SQL files. Added here to fix the gap.
CREATE TABLE IF NOT EXISTS workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES agent_workflows(id) ON DELETE CASCADE,
  step_id UUID REFERENCES workflow_steps(id) ON DELETE SET NULL,
  phase VARCHAR(50) NOT NULL,
  agent_id VARCHAR(100),
  action TEXT NOT NULL,
  input_data TEXT,
  output_data TEXT,
  duration_ms INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow ON workflow_executions(workflow_id);
`;

// ---------------------------------------------------------------------------
// A2A Enhanced Tables (Phase 4 extended)
//
// The a2a.ts module uses a2a_shared_context, a2a_channels, and
// a2a_channel_messages tables that are NOT in any existing schema file.
// They are likely created by the Phase 4 setup or manually. We include
// them here for completeness.
//
// Note: a2a_messages and a2a_tasks are already in PHASE4_SCHEMA_SQL.
// ---------------------------------------------------------------------------

// NOTE: There is no dedicated a2a-schema.ts file in the codebase.
// The a2a_shared_context, a2a_channels, and a2a_channel_messages tables
// referenced in a2a.ts are NOT defined in any existing schema file.
// If these tables are needed, the SQL below should be run manually
// or via the setup endpoint. For now, we document the gap.

export const A2A_EXTENDED_TABLES_SQL = `
-- A2A Shared Context (versioned key-value store)
-- Referenced in a2a.ts but NOT in any existing schema file.
CREATE TABLE IF NOT EXISTS a2a_shared_context (
  id BIGSERIAL PRIMARY KEY,
  context_key TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  content JSONB DEFAULT '{}',
  content_text TEXT DEFAULT '',
  tags JSONB DEFAULT '[]'::jsonb,
  access_agents TEXT[] DEFAULT '{}',
  scope TEXT DEFAULT 'project' CHECK (scope IN ('global', 'project', 'session', 'agent')),
  version INTEGER NOT NULL DEFAULT 1,
  is_latest BOOLEAN DEFAULT TRUE,
  project_id BIGINT DEFAULT NULL,
  session_id TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_a2a_shared_ctx_key ON a2a_shared_context(context_key);
CREATE INDEX IF NOT EXISTS idx_a2a_shared_ctx_agent ON a2a_shared_context(agent_id);
CREATE INDEX IF NOT EXISTS idx_a2a_shared_ctx_latest ON a2a_shared_context(is_latest) WHERE is_latest = TRUE;

-- A2A Collaboration Channels
CREATE TABLE IF NOT EXISTS a2a_channels (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  channel_type TEXT DEFAULT 'project' CHECK (channel_type IN ('project', 'team', 'direct', 'topic')),
  project_id BIGINT DEFAULT NULL,
  created_by TEXT NOT NULL,
  members TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  last_message_at TIMESTAMPTZ,
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_a2a_channels_active ON a2a_channels(is_active) WHERE is_active = TRUE;

-- A2A Channel Messages
CREATE TABLE IF NOT EXISTS a2a_channel_messages (
  id BIGSERIAL PRIMARY KEY,
  channel_id BIGINT NOT NULL REFERENCES a2a_channels(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'message',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_a2a_ch_msg_channel ON a2a_channel_messages(channel_id, created_at DESC);

-- A2A Functions: upsert_shared_context, get_agent_inbox, mark_messages_read, get_or_create_channel, expire_old_a2a_messages
CREATE OR REPLACE FUNCTION upsert_shared_context(
  p_context_key TEXT, p_agent_id TEXT, p_content JSONB, p_content_text TEXT,
  p_tags TEXT[], p_access_agents TEXT[], p_scope TEXT, p_project_id BIGINT, p_session_id TEXT
) RETURNS BIGINT AS $$
DECLARE
  v_version INTEGER;
  v_id BIGINT;
BEGIN
  -- Mark existing latest versions as not latest
  UPDATE a2a_shared_context SET is_latest = FALSE
    WHERE context_key = p_context_key AND is_latest = TRUE;
  -- Insert new version
  INSERT INTO a2a_shared_context (context_key, agent_id, content, content_text, tags, access_agents, scope, project_id, session_id, version, is_latest)
    VALUES (p_context_key, p_agent_id, p_content, p_content_text, p_tags, p_access_agents, p_scope, p_project_id, p_session_id,
      COALESCE((SELECT MAX(version) FROM a2a_shared_context WHERE context_key = p_context_key), 0) + 1, TRUE)
    RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_agent_inbox(p_agent_id TEXT, p_limit INTEGER DEFAULT 50)
RETURNS TABLE(id BIGINT, from_agent TEXT, type TEXT, topic TEXT, payload JSONB, priority TEXT, created_at TIMESTAMPTZ, correlation_id TEXT) AS $$
BEGIN
  RETURN QUERY
    SELECT m.id, m.from_agent, m.type, m.topic, m.payload, m.priority, m.created_at, m.correlation_id::TEXT
    FROM a2a_messages m
    WHERE m.to_agent = p_agent_id AND m.is_read = FALSE
    ORDER BY
      CASE m.priority
        WHEN 'urgent' THEN 1
        WHEN 'high' THEN 2
        WHEN 'normal' THEN 3
        WHEN 'low' THEN 4
        ELSE 5
      END,
      m.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION mark_messages_read(p_agent_id TEXT, p_message_ids BIGINT[])
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE a2a_messages SET is_read = TRUE
    WHERE to_agent = p_agent_id AND id = ANY(p_message_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_or_create_channel(p_name TEXT, p_channel_type TEXT, p_project_id BIGINT, p_members TEXT[])
RETURNS BIGINT AS $$
DECLARE
  v_id BIGINT;
BEGIN
  SELECT id INTO v_id FROM a2a_channels WHERE name = p_name LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO a2a_channels (name, channel_type, project_id, created_by, members)
      VALUES (p_name, p_channel_type, p_project_id, p_members[1], p_members)
      RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION expire_old_a2a_messages()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM a2a_messages WHERE created_at < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Also add missing columns to a2a_messages if not present
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'a2a_messages' AND column_name = 'priority') THEN
    ALTER TABLE a2a_messages ADD COLUMN priority TEXT DEFAULT 'normal';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'a2a_messages' AND column_name = 'correlation_id') THEN
    ALTER TABLE a2a_messages ADD COLUMN correlation_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'a2a_messages' AND column_name = 'parent_message_id') THEN
    ALTER TABLE a2a_messages ADD COLUMN parent_message_id BIGINT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'a2a_messages' AND column_name = 'is_read') THEN
    ALTER TABLE a2a_messages ADD COLUMN is_read BOOLEAN DEFAULT FALSE;
  END IF;
END $$;
`;

// ---------------------------------------------------------------------------
// Complete list of tables created by the unified schema (for reporting)
// ---------------------------------------------------------------------------

export const UNIFIED_TABLE_LIST = [
  // Core (SCHEMA_SQL)
  "analytics_events",
  "conversations",
  "automations",
  "automation_logs",
  "user_preferences",
  "agent_memory",
  "reminders",
  "todos",
  "contacts",
  // Phase 2 (PHASE2_SCHEMA_SQL)
  "agent_activity",
  "agent_status",
  // Phase 3 (PHASE3_SCHEMA_SQL)
  "agent_tasks",
  "delegations",
  // Key usage (KEY_USAGE_SCHEMA_SQL)
  "key_usage",
  // Phase 4 (PHASE4_SCHEMA_SQL / supabase-setup.ts)
  "proactive_notifications",
  "learning_insights",
  "a2a_messages",
  "a2a_tasks",
  "task_board",
  "agent_routines",
  // Phase 5 (projects)
  "projects",
  "project_tasks",
  "project_task_logs",
  // Workflow (WORKFLOW_SCHEMA_SQL)
  "agent_workflows",
  "workflow_steps",
  "workflow_executions",
  // A2A Extended
  "a2a_shared_context",
  "a2a_channels",
  "a2a_channel_messages",
] as const;

export type UnifiedTableName = (typeof UNIFIED_TABLE_LIST)[number];

// ---------------------------------------------------------------------------
// UNIFIED_SETUP_SQL — The single SQL string to set up the entire database.
//
// Order matters: dependency-first. All statements use CREATE TABLE IF NOT EXISTS
// and CREATE INDEX IF NOT EXISTS, so this is safe to re-run.
// ---------------------------------------------------------------------------

// Import the individual schema constants for concatenation
import {
  SCHEMA_SQL,
  PHASE2_SCHEMA_SQL,
  PHASE3_SCHEMA_SQL,
  KEY_USAGE_SCHEMA_SQL,
  RLS_FIX_SQL,
} from "@/lib/supabase";

import { PHASE4_SCHEMA_SQL } from "@/lib/supabase-setup";

// Phase 5 SQL (projects, project_tasks, project_task_logs)
// Extracted from /api/setup/phase5/route.ts
const PHASE5_SCHEMA_SQL = `
-- projects table
CREATE TABLE IF NOT EXISTS projects (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'in_progress', 'on_hold', 'completed', 'failed', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  agent_id TEXT DEFAULT 'general',
  agent_name TEXT,
  total_tasks INTEGER DEFAULT 0,
  completed_tasks INTEGER DEFAULT 0,
  failed_tasks INTEGER DEFAULT 0,
  pending_tasks INTEGER DEFAULT 0,
  config JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_projects_agent_id ON projects(agent_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);

-- project_tasks table
CREATE TABLE IF NOT EXISTS project_tasks (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT DEFAULT 'general' CHECK (task_type IN ('research', 'code', 'design', 'testing', 'deployment', 'docs', 'communication', 'general')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'in_progress', 'blocked', 'completed', 'failed', 'skipped', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  assigned_agent TEXT DEFAULT 'general',
  assigned_agent_name TEXT,
  depends_on BIGINT[] DEFAULT '{}',
  context TEXT,
  task_prompt TEXT,
  result TEXT,
  error TEXT,
  output_data JSONB DEFAULT '{}',
  steps_used INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  retries INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 2,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_project_tasks_project_id ON project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_status ON project_tasks(status);
CREATE INDEX IF NOT EXISTS idx_project_tasks_assigned_agent ON project_tasks(assigned_agent);
CREATE INDEX IF NOT EXISTS idx_project_tasks_scheduled_at ON project_tasks(scheduled_at) WHERE status = 'queued';

-- project_task_logs table
CREATE TABLE IF NOT EXISTS project_task_logs (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id BIGINT NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  action TEXT NOT NULL DEFAULT 'execute',
  status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'completed', 'failed', 'timeout', 'cancelled')),
  message TEXT,
  agent_id TEXT,
  agent_name TEXT,
  tool_calls JSONB DEFAULT '[]',
  steps_used INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  attempt_number INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_task_logs_task_id ON project_task_logs(task_id);

-- Updated_at triggers
CREATE OR REPLACE FUNCTION update_projects_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_projects_updated_at ON projects;
CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_projects_updated_at();

CREATE OR REPLACE FUNCTION update_project_tasks_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_project_tasks_updated_at ON project_tasks;
CREATE TRIGGER trg_project_tasks_updated_at BEFORE UPDATE ON project_tasks FOR EACH ROW EXECUTE FUNCTION update_project_tasks_updated_at();

-- Helper: update project task counts
CREATE OR REPLACE FUNCTION update_project_task_counts(p_project_id BIGINT) RETURNS void AS $$
DECLARE v_total INTEGER; v_completed INTEGER; v_failed INTEGER; v_pending INTEGER;
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'completed'), COUNT(*) FILTER (WHERE status = 'failed'), COUNT(*) FILTER (WHERE status IN ('pending', 'queued', 'in_progress', 'blocked'))
  INTO v_total, v_completed, v_failed, v_pending FROM project_tasks WHERE project_id = p_project_id;
  UPDATE projects SET total_tasks = v_total, completed_tasks = v_completed, failed_tasks = v_failed, pending_tasks = v_pending,
    status = CASE WHEN v_total = 0 THEN 'planning' WHEN v_completed = v_total THEN 'completed' WHEN v_failed > 0 AND v_completed + v_failed = v_total THEN 'failed' WHEN v_completed > 0 OR v_failed > 0 THEN 'in_progress' ELSE 'planning' END
  WHERE id = p_project_id;
END;
$$ LANGUAGE plpgsql;

-- Helper: get next executable tasks
CREATE OR REPLACE FUNCTION get_next_executable_tasks(p_project_id BIGINT, p_limit INTEGER DEFAULT 5) RETURNS SETOF project_tasks AS $$
BEGIN RETURN QUERY
  SELECT pt.* FROM project_tasks pt WHERE pt.project_id = p_project_id AND pt.status IN ('pending', 'queued')
    AND (array_length(pt.depends_on, 1) IS NULL OR NOT EXISTS (SELECT 1 FROM project_tasks dep WHERE dep.id = ANY(pt.depends_on) AND dep.status NOT IN ('completed', 'skipped')))
    AND NOT EXISTS (SELECT 1 FROM project_tasks dep WHERE dep.id = ANY(pt.depends_on) AND dep.status = 'failed')
  ORDER BY CASE pt.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 2 END, pt.sort_order ASC, pt.created_at ASC LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Trigger: auto-update project when task status changes
CREATE OR REPLACE FUNCTION on_project_task_status_change() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM update_project_task_counts(NEW.project_id);
    IF NEW.status = 'in_progress' THEN UPDATE projects SET started_at = COALESCE(started_at, NOW()), status = 'in_progress' WHERE id = NEW.project_id AND status = 'planning'; END IF;
    IF NEW.status = 'completed' THEN UPDATE projects SET completed_at = NOW() WHERE id = NEW.project_id AND completed_tasks = total_tasks; END IF;
  END IF; RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_project_task_status_change ON project_tasks;
CREATE TRIGGER trg_project_task_status_change AFTER INSERT OR UPDATE OF status ON project_tasks FOR EACH ROW EXECUTE FUNCTION on_project_task_status_change();
`;

// ---------------------------------------------------------------------------
// Performance Indexes — Added to optimize hot query paths
// ---------------------------------------------------------------------------
// These indexes target specific queries identified via code analysis:
//
// 1. agent_tasks(status, trigger_type) — Task processor cron filters pending
//    tasks by trigger_type IN (...). The existing idx_agent_tasks_status only
//    covers (status, created_at), not trigger_type.
//
// 2. analytics_events(created_at DESC) — Analytics dashboard time-range queries
//    that filter on created_at without a type column. The existing indexes all
//    lead with type or agent_id.
//
// 3. agent_tasks(status, completed_at DESC) — Recent completed/failed tasks
//    query in tools.ts that filters by status IN (...) AND completed_at > now.
// ---------------------------------------------------------------------------

export const PERFORMANCE_INDEXES_SQL = `
-- Task processor cron: WHERE status = 'pending' AND trigger_type IN (...)
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status_trigger
  ON agent_tasks(status, trigger_type);

-- Analytics time-range queries: WHERE created_at > $1 (no type filter)
CREATE INDEX IF NOT EXISTS idx_analytics_created_at
  ON analytics_events(created_at DESC);

-- Recent completed/failed tasks: WHERE status IN (...) AND completed_at > now
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status_completed
  ON agent_tasks(status, completed_at DESC);
`;

export const UNIFIED_SETUP_SQL = `
-- ============================================================
-- Klawhub — Unified Database Setup
-- Single script to create ALL tables in dependency order.
-- Safe to re-run (all CREATE TABLE/INDEX use IF NOT EXISTS).
--
-- Order:
--   1. Core tables (SCHEMA_SQL) — analytics, conversations, automations, etc.
--   2. Phase 2 tables — agent_activity, agent_status
--   3. Phase 3 tables — agent_tasks, delegations
--   4. Key usage table — key_usage
--   5. Phase 4 tables — proactive_notifications, learning_insights, a2a_messages,
--      a2a_tasks, task_board, agent_routines, agent_memory migration
--      (Phase 2 tables duplicated here — safe via IF NOT EXISTS)
--   6. Phase 5 tables — projects, project_tasks, project_task_logs
--   7. Workflow tables — agent_workflows, workflow_steps, workflow_executions
--   8. A2A extended tables — a2a_shared_context, a2a_channels, a2a_channel_messages
--   9. RLS fix — enable Row Level Security + permissive policies
--
-- SKIP: WORKSPACE_SCHEMA_SQL — this is a DUPLICATE of tables in SCHEMA_SQL
--       (reminders, todos, contacts). Including it would be harmless but redundant.
-- ============================================================

-- 1. Core tables
${SCHEMA_SQL}

-- 2. Phase 2 tables
${PHASE2_SCHEMA_SQL}

-- 3. Phase 3 tables
${PHASE3_SCHEMA_SQL}

-- 4. Key usage table
${KEY_USAGE_SCHEMA_SQL}

-- 5. Phase 4 tables (includes duplicated Phase 2 — safe via IF NOT EXISTS)
${PHASE4_SCHEMA_SQL}

-- 6. Phase 5 tables (projects + task graph)
${PHASE5_SCHEMA_SQL}

-- 7. Workflow tables (Phase 7B)
${WORKFLOW_SCHEMA_SQL}

-- 8. A2A extended tables (shared context, channels, channel messages + functions)
${A2A_EXTENDED_TABLES_SQL}

-- 9. RLS fix (MUST be last — needs all tables to exist)
${RLS_FIX_SQL}

-- 10. Performance indexes (safe to re-run, uses IF NOT EXISTS)
${PERFORMANCE_INDEXES_SQL}
`;
