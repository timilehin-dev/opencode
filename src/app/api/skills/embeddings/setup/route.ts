import { NextResponse } from "next/server";
import { query } from "@/lib/core/db";

export const dynamic = "force-dynamic";

function ok(data: unknown) { return NextResponse.json({ success: true, data }); }
function err(msg: string, status = 500) { return NextResponse.json({ success: false, error: msg }, { status }); }

// POST /api/skills/embeddings/setup — initialize pgvector extension
export async function POST() {
  try {
    // Enable pgvector extension
    await query("CREATE EXTENSION IF NOT EXISTS vector");

    // Add embedding column if not exists
    const colCheck = await query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'skills' AND column_name = 'embedding'"
    );

    if (colCheck.rows.length === 0) {
      await query("ALTER TABLE skills ADD COLUMN embedding vector(1536)");
    }

    // Add has_embedding if not exists
    const boolCheck = await query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'skills' AND column_name = 'has_embedding'"
    );
    if (boolCheck.rows.length === 0) {
      await query("ALTER TABLE skills ADD COLUMN has_embedding boolean DEFAULT false");
    }

    return ok({ message: "pgvector extension and embedding columns initialized successfully" });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : "Failed to setup embeddings");
  }
}
