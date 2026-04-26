// ---------------------------------------------------------------------------
// Phase 7A: pgvector Setup Route
// ---------------------------------------------------------------------------
// Idempotent route that enables the pgvector extension, adds embedding column
// and has_embedding tracking column, and creates an HNSW index for cosine
// similarity search. Safe to call multiple times.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function POST() {
  try {
    // 1. Enable pgvector extension
    await query(`CREATE EXTENSION IF NOT EXISTS vector`);
    console.log("[EmbeddingsSetup] pgvector extension enabled");

    // 2. Add embedding column (768-dim vector)
    await query(`
      ALTER TABLE skills
      ADD COLUMN IF NOT EXISTS embedding vector(768)
    `);
    console.log("[EmbeddingsSetup] embedding column added");

    // 3. Add has_embedding boolean tracking column
    await query(`
      ALTER TABLE skills
      ADD COLUMN IF NOT EXISTS has_embedding boolean DEFAULT false
    `);
    console.log("[EmbeddingsSetup] has_embedding column added");

    // 4. Create HNSW index for cosine similarity (if not exists)
    // Drop old index name if it exists with different params, then recreate
    try {
      await query(`DROP INDEX IF EXISTS skills_embedding_idx`);
    } catch {
      // Ignore if index doesn't exist
    }
    await query(`
      CREATE INDEX skills_embedding_idx
      ON skills
      USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
    `);
    console.log("[EmbeddingsSetup] HNSW index created");

    return NextResponse.json({
      success: true,
      message:
        "pgvector setup complete: extension enabled, columns added, HNSW index created",
    });
  } catch (error) {
    console.error("[EmbeddingsSetup] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to setup pgvector",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Return current status
  try {
    const result = await query(`
      SELECT
        column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'skills'
        AND column_name IN ('embedding', 'has_embedding')
    `);

    const columns = result.rows.map((r: { column_name: string }) => r.column_name);
    const hasEmbeddingCol = columns.includes("embedding");
    const hasTrackingCol = columns.includes("has_embedding");

    // Check if extension is installed
    let hasExtension = false;
    try {
      const extResult = await query(
        `SELECT 1 FROM pg_extension WHERE extname = 'vector'`
      );
      hasExtension = extResult.rows.length > 0;
    } catch {
      // Extension query may fail if not installed
    }

    // Check index
    let hasIndex = false;
    try {
      const idxResult = await query(
        `SELECT 1 FROM pg_indexes WHERE indexname = 'skills_embedding_idx'`
      );
      hasIndex = idxResult.rows.length > 0;
    } catch {
      // Index query may fail
    }

    return NextResponse.json({
      success: true,
      status: {
        pgvector_extension: hasExtension,
        embedding_column: hasEmbeddingCol,
        has_embedding_column: hasTrackingCol,
        hnsw_index: hasIndex,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to check status",
      },
      { status: 500 }
    );
  }
}
