// ---------------------------------------------------------------------------
// Phase 5: Initiation History API
// GET — List/filter initiations
// POST — Create a manual initiation (user-initiated)
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agent_id");
    const initiatorId = searchParams.get("initiator_id");
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (agentId) {
      conditions.push(`(target_agent = $${paramIdx} OR initiator_agent = $${paramIdx})`);
      params.push(agentId);
      paramIdx++;
    }
    if (initiatorId) {
      conditions.push(`initiator_agent = $${paramIdx}`);
      params.push(initiatorId);
      paramIdx++;
    }
    if (status) {
      conditions.push(`status = $${paramIdx}`);
      params.push(status);
      paramIdx++;
    }
    if (type) {
      conditions.push(`initiation_type = $${paramIdx}`);
      params.push(type);
      paramIdx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows: initiations } = await query(
      `SELECT i.*,
              p.name as project_name
       FROM a2a_initiations i
       LEFT JOIN projects p ON p.id = i.related_project_id
       ${where}
       ORDER BY
         CASE i.urgency WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
         i.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    const { rows: countResult } = await query(
      `SELECT COUNT(*) as total FROM a2a_initiations ${where}`,
      params
    );

    // Stats
    const { rows: stats } = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'delivered') as pending,
        COUNT(*) FILTER (WHERE status = 'accepted') as accepted,
        COUNT(*) FILTER (WHERE status = 'declined') as declined,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE urgency = 'critical') as critical,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as last_24h
      FROM a2a_initiations
    `);

    return NextResponse.json({
      success: true,
      data: initiations,
      total: parseInt(countResult[0]?.total || "0"),
      stats: stats[0],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { initiator_agent, target_agent, initiation_type, subject, context, urgency, related_task_id } = body;

    if (!initiator_agent || !target_agent || !subject) {
      return NextResponse.json(
        { success: false, error: "initiator_agent, target_agent, and subject are required" },
        { status: 400 }
      );
    }

    const { rows } = await query(
      `INSERT INTO a2a_initiations (initiator_agent, target_agent, initiation_type, subject, context, urgency, status, related_task_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'delivered', $7)
       RETURNING id`,
      [
        initiator_agent,
        target_agent,
        initiation_type || "contact",
        subject,
        JSON.stringify(context || {}),
        urgency || "normal",
        related_task_id ?? null,
      ]
    );

    return NextResponse.json({
      success: true,
      initiation: rows[0],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
