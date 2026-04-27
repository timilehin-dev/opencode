// ---------------------------------------------------------------------------
// Vercel Cron — Agent Routines
// Called by Vercel Cron Jobs on schedule.
// Checks agent_routines table for due routines and executes them.
//
// Example routines:
// - Mail Agent: Check inbox at 8am, summarize urgent emails
// - Ops Agent: Health check every hour
// - Research Agent: Weekly industry digest
//
// Agent routines are created/managed via POST /api/agent-routines
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getAgent, getProvider, getAllAgents } from "@/lib/agents";
import { allTools, withAgentContext } from "@/lib/tools";
import { logActivity, persistAgentStatus } from "@/lib/activity";
import { AGENT_ROUTINES_SCHEMA } from "@/lib/agent-routines";
import { sendProactiveNotification } from "@/lib/proactive-notifications";
import { query } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-errors";

export const maxDuration = 300; // 5 min for routine execution

// ---------------------------------------------------------------------------
// GET: Cron trigger — check and execute due routines
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

  const results = {
    routinesChecked: 0,
    routinesExecuted: 0,
    routinesFailed: 0,
    details: [] as Array<{ agentId: string; routineName: string; status: string; result?: string }>,
  };

  try {
    // Get due routines (active, next_run <= now)
    // NOTE: FOR UPDATE SKIP LOCKED runs outside a transaction, so the row-level
    // lock is released immediately after the query returns. This is fine for
    // our simple queue — each cron invocation picks the next available routine.
    const { rows } = await query(`
      SELECT * FROM agent_routines
      WHERE is_active = true
        AND next_run <= NOW()
      ORDER BY priority DESC, next_run ASC
      LIMIT 3
      FOR UPDATE SKIP LOCKED
    `);

    results.routinesChecked = rows.length;

    for (const row of rows) {
      const routineId = row.id;
      const agentId = row.agent_id;
      const routineName = row.name;
      const task = row.task;
      const context = row.context || "";
      const intervalMinutes = row.interval_minutes;

      try {
        const agent = getAgent(agentId);
        if (!agent) {
          results.routinesFailed++;
          results.details.push({ agentId, routineName, status: "failed", result: `Unknown agent: ${agentId}` });
          continue;
        }

        // Update agent status
        persistAgentStatus(agentId, {
          status: "busy",
          currentTask: `[Routine] ${routineName}`,
          lastActivity: new Date().toISOString(),
        }).catch(() => {});

        logActivity({
          agentId,
          agentName: agent.name,
          action: "routine_started",
          detail: `Executing routine: ${routineName}`,
        }).catch(() => {});

        // Execute the routine
        const routineResult = await executeRoutine(agentId, task, context);

        // Update next_run, last_status
        const nextRun = new Date(Date.now() + intervalMinutes * 60 * 1000);
        const lastStatus = routineResult.success ? 'success' : 'failed';
        await query(
          "UPDATE agent_routines SET last_run = NOW(), last_status = $1, next_run = $2, last_result = $3 WHERE id = $4",
          [lastStatus, nextRun.toISOString(), routineResult.success ? routineResult.text.slice(0, 2000) : routineResult.error, routineId],
        );

        if (routineResult.success) {
          results.routinesExecuted++;
          results.details.push({ agentId, routineName, status: "success", result: routineResult.text.slice(0, 200) });

          logActivity({
            agentId,
            agentName: agent.name,
            action: "routine_completed",
            detail: `Routine completed: ${routineName}`,
          }).catch(() => {});

          persistAgentStatus(agentId, {
            status: "idle",
            currentTask: null,
            lastActivity: new Date().toISOString(),
            tasksCompleted: 1,
          }).catch(() => {});

          // Send proactive notification for successful routine
          sendProactiveNotification({
            agentId,
            agentName: agent.name,
            type: "routine_result",
            title: `Routine Complete: ${routineName}`,
            body: routineResult.text.slice(0, 500),
            priority: "low",
          }).catch(() => {});
        } else {
          results.routinesFailed++;
          results.details.push({ agentId, routineName, status: "failed", result: routineResult.error });

          logActivity({
            agentId,
            agentName: agent.name,
            action: "routine_failed",
            detail: `Routine failed: ${routineName} — ${routineResult.error || "Unknown error"}`,
          }).catch(() => {});

          persistAgentStatus(agentId, {
            status: "error",
            currentTask: null,
            lastActivity: new Date().toISOString(),
          }).catch(() => {});

          // Send proactive notification for failed routine
          sendProactiveNotification({
            agentId,
            agentName: agent.name,
            type: "alert",
            title: `Routine Failed: ${routineName}`,
            body: routineResult.error || "Unknown error occurred during routine execution.",
            priority: "high",
          }).catch(() => {});
        }
      } catch (error) {
        results.routinesFailed++;
        results.details.push({
          agentId,
          routineName,
          status: "failed",
          result: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  } catch (error) {
    console.error("[CRON:agent-routines] Error:", error);
  }

  return NextResponse.json(results);
}

// ---------------------------------------------------------------------------
// POST: Manage routines — create, update, list, delete
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  return withErrorHandler(async () => {
    try {
      const body = await req.json();
      const { action } = body as { action?: string };

      if (!process.env.SUPABASE_DB_URL) {
        return NextResponse.json({ error: "No database configured" }, { status: 500 });
      }

      switch (action) {
        case "setup": {
          // Create the agent_routines table
          await query(AGENT_ROUTINES_SCHEMA);
          // Add last_status column if it doesn't exist (migration for existing tables)
          await query(`ALTER TABLE agent_routines ADD COLUMN IF NOT EXISTS last_status TEXT DEFAULT NULL`);
          return NextResponse.json({ success: true, message: "agent_routines table created" });
        }

      case "create": {
        const { agentId, name, task, context, intervalMinutes, priority, isActive } = body as {
          agentId?: string;
          name?: string;
          task?: string;
          context?: string;
          intervalMinutes?: number;
          priority?: "high" | "medium" | "low";
          isActive?: boolean;
        };

        if (!agentId || !name || !task) {
          return NextResponse.json({ error: "Missing agentId, name, or task" }, { status: 400 });
        }

        const validAgents = getAllAgents().map((a) => a.id);
        if (!validAgents.includes(agentId)) {
          return NextResponse.json({ error: `Invalid agent: ${agentId}` }, { status: 400 });
        }

        const interval = intervalMinutes || 60;
        const nextRun = new Date(Date.now() + interval * 60 * 1000);

        const result = await query(
          `INSERT INTO agent_routines (agent_id, name, task, context, interval_minutes, priority, is_active, next_run)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [agentId, name, task, context || "", interval, priority || "medium", isActive !== false, nextRun.toISOString()],
        );

        return NextResponse.json({ success: true, data: result.rows[0] });
      }

      case "list": {
        const { agentId } = body as { agentId?: string };
        let queryString = "SELECT * FROM agent_routines ORDER BY priority DESC, next_run ASC";
        const params: unknown[] = [];

        if (agentId) {
          queryString = "SELECT * FROM agent_routines WHERE agent_id = $1 ORDER BY priority DESC, next_run ASC";
          params.push(agentId);
        }

        const result = await query(queryString, params);
        return NextResponse.json({ success: true, data: result.rows });
      }

      case "update": {
        const { routineId, ...updates } = body as {
          routineId?: number;
          name?: string;
          task?: string;
          context?: string;
          intervalMinutes?: number;
          priority?: string;
          isActive?: boolean;
        };

        if (!routineId) {
          return NextResponse.json({ error: "Missing routineId" }, { status: 400 });
        }

        const setClauses: string[] = [];
        const values: unknown[] = [];
        let idx = 1;

        if (updates.name) { setClauses.push(`name = $${idx++}`); values.push(updates.name); }
        if (updates.task) { setClauses.push(`task = $${idx++}`); values.push(updates.task); }
        if (updates.context !== undefined) { setClauses.push(`context = $${idx++}`); values.push(updates.context); }
        if (updates.intervalMinutes) {
          setClauses.push(`interval_minutes = $${idx++}, next_run = NOW() + ($${idx++} * INTERVAL '1 minute')`);
          values.push(updates.intervalMinutes, updates.intervalMinutes);
        }
        if (updates.priority) { setClauses.push(`priority = $${idx++}`); values.push(updates.priority); }
        if (updates.isActive !== undefined) { setClauses.push(`is_active = $${idx++}`); values.push(updates.isActive); }

        if (setClauses.length === 0) {
          return NextResponse.json({ error: "No fields to update" }, { status: 400 });
        }

        values.push(routineId);
        const queryString = `UPDATE agent_routines SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`;
        const result = await query(queryString, values);
        return NextResponse.json({ success: true, data: result.rows[0] });
      }

      case "delete": {
        const { routineId } = body as { routineId?: number };
        if (!routineId) {
          return NextResponse.json({ error: "Missing routineId" }, { status: 400 });
        }

        await query("DELETE FROM agent_routines WHERE id = $1", [routineId]);
        return NextResponse.json({ success: true, deleted: true });
      }

      case "run_now": {
        const { routineId } = body as { routineId?: number };
        if (!routineId) {
          return NextResponse.json({ error: "Missing routineId" }, { status: 400 });
        }

        // Look up the routine
        const routineResult = await query("SELECT * FROM agent_routines WHERE id = $1", [routineId]);
        if (routineResult.rows.length === 0) {
          return NextResponse.json({ error: "Routine not found" }, { status: 404 });
        }

        const routine = routineResult.rows[0];
        // Map routine priority to agent_tasks priority (must match CHECK constraint)
        const priorityMap: Record<string, string> = { high: "high", medium: "medium", low: "normal" };
        const priority = priorityMap[routine.priority] || "normal";

        // Insert a new agent_task with the routine's task, agent_id, priority
        await query(
          `INSERT INTO agent_tasks (agent_id, task, context, trigger_type, trigger_source, priority, status, created_at)
           VALUES ($1, $2, $3, 'manual', 'routine_run_now', $4, 'pending', NOW())`,
          [routine.agent_id, routine.task, routine.context || "", priority],
        );

        // Update the routine's next_run to now so the cron doesn't re-execute it immediately
        await query(
          "UPDATE agent_routines SET next_run = NOW() WHERE id = $1",
          [routineId],
        );

        return NextResponse.json({ success: true, message: `Routine "${routine.name}" triggered` });
      }

      default:
        return NextResponse.json({ error: `Unknown action. Use setup, create, list, update, delete, or run_now.` }, { status: 400 });
    }
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Internal server error" },
        { status: 500 },
      );
    }
  }, "POST:/api/cron/agent-routines");
}

// ---------------------------------------------------------------------------
// executeRoutine — Run a routine task using the assigned agent
// ---------------------------------------------------------------------------

async function executeRoutine(
  agentId: string,
  task: string,
  context: string,
): Promise<{ success: boolean; text: string; error?: string }> {
  try {
    const agent = getAgent(agentId);
    if (!agent) return { success: false, text: "", error: `Unknown agent: ${agentId}` };

    const providerResult = await getProvider(agent);

    // Build tool subset
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agentTools: Record<string, any> = {};
    for (const toolId of agent.tools) {
      if (allTools[toolId]) agentTools[toolId] = allTools[toolId];
    }

    const systemPrompt = `You are ${agent.name}, ${agent.role}. You are running a SCHEDULED ROUTINE — a background task that runs automatically. Execute the task fully and provide a concise summary of what you found/did. Be brief — this is a routine, not a full conversation.\n\n${agent.systemPrompt}`;

    const { generateText, stepCountIs } = await import("ai");

    // CRITICAL FIX: Wrap in withAgentContext so tools get correct agent ID
    // during routine execution instead of always falling back to 'general'
    const result = await withAgentContext(agentId, async () => {
      return await generateText({
        model: providerResult.model,
        system: systemPrompt,
        messages: [
          { role: "user", content: `${task}\n\n${context ? `Context: ${context}` : ""}` },
        ],
        tools: agentTools,
        maxOutputTokens: 16384,
        stopWhen: stepCountIs(25),
        abortSignal: AbortSignal.timeout(150_000),
      });
    });

    return { success: true, text: result.text || "(Routine completed with no output)" };
  } catch (error) {
    return { success: false, text: "", error: error instanceof Error ? error.message : "Execution error" };
  }
}
