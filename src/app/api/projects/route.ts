// ---------------------------------------------------------------------------
// Project Management API — CRUD operations for projects and tasks
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";

/* eslint-disable @typescript-eslint/no-require-imports */
const { Pool } = require("pg");
/* eslint-disable @typescript-eslint/no-require-imports */

function getPool() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) throw new Error("SUPABASE_DB_URL not configured");
  return new Pool({ connectionString, max: 3, idleTimeoutMillis: 10000 });
}

// --- GET /api/projects?status=...&agent_id=... ---
export async function GET(req: Request) {
  const pool = getPool();
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const agentId = searchParams.get("agent_id");
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    let query = "SELECT * FROM projects WHERE 1=1";
    const params: unknown[] = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    if (agentId) {
      query += ` AND agent_id = $${paramIndex++}`;
      params.push(agentId);
    }

    query += ` ORDER BY updated_at DESC LIMIT $${paramIndex++}`;
    params.push(limit);

    const result = await pool.query(query, params);
    return NextResponse.json({ success: true, data: result.rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch projects";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  } finally {
    await pool.end();
  }
}

// --- POST /api/projects — Create a new project ---
export async function POST(req: Request) {
  const pool = getPool();
  try {
    const body = await req.json();
    const { name, description, priority, agent_id, agent_name, config, deadline, tags } = body;

    if (!name) {
      return NextResponse.json({ success: false, error: "Project name is required" }, { status: 400 });
    }

    const result = await pool.query(
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
  } finally {
    await pool.end();
  }
}

// --- PATCH /api/projects?project_id=... — Update project ---
export async function PATCH(req: Request) {
  const pool = getPool();
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
    const result = await pool.query(
      `UPDATE projects SET ${fields.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      params,
    );

    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update project";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  } finally {
    await pool.end();
  }
}
