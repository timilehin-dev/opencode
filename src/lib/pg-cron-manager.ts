// ---------------------------------------------------------------------------
// pg_cron Job Manager
//
// Manages Supabase pg_cron jobs for agent routines and scheduled tasks.
// Each routine/scheduled task gets its own dedicated pg_cron job.
//
// Jobs are named: routine-{id}, taskboard-{id}, scheduled-{id}
// All call /api/cron/execute-routine?secret=...&routineId=X
// ---------------------------------------------------------------------------

import { query } from "@/lib/db";

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
 * Convert interval in minutes to a pg_cron schedule expression.
 * For sub-hourly intervals (e.g. 30 min): star-slash-N schedule
 * For hourly intervals (e.g. 120 min): 0 star-slash-N schedule
 * For daily intervals: 0 0 * * *
 */
function intervalToCron(minutes: number): string {
  if (minutes < 60) return `*/${minutes} * * * *`;
  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    if (hours === 1) return `0 * * * *`;
    return `0 */${hours} * * *`;
  }
  return `0 0 * * *`;
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
  const schedule = intervalToCron(intervalMinutes);
  const url = `${appUrl}/api/cron/execute-routine?secret=${encodeURIComponent(secret)}&routineId=${routineId}`;

  try {
    // Remove existing job if any
    await query(`SELECT cron.unschedule('${jobName}')`).catch(() => {});

    // Register new job
    await query(
      `SELECT cron.schedule('${jobName}', '${schedule}', $$SELECT net.http_get('${url}')$$)`,
    );

    return { success: true, jobName, schedule };
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
// Unregister: Remove a pg_cron job
// ---------------------------------------------------------------------------

export async function unregisterCron(jobName: string): Promise<void> {
  try {
    await query(`SELECT cron.unschedule('${jobName}')`).catch(() => {});
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
      `SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname LIKE 'routine-%' OR jobname LIKE 'taskboard-%' OR jobname LIKE 'klaw-%' ORDER BY jobid`,
    );
    return result.rows as Array<{ jobid: number; jobname: string; schedule: string; active: boolean }>;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Sync: Ensure all active routines in DB have pg_cron jobs
// Call this on startup or when routines change.
// ---------------------------------------------------------------------------

export async function syncRoutineCronJobs(): Promise<{ registered: number; unregistered: number; errors: string[] }> {
  await ensurePgCronExtensions();
  const result = { registered: 0, unregistered: 0, errors: [] as string[] };

  try {
    // Get all active routines
    const { rows: activeRoutines } = await query(
      `SELECT id, interval_minutes FROM agent_routines WHERE is_active = true`,
    );

    for (const routine of activeRoutines) {
      const r = await registerRoutineCron(Number(routine.id), Number(routine.interval_minutes));
      if (r.success) result.registered++;
      else result.errors.push(`routine-${routine.id}: ${r.error}`);
    }

    // Get all inactive/deleted routines that still have cron jobs
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
