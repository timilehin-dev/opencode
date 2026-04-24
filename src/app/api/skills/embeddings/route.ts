// ---------------------------------------------------------------------------
// Phase 7A: Embedding Management Route
// ---------------------------------------------------------------------------
// POST — Generate embeddings for all skills (or a specific skill_id)
// GET  — Get embedding status (how many have embeddings, which don't)
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import {
  generateEmbedding,
  embeddingToPgVector,
} from "@/lib/embeddings";
import { getPool } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { skill_id } = body as { skill_id?: string };

    // Build sql to fetch skills needing embeddings
    let sql: string;
    let params: unknown[];

    if (skill_id) {
      sql = `
        SELECT id, display_name, description, category, tags, prompt_template
        FROM skills
        WHERE id = $1 AND is_active = true
      `;
      params = [skill_id];
    } else {
      sql = `
        SELECT id, display_name, description, category, tags, prompt_template
        FROM skills
        WHERE is_active = true
        ORDER BY created_at DESC
      `;
      params = [];
    }

    const result = await getPool().query(sql, params);
    const skills = result.rows;

    if (skills.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        message: skill_id
          ? `Skill ${skill_id} not found or inactive`
          : "No active skills found",
      });
    }

    let processed = 0;
    let errors = 0;

    for (const skill of skills) {
      try {
        // Combine skill text for embedding
        const tags = Array.isArray(skill.tags) ? skill.tags.join(" ") : "";
        const promptPrefix = (skill.prompt_template || "").slice(0, 500);
        const combinedText = [
          skill.display_name || "",
          skill.description || "",
          skill.category || "",
          tags,
          promptPrefix,
        ]
          .filter(Boolean)
          .join(" ");

        if (combinedText.trim().length === 0) {
          console.warn(
            `[Embeddings] Skill ${skill.id} has no text content, skipping`
          );
          continue;
        }

        const embedding = await generateEmbedding(combinedText);
        const vectorStr = embeddingToPgVector(embedding);

        await getPool().query(
          `UPDATE skills
           SET embedding = $1::vector, has_embedding = true, updated_at = NOW()
           WHERE id = $2`,
          [vectorStr, skill.id]
        );

        processed++;
      } catch (skillError) {
        console.error(
          `[Embeddings] Error processing skill ${skill.id}:`,
          skillError
        );
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      total: skills.length,
      errors,
      message: `Generated embeddings for ${processed} skill(s)`,
    });
  } catch (error) {
    console.error("[Embeddings] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to generate embeddings",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    // Get total count and count with embeddings
    const statsResult = await getPool().query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE has_embedding = true) AS with_embeddings,
        COUNT(*) FILTER (WHERE has_embedding = false AND is_active = true) AS without_embeddings
      FROM skills
      WHERE is_active = true
    `);

    const stats = statsResult.rows[0];

    // Get list of skills without embeddings
    const missingResult = await getPool().query(`
      SELECT id, display_name, category
      FROM skills
      WHERE is_active = true AND has_embedding = false
      ORDER BY created_at DESC
      LIMIT 50
    `);

    return NextResponse.json({
      success: true,
      data: {
        total_active: Number(stats.total),
        with_embeddings: Number(stats.with_embeddings),
        without_embeddings: Number(stats.without_embeddings),
        coverage_percent:
          Number(stats.total) > 0
            ? Math.round(
                (Number(stats.with_embeddings) / Number(stats.total)) * 100
              )
            : 0,
        missing_skills: missingResult.rows.map(
          (r: { id: string; display_name: string; category: string }) => ({
            id: r.id,
            display_name: r.display_name,
            category: r.category,
          })
        ),
      },
    });
  } catch (error) {
    console.error("[Embeddings] Status error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get embedding status",
      },
      { status: 500 }
    );
  }
}
