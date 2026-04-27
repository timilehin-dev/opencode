// ---------------------------------------------------------------------------
// Phase 7B: Workflow Detail/Update/Delete API Route
// ---------------------------------------------------------------------------
// GET    — Get workflow details with all steps
// PATCH  — Update workflow status (pause/resume/cancel)
// DELETE — Delete a workflow
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { getWorkflowStatus } from "@/lib/workflows/workflow-engine";
import { query } from "@/lib/core/db";

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

    const result = await query(
      `UPDATE agent_workflows SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, status`,
      [status, id],
    );

    if (result.rows.length === 0) {
      return Response.json({ success: false, error: "Workflow not found" }, { status: 404 });
    }

    // If cancelling, also cancel pending steps
    if (status === "cancelled") {
      await query(
        `UPDATE workflow_steps SET status = 'skipped' WHERE workflow_id = $1 AND status IN ('pending', 'running')`,
        [id],
      );
    }

    // If resuming, reset failed steps to pending (for retry)
    // Enhanced: only reset steps >= resumable_from_step if set, and implement
    // exponential backoff for retry timing.
    if (status === "running") {
      // First fetch the workflow to check for resumable_from_step
      const wfResult = await query(
        `SELECT resumable_from_step FROM agent_workflows WHERE id = $1`,
        [id],
      );

      const resumableFromStep = wfResult.rows[0]?.resumable_from_step;

      if (resumableFromStep !== null && resumableFromStep !== undefined) {
        // Only reset failed steps at or after the resumable step
        const stepsResult = await query(
          `UPDATE workflow_steps
           SET status = 'pending', started_at = NULL, error_message = NULL
           WHERE workflow_id = $1
             AND status = 'failed'
             AND step_number >= $2
             AND attempts < max_attempts
           RETURNING id, step_number, attempts`,
          [id, resumableFromStep],
        );

        // Set next_retry_at with exponential backoff for each reset step
        for (const step of stepsResult.rows) {
          const attempts = Number(step.attempts) || 0;
          // Exponential backoff: 60000 * 2^attempts, max 4 hours
          const backoffMs = Math.min(60000 * Math.pow(2, attempts), 4 * 60 * 60 * 1000);
          await query(
            `UPDATE workflow_steps SET next_retry_at = NOW() + ($1 || ' milliseconds')::interval
             WHERE id = $2`,
            [String(backoffMs), step.id],
          );
        }
      } else {
        // Original behavior: reset all failed steps
        await query(
          `UPDATE workflow_steps SET status = 'pending', started_at = NULL, error_message = NULL
           WHERE workflow_id = $1 AND status = 'failed' AND attempts < max_attempts`,
          [id],
        );
      }
    }

    return Response.json({
      success: true,
      data: { id: result.rows[0].id, status: result.rows[0].status },
    });
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

    // Soft delete — cancel first
    await query(
      `UPDATE agent_workflows SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [id],
    );

    // Hard delete
    await query(`DELETE FROM agent_workflows WHERE id = $1`, [id]);

    return Response.json({ success: true, message: "Workflow deleted" });
  } catch (error) {
    console.error("[WorkflowDetailAPI] DELETE error:", error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
