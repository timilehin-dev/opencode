// ---------------------------------------------------------------------------
// Individual Skill CRUD — GET / PUT / DELETE
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// --- GET /api/skills/[id] ---
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await query("SELECT * FROM skills WHERE id = $1", [id]);
    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Skill not found" }, { status: 404 });
    }
    const row = result.rows[0];
    const data = {
      ...row,
      performance_score: Number(row.performance_score) || 0,
      avg_rating: Number(row.avg_rating) || 0,
      total_uses: Number(row.total_uses) || 0,
    };
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch skill";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// --- PUT /api/skills/[id] ---
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    // Check skill exists
    const existing = await query("SELECT id FROM skills WHERE id = $1", [id]);
    if (existing.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Skill not found" }, { status: 404 });
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const updatable = [
      "display_name", "description", "category", "difficulty",
      "prompt_template", "tags", "agent_bindings", "is_active"
    ];

    for (const key of updatable) {
      if (body[key] !== undefined) {
        fields.push(`${key} = $${idx}`);
        values.push(
          Array.isArray(body[key]) ? body[key] : body[key]
        );
        idx++;
      }
    }

    // Handle JSON fields separately
    if (body.workflow_steps !== undefined) {
      fields.push(`workflow_steps = $${idx}`);
      values.push(JSON.stringify(body.workflow_steps));
      idx++;
    }
    if (body.required_tools !== undefined) {
      fields.push(`required_tools = $${idx}`);
      values.push(body.required_tools);
      idx++;
    }
    if (body.metadata !== undefined) {
      fields.push(`metadata = $${idx}`);
      values.push(JSON.stringify(body.metadata));
      idx++;
    }

    if (fields.length === 0) {
      return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
    }

    // Bump version on prompt_template change
    if (body.prompt_template !== undefined) {
      fields.push(`version = version + 1`);
    }
    fields.push(`updated_at = NOW()`);

    values.push(id);
    const result = await query(
      `UPDATE skills SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );

    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update skill";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// --- DELETE /api/skills/[id] ---
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Prevent deleting built-in skills
    const existing = await query("SELECT id, is_builtin FROM skills WHERE id = $1", [id]);
    if (existing.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Skill not found" }, { status: 404 });
    }
    if (existing.rows[0].is_builtin) {
      return NextResponse.json({ success: false, error: "Cannot delete built-in skills" }, { status: 403 });
    }

    await query("DELETE FROM skills WHERE id = $1", [id]);
    return NextResponse.json({ success: true, deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete skill";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
