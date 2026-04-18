// ---------------------------------------------------------------------------
// Setup API — Create Phase 2 Tables
// POST /api/setup/phase2
// Executes the Phase 2 schema SQL against Supabase to create
// agent_activity and agent_status tables.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { PHASE2_SCHEMA_SQL } from "@/lib/supabase";

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

    await pool.query(PHASE2_SCHEMA_SQL);
    await pool.end();

    return NextResponse.json({
      success: true,
      message: "Phase 2 tables created successfully",
      tables: ["agent_activity", "agent_status"],
    });
  } catch (error) {
    console.error("[SETUP] Phase 2 table creation error:", error);
    return NextResponse.json(
      {
        error: "Failed to create Phase 2 tables",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
