// ---------------------------------------------------------------------------
// Skills API — List & Create (GET/POST)
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";

/* eslint-disable @typescript-eslint/no-require-imports */
const { Pool } = require("pg");

function getPool() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) throw new Error("SUPABASE_DB_URL not configured");
  return new Pool({ connectionString, max: 3, idleTimeoutMillis: 10000 });
}

// --- GET /api/skills?search=...&category=...&agent=...&active=true ---
export async function GET(req: Request) {
  const pool = getPool();
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const category = searchParams.get("category") || "";
    const agent = searchParams.get("agent") || "";
    const activeOnly = searchParams.get("active") !== "false";
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    let query = "SELECT * FROM skills WHERE 1=1";
    const params: unknown[] = [];
    let idx = 1;

    if (activeOnly) {
      query += ` AND is_active = true`;
    }
    if (search) {
      query += ` AND (name ILIKE $${idx} OR display_name ILIKE $${idx} OR description ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }
    if (category) {
      query += ` AND category = $${idx}`;
      params.push(category);
      idx++;
    }
    if (agent) {
      query += ` AND ($${idx} = ANY(agent_bindings) OR agent_bindings = '{}')`;
      params.push(agent);
      idx++;
    }

    // Get total count
    const countResult = await pool.query(query.replace("SELECT *", "SELECT COUNT(*)"), params);
    const total = parseInt(countResult.rows[0].count, 10);

    query += ` ORDER BY is_builtin DESC, performance_score DESC, total_uses DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return NextResponse.json({ success: true, data: result.rows, total, limit, offset });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch skills";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  } finally {
    await pool.end();
  }
}

// --- POST /api/skills — Create a new skill ---
export async function POST(req: Request) {
  const pool = getPool();
  try {
    const body = await req.json();
    const {
      name, display_name, description, category, difficulty,
      prompt_template, workflow_steps, required_tools, tags, agent_bindings
    } = body;

    if (!name || !display_name || !description || !prompt_template) {
      return NextResponse.json(
        { success: false, error: "name, display_name, description, and prompt_template are required" },
        { status: 400 }
      );
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

    const result = await pool.query(
      `INSERT INTO skills (name, display_name, slug, description, category, difficulty, prompt_template, workflow_steps, required_tools, tags, agent_bindings)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        name, display_name, slug, description,
        category || "general", difficulty || "intermediate",
        prompt_template,
        workflow_steps ? JSON.stringify(workflow_steps) : "[]",
        required_tools || [],
        tags || [],
        agent_bindings || []
      ]
    );

    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create skill";
    // Check for unique constraint violation
    if (message.includes("unique") || message.includes("duplicate")) {
      return NextResponse.json({ success: false, error: "A skill with this name already exists" }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  } finally {
    await pool.end();
  }
}
