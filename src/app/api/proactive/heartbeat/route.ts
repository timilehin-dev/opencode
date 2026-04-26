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

    const [
      pendingTasks,
      dueRoutines,
      a2aInbox,
      recentActivity,
      projectStatus,
      agentMemories,
      failedTasks,
      workflowQueue,
    ] = await Promise.all([
      // Pending agent_tasks
      query(`
        SELECT at.id, at.agent_id, at.task, at.priority, at.status,
               at.created_at, at.next_run,
               ag.emoji, ag.name as agent_name
        FROM agent_tasks at
        LEFT JOIN agent_configs ag ON ag.agent_id = at.agent_id
        WHERE at.status IN ('pending', 'running', 'failed')
          AND at.next_run <= NOW() + INTERVAL '5 minutes'
        ORDER BY
          CASE at.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
          at.next_run ASC
        LIMIT 10
      `),

      // Due routines
      query(`
        SELECT r.id, r.agent_id, r.name, r.schedule_cron, r.enabled,
               r.last_run, r.next_run,
               ag.emoji, ag.name as agent_name
        FROM agent_routines r
        LEFT JOIN agent_configs ag ON ag.agent_id = r.agent_id
        WHERE r.enabled = true
          AND r.next_run <= NOW() + INTERVAL '10 minutes'
        ORDER BY r.next_run ASC
        LIMIT 10
      `),

      // Unread A2A messages
      query(`
        SELECT m.id, m.from_agent, m.to_agent, m.message_type, m.content,
               m.priority, m.created_at,
               fa.emoji as from_emoji, fa.name as from_name,
               ta.emoji as to_emoji, ta.name as to_name
        FROM a2a_messages m
        LEFT JOIN agent_configs fa ON fa.agent_id = m.from_agent
        LEFT JOIN agent_configs ta ON ta.agent_id = m.to_agent
        WHERE m.read = false
        ORDER BY
          CASE m.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END,
          m.created_at ASC
        LIMIT 15
      `),

      // Recent activity (last 30 min)
      query(`
        SELECT agent_id, agent_name, action, detail, created_at
        FROM activity_log
        WHERE created_at > NOW() - INTERVAL '30 minutes'
        ORDER BY created_at DESC
        LIMIT 20
      `),

      // Active projects
      query(`
        SELECT p.id, p.name, p.status, p.progress,
               (SELECT COUNT(*) FROM project_tasks WHERE project_id = p.id AND status = 'pending') as pending_tasks,
               (SELECT COUNT(*) FROM project_tasks WHERE project_id = p.id AND status = 'completed') as completed_tasks,
               (SELECT COUNT(*) FROM project_tasks WHERE project_id = p.id AND status = 'failed') as failed_tasks,
               p.updated_at
        FROM projects p
        WHERE p.status IN ('active', 'in_progress')
        ORDER BY p.updated_at DESC
        LIMIT 5
      `),

      // Recent agent memories (context injection)
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
        SELECT id, agent_id, task, error, attempts, last_run, created_at
        FROM agent_tasks
        WHERE status = 'failed'
          AND attempts < 3
          AND last_run > NOW() - INTERVAL '2 hours'
        ORDER BY last_run DESC
        LIMIT 5
      `),

      // Scheduled workflows
      query(`
        SELECT id, name, status, next_run, agent_id
        FROM workflows
        WHERE status = 'scheduled'
          AND next_run <= NOW() + INTERVAL '30 minutes'
        ORDER BY next_run ASC
        LIMIT 5
      `),
    ]);

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
      pendingTasks: pendingTasks.rows.length,
      dueRoutines: dueRoutines.rows.length,
      unreadA2AMessages: a2aInbox.rows.length,
      activeProjects: projectStatus.rows.length,
      failedTasksNeedingEscalation: failedTasks.rows.length,
      scheduledWorkflows: workflowQueue.rows.length,
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
      pendingTasks.rows.length > 0 ||
      dueRoutines.rows.length > 0 ||
      a2aInbox.rows.length > 0 ||
      failedTasks.rows.length > 0 ||
      workflowQueue.rows.length > 0 ||
      projectStatus.rows.some((p: any) => (p.pending_tasks as number) > 0);

    if (hasWork) {
      try {
        const generalAgent = getAgent("general");
        if (!generalAgent) throw new Error("General agent not found");
        const providerResult = await getProvider(generalAgent);
        const { generateText } = await import("ai");

        const contextSummary = [
          `## Agent Statuses\n${agentStatuses.map((s) => `- ${s.id}: ${s.status}${s.currentTask ? ` (working on: ${s.currentTask.slice(0, 60)})` : ""}`).join("\n")}`,
          pendingTasks.rows.length > 0
            ? `\n## Pending Tasks (${pendingTasks.rows.length})\n${pendingTasks.rows.map((t: any) => `- [${t.priority}] ${t.agent_id}: ${t.task.slice(0, 80)}`).join("\n")}`
            : "",
          dueRoutines.rows.length > 0
            ? `\n## Due Routines (${dueRoutines.rows.length})\n${dueRoutines.rows.map((r: any) => `- ${r.agent_id}: ${r.name} (next: ${r.next_run})`).join("\n")}`
            : "",
          a2aInbox.rows.length > 0
            ? `\n## Unread A2A Messages (${a2aInbox.rows.length})\n${a2aInbox.rows.map((m: any) => `- ${m.from_agent} → ${m.to_agent}: ${m.message_type} (${m.priority}): ${(m.content || "").slice(0, 60)}`).join("\n")}`
            : "",
          failedTasks.rows.length > 0
            ? `\n## Failed Tasks Needing Escalation (${failedTasks.rows.length})\n${failedTasks.rows.map((t: any) => `- ${t.agent_id}: ${t.task.slice(0, 60)} (attempts: ${t.attempts}, error: ${(t.error || "unknown").slice(0, 40)})`).join("\n")}`
            : "",
          projectStatus.rows.length > 0
            ? `\n## Active Projects\n${projectStatus.rows.map((p: any) => `- ${p.name}: ${p.progress}% complete, ${p.pending_tasks} pending, ${p.failed_tasks} failed`).join("\n")}`
            : "",
          workflowQueue.rows.length > 0
            ? `\n## Scheduled Workflows\n${workflowQueue.rows.map((w: any) => `- ${w.name}: next run ${w.next_run}`).join("\n")}`
            : "",
          recentActivity.rows.length > 0
            ? `\n## Recent Activity (last 30 min)\n${recentActivity.rows.slice(0, 5).map((a: any) => `- ${a.agent_id}: ${a.action} — ${a.detail.slice(0, 60)}`).join("\n")}`
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
        const urgency = failedTasks.rows.length > 0 ? "high" : pendingTasks.rows.length > 3 ? "medium" : dueRoutines.rows.length > 0 ? "low" : "idle";

        const actions: Array<{ type: string; agent: string; action: string; reasoning: string; priority: string }> = [];

        // Prioritize A2A messages
        for (const msg of a2aInbox.rows.slice(0, 3)) {
          actions.push({
            type: "process_a2a",
            agent: (msg as any).to_agent,
            action: `Process message from ${(msg as any).from_agent}: ${(msg as any).content || (msg as any).message_type}`,
            reasoning: `Unread A2A message with ${(msg as any).priority} priority`,
            priority: (msg as any).priority || "normal",
          });
        }

        // Then pending tasks
        for (const task of pendingTasks.rows.slice(0, 3)) {
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
          pendingTasks: pendingTasks.rows,
          dueRoutines: dueRoutines.rows,
          unreadA2A: a2aInbox.rows,
          activeProjects: projectStatus.rows,
          failedTasks: failedTasks.rows,
          scheduledWorkflows: workflowQueue.rows,
          recentActivity: recentActivity.rows.slice(0, 10),
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
