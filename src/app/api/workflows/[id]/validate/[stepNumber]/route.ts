// ---------------------------------------------------------------------------
// Phase 7B: Workflow Step Validation API Route
// ---------------------------------------------------------------------------
// POST — Re-validate a specific step
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { validateStep } from "@/lib/workflow-engine";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; stepNumber: string }> },
) {
  try {
    const { stepNumber } = await params;

    // We need to find the step ID from the step number
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { Pool } = require("pg");
    const pool = new Pool({
      connectionString: process.env.SUPABASE_DB_URL,
      max: 3,
      idleTimeoutMillis: 10000,
    });

    try {
      const stepResult = await pool.query(
        `SELECT id, output_result, description FROM workflow_steps
         WHERE workflow_id = $1 AND step_number = $2`,
        [_req.url.split("/")[5], Number(stepNumber)],
      );

      // Extract workflow_id from URL path
      const urlParts = new URL(_req.url).pathname.split("/");
      const workflowId = urlParts[3]; // /api/workflows/[id]/validate/[stepNumber]

      const stepWithWorkflow = await pool.query(
        `SELECT id, output_result, description FROM workflow_steps
         WHERE workflow_id = $1 AND step_number = $2`,
        [workflowId, Number(stepNumber)],
      );

      if (stepWithWorkflow.rows.length === 0) {
        return Response.json({ success: false, error: "Step not found" }, { status: 404 });
      }

      const step = stepWithWorkflow.rows[0];

      if (!step.output_result) {
        return Response.json(
          { success: false, error: "Step has no output to validate. Execute the step first." },
          { status: 400 },
        );
      }

      const result = await validateStep(step.id, step.output_result, step.description);

      return Response.json({
        success: true,
        data: {
          step_id: step.id,
          score: result.score,
          feedback: result.feedback,
        },
      });
    } finally {
      await pool.end();
    }
  } catch (error) {
    console.error("[WorkflowValidateAPI] POST error:", error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
