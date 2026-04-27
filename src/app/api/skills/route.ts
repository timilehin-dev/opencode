import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/core/db";

export const dynamic = "force-dynamic";

function ok(data: unknown) { return NextResponse.json({ success: true, data }); }
function err(msg: string, status = 500) { return NextResponse.json({ success: false, error: msg }, { status }); }

// GET /api/skills — list skills with optional filters
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const search = sp.get("search");
    const category = sp.get("category");
    const agent = sp.get("agent");
    const limit = parseInt(sp.get("limit") || "50", 10);

    // Exclude embedding vector from list response — it's huge (1536 floats)
    let sql = "SELECT id, name, slug, display_name, description, category, difficulty, prompt_template, workflow_steps, required_tools, tags, agent_bindings, version, performance_score, avg_rating, total_uses, successful_uses, success_count, failure_count, is_active, is_builtin, has_embedding, created_by, created_at, updated_at FROM skills WHERE is_active = true";
    const params: unknown[] = [];
    let pi = 1;

    if (search) {
      sql += ` AND (name ILIKE $${pi} OR display_name ILIKE $${pi} OR description ILIKE $${pi})`;
      params.push(`%${search}%`);
      pi++;
    }
    if (category) {
      sql += ` AND category = $${pi}`;
      params.push(category);
      pi++;
    }
    if (agent) {
      sql += ` AND (agent_bindings @> $${pi} OR array_length(agent_bindings, 1) IS NULL)`;
      params.push([agent]);
      pi++;
    }

    sql += ` ORDER BY performance_score DESC NULLS LAST, total_uses DESC NULLS LAST LIMIT $${pi}`;
    params.push(limit);

    const result = await query(sql, params);
    return ok(result.rows);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : "Failed to list skills");
  }
}

// POST /api/skills — create a new skill
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, display_name, description, category, difficulty, prompt_template, workflow_steps, required_tools, tags } = body;

    if (!name || !description || !prompt_template) {
      return err("name, description, and prompt_template are required", 400);
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    const result = await query(
      `INSERT INTO skills (name, slug, display_name, description, category, difficulty, prompt_template, workflow_steps, required_tools, tags, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (name) DO UPDATE SET
         description = EXCLUDED.description,
         prompt_template = EXCLUDED.prompt_template,
         updated_at = NOW()
       RETURNING *`,
      [
        name, slug, display_name || name, description,
        category || "general", difficulty || "intermediate",
        prompt_template, JSON.stringify(workflow_steps || []),
        required_tools || [], tags || [], body.created_by || "system",
      ]
    );

    return ok(result.rows[0]);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : "Failed to create skill");
  }
}
