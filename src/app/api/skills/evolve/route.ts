import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

function ok(data: unknown) { return NextResponse.json({ success: true, data }); }
function err(msg: string, status = 500) { return NextResponse.json({ success: false, error: msg }, { status }); }

// POST /api/skills/evolve — evolve a skill based on feedback
export async function POST(req: NextRequest) {
  try {
    const { skill_id, agent_id } = await req.json();
    if (!skill_id) return err("skill_id required", 400);

    // Get current skill
    const skillResult = await query("SELECT * FROM skills WHERE id = $1", [skill_id]);
    if (skillResult.rows.length === 0) return err("Skill not found", 404);
    const skill = skillResult.rows[0];

    // Get recent evaluations for context
    const evalsResult = await query(
      "SELECT * FROM skill_evaluations WHERE skill_id = $1 ORDER BY created_at DESC LIMIT 5",
      [skill_id]
    );
    const evaluations = evalsResult.rows;

    // Create evolution record
    const evoResult = await query(
      `INSERT INTO skill_evolution (skill_id, agent_id, previous_version, previous_prompt, trigger_summary, evaluations_context, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [
        skill_id,
        agent_id || "system",
        skill.version,
        skill.prompt_template,
        `Evolution triggered for ${skill.name} v${skill.version}`,
        JSON.stringify(evaluations),
      ]
    );

    return ok({
      evolution: evoResult.rows[0],
      message: "Evolution record created. Use the agent's AI capabilities to analyze feedback and improve the skill's prompt_template.",
    });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : "Failed to evolve skill");
  }
}
