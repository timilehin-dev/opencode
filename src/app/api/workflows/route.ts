// ---------------------------------------------------------------------------
// Phase 7B: Workflow List/Create API Route
// ---------------------------------------------------------------------------
// GET  — List workflows with optional filters
// POST — Plan and create a new workflow
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { listWorkflows, planWorkflow } from "@/lib/workflows/workflow-engine";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("agent_id") || undefined;
    const status = searchParams.get("status") || undefined;
    const limit = Number(searchParams.get("limit") || "20");

    const workflows = await listWorkflows(agentId, status, limit);

    return Response.json({ success: true, data: workflows });
  } catch (error) {
    console.error("[WorkflowsAPI] GET error:", error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, agent_id } = body as { query: string; agent_id?: string };

    if (!query || query.trim().length === 0) {
      return Response.json(
        { success: false, error: "Query is required" },
        { status: 400 },
      );
    }

    const agentId = agent_id || "general";
    const result = await planWorkflow(query, agentId);

    return Response.json({
      success: true,
      data: {
        workflow_id: result.workflowId,
        plan: result.plan,
      },
    });
  } catch (error) {
    console.error("[WorkflowsAPI] POST error:", error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
