import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/core/db";

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

    return ok({
      total_skills: parseInt(total.rows[0].count),
      with_embeddings: parseInt(withEmbedding.rows[0].count),
      without_embeddings: parseInt(total.rows[0].count) - parseInt(withEmbedding.rows[0].count),
      pgvector_available: pgvectorAvailable,
    });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : "Failed to check embeddings");
  }
}

// POST /api/skills/embeddings — regenerate embeddings
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const skill_id = body.skill_id;

    if (skill_id) {
      // Regenerate for one skill
      const result = await query(
        "UPDATE skills SET has_embedding = false, updated_at = NOW() WHERE id = $1 RETURNING id, name",
        [skill_id]
      );
      if (result.rows.length === 0) return err("Skill not found", 404);
      return ok({ message: `Embedding marked for regeneration for skill: ${result.rows[0].name}`, skill_id: result.rows[0].id });
    }

    // Regenerate all (mark all as needing regeneration)
    const result = await query(
      "UPDATE skills SET has_embedding = false, updated_at = NOW() WHERE is_active = true RETURNING count(*) as count"
    );
    return ok({ message: `Marked ${result.rows[0].count} skills for embedding regeneration` });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : "Failed to refresh embeddings");
  }
}
