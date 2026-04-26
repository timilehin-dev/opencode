import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

function ok(data: unknown) { return NextResponse.json({ success: true, data }); }
function err(msg: string, status = 500) { return NextResponse.json({ success: false, error: msg }, { status }); }

// GET /api/skills/[id] — get single skill
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await query("SELECT id, name, slug, display_name, description, category, difficulty, prompt_template, workflow_steps, required_tools, tags, agent_bindings, version, performance_score, avg_rating, total_uses, successful_uses, success_count, failure_count, is_active, is_builtin, has_embedding, created_by, metadata, created_at, updated_at FROM skills WHERE id = $1", [id]);
    if (result.rows.length === 0) return err("Skill not found", 404);
    return ok(result.rows[0]);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : "Failed to get skill");
  }
}

// PUT /api/skills/[id] — update skill
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const fields: string[] = [];
    const values: unknown[] = [];
    let pi = 1;

    const allowed = ["name", "display_name", "description", "category", "difficulty", "prompt_template", "workflow_steps", "required_tools", "tags", "is_active", "metadata"];
    for (const key of allowed) {
      if (body[key] !== undefined) {
        fields.push(`${key} = $${pi}`);
        values.push(typeof body[key] === "object" ? JSON.stringify(body[key]) : body[key]);
        pi++;
      }
    }

    if (fields.length === 0) return err("No fields to update", 400);

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await query(
      `UPDATE skills SET ${fields.join(", ")} WHERE id = $${pi} RETURNING id, name, slug, display_name, description, category, difficulty, prompt_template, workflow_steps, required_tools, tags, agent_bindings, version, performance_score, avg_rating, total_uses, successful_uses, success_count, failure_count, is_active, is_builtin, has_embedding, created_by, metadata, created_at, updated_at`,
      values
    );
    if (result.rows.length === 0) return err("Skill not found", 404);
    return ok(result.rows[0]);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : "Failed to update skill");
  }
}

// DELETE /api/skills/[id] — soft delete (set is_active=false)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await query(
      "UPDATE skills SET is_active = false, updated_at = NOW() WHERE id = $1 AND is_builtin = false RETURNING *",
      [id]
    );
    if (result.rows.length === 0) return err("Skill not found or is builtin", 404);
    return ok(result.rows[0]);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : "Failed to delete skill");
  }
}
