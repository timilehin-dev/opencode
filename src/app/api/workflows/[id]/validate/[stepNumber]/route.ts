// ---------------------------------------------------------------------------
// Phase 7B: Workflow Step Validation API Route
// ---------------------------------------------------------------------------
// POST — Re-validate a specific step
//
// Phase 7C: Fixed redundant query bug, uses shared pool, structured error handling.
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { validateStep } from "@/lib/workflows/workflow-engine";
import { getPool } from "@/lib/core/db";
import { withErrorHandler, ApiError } from "@/lib/core/api-errors";
import { logger } from "@/lib/core/logger";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; stepNumber: string }> },
) {
  return withErrorHandler(async () => {
    const { id: workflowId, stepNumber } = await params;
    const stepNum = Number(stepNumber);

    if (isNaN(stepNum) || stepNum < 1) {
      throw ApiError.badRequest("stepNumber must be a positive integer");
    }

    const pool = getPool();

    const stepResult = await pool.query(
      `SELECT id, output_result, description FROM workflow_steps
       WHERE workflow_id = $1 AND step_number = $2`,
      [workflowId, stepNum],
    );

    if (stepResult.rows.length === 0) {
      throw ApiError.notFound("Step", `workflow=${workflowId}, step=${stepNum}`);
    }

    const step = stepResult.rows[0];

    if (!step.output_result) {
      throw ApiError.badRequest("Step has no output to validate. Execute the step first.");
    }

    logger.info("workflow-api", `Re-validating step ${stepNum} in workflow ${workflowId}`);

    const result = await validateStep(step.id, step.output_result, step.description);

    return Response.json({
      success: true,
      data: {
        step_id: step.id,
        score: result.score,
        feedback: result.feedback,
      },
    });
  }, "workflow-validate");
}
