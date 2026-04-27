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

// Re-export all schema SQL constants from their canonical source files.
// This is the single entry-point for importing any schema constant.

// Core tables (analytics, conversations, automations, user_preferences, agent_memory,
// reminders, todos, contacts) + their indexes
export { SCHEMA_SQL } from "@/lib/schema/supabase";

// Phase 2 — Agent activity log + persistent agent status
export { PHASE2_SCHEMA_SQL } from "@/lib/schema/supabase";

// Phase 3 — Agent task queue + delegation tracking
export { PHASE3_SCHEMA_SQL } from "@/lib/schema/supabase";

// Key usage tracking (smart API key rotation)
export { KEY_USAGE_SCHEMA_SQL } from "@/lib/schema/supabase";

// RLS fix — enables Row Level Security + permissive policies on all Klawhub tables
export { RLS_FIX_SQL } from "@/lib/schema/supabase";

// Phase 4 tables (proactive_notifications, learning_insights, task_board, agent_routines)
// Duplicates removed in Step 5 — A2A, Phase2, Memory Migration now import from canonical sources.
export { PHASE4_SCHEMA_SQL, PHASE4_TABLE_LIST } from "@/lib/schema/supabase-setup";

// Individual Phase 4 sub-tables for selective setup
export {
  PROACTIVE_NOTIFICATIONS_TABLE_SQL,
  TASK_BOARD_TABLE_SQL,
  AGENT_ROUTINES_TABLE_SQL,
} from "@/lib/schema/supabase-setup";

// A2A tables — re-exported from canonical a2a-schema.ts (more columns than Phase 4 version)
export { A2A_SCHEMA_SQL as A2A_TABLES_SQL } from "@/lib/schema/a2a-schema";

// Phase 2 tables — re-exported from canonical supabase.ts
export { PHASE2_SCHEMA_SQL as PHASE4_PHASE2_TABLES_SQL } from "@/lib/schema/supabase";

// Memory migration — defined in this file as MEMORY_SCHEMA_ENHANCEMENTS_SQL
// Re-exported as MEMORY_MIGRATION_SQL for backward compatibility

// ---------------------------------------------------------------------------
// Skills tables schema (Phase 6 — Self-Improvement)
//
// Tables: skills, skill_ratings, skill_evaluations, skill_evolution
// These power the Skill Library and Skill Evolution pages.
// ---------------------------------------------------------------------------

export const SKILLS_SCHEMA_SQL = `
-- Skills Library
CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(120) NOT NULL UNIQUE,
  display_name VARCHAR(200),
  description TEXT NOT NULL,
  category VARCHAR(50) DEFAULT 'general',
  difficulty VARCHAR(50) DEFAULT 'intermediate',
  prompt_template TEXT NOT NULL,
  workflow_steps JSONB DEFAULT '[]',
  required_tools TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  agent_bindings TEXT[] DEFAULT NULL,
  version INTEGER DEFAULT 1,
  performance_score NUMERIC(5,2),
  avg_rating NUMERIC(3,2) DEFAULT 0,
  total_uses INTEGER DEFAULT 0,
  successful_uses INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  is_builtin BOOLEAN DEFAULT FALSE,
  has_embedding BOOLEAN DEFAULT FALSE,
  created_by VARCHAR(100) DEFAULT 'system',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skills_active ON skills(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);

-- Skill Ratings
CREATE TABLE IF NOT EXISTS skill_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  agent_id VARCHAR(100) NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skill_ratings_skill ON skill_ratings(skill_id);

-- Skill Evaluations
CREATE TABLE IF NOT EXISTS skill_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  agent_id VARCHAR(100) NOT NULL,
  task_id UUID,
  input_summary TEXT NOT NULL,
  output_summary TEXT NOT NULL,
  success BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skill_evals_skill ON skill_evaluations(skill_id);

-- Skill Evolution
CREATE TABLE IF NOT EXISTS skill_evolution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  agent_id VARCHAR(100) NOT NULL,
  previous_version INTEGER NOT NULL,
  new_version INTEGER,
  previous_prompt TEXT NOT NULL,
  new_prompt TEXT,
  trigger_summary TEXT,
  evaluations_context JSONB DEFAULT '[]',
  improvement_summary TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skill_evolution_skill ON skill_evolution(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_evolution_status ON skill_evolution(status);

CREATE OR REPLACE FUNCTION update_skills_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_skills_updated_at ON skills;
CREATE TRIGGER trg_skills_updated_at BEFORE UPDATE ON skills FOR EACH ROW EXECUTE FUNCTION update_skills_updated_at();
`;

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
  completed_at TIMESTAMPTZ,
  resumable_from_step INTEGER
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
  next_retry_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workflow_id, step_number)
);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow ON workflow_steps(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_status ON workflow_steps(status);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_next_retry ON workflow_steps(next_retry_at) WHERE next_retry_at IS NOT NULL AND status = 'failed';

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
// A2A Enhanced Tables — Single source of truth is a2a-schema.ts
// Re-exported here for convenience. The UNIFIED_SETUP_SQL below uses A2A_SCHEMA_SQL.
// ---------------------------------------------------------------------------

// Re-export A2A_SCHEMA_SQL as A2A_EXTENDED_TABLES_SQL for backward compat
export { A2A_SCHEMA_SQL as A2A_EXTENDED_TABLES_SQL } from "@/lib/schema/a2a-schema";


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
  // Skills (SKILLS_SCHEMA_SQL)
  "skills",
  "skill_ratings",
  "skill_evaluations",
  "skill_evolution",
  // A2A Extended
  "a2a_shared_context",
  "a2a_channels",
  "a2a_channel_messages",
  // Phase 3B — Proactive Scanning & Pull-Based Triggers
  "triggers",
  "scan_state",
  "trigger_events",
  "scan_logs",
  // Self-Improvement (SELF_IMPROVEMENT_SCHEMA_SQL)
  "agent_metrics",
  "agent_skills",
  // Cron Self-Improvement (SELF_IMPROVEMENT_CRON_SCHEMA_SQL)
  "self_improvement_runs",
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
} from "@/lib/schema/supabase";

import { PHASE4_SCHEMA_SQL } from "@/lib/schema/supabase-setup";

// Import A2A schema from canonical source (a2a-schema.ts)
import { A2A_SCHEMA_SQL } from "@/lib/schema/a2a-schema";

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

// ---------------------------------------------------------------------------
// Self-Improvement Tables (Phase 6 — Agent Metrics & Skills Bindings)
//
// Tables: agent_metrics, agent_skills
// These power the self-improvement system (benchmarking, knowledge sharing)
// and the skill equip system (per-agent skill bindings).
// ---------------------------------------------------------------------------

export const SELF_IMPROVEMENT_SCHEMA_SQL = `
-- Agent Metrics — benchmark results, strategy updates, knowledge shares
CREATE TABLE IF NOT EXISTS agent_metrics (
  id BIGSERIAL PRIMARY KEY,
  agent_id VARCHAR(100) NOT NULL,
  metric_type VARCHAR(50) NOT NULL,
  metric_value TEXT NOT NULL DEFAULT '',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_metrics_agent_type ON agent_metrics(agent_id, metric_type);
CREATE INDEX IF NOT EXISTS idx_agent_metrics_created ON agent_metrics(created_at DESC);

-- Unique constraint for ON CONFLICT: one benchmark per agent per day
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_metrics_agent_type_day
  ON agent_metrics(agent_id, metric_type, created_at::date);

-- Agent Skills — per-agent skill equip bindings
CREATE TABLE IF NOT EXISTS agent_skills (
  id BIGSERIAL PRIMARY KEY,
  agent_id VARCHAR(100) NOT NULL,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  is_equipped BOOLEAN DEFAULT TRUE,
  proficiency NUMERIC(3,2) DEFAULT 0.50,
  total_uses INTEGER DEFAULT 0,
  successful_uses INTEGER DEFAULT 0,
  equipped_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_skills_agent ON agent_skills(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_skills_skill ON agent_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_agent_skills_equipped ON agent_skills(agent_id) WHERE is_equipped = TRUE;
`;

// ---------------------------------------------------------------------------
// Self-Improvement Cron Table
//
// Tracks runs of the automated self-improvement cron job (codebase scanning,
// improvement suggestions, GitHub commit pushes).
// ---------------------------------------------------------------------------

export const SELF_IMPROVEMENT_CRON_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS self_improvement_runs (
  id SERIAL PRIMARY KEY,
  run_id TEXT NOT NULL,
  focus TEXT,
  files_scanned INTEGER DEFAULT 0,
  commits_pushed INTEGER DEFAULT 0,
  improvements JSONB DEFAULT '[]',
  error TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_self_improvement_runs_created ON self_improvement_runs(created_at DESC);
`;

// ---------------------------------------------------------------------------
// Phase 4 — Memory Schema Enhancements
//
// Adds the metadata column to agent_memory (missing from original DDL)
// and extends the category CHECK constraint to support the 3-layer
// memory architecture (episodic, semantic, procedural).
// ---------------------------------------------------------------------------

export const MEMORY_SCHEMA_ENHANCEMENTS_SQL = `
-- Add metadata column to agent_memory (TypeScript type expects it)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agent_memory' AND column_name = 'metadata') THEN
    ALTER TABLE agent_memory ADD COLUMN metadata JSONB DEFAULT '{}';
  END IF;
END $$;

-- Extend category CHECK constraint to support 3-layer memory
DO $$ BEGIN
  ALTER TABLE agent_memory DROP CONSTRAINT IF EXISTS agent_memory_category_check;
  ALTER TABLE agent_memory ADD CONSTRAINT agent_memory_category_check
    CHECK (category IN ('general', 'preference', 'context', 'instruction', 'episodic', 'semantic', 'procedural'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
`;

// Backward-compat alias
export { MEMORY_SCHEMA_ENHANCEMENTS_SQL as MEMORY_MIGRATION_SQL };

// ---------------------------------------------------------------------------
// Phase 3B — Proactive Scanning & Pull-Based Triggers
//
// These tables power the system's ability to reach OUT to external services
// (GitHub, Gmail, Vercel, etc.), detect changes, and fire agent actions.
//
// Tables:
//   - triggers: Declarative trigger rules (user/system-defined)
//   - scan_state: Per-source cursor/timestamp for change detection
//   - trigger_events: Incoming events from scanners and webhooks
//
// Flow:
//   Scanner → detects change → writes trigger_events → trigger engine evaluates
//   Webhook → writes trigger_events → trigger engine evaluates
//   Trigger engine → matches events against triggers → creates agent_tasks
// ---------------------------------------------------------------------------

export const PROACTIVE_SCANNING_SCHEMA_SQL = `
-- ─── Triggers: Declarative event → action rules ───
-- Users and the system can define triggers like:
--   "When a new GitHub issue is created, assign it to Code Agent"
--   "When an urgent email arrives, notify Mail Agent"
CREATE TABLE IF NOT EXISTS triggers (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- What to watch for
  source VARCHAR(50) NOT NULL CHECK (source IN ('github', 'gmail', 'vercel', 'webhook', 'schedule', 'condition', 'custom')),
  event_type VARCHAR(100) NOT NULL,  -- e.g. 'issue_opened', 'pr_merged', 'email_urgent', 'deploy_failed'
  filter_config JSONB DEFAULT '{}',  -- Advanced filters: { state: 'open', labels: ['bug'], priority: 'high' }

  -- What to do when triggered
  action_type VARCHAR(50) NOT NULL DEFAULT 'create_task' CHECK (action_type IN ('create_task', 'send_notification', 'send_a2a_message', 'run_workflow', 'run_routine', 'webhook_forward')),
  action_config JSONB DEFAULT '{}',  -- { agent_id: 'code', priority: 'high', task_template: '...' }

  -- Metadata
  agent_id VARCHAR(100),             -- Which agent this trigger is associated with (optional)
  enabled BOOLEAN DEFAULT TRUE,
  cooldown_seconds INTEGER DEFAULT 300,  -- Min seconds between trigger fires (debounce)
  max_fires_per_day INTEGER DEFAULT 50,  -- Rate limit
  created_by VARCHAR(100) DEFAULT 'system',

  -- Tracking
  last_triggered_at TIMESTAMPTZ,
  last_result JSONB,
  fire_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_triggers_source_event ON triggers(source, event_type);
CREATE INDEX IF NOT EXISTS idx_triggers_enabled ON triggers(enabled) WHERE enabled = TRUE;

-- ─── Scan State: Per-source cursor for change detection ───
-- Each scanner (GitHub, Gmail, Vercel) stores its last-seen position
-- so it only picks up NEW changes on the next scan.
CREATE TABLE IF NOT EXISTS scan_state (
  id BIGSERIAL PRIMARY KEY,
  source VARCHAR(50) NOT NULL UNIQUE,  -- 'github', 'gmail', 'vercel', etc.
  cursor TEXT,                           -- Opaque cursor (e.g., GitHub etag, Gmail historyId, timestamp)
  last_scan_at TIMESTAMPTZ DEFAULT NOW(),
  last_scan_status VARCHAR(50) DEFAULT 'idle',  -- 'idle', 'running', 'success', 'error'
  last_scan_error TEXT,
  items_found INTEGER DEFAULT 0,
  items_processed INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',          -- Source-specific state (e.g., { repo: 'owner/repo' })
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Trigger Events: Ingested events from scanners and webhooks ───
-- Every external change (new issue, email, deploy) becomes a row here.
-- The trigger engine reads unprocessed events and matches them to triggers.
CREATE TABLE IF NOT EXISTS trigger_events (
  id BIGSERIAL PRIMARY KEY,
  source VARCHAR(50) NOT NULL,          -- Where the event came from: 'github', 'gmail', 'vercel', 'webhook'
  event_type VARCHAR(100) NOT NULL,     -- What happened: 'issue_opened', 'pr_merged', 'email_urgent', etc.
  external_id VARCHAR(255),             -- Dedup key: e.g., GitHub issue URL, Gmail message ID, Vercel deployment ID
  title TEXT NOT NULL,                  -- Human-readable summary: 'New issue: Fix login bug'
  payload JSONB DEFAULT '{}',           -- Full event data (GitHub issue JSON, email headers, etc.)
  severity VARCHAR(20) DEFAULT 'normal' CHECK (severity IN ('critical', 'high', 'medium', 'low', 'normal')),

  -- Processing state
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'processed', 'skipped', 'error')),
  matched_trigger_id BIGINT REFERENCES triggers(id) ON DELETE SET NULL,
  matched_agent_task_id BIGINT,
  processing_result JSONB,
  error_message TEXT,
  processed_at TIMESTAMPTZ,

  -- Timing
  event_timestamp TIMESTAMPTZ DEFAULT NOW(),  -- When the external event actually occurred
  created_at TIMESTAMPTZ DEFAULT NOW()       -- When we ingested the event
);

CREATE INDEX IF NOT EXISTS idx_trigger_events_source ON trigger_events(source, event_type);
CREATE INDEX IF NOT EXISTS idx_trigger_events_status ON trigger_events(status);
CREATE INDEX IF NOT EXISTS idx_trigger_events_external_id ON trigger_events(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trigger_events_created ON trigger_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trigger_events_severity ON trigger_events(severity) WHERE status = 'pending';

-- ─── Scan Logs: Audit trail for scanner runs ───
-- Records each scanner execution for debugging and monitoring.
CREATE TABLE IF NOT EXISTS scan_logs (
  id BIGSERIAL PRIMARY KEY,
  source VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,          -- 'started', 'completed', 'error'
  events_found INTEGER DEFAULT 0,
  events_created INTEGER DEFAULT 0,
  triggers_fired INTEGER DEFAULT 0,
  error_message TEXT,
  duration_ms INTEGER,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_scan_logs_source ON scan_logs(source, started_at DESC);

-- ─── Helper: Cleanup old trigger_events and scan_logs ───
CREATE OR REPLACE FUNCTION cleanup_trigger_data()
RETURNS INTEGER AS $$
DECLARE v_events INTEGER; v_logs INTEGER;
BEGIN
  DELETE FROM trigger_events WHERE created_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS v_events = ROW_COUNT;
  DELETE FROM scan_logs WHERE started_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS v_logs = ROW_COUNT;
  RETURN v_events + v_logs;
END;
$$ LANGUAGE plpgsql;

-- ─── Trigger: Update triggers.updated_at on row change ───
CREATE OR REPLACE FUNCTION update_triggers_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_triggers_updated_at ON triggers;
CREATE TRIGGER trg_triggers_updated_at BEFORE UPDATE ON triggers FOR EACH ROW EXECUTE FUNCTION update_triggers_updated_at();

-- ─── Trigger: Update scan_state.updated_at on row change ───
CREATE OR REPLACE FUNCTION update_scan_state_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_scan_state_updated_at ON scan_state;
CREATE TRIGGER trg_scan_state_updated_at BEFORE UPDATE ON scan_state FOR EACH ROW EXECUTE FUNCTION update_scan_state_updated_at();
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
--   5. Phase 4 tables — proactive_notifications, learning_insights,
--      task_board, agent_routines (duplicates removed in Step 5)
--   6. Phase 5 tables — projects, project_tasks, project_task_logs
--   7. Workflow tables — agent_workflows, workflow_steps, workflow_executions
--   8. A2A extended tables — a2a_shared_context, a2a_channels, a2a_channel_messages
--   9. Phase 3B tables — triggers, scan_state, trigger_events, scan_logs
--  10. RLS fix — enable Row Level Security + permissive policies
--
-- NOTE: WORKSPACE_SCHEMA_SQL was removed in Step 5 (was a duplicate of SCHEMA_SQL).
-- ============================================================

-- 1. Core tables
${SCHEMA_SQL}

-- 2. Phase 2 tables
${PHASE2_SCHEMA_SQL}

-- 3. Phase 3 tables
${PHASE3_SCHEMA_SQL}

-- 4. Key usage table
${KEY_USAGE_SCHEMA_SQL}

-- 5. Phase 4 tables (unique only — no duplicates)
${PHASE4_SCHEMA_SQL}

-- 6. Phase 5 tables (projects + task graph)
${PHASE5_SCHEMA_SQL}

-- 7. Workflow tables (Phase 7B)
${WORKFLOW_SCHEMA_SQL}

-- 8. Skills tables (Phase 6 — Self-Improvement)
${SKILLS_SCHEMA_SQL}

-- 9. A2A tables (messages, shared context, channels, channel messages, tasks + functions)
${A2A_SCHEMA_SQL}

-- 10. Phase 3B — Proactive Scanning & Pull-Based Triggers
${PROACTIVE_SCANNING_SCHEMA_SQL}

-- 11. Phase 4 — Memory Schema Enhancements
${MEMORY_SCHEMA_ENHANCEMENTS_SQL}

-- 12. RLS fix (MUST be last — needs all tables to exist)
${RLS_FIX_SQL}

-- 13. Performance indexes (safe to re-run, uses IF NOT EXISTS)
${PERFORMANCE_INDEXES_SQL}

-- 14. Self-Improvement tables (agent_metrics, agent_skills)
${SELF_IMPROVEMENT_SCHEMA_SQL}

-- 15. Self-Improvement cron tables (self_improvement_runs)
${SELF_IMPROVEMENT_CRON_SCHEMA_SQL}

-- 16. Unique constraint on learning_insights for ON CONFLICT support
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_learning_insights_agent_type_content
    ON learning_insights(agent_id, insight_type, md5(content));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
`;
