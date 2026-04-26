// ---------------------------------------------------------------------------
// Phase 6C: Skill Evolution API
// ---------------------------------------------------------------------------
// POST /api/skills/evolve          — Trigger evolution for a specific skill
// GET  /api/skills/evolve/pending   — Find skills needing evolution
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// --- POST /api/skills/evolve ---
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { skill_id, agent_id } = body as { skill_id?: string; agent_id?: string };

    if (!skill_id) {
      return NextResponse.json(
        { success: false, error: "skill_id is required" },
        { status: 400 }
      );
    }

    const { evolveSkill } = await import("@/lib/skill-evolution-engine");
    const result = await evolveSkill(skill_id, agent_id);

    return NextResponse.json({ success: result.success, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Evolution failed";
    console.error("[SkillEvolve] Error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// --- GET /api/skills/evolve/pending ---
export async function GET() {
  try {
    // Find skills that need evolution:
    // - avg overall_score < 50
    // - eval_count >= 3
    // - no evolution in last 24h
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
    console.error("[SkillEvolve] Pending query error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
