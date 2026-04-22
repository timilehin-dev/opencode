-- ============================================================================
-- Claw pg_cron + pg_net Backup Triggers
-- ============================================================================
--
-- These scheduled jobs use Supabase pg_cron + pg_net to trigger GitHub Actions
-- workflows via repository_dispatch as a BACKUP to GitHub Actions' built-in cron.
--
-- WHY BOTH?
--   GitHub Actions cron on free tier can have delays (up to 60+ min during peak).
--   pg_cron fires reliably every N minutes, calling GitHub's repository_dispatch
--   API to trigger the workflow immediately — no delay.
--
-- HOW IT WORKS:
--   pg_cron.schedule() → runs every N minutes
--     → calls pg_net.http_post() → hits GitHub API /repos/OWNER/REPO/dispatches
--       → triggers workflow_run → executor runs immediately
--
-- PREREQUISITES:
--   1. pg_cron extension enabled in Supabase
--   2. pg_net extension enabled in Supabase
--   3. A GitHub Personal Access Token (PAT) with repo scope stored as a secret
--
-- SETUP INSTRUCTIONS:
--   1. Create a GitHub PAT at https://github.com/settings/tokens
--      → Classic token, scopes: repo (full control of private repos)
--   2. In Supabase Dashboard → Settings → Vault → Create new secret
--      → Name: github_pat
--      → Value: ghp_xxxxxxxx
--   3. Replace 'OWNER/REPO' below with your actual GitHub repo
--      (e.g., 'omololu/claw-memento' — whatever your repo is)
--   4. Run this SQL in the Supabase SQL Editor
-- ============================================================================

-- STEP 1: Store your GitHub PAT securely (run ONCE)
-- Replace 'ghp_YOUR_TOKEN_HERE' with your actual GitHub Personal Access Token
-- If you already added it via Supabase Vault, skip this:
INSERT INTO vault.decrypted_secrets (secret_id, secret)
VALUES ('github_pat', 'ghp_YOUR_TOKEN_HERE')
ON CONFLICT (secret_id) DO UPDATE SET secret = EXCLUDED.secret;

-- STEP 2: Create a helper function to trigger GitHub repository_dispatch
-- This encapsulates the pg_net call so pg_cron can invoke it cleanly
CREATE OR REPLACE FUNCTION public.trigger_github_dispatch(p_event_type TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_github_token TEXT;
  v_repo TEXT;
  v_url TEXT;
  v_result JSONB;
BEGIN
  -- Get GitHub PAT from vault
  SELECT decrypted_secret INTO v_github_token
  FROM vault.decrypted_secrets
  WHERE secret_id = 'github_pat';

  IF v_github_token IS NULL OR v_github_token = '' THEN
    RAISE LOG '[pg_cron] No github_pat found in vault, skipping dispatch';
    RETURN;
  END IF;

  -- REPLACE WITH YOUR ACTUAL GITHUB REPO
  v_repo := 'OWNER/REPO';

  v_url := 'https://api.github.com/repos/' || v_repo || '/dispatches';

  -- Make the API call via pg_net (async, non-blocking)
  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Authorization', 'token ' || v_github_token,
      'Accept', 'application/vnd.github.v3+json',
      'Content-Type', 'application/json',
      'User-Agent', 'Claw-pg_cron'
    ),
    body := jsonb_build_object('event_type', p_event_type)::text
  ) INTO v_result;

  RAISE LOG '[pg_cron] Dispatched GitHub event "%" (status: %)', p_event_type, v_result->>'status';
EXCEPTION WHEN OTHERS THEN
  RAISE LOG '[pg_cron] Failed to dispatch GitHub event "%": %', p_event_type, SQLERRM;
END;
$$;


-- ============================================================================
-- STEP 3: Schedule the pg_cron jobs
-- ============================================================================
-- These run INDEPENDENTLY of GitHub Actions cron.
-- Even if GitHub Actions is delayed, pg_cron fires on time and triggers the workflow.
--
-- IMPORTANT: pg_cron uses UTC timezone. All schedules below are in UTC.
-- ============================================================================

-- Task Executor: Every 3 minutes (GitHub Actions fires every 2 min)
-- Offset by 1 minute from GitHub Actions to avoid collisions
SELECT cron.schedule(
  'task-executor-backup',
  '1,4,7,10,13,16,19,22,25,28,31,34,37,40,43,46,49,52,55,58 * * * *',  -- every 3 min, offset by 1
  $$SELECT trigger_github_dispatch('task-executor');$$
);

-- Routine Runner: Every 15 minutes (GitHub Actions fires every 10 min)
SELECT cron.schedule(
  'routine-runner-backup',
  '5,20,35,50 * * * *',  -- every 15 min, offset by 5
  $$SELECT trigger_github_dispatch('routine-runner');$$
);

-- Reminder Processor: Every 8 minutes (GitHub Actions fires every 5 min)
SELECT cron.schedule(
  'reminder-processor-backup',
  '3,11,19,27,35,43,51,59 * * * *',  -- every 8 min, offset by 3
  $$SELECT trigger_github_dispatch('reminder-processor');$$
);

-- Health Check: Every 90 minutes (GitHub Actions fires every hour)
SELECT cron.schedule(
  'health-check-backup',
  '30 * * * *',  -- every hour at :30
  $$SELECT trigger_github_dispatch('health-check');$$
);


-- ============================================================================
-- STEP 4: Verify everything is scheduled
-- ============================================================================

SELECT jobid, schedule, command, nodename, nodeport, database, username
FROM cron.job
WHERE command LIKE '%trigger_github_dispatch%'
ORDER BY jobid;


-- ============================================================================
-- MANAGEMENT COMMANDS (run as needed)
-- ============================================================================

-- View all pg_cron jobs:
-- SELECT * FROM cron.job ORDER BY jobid;

-- Remove a specific job (replace JOB_ID with the actual jobid from the query above):
-- SELECT cron.unschedule(JOB_ID);

-- Remove ALL Claw backup triggers:
-- SELECT cron.unschedule(jobid) FROM cron.job WHERE command LIKE '%trigger_github_dispatch%';

-- Test a single dispatch right now (replace 'task-executor' with any event type):
-- SELECT trigger_github_dispatch('task-executor');

-- Check pg_net call history:
-- SELECT id, method, url, status_code, created FROM net._http_response ORDER BY id DESC LIMIT 20;
