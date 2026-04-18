// ---------------------------------------------------------------------------
// Setup API — Create Phase 4 Tables
// POST /api/setup/phase4?action=setup
// Executes the full Phase 4 schema SQL against Supabase to create
// ALL tables needed for the application (proactive_notifications,
// learning_insights, a2a_messages, a2a_tasks, task_board, agent_routines,
// agent_activity, agent_status, and updates agent_memory categories).
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { PHASE4_SCHEMA_SQL, PHASE4_TABLE_LIST } from "@/lib/supabase-setup";

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "setup";

  if (!process.env.SUPABASE_DB_URL) {
    return NextResponse.json(
      { error: "SUPABASE_DB_URL environment variable is not configured" },
      { status: 500 },
    );
  }

  if (action !== "setup") {
    return NextResponse.json({ error: `Unknown action: ${action}. Use 'setup'.` }, { status: 400 });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool } = require("pg");
    const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL });

    // Execute the full schema — CREATE TABLE IF NOT EXISTS is safe to re-run
    await pool.query(PHASE4_SCHEMA_SQL);

    // Verify tables were created by checking each one
    const tableResults: Record<string, boolean> = {};
    for (const table of PHASE4_TABLE_LIST) {
      try {
        const result = await pool.query(
          `SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_name = $1
          )`,
          [table],
        );
        tableResults[table] = result.rows[0]?.exists || false;
      } catch {
        tableResults[table] = false;
      }
    }

    await pool.end();

    const allSuccess = Object.values(tableResults).every(Boolean);

    return NextResponse.json({
      success: allSuccess,
      message: allSuccess
        ? "Phase 4 tables created/verified successfully"
        : "Phase 4 schema executed with some table verification issues",
      tables: tableResults,
      tableList: PHASE4_TABLE_LIST,
    });
  } catch (error) {
    console.error("[SETUP] Phase 4 table creation error:", error);
    return NextResponse.json(
      {
        error: "Failed to create Phase 4 tables",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
