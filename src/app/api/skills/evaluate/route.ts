import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/core/db";

export const dynamic = "force-dynamic";

function ok(data: unknown) { return NextResponse.json({ success: true, data }); }
function err(msg: string, status = 500) { return NextResponse.json({ success: false, error: msg }, { status }); }

// POST /api/skills/evaluate — evaluate a skill execution
// Uses actual columns: evaluation_type, relevance_score, accuracy_score, completeness_score,
// clarity_score, efficiency_score, overall_score, strengths, weaknesses, improvement_suggestions
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { skill_id, agent_id, task_id, evaluation_type, scores, strengths, weaknesses, suggestions, reasoning } = body;

    if (!skill_id || !agent_id) {
      return err("skill_id and agent_id required", 400);
    }

    const result = await query(
      `INSERT INTO skill_evaluations (
        skill_id, agent_id, task_id, evaluation_type,
        relevance_score, accuracy_score, completeness_score, clarity_score, efficiency_score,
        overall_score, strengths, weaknesses, improvement_suggestions, evaluator_reasoning
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        skill_id,
        agent_id,
        task_id || null,
        evaluation_type || "auto",
        scores?.relevance || null,
        scores?.accuracy || null,
        scores?.completeness || null,
        scores?.clarity || null,
        scores?.efficiency || null,
        scores?.overall || null,
        strengths || null,
        weaknesses || null,
        suggestions || null,
        reasoning || null,
      ]
    );

    // Update skill performance_score based on average evaluation
    await query(
      `UPDATE skills SET
         performance_score = (SELECT COALESCE(AVG(overall_score), 0) FROM skill_evaluations WHERE skill_id = $1),
         updated_at = NOW()
       WHERE id = $1`,
      [skill_id]
    );

    return ok(result.rows[0]);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : "Failed to evaluate skill");
  }
}
