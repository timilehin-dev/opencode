// ---------------------------------------------------------------------------
// Phase 6C: Reflection & Feedback Loop API
// ---------------------------------------------------------------------------
// POST /api/skills/reflection — Analyze skill performance trends and insights
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";

/* eslint-disable @typescript-eslint/no-require-imports */
const { Pool } = require("pg");

function getPool() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) throw new Error("SUPABASE_DB_URL not configured");
  return new Pool({ connectionString, max: 3, idleTimeoutMillis: 10000 });
}

interface Reflection {
  skill_id: string;
  skill_name: string;
  trend: "improving" | "declining" | "stable" | "insufficient_data";
  top_weakness: string;
  needs_evolution: boolean;
  suggestion: string;
}

// --- POST /api/skills/reflection ---
export async function POST(req: Request) {
  const pool = getPool();

  try {
    const body = await req.json();
    const { skill_id } = body as { skill_id?: string };

    // 1. Get all skills (or a specific one) that have evaluations
    const skillsResult = await pool.query(
      `SELECT s.id, s.name, s.display_name, s.category, s.performance_score
       FROM skills s
       WHERE s.is_active = true
         AND EXISTS (SELECT 1 FROM skill_evaluations WHERE skill_id = s.id)
         ${skill_id ? "AND s.id = $1" : ""}
       ORDER BY s.display_name`,
      skill_id ? [skill_id] : []
    );

    const skills = skillsResult.rows;
    if (skills.length === 0) {
      return NextResponse.json({
        success: true,
        data: { reflections: [], message: "No skills with evaluation data found" },
      });
    }

    const reflections: Reflection[] = [];

    for (const skill of skills) {
      const sid = skill.id as string;

      // 2. Get evaluations for this skill, ordered by time
      const evalsResult = await pool.query(
        `SELECT overall_score, relevance_score, accuracy_score, completeness_score,
                clarity_score, efficiency_score, weaknesses, created_at
         FROM skill_evaluations
         WHERE skill_id = $1
         ORDER BY created_at ASC`,
        [sid]
      );

      const evals = evalsResult.rows;
      const evalCount = evals.length;

      if (evalCount < 2) {
        reflections.push({
          skill_id: sid,
          skill_name: skill.display_name || skill.name,
          trend: "insufficient_data",
          top_weakness: "Not enough data",
          needs_evolution: false,
          suggestion: "Continue using this skill to gather more evaluation data (need at least 2 evaluations).",
        });
        continue;
      }

      // 3. Calculate trend: compare first half vs second half
      const midPoint = Math.floor(evalCount / 2);
      const firstHalf = evals.slice(0, midPoint);
      const secondHalf = evals.slice(midPoint);

      const avgFirst = firstHalf.reduce((sum: number, ev: Record<string, unknown>) => sum + (Number(ev.overall_score) || 0), 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((sum: number, ev: Record<string, unknown>) => sum + (Number(ev.overall_score) || 0), 0) / secondHalf.length;

      const diff = avgSecond - avgFirst;
      let trend: Reflection["trend"];
      if (Math.abs(diff) < 5) {
        trend = "stable";
      } else if (diff > 0) {
        trend = "improving";
      } else {
        trend = "declining";
      }

      // 4. Identify the most common weakness category
      const dimCounts: Record<string, number> = {
        relevance: 0,
        accuracy: 0,
        completeness: 0,
        clarity: 0,
        efficiency: 0,
      };

      for (const ev of evals) {
        const dims = ["relevance_score", "accuracy_score", "completeness_score", "clarity_score", "efficiency_score"] as const;
        for (const dim of dims) {
          if (Number(ev[dim]) < 50) {
            dimCounts[dim.replace("_score", "")]++;
          }
        }
      }

      const topWeakness = Object.entries(dimCounts).sort((a, b) => b[1] - a[1])[0];
      const topWeaknessStr = topWeakness[1] > 0 ? `${topWeakness[0]} (low in ${topWeakness[1]} evals)` : "No significant weakness";

      // 5. Check if needs evolution: declining + eval_count >= 3
      const overallAvg = evals.reduce((sum: number, ev: Record<string, unknown>) => sum + (Number(ev.overall_score) || 0), 0) / evalCount;
      const needsEvolution = (trend === "declining" && evalCount >= 3) || (overallAvg < 50 && evalCount >= 3);

      // 6. Generate suggestion
      let suggestion = "";
      if (needsEvolution) {
        suggestion = `This skill needs evolution. Average score is ${overallAvg.toFixed(1)} and trend is ${trend}. Consider running skill_evolve to auto-improve the prompt template.`;
      } else if (trend === "improving") {
        suggestion = `Skill is improving (${diff > 0 ? "+" : ""}${diff.toFixed(1)} points). Continue current usage patterns.`;
      } else if (trend === "stable") {
        suggestion = `Skill performance is stable at ${overallAvg.toFixed(1)}. ${topWeakness[1] > 0 ? `Focus on improving ${topWeakness[0]}.` : "No major weaknesses detected."}`;
      } else {
        suggestion = `Performance is declining (${diff.toFixed(1)} points). Monitor closely and consider evolution when eval count reaches 3.`;
      }

      reflections.push({
        skill_id: sid,
        skill_name: skill.display_name || skill.name,
        trend,
        top_weakness: topWeaknessStr,
        needs_evolution: needsEvolution,
        suggestion,
      });
    }

    // 7. Save reflection results (non-critical, fire-and-forget)
    try {
      for (const ref of reflections) {
        if (ref.needs_evolution) {
          await pool.query(
            `INSERT INTO skill_evolution (skill_id, change_type, previous_state, new_state, change_reason, trigger_agent_id, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [
              ref.skill_id,
              "reflection_insight",
              JSON.stringify({ trend: ref.trend, top_weakness: ref.top_weakness }),
              JSON.stringify({ needs_evolution: true }),
              `Reflection: ${ref.suggestion}`,
              "system",
            ]
          ).catch(() => {});
        }
      }
    } catch {
      // Non-critical
    }

    const skillsNeedingEvolution = reflections.filter((r) => r.needs_evolution);

    return NextResponse.json({
      success: true,
      data: {
        reflections,
        summary: {
          total_reflected: reflections.length,
          improving: reflections.filter((r) => r.trend === "improving").length,
          declining: reflections.filter((r) => r.trend === "declining").length,
          stable: reflections.filter((r) => r.trend === "stable").length,
          needs_evolution: skillsNeedingEvolution.length,
        },
        evolution_candidates: skillsNeedingEvolution.map((r) => ({
          skill_id: r.skill_id,
          skill_name: r.skill_name,
          reason: r.suggestion,
        })),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reflection failed";
    console.error("[SkillReflection] Error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  } finally {
    await pool.end();
  }
}
