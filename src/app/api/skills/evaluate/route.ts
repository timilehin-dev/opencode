import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

function ok(data: unknown) { return NextResponse.json({ success: true, data }); }
function err(msg: string, status = 500) { return NextResponse.json({ success: false, error: msg }, { status }); }

// POST /api/skills/evaluate — evaluate a skill execution
export async function POST(req: NextRequest) {
  try {
    const { skill_id, agent_id, task_id, input_summary, output_summary, success } = await req.json();
    if (!skill_id || !agent_id || !input_summary || !output_summary) {
      return err("skill_id, agent_id, input_summary, output_summary required", 400);
    }

    const result = await query(
      `INSERT INTO skill_evaluations (skill_id, agent_id, task_id, input_summary, output_summary, success)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [skill_id, agent_id, task_id || null, input_summary, output_summary, success ?? true]
    );

    return ok(result.rows[0]);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : "Failed to evaluate skill");
  }
}
