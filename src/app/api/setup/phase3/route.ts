// ---------------------------------------------------------------------------
// Setup API — Create Phase 3 Tables
// POST /api/setup/phase3
// Executes the Phase 3 schema SQL against Supabase to create
// agent_tasks and delegations tables.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { PHASE3_SCHEMA_SQL } from "@/lib/schema/supabase";
import { query } from "@/lib/core/db";

export async function POST(request: Request) {
  const setupSecret = process.env.SETUP_SECRET;
  if (!setupSecret) {
    return NextResponse.json({ error: "SETUP_SECRET not configured" }, { status: 500 });
  }
  const { searchParams } = new URL(request.url);
  if (searchParams.get("secret") !== setupSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.SUPABASE_DB_URL) {
    return NextResponse.json(
      { error: "SUPABASE_DB_URL environment variable is not configured" },
      { status: 500 },
    );
  }

  try {
    await query(PHASE3_SCHEMA_SQL);

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
