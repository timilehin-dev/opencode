// ---------------------------------------------------------------------------
// Phase 5: Inter-Agent Initiation Tools
// ---------------------------------------------------------------------------
// These tools enable agents to PROACTIVELY initiate contact with other agents
// — not just respond to user requests or pick up assigned tasks. Each
// initiation is tracked in the `a2a_initiations` table for audit and
// autonomous self-improvement analysis.
// ---------------------------------------------------------------------------

import { z, tool, zodSchema, safeJson, query, getCurrentAgentId } from "./shared";

const VALID_AGENTS = ["general", "mail", "code", "data", "creative", "research", "ops"] as const;
const AgentEnum = z.enum(VALID_AGENTS);

// ---------------------------------------------------------------------------
// Helper: log an initiation to the DB
// ---------------------------------------------------------------------------
async function logInitiation(params: {
  initiatorAgent: string;
  targetAgent: string;
  type: string;
  subject: string;
  context: Record<string, unknown>;
  urgency: string;
  relatedTaskId?: number;
}) {
  try {
    await query(
      `INSERT INTO a2a_initiations (initiator_agent, target_agent, initiation_type, subject, context, urgency, status, related_task_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'delivered', $7)
       RETURNING id`,
      [
        params.initiatorAgent,
        params.targetAgent,
        params.type,
        params.subject,
        JSON.stringify(params.context),
        params.urgency,
        params.relatedTaskId ?? null,
      ]
    );
  } catch {
    // Initiation logging is non-critical
  }
}

// ---------------------------------------------------------------------------
// 1. initiate_contact — Proactively reach out to another agent
// ---------------------------------------------------------------------------
export const initiateContactTool = tool({
  description: `PROACTIVELY reach out to another agent to share information, propose collaboration, or coordinate work. This is NOT a task delegation — it's an informational or collaborative outreach. The target agent sees this in their inbox during their next execution cycle.

Use this when:
- You've completed work that another agent needs to know about
- You want to propose working together on something
- You've discovered something relevant to another agent's domain
- You need to coordinate timing or sequencing of work

For actual task delegation, use schedule_agent_task or query_agent instead.`,
  inputSchema: zodSchema(z.object({
    to_agent: AgentEnum.describe("Target agent to contact"),
    subject: z.string().describe("Short subject line for the contact"),
    message: z.string().describe("Full message content with all relevant context and information"),
    urgency: z.enum(["low", "normal", "high", "critical"]).optional().describe("Urgency level (default: normal)"),
    propose_collaboration: z.boolean().optional().describe("If true, frames this as a collaboration proposal"),
    related_task_id: z.number().optional().describe("Related task ID if this relates to a specific task"),
  })),
  execute: safeJson(async ({ to_agent, subject, message, urgency, propose_collaboration, related_task_id }) => {
    const fromAgent = getCurrentAgentId();
    const msgType = propose_collaboration ? "collaboration" : "context_share";

    // Log the initiation
    await logInitiation({
      initiatorAgent: fromAgent,
      targetAgent: to_agent,
      type: "contact",
      subject,
      context: { message: message.slice(0, 1000), propose_collaboration, source: "initiate_contact" },
      urgency: urgency || "normal",
      relatedTaskId: related_task_id,
    });

    // Send A2A message
    const { sendA2AMessage } = await import("@/lib/a2a");
    const collabNote = propose_collaboration ? "\n\n**This is a collaboration proposal — please respond if interested.**" : "";
    const msg = await sendA2AMessage({
      fromAgent,
      toAgent: to_agent,
      type: msgType,
      topic: `${propose_collaboration ? "[Collaboration Proposal] " : ""}${subject}`,
      payload: {
        content: `${fromAgent} is reaching out:\n\n**Subject**: ${subject}\n\n${message}${collabNote}`,
        source: "initiate_contact",
      },
      priority: urgency === "critical" ? "urgent" : urgency || "normal",
    });

    return {
      success: !!msg,
      messageId: msg?.id,
      to: to_agent,
      subject,
      urgency: urgency || "normal",
      type: propose_collaboration ? "collaboration_proposal" : "informational",
      message: `Contact initiated with ${to_agent}. They will see this in their next execution cycle.`,
    };
  }),
});

// ---------------------------------------------------------------------------
// 2. request_help — Structured help request to another agent
// ---------------------------------------------------------------------------
export const requestHelpTool = tool({
  description: `Request HELP from another specialist agent when you're stuck, need expertise you don't have, or encounter a problem outside your domain. This is a STRUCTURED help request — you explain the problem, what you've already tried, and what specific help you need.

Use this when:
- You've tried to solve something and hit a wall
- A task requires expertise or tools from another agent's domain
- You're encountering errors you can't resolve
- You need a second opinion or review

The target agent receives full context (problem + what you tried + what you need) and can respond with advice, take over the task, or collaborate.`,
  inputSchema: zodSchema(z.object({
    from_agent: AgentEnum.describe("Your agent ID (who needs help)"),
    to_agent: AgentEnum.describe("The specialist agent to ask for help"),
    problem: z.string().describe("Clear description of the problem or blocker"),
    what_tried: z.string().describe("What you've already tried to solve this"),
    what_needed: z.string().describe("Specifically what help you need (advice, takeover, review, etc.)"),
    urgency: z.enum(["low", "normal", "high", "critical"]).optional().describe("Urgency level (default: high — help requests are usually important)"),
    related_task_id: z.number().optional().describe("Related task ID if this relates to a specific task"),
    context_data: z.string().optional().describe("Any additional context data (error logs, code snippets, etc.)"),
  })),
  execute: safeJson(async ({ from_agent, to_agent, problem, what_tried, what_needed, urgency, related_task_id, context_data }) => {
    const effectiveFrom = from_agent || getCurrentAgentId();
    const effectiveUrgency = urgency || "high";

    // Log the initiation
    await logInitiation({
      initiatorAgent: effectiveFrom,
      targetAgent: to_agent,
      type: "help_request",
      subject: `Help request: ${problem.slice(0, 100)}`,
      context: { problem, what_tried, what_needed, context_data: context_data?.slice(0, 2000) },
      urgency: effectiveUrgency,
      relatedTaskId: related_task_id,
    });

    // Send A2A message with structured help request
    const { sendA2AMessage } = await import("@/lib/a2a");
    const contextSection = context_data ? `\n\n**Additional Context:**\n\`\`\`\n${context_data.slice(0, 2000)}\n\`\`\`` : "";
    const msg = await sendA2AMessage({
      fromAgent: effectiveFrom,
      toAgent: to_agent,
      type: "request",
      topic: `[HELP REQUEST] ${problem.slice(0, 80)}`,
      payload: {
        content: `${effectiveFrom} is requesting your help:\n\n**Problem:** ${problem}\n\n**What I've Already Tried:** ${what_tried}\n\n**What I Need:** ${what_needed}\n\n**Urgency:** ${effectiveUrgency.toUpperCase()}${contextSection}\n\nPlease respond with advice, take over the task, or suggest a collaboration approach.`,
        source: "request_help",
      },
      priority: effectiveUrgency === "critical" ? "urgent" : effectiveUrgency,
    });

    return {
      success: !!msg,
      messageId: msg?.id,
      from: effectiveFrom,
      to: to_agent,
      urgency: effectiveUrgency,
      message: `Help request sent to ${to_agent}. Problem: ${problem.slice(0, 100)}. They will see this in their next execution cycle.`,
    };
  }),
});

// ---------------------------------------------------------------------------
// 3. offer_assistance — Proactively offer help to another agent
// ---------------------------------------------------------------------------
export const offerAssistanceTool = tool({
  description: `PROACTIVELY OFFER help to another agent based on what you've observed or know. Use this when you notice another agent might need your expertise, or when you have relevant information that could help them with their current work.

Use this when:
- You've observed (via observe_agent) that another agent is struggling
- You have expertise or data relevant to another agent's current task
- You've completed work that unblocks or assists another agent
- You notice a pattern or issue another agent might not see

This creates a tracked offer that the target agent can accept or decline.`,
  inputSchema: zodSchema(z.object({
    to_agent: AgentEnum.describe("Agent to offer assistance to"),
    what_i_can_help: z.string().describe("Specifically what you can help with"),
    why_relevant: z.string().describe("Why this help is relevant (what you observed, what prompted this offer)"),
    my_expertise: z.string().optional().describe("Your relevant expertise or tools for this help"),
    related_task_id: z.number().optional().describe("Related task ID if offering help on a specific task"),
  })),
  execute: safeJson(async ({ to_agent, what_i_can_help, why_relevant, my_expertise, related_task_id }) => {
    const fromAgent = getCurrentAgentId();

    // Log the initiation
    await logInitiation({
      initiatorAgent: fromAgent,
      targetAgent: to_agent,
      type: "assistance_offer",
      subject: `Assistance offer: ${what_i_can_help.slice(0, 100)}`,
      context: { what_i_can_help, why_relevant, my_expertise },
      urgency: "normal",
      relatedTaskId: related_task_id,
    });

    // Send A2A message
    const { sendA2AMessage } = await import("@/lib/a2a");
    const expertiseSection = my_expertise ? `\n**My Relevant Expertise:** ${my_expertise}` : "";
    const msg = await sendA2AMessage({
      fromAgent,
      toAgent: to_agent,
      type: "collaboration",
      topic: `[ASSISTANCE OFFER] ${what_i_can_help.slice(0, 80)}`,
      payload: {
        content: `${fromAgent} is offering assistance:\n\n**What I Can Help With:** ${what_i_can_help}\n\n**Why This Is Relevant:** ${why_relevant}${expertiseSection}\n\nFeel free to accept by replying to this message or using query_agent/${fromAgent} if you need immediate synchronous help.`,
        source: "offer_assistance",
      },
      priority: "normal",
    });

    return {
      success: !!msg,
      messageId: msg?.id,
      from: fromAgent,
      to: to_agent,
      message: `Assistance offer sent to ${to_agent}: ${what_i_can_help.slice(0, 80)}.`,
    };
  }),
});

// ---------------------------------------------------------------------------
// 4. observe_agent — See what another agent has been doing
// ---------------------------------------------------------------------------
export const observeAgentTool = tool({
  description: `OBSERVE what another agent has been doing recently. Returns their recent tasks, A2A messages (sent and received), activity log, and current status. Use this BEFORE initiating contact to make informed decisions about when and how to reach out.

Returns:
- Current status and what they're working on
- Recent completed/failed tasks (last 24h)
- Recent A2A messages sent and received
- Recent activity log entries
- Pending tasks in their queue`,
  inputSchema: zodSchema(z.object({
    agent_id: AgentEnum.describe("The agent to observe"),
    include_tasks: z.boolean().optional().describe("Include recent tasks (default: true)"),
    include_messages: z.boolean().optional().describe("Include A2A messages (default: true)"),
    include_activity: z.boolean().optional().describe("Include activity log (default: true)"),
    hours_back: z.number().optional().describe("How many hours back to look (default: 24)"),
  })),
  execute: safeJson(async ({ agent_id, include_tasks, include_messages, include_activity, hours_back }) => {
    const hours = hours_back || 24;
    const since = `NOW() - INTERVAL '${hours} hours'`;
    const result: Record<string, unknown> = { agent: agent_id, observedAt: new Date().toISOString(), hoursBack: hours };

    // Current status
    const statusResult = await query(
      `SELECT agent_id, status, current_task, last_activity, tasks_completed, messages_processed
       FROM agent_status WHERE agent_id = $1`,
      [agent_id]
    );
    result.currentStatus = statusResult.rows.length > 0 ? statusResult.rows[0] : { status: "unknown" };

    // Pending/running tasks
    const queueResult = await query(
      `SELECT id, task, status, priority, trigger_type, created_at, attempts, max_attempts
       FROM agent_tasks
       WHERE agent_id = $1 AND status IN ('pending', 'running', 'queued')
       ORDER BY priority, created_at ASC`,
      [agent_id]
    );
    result.pendingTasks = queueResult.rows.map((r: Record<string, unknown>) => ({
      id: r.id, task: String(r.task || "").slice(0, 150),
      status: r.status, priority: r.priority,
      trigger: r.trigger_type, createdAt: r.created_at,
      attempts: r.attempts, maxAttempts: r.max_attempts,
    }));

    // Recent tasks (completed/failed)
    if (include_tasks !== false) {
      const tasksResult = await query(
        `SELECT id, task, status, priority, trigger_type, result, error, completed_at, started_at, duration_ms
         FROM agent_tasks
         WHERE agent_id = $1 AND completed_at > ${since}
         ORDER BY completed_at DESC LIMIT 20`,
        [agent_id]
      );
      result.recentTasks = tasksResult.rows.map((r: Record<string, unknown>) => ({
        id: r.id, task: String(r.task || "").slice(0, 150),
        status: r.status, priority: r.priority, trigger: r.trigger_type,
        result: r.result ? String(r.result).slice(0, 200) : null,
        error: r.error ? String(r.error).slice(0, 200) : null,
        completedAt: r.completed_at, durationMs: r.duration_ms,
      }));
    }

    // Recent A2A messages
    if (include_messages !== false) {
      const msgResult = await query(
        `SELECT id, from_agent, to_agent, type, topic, priority, is_read, created_at,
                payload->>'content' as content_preview
         FROM a2a_messages
         WHERE (from_agent = $1 OR to_agent = $1) AND created_at > ${since}
         ORDER BY created_at DESC LIMIT 20`,
        [agent_id]
      );
      result.recentMessages = msgResult.rows.map((r: Record<string, unknown>) => ({
        id: r.id, from: r.from_agent, to: r.to_agent,
        type: r.type, topic: r.topic, priority: r.priority,
        isRead: r.is_read, createdAt: r.created_at,
        preview: r.content_preview ? String(r.content_preview).slice(0, 150) : null,
      }));
    }

    // Activity log
    if (include_activity !== false) {
      const actResult = await query(
        `SELECT action, details, tool_used, created_at
         FROM agent_activity
         WHERE agent_id = $1 AND created_at > ${since}
         ORDER BY created_at DESC LIMIT 15`,
        [agent_id]
      );
      result.recentActivity = actResult.rows.map((r: Record<string, unknown>) => ({
        action: r.action, tool: r.tool_used,
        details: r.details ? String(r.details).slice(0, 150) : null,
        createdAt: r.created_at,
      }));
    }

    // Project tasks they're assigned to
    const projResult = await query(
      `SELECT pt.id, p.name as project, pt.title, pt.status, pt.priority, pt.depends_on
       FROM project_tasks pt JOIN projects p ON p.id = pt.project_id
       WHERE pt.assigned_agent = $1 AND pt.status IN ('pending', 'in_progress', 'blocked')
       ORDER BY pt.priority, pt.sort_order LIMIT 10`,
      [agent_id]
    );
    result.activeProjectTasks = projResult.rows;

    return result;
  }),
});

// ---------------------------------------------------------------------------
// 5. escalate_to_chief — Escalate issues to the General agent
// ---------------------------------------------------------------------------
export const escalateToChiefTool = tool({
  description: `ESCALATE an issue to the General (Chief Orchestrator) agent for decision-making, intervention, or user notification. Use this when:
- A task has failed multiple times and needs human attention
- You've discovered a critical issue that requires immediate action
- You need a decision that's above your authority level
- A blocker exists that no specialist agent can resolve independently
- Something urgent needs to be communicated to the user

The General agent will assess the escalation and either: take action directly, delegate to the right specialist, or notify the user. The escalation is tracked in the a2a_initiations table for audit.`,
  inputSchema: zodSchema(z.object({
    issue: z.string().describe("Clear description of the issue being escalated"),
    severity: z.enum(["low", "medium", "high", "critical"]).describe("How severe is this issue"),
    impact: z.string().describe("What is the impact of this issue (what's affected, who's affected)"),
    what_tried: z.string().optional().describe("What you've already tried to resolve this"),
    recommended_action: z.string().optional().describe("What you think should be done (for the chief's reference)"),
    notify_user: z.boolean().optional().describe("If true, also create a proactive notification for the user (default: true for critical/high, false otherwise)"),
    related_task_id: z.number().optional().describe("Related task ID if this relates to a specific task"),
  })),
  execute: safeJson(async ({ issue, severity, impact, what_tried, recommended_action, notify_user, related_task_id }) => {
    const fromAgent = getCurrentAgentId();
    const shouldNotifyUser = notify_user !== undefined ? notify_user : (severity === "critical" || severity === "high");

    // Log the initiation
    await logInitiation({
      initiatorAgent: fromAgent,
      targetAgent: "general",
      type: "escalation",
      subject: `[ESCALATION - ${severity.toUpperCase()}] ${issue.slice(0, 100)}`,
      context: { issue, impact, what_tried, recommended_action, severity },
      urgency: severity === "critical" ? "critical" : severity === "high" ? "high" : "normal",
      relatedTaskId: related_task_id,
    });

    // Send A2A message to General with full escalation context
    const { sendA2AMessage } = await import("@/lib/a2a");
    const triedSection = what_tried ? `\n**What ${fromAgent} Already Tried:** ${what_tried}` : "";
    const recommendationSection = recommended_action ? `\n**Recommended Action:** ${recommended_action}` : "";
    const msg = await sendA2AMessage({
      fromAgent,
      toAgent: "general",
      type: "request",
      topic: `[ESCALATION - ${severity.toUpperCase()}] ${issue.slice(0, 80)}`,
      payload: {
        content: `${fromAgent} is escalating an issue:\n\n**Issue:** ${issue}\n\n**Severity:** ${severity.toUpperCase()}\n\n**Impact:** ${impact}${triedSection}${recommendationSection}\n\n**Escalated by:** ${fromAgent}\n**Related Task ID:** ${related_task_id || "N/A"}\n\nPlease assess and take appropriate action (delegate, resolve, or notify user).${shouldNotifyUser ? "\n\n**User notification requested.**" : ""}`,
        source: "escalate_to_chief",
      },
      priority: severity === "critical" ? "urgent" : severity === "high" ? "high" : "normal",
    });

    // Create proactive notification for the user if requested
    if (shouldNotifyUser) {
      try {
        await query(
          `INSERT INTO proactive_notifications (type, title, message, severity, source_agent, related_task_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            "escalation",
            `Escalation from ${fromAgent}: ${issue.slice(0, 80)}`,
            `**Agent:** ${fromAgent}\n**Severity:** ${severity.toUpperCase()}\n**Issue:** ${issue}\n**Impact:** ${impact}${triedSection}${recommendationSection}`,
            severity,
            fromAgent,
            related_task_id ?? null,
          ]
        );
      } catch {
        // Notification non-critical
      }
    }

    return {
      success: !!msg,
      messageId: msg?.id,
      severity,
      from: fromAgent,
      escalatedTo: "general",
      userNotified: shouldNotifyUser,
      message: `Issue escalated to General with ${severity.toUpperCase()} severity.${shouldNotifyUser ? " User has been notified." : ""} The chief will assess and respond in the next execution cycle.`,
    };
  }),
});
