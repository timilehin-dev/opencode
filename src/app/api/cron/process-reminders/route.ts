// ---------------------------------------------------------------------------
// Vercel Cron — Process Due Reminders
// Called every minute by Vercel Cron Jobs.
// Checks for pending reminders whose reminder_time <= NOW() and fires them.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";

export const maxDuration = 30; // 30s max for cron handler

export async function GET(request: Request) {
  // Simple auth: query param secret must match CRON_SECRET env var
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  if (secret !== expectedSecret) {
    return NextResponse.json(
      { error: "Unauthorized — missing or invalid secret" },
      { status: 401 },
    );
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool } = require("pg");
    const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL });

    // 1. Get all due reminders
    const dueResult = await pool.query(
      `SELECT * FROM reminders
       WHERE reminder_time <= NOW() AND status = 'pending'
       ORDER BY priority ASC, reminder_time ASC
       LIMIT 20`,
    );
    const dueReminders = dueResult.rows;

    if (dueReminders.length === 0) {
      await pool.end();
      return NextResponse.json({ processed: 0, message: "No due reminders" });
    }

    // 2. Mark each as fired
    const fired: Record<string, unknown>[] = [];
    for (const reminder of dueReminders) {
      const updateResult = await pool.query(
        `UPDATE reminders
         SET status = 'fired', fired_at = NOW(), updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [reminder.id],
      );
      fired.push(updateResult.rows[0]);

      // 3. Log to automation_logs (fire-and-forget — existing table)
      try {
        await pool.query(
          `INSERT INTO automation_logs (automation_id, status, result, created_at)
           VALUES (0, 'success', $1, NOW())`,
          [JSON.stringify({
            type: "reminder_fired",
            reminder_id: reminder.id,
            title: reminder.title,
            priority: reminder.priority,
            assigned_agent: reminder.assigned_agent,
            fired_at: new Date().toISOString(),
          })],
        );
      } catch {
        // automation_logs insert is non-critical
      }
    }

    await pool.end();

    return NextResponse.json({
      processed: fired.length,
      reminders: fired.map((r: Record<string, unknown>) => ({
        id: r.id,
        title: r.title,
        priority: r.priority,
        assigned_agent: r.assigned_agent,
        reminder_time: r.reminder_time,
        fired_at: r.fired_at,
      })),
    });
  } catch (error) {
    console.error("[CRON] Reminder processing error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
