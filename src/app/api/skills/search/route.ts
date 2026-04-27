import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/core/db";
import { generateEmbedding, embeddingToPgVector } from "@/lib/memory/embeddings";

export const dynamic = "force-dynamic";

function ok(data: unknown) { return NextResponse.json({ success: true, data }); }
function err(msg: string, status = 500) { return NextResponse.json({ success: false, error: msg }, { status }); }

// POST /api/skills/search — hybrid search (vector + keyword)
export async function POST(req: NextRequest) {
  try {
    const { query: searchQuery, top_k = 10 } = await req.json();
    if (!searchQuery) return err("query required", 400);

    // Check if vector column exists and pgvector is available
    let vectorAvailable = false;
    try {
      const colCheck = await query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'skills' AND column_name = 'embedding'"
      );
      if (colCheck.rows.length > 0) {
        const extCheck = await query("SELECT extname FROM pg_extension WHERE extname = 'vector'");
        vectorAvailable = extCheck.rows.length > 0;
      }
    } catch { /* vector not available */ }

    // Check how many skills have embeddings
    let embeddingCoverage = 0;
    if (vectorAvailable) {
      try {
        const coverageResult = await query(
          `SELECT
            COUNT(*) FILTER (WHERE is_active = true) AS total,
            COUNT(*) FILTER (WHERE is_active = true AND has_embedding = true AND embedding IS NOT NULL) AS with_embedding
           FROM skills`
        );
        const row = coverageResult.rows[0];
        const total = parseInt(row.total, 10) || 0;
        const withEmb = parseInt(row.with_embedding, 10) || 0;
        embeddingCoverage = total > 0 ? withEmb / total : 0;
      } catch { /* coverage check failed */ }
    }

    let combinedResults: Array<Record<string, unknown>> = [];

    // -------------------------------------------------------------------------
    // Vector search (cosine similarity via pgvector <=> operator)
    // -------------------------------------------------------------------------
    if (vectorAvailable && embeddingCoverage >= 0.1) {
      try {
        const queryEmbedding = await generateEmbedding(searchQuery);
        const vectorStr = embeddingToPgVector(queryEmbedding);

        const vectorResults = await query(
          `SELECT id, name, display_name, description, category, difficulty,
                  performance_score, total_uses, avg_rating, tags,
                  embedding <=> $1::vector AS distance
           FROM skills
           WHERE is_active = true AND embedding IS NOT NULL
           ORDER BY embedding <=> $1::vector
           LIMIT $2`,
          [vectorStr, top_k * 2] // Fetch extra for merging with keywords
        );

        if (vectorResults.rows.length > 0) {
          // Build result set from vector search
          const seen = new Set<string>();
          for (const row of vectorResults.rows) {
            const id = row.id;
            seen.add(id);
            combinedResults.push({
              ...row,
              distance: parseFloat(row.distance),
              _source: "vector",
            });
          }

          // Keyword fallback fills gaps (catches exact matches vector missed)
          const keywordResults = await query(
            `SELECT * FROM skills
             WHERE is_active = true
               AND (name ILIKE $1 OR display_name ILIKE $1 OR description ILIKE $1)
               AND NOT (id = ANY($2))
             ORDER BY performance_score DESC NULLS LAST, total_uses DESC NULLS LAST
             LIMIT $3`,
            [`%${searchQuery}%`, Array.from(seen), top_k]
          );

          for (const row of keywordResults.rows) {
            combinedResults.push({
              ...row,
              distance: 0.5, // neutral distance for keyword-only results
              _source: "keyword_fallback",
            });
          }
        }
      } catch (vectorError) {
        // Vector search failed — fall through to keyword-only
        console.warn("[Skills Search] Vector search failed:", vectorError);
        combinedResults = [];
      }
    }

    // -------------------------------------------------------------------------
    // Keyword search (fallback or sole method if vector unavailable)
    // -------------------------------------------------------------------------
    if (combinedResults.length === 0) {
      const keywordResults = await query(
        `SELECT * FROM skills
         WHERE is_active = true
           AND (name ILIKE $1 OR display_name ILIKE $1 OR description ILIKE $1 OR $2 = ANY(tags))
         ORDER BY performance_score DESC NULLS LAST, total_uses DESC NULLS LAST
         LIMIT $3`,
        [`%${searchQuery}%`, searchQuery, top_k]
      );

      combinedResults = keywordResults.rows.map((row: Record<string, unknown>) => ({
        ...row,
        _source: "keyword",
      }));
    }

    // Sort by distance (lower = better match), then by performance score
    combinedResults.sort((a, b) => {
      const distDiff = (a.distance as number || 0.5) - (b.distance as number || 0.5);
      if (distDiff !== 0) return distDiff;
      return ((b.performance_score as number) || 0) - ((a.performance_score as number) || 0);
    });

    // Take top_k results, strip internal _source field
    const results = combinedResults.slice(0, top_k).map(({ _source: _unused, ...rest }) => rest);

    return ok({
      results,
      query: searchQuery,
      method: vectorAvailable && embeddingCoverage >= 0.1 ? "hybrid_vector_keyword" : "keyword",
      embedding_coverage: Math.round(embeddingCoverage * 100),
    });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : "Search failed");
  }
}

// GET /api/skills/search — simple keyword search
export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q") || "";
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20", 10);

    const results = await query(
      `SELECT * FROM skills
       WHERE is_active = true
         AND ($1 = '' OR name ILIKE $1 OR display_name ILIKE $1 OR description ILIKE $1)
       ORDER BY performance_score DESC NULLS LAST, total_uses DESC NULLS LAST
       LIMIT $2`,
      [`%${q}%`, limit]
    );

    return ok(results.rows);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : "Search failed");
  }
}
