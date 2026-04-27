// ---------------------------------------------------------------------------
// pg_cron Job Manager
//
// Manages Supabase pg_cron jobs for agent routines, task board tasks, and
// scheduled workflows. Each item gets its own dedicated pg_cron job.
//
// Jobs are named:
//   routine-{id}   → /api/cron/execute-routine?routineId=X
//   taskboard-{id} → /api/cron/execute-task?taskId=X
//   workflow-{id}  → /api/cron/execute-workflow?workflowId=X
// ---------------------------------------------------------------------------

import { query } from "@/lib/core/db";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCronBase(): string {
  return (
    process.env.CRON_WEBHOOK_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.NEXT_PUBLIC_BASE_URL)
    || "https://klawhub.xyz"
  );
}

function getCronSecret(): string {
  return process.env.CRON_SECRET || "";
}

/**
 * Sanitize a pg_cron job name to only allow safe characters.
 * pg_cron job names must be valid identifiers: alphanumeric and hyphens only.
 * Rejects anything containing characters that could lead to SQL injection.
 */
function sanitizeJobName(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9-]/g, "");
  if (sanitized !== name || sanitized.length === 0) {
    throw new Error(`Invalid job name: contains unsafe characters or is empty`);
  }
  return sanitized;
}

/**
 * Validate a cron schedule expression.
 * Only allows: digits, asterisks, slashes, commas, hyphens, and spaces.
 */
function validateCronSchedule(schedule: string): void {
  const validPattern = /^[0-9*/,\- ]+$/;
  if (!validPattern.test(schedule)) {
    throw new Error(`Invalid cron schedule: contains disallowed characters`);
  }
  // Must have exactly 5 fields
  const fields = schedule.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Invalid cron schedule: must have exactly 5 fields, got ${fields.length}`);
  }
}

/**
 * Validate that a URL matches the expected base URL pattern.
 * Only allows URLs that start with https:// followed by the known app domain
 * or the configured CRON_WEBHOOK_URL base.
 */
function validateCronUrl(url: string): void {
  const allowedPrefixes: string[] = [];

  const webhookUrl = process.env.CRON_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const parsed = new URL(webhookUrl);
      allowedPrefixes.push(`${parsed.protocol}//${parsed.host}`);
    } catch {
      // ignore invalid URL
    }
  }

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    allowedPrefixes.push(`https://${vercelUrl}`);
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (baseUrl) {
    try {
      const parsed = new URL(baseUrl);
      allowedPrefixes.push(`${parsed.protocol}//${parsed.host}`);
    } catch {
      // ignore invalid URL
    }
  }

  // Default allowed domain
  allowedPrefixes.push("https://klawhub.xyz");

  const isAllowed = allowedPrefixes.some(prefix => url.startsWith(prefix));
  if (!isAllowed) {
    throw new Error(`Invalid cron URL: does not match any allowed base URL`);
  }

  // URL must use https (no http)
  if (!url.startsWith("https://")) {
    throw new Error(`Invalid cron URL: must use HTTPS`);
  }
}

/**
 * Convert interval in minutes to a pg_cron schedule expression.
 * For sub-hourly intervals (e.g. 30 min): star-slash-N schedule
 * For hourly intervals (e.g. 120 min): 0 star-slash-N schedule
 * For daily intervals: 0 0 * * *
 */
export function intervalToCron(minutes: number): string {
  if (minutes < 60) return `*/${minutes} * * * *`;
  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    if (hours === 1) return `0 * * * *`;
    return `0 */${hours} * * *`;
  }
  return `0 0 * * *`;
}

// ---------------------------------------------------------------------------
// Generic register/unregister
// ---------------------------------------------------------------------------

async function registerCronJob(
  jobName: string,
  intervalMinutes: number,
  url: string,
): Promise<{ success: boolean; jobName: string; schedule: string; error?: string }> {
  const schedule = intervalToCron(intervalMinutes);

  try {
    // Sanitize all inputs to prevent SQL injection
    const safeJobName = sanitizeJobName(jobName);
    validateCronSchedule(schedule);
    validateCronUrl(url);

    // Remove existing job if any (using sanitized name)
    await query(`SELECT cron.unschedule('${safeJobName}')`).catch(() => {});

    // Register new job (all values are now validated/sanitized)
    await query(
      `SELECT cron.schedule('${safeJobName}', '${schedule}', $$SELECT net.http_get('${url}')$$)`,
    );

    return { success: true, jobName: safeJobName, schedule };
  } catch (error) {
    return {
      success: false,
      jobName,
      schedule,
      error: error instanceof Error ? error.message : "Failed to register",
    };
  }
}

// ---------------------------------------------------------------------------
// Register: Create a pg_cron job for a routine
// ---------------------------------------------------------------------------

export async function registerRoutineCron(
  routineId: number,
  intervalMinutes: number,
): Promise<{ success: boolean; jobName: string; schedule: string; error?: string }> {
  const jobName = `routine-${routineId}`;
  const appUrl = getCronBase();
  const secret = getCronSecret();
  const url = `${appUrl}/api/cron/execute-routine?secret=${encodeURIComponent(secret)}&routineId=${routineId}`;
  return registerCronJob(jobName, intervalMinutes, url);
}

// ---------------------------------------------------------------------------
// Register: Create a pg_cron job for a task board task
// ---------------------------------------------------------------------------

export async function registerTaskCron(
  taskId: number,
  intervalMinutes: number,
): Promise<{ success: boolean; jobName: string; schedule: string; error?: string }> {
  const jobName = `taskboard-${taskId}`;
  const appUrl = getCronBase();
  const secret = getCronSecret();
  const url = `${appUrl}/api/cron/execute-task?secret=${encodeURIComponent(secret)}&taskId=${taskId}`;
  return registerCronJob(jobName, intervalMinutes, url);
}

// ---------------------------------------------------------------------------
// Register: Create a pg_cron job for a scheduled workflow
// ---------------------------------------------------------------------------

export async function registerWorkflowCron(
  workflowId: string,
  intervalMinutes: number,
): Promise<{ success: boolean; jobName: string; schedule: string; error?: string }> {
  const jobName = `workflow-${workflowId.replace(/[^a-zA-Z0-9-]/g, "")}`;
  const appUrl = getCronBase();
  const secret = getCronSecret();
  const url = `${appUrl}/api/cron/execute-workflow?secret=${encodeURIComponent(secret)}&workflowId=${workflowId}`;
  return registerCronJob(jobName, intervalMinutes, url);
}

// ---------------------------------------------------------------------------
// Unregister: Remove a pg_cron job
// ---------------------------------------------------------------------------

export async function unregisterCron(jobName: string): Promise<void> {
  try {
    const safeJobName = sanitizeJobName(jobName);
    await query(`SELECT cron.unschedule('${safeJobName}')`).catch(() => {});
  } catch {
    // Silently ignore — job may not exist
  }
}

// ---------------------------------------------------------------------------
// Ensure pg_cron extensions are enabled
// ---------------------------------------------------------------------------

export async function ensurePgCronExtensions(): Promise<void> {
  try {
    await query(`CREATE EXTENSION IF NOT EXISTS pg_cron`);
    await query(`CREATE EXTENSION IF NOT EXISTS pg_net`);
  } catch {
    // Extensions may already exist or need superuser
  }
}

// ---------------------------------------------------------------------------
// List all klaw-related pg_cron jobs
// ---------------------------------------------------------------------------

export async function listKlawCronJobs(): Promise<Array<{ jobid: number; jobname: string; schedule: string; active: boolean }>> {
  try {
    const result = await query(
      `SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname LIKE 'routine-%' OR jobname LIKE 'taskboard-%' OR jobname LIKE 'workflow-%' OR jobname LIKE 'klaw-%' ORDER BY jobid`,
    );
    return result.rows as Array<{ jobid: number; jobname: string; schedule: string; active: boolean }>;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Sync: Ensure all active routines in DB have pg_cron jobs
// ---------------------------------------------------------------------------

export async function syncRoutineCronJobs(): Promise<{ registered: number; unregistered: number; errors: string[] }> {
  await ensurePgCronExtensions();
  const result = { registered: 0, unregistered: 0, errors: [] as string[] };

  try {
    const { rows: activeRoutines } = await query(
      `SELECT id, interval_minutes FROM agent_routines WHERE is_active = true`,
    );

    for (const routine of activeRoutines) {
      const r = await registerRoutineCron(Number(routine.id), Number(routine.interval_minutes));
      if (r.success) result.registered++;
      else result.errors.push(`routine-${routine.id}: ${r.error}`);
    }

    const { rows: inactiveRoutines } = await query(
      `SELECT id FROM agent_routines WHERE is_active = false`,
    );

    for (const routine of inactiveRoutines) {
      await unregisterCron(`routine-${routine.id}`);
      result.unregistered++;
    }
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : "Sync failed");
  }

  return result;
}

// ---------------------------------------------------------------------------
// Sync: Ensure all scheduled task board tasks have pg_cron jobs
// ---------------------------------------------------------------------------

export async function syncTaskCronJobs(): Promise<{ registered: number; unregistered: number; errors: string[] }> {
  await ensurePgCronExtensions();
  const result = { registered: 0, unregistered: 0, errors: [] as string[] };

  try {
    // Tasks with a schedule_interval that are not done
    const { rows: scheduledTasks } = await query(
      `SELECT id, schedule_interval FROM task_board
       WHERE schedule_interval IS NOT NULL
         AND schedule_interval > 0
         AND status NOT IN ('done')`,
    );

    for (const task of scheduledTasks) {
      const r = await registerTaskCron(Number(task.id), Number(task.schedule_interval));
      if (r.success) result.registered++;
      else result.errors.push(`taskboard-${task.id}: ${r.error}`);
    }

    // Tasks that are done or have no schedule — clean up their cron jobs
    const { rows: doneTasks } = await query(
      `SELECT id FROM task_board
       WHERE status = 'done' OR schedule_interval IS NULL OR schedule_interval = 0`,
    );

    for (const task of doneTasks) {
      await unregisterCron(`taskboard-${task.id}`);
      result.unregistered++;
    }
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : "Sync failed");
  }

  return result;
}

// ---------------------------------------------------------------------------
// Sync: Ensure all scheduled workflows have pg_cron jobs
// ---------------------------------------------------------------------------

export async function syncWorkflowCronJobs(): Promise<{ registered: number; unregistered: number; errors: string[] }> {
  await ensurePgCronExtensions();
  const result = { registered: 0, unregistered: 0, errors: [] as string[] };

  try {
    // Workflows with a schedule_interval that are active
    const { rows: scheduledWorkflows } = await query(
      `SELECT id, schedule_interval FROM agent_workflows
       WHERE schedule_interval IS NOT NULL
         AND schedule_interval > 0
         AND status NOT IN ('completed', 'failed', 'cancelled')`,
    );

    for (const wf of scheduledWorkflows) {
      const r = await registerWorkflowCron(wf.id, Number(wf.schedule_interval));
      if (r.success) result.registered++;
      else result.errors.push(`workflow-${wf.id}: ${r.error}`);
    }

    // Workflows that are terminal or have no schedule — clean up
    const { rows: terminalWorkflows } = await query(
      `SELECT id FROM agent_workflows
       WHERE status IN ('completed', 'failed', 'cancelled')
          OR schedule_interval IS NULL
          OR schedule_interval = 0`,
    );

    for (const wf of terminalWorkflows) {
      const jobName = `workflow-${wf.id.replace(/[^a-zA-Z0-9-]/g, "")}`;
      await unregisterCron(jobName);
      result.unregistered++;
    }
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : "Sync failed");
  }

  return result;
}

// ---------------------------------------------------------------------------
// Master sync: Sync everything (routines + tasks + workflows)
// ---------------------------------------------------------------------------

export async function syncAllCronJobs(): Promise<{
  routines: { registered: number; unregistered: number; errors: string[] };
  tasks: { registered: number; unregistered: number; errors: string[] };
  workflows: { registered: number; unregistered: number; errors: string[] };
  totalJobs: number;
  cronJobs: Array<{ name: string; schedule: string; active: boolean }>;
}> {
  const [routines, tasks, workflows, cronJobs] = await Promise.all([
    syncRoutineCronJobs(),
    syncTaskCronJobs(),
    syncWorkflowCronJobs(),
    listKlawCronJobs(),
  ]);

  return {
    routines,
    tasks,
    workflows,
    totalJobs: cronJobs.length,
    cronJobs: cronJobs.map(j => ({ name: j.jobname, schedule: j.schedule, active: j.active })),
  };
}
