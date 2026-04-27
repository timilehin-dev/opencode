// ---------------------------------------------------------------------------
// Setup API — Create Workspace Tables
// POST /api/setup/tables
// Executes the workspace schema SQL against Supabase to create the
// reminders, todos, contacts, and A2A tables.
// Run this ONCE to set up the database.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { SCHEMA_SQL } from "@/lib/supabase";
import { A2A_SCHEMA_SQL } from "@/lib/a2a-schema";
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
    await query(SCHEMA_SQL);

    // Also execute the A2A schema SQL
    await query(A2A_SCHEMA_SQL);

    return NextResponse.json({
      success: true,
      message: "Workspace and A2A tables created successfully",
      tables: [
        "reminders", "todos", "contacts",
        "a2a_messages", "a2a_shared_context", "a2a_channels", "a2a_channel_messages", "a2a_tasks",
      ],
      functions: ["get_agent_inbox", "mark_messages_read", "upsert_shared_context", "get_or_create_channel", "expire_old_a2a_messages"],
    });
  } catch (error) {
    console.error("[SETUP] Table creation error:", error);
    return NextResponse.json(
      {
        error: "Failed to create workspace and A2A tables",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
