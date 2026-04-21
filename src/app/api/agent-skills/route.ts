// ---------------------------------------------------------------------------
// Agent Skills — Get/Set agent skill bindings (GET/POST)
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";

/* eslint-disable @typescript-eslint/no-require-imports */
const { Pool } = require("pg");

function getPool() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) throw new Error("SUPABASE_DB_URL not configured");
  return new Pool({ connectionString, max: 3, idleTimeoutMillis: 10000 });
}

// --- GET /api/agent-skills?agent_id=... ---
// Returns all skills equipped by an agent
export async function GET(req: Request) {
  const pool = getPool();
  try {
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("agent_id");

    if (!agentId) {
      return NextResponse.json({ success: false, error: "agent_id is required" }, { status: 400 });
    }

    const result = await pool.query(
      `SELECT as2.*, s.name, s.display_name, s.description, s.category, s.difficulty,
              s.performance_score, s.total_uses, s.avg_rating
       FROM agent_skills as2
       JOIN skills s ON as2.skill_id = s.id
       WHERE as2.agent_id = $1 AND as2.is_equipped = true
       ORDER BY s.display_name`,
      [agentId]
    );

    return NextResponse.json({ success: true, data: result.rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch agent skills";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  } finally {
    await pool.end();
  }
}

// --- POST /api/agent-skills — Equip/unequip skills for an agent ---
export async function POST(req: Request) {
  const pool = getPool();
  try {
    const body = await req.json();
    const { agent_id, skill_ids, unequip_skill_ids } = body;

    if (!agent_id) {
      return NextResponse.json({ success: false, error: "agent_id is required" }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Equip new skills
      if (skill_ids && Array.isArray(skill_ids)) {
        for (const skillId of skill_ids) {
          await client.query(
            `INSERT INTO agent_skills (agent_id, skill_id, is_equipped, equipped_at)
             VALUES ($1, $2, true, NOW())
             ON CONFLICT (agent_id, skill_id)
             DO UPDATE SET is_equipped = true, equipped_at = NOW()`,
            [agent_id, skillId]
          );
        }
      }

      // Unequip skills
      if (unequip_skill_ids && Array.isArray(unequip_skill_ids)) {
        for (const skillId of unequip_skill_ids) {
          await client.query(
            `UPDATE agent_skills SET is_equipped = false WHERE agent_id = $1 AND skill_id = $2`,
            [agent_id, skillId]
          );
        }
      }

      await client.query("COMMIT");

      // Return updated list
      const result = await pool.query(
        `SELECT as2.*, s.name, s.display_name, s.description, s.category
         FROM agent_skills as2 JOIN skills s ON as2.skill_id = s.id
         WHERE as2.agent_id = $1 AND as2.is_equipped = true
         ORDER BY s.display_name`,
        [agent_id]
      );

      return NextResponse.json({ success: true, data: result.rows });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update agent skills";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  } finally {
    await pool.end();
  }
}
