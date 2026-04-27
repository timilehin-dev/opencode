import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/core/db";

export const dynamic = "force-dynamic";

function ok(data: unknown) { return NextResponse.json({ success: true, data }); }
function err(msg: string, status = 500) { return NextResponse.json({ success: false, error: msg }, { status }); }

// POST /api/skills/rollback — rollback to a previous evolution state
// Uses actual columns: previous_state (jsonb), version (integer)
export async function POST(req: NextRequest) {
  try {
    const { skill_id, evolution_id } = await req.json();
    if (!skill_id || !evolution_id) return err("skill_id and evolution_id required", 400);

    // Get the evolution record
    const evoResult = await query(
      "SELECT * FROM skill_evolution WHERE id = $1 AND skill_id = $2",
      [evolution_id, skill_id]
    );
    if (evoResult.rows.length === 0) return err("Evolution record not found", 404);
    const evo = evoResult.rows[0];

    // Extract previous prompt_template from previous_state JSON
    const prevState = evo.previous_state || {};
    const prevPrompt = typeof prevState === "object" ? prevState.prompt_template : null;
    const prevVersion = evo.version || 1;

    if (!prevPrompt) return err("No previous state available for rollback", 400);

    // Rollback the skill to previous version
    const result = await query(
      `UPDATE skills SET
         prompt_template = $1,
         version = $2,
         updated_at = NOW()
       WHERE id = $3
       RETURNING id, name, slug, display_name, description, category, difficulty, prompt_template, workflow_steps, required_tools, tags, agent_bindings, version, performance_score, avg_rating, total_uses, successful_uses, success_count, failure_count, is_active, is_builtin, has_embedding, created_by, metadata, created_at, updated_at`,
      [prevPrompt, prevVersion, skill_id]
    );

    if (result.rows.length === 0) return err("Skill not found", 404);

    return ok({ skill: result.rows[0], rolled_back_to: prevVersion });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : "Failed to rollback skill");
  }
}
