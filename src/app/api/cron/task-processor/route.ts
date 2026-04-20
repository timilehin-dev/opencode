// ---------------------------------------------------------------------------
// Vercel Cron — Process Agent Tasks
// Called every minute by Vercel Cron Jobs.
// Polls agent_tasks WHERE status = 'pending' (limit 3 per run),
// executes each task via generateText() with the assigned agent,
// and updates task status accordingly.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { generateText, stepCountIs } from "ai";
import { getAgent, getProvider } from "@/lib/agents";
import { allTools } from "@/lib/tools";
import {
  getAnyPendingTask,
  startTask,
  completeTask,
  failTask,
} from "@/lib/task-queue";
import { logActivity, persistAgentStatus } from "@/lib/activity";
import { evaluateAutomations } from "@/lib/automation-engine";
import { sendProactiveNotification } from "@/lib/proactive-notifications";

export const maxDuration = 60; // Vercel Hobby plan max

export async function GET(request: Request) {
  // Simple auth: query param secret must match CRON_SECRET env var
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  const expectedSecret = process.env.CRON_SECRET || "claw-cron-2025";

  if (secret !== expectedSecret) {
    return NextResponse.json(
      { error: "Unauthorized — missing or invalid secret" },
      { status: 401 },
    );
  }

  const results = {
    tasksProcessed: 0,
    tasksSucceeded: 0,
    tasksFailed: 0,
    automationsTriggered: 0,
    errors: [] as string[],
  };

  // Phase 1: Evaluate automations first (may create new tasks)
  try {
    const autoResult = await evaluateAutomations();
    results.automationsTriggered = autoResult.triggered;
    results.errors.push(...autoResult.errors);
  } catch (error) {
    results.errors.push(`Automation evaluation failed: ${error instanceof Error ? error.message : "Unknown"}`);
  }

  // Phase 2: Process pending tasks (limit 1 per run to stay within 60s Hobby limit)
  const MAX_TASKS_PER_RUN = 1;

  for (let i = 0; i < MAX_TASKS_PER_RUN; i++) {
    try {
      // Get the next pending task
      const task = await getAnyPendingTask();
      if (!task) break;

      results.tasksProcessed++;

      // Mark as running
      await startTask(task.id);

      // Extract automation_id from trigger_source for logging
      const autoMatch = (task.trigger_source || "").match(/automation:(\d+)/);
      const automationId = autoMatch ? parseInt(autoMatch[1], 10) : null;

      // Log to automation_logs if this came from an automation
      if (automationId) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { Pool } = require("pg");
          const logPool = new Pool({ connectionString: process.env.SUPABASE_DB_URL });
          await logPool.query(
            `INSERT INTO automation_logs (automation_id, status, result, duration_ms)
             VALUES ($1, 'running', $2, 0)`,
            [
              automationId,
              JSON.stringify({
                type: "background_execution",
                task_id: task.id,
                agent_id: task.agent_id,
                task: task.task.slice(0, 200),
                trigger: task.trigger_type,
              }),
            ],
          );
          await logPool.end();
        } catch { /* non-critical */ }
      }

      // Log activity
      logActivity({
        agentId: task.agent_id,
        action: "task_started",
        detail: `Background task started: ${task.task.slice(0, 80)}`,
        metadata: { taskId: task.id, trigger_type: task.trigger_type },
      }).catch(() => {});

      // Update agent status to busy
      const agent = getAgent(task.agent_id);
      if (agent) {
        const agentName = agent.name;
        logActivity({
          agentId: task.agent_id,
          agentName,
          action: "status_change",
          detail: `processing background task: ${task.task.slice(0, 80)}`,
        }).catch(() => {});
        persistAgentStatus(task.agent_id, {
          status: "busy",
          currentTask: task.task.slice(0, 100),
          lastActivity: new Date().toISOString(),
        }).catch(() => {});
      }

      // Execute the task via generateText
      const taskResult = await executeTask(task);

      if (taskResult.success) {
        await completeTask(task.id, taskResult.text, taskResult.toolCalls);
        results.tasksSucceeded++;

        // Write success to automation_logs
        if (automationId) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { Pool } = require("pg");
            const logPool = new Pool({ connectionString: process.env.SUPABASE_DB_URL });
            await logPool.query(
              `INSERT INTO automation_logs (automation_id, status, result, duration_ms)
               VALUES ($1, 'success', $2, $3)`,
              [
                automationId,
                JSON.stringify({
                  type: "background_execution",
                  task_id: task.id,
                  agent_id: task.agent_id,
                  status: "completed",
                  output: (taskResult.text || "").slice(0, 2000),
                  tool_calls: (taskResult.toolCalls || []).map((tc: unknown) => (tc as { name: string }).name),
                }),
                taskResult.durationMs || 0,
              ],
            );
            await logPool.end();
          } catch { /* non-critical */ }
        }

        logActivity({
          agentId: task.agent_id,
          action: "task_completed",
          detail: `Background task completed: ${task.task.slice(0, 60)}`,
          metadata: { taskId: task.id, resultLength: taskResult.text.length },
        }).catch(() => {});

        if (agent) {
          persistAgentStatus(task.agent_id, {
            status: "idle",
            currentTask: null,
            lastActivity: new Date().toISOString(),
            tasksCompleted: 1,
          }).catch(() => {});

          // Send proactive notification for completed task
          sendProactiveNotification({
            agentId: task.agent_id,
            agentName: agent.name,
            type: "task_update",
            title: `Task Complete: ${task.task.slice(0, 80)}`,
            body: taskResult.text.slice(0, 500),
            priority: "normal",
            metadata: { taskId: task.id, triggerType: task.trigger_type },
          }).catch(() => {});
        }
      } else {
        await failTask(task.id, taskResult.error || "Unknown error");
        results.tasksFailed++;

        // Write error to automation_logs
        if (automationId) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { Pool } = require("pg");
            const logPool = new Pool({ connectionString: process.env.SUPABASE_DB_URL });
            await logPool.query(
              `INSERT INTO automation_logs (automation_id, status, result, duration_ms, error_message)
               VALUES ($1, 'error', $2, $3, $4)`,
              [
                automationId,
                JSON.stringify({
                  type: "background_execution",
                  task_id: task.id,
                  agent_id: task.agent_id,
                  status: "failed",
                  error: (taskResult.error || "Unknown").slice(0, 1000),
                }),
                taskResult.durationMs || 0,
                (taskResult.error || "Unknown error").slice(0, 500),
              ],
            );
            await logPool.end();
          } catch { /* non-critical */ }
        }

        logActivity({
          agentId: task.agent_id,
          action: "task_failed",
          detail: `Background task failed: ${taskResult.error?.slice(0, 80)}`,
          metadata: { taskId: task.id },
        }).catch(() => {});

        if (agent) {
          persistAgentStatus(task.agent_id, {
            status: "error",
            currentTask: null,
            lastActivity: new Date().toISOString(),
          }).catch(() => {});

          // Send proactive notification for failed task
          sendProactiveNotification({
            agentId: task.agent_id,
            agentName: agent.name,
            type: "alert",
            title: `Task Failed: ${task.task.slice(0, 80)}`,
            body: taskResult.error || "Unknown error occurred during task execution.",
            priority: "high",
            metadata: { taskId: task.id, triggerType: task.trigger_type },
          }).catch(() => {});
        }
      }
    } catch (error) {
      results.errors.push(`Task processing error: ${error instanceof Error ? error.message : "Unknown"}`);
      console.error("[CRON:task-processor] Error:", error);
    }
  }

  return NextResponse.json(results);
}

// ---------------------------------------------------------------------------
// executeTask — Run a background task using the assigned agent
// ---------------------------------------------------------------------------

async function executeTask(task: {
  id: number;
  agent_id: string;
  task: string;
  context: string;
}): Promise<{ success: boolean; text: string; error?: string; toolCalls?: unknown[]; durationMs?: number }> {
  const startTime = Date.now();
  try {
    const agent = getAgent(task.agent_id);
    if (!agent) {
      return { success: false, text: "", error: `Unknown agent: ${task.agent_id}`, durationMs: Date.now() - startTime };
    }

    const providerResult = await getProvider(agent);

    // Build tool subset for this agent
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agentTools: Record<string, any> = {};
    for (const toolId of agent.tools) {
      if (allTools[toolId]) agentTools[toolId] = allTools[toolId];
    }

    // Build system prompt for background task execution
    const systemPrompt = `You are ${agent.name}, ${agent.role}. Execute this background task autonomously. You are running as a background process — complete the task fully and provide a concise summary of what you did and the results.\n\n${agent.systemPrompt}`;

    const result = await generateText({
      model: providerResult.model,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `${task.task}\n\n${task.context ? `Context: ${task.context}` : ""}`,
        },
      ],
      tools: agentTools,
      maxOutputTokens: 4096,
      stopWhen: stepCountIs(10),
      abortSignal: AbortSignal.timeout(50_000), // 50s within 60s maxDuration
    });

    // Collect tool calls from steps
    const toolCalls = result.steps
      .flatMap((step) => step.toolCalls || [])
      .map((tc) => ({
        name: tc.toolName,
        args: (tc as unknown as { args: Record<string, unknown> }).args,
      }));

    return {
      success: true,
      text: result.text || "(Task completed with no text output)",
      toolCalls,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : "Unknown execution error";
    // If it's a timeout/abort error, add helpful context
    const enrichedError = errorMsg.includes("abort") || errorMsg.includes("timeout")
      ? `${errorMsg} — The task took too long for a single Vercel function execution (Hobby plan limit). Consider simplifying the task or upgrading to Vercel Pro for longer execution times.`
      : errorMsg;
    return {
      success: false,
      text: "",
      error: enrichedError,
      durationMs,
    };
  }
}
