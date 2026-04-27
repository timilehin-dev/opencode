// ---------------------------------------------------------------------------
// Project Management API — CRUD operations for projects and tasks
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { query } from "@/lib/core/db";

// --- GET /api/projects?status=...&agent_id=... ---
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const agentId = searchParams.get("agent_id");
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    let queryString = "SELECT * FROM projects WHERE 1=1";
    const params: unknown[] = [];
    let paramIndex = 1;

    if (status) {
      queryString += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    if (agentId) {
      queryString += ` AND agent_id = $${paramIndex++}`;
      params.push(agentId);
    }

    queryString += ` ORDER BY updated_at DESC LIMIT $${paramIndex++}`;
    params.push(limit);

    const result = await query(queryString, params);
    return NextResponse.json({ success: true, data: result.rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch projects";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// --- POST /api/projects — Create a new project ---
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, description, priority, agent_id, agent_name, config, deadline, tags } = body;

    if (!name) {
      return NextResponse.json({ success: false, error: "Project name is required" }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO projects (name, description, priority, agent_id, agent_name, config, deadline, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        name,
        description || null,
        priority || "medium",
        agent_id || "general",
        agent_name || null,
        JSON.stringify(config || {}),
        deadline || null,
        tags || [],
      ],
    );

    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create project";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// --- PATCH /api/projects?project_id=... — Update project ---
export async function PATCH(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("project_id");
    if (!projectId) return NextResponse.json({ success: false, error: "project_id required" }, { status: 400 });

    const body = await req.json();
    const fields: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(body)) {
      if (["name", "description", "status", "priority", "agent_id", "deadline", "config", "metadata"].includes(key)) {
        fields.push(`${key} = $${paramIndex++}`);
        params.push(key === "config" || key === "metadata" ? JSON.stringify(value) : value);
      }
    }

    if (fields.length === 0) {
      return NextResponse.json({ success: false, error: "No valid fields to update" }, { status: 400 });
    }

    params.push(projectId);
    const result = await query(
      `UPDATE projects SET ${fields.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      params,
    );

    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update project";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
