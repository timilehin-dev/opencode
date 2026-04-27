// ---------------------------------------------------------------------------
// Phase 7B: Workflow Step Operations API Route
// ---------------------------------------------------------------------------
// GET  — Get step details
// POST — Execute a single step manually
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { runSingleStep, getWorkflowStatus } from "@/lib/workflows/workflow-engine";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; stepNumber: string }> },
) {
  try {
    const { id, stepNumber } = await params;
    const stepNum = Number(stepNumber);

    const workflow = await getWorkflowStatus(id);
    const step = workflow.steps.find((s) => s.step_number === stepNum);

    if (!step) {
      return Response.json({ success: false, error: "Step not found" }, { status: 404 });
    }

    return Response.json({ success: true, data: step });
  } catch (error) {
    console.error("[WorkflowStepAPI] GET error:", error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; stepNumber: string }> },
) {
  try {
    const { id, stepNumber } = await params;
    const stepNum = Number(stepNumber);
    const body = await req.json();
    const { agent_id } = body as { agent_id?: string };

    const agentId = agent_id || "general";
    const result = await runSingleStep(id, stepNum, agentId);

    return Response.json({
      success: true,
      data: {
        id: result.id,
        step_number: result.step_number,
        title: result.title,
        status: result.status,
        output_summary: result.output_summary,
        validation_score: result.validation_score ? Number(result.validation_score) : null,
        error_message: result.error_message,
        duration_ms: result.duration_ms,
      },
    });
  } catch (error) {
    console.error("[WorkflowStepAPI] POST error:", error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
