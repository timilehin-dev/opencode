-- ============================================================================
-- Klawhub pg_cron + pg_net Backup Triggers (FIXED)
-- ============================================================================
--
-- This SQL sets up Supabase pg_cron + pg_net to trigger GitHub Actions
-- workflows as a BACKUP to GitHub Actions' built-in cron.
--
-- WHY BOTH?
--   GitHub Actions cron on free tier can have delays (up to 60+ min during peak).
--   pg_cron fires reliably every N minutes, calling GitHub's repository_dispatch
--   API to trigger the workflow immediately — no delay.
--
-- HOW IT WORKS:
--   pg_cron.schedule() → runs every N minutes
--     → calls trigger_github_dispatch() → calls pg_net.http_post()
--       → hits GitHub API /repos/OWNER/REPO/dispatches
--         → triggers repository_dispatch → workflow runs immediately
--
-- PREREQUISITES:
--   1. pg_cron extension enabled in Supabase ✅
--   2. pg_net extension enabled in Supabase ✅
--   3. A GitHub Personal Access Token (PAT) with repo scope
--
-- SETUP:
--   1. Create a GitHub PAT at https://github.com/settings/tokens
--      → Classic token → scopes: repo (full control of private repos)
--   2. Run the SQL below in the Supabase SQL Editor
--   3. Replace 'ghp_YOUR_TOKEN_HERE' with your actual PAT (STEP 1)
--   4. Replace 'timilehin-dev/my-project-tau-two-70' with your repo if different
-- ============================================================================


-- ============================================================================
-- STEP 1: Create a secure config table and store your GitHub PAT
-- ============================================================================
-- Uses a plain table instead of Vault (Vault API changes across Supabase versions)
-- The table is owned by postgres superuser, RLS can block client access.

CREATE TABLE IF NOT EXISTS public._cron_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Restrict access — only the function below reads from this table
ALTER TABLE public._cron_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "cron_config_deny_all" ON public._cron_config
    FOR ALL USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Store your GitHub PAT (REPLACE 'ghp_YOUR_TOKEN_HERE' with your actual token)
INSERT INTO public._cron_config (key, value)
VALUES ('github_pat', 'ghp_YOUR_TOKEN_HERE')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


-- ============================================================================
-- STEP 2: Create the dispatch function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_github_dispatch(p_event_type TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_github_token TEXT;
  v_repo TEXT;
  v_url TEXT;
  v_result JSONB;
BEGIN
  -- Get GitHub PAT from config table (bypasses RLS since SECURITY DEFINER runs as owner)
  SELECT value INTO v_github_token
  FROM public._cron_config
  WHERE key = 'github_pat';

  IF v_github_token IS NULL OR v_github_token = '' THEN
    RAISE LOG '[klawhub:cron] No github_pat configured, skipping dispatch';
    RETURN;
  END IF;

  -- YOUR GITHUB REPO — change if needed
  v_repo := 'timilehin-dev/my-project-tau-two-70';
  v_url  := 'https://api.github.com/repos/' || v_repo || '/dispatches';

  -- Fire async HTTP request via pg_net (non-blocking)
  SELECT net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Authorization',  'token ' || v_github_token,
      'Accept',         'application/vnd.github.v3+json',
      'Content-Type',   'application/json',
      'User-Agent',     'klawhub-pg_cron'
    ),
    body    := jsonb_build_object('event_type', p_event_type)::text
  ) INTO v_result;

  RAISE LOG '[klawhub:cron] Dispatched "%" → % (net.%: %)',
    p_event_type, v_repo,
    (v_result->>'method')::text,
    (v_result->>'status')::text;

EXCEPTION WHEN OTHERS THEN
  RAISE LOG '[klawhub:cron] Dispatch failed for "%": %', p_event_type, SQLERRM;
END;
$func$;


-- ============================================================================
-- STEP 3: Schedule the pg_cron jobs
-- ============================================================================
-- Offsets from GitHub Actions cron to avoid triggering the same second.
-- pg_cron uses UTC.
-- ============================================================================

-- Task Executor: every 3 min (GitHub Actions: every 2 min) — offset by 1 min
SELECT cron.schedule(
  'klawhub-task-executor',
  '1,4,7,10,13,16,19,22,25,28,31,34,37,40,43,46,49,52,55,58 * * * *',
  $$SELECT trigger_github_dispatch('task-executor');$$
);

-- Routine Runner: every 15 min (GitHub Actions: every 10 min) — offset by 5 min
SELECT cron.schedule(
  'klawhub-routine-runner',
  '5,20,35,50 * * * *',
  $$SELECT trigger_github_dispatch('routine-runner');$$
);

-- Reminder Processor: every 8 min (GitHub Actions: every 5 min) — offset by 3 min
SELECT cron.schedule(
  'klawhub-reminder-processor',
  '3,11,19,27,35,43,51,59 * * * *',
  $$SELECT trigger_github_dispatch('reminder-processor');$$
);

-- Health Check: hourly at :30 (GitHub Actions: every hour at :00)
SELECT cron.schedule(
  'klawhub-health-check',
  '30 * * * *',
  $$SELECT trigger_github_dispatch('health-check');$$
);


-- ============================================================================
-- STEP 4: Verify
-- ============================================================================

SELECT jobid, schedule, command
FROM cron.job
WHERE command LIKE '%trigger_github_dispatch%'
ORDER BY jobid;


-- ============================================================================
-- MANAGEMENT (run individually as needed)
-- ============================================================================

-- Test a dispatch right now:
--   SELECT trigger_github_dispatch('task-executor');

-- View all scheduled jobs:
--   SELECT jobid, schedule, command FROM cron.job ORDER BY jobid;

-- Remove all Klawhub backup triggers:
--   SELECT cron.unschedule(jobid) FROM cron.job WHERE command LIKE '%trigger_github_dispatch%';

-- Check pg_net HTTP call history:
--   SELECT id, method, url, status_code, created FROM net._http_response ORDER BY id DESC LIMIT 20;

-- Update your GitHub PAT later:
--   UPDATE _cron_config SET value = 'ghp_NEW_TOKEN', updated_at = NOW() WHERE key = 'github_pat';
