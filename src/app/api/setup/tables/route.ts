// ---------------------------------------------------------------------------
// Setup API — Create Workspace Tables
// POST /api/setup/tables
// Executes the workspace schema SQL against Supabase to create the
// reminders, todos, and contacts tables.
// Run this ONCE to set up the database.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { WORKSPACE_SCHEMA_SQL } from "@/lib/supabase";
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

  if (!process.env.SUPABASE_DB_URL) {
    return NextResponse.json(
      { error: "SUPABASE_DB_URL environment variable is not configured" },
      { status: 500 },
    );
  }

  try {
    // Execute the workspace schema SQL
    // The SQL uses CREATE TABLE IF NOT EXISTS so it's safe to run multiple times
    await query(WORKSPACE_SCHEMA_SQL);

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
