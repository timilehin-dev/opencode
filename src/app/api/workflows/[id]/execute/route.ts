// ---------------------------------------------------------------------------
// Phase 7B: Workflow Execute API Route
// ---------------------------------------------------------------------------
// POST — Execute all pending steps in a workflow
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { executeWorkflow } from "@/lib/workflow-engine";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { agent_id, auto_validate } = body as { agent_id?: string; auto_validate?: boolean };

    const agentId = agent_id || "general";

    const result = await executeWorkflow(id, agentId, auto_validate !== false);

    return Response.json({
      success: true,
      data: {
        status: result.status,
        steps_executed: result.results.length,
        results: result.results.map((r) => ({
          id: r.id,
          step_number: r.step_number,
          title: r.title,
          status: r.status,
          validation_score: r.validation_score ? Number(r.validation_score) : null,
          error_message: r.error_message,
        })),
      },
    });
  } catch (error) {
    console.error("[WorkflowExecuteAPI] POST error:", error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
