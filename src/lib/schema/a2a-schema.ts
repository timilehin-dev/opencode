// ---------------------------------------------------------------------------
// Klawhub — A2A Database Schema
//
// All CREATE TABLE and CREATE FUNCTION statements for the Agent-to-Agent
// communication layer. Exported as a single SQL constant so it can be executed
// by the /api/setup/a2a route or included in the master setup.
// ---------------------------------------------------------------------------

export const A2A_SCHEMA_SQL = `
-- ============================================================
-- A2A Tables
-- ============================================================

-- 1. a2a_messages — async messages between agents
CREATE TABLE IF NOT EXISTS a2a_messages (
  id BIGSERIAL PRIMARY KEY,
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('request', 'response', 'broadcast', 'context_share', 'handoff', 'collaboration')),
  topic TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'delivered' CHECK (status IN ('pending', 'delivered', 'completed', 'failed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  correlation_id TEXT,
  parent_message_id BIGINT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE
);

-- 2. a2a_shared_context — versioned key-value shared context
CREATE TABLE IF NOT EXISTS a2a_shared_context (
  id BIGSERIAL PRIMARY KEY,
  context_key TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}',
  content_text TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  scope TEXT NOT NULL DEFAULT 'project' CHECK (scope IN ('global', 'project', 'session', 'agent')),
  version INTEGER NOT NULL DEFAULT 1,
  is_latest BOOLEAN NOT NULL DEFAULT TRUE,
  access_agents TEXT[] NOT NULL DEFAULT '{}',
  project_id BIGINT,
  session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. a2a_channels — persistent multi-agent collaboration channels
CREATE TABLE IF NOT EXISTS a2a_channels (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  channel_type TEXT NOT NULL DEFAULT 'project',
  project_id BIGINT,
  created_by TEXT NOT NULL,
  members TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_message_at TIMESTAMPTZ,
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. a2a_channel_messages — messages within collaboration channels
CREATE TABLE IF NOT EXISTS a2a_channel_messages (
  id BIGSERIAL PRIMARY KEY,
  channel_id BIGINT NOT NULL REFERENCES a2a_channels(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'message',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. a2a_tasks — delegation tasks between agents
CREATE TABLE IF NOT EXISTS a2a_tasks (
  id BIGSERIAL PRIMARY KEY,
  initiator_agent TEXT NOT NULL,
  assigned_agent TEXT NOT NULL,
  task TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  result TEXT,
  delegation_chain JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ============================================================
-- A2A Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_a2a_messages_to_agent_unread ON a2a_messages(to_agent, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_a2a_messages_from_agent ON a2a_messages(from_agent, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_a2a_messages_correlation ON a2a_messages(correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_a2a_messages_created ON a2a_messages(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_a2a_shared_context_key_latest ON a2a_shared_context(context_key, is_latest) WHERE is_latest = TRUE;
CREATE INDEX IF NOT EXISTS idx_a2a_shared_context_agent ON a2a_shared_context(agent_id, scope);
CREATE INDEX IF NOT EXISTS idx_a2a_shared_context_tags ON a2a_shared_context USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_a2a_shared_context_updated ON a2a_shared_context(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_a2a_channels_active ON a2a_channels(is_active, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_a2a_channels_members ON a2a_channels USING GIN(members);

CREATE INDEX IF NOT EXISTS idx_a2a_channel_messages_channel ON a2a_channel_messages(channel_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_a2a_tasks_assigned ON a2a_tasks(assigned_agent, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_a2a_tasks_initiator ON a2a_tasks(initiator_agent, status, created_at DESC);

-- ============================================================
-- A2A Functions
-- ============================================================

-- get_agent_inbox: Return unread messages sorted by priority then time
CREATE OR REPLACE FUNCTION get_agent_inbox(p_agent_id TEXT, p_limit INT DEFAULT 50)
RETURNS TABLE (
  id BIGINT,
  from_agent TEXT,
  type TEXT,
  topic TEXT,
  payload JSONB,
  priority TEXT,
  created_at TIMESTAMPTZ,
  correlation_id TEXT
)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT m.id, m.from_agent, m.type, m.topic, m.payload, m.priority, m.created_at, m.correlation_id
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
    m.created_at ASC
  LIMIT p_limit;
END;
$$;

-- mark_messages_read: Mark messages as read, return count updated
CREATE OR REPLACE FUNCTION mark_messages_read(p_agent_id TEXT, p_message_ids BIGINT[])
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  updated_count INT;
BEGIN
  UPDATE a2a_messages
  SET is_read = TRUE
  WHERE to_agent = p_agent_id
    AND id = ANY(p_message_ids)
    AND is_read = FALSE;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

-- upsert_shared_context: Store/update shared context with auto-versioning
CREATE OR REPLACE FUNCTION upsert_shared_context(
  p_context_key TEXT,
  p_agent_id TEXT,
  p_content JSONB,
  p_content_text TEXT DEFAULT '',
  p_tags TEXT[] DEFAULT '{}',
  p_access_agents TEXT[] DEFAULT '{}',
  p_scope TEXT DEFAULT 'project',
  p_project_id BIGINT DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  new_id BIGINT;
  new_version INT;
BEGIN
  -- Determine next version number
  SELECT COALESCE(MAX(version), 0) + 1 INTO new_version
  FROM a2a_shared_context
  WHERE context_key = p_context_key;

  -- Mark all previous versions as not latest
  UPDATE a2a_shared_context
  SET is_latest = FALSE, updated_at = NOW()
  WHERE context_key = p_context_key AND is_latest = TRUE;

  -- Insert new version
  INSERT INTO a2a_shared_context (
    context_key, agent_id, content, content_text, tags,
    access_agents, scope, project_id, session_id,
    version, is_latest, updated_at
  ) VALUES (
    p_context_key, p_agent_id, p_content, p_content_text, p_tags,
    p_access_agents, p_scope, p_project_id, p_session_id,
    new_version, TRUE, NOW()
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

-- get_or_create_channel: Idempotently get or create a collaboration channel
CREATE OR REPLACE FUNCTION get_or_create_channel(
  p_name TEXT,
  p_channel_type TEXT DEFAULT 'project',
  p_project_id BIGINT DEFAULT NULL,
  p_members TEXT[] DEFAULT '{}'
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  ch_id BIGINT;
BEGIN
  -- Try to find existing channel
  SELECT id INTO ch_id
  FROM a2a_channels
  WHERE name = p_name
    AND channel_type = p_channel_type
    AND is_active = TRUE
    AND (
      (project_id = p_project_id) OR
      (project_id IS NULL AND p_project_id IS NULL)
    )
  LIMIT 1;

  IF ch_id IS NOT NULL THEN
    RETURN ch_id;
  END IF;

  -- Create new channel
  INSERT INTO a2a_channels (name, channel_type, project_id, members, created_by)
  VALUES (p_name, p_channel_type, p_project_id, p_members, 'system')
  RETURNING id INTO ch_id;

  RETURN ch_id;
END;
$$;

-- expire_old_a2a_messages: Clean up messages older than 30 days
CREATE OR REPLACE FUNCTION expire_old_a2a_messages()
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM a2a_messages
  WHERE created_at < NOW() - INTERVAL '30 days'
    AND is_read = TRUE
    AND status IN ('delivered', 'completed');

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
`;
