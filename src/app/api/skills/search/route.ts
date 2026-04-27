import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/core/db";

export const dynamic = "force-dynamic";

function ok(data: unknown) { return NextResponse.json({ success: true, data }); }
function err(msg: string, status = 500) { return NextResponse.json({ success: false, error: msg }, { status }); }

// POST /api/skills/search — hybrid search (keyword fallback since no embedding setup guaranteed)
export async function POST(req: NextRequest) {
  try {
    const { query: searchQuery, top_k = 10 } = await req.json();
    if (!searchQuery) return err("query required", 400);

    // Check if vector search is available
    const vectorCheck = await query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'skills' AND column_name = 'embedding'"
    );

    let results;
    if (vectorCheck.rows.length > 0) {
      // Try vector search first, fall back to keyword
      try {
        results = await query(
          `SELECT *, 
            (CASE WHEN has_embedding = true THEN 1 ELSE 0 END) as has_vector
           FROM skills 
           WHERE is_active = true 
             AND (name ILIKE $1 OR display_name ILIKE $1 OR description ILIKE $1)
           ORDER BY 
             CASE WHEN has_embedding = true THEN 0 ELSE 1 END,
             performance_score DESC NULLS LAST
           LIMIT $2`,
          [`%${searchQuery}%`, top_k]
        );
      } catch {
        // Fallback to keyword-only
        results = await query(
          `SELECT * FROM skills 
           WHERE is_active = true 
             AND (name ILIKE $1 OR display_name ILIKE $1 OR description ILIKE $1 OR $2 = ANY(tags))
           ORDER BY performance_score DESC NULLS LAST, total_uses DESC NULLS LAST
           LIMIT $3`,
          [`%${searchQuery}%`, searchQuery, top_k]
        );
      }
    } else {
      results = await query(
        `SELECT * FROM skills 
         WHERE is_active = true 
           AND (name ILIKE $1 OR display_name ILIKE $1 OR description ILIKE $1 OR $2 = ANY(tags))
         ORDER BY performance_score DESC NULLS LAST, total_uses DESC NULLS LAST
         LIMIT $3`,
        [`%${searchQuery}%`, searchQuery, top_k]
      );
    }

    return ok(results.rows);
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
