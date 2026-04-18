// ---------------------------------------------------------------------------
// Setup API — Create Phase 3 Tables
// POST /api/setup/phase3
// Executes the Phase 3 schema SQL against Supabase to create
// agent_tasks and delegations tables.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { PHASE3_SCHEMA_SQL } from "@/lib/supabase";

export async function POST() {
  if (!process.env.SUPABASE_DB_URL) {
    return NextResponse.json(
      { error: "SUPABASE_DB_URL environment variable is not configured" },
      { status: 500 },
    );
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool } = require("pg");
    const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL });

    await pool.query(PHASE3_SCHEMA_SQL);
    await pool.end();

    return NextResponse.json({
      success: true,
      message: "Phase 3 tables created successfully",
      tables: ["agent_tasks", "delegations"],
    });
  } catch (error) {
    console.error("[SETUP] Phase 3 table creation error:", error);
    return NextResponse.json(
      {
        error: "Failed to create Phase 3 tables",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
