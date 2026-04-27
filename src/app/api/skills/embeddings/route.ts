import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/core/db";
import { generateEmbedding, embeddingToPgVector, EMBEDDING_DIM } from "@/lib/memory/embeddings";

export const dynamic = "force-dynamic";

function ok(data: unknown) { return NextResponse.json({ success: true, data }); }
function err(msg: string, status = 500) { return NextResponse.json({ success: false, error: msg }, { status }); }

// GET /api/skills/embeddings — check embeddings status
export async function GET() {
  try {
    const total = await query("SELECT count(*) as count FROM skills WHERE is_active = true");
    const withEmbedding = await query("SELECT count(*) as count FROM skills WHERE has_embedding = true AND is_active = true");

    // Check if pgvector is available
    let pgvectorAvailable = false;
    try {
      const ext = await query("SELECT extname FROM pg_extension WHERE extname = 'vector'");
      pgvectorAvailable = ext.rows.length > 0;
    } catch { /* not available */ }

    // Check if embedding column exists
    let embeddingColumnExists = false;
    try {
      const col = await query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'skills' AND column_name = 'embedding'"
      );
      embeddingColumnExists = col.rows.length > 0;
    } catch { /* table may not exist yet */ }

    return ok({
      total_skills: parseInt(total.rows[0].count),
      with_embeddings: parseInt(withEmbedding.rows[0].count),
      without_embeddings: parseInt(total.rows[0].count) - parseInt(withEmbedding.rows[0].count),
      pgvector_available: pgvectorAvailable,
      embedding_column_exists: embeddingColumnExists,
      embedding_dim: EMBEDDING_DIM,
    });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : "Failed to check embeddings");
  }
}

// POST /api/skills/embeddings — regenerate embeddings
//
// Body options:
//   { skill_id: "..." }           — Regenerate for one specific skill
//   { refreshAll: true }           — Regenerate ALL skills (including already embedded)
//   { batch_size?: number }        — Override default batch size (default: 5)
//
// If no body / no options provided, regenerates all skills that lack embeddings.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const skill_id = body.skill_id as string | undefined;
    const refreshAll = body.refreshAll as boolean | undefined;
    const batchSize = Math.min(Math.max(body.batch_size || 5, 1), 20);

    // --- Single skill regeneration ---
    if (skill_id) {
      const skillResult = await query(
        "SELECT id, name, description, category FROM skills WHERE id = $1 AND is_active = true",
        [skill_id]
      );
      if (skillResult.rows.length === 0) return err("Skill not found", 404);

      const skill = skillResult.rows[0];
      const text = `${skill.name} ${skill.description || ""} Category: ${skill.category || "general"}`;
      const embedding = await generateEmbedding(text);
      const vectorStr = embeddingToPgVector(embedding);

      await query(
        "UPDATE skills SET embedding = $1::vector, has_embedding = true, updated_at = NOW() WHERE id = $2",
        [vectorStr, skill_id]
      );

      return ok({
        message: `Embedding generated for skill: ${skill.name}`,
        skill_id: skill.id,
        dimensions: embedding.length,
      });
    }

    // --- Batch regeneration ---
    // Determine which skills need embedding
    const whereClause = refreshAll
      ? "WHERE is_active = true"
      : "WHERE is_active = true AND (has_embedding = false OR embedding IS NULL)";
    const countResult = await query(`SELECT count(*) as count FROM skills ${whereClause}`);
    const totalCount = parseInt(countResult.rows[0].count);

    if (totalCount === 0) {
      return ok({ message: "No skills need embedding regeneration", processed: 0 });
    }

    // Fetch skills in batches
    const offset = body.offset || 0;
    const skillsResult = await query(
      `SELECT id, name, description, category FROM skills ${whereClause} ORDER BY name LIMIT $1 OFFSET $2`,
      [batchSize, offset]
    );
    const skills = skillsResult.rows;

    if (skills.length === 0) {
      return ok({ message: "No more skills to process", processed: 0, total_remaining: 0 });
    }

    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const skill of skills) {
      try {
        const text = `${skill.name} ${skill.description || ""} Category: ${skill.category || "general"}`;
        const embedding = await generateEmbedding(text);
        const vectorStr = embeddingToPgVector(embedding);

        await query(
          "UPDATE skills SET embedding = $1::vector, has_embedding = true, updated_at = NOW() WHERE id = $2",
          [vectorStr, skill.id]
        );
        processed++;
      } catch (error) {
        failed++;
        errors.push(`${skill.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return ok({
      message: `Processed ${processed} of ${skills.length} skills (${failed} failed)`,
      processed,
      failed,
      total_remaining: Math.max(0, totalCount - offset - skills.length),
      total_queued: totalCount,
      batch_offset: offset,
      batch_size: batchSize,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : "Failed to regenerate embeddings");
  }
}
