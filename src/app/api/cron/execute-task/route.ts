// ---------------------------------------------------------------------------
// pg_cron — Execute Task Board Task
// Called by pg_cron with a specific task ID.
// Each scheduled task board task gets its own pg_cron job that hits this endpoint.
//
// URL format: /api/cron/execute-task?secret=...&taskId=123
//
// Uses pg_advisory_lock to prevent duplicate concurrent executions of the
// same task. The lock auto-releases when the connection returns to the pool.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getAgent, getProvider } from "@/lib/agents";
import { allTools, withAgentContext } from "@/lib/tools";
import { logActivity, persistAgentStatus } from "@/lib/activity";
import { query } from "@/lib/db";
import { sendProactiveNotification } from "@/lib/proactive-notifications";

export const maxDuration = 300;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  const taskId = searchParams.get("taskId");

  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!taskId || isNaN(Number(taskId))) {
    return NextResponse.json({ error: "Missing or invalid taskId" }, { status: 400 });
  }

  if (!process.env.SUPABASE_DB_URL) {
    return NextResponse.json({ error: "No database" }, { status: 500 });
  }

  const startTime = Date.now();

  try {
    // Acquire advisory lock to prevent duplicate execution.
    // Uses hashtext('task-{id}') as the lock key (int32).
    // The lock auto-releases when the pg connection returns to the pool.
    const lockResult = await query(
      `SELECT pg_advisory_lock(hashtext($1::text)) AS locked`,
      [`task-${taskId}`],
    );
    const acquired = lockResult.rows[0]?.locked;
    if (!acquired) {
      return NextResponse.json({ status: "skipped", reason: "lock_not_acquired" });
    }

    try {
      // Fetch the task
      const { rows } = await query(
        `SELECT * FROM task_board WHERE id = $1 AND status NOT IN ('done')`,
        [Number(taskId)],
      );

      if (rows.length === 0) {
        // Task not found or already done — clean up the pg_cron job
        try {
          await query(`SELECT cron.unschedule('taskboard-${taskId}')`).catch(() => {});
        } catch { /* ignore */ }
        return NextResponse.json({ status: "skipped", reason: "task_not_found_or_done" });
      }

      const task = rows[0];
      const agentId = task.assigned_agent || task.created_by;
      const taskTitle = task.title;
      const taskDesc = task.description || "";
      const taskContext = task.context || "";
      const taskPrompt = taskDesc ? `${taskTitle}\n\n${taskDesc}` : taskTitle;

      const agent = getAgent(agentId);
      if (!agent) {
        return NextResponse.json({ status: "error", reason: `unknown_agent_${agentId}` });
      }

      // Update agent status
      persistAgentStatus(agentId, {
        status: "busy",
        currentTask: `[Task] ${taskTitle}`,
        lastActivity: new Date().toISOString(),
      }).catch(() => {});

      logActivity({
        agentId,
        agentName: agent.name,
        action: "task_execution_started",
        detail: `Executing scheduled task: ${taskTitle}`,
      }).catch(() => {});

      // Build tool subset
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const agentTools: Record<string, any> = {};
      for (const toolId of agent.tools) {
        if (allTools[toolId]) agentTools[toolId] = allTools[toolId];
      }

      const systemPrompt = `You are ${agent.name}, ${agent.role}. You are executing a SCHEDULED TASK from the Task Board. Execute the task fully and provide a concise result. Be brief.\n\n${agent.systemPrompt}`;

      const { generateText, stepCountIs } = await import("ai");

      const result = await withAgentContext(agentId, async () => {
        return await generateText({
          model: (await getProvider(agent)).model,
          system: systemPrompt,
          messages: [
            { role: "user", content: `${taskPrompt}\n\n${taskContext ? `Context: ${taskContext}` : ""}` },
          ],
          tools: agentTools,
          maxOutputTokens: 4096,
          stopWhen: stepCountIs(12),
          abortSignal: AbortSignal.timeout(120_000),
        });
      });

      // For recurring tasks, keep status as in_progress (not done) so they get picked up again
      // If schedule_interval is set, this is a recurring task — don't mark as done
      const isRecurring = task.schedule_interval && Number(task.schedule_interval) > 0;

      if (result.text) {
        if (!isRecurring) {
          await query("UPDATE task_board SET status = 'done', updated_at = NOW(), completed_at = NOW() WHERE id = $1", [taskId]);
          // Non-recurring task done — clean up cron job
          await query(`SELECT cron.unschedule('taskboard-${taskId}')`).catch(() => {});
        }

        persistAgentStatus(agentId, { status: "idle", currentTask: null, lastActivity: new Date().toISOString(), tasksCompleted: 1 }).catch(() => {});

        sendProactiveNotification({
          agentId,
          agentName: agent.name,
          type: "routine_result",
          title: `Task: ${taskTitle}`,
          body: result.text.slice(0, 300),
          priority: "low",
        }).catch(() => {});

        return NextResponse.json({
          status: "success",
          taskId: Number(taskId),
          taskTitle,
          agentId,
          recurring: isRecurring,
          durationMs: Date.now() - startTime,
        });
      } else {
        persistAgentStatus(agentId, { status: "error", currentTask: null, lastActivity: new Date().toISOString() }).catch(() => {});

        return NextResponse.json({
          status: "no_output",
          taskId: Number(taskId),
          durationMs: Date.now() - startTime,
        });
      }
    } finally {
      // Release the advisory lock explicitly (good practice, even though
      // it would auto-release when the connection returns to the pool)
      await query(`SELECT pg_advisory_unlock(hashtext($1::text))`, [`task-${taskId}`]).catch(() => {});
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    logActivity({
      agentId: "system",
      action: "task_execution_error",
      detail: `Task ${taskId} failed: ${errMsg}`,
    }).catch(() => {});

    return NextResponse.json({ status: "error", error: errMsg, durationMs: Date.now() - startTime });
  }
}
