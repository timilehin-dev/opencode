// ---------------------------------------------------------------------------
// Rate a Skill — POST /api/skills/rate
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

// --- POST /api/skills/rate ---
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { skill_id, agent_id, task_id, rating, feedback, context } = body;

    if (!skill_id || !agent_id || !rating) {
      return NextResponse.json(
        { success: false, error: "skill_id, agent_id, and rating (1-5) are required" },
        { status: 400 }
      );
    }

    if (rating < 1 || rating > 5) {
      return NextResponse.json(
        { success: false, error: "Rating must be between 1 and 5" },
        { status: 400 }
      );
    }

    const client = await getPool().connect();

    try {
      await client.query("BEGIN");

      // Insert the rating
      const ratingResult = await client.query(
        `INSERT INTO skill_ratings (skill_id, agent_id, task_id, rating, feedback, context)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          skill_id, agent_id, task_id || null, rating,
          feedback || null, context ? JSON.stringify(context) : "{}"
        ]
      );

      // Update skill performance metrics
      // Increment total_uses
      await client.query(
        `UPDATE skills SET total_uses = COALESCE(total_uses, 0) + 1, updated_at = NOW() WHERE id = $1`,
        [skill_id]
      );

      // Increment successful_uses for ratings >= 3
      if (rating >= 3) {
        await client.query(
          `UPDATE skills SET successful_uses = COALESCE(successful_uses, 0) + 1 WHERE id = $1`,
          [skill_id]
        );
      }

      // Recalculate avg_rating and performance_score
      const statsResult = await client.query(
        `SELECT
           AVG(rating) as new_avg_rating,
           COUNT(*) as total_ratings,
           SUM(CASE WHEN rating >= 3 THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0) as success_rate
         FROM skill_ratings WHERE skill_id = $1`,
        [skill_id]
      );

      if (statsResult.rows.length > 0) {
        const { new_avg_rating, success_rate } = statsResult.rows[0];
        await client.query(
          `UPDATE skills
           SET avg_rating = $1,
               performance_score = $2,
               updated_at = NOW()
           WHERE id = $3`,
          [parseFloat(new_avg_rating) || 0, parseFloat(success_rate) || 0, skill_id]
        );
      }

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        data: {
          rating_id: ratingResult.rows[0].id,
          skill_id,
          agent_id,
          rating
        }
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to rate skill";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
