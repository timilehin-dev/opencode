// ---------------------------------------------------------------------------
// Phase 7B: Workflow Detail/Update/Delete API Route
// ---------------------------------------------------------------------------
// GET    — Get workflow details with all steps
// PATCH  — Update workflow status (pause/resume/cancel)
// DELETE — Delete a workflow
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-require-imports */
const { Pool } = require("pg");

import { NextRequest } from "next/server";
import { getWorkflowStatus } from "@/lib/workflow-engine";

function getPool() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) throw new Error("SUPABASE_DB_URL not configured");
  return new Pool({ connectionString, max: 3, idleTimeoutMillis: 10000 });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const workflow = await getWorkflowStatus(id);

    return Response.json({ success: true, data: workflow });
  } catch (error) {
    console.error("[WorkflowDetailAPI] GET error:", error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { status } = body as { status: string };

    if (!["paused", "running", "cancelled"].includes(status)) {
      return Response.json(
        { success: false, error: `Invalid status. Must be one of: paused, running, cancelled` },
        { status: 400 },
      );
    }

    const pool = getPool();

    try {
      const result = await pool.query(
        `UPDATE agent_workflows SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, status`,
        [status, id],
      );

      if (result.rows.length === 0) {
        return Response.json({ success: false, error: "Workflow not found" }, { status: 404 });
      }

      // If cancelling, also cancel pending steps
      if (status === "cancelled") {
        await pool.query(
          `UPDATE workflow_steps SET status = 'skipped' WHERE workflow_id = $1 AND status IN ('pending', 'running')`,
          [id],
        );
      }

      // If resuming, reset failed steps to pending (for retry)
      if (status === "running") {
        await pool.query(
          `UPDATE workflow_steps SET status = 'pending', started_at = NULL, error_message = NULL
           WHERE workflow_id = $1 AND status = 'failed' AND attempts < max_attempts`,
          [id],
        );
      }

      return Response.json({
        success: true,
        data: { id: result.rows[0].id, status: result.rows[0].status },
      });
    } finally {
      await pool.end();
    }
  } catch (error) {
    console.error("[WorkflowDetailAPI] PATCH error:", error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const pool = getPool();

    try {
      // Soft delete — cancel first
      await pool.query(
        `UPDATE agent_workflows SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
        [id],
      );

      // Hard delete
      await pool.query(`DELETE FROM agent_workflows WHERE id = $1`, [id]);

      return Response.json({ success: true, message: "Workflow deleted" });
    } finally {
      await pool.end();
    }
  } catch (error) {
    console.error("[WorkflowDetailAPI] DELETE error:", error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
