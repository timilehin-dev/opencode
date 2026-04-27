// ---------------------------------------------------------------------------
// Agent Delegation & Team Coordination Tools
// ---------------------------------------------------------------------------
import { z, tool, zodSchema, safeJson, query, getCurrentAgentId, withAgentContext, setCurrentAgentId, getSelfBaseUrl, getSelfFetchHeaders } from "./shared";

// ---------------------------------------------------------------------------
// Agent Delegation Tool (Klawhub General only)
// ---------------------------------------------------------------------------
// NOTE: Uses generateText() directly instead of HTTP fetch to avoid Vercel
// authentication issues with internal API calls.
// ---------------------------------------------------------------------------

async function callAgentDirectly(agentId: string, taskPrompt: string, _delegationDepth: number = 0): Promise<{ text: string; steps: number }> {
  const { generateText, stepCountIs } = await import("ai");
  const { getAgent, getProvider } = await import("@/lib/agents");
  const { allTools, setCurrentAgentId } = await import("@/lib/tools");

  const agent = getAgent(agentId);
  if (!agent) throw new Error(`Unknown agent: ${agentId}`);

  // Set current agent context for A2A tools
  setCurrentAgentId(agentId);

  // Phase 4: Multi-hop delegation — up to 3 levels deep with per-hop timeouts
  // Circuit breaker: after 3 hops, strip all delegation tools to prevent infinite loops
  const MAX_DELEGATION_DEPTH = 3;
  const agentTools: Record<string, any> = {};
  for (const toolId of agent.tools) {
    if (allTools[toolId]) {
      // Strip delegation tools at max depth (circuit breaker)
      if (_delegationDepth >= MAX_DELEGATION_DEPTH && (toolId === "query_agent" || toolId === "a2a_send_message" || toolId === "a2a_broadcast" || toolId === "a2a_collaborate")) continue;
      agentTools[toolId] = allTools[toolId];
    }
  }

  const providerResult = await getProvider(agent);

  // Per-hop timeout and steps: reduce with each delegation level
  // Raised from 25/20/15/10 to 40/30/20/15 — specialists need more room to complete
  // multi-tool tasks and still generate a text summary before hitting the limit.
  const timeoutMs = _delegationDepth === 0 ? 150_000 : _delegationDepth === 1 ? 120_000 : _delegationDepth === 2 ? 90_000 : 60_000;
  const maxSteps = _delegationDepth === 0 ? 40 : _delegationDepth === 1 ? 30 : _delegationDepth === 2 ? 20 : 15;

  const result = await generateText({
    model: providerResult.model,
    system: agent.systemPrompt,
    messages: [{ role: "user", content: taskPrompt }],
    tools: agentTools,
    maxOutputTokens: 262144,
    stopWhen: stepCountIs(maxSteps),
    abortSignal: AbortSignal.timeout(timeoutMs),
    // Same mid-task completion guard as main chat — prevent specialists from
    // stopping after tool results without generating a text explanation.
    prepareStep: ({ steps: delSteps, stepNumber: delStepNum }) => {
      if (delStepNum <= 0) return undefined;
      const anyText = delSteps.some(s => (s.text?.length ?? 0) > 0);
      const lastStep = delSteps[delSteps.length - 1];
      const lastHadToolResults = (lastStep?.toolResults?.length ?? 0) > 0;
      const anyToolResults = delSteps.some(s => (s.toolResults?.length ?? 0) > 0);
      const stepsToLimit = maxSteps - delStepNum;

      // Near limit with no text — force summary
      if (stepsToLimit <= 2 && !anyText && anyToolResults) {
        return {
          toolChoice: "none" as const,
          system: agent.systemPrompt + "\n\n[URGENT: Step limit approaching (${delStepNum}/${maxSteps}). Stop calling tools and write a text summary of ALL tool results NOW.]",
        };
      }
      // Last step had tool results but no text anywhere
      if (lastHadToolResults && !anyText) {
        return {
          toolChoice: "none" as const,
          system: agent.systemPrompt + "\n\n[CRITICAL: You received tool results but have NOT explained them. Write a text response explaining what the tools found. Do NOT call more tools.]",
        };
      }
      return undefined;
    },
  });

  // H10: Recovery after step exhaustion — if no text was produced, summarize what was done
  const toolCalls = result.steps.flatMap((s: { toolCalls?: Array<{ toolName: string }> }) => s.toolCalls || []);
  let responseText = result.text;

  if (!responseText || responseText.trim().length < 50) {
    if (toolCalls.length > 0) {
      const toolSummary = toolCalls.map((tc: { toolName: string }) => tc.toolName).join(", ");
      responseText = `[Delegation to ${agent.name} completed ${toolCalls.length} tool call(s) but did not produce a final text summary. Tools used: ${toolSummary}. The tool calls completed successfully — ask me for details about any specific result.]`;
    } else {
      responseText = `[Delegation to ${agent.name} returned no output. The task may have exceeded the step limit (${maxSteps} steps) or timeout (${Math.round(timeoutMs / 1000)}s).]`;
    }
  }

  return { text: responseText, steps: result.steps.length };
}

export const delegateToAgentTool = tool({
  description: "Delegate a task to a specialist agent. Only use when the task is clearly within one specialist's domain and doesn't require cross-domain reasoning. Available agents: mail (email/calendar), code (GitHub/Vercel), data (Drive/Sheets/Docs), creative (content/planning/docs), research (deep research/intelligence), ops (monitoring/health). Returns the specialist agent's response.",
  inputSchema: zodSchema(z.object({
    agent_id: z.enum(["mail", "code", "data", "creative", "research", "ops"]).describe("The specialist agent to delegate to"),
    task: z.string().describe("Clear, specific task description with all necessary context"),
  })),
  execute: safeJson(async ({ agent_id, task }) => {
    const taskId = `a2a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const startTime = Date.now();

    // Log the delegation via Phase 3 delegations table (fire-and-forget)
    let delegationId = -1;
    const fromAgent = getCurrentAgentId() || "general";
    try {
      const { logDelegation } = await import("@/lib/delegations");
      delegationId = await logDelegation({
        initiator_agent: fromAgent,
        assigned_agent: agent_id,
        task,
        context: `Delegated by ${fromAgent} via delegate_to_agent tool`,
        delegation_chain: [fromAgent, agent_id],
      });
    } catch {
      // Delegation logging is non-critical
    }

    // Also log to legacy a2a_tasks table (fire-and-forget, backwards compat)
    try {
      await query(
        `INSERT INTO a2a_tasks (initiator_agent, assigned_agent, task, context, status, delegation_chain)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [fromAgent, agent_id, task, `Delegated by ${fromAgent} via delegate_to_agent tool`, 'in_progress', [fromAgent, agent_id]]
      );
    } catch {
      // A2A logging is non-critical
    }

    try {
      console.log(`[A2A] Delegating to ${agent_id}: ${task.slice(0, 100)}...`);
      const { text, steps } = await withAgentContext(agent_id, () => callAgentDirectly(agent_id, task));
      const durationMs = Date.now() - startTime;
      console.log(`[A2A] ${agent_id} responded: ${steps} steps, ${text.length} chars`);

      // Update delegation status to completed
      if (delegationId > 0) {
        const { updateDelegation } = await import("@/lib/delegations");
        updateDelegation(delegationId, {
          status: "completed",
          result: text.trim().slice(0, 2000),
          duration_ms: durationMs,
        }).catch(() => {});
      }

      // Update legacy a2a_tasks status (fire-and-forget)
      // Use most recent in_progress task for this agent pair to avoid ID mismatch
      try {
        await query(
          `UPDATE a2a_tasks SET status = 'completed', result = $1, completed_at = NOW()
           WHERE initiator_agent = $2 AND assigned_agent = $3 AND status = 'in_progress'
           ORDER BY created_at DESC LIMIT 1`,
          [text.trim().slice(0, 2000), fromAgent, agent_id]
        );
      } catch { /* non-critical */ }

      return { success: true, agent: agent_id, response: text.trim() || "(Agent returned no text response)", steps, durationMs };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      console.error(`[A2A] Delegation to ${agent_id} failed:`, error);

      // Update delegation status to failed
      if (delegationId > 0) {
        const { updateDelegation } = await import("@/lib/delegations");
        updateDelegation(delegationId, {
          status: "failed",
          result: error instanceof Error ? error.message : "Delegation failed",
          duration_ms: durationMs,
        }).catch(() => {});
      }

      return { success: false, error: error instanceof Error ? error.message : "Delegation failed", taskId };
    }
  }),
});

// ---------------------------------------------------------------------------
// Query Agent Tool (A2A — for specialist agents)
// Uses generateText() directly to avoid Vercel auth issues with HTTP calls.
// ---------------------------------------------------------------------------

export const queryAgentTool = tool({
  description: "AUTONOMOUSLY route a task to another specialist agent for real-time execution. The target agent EXECUTES the task and returns the result immediately — this is synchronous, not async messaging. Use this when you need another agent to DO something (not just receive a message). ALWAYS include ALL details the target agent needs (recipient emails, file content, times, descriptions, etc.). The user has pre-authorized cross-agent collaboration — do NOT ask for permission, just route and execute. For async communication where you don't need an immediate response, use a2a_send_message instead. Available agents: general (orchestrator, ALL tools), mail (email/calendar/meeting invites/Google Meet), code (GitHub/Vercel/DevOps), data (Drive/Sheets/Docs/analysis/vision), creative (content/strategy/docs/planning/design), research (deep research/intelligence/briefs), ops (monitoring/health/deployments).",
  inputSchema: zodSchema(z.object({
    agent_id: z.enum(["general", "mail", "code", "data", "creative", "research", "ops"]).describe("The specialist agent to route the task to"),
    question: z.string().describe("Complete task description with ALL context the target agent needs. Include: what to do, who/what/where/when details, any content to send, file IDs, email addresses, times, etc. Be SPECIFIC and provide everything needed for autonomous execution."),
  })),
  execute: safeJson(async ({ agent_id, question }) => {
    const startTime = Date.now();

    // Use the dynamically set agent ID for delegation logging
    const fromAgent = getCurrentAgentId() || "unknown";

    // Log the delegation via Phase 3 delegations table (fire-and-forget)
    let delegationId = -1;
    try {
      const { logDelegation } = await import("@/lib/delegations");
      delegationId = await logDelegation({
        initiator_agent: fromAgent,
        assigned_agent: agent_id,
        task: question,
        context: `Routed via query_agent from ${fromAgent}`,
        delegation_chain: [fromAgent, agent_id],
      });
    } catch {
      // Delegation logging is non-critical
    }

    // Also log to a2a_tasks for visibility in the A2A dashboard
    try {
      await query(
        `INSERT INTO a2a_tasks (initiator_agent, assigned_agent, task, context, status, delegation_chain)
         VALUES ($1, $2, $3, $4, 'in_progress', $5)`,
        [fromAgent, agent_id, question.slice(0, 500), `Synchronous delegation from ${fromAgent} via query_agent`, [fromAgent, agent_id]]
      );
    } catch { /* non-critical */ }

    try {
      console.log(`[A2A] Query from ${fromAgent} to ${agent_id}: ${question.slice(0, 100)}...`);
      // Wrap in withAgentContext so tool execute callbacks inherit the correct agent ID
      // via AsyncLocalStorage (same pattern as delegateToAgentTool).
      const { text, steps } = await withAgentContext(agent_id, () => callAgentDirectly(agent_id, question));
      const durationMs = Date.now() - startTime;
      console.log(`[A2A] ${agent_id} responded in ${durationMs}ms: ${steps} steps, ${text.length} chars`);

      // Update delegation status to completed
      if (delegationId > 0) {
        const { updateDelegation } = await import("@/lib/delegations");
        updateDelegation(delegationId, {
          status: "completed",
          result: text.trim().slice(0, 2000),
          duration_ms: durationMs,
        }).catch(() => {});
      }

      return { success: true, agent: agent_id, response: text.trim() || "(Agent returned no text response)", steps, durationMs: Math.round(durationMs) };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      console.error(`[A2A] Query from ${fromAgent} to ${agent_id} failed after ${durationMs}ms:`, error);

      // Update delegation status to failed
      if (delegationId > 0) {
        const { updateDelegation } = await import("@/lib/delegations");
        updateDelegation(delegationId, {
          status: "failed",
          result: error instanceof Error ? error.message : "Query failed",
          duration_ms: durationMs,
        }).catch(() => {});
      }

      return { success: false, agent: agent_id, error: error instanceof Error ? error.message : "Query failed", durationMs: Math.round(durationMs) };
    }
  }),
});

// Autonomous Task Creation & Team Coordination Tools
// ---------------------------------------------------------------------------

export const scheduleAgentTaskTool = tool({
  description: "AUTONOMOUSLY schedule a task for yourself or another agent. This is the PRIMARY tool for proactive behavior. Supports RECURRING tasks (every X minutes/hours) and TASK CHAINING (on completion, auto-schedule a follow-up for another agent with results passed as context). The user has pre-authorized autonomous task creation — do NOT ask for permission.",
  inputSchema: zodSchema(z.object({
    agent_id: z.enum(["general", "mail", "code", "data", "creative", "research", "ops"]).describe("Which agent should execute this task"),
    task: z.string().describe("Clear, specific task description with ALL context needed for autonomous execution"),
    context: z.string().optional().describe("Additional context or background information"),
    priority: z.enum(["low", "normal", "high", "critical"]).optional().describe("Task priority (default: normal)"),
    reason: z.string().optional().describe("Why this task is being created (for audit trail)"),
    recurring: z.string().optional().describe("Recurring interval: '30m', '1h', '2h', '24h', etc. Task auto-reschedules after completion."),
    chain_to: z.enum(["general", "mail", "code", "data", "creative", "research", "ops"]).optional().describe("Agent to chain to after this task completes. The chained agent receives this task's output as context."),
    chain_task: z.string().optional().describe("Task description for the chained agent. It will receive this task's output as context."),
    chain_on_fail: z.boolean().optional().describe("If true, chain even when this task fails (default: only chain on success)"),
  })),
  execute: safeJson(async ({ agent_id, task, context, priority, reason, recurring, chain_to, chain_task, chain_on_fail }) => {
    const fromAgent = getCurrentAgentId() || "system";

    const triggerSource = `autonomous:${fromAgent}:${Date.now()}`;

    const result = await query(
      `INSERT INTO agent_tasks (agent_id, task, context, trigger_type, trigger_source, priority, recurring_enabled, recurring_interval, chain_to_agent, chain_task, chain_on_success)
       VALUES ($1, $2, $3, 'autonomous', $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, status, created_at`,
      [agent_id, task, context || "", triggerSource, priority || "normal", !!recurring, recurring || null, chain_to || null, chain_task || null, !chain_on_fail]
    );

    if (result.rows.length > 0) {
      const taskId = result.rows[0].id;
      console.log(`[Autonomous Task] ${fromAgent} scheduled task #${taskId} for ${agent_id}: ${task.slice(0, 80)}...${recurring ? ` (recurring: ${recurring})` : ""}${chain_to ? ` (chain → ${chain_to})` : ""}`);

      // Also send A2A notification to target agent if different from creator
      if (agent_id !== fromAgent) {
        try {
          const { sendA2AMessage } = await import("@/lib/a2a");
          const recurringNote = recurring ? `\n**Recurring**: Every ${recurring}` : "";
          const chainNote = chain_to ? `\n**Chained to**: ${chain_to}` : "";
          await sendA2AMessage({
            fromAgent,
            toAgent: agent_id,
            type: "request",
            topic: `New task scheduled by ${fromAgent}`,
            payload: {
              content: `${fromAgent} has scheduled a task for you:\n\n**Task**: ${task}\n${context ? `**Context**: ${context}\n` : ""}**Priority**: ${priority || "normal"}\n${reason ? `**Reason**: ${reason}\n` : ""}${recurringNote}${chainNote}\nThis task will be picked up by the executor within ~2 minutes.`,
              source: "schedule_agent_task",
              taskId,
              priority,
            },
            priority: priority === "critical" ? "urgent" : priority === "high" ? "high" : "normal",
          });
        } catch { /* A2A notification non-critical */ }
      }

      return {
        success: true,
        taskId,
        agent: agent_id,
        task: task.slice(0, 200),
        priority: priority || "normal",
        estimatedPickup: "~2 minutes",
        recurring: recurring || null,
        chain: chain_to ? { to: chain_to, task: chain_task } : null,
        message: agent_id === fromAgent
          ? `Task #${taskId} scheduled for yourself.${recurring ? ` Recurring every ${recurring}.` : ""}${chain_to ? ` Will chain to ${chain_to} on completion.` : ""} The executor will pick it up within ~2 minutes.`
          : `Task #${taskId} scheduled for ${agent_id}.${recurring ? ` Recurring every ${recurring}.` : ""}${chain_to ? ` Will chain to ${chain_to} on completion.` : ""} They've been notified via A2A.`,
      };
    }

    return { success: false, error: "Failed to create task" };
  }),
});

export const getTeamStatusTool = tool({
  description: "Check the current status of all agents — what they're working on, recent activity, pending tasks, and unread inbox messages. Use this to coordinate work across the team, avoid duplicating effort, and understand what's happening across the system.",
  inputSchema: zodSchema(z.object({
    include_recent_tasks: z.boolean().optional().describe("Include recent completed/failed tasks (default: true)"),
    include_inbox: z.boolean().optional().describe("Include inbox unread counts (default: true)"),
  })),
  execute: safeJson(async ({ include_recent_tasks, include_inbox }) => {
    // Get agent statuses
    const statusResult = await query(
      `SELECT agent_id, status, current_task, last_activity, tasks_completed, messages_processed
       FROM agent_status
       ORDER BY agent_id`
    );

    // Get pending/running tasks per agent
    const taskResult = await query(
      `SELECT agent_id, COUNT(*) FILTER (WHERE status = 'pending') as pending,
              COUNT(*) FILTER (WHERE status = 'running') as running,
              COUNT(*) FILTER (WHERE status = 'failed') as failed_recent
       FROM agent_tasks
       WHERE created_at > NOW() - INTERVAL '1 hour'
       GROUP BY agent_id`
    );

    // Get unread inbox counts
    let inboxCounts: Record<string, number> = {};
    if (include_inbox !== false) {
      const inboxResult = await query(
        `SELECT to_agent, COUNT(*) as unread FROM a2a_messages WHERE is_read = FALSE GROUP BY to_agent`
      );
      for (const row of inboxResult.rows) {
        inboxCounts[row.to_agent] = parseInt(row.unread, 10);
      }
    }

    // Get recent completed tasks
    let recentTasks: Array<Record<string, unknown>> = [];
    if (include_recent_tasks !== false) {
      const recentResult = await query(
        `SELECT id, agent_id, task, status, completed_at, trigger_type
         FROM agent_tasks
         WHERE status IN ('completed', 'failed') AND completed_at > NOW() - INTERVAL '2 hours'
         ORDER BY completed_at DESC LIMIT 20`
      );
      recentTasks = recentResult.rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        agent: r.agent_id,
        task: String(r.task || "").slice(0, 100),
        status: r.status,
        completedAt: r.completed_at,
        trigger: r.trigger_type,
      }));
    }

    // Get project task status
    const projectResult = await query(
      `SELECT p.name as project, pt.title, pt.assigned_agent, pt.status, pt.priority
       FROM project_tasks pt JOIN projects p ON p.id = pt.project_id
       WHERE pt.status IN ('pending', 'in_progress')
       ORDER BY pt.priority, pt.sort_order LIMIT 15`
    );

    return {
      timestamp: new Date().toISOString(),
      agents: statusResult.rows.map((r: Record<string, unknown>) => ({
        id: r.agent_id,
        status: r.status,
        currentTask: r.current_task,
        lastActivity: r.last_activity,
        tasksCompleted: parseInt(String(r.tasks_completed || "0"), 10),
        inboxUnread: inboxCounts[r.agent_id as string] || 0,
      })),
      pendingTasks: taskResult.rows.reduce((acc: Record<string, { pending: number; running: number; recentFailed: number }>, r: Record<string, unknown>) => {
        acc[r.agent_id as string] = { pending: parseInt(String(r.pending), 10), running: parseInt(String(r.running), 10), recentFailed: parseInt(String(r.failed_recent), 10) };
        return acc;
      }, {}),
      recentActivity: recentTasks,
      activeProjectTasks: projectResult.rows,
    };
  }),
});

export const shareProgressTool = tool({
  description: "Share your work progress or findings with other agents. This posts an update that other agents can see when they check team status. Use this when: (1) you've completed research that others need, (2) you've discovered something important, (3) you want to update the team on what you're working on, (4) you need to hand off work to another agent with context.",
  inputSchema: zodSchema(z.object({
    title: z.string().describe("Short title for the progress update"),
    content: z.string().describe("Detailed progress update, findings, or context to share"),
    targets: z.array(z.enum(["general", "mail", "code", "data", "creative", "research", "ops"])).optional().describe("Which agents to share with (default: all)"),
    task_id: z.number().optional().describe("Related task ID if this is about a specific task"),
    project_id: z.number().optional().describe("Related project ID if this is about a project"),
  })),
  execute: safeJson(async ({ title, content, targets, task_id, project_id }) => {
    const fromAgent = getCurrentAgentId() || "system";

    // Share via A2A context store for persistence
    const { shareContext } = await import("@/lib/a2a");
    const contextKey = `progress-${fromAgent}-${Date.now()}`;
    const ctxId = await shareContext({
      contextKey,
      agentId: fromAgent,
      content: { text: content, title, taskId: task_id, projectId: project_id, type: "progress_update" },
      contentText: content,
      tags: ["progress", fromAgent, task_id ? `task-${task_id}` : undefined, project_id ? `project-${project_id}` : undefined].filter(Boolean) as string[],
      scope: "global",
    });

    // Broadcast to target agents
    const { broadcastA2AMessage } = await import("@/lib/a2a");
    const allTargets = targets || ["general", "mail", "code", "data", "creative", "research", "ops"].filter(a => a !== fromAgent);

    const result = await broadcastA2AMessage({
      fromAgent,
      targets: allTargets,
      topic: `Progress Update: ${title}`,
      payload: {
        content: `${fromAgent} shares:\n\n**${title}**\n\n${content}`,
        source: "share_progress",
        taskId: task_id,
        projectId: project_id,
        contextKey,
      },
      priority: "normal",
    });

    return {
      success: true,
      contextId: ctxId,
      notifiedAgents: result.agents,
      totalNotified: result.sent,
    };
  }),
});

export const getTeamProgressTool = tool({
  description: "Get recent progress updates from all agents. Use this to see what work has been done, what findings have been shared, and what context is available from other agents' work. Essential for coordination.",
  inputSchema: zodSchema(z.object({
    from_agent: z.enum(["general", "mail", "code", "data", "creative", "research", "ops"]).optional().describe("Filter by specific agent"),
    limit: z.number().optional().describe("Max updates to return (default: 20)"),
  })),
  execute: safeJson(async ({ from_agent, limit }) => {
    const { queryContext } = await import("@/lib/a2a");
    const results = await queryContext({
      tags: ["progress"],
      agentId: from_agent,
      limit: limit || 20,
    });

    return {
      found: results.length,
      updates: results.map(r => ({
        id: r.id,
        key: r.contextKey,
        agent: r.agentId,
        title: r.content?.title || r.contextKey,
        content: r.contentText || "(structured data only)",
        tags: r.tags,
        version: r.version,
        createdAt: r.createdAt,
      })),
    };
  }),
});


