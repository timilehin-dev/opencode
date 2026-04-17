// ---------------------------------------------------------------------------
// Setup API — Create Workspace Tables
// POST /api/setup/tables
// Executes the workspace schema SQL against Supabase to create the
// reminders, todos, and contacts tables.
// Run this ONCE to set up the database.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { WORKSPACE_SCHEMA_SQL } from "@/lib/supabase";

export async function POST() {
  // Note: This endpoint is intentionally simple for initial setup.
  // In production, add proper auth.

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

    // Execute the workspace schema SQL
    // The SQL uses CREATE TABLE IF NOT EXISTS so it's safe to run multiple times
    await pool.query(WORKSPACE_SCHEMA_SQL);

    await pool.end();

    return NextResponse.json({
      success: true,
      message: "Workspace tables created successfully",
      tables: ["reminders", "todos", "contacts"],
    });
  } catch (error) {
    console.error("[SETUP] Table creation error:", error);
    return NextResponse.json(
      {
        error: "Failed to create workspace tables",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
