// ---------------------------------------------------------------------------
// Agent Routines — Schema and types for scheduled agent routines
// ---------------------------------------------------------------------------

/** SQL schema for the agent_routines table. */
export const AGENT_ROUTINES_SCHEMA = `
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
  last_status TEXT DEFAULT NULL,
  next_run TIMESTAMPTZ NOT NULL,
  last_result TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_routines_agent_id ON agent_routines(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_routines_next_run ON agent_routines(next_run);
CREATE INDEX IF NOT EXISTS idx_agent_routines_is_active ON agent_routines(is_active);

-- Example routines (commented out — insert manually as needed)
-- Mail Agent: Check inbox every 30 minutes
-- INSERT INTO agent_routines (agent_id, name, task, context, interval_minutes, priority, is_active, next_run)
-- VALUES ('mail', 'Inbox Monitor', 'Check inbox for unread emails. Summarize urgent ones (URGENT or HIGH priority only). Flag any emails requiring immediate action.', 'Focus on urgent/important emails only. Skip newsletters and low-priority messages.', 30, 'high', true, NOW());

-- Ops Agent: Health check every hour
-- INSERT INTO agent_routines (agent_id, name, task, context, interval_minutes, priority, is_active, next_run)
-- VALUES ('ops', 'System Health Check', 'Check the health status of all connected services. Report any issues found.', 'Include service status, deployment status, and any anomalies.', 60, 'medium', true, NOW());
`;
