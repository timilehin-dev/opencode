// ---------------------------------------------------------------------------
// Phase 5 Setup — Projects, Task Graph & Inter-Agent Initiation Tables
//
// Persistent project management + proactive agent-to-agent initiation tracking.
// Agents can now proactively reach out, request/offer help, escalate issues.
//
// Tables: projects, project_tasks, project_task_logs, a2a_initiations
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function POST(request: Request) {
  // H3: Setup auth
  const setupSecret = process.env.SETUP_SECRET;
  if (!setupSecret) {
    return NextResponse.json({ error: "SETUP_SECRET not configured" }, { status: 500 });
  }
  const { searchParams } = new URL(request.url);
  if (searchParams.get("secret") !== setupSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.SUPABASE_DB_URL) {
    return NextResponse.json({ error: "SUPABASE_DB_URL not configured" }, { status: 500 });
  }

  try {
    const sql = `
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

-- ============================================================
-- Phase 5B: Inter-Agent Initiation Tracking
-- ============================================================

-- a2a_initiations table — tracks all proactive agent-to-agent initiations
CREATE TABLE IF NOT EXISTS a2a_initiations (
  id BIGSERIAL PRIMARY KEY,
  initiator_agent TEXT NOT NULL,
  target_agent TEXT NOT NULL,
  initiation_type TEXT NOT NULL CHECK (initiation_type IN ('contact', 'help_request', 'assistance_offer', 'escalation', 'collaboration_proposal')),
  subject TEXT NOT NULL,
  context JSONB NOT NULL DEFAULT '{}',
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('low', 'normal', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'delivered' CHECK (status IN ('pending', 'delivered', 'accepted', 'declined', 'in_progress', 'completed', 'expired')),
  response JSONB,
  related_task_id BIGINT,
  related_project_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_a2a_initiations_initiator ON a2a_initiations(initiator_agent);
CREATE INDEX IF NOT EXISTS idx_a2a_initiations_target ON a2a_initiations(target_agent);
CREATE INDEX IF NOT EXISTS idx_a2a_initiations_type ON a2a_initiations(initiation_type);
CREATE INDEX IF NOT EXISTS idx_a2a_initiations_status ON a2a_initiations(status);
CREATE INDEX IF NOT EXISTS idx_a2a_initiations_created ON a2a_initiations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_a2a_initiations_urgency ON a2a_initiations(urgency) WHERE status NOT IN ('completed', 'expired');
`;

    await query(sql);
    return NextResponse.json({
      success: true,
      message: "Phase 5 complete: projects, project_tasks, project_task_logs, and a2a_initiations tables created.",
      tables: ["projects", "project_tasks", "project_task_logs", "a2a_initiations"],
      functions: ["update_project_task_counts", "get_next_executable_tasks", "on_project_task_status_change"],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
