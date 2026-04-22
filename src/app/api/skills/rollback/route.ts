// ---------------------------------------------------------------------------
// Phase 6C: Skill Rollback API
// ---------------------------------------------------------------------------
// POST /api/skills/rollback — Revert a skill to a previous version
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// --- POST /api/skills/rollback ---
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { skill_id, evolution_id } = body as { skill_id?: string; evolution_id?: string };

    if (!skill_id || !evolution_id) {
      return NextResponse.json(
        { success: false, error: "skill_id and evolution_id are required" },
        { status: 400 }
      );
    }

    // 1. Fetch the evolution record
    const evoResult = await query(
      `SELECT id, skill_id, change_type, previous_state, new_state, change_reason, trigger_agent_id, created_at
       FROM skill_evolution WHERE id = $1 AND skill_id = $2`,
      [evolution_id, skill_id]
    );

    if (evoResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Evolution record not found" },
        { status: 404 }
      );
    }

    const evolution = evoResult.rows[0];

    // 2. Parse previous_state to get the prompt to restore
    let previousState: Record<string, unknown> = {};
    try {
      previousState = typeof evolution.previous_state === "string"
        ? JSON.parse(evolution.previous_state)
        : (evolution.previous_state || {});
    } catch {
      return NextResponse.json(
        { success: false, error: "Could not parse previous_state from evolution record" },
        { status: 400 }
      );
    }

    const restorePrompt = previousState.prompt_template as string;
    if (!restorePrompt || typeof restorePrompt !== "string" || restorePrompt.length < 10) {
      return NextResponse.json(
        { success: false, error: "No valid prompt_template found in previous_state" },
        { status: 400 }
      );
    }

    // 3. Fetch current skill state (for the new evolution record)
    const skillResult = await query(
      `SELECT prompt_template, version, performance_score FROM skills WHERE id = $1`,
      [skill_id]
    );

    if (skillResult.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Skill not found" }, { status: 404 });
    }

    const currentSkill = skillResult.rows[0];
    const currentVersion = Number(currentSkill.version) || 1;

    // 4. Create a new evolution record documenting the rollback
    await query(
      `INSERT INTO skill_evolution (skill_id, change_type, previous_state, new_state, change_reason, trigger_agent_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING id`,
      [
        skill_id,
        "reverted",
        JSON.stringify({
          version: currentVersion,
          prompt_template: currentSkill.prompt_template,
          performance_score: Number(currentSkill.performance_score) || 0,
        }),
        JSON.stringify({
          version: currentVersion + 1,
          prompt_template: restorePrompt,
          rolled_back_from_evolution: evolution_id,
        }),
        `Rollback to evolution ${evolution_id} (original version ${previousState.version || "?"})`,
        "system",
      ]
    );

    // 5. Restore the skill to previous state via PUT to /api/skills/[id]
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "";
    const updateRes = await fetch(`${baseUrl}/api/skills/${skill_id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt_template: restorePrompt }),
      signal: AbortSignal.timeout(15000),
    });

    if (!updateRes.ok) {
      const updateErr = await updateRes.text().catch(() => "Unknown error");
      return NextResponse.json(
        { success: false, error: `Failed to restore skill: ${updateErr}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        skill_id,
        evolution_id,
        rolled_back_to_version: previousState.version,
        restored_prompt_length: restorePrompt.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Rollback failed";
    console.error("[SkillRollback] Error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
