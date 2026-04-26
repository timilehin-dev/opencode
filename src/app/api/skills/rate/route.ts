import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

function ok(data: unknown) { return NextResponse.json({ success: true, data }); }
function err(msg: string, status = 500) { return NextResponse.json({ success: false, error: msg }, { status }); }

// POST /api/skills/rate — rate a skill (1-5)
export async function POST(req: NextRequest) {
  try {
    const { skill_id, agent_id, rating, feedback } = await req.json();
    if (!skill_id || !agent_id || !rating) return err("skill_id, agent_id, and rating required", 400);
    if (rating < 1 || rating > 5) return err("rating must be 1-5", 400);

    const result = await query(
      `INSERT INTO skill_ratings (skill_id, agent_id, rating, feedback)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [skill_id, agent_id, rating, feedback || null]
    );

    // Update skill avg_rating
    await query(
      `UPDATE skills SET
         avg_rating = (SELECT COALESCE(AVG(rating), 0) FROM skill_ratings WHERE skill_id = $1),
         updated_at = NOW()
       WHERE id = $1`,
      [skill_id]
    );

    return ok(result.rows[0]);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : "Failed to rate skill");
  }
}
