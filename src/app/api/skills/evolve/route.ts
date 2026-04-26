import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

function ok(data: unknown) { return NextResponse.json({ success: true, data }); }
function err(msg: string, status = 500) { return NextResponse.json({ success: false, error: msg }, { status }); }

// POST /api/skills/evolve — evolve a skill or list evolution records
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, skill_id, agent_id, limit: limitParam, change_type, change_reason } = body;

    // LIST action — return evolution records with skill names
    if (action === "list") {
      const limit = parseInt(limitParam || "50", 10);
      const sql = `
        SELECT e.*, s.name as skill_name, s.display_name
        FROM skill_evolution e
        LEFT JOIN skills s ON e.skill_id = s.id
        ORDER BY e.created_at DESC LIMIT $1
      `;
      const result = await query(sql, [limit]);
      return ok(result.rows);
    }

    // EVOLVE action — create evolution record for a skill
    if (!skill_id) return err("skill_id required", 400);

    // Get current skill
    const skillResult = await query("SELECT id, name, version, prompt_template FROM skills WHERE id = $1", [skill_id]);
    if (skillResult.rows.length === 0) return err("Skill not found", 404);
    const skill = skillResult.rows[0];

    // Get recent evaluations for context
    const evalsResult = await query(
      "SELECT id, evaluation_type, overall_score, improvement_suggestions, evaluator_reasoning FROM skill_evaluations WHERE skill_id = $1 ORDER BY created_at DESC LIMIT 5",
      [skill_id]
    );
    const evaluations = evalsResult.rows;

    // Create evolution record using actual column names
    const evoResult = await query(
      `INSERT INTO skill_evolution (skill_id, version, change_type, change_reason, previous_state, trigger_agent_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        skill_id,
        skill.version,
        change_type || "ai_improvement",
        change_reason || `Evolution triggered for ${skill.name} v${skill.version}`,
        JSON.stringify({ prompt_template: skill.prompt_template, evaluations }),
        agent_id || "system",
      ]
    );

    return ok({
      evolution: evoResult.rows[0],
      skill_name: skill.name,
      message: "Evolution record created. An agent can analyze the evaluations and propose improvements to the skill's prompt template.",
    });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : "Failed to evolve skill");
  }
}
