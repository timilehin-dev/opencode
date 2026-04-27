// ---------------------------------------------------------------------------
// Vercel Cron — Execute Single Routine
// Called by pg_cron with a specific routine ID.
// Each active routine gets its own pg_cron job that hits this endpoint.
//
// URL format: /api/cron/execute-routine?secret=...&routineId=123
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getAgent, getProvider } from "@/lib/agents";
import { allTools, withAgentContext } from "@/lib/tools/index";
import { logActivity, persistAgentStatus } from "@/lib/activity";
import { query } from "@/lib/db";
import { sendProactiveNotification } from "@/lib/proactive-notifications";

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = request.headers.get("x-cron-secret") || new URL(request.url).searchParams.get("secret");
  const { searchParams } = new URL(request.url);
  const routineId = searchParams.get("routineId");

  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!routineId || isNaN(Number(routineId))) {
    return NextResponse.json({ error: "Missing or invalid routineId" }, { status: 400 });
  }

  if (!process.env.SUPABASE_DB_URL) {
    return NextResponse.json({ error: "No database" }, { status: 500 });
  }

  const startTime = Date.now();

  try {
    // Fetch the routine
    const { rows } = await query(
      `SELECT * FROM agent_routines WHERE id = $1 AND is_active = true`,
      [Number(routineId)],
    );

    if (rows.length === 0) {
      // Routine not found or inactive — clean up the pg_cron job
      try {
        await query(`SELECT cron.unschedule('routine-${routineId}')`).catch(() => {});
      } catch { /* ignore */ }
      return NextResponse.json({ status: "skipped", reason: "routine_not_found_or_inactive" });
    }

    const routine = rows[0];
    const agentId = routine.agent_id;
    const routineName = routine.name;
    const task = routine.task;
    const context = routine.context || "";
    const intervalMinutes = routine.interval_minutes;

    const agent = getAgent(agentId);
    if (!agent) {
      return NextResponse.json({ status: "error", reason: `unknown_agent_${agentId}` });
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

    // Build tool subset
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agentTools: Record<string, any> = {};
    for (const toolId of agent.tools) {
      if (allTools[toolId]) agentTools[toolId] = allTools[toolId];
    }

    const systemPrompt = `You are ${agent.name}, ${agent.role}. You are running a SCHEDULED ROUTINE. Execute the task fully and provide a concise summary. Be brief.\n\n${agent.systemPrompt}`;

    const { generateText, stepCountIs } = await import("ai");

    const result = await withAgentContext(agentId, async () => {
      return await generateText({
        model: (await getProvider(agent)).model,
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

    // Update routine last_run, last_status, next_run, and last_result
    const nextRun = new Date(Date.now() + intervalMinutes * 60 * 1000);
    await query(
      "UPDATE agent_routines SET last_run = NOW(), last_status = $1, next_run = $2, last_result = $3 WHERE id = $4",
      ["success", nextRun.toISOString(), result.text?.slice(0, 2000) || "", routineId],
    );

    const success = !!result.text;
    const durationMs = Date.now() - startTime;

    if (success) {
      persistAgentStatus(agentId, { status: "idle", currentTask: null, lastActivity: new Date().toISOString(), tasksCompleted: 1 }).catch(() => {});

      sendProactiveNotification({
        agentId,
        agentName: agent.name,
        type: "routine_result",
        title: `Routine: ${routineName}`,
        body: result.text!.slice(0, 300),
        priority: "low",
      }).catch(() => {});
    } else {
      persistAgentStatus(agentId, { status: "error", currentTask: null, lastActivity: new Date().toISOString() }).catch(() => {});
    }

    return NextResponse.json({
      status: success ? "success" : "no_output",
      routineId: Number(routineId),
      routineName,
      agentId,
      durationMs,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    const durationMs = Date.now() - startTime;

    console.error(`[CRON:execute-routine] Routine ${routineId} failed:`, errMsg);

    logActivity({
      agentId: "system",
      action: "routine_error",
      detail: `Routine ${routineId} failed: ${errMsg}`,
    }).catch(() => {});

    // Update DB with error — prevents infinite retry loops by bumping next_run
    try {
      await query(
        "UPDATE agent_routines SET last_run = NOW(), last_status = $1, next_run = NOW() + INTERVAL '30 minutes', last_result = $2 WHERE id = $3",
        ["failed", `ERROR: ${errMsg.slice(0, 500)}`, routineId],
      );
    } catch (dbErr) {
      console.error("[CRON:execute-routine] Failed to update routine error state:", dbErr);
    }

    return NextResponse.json({ status: "error", error: errMsg, durationMs });
  }
}
