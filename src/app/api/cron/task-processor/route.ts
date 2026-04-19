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

export const maxDuration = 120; // 2 min max for cron handler

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

  // Phase 2: Process pending tasks (limit 3 per run)
  const MAX_TASKS_PER_RUN = 3;

  for (let i = 0; i < MAX_TASKS_PER_RUN; i++) {
    try {
      // Get the next pending task
      const task = await getAnyPendingTask();
      if (!task) break;

      results.tasksProcessed++;

      // Mark as running
      await startTask(task.id);

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
}): Promise<{ success: boolean; text: string; error?: string; toolCalls?: unknown[] }> {
  try {
    const agent = getAgent(task.agent_id);
    if (!agent) {
      return { success: false, text: "", error: `Unknown agent: ${task.agent_id}` };
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
      maxOutputTokens: 8192,
      stopWhen: stepCountIs(15),
      abortSignal: AbortSignal.timeout(110_000), // 110s timeout (within 120s maxDuration)
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
    };
  } catch (error) {
    return {
      success: false,
      text: "",
      error: error instanceof Error ? error.message : "Unknown execution error",
    };
  }
}
