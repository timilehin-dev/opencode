// ---------------------------------------------------------------------------
// Workflow Tools
// ---------------------------------------------------------------------------
import { z, tool, zodSchema, safeJson, safeParseRes, getSelfBaseUrl, getSelfFetchHeaders, query } from "./shared";

// Phase 7B: Multi-Step Workflow Tools
// ---------------------------------------------------------------------------

export const workflowPlanTool = tool({
  description: "Plan and create a new multi-step workflow. Decomposes a complex task into 2-8 sequential steps, each using the best available skill. Use this for complex multi-step tasks that involve research + analysis + creation, or tasks spanning multiple domains.",
  inputSchema: zodSchema(z.object({
    query: z.string().describe("The complex task to decompose into a multi-step workflow"),
    agent_id: z.string().optional().describe("Agent ID (default: 'general')"),
  })),
  execute: safeJson(async ({ query, agent_id }) => {
    const params = new URLSearchParams();
    if (agent_id) params.set("agent_id", agent_id);
    const res = await fetch(`${getSelfBaseUrl()}/api/workflows?${params.toString()}`, {
      method: "POST",
      headers: getSelfFetchHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ query, agent_id: agent_id || "general" }),
    });
    return await safeParseRes(res);
  }),
});

export const workflowExecuteTool = tool({
  description: "Execute a planned workflow — runs all pending steps sequentially. Each step uses its assigned skill to produce output. Optionally validates each step's quality automatically.",
  inputSchema: zodSchema(z.object({
    workflow_id: z.string().describe("The UUID of the workflow to execute"),
    agent_id: z.string().optional().describe("Agent ID executing the workflow (default: 'general')"),
    auto_validate: z.boolean().optional().describe("Whether to auto-validate each step (default: true)"),
  })),
  execute: safeJson(async ({ workflow_id, agent_id, auto_validate }) => {
    const res = await fetch(`${getSelfBaseUrl()}/api/workflows/${workflow_id}/execute`, {
      method: "POST",
      headers: getSelfFetchHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ agent_id: agent_id || "general", auto_validate: auto_validate !== false }),
    });
    return await safeParseRes(res);
  }),
});

export const workflowStatusTool = tool({
  description: "Get workflow status and details including all steps, their statuses, outputs, and validation scores.",
  inputSchema: zodSchema(z.object({
    workflow_id: z.string().describe("The UUID of the workflow"),
  })),
  execute: safeJson(async ({ workflow_id }) => {
    const res = await fetch(`${getSelfBaseUrl()}/api/workflows/${workflow_id}`, {
      headers: getSelfFetchHeaders(),
    });
    return await safeParseRes(res);
  }),
});

export const workflowListTool = tool({
  description: "List all workflows with optional filters. Shows workflow names, statuses, progress, and quality scores.",
  inputSchema: zodSchema(z.object({
    agent_id: z.string().optional().describe("Filter by agent ID"),
    status: z.string().optional().describe("Filter by status (planning, running, completed, failed, paused, cancelled)"),
    limit: z.number().optional().describe("Max workflows to return (default: 20)"),
  })),
  execute: safeJson(async ({ agent_id, status, limit }) => {
    const params = new URLSearchParams();
    if (agent_id) params.set("agent_id", agent_id);
    if (status) params.set("status", status);
    if (limit) params.set("limit", String(limit));
    const url = `${getSelfBaseUrl()}/api/workflows${params.toString() ? `?${params.toString()}` : ""}`;
    const res = await fetch(url, { headers: getSelfFetchHeaders() });
    return await safeParseRes(res);
  }),
});

export const workflowStepExecuteTool = tool({
  description: "Execute a single workflow step manually. Useful for step-by-step control or re-running a failed step.",
  inputSchema: zodSchema(z.object({
    workflow_id: z.string().describe("The UUID of the workflow"),
    step_number: z.number().describe("The step number to execute (1-based)"),
    agent_id: z.string().optional().describe("Agent ID (default: 'general')"),
  })),
  execute: safeJson(async ({ workflow_id, step_number, agent_id }) => {
    const res = await fetch(`${getSelfBaseUrl()}/api/workflows/${workflow_id}/steps/${step_number}`, {
      method: "POST",
      headers: getSelfFetchHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ agent_id: agent_id || "general" }),
    });
    return await safeParseRes(res);
  }),
});

export const workflowCancelTool = tool({
  description: "Cancel a running or paused workflow. This will skip all remaining pending steps and remove its pg_cron job if it was scheduled.",
  inputSchema: zodSchema(z.object({
    workflow_id: z.string().describe("The UUID of the workflow to cancel"),
  })),
  execute: safeJson(async ({ workflow_id }) => {
    const res = await fetch(`${getSelfBaseUrl()}/api/workflows/${workflow_id}`, {
      method: "PATCH",
      headers: getSelfFetchHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ status: "cancelled" }),
    });
    // Clean up pg_cron job if it exists
    try {
      const { unregisterCron } = await import("@/lib/workflows/pg-cron-manager");
      const jobName = `workflow-${workflow_id.replace(/[^a-zA-Z0-9-]/g, "")}`;
      await unregisterCron(jobName);
    } catch { /* ignore */ }
    return await safeParseRes(res);
  }),
});

// ---------------------------------------------------------------------------
// Workflow Schedule Tool — Create recurring workflows with pg_cron
// ---------------------------------------------------------------------------

export const workflowScheduleTool = tool({
  description: "Plan, create, and optionally SCHEDULE a recurring workflow. Decomposes a complex task into multi-step workflow, then registers a pg_cron job to auto-execute it on a schedule. Use this for recurring complex tasks like weekly analysis reports, daily monitoring workflows, or periodic research digests.",
  inputSchema: zodSchema(z.object({
    query: z.string().describe("The complex task to decompose into a multi-step workflow"),
    agent_id: z.string().optional().describe("Agent ID (default: 'general')"),
    schedule_interval_minutes: z.number().optional().describe("Make this a RECURRING workflow. How often to re-execute in minutes (e.g., 60, 120, 1440 for daily). Registers a dedicated pg_cron job."),
  })),
  execute: safeJson(async ({ query, agent_id, schedule_interval_minutes }) => {
    try {
      // 1. Plan and create the workflow
      const { planWorkflow } = await import("@/lib/workflows/workflow-engine");
      const planResult = await planWorkflow(query, agent_id || "general");

      let cronResult = null;
      const workflowId = planResult.workflowId;

      // 2. If schedule is requested, register pg_cron job
      if (schedule_interval_minutes && schedule_interval_minutes > 0 && workflowId) {
        // Store schedule_interval in the workflow
        const { query: dbQuery } = await import("@/lib/core/db");
        await dbQuery("UPDATE agent_workflows SET schedule_interval = $1 WHERE id = $2", [schedule_interval_minutes, workflowId]);
        // Register the pg_cron job
        const { registerWorkflowCron } = await import("@/lib/workflows/pg-cron-manager");
        cronResult = await registerWorkflowCron(workflowId, schedule_interval_minutes);
      }

      return {
        success: true,
        workflow_id: planResult.workflowId,
        plan: planResult.plan,
        cron: cronResult,
        message: schedule_interval_minutes
          ? `Workflow created and scheduled via pg_cron (${cronResult?.schedule || "failed"}).${cronResult?.success ? "" : ` Cron warning: ${cronResult?.error}`}`
          : "Workflow planned and created. Use workflow_execute to run it.",
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to create workflow" };
    }
  }),
});

export const workflowUpdateScheduleTool = tool({
  description: "Update or remove the schedule of an existing workflow. Change schedule_interval_minutes to update the pg_cron job, or set to 0/null to remove it. The workflow itself is not affected.",
  inputSchema: zodSchema(z.object({
    workflow_id: z.string().describe("The UUID of the workflow"),
    schedule_interval_minutes: z.number().nullable().describe("New schedule in minutes (e.g., 60, 1440). Set to 0 or null to remove the pg_cron job."),
  })),
  execute: safeJson(async ({ workflow_id, schedule_interval_minutes }) => {
    try {
      const { query } = await import("@/lib/core/db");
      const { registerWorkflowCron, unregisterCron } = await import("@/lib/workflows/pg-cron-manager");
      const jobName = `workflow-${workflow_id.replace(/[^a-zA-Z0-9-]/g, "")}`;
      const interval = schedule_interval_minutes === null ? 0 : schedule_interval_minutes;

      // Update DB
      await query("UPDATE agent_workflows SET schedule_interval = $1 WHERE id = $2", [
        interval === 0 ? null : interval, workflow_id,
      ]);

      let cronResult;
      if (interval > 0) {
        cronResult = await registerWorkflowCron(workflow_id, interval);
      } else {
        await unregisterCron(jobName);
        cronResult = { success: true, jobName, message: "pg_cron job removed" };
      }

      return {
        success: true,
        workflow_id,
        cron: cronResult,
        message: interval > 0
          ? `Workflow schedule updated: every ${interval} minutes (${cronResult.schedule})`
          : "Workflow schedule removed. Workflow is now one-time only.",
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to update workflow schedule" };
    }
  }),
});

// ---------------------------------------------------------------------------

