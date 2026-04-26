import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

function ok(data: unknown) { return NextResponse.json({ success: true, data }); }
function err(msg: string, status = 500) { return NextResponse.json({ success: false, error: msg }, { status }); }

// POST /api/skills/rollback — rollback to a previous evolution
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

    // Rollback the skill to previous version
    const result = await query(
      `UPDATE skills SET
         prompt_template = $1,
         version = $2,
         updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [evo.previous_prompt, evo.previous_version, skill_id]
    );

    // Mark evolution as rolled back
    await query(
      "UPDATE skill_evolution SET status = 'rolled_back', updated_at = NOW() WHERE id = $1",
      [evolution_id]
    );

    return ok(result.rows[0]);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : "Failed to rollback skill");
  }
}
