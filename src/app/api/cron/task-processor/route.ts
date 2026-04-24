// ---------------------------------------------------------------------------
// Vercel Cron — Task Processor (FULL EXECUTOR)
//
// Runs every 5 minutes via Vercel Cron. Handles:
//   Phase 1: Evaluate automations
//   Phase 2: Execute pending agent_tasks
//   Phase 3: Execute task board tasks (assigned & in_progress)
//   Phase 4: Execute project tasks (dependency-resolved)
//
// This is the PRIMARY executor. GitHub Actions (execute-tasks.mjs) serves
// as a secondary/fallback executor with more compute time.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { evaluateAutomations } from "@/lib/automation-engine";
import { getAgent, getProvider, getAllAgents } from "@/lib/agents";
import { allTools, withAgentContext } from "@/lib/tools";
import { logActivity, persistAgentStatus } from "@/lib/activity";
import { sendProactiveNotification } from "@/lib/proactive-notifications";
import { query } from "@/lib/db";

// Vercel Hobby (free) has a 10s timeout — maxDuration is best-effort.
// pg_cron fires every 5 min, so even with timeouts, tasks progress over time.
// If you upgrade to Vercel Pro, change this to 300 for 5-min execution windows.
export const maxDuration = 300;

// ---------------------------------------------------------------------------
// Helper: execute a task prompt using an agent
// ---------------------------------------------------------------------------

async function executeTaskWithAgent(
  agentId: string,
  taskPrompt: string,
  context: string,
  source: string,
): Promise<{ success: boolean; text?: string; error?: string }> {
  try {
    const agent = getAgent(agentId);
    if (!agent) return { success: false, error: `Unknown agent: ${agentId}` };

    const providerResult = await getProvider(agent);

    // Build tool subset for this agent
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agentTools: Record<string, any> = {};
    for (const toolId of agent.tools) {
      if (allTools[toolId]) agentTools[toolId] = allTools[toolId];
    }

    const systemPrompt = `You are ${agent.name}, ${agent.role}. You are executing a BACKGROUND TASK from the ${source} system. Execute the task fully and provide a concise result. Be brief — this is an automated execution, not a full conversation.\n\n${agent.systemPrompt}`;

    const { generateText, stepCountIs } = await import("ai");

    const result = await withAgentContext(agentId, async () => {
      return await generateText({
        model: providerResult.model,
        system: systemPrompt,
        messages: [
          { role: "user", content: `${taskPrompt}\n\n${context ? `Context: ${context}` : ""}` },
        ],
        tools: agentTools,
        maxOutputTokens: 4096,
        stopWhen: stepCountIs(12),
        abortSignal: AbortSignal.timeout(120_000),
      });
    });

    return { success: true, text: result.text || "(Completed with no output)" };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Execution error" };
  }
}

// ---------------------------------------------------------------------------
// GET: Cron trigger — full task processing pipeline
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const secret = request.headers.get("x-cron-secret") || new URL(request.url).searchParams.get("secret");
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  if (secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.SUPABASE_DB_URL) {
    return NextResponse.json({ error: "No database configured" }, { status: 500 });
  }

  const startTime = Date.now();
  const results = {
    phase1_automations: { triggered: 0, tasksCreated: 0, errors: [] as string[] },
    phase2_agentTasks: { processed: 0, succeeded: 0, failed: 0 },
    phase3_taskBoard: { processed: 0, succeeded: 0, failed: 0 },
    phase4_projectTasks: { processed: 0, succeeded: 0, failed: 0 },
    totalDurationMs: 0,
  };

  // =========================================================================
  // Phase 1: Evaluate Automations
  // =========================================================================
  try {
    const autoResult = await evaluateAutomations();
    results.phase1_automations.triggered = autoResult.triggered;
    results.phase1_automations.tasksCreated = autoResult.tasksCreated;
    results.phase1_automations.errors = autoResult.errors;
  } catch (error) {
    console.warn("[TaskProcessor] Phase 1 automation error:", error);
  }

  // =========================================================================
  // Phase 2: Execute pending agent_tasks
  // =========================================================================
  try {
    const { rows } = await query(`
      SELECT * FROM agent_tasks
      WHERE status = 'pending'
        AND trigger_type IN ('automation', 'cron', 'delegation', 'proactive_assessment', 'a2a_inbox', 'project')
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `);

    for (const row of rows) {
      const agentId = row.agent_id;
      const taskPrompt = row.task;
      const context = row.context || "";

      results.phase2_agentTasks.processed++;

      // Mark as running
      await query("UPDATE agent_tasks SET status = 'running', started_at = NOW() WHERE id = $1", [row.id]);

      logActivity({
        agentId,
        agentName: getAgent(agentId)?.name || agentId,
        action: "task_started",
        detail: `[Agent Task] ${taskPrompt.slice(0, 200)}`,
      }).catch(() => {});

      persistAgentStatus(agentId, {
        status: "busy",
        currentTask: taskPrompt.slice(0, 100),
        lastActivity: new Date().toISOString(),
      }).catch(() => {});

      const result = await executeTaskWithAgent(agentId, taskPrompt, context, "Agent Tasks");

      if (result.success) {
        await query("UPDATE agent_tasks SET status = 'completed', result = $1, completed_at = NOW() WHERE id = $2", [
          result.text?.slice(0, 5000) || "", row.id,
        ]);
        results.phase2_agentTasks.succeeded++;

        logActivity({
          agentId,
          agentName: getAgent(agentId)?.name || agentId,
          action: "task_completed",
          detail: `[Agent Task] ${taskPrompt.slice(0, 200)}`,
        }).catch(() => {});

        persistAgentStatus(agentId, {
          status: "idle",
          currentTask: null,
          lastActivity: new Date().toISOString(),
          tasksCompleted: 1,
        }).catch(() => {});
      } else {
        await query("UPDATE agent_tasks SET status = 'failed', error = $1, completed_at = NOW() WHERE id = $2", [
          result.error?.slice(0, 2000) || "Unknown error", row.id,
        ]);
        results.phase2_agentTasks.failed++;

        logActivity({
          agentId,
          agentName: getAgent(agentId)?.name || agentId,
          action: "task_failed",
          detail: `[Agent Task] ${taskPrompt.slice(0, 200)} — ${result.error || "Unknown error"}`,
        }).catch(() => {});

        persistAgentStatus(agentId, {
          status: "error",
          currentTask: null,
          lastActivity: new Date().toISOString(),
        }).catch(() => {});
      }
    }
  } catch (error) {
    console.warn("[TaskProcessor] Phase 2 error:", error);
  }

  // =========================================================================
  // Phase 3: Execute task board tasks
  // =========================================================================
  try {
    // Pick up tasks that are assigned and in backlog or in_progress
    // Limit to 2 per run to stay within timeout
    const { rows } = await query(`
      SELECT * FROM task_board
      WHERE status IN ('backlog', 'in_progress')
        AND assigned_agent IS NOT NULL
        AND assigned_agent != ''
      ORDER BY
        CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 END,
        created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `);

    for (const row of rows) {
      const agentId = row.assigned_agent;
      const taskTitle = row.title;
      const taskDesc = row.description || "";
      const taskContext = row.context || "";

      // Build a clear task prompt from the board task
      const taskPrompt = taskDesc
        ? `${taskTitle}\n\n${taskDesc}`
        : taskTitle;

      results.phase3_taskBoard.processed++;

      // Move to in_progress
      await query("UPDATE task_board SET status = 'in_progress', updated_at = NOW() WHERE id = $1", [row.id]);

      const result = await executeTaskWithAgent(agentId, taskPrompt, taskContext, "Task Board");

      if (result.success) {
        await query("UPDATE task_board SET status = 'done', updated_at = NOW(), completed_at = NOW() WHERE id = $1", [row.id]);
        results.phase3_taskBoard.succeeded++;

        sendProactiveNotification({
          agentId,
          agentName: getAgent(agentId)?.name || agentId,
          type: "routine_result",
          title: `Task Board: ${taskTitle}`,
          body: result.text?.slice(0, 300) || "Completed successfully",
          priority: "low",
        }).catch(() => {});
      } else {
        // Move to waiting (blocked) so it can be retried
        await query("UPDATE task_board SET status = 'waiting', updated_at = NOW() WHERE id = $1", [row.id]);
        results.phase3_taskBoard.failed++;

        sendProactiveNotification({
          agentId,
          agentName: getAgent(agentId)?.name || agentId,
          type: "alert",
          title: `Task Board Failed: ${taskTitle}`,
          body: result.error || "Unknown error",
          priority: "high",
        }).catch(() => {});
      }
    }
  } catch (error) {
    console.warn("[TaskProcessor] Phase 3 error:", error);
  }

  // =========================================================================
  // Phase 4: Execute project tasks (dependency-resolved)
  // =========================================================================
  try {
    // Get project tasks whose dependencies are all satisfied
    const { rows } = await query(`
      SELECT pt.*, p.name as project_name, p.agent_id as project_owner
      FROM project_tasks pt
      JOIN projects p ON p.id = pt.project_id
      WHERE pt.status IN ('pending', 'queued')
        AND p.status NOT IN ('completed', 'failed', 'cancelled')
        AND (
          SELECT COUNT(*) FROM project_tasks dep
          WHERE dep.project_id = pt.project_id
            AND dep.title = ANY(pt.depends_on)
            AND dep.status NOT IN ('completed', 'skipped')
        ) = 0
      ORDER BY
        CASE pt.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 END,
        pt.created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `);

    for (const row of rows) {
      const agentId = row.assigned_agent || row.project_owner || "general";
      const taskPrompt = row.task_prompt || row.title;
      const taskContext = `Project: ${row.project_name}. Task: ${row.title}. ${row.context || ""}`;

      results.phase4_projectTasks.processed++;

      // Mark as in_progress
      await query("UPDATE project_tasks SET status = 'in_progress', started_at = NOW() WHERE id = $1", [row.id]);

      // Update project status to in_progress
      await query("UPDATE projects SET status = 'in_progress' WHERE id = $1 AND status = 'planning'", [row.project_id]);

      persistAgentStatus(agentId, {
        status: "busy",
        currentTask: `[Project] ${row.title}`,
        lastActivity: new Date().toISOString(),
      }).catch(() => {});

      const result = await executeTaskWithAgent(agentId, taskPrompt, taskContext, "Project Tasks");

      if (result.success) {
        await query("UPDATE project_tasks SET status = 'completed', result = $1, completed_at = NOW() WHERE id = $2", [
          result.text?.slice(0, 5000) || "", row.id,
        ]);
        results.phase4_projectTasks.succeeded++;

        persistAgentStatus(agentId, {
          status: "idle",
          currentTask: null,
          lastActivity: new Date().toISOString(),
          tasksCompleted: 1,
        }).catch(() => {});

        // Check if all project tasks are done
        const { rows: remaining } = await query(
          `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status NOT IN ('completed', 'skipped')) as remaining FROM project_tasks WHERE project_id = $1`,
          [row.project_id],
        );
        if (remaining[0]?.remaining === "0") {
          await query("UPDATE projects SET status = 'completed' WHERE id = $1", [row.project_id]);
        }
      } else {
        const newRetries = (row.retries || 0) + 1;
        const maxRetries = row.max_retries || 2;

        if (newRetries < maxRetries) {
          await query("UPDATE project_tasks SET status = 'queued', error = $1, retries = $2 WHERE id = $3", [
            result.error?.slice(0, 2000), newRetries, row.id,
          ]);
        } else {
          await query("UPDATE project_tasks SET status = 'failed', error = $1, completed_at = NOW() WHERE id = $2", [
            result.error?.slice(0, 2000), row.id,
          ]);
        }
        results.phase4_projectTasks.failed++;

        persistAgentStatus(agentId, {
          status: "error",
          currentTask: null,
          lastActivity: new Date().toISOString(),
        }).catch(() => {});
      }
    }
  } catch (error) {
    console.warn("[TaskProcessor] Phase 4 error:", error);
  }

  results.totalDurationMs = Date.now() - startTime;
  return NextResponse.json(results);
}
