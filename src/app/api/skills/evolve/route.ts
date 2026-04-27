import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function ok(data: unknown) { return NextResponse.json({ success: true, data }); }
function err(msg: string, status = 500) { return NextResponse.json({ success: false, error: msg }, { status }); }

// POST /api/skills/evolve — evolve a skill or list evolution records
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, skill_id, agent_id, limit: limitParam } = body;

    // LIST action — return evolution records with skill names
    if (action === "list") {
      const { query } = await import("@/lib/core/db");
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

    // EVOLVE action — delegate to the skill evolution engine
    if (!skill_id) return err("skill_id required", 400);

    const { evolveSkill } = await import("@/lib/skills/skill-evolution-engine");
    const result = await evolveSkill(skill_id, agent_id || "system");

    return ok({
      evolution: result,
      message: result.success
        ? `Skill evolved to v${result.new_version} with ${result.improvements.length} improvement(s).`
        : `Evolution skipped: ${result.error}`,
    });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : "Failed to evolve skill");
  }
}
