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
import { evaluateAutomations } from "@/lib/workflows/automation-engine";
import { getAgent, getProvider, getAllAgents } from "@/lib/agent/agents";
import { allTools, withAgentContext } from "@/lib/tools/index";
import { logActivity, persistAgentStatus } from "@/lib/tasks/activity";
import { sendProactiveNotification } from "@/lib/notifications/proactive-notifications";
import { triggerPostTaskReflection, runPeriodicImprovementAnalysis } from "@/lib/tasks/post-task-reflection";
import { query, withTransaction } from "@/lib/core/db";

// ---------------------------------------------------------------------------
// Helper: parse interval string (e.g. "30m", "1h", "2h", "24h") to Date
// ---------------------------------------------------------------------------

function parseInterval(interval: string): Date {
  const match = interval.match(/^(\d+)(m|h|d)$/);
  if (!match) return new Date(Date.now() + 60 * 60 * 1000); // default 1 hour
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const ms = unit === "m" ? value * 60 * 1000
    : unit === "h" ? value * 60 * 60 * 1000
    : value * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ms);
}

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
  maxOutputTokens: number = 16384,
  maxSteps: number = 20,
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

    // Skill routing: try to find a matching skill within 2 seconds
    // Injects skill documentation into system prompt for better task execution
    let skillContext = "";
    try {
      const { routeSkill } = await import("@/lib/skills/skill-router");
      const routingResult = await Promise.race([
        routeSkill(taskPrompt, agentId),
        new Promise<null>(resolve => setTimeout(() => resolve(null), 2000)),
      ]);
      if (routingResult && routingResult.skill && routingResult.confidence > 0.4) {
        skillContext = `\n\n[SKILL ROUTING] A relevant skill was found for this task:\n- Skill: ${routingResult.skill.display_name} (${routingResult.skill.category})\n- Confidence: ${Math.round(routingResult.confidence * 100)}%\n- Method: ${routingResult.method}\n${routingResult.skill.description ? `- Description: ${routingResult.skill.description.slice(0, 300)}` : ""}\nUse this skill's knowledge to inform your approach if applicable.`;
      }
    } catch {
      // Skill routing failed — continue without it (graceful degradation)
    }

    const systemPrompt = `You are ${agent.name}, ${agent.role}. You are executing a BACKGROUND TASK from the ${source} system. Execute the task fully and provide a concise result. Be brief — this is an automated execution, not a full conversation.${skillContext}\n\n${agent.systemPrompt}`;

    const { generateText, stepCountIs } = await import("ai");

    const result = await withAgentContext(agentId, async () => {
      return await generateText({
        model: providerResult.model,
        system: systemPrompt,
        messages: [
          { role: "user", content: `${taskPrompt}\n\n${context ? `Context: ${context}` : ""}` },
        ],
        tools: agentTools,
        maxOutputTokens,
        stopWhen: stepCountIs(maxSteps),
        abortSignal: AbortSignal.timeout(120_000),
        // Mid-task completion guard — same as main chat, prevents agents from
        // stopping after tool results without generating a text explanation.
        prepareStep: ({ steps: cronSteps, stepNumber: cronStep }) => {
          if (cronStep <= 0) return undefined;
          const anyText = cronSteps.some(s => (s.text?.length ?? 0) > 0);
          const lastStep = cronSteps[cronSteps.length - 1];
          const lastHadToolResults = (lastStep?.toolResults?.length ?? 0) > 0;
          const anyToolResults = cronSteps.some(s => (s.toolResults?.length ?? 0) > 0);
          const stepsToLimit = maxSteps - cronStep;

          if (stepsToLimit <= 2 && !anyText && anyToolResults) {
            return {
              toolChoice: "none" as const,
              system: systemPrompt + "\n\n[URGENT: Step limit approaching. Stop calling tools and write a text summary of ALL tool results NOW.]",
            };
          }
          if (lastHadToolResults && !anyText) {
            return {
              toolChoice: "none" as const,
              system: systemPrompt + "\n\n[CRITICAL: You received tool results but have NOT explained them. Write a text response explaining what the tools found. Do NOT call more tools.]",
            };
          }
          return undefined;
        },
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
  // Phase 0: Auto-register pg_cron job (self-healing)
  // Ensures the task-processor is called every minute by pg_cron even if
  // the Vercel cron config is empty (Hobby tier) or pg_cron setup was missed.
  // =========================================================================
  try {
    const appUrl = process.env.CRON_WEBHOOK_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.NEXT_PUBLIC_BASE_URL);
    if (appUrl && process.env.CRON_SECRET) {
      await query(`CREATE EXTENSION IF NOT EXISTS pg_cron`).catch(() => {});
      await query(`CREATE EXTENSION IF NOT EXISTS pg_net`).catch(() => {});
      const taskProcessorUrl = `${appUrl}/api/cron/task-processor?secret=${encodeURIComponent(process.env.CRON_SECRET)}`;
      // Check if job already exists before registering
      const { rows: existingJobs } = await query(
        `SELECT jobid FROM cron.job WHERE jobname = 'klaw-task-processor'`,
      );
      if (existingJobs.length === 0) {
        await query(
          `SELECT cron.schedule('klaw-task-processor', '* * * * *', $$SELECT net.http_get('${taskProcessorUrl}')$$)`,
        ).catch(() => {});
        console.log("[TaskProcessor] Auto-registered pg_cron job: klaw-task-processor (every minute)");
      }
    }
  } catch {
    // Non-critical — pg_cron auto-setup is best-effort
  }

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
  // FIX: FOR UPDATE SKIP LOCKED must be inside a transaction to actually lock
  // rows. Also fixed priority ordering — was using alphabetical DESC which
  // gave wrong order (low > medium > high > critical). Now uses CASE WHEN.
  // =========================================================================
  try {
    const { rows } = await withTransaction(async (client) => {
      const result = await client.query(`
        SELECT * FROM agent_tasks
        WHERE status = 'pending'
          AND trigger_type IN ('automation', 'cron', 'delegation', 'proactive_assessment', 'a2a_inbox', 'project', 'autonomous', 'manual')
        ORDER BY
          CASE priority
            WHEN 'critical' THEN 0
            WHEN 'high' THEN 1
            WHEN 'medium' THEN 2
            WHEN 'low' THEN 3
            ELSE 2
          END,
          created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `);

      // Lock the row within the transaction by marking it running
      for (const row of result.rows) {
        await client.query(
          "UPDATE agent_tasks SET status = 'running', started_at = NOW() WHERE id = $1",
          [row.id],
        );
      }

      return result;
    });

    for (const row of rows) {
      const agentId = row.agent_id;
      const taskPrompt = row.task;
      const context = row.context || "";

      results.phase2_agentTasks.processed++;

      // Already marked as running inside the transaction above

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

        // Handle recurring tasks — reschedule for next run
        if (row.recurring_enabled && row.recurring_interval) {
          try {
            const nextRun = parseInterval(row.recurring_interval);
            await query(
              `INSERT INTO agent_tasks (agent_id, task, context, trigger_type, trigger_source, priority, recurring_enabled, recurring_interval, next_run_at, parent_task_id)
               VALUES ($1, $2, $3, 'cron', $4, $5, $6, $7, $8, $9)`,
              [row.agent_id, row.task, row.context || "", `recurring:${row.id}:${Date.now()}`, row.priority || "medium",
               true, row.recurring_interval, nextRun, row.id],
            );
            logActivity({
              agentId,
              agentName: getAgent(agentId)?.name || agentId,
              action: "task_rescheduled",
              detail: `[Recurring] Next run at ${nextRun.toISOString()} (${row.recurring_interval})`,
            }).catch(() => {});
          } catch (recurringErr) {
            console.warn("[TaskProcessor] Recurring reschedule failed:", recurringErr);
          }
        }

        // Handle task chaining — create follow-up task for another agent (on success)
        if (row.chain_to_agent && row.chain_task && row.chain_on_success !== false) {
          try {
            await query(
              `INSERT INTO agent_tasks (agent_id, task, context, trigger_type, trigger_source, priority, parent_task_id)
               VALUES ($1, $2, $3, 'delegation', $4, $5, $6)`,
              [row.chain_to_agent, row.chain_task, `Chained from task #${row.id}. Previous result: ${result.text?.slice(0, 1000) || "N/A"}`,
               `chain:${row.id}:${Date.now()}`, row.priority || "medium", row.id],
            );
            logActivity({
              agentId: row.chain_to_agent,
              agentName: getAgent(row.chain_to_agent)?.name || row.chain_to_agent,
              action: "task_chained",
              detail: `[Chain] Received chained task from ${agentId}: ${row.chain_task.slice(0, 100)}`,
            }).catch(() => {});
          } catch (chainErr) {
            console.warn("[TaskProcessor] Task chaining failed:", chainErr);
          }
        }

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

        // Post-task reflection (fire-and-forget)
        triggerPostTaskReflection({
          taskId: row.id,
          agentId,
          taskTitle: taskPrompt.slice(0, 200),
          result: result.text || "",
          success: true,
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

        // Handle task chaining on failure (if chain_on_fail enabled)
        if (row.chain_to_agent && row.chain_task && row.chain_on_success === false) {
          try {
            await query(
              `INSERT INTO agent_tasks (agent_id, task, context, trigger_type, trigger_source, priority, parent_task_id)
               VALUES ($1, $2, $3, 'delegation', $4, $5, $6)`,
              [row.chain_to_agent, row.chain_task, `Chained from FAILED task #${row.id}. Error: ${result.error?.slice(0, 500) || "Unknown"}`,
               `chain-fail:${row.id}:${Date.now()}`, row.priority || "medium", row.id],
            );
          } catch { /* chain on fail non-critical */ }
        }

        persistAgentStatus(agentId, {
          status: "error",
          currentTask: null,
          lastActivity: new Date().toISOString(),
        }).catch(() => {});

        // Post-task reflection on failure (fire-and-forget)
        triggerPostTaskReflection({
          taskId: row.id,
          agentId,
          taskTitle: taskPrompt.slice(0, 200),
          result: result.error || "",
          success: false,
          error: result.error,
        }).catch(() => {});
      }
    }
  } catch (error) {
    console.warn("[TaskProcessor] Phase 2 error:", error);
  }

  // =========================================================================
  // Phase 3: Execute task board tasks
  // FIX: FOR UPDATE SKIP LOCKED wrapped in transaction for proper row locking.
  // =========================================================================
  try {
    // Pick up tasks that are assigned and in backlog or in_progress
    // Limit to 2 per run to stay within timeout
    const { rows } = await withTransaction(async (client) => {
      const result = await client.query(`
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

      // Move to in_progress within the transaction
      for (const row of result.rows) {
        await client.query(
          "UPDATE task_board SET status = 'in_progress', updated_at = NOW() WHERE id = $1",
          [row.id],
        );
      }

      return result;
    });

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

      // Already moved to in_progress inside the transaction above

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
  // FIX: FOR UPDATE SKIP LOCKED wrapped in transaction for proper row locking.
  // =========================================================================
  try {
    // Get project tasks whose dependencies are all satisfied
    const { rows } = await withTransaction(async (client) => {
      const result = await client.query(`
        SELECT pt.*, p.name as project_name, p.agent_id as project_owner
        FROM project_tasks pt
        JOIN projects p ON p.id = pt.project_id
        WHERE pt.status IN ('pending', 'queued')
          AND p.status NOT IN ('completed', 'failed', 'cancelled')
          AND (
            SELECT COUNT(*) FROM project_tasks dep
            WHERE dep.project_id = pt.project_id
              AND dep.id = ANY(pt.depends_on)
              AND dep.status NOT IN ('completed', 'skipped')
          ) = 0
        ORDER BY
          CASE pt.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 END,
          pt.created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `);

      // Mark as in_progress within the transaction
      for (const row of result.rows) {
        await client.query(
          "UPDATE project_tasks SET status = 'in_progress', started_at = NOW() WHERE id = $1",
          [row.id],
        );
        await client.query(
          "UPDATE projects SET status = 'in_progress' WHERE id = $1 AND status = 'planning'",
          [row.project_id],
        );
      }

      return result;
    });

    for (const row of rows) {
      const agentId = row.assigned_agent || row.project_owner || "general";
      const taskPrompt = row.task_prompt || row.title;
      const taskContext = `Project: ${row.project_name}. Task: ${row.title}. ${row.context || ""}`;

      results.phase4_projectTasks.processed++;

      // Already marked as in_progress inside the transaction above

      persistAgentStatus(agentId, {
        status: "busy",
        currentTask: `[Project] ${row.title}`,
        lastActivity: new Date().toISOString(),
      }).catch(() => {});

      const result = await executeTaskWithAgent(agentId, taskPrompt, taskContext, "Project Tasks", 32768, 30);

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

  // =========================================================================
  // Phase 5: Periodic Self-Improvement Analysis (fire-and-forget)
  // =========================================================================
  runPeriodicImprovementAnalysis().catch(() => {});

  results.totalDurationMs = Date.now() - startTime;
  return NextResponse.json(results);
}
