// ---------------------------------------------------------------------------
// GET /api/skills/evolve/pending
// Find skills that need evolution (low avg score, enough evals, no recent evo)
// Split from /api/skills/evolve/route.ts to support nested route path
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const pendingResult = await query(
      `SELECT
          s.id,
          s.name,
          s.display_name,
          s.category,
          s.performance_score,
          s.version,
          agg.eval_count,
          agg.avg_score
       FROM skills s
       INNER JOIN (
         SELECT
           skill_id,
           COUNT(*) as eval_count,
           AVG(overall_score) as avg_score
         FROM skill_evaluations
         WHERE created_at >= NOW() - INTERVAL '7 days'
         GROUP BY skill_id
         HAVING COUNT(*) >= 3 AND AVG(overall_score) < 50
       ) agg ON agg.skill_id = s.id
       LEFT JOIN LATERAL (
         SELECT id FROM skill_evolution
         WHERE skill_evolution.skill_id = s.id
           AND skill_evolution.change_type = 'auto_improvement'
           AND skill_evolution.created_at >= NOW() - INTERVAL '24 hours'
         LIMIT 1
       ) recent_evo ON true
       WHERE recent_evo.id IS NULL
         AND s.is_active = true
       ORDER BY agg.avg_score ASC
       LIMIT 10`
    );

    const pending = pendingResult.rows.map((row: Record<string, unknown>) => ({
      id: row.id,
      name: row.name,
      display_name: row.display_name,
      category: row.category,
      performance_score: Number(row.performance_score) || 0,
      version: Number(row.version) || 1,
      eval_count: Number(row.eval_count) || 0,
      avg_score: Number(row.avg_score) || 0,
    }));

    return NextResponse.json({ success: true, data: { pending_skills: pending } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch pending evolutions";
    console.error("[SkillEvolve/Pending] Error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
