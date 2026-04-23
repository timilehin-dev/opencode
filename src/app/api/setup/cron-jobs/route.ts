// ---------------------------------------------------------------------------
// Setup API — Register Supabase pg_cron Jobs
// POST /api/setup/cron-jobs?action=setup
//
// Registers pg_cron jobs in Supabase that call the app's API endpoints on schedule.
// This is the Supabase equivalent of Vercel Cron Jobs (needed for Hobby plan).
//
// Jobs registered:
//   - task-processor:  every minute → /api/cron/task-processor
//   - agent-routines:  every 5 minutes → /api/cron/agent-routines
//   - process-reminders: daily at 9am → /api/cron/process-reminders
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function POST(request: Request) {
  const setupSecret = process.env.SETUP_SECRET;
  if (!setupSecret) {
    return NextResponse.json({ error: "SETUP_SECRET not configured" }, { status: 500 });
  }
  const { searchParams } = new URL(request.url);
  if (searchParams.get("secret") !== setupSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const action = searchParams.get("action") || "setup";

  if (!process.env.SUPABASE_DB_URL) {
    return NextResponse.json(
      { error: "SUPABASE_DB_URL environment variable is not configured" },
      { status: 500 },
    );
  }

  // Build the base URL for cron HTTP calls
  // Priority: CRON_WEBHOOK_URL > VERCEL_URL > NEXT_PUBLIC_BASE_URL
  const appUrl = process.env.CRON_WEBHOOK_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.NEXT_PUBLIC_BASE_URL)
    || "";

  if (!appUrl) {
    return NextResponse.json(
      { error: "No app URL configured. Set CRON_WEBHOOK_URL, VERCEL_URL, or NEXT_PUBLIC_BASE_URL." },
      { status: 500 },
    );
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  if (action === "setup") {
    try {
      // 1. Ensure pg_cron and net extensions are enabled
      await query(`CREATE EXTENSION IF NOT EXISTS pg_cron`);
      await query(`CREATE EXTENSION IF NOT EXISTS pg_net`);

      const results: Record<string, string> = {};

      // Helper to register a cron job
      const scheduleJob = async (jobName: string, schedule: string, url: string) => {
        try {
          // Remove existing job if it exists
          await query(`SELECT cron.unschedule('${jobName}')`).catch(() => {});
          await query(
            `SELECT cron.schedule(
              '${jobName}',
              '${schedule}',
              $$SELECT net.http_get('${url}')$$
            )`,
          );
          return `scheduled: ${schedule}`;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          return `failed: ${msg}`;
        }
      };

      // 2. Register: task-processor (every minute)
      const taskProcessorUrl = `${appUrl}/api/cron/task-processor?secret=${cronSecret}`;
      results["task-processor"] = await scheduleJob("klaw-task-processor", "* * * * *", taskProcessorUrl);

      // 3. Register: agent-routines (every 5 minutes)
      const agentRoutinesUrl = `${appUrl}/api/cron/agent-routines?secret=${cronSecret}`;
      results["agent-routines"] = await scheduleJob("klaw-agent-routines", "*/5 * * * *", agentRoutinesUrl);

      // 4. Register: process-reminders (daily at 9am)
      const processRemindersUrl = `${appUrl}/api/cron/process-reminders?secret=${cronSecret}`;
      results["process-reminders"] = await scheduleJob("klaw-process-reminders", "0 9 * * *", processRemindersUrl);

      return NextResponse.json({
        success: true,
        message: "Supabase pg_cron jobs registered",
        appUrl,
        jobs: results,
        note: "Jobs will start firing automatically on schedule. Use action=list to verify.",
      });
    } catch (error) {
      console.error("[SETUP] Cron job registration error:", error);
      return NextResponse.json(
        { error: "Failed to register cron jobs", details: error instanceof Error ? error.message : "Unknown error" },
        { status: 500 },
      );
    }
  }

  if (action === "list") {
    try {
      const result = await query(`
        SELECT jobid, schedule, command, nodename, nodeport, database, username,
               active, jobname
        FROM cron.job
        WHERE jobname LIKE 'klaw-%'
        ORDER BY jobid
      `);

      return NextResponse.json({
        success: true,
        jobs: result.rows,
      });
    } catch (error) {
      return NextResponse.json(
        { error: "Failed to list cron jobs", details: error instanceof Error ? error.message : "Unknown error" },
        { status: 500 },
      );
    }
  }

  if (action === "remove") {
    try {
      const jobNames = [
        "klaw-task-processor",
        "klaw-agent-routines",
        "klaw-process-reminders",
      ];

      const results: Record<string, string> = {};
      for (const name of jobNames) {
        try {
          await query(`SELECT cron.unschedule('${name}')`);
          results[name] = "unscheduled";
        } catch {
          results[name] = "not found or already removed";
        }
      }

      return NextResponse.json({
        success: true,
        message: "Cron jobs removed",
        jobs: results,
      });
    } catch (error) {
      return NextResponse.json(
        { error: "Failed to remove cron jobs", details: error instanceof Error ? error.message : "Unknown error" },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(
    { error: `Unknown action: ${action}. Use 'setup', 'list', or 'remove'.` },
    { status: 400 },
  );
}
