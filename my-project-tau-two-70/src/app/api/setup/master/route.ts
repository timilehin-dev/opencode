// ---------------------------------------------------------------------------
// Master Setup Route — Unified Database Setup
//
// POST /api/setup/master — Run the complete unified schema
// GET  /api/setup/master — Check which tables exist
//
// POST with header X-Confirm-Reset: true to DROP + recreate all tables
// (requires SETUP_SECRET env var for safety)
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import {
  UNIFIED_SETUP_SQL,
  UNIFIED_TABLE_LIST,
} from "@/lib/unified-schema";

// ---------------------------------------------------------------------------
// GET — Report current database state
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    // Check which tables exist
    const tableResults: Record<string, boolean> = {};
    for (const table of UNIFIED_TABLE_LIST) {
      try {
        const result = await query(
          `SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = $1
          )`,
          [table],
        );
        tableResults[table] = result.rows[0]?.exists || false;
      } catch {
        tableResults[table] = false;
      }
    }

    const existingTables = Object.entries(tableResults)
      .filter(([, exists]) => exists)
      .map(([name]) => name);
    const missingTables = Object.entries(tableResults)
      .filter(([, exists]) => !exists)
      .map(([name]) => name);

    // Check for key functions
    const functionChecks = [
      "upsert_shared_context",
      "get_agent_inbox",
      "mark_messages_read",
      "get_or_create_channel",
      "expire_old_a2a_messages",
      "update_project_task_counts",
      "get_next_executable_tasks",
      "on_project_task_status_change",
      "update_projects_updated_at",
      "update_project_tasks_updated_at",
    ];

    const functionResults: Record<string, boolean> = {};
    for (const fn of functionChecks) {
      try {
        const result = await query(
          `SELECT EXISTS (
            SELECT FROM pg_proc
            WHERE proname = $1
          )`,
          [fn],
        );
        functionResults[fn] = result.rows[0]?.exists || false;
      } catch {
        functionResults[fn] = false;
      }
    }

    return NextResponse.json({
      success: true,
      mode: "status",
      summary: {
        total_tables: UNIFIED_TABLE_LIST.length,
        existing: existingTables.length,
        missing: missingTables.length,
        all_ready: missingTables.length === 0,
      },
      tables: tableResults,
      missing_tables: missingTables,
      functions: functionResults,
    });
  } catch (error) {
    console.error("[MasterSetup] Status check error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST — Run the unified schema setup
//
// Without X-Confirm-Reset: runs UNIFIED_SETUP_SQL (idempotent, safe to re-run)
// With X-Confirm-Reset: true: drops ALL tables first, then recreates
//   (requires SETUP_SECRET env var)
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const confirmReset = request.headers.get("x-confirm-reset") === "true";

    // If requesting a reset, require SETUP_SECRET
    if (confirmReset) {
      const setupSecret = process.env.SETUP_SECRET;
      if (!setupSecret) {
        return NextResponse.json(
          { error: "SETUP_SECRET not configured — cannot perform reset" },
          { status: 500 },
        );
      }
      const providedSecret = request.headers.get("x-setup-secret");
      if (providedSecret !== setupSecret) {
        return NextResponse.json(
          { error: "Invalid or missing X-Setup-Secret header — reset denied" },
          { status: 401 },
        );
      }
    }

    if (!process.env.SUPABASE_DB_URL) {
      return NextResponse.json(
        { error: "SUPABASE_DB_URL environment variable is not configured" },
        { status: 500 },
      );
    }

    const startTime = Date.now();

    // Step 1: If reset, drop all Klawhub tables
    if (confirmReset) {
      console.log("[MasterSetup] Dropping all Klawhub tables for reset...");
      await query(`
        DROP TABLE IF EXISTS
          workflow_executions,
          workflow_steps,
          agent_workflows,
          project_task_logs,
          project_tasks,
          projects,
          a2a_channel_messages,
          a2a_channels,
          a2a_shared_context,
          a2a_tasks,
          a2a_messages,
          agent_routines,
          task_board,
          learning_insights,
          proactive_notifications,
          key_usage,
          delegations,
          agent_tasks,
          agent_status,
          agent_activity,
          contacts,
          todos,
          reminders,
          agent_memory,
          automations,
          automation_logs,
          user_preferences,
          conversations,
          analytics_events
        CASCADE;
      `);

      // Drop functions
      await query(`
        DROP FUNCTION IF EXISTS
          expire_old_a2a_messages,
          get_or_create_channel,
          mark_messages_read,
          get_agent_inbox,
          upsert_shared_context,
          on_project_task_status_change,
          get_next_executable_tasks,
          update_project_task_counts,
          update_project_tasks_updated_at,
          update_projects_updated_at
        CASCADE;
      `);

      // Drop triggers
      await query(`
        DROP TRIGGER IF EXISTS trg_project_task_status_change ON project_tasks;
        DROP TRIGGER IF EXISTS trg_project_tasks_updated_at ON project_tasks;
        DROP TRIGGER IF EXISTS trg_projects_updated_at ON projects;
      `);

      console.log("[MasterSetup] All tables dropped.");
    }

    // Step 2: Run the unified setup SQL
    console.log("[MasterSetup] Running unified setup SQL...");
    await query(UNIFIED_SETUP_SQL);

    const durationMs = Date.now() - startTime;

    // Step 3: Verify tables were created
    const tableResults: Record<string, { exists: boolean; rows: number }> = {};
    for (const table of UNIFIED_TABLE_LIST) {
      try {
        const existsResult = await query(
          `SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = $1
          )`,
          [table],
        );
        const exists = existsResult.rows[0]?.exists || false;

        let rowCount = 0;
        if (exists) {
          try {
            const countResult = await query(
              `SELECT COUNT(*)::int as count FROM "${table}"`,
            );
            rowCount = Number(countResult.rows[0]?.count || 0);
          } catch {
            // Some tables may not be queryable
          }
        }

        tableResults[table] = { exists, rows: rowCount };
      } catch {
        tableResults[table] = { exists: false, rows: 0 };
      }
    }

    // Step 4: Verify key functions
    const functionNames = [
      "upsert_shared_context",
      "get_agent_inbox",
      "mark_messages_read",
      "get_or_create_channel",
      "expire_old_a2a_messages",
      "update_project_task_counts",
      "get_next_executable_tasks",
      "on_project_task_status_change",
    ];

    const functionResults: Record<string, boolean> = {};
    for (const fn of functionNames) {
      try {
        const result = await query(
          `SELECT EXISTS (SELECT FROM pg_proc WHERE proname = $1)`,
          [fn],
        );
        functionResults[fn] = result.rows[0]?.exists || false;
      } catch {
        functionResults[fn] = false;
      }
    }

    const allTablesCreated = Object.values(tableResults).every(
      (t) => t.exists,
    );
    const allFunctionsCreated = Object.values(functionResults).every(Boolean);

    return NextResponse.json({
      success: true,
      mode: confirmReset ? "reset" : "setup",
      message: confirmReset
        ? "Database reset and recreated successfully"
        : "Unified schema setup completed",
      duration_ms: durationMs,
      summary: {
        tables_created: UNIFIED_TABLE_LIST.length,
        tables_verified: Object.values(tableResults).filter((t) => t.exists)
          .length,
        functions_created: Object.values(functionResults).filter(Boolean)
          .length,
        all_tables_ok: allTablesCreated,
        all_functions_ok: allFunctionsCreated,
      },
      tables: tableResults,
      functions: functionResults,
    });
  } catch (error) {
    console.error("[MasterSetup] Setup error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error during setup",
      },
      { status: 500 },
    );
  }
}
