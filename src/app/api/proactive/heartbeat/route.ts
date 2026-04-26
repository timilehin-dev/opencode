// ---------------------------------------------------------------------------
// Proactive Intelligence Heartbeat
//
// This is the BRAIN of the proactive agent system. Called by the task-executor
// every 2 minutes and also available on-demand for the dashboard.
//
// It gathers the full system state (pending tasks, due routines, A2A messages,
// agent statuses, recent activity) and uses an LLM to decide what the system
// should do proactively RIGHT NOW — without any user prompting.
//
// Returns a structured "proactive plan" with concrete actions to execute.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getAllAgentStatuses, getAgent, getProvider } from "@/lib/agents";
import { logActivity } from "@/lib/activity";

export const maxDuration = 60;

// ---------------------------------------------------------------------------
// GET: Generate a proactive intelligence snapshot + action plan
// ---------------------------------------------------------------------------

export async function GET() {
  const startTime = Date.now();
  const now = new Date();

  try {
    // ── Phase 1: Gather System State (parallel queries) ──
    // NOTE: All queries use the ACTUAL production schema:
    //   agent_definitions (not agent_configs)
    //   agent_tasks.next_run_at (not next_run)
    //   agent_tasks.attempts (integer)
    //   a2a_messages.is_read (not read), .type (not message_type), .payload (not content)
    //   agent_routines.is_active (not enabled)
    //   projects has total_tasks/completed_tasks/failed_tasks/pending_tasks columns directly
    //   activity_log may have zero columns (empty table) — handled gracefully

    const [
      pendingTasks,
      dueRoutines,
      a2aInbox,
      recentActivityResult,
      projectStatus,
      agentMemories,
      failedTasks,
      workflowResult,
    ] = await Promise.allSettled([
      // Pending agent_tasks
      query(`
        SELECT at.id, at.agent_id, at.task, at.priority, at.status,
               at.created_at, at.next_run_at as next_run, at.attempts
        FROM agent_tasks at
        WHERE at.status IN ('pending', 'running', 'failed')
          AND (at.next_run_at IS NULL OR at.next_run_at <= NOW() + INTERVAL '5 minutes')
        ORDER BY
          CASE at.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
          at.next_run_at ASC NULLS LAST
        LIMIT 10
      `),

      // Due routines
      query(`
        SELECT r.id, r.agent_id, r.name, r.task,
               r.last_run, r.next_run, r.is_active, r.last_status
        FROM agent_routines r
        WHERE r.is_active = true
          AND r.next_run <= NOW() + INTERVAL '10 minutes'
        ORDER BY r.next_run ASC
        LIMIT 10
      `),

      // Unread A2A messages
      query(`
        SELECT m.id, m.from_agent, m.to_agent, m.type, m.topic,
               m.payload, m.priority, m.created_at
        FROM a2a_messages m
        WHERE m.is_read = false
        ORDER BY
          CASE m.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END,
          m.created_at ASC
        LIMIT 15
      `),

      // Recent activity — activity_log may be empty schema, use agent_activity as fallback
      query(`
        SELECT agent_id, agent_name, action, detail, created_at
        FROM agent_activity
        WHERE created_at > NOW() - INTERVAL '30 minutes'
        ORDER BY created_at DESC
        LIMIT 20
      `).catch(() => query(`
        SELECT agent_id, agent_name, action, detail, created_at
        FROM activity_log
        WHERE created_at > NOW() - INTERVAL '30 minutes'
        ORDER BY created_at DESC
        LIMIT 20
      `)),

      // Active projects — uses direct columns (no subqueries needed)
      query(`
        SELECT p.id, p.name, p.status, p.priority,
               p.total_tasks, p.completed_tasks, p.failed_tasks, p.pending_tasks,
               p.agent_id, p.agent_name, p.updated_at
        FROM projects p
        WHERE p.status IN ('active', 'in_progress')
        ORDER BY p.updated_at DESC
        LIMIT 5
      `),

      // Recent agent memories
      query(`
        SELECT agent_id, category, content, importance, created_at
        FROM agent_memory
        WHERE created_at > NOW() - INTERVAL '24 hours'
          AND importance >= 3
        ORDER BY importance DESC, created_at DESC
        LIMIT 10
      `),

      // Failed tasks needing escalation
      query(`
        SELECT id, agent_id, task, error, attempts, started_at as last_run, created_at
        FROM agent_tasks
        WHERE status = 'failed'
          AND attempts < 3
          AND started_at > NOW() - INTERVAL '2 hours'
        ORDER BY started_at DESC
        LIMIT 5
      `),

      // Scheduled workflows — workflows table may be empty schema
      query(`
        SELECT id, name, status, agent_id
        FROM agent_workflows
        WHERE status = 'scheduled'
        ORDER BY created_at DESC
        LIMIT 5
      `).catch(() => query(`
        SELECT id, name, status, agent_id
        FROM workflows
        WHERE status = 'scheduled'
        ORDER BY created_at DESC
        LIMIT 5
      `)),
    ]);

    // Safely extract rows, defaulting to empty arrays for rejected promises
    const pendingTasksRows = pendingTasks.status === "fulfilled" ? pendingTasks.value.rows : [];
    const dueRoutinesRows = dueRoutines.status === "fulfilled" ? dueRoutines.value.rows : [];
    const a2aInboxRows = a2aInbox.status === "fulfilled" ? a2aInbox.value.rows : [];
    const recentActivityRows = recentActivityResult.status === "fulfilled" ? recentActivityResult.value.rows : [];
    const projectStatusRows = projectStatus.status === "fulfilled" ? projectStatus.value.rows : [];
    const agentMemoriesRows = agentMemories.status === "fulfilled" ? agentMemories.value.rows : [];
    const failedTasksRows = failedTasks.status === "fulfilled" ? failedTasks.value.rows : [];
    const workflowRows = workflowResult.status === "fulfilled" ? workflowResult.value.rows : [];

    // Get real-time agent statuses
    const agentStatuses = getAllAgentStatuses();

    // ── Phase 2: Build System Context for LLM ──

    const systemState = {
      timestamp: now.toISOString(),
      agentStatuses: agentStatuses.map((s) => ({
        id: s.id,
        status: s.status,
        currentTask: s.currentTask,
        lastActivity: s.lastActivity,
        tasksCompleted: s.tasksCompleted,
      })),
      pendingTasks: pendingTasksRows.length,
      dueRoutines: dueRoutinesRows.length,
      unreadA2AMessages: a2aInboxRows.length,
      activeProjects: projectStatusRows.length,
      failedTasksNeedingEscalation: failedTasksRows.length,
      scheduledWorkflows: workflowRows.length,
    };

    // ── Phase 3: LLM-Powered Proactive Planning ──

    let proactivePlan: {
      summary: string;
      urgency: "idle" | "low" | "medium" | "high" | "critical";
      actions: Array<{
        type: string;
        agent: string;
        action: string;
        reasoning: string;
        priority: string;
      }>;
      recommendations: string[];
    };

    // Only run LLM planning if there's something to act on
    const hasWork =
      pendingTasksRows.length > 0 ||
      dueRoutinesRows.length > 0 ||
      a2aInboxRows.length > 0 ||
      failedTasksRows.length > 0 ||
      workflowRows.length > 0 ||
      projectStatusRows.some((p: any) => (p.pending_tasks as number) > 0);

    if (hasWork) {
      try {
        const generalAgent = getAgent("general");
        if (!generalAgent) throw new Error("General agent not found");
        const providerResult = await getProvider(generalAgent);
        const { generateText } = await import("ai");

        const contextSummary = [
          `## Agent Statuses\n${agentStatuses.map((s) => `- ${s.id}: ${s.status}${s.currentTask ? ` (working on: ${s.currentTask.slice(0, 60)})` : ""}`).join("\n")}`,
          pendingTasksRows.length > 0
            ? `\n## Pending Tasks (${pendingTasksRows.length})\n${pendingTasksRows.map((t: any) => `- [${t.priority}] ${t.agent_id}: ${t.task.slice(0, 80)}`).join("\n")}`
            : "",
          dueRoutinesRows.length > 0
            ? `\n## Due Routines (${dueRoutinesRows.length})\n${dueRoutinesRows.map((r: any) => `- ${r.agent_id}: ${r.name} (next: ${r.next_run})`).join("\n")}`
            : "",
          a2aInboxRows.length > 0
            ? `\n## Unread A2A Messages (${a2aInboxRows.length})\n${a2aInboxRows.map((m: any) => `- ${m.from_agent} -> ${m.to_agent}: ${m.type} (${m.priority}): ${m.topic || ""}`).join("\n")}`
            : "",
          failedTasksRows.length > 0
            ? `\n## Failed Tasks Needing Escalation (${failedTasksRows.length})\n${failedTasksRows.map((t: any) => `- ${t.agent_id}: ${t.task.slice(0, 60)} (attempts: ${t.attempts}, error: ${(t.error || "unknown").slice(0, 40)})`).join("\n")}`
            : "",
          projectStatusRows.length > 0
            ? `\n## Active Projects\n${projectStatusRows.map((p: any) => `- ${p.name}: ${p.completed_tasks}/${p.total_tasks} complete, ${p.pending_tasks} pending, ${p.failed_tasks} failed`).join("\n")}`
            : "",
          recentActivityRows.length > 0
            ? `\n## Recent Activity (last 30 min)\n${recentActivityRows.slice(0, 5).map((a: any) => `- ${a.agent_id}: ${a.action} - ${(a.detail || "").slice(0, 60)}`).join("\n")}`
            : "",
        ].join("\n");

        const planningPrompt = `You are the PROACTIVE INTELLIGENCE ENGINE of the Klawhub multiagent system. Your job is to analyze the current system state and produce a CONCRETE action plan for what agents should do RIGHT NOW — without any human prompting.

${contextSummary}

Based on this state, determine:
1. What is the MOST IMPORTANT thing the system should do right now?
2. Which agent(s) should handle it?
3. What specific actions should they take?
4. Are there any inter-agent communications that should happen?
5. Are there any risks or blockers to address?

Rules:
- Be SPECIFIC — name exact agents, exact tasks, exact actions
- Prioritize: urgent A2A messages > critical tasks > failed escalations > due routines > project work > proactive suggestions
- Consider agent workload — don't overload a busy agent
- If agents need to coordinate, specify the A2A message flow
- Maximum 5 actions — focus on what matters NOW
- Add 1-2 recommendations for future proactive improvements

Output as JSON:
{
  "summary": "One-sentence summary of what the system should focus on right now",
  "urgency": "idle|low|medium|high|critical",
  "actions": [
    {
      "type": "execute_task|process_a2a|escalate_failure|run_routine|delegate|coordinate",
      "agent": "agent_id",
      "action": "Specific description of what to do",
      "reasoning": "Why this is the right action",
      "priority": "critical|high|medium|low"
    }
  ],
  "recommendations": ["future improvement suggestion 1", "future improvement suggestion 2"]
}`;

        const result = await generateText({
          model: providerResult.model,
          system: "You are a proactive AI system orchestrator. Output ONLY valid JSON, no markdown.",
          messages: [{ role: "user", content: planningPrompt }],
          maxOutputTokens: 2048,
          abortSignal: AbortSignal.timeout(30_000),
        });

        let jsonStr = result.text || "{}";
        const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) jsonStr = jsonMatch[1];
        proactivePlan = JSON.parse(jsonStr);

        // Validate and sanitize
        proactivePlan.urgency = ["idle", "low", "medium", "high", "critical"].includes(proactivePlan.urgency)
          ? proactivePlan.urgency
          : "low";
        proactivePlan.actions = (proactivePlan.actions || []).slice(0, 5);
        proactivePlan.recommendations = (proactivePlan.recommendations || []).slice(0, 3);
      } catch (llmErr) {
        // Fallback: generate a basic plan without LLM
        const urgency = failedTasksRows.length > 0 ? "high" : pendingTasksRows.length > 3 ? "medium" : dueRoutinesRows.length > 0 ? "low" : "idle";

        const actions: Array<{ type: string; agent: string; action: string; reasoning: string; priority: string }> = [];

        // Prioritize A2A messages
        for (const msg of a2aInboxRows.slice(0, 3)) {
          actions.push({
            type: "process_a2a",
            agent: (msg as any).to_agent,
            action: `Process message from ${(msg as any).from_agent}: ${(msg as any).type} - ${(msg as any).topic || ""}`,
            reasoning: `Unread A2A message with ${(msg as any).priority} priority`,
            priority: (msg as any).priority || "normal",
          });
        }

        // Then pending tasks
        for (const task of pendingTasksRows.slice(0, 3)) {
          actions.push({
            type: "execute_task",
            agent: (task as any).agent_id,
            action: (task as any).task,
            reasoning: `Pending task with ${(task as any).priority} priority`,
            priority: (task as any).priority || "medium",
          });
        }

        proactivePlan = {
          summary: `${actions.length} actions queued for autonomous execution`,
          urgency,
          actions,
          recommendations: [],
        };
      }
    } else {
      proactivePlan = {
        summary: "All systems nominal — agents idle, no pending work",
        urgency: "idle",
        actions: [],
        recommendations: [],
      };
    }

    // ── Phase 4: Return structured response ──

    const response = {
      success: true,
      data: {
        systemState,
        proactivePlan,
        raw: {
          pendingTasks: pendingTasksRows,
          dueRoutines: dueRoutinesRows,
          unreadA2A: a2aInboxRows,
          activeProjects: projectStatusRows,
          failedTasks: failedTasksRows,
          scheduledWorkflows: workflowRows,
          recentActivity: recentActivityRows.slice(0, 10),
        },
        meta: {
          generatedAt: now.toISOString(),
          latencyMs: Date.now() - startTime,
          usedLLM: hasWork,
        },
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[Proactive Heartbeat] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        data: {
          systemState: { timestamp: now.toISOString(), error: true },
          proactivePlan: { summary: "Heartbeat failed — check logs", urgency: "low" as const, actions: [], recommendations: [] },
          raw: {},
          meta: { generatedAt: now.toISOString(), latencyMs: Date.now() - startTime, usedLLM: false },
        },
      },
      { status: 500 },
    );
  }
}
