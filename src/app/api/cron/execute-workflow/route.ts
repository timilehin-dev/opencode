// ---------------------------------------------------------------------------
// pg_cron — Execute Scheduled Workflow
// Called by pg_cron with a specific workflow ID.
// Each scheduled workflow gets its own pg_cron job that hits this endpoint.
//
// URL format: /api/cron/execute-workflow?secret=...&workflowId=uuid
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { executeWorkflow, listWorkflows } from "@/lib/workflow-engine";
import { logActivity, persistAgentStatus } from "@/lib/activity";
import { query } from "@/lib/db";
import { sendProactiveNotification } from "@/lib/proactive-notifications";
import { getAgent } from "@/lib/agents";

export const maxDuration = 300;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  const workflowId = searchParams.get("workflowId");

  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!workflowId) {
    return NextResponse.json({ error: "Missing workflowId" }, { status: 400 });
  }

  if (!process.env.SUPABASE_DB_URL) {
    return NextResponse.json({ error: "No database" }, { status: 500 });
  }

  const startTime = Date.now();

  try {
    // Fetch the workflow
    const workflows = await listWorkflows(undefined, undefined, 1);
    const workflow = workflows.find(w => w.id === workflowId);

    if (!workflow || ["completed", "failed", "cancelled"].includes(workflow.status)) {
      // Workflow not found or terminal — clean up the pg_cron job
      try {
        const jobName = `workflow-${workflowId.replace(/[^a-zA-Z0-9-]/g, "")}`;
        await query(`SELECT cron.unschedule('${jobName}')`).catch(() => {});
      } catch { /* ignore */ }
      return NextResponse.json({ status: "skipped", reason: "workflow_not_found_or_terminal" });
    }

    const agentId = workflow.agent_id;
    const workflowName = workflow.name;

    const agent = getAgent(agentId);
    const agentName = agent?.name || agentId;

    // Update agent status
    persistAgentStatus(agentId, {
      status: "busy",
      currentTask: `[Workflow] ${workflowName}`,
      lastActivity: new Date().toISOString(),
    }).catch(() => {});

    logActivity({
      agentId,
      agentName,
      action: "workflow_execution_started",
      detail: `Executing scheduled workflow: ${workflowName}`,
    }).catch(() => {});

    // Execute the workflow
    const result = await executeWorkflow(workflowId, agentId, true);

    // Re-fetch to get updated status
    const updatedWorkflows = await listWorkflows(undefined, undefined, 1);
    const updated = updatedWorkflows.find(w => w.id === workflowId);

    const durationMs = Date.now() - startTime;

    if (updated && ["completed", "completed_with_errors"].includes(updated.status)) {
      // Workflow completed — for non-recurring, clean up cron job
      const isRecurring = updated.schedule_interval && Number(updated.schedule_interval) > 0;

      if (!isRecurring) {
        const jobName = `workflow-${workflowId.replace(/[^a-zA-Z0-9-]/g, "")}`;
        await query(`SELECT cron.unschedule('${jobName}')`).catch(() => {});
      }

      persistAgentStatus(agentId, { status: "idle", currentTask: null, lastActivity: new Date().toISOString() }).catch(() => {});

      sendProactiveNotification({
        agentId,
        agentName,
        type: "routine_result",
        title: `Workflow: ${workflowName}`,
        body: `Workflow completed with ${updated.completed_steps}/${updated.total_steps} steps (quality: ${updated.quality_score || "N/A"})`,
        priority: "low",
      }).catch(() => {});
    } else if (updated?.status === "failed") {
      persistAgentStatus(agentId, { status: "error", currentTask: null, lastActivity: new Date().toISOString() }).catch(() => {});

      sendProactiveNotification({
        agentId,
        agentName,
        type: "alert",
        title: `Workflow Failed: ${workflowName}`,
        body: updated.error_message || "Unknown error",
        priority: "high",
      }).catch(() => {});
    } else {
      persistAgentStatus(agentId, { status: "idle", currentTask: null, lastActivity: new Date().toISOString() }).catch(() => {});
    }

    return NextResponse.json({
      status: updated?.status || "unknown",
      workflowId,
      workflowName,
      agentId,
      durationMs,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    logActivity({
      agentId: "system",
      action: "workflow_execution_error",
      detail: `Workflow ${workflowId} failed: ${errMsg}`,
    }).catch(() => {});

    return NextResponse.json({ status: "error", error: errMsg, durationMs: Date.now() - startTime });
  }
}
