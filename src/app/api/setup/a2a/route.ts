// ---------------------------------------------------------------------------
// Setup API — Create A2A Tables
// POST /api/setup/a2a
// Executes the A2A schema SQL against Supabase to create all A2A tables
// and functions (messages, shared context, channels, tasks, etc.)
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { A2A_SCHEMA_SQL } from "@/lib/schema/a2a-schema";
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
    await query(A2A_SCHEMA_SQL);

    return NextResponse.json({
      success: true,
      message: "A2A tables and functions created successfully",
      tables: ["a2a_messages", "a2a_shared_context", "a2a_channels", "a2a_channel_messages", "a2a_tasks"],
      functions: ["get_agent_inbox", "mark_messages_read", "upsert_shared_context", "get_or_create_channel", "expire_old_a2a_messages"],
    });
  } catch (error) {
    console.error("[SETUP] A2A table creation error:", error);
    return NextResponse.json(
      {
        error: "Failed to create A2A tables",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
