// ---------------------------------------------------------------------------
// Todos API — CRUD for workspace todos
// GET /api/todos — list open todos
// POST /api/todos — update a todo (mark done, etc.)
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { listTodos, updateTodo } from "@/lib/workspace";

export async function GET() {
  try {
    const todos = await listTodos({ limit: 50 });
    return NextResponse.json({ success: true, data: todos });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, status } = body as { id?: number; status?: string };

    if (!id || !status) {
      return NextResponse.json(
        { success: false, error: "Missing id or status" },
        { status: 400 },
      );
    }

    const updated = await updateTodo(id, { status });
    return NextResponse.json({ success: true, data: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
