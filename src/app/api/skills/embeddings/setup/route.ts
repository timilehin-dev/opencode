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
      await query("ALTER TABLE skills ADD COLUMN embedding vector(768)");
    } else {
      // MIGRATION: Fix existing columns that were created with wrong dimension (1536 → 768)
      // nomic-embed-text outputs 768-dim vectors. Old setup used OpenAI's 1536 dimension.
      try {
        await query("ALTER TABLE skills ALTER COLUMN embedding TYPE vector(768)");
      } catch {
        // Column may already be vector(768) or may need data clearing first
        try {
          await query("UPDATE skills SET embedding = NULL, has_embedding = false WHERE embedding IS NOT NULL");
          await query("ALTER TABLE skills ALTER COLUMN embedding TYPE vector(768)");
        } catch {
          // Already correct dimension — ignore
        }
      }
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
