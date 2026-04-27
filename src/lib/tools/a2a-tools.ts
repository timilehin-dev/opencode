// ---------------------------------------------------------------------------
// A2A Real-Time Communication Tools
// ---------------------------------------------------------------------------
import { z, tool, zodSchema, safeJson, getCurrentAgentId } from "./shared";

// ---------------------------------------------------------------------------
// Phase 4: A2A Real-Time Communication Tools
// ---------------------------------------------------------------------------

export const a2aSendMessageTool = tool({
  description: "Send a direct message to another agent. The target agent will see this in their inbox during their next execution cycle. Use for async requests, status updates, or sharing information that doesn't need an immediate response. Available agents: general, mail, code, data, creative, research, ops.",
  inputSchema: zodSchema(z.object({
    to_agent: z.enum(["general", "mail", "code", "data", "creative", "research", "ops"]).describe("Target agent to send the message to"),
    topic: z.string().describe("Short subject/topic of the message"),
    content: z.string().describe("Full message content with all necessary context"),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional().describe("Message priority (default: normal)"),
    msg_type: z.enum(["request", "context_share", "handoff", "collaboration"]).optional().describe("Type of message (default: request)"),
  })),
  execute: safeJson(async ({ to_agent, topic, content, priority, msg_type }) => {
    const { sendA2AMessage } = await import("@/lib/communication/a2a");
    const msg = await sendA2AMessage({
      fromAgent: getCurrentAgentId(), // Dynamically resolved from chat route / executor
      toAgent: to_agent,
      type: msg_type || "request",
      topic,
      payload: { content, source: "a2a_send_message" },
      priority: priority || "normal",
    });
    if (msg) {
      return { success: true, messageId: msg.id, to: to_agent, topic, priority: msg.priority, timestamp: msg.timestamp };
    }
    return { success: false, error: "Failed to send message" };
  }),
});

export const a2aBroadcastTool = tool({
  description: "Broadcast a message to ALL agents or a specific subset. Use for team-wide announcements, status updates, or sharing results that multiple agents need. The message will appear in each target agent's inbox.",
  inputSchema: zodSchema(z.object({
    topic: z.string().describe("Broadcast topic/subject"),
    content: z.string().describe("Broadcast message content"),
    targets: z.array(z.enum(["general", "mail", "code", "data", "creative", "research", "ops"])).optional().describe("Specific agents to target (default: all agents)"),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional().describe("Priority (default: normal)"),
  })),
  execute: safeJson(async ({ topic, content, targets, priority }) => {
    const { broadcastA2AMessage } = await import("@/lib/communication/a2a");
    const result = await broadcastA2AMessage({
      fromAgent: getCurrentAgentId(), // Dynamically resolved from chat route / executor
      targets,
      topic,
      payload: { content, source: "a2a_broadcast" },
      priority: priority || "normal",
    });
    return { success: true, sentTo: result.agents, totalSent: result.sent };
  }),
});

export const a2aCheckInboxTool = tool({
  description: "Check your A2A inbox for unread messages from other agents. Returns messages sorted by priority (urgent first). Always check your inbox at the start of your execution cycle to see if any agent has sent you tasks or information.",
  inputSchema: zodSchema(z.object({
    agent_id: z.enum(["general", "mail", "code", "data", "creative", "research", "ops"]).describe("Your agent ID — specify which inbox to check"),
    limit: z.number().optional().describe("Max messages to return (default: 20)"),
    mark_as_read: z.boolean().optional().describe("Automatically mark returned messages as read (default: true)"),
  })),
  execute: safeJson(async ({ agent_id, limit, mark_as_read }) => {
    const { getAgentInbox, markMessagesRead } = await import("@/lib/communication/a2a");
    const checkAgent = agent_id || getCurrentAgentId(); // Default to current agent if not specified
    const messages = await getAgentInbox(checkAgent, limit || 20);
    
    // Auto mark as read
    let markedCount = 0;
    if (mark_as_read !== false && messages.length > 0) {
      const ids = messages.map(m => m.id);
      markedCount = await markMessagesRead(checkAgent, ids);
    }

    return {
      unreadCount: messages.length,
      markedRead: markedCount,
      messages: messages.map(m => ({
        id: m.id, from: m.fromAgent, type: m.type,
        topic: m.topic, priority: m.priority,
        content: m.payload?.content || m.payload?.task || "",
        createdAt: m.createdAt,
      })),
    };
  }),
});

export const a2aShareContextTool = tool({
  description: "Share data, findings, or context with other agents for collaboration. The shared context is versioned and can be queried later by any agent with access. Use this when you have research findings, analysis results, or data that other agents need.",
  inputSchema: zodSchema(z.object({
    context_key: z.string().describe("Unique key for this context (e.g., 'project-x-research', 'market-analysis-q2')"),
    content: z.string().describe("Text content to share (findings, data summary, etc.)"),
    structured_data: z.record(z.string(), z.unknown()).optional().describe("Optional structured data as key-value pairs"),
    tags: z.array(z.string()).optional().describe("Tags for easy retrieval (e.g., ['research', 'market', 'q2'])"),
    access_agents: z.array(z.enum(["general", "mail", "code", "data", "creative", "research", "ops"])).optional().describe("Which agents can access this (default: all)"),
    scope: z.enum(["global", "project", "session", "agent"]).optional().describe("Context scope (default: project)"),
    project_id: z.number().optional().describe("Project ID if this context belongs to a project"),
  })),
  execute: safeJson(async ({ context_key, content, structured_data, tags, access_agents, scope, project_id }) => {
    const { shareContext } = await import("@/lib/communication/a2a");
    const ctxId = await shareContext({
      contextKey: context_key,
      agentId: getCurrentAgentId(), // Dynamically resolved from chat route / executor
      content: { text: content, ...structured_data },
      contentText: content,
      tags: tags || [],
      accessAgents: access_agents || [],
      scope: scope || "project",
      projectId: project_id,
    });
    if (ctxId) {
      return { success: true, contextId: ctxId, key: context_key, scope: scope || "project", version: ctxId };
    }
    return { success: false, error: "Failed to store context" };
  }),
});

export const a2aQueryContextTool = tool({
  description: "Query shared context that other agents have stored. Search by key, tags, scope, or project. Returns the latest version of matching contexts. Use this to retrieve research findings, analysis data, or shared results from other agents.",
  inputSchema: zodSchema(z.object({
    context_key: z.string().optional().describe("Exact context key to look up"),
    tags: z.array(z.string()).optional().describe("Filter by tags (returns contexts that match ANY tag)"),
    scope: z.enum(["global", "project", "session", "agent"]).optional().describe("Filter by scope"),
    project_id: z.number().optional().describe("Filter by project ID"),
    limit: z.number().optional().describe("Max results (default: 10)"),
  })),
  execute: safeJson(async ({ context_key, tags, scope, project_id, limit }) => {
    const { queryContext } = await import("@/lib/communication/a2a");
    const results = await queryContext({
      contextKey: context_key,
      scope,
      projectId: project_id,
      tags,
      limit: limit || 10,
    });
    return {
      found: results.length,
      contexts: results.map(r => ({
        id: r.id, key: r.contextKey, agent: r.agentId,
        content: r.contentText || "(structured data only)",
        structuredData: r.content,
        tags: r.tags, scope: r.scope, version: r.version,
        createdAt: r.createdAt,
      })),
    };
  }),
});

export const a2aCollaborateTool = tool({
  description: "Initiate a multi-agent collaboration on a channel. Creates (or reuses) a collaboration channel and posts a message. Other agents can see channel messages in their inbox. Use for complex tasks that need input from multiple agents.",
  inputSchema: zodSchema(z.object({
    channel_name: z.string().describe("Channel name (e.g., 'project-launch-planning')"),
    message: z.string().describe("Your message to the channel"),
    members: z.array(z.enum(["general", "mail", "code", "data", "creative", "research", "ops"])).optional().describe("Channel members (default: all agents)"),
    channel_type: z.enum(["project", "task", "alert", "general", "broadcast"]).optional().describe("Channel type (default: project)"),
    project_id: z.number().optional().describe("Link channel to a project"),
  })),
  execute: safeJson(async ({ channel_name, message, members, channel_type, project_id }) => {
    const { getOrCreateChannel, postToChannel } = await import("@/lib/communication/a2a");
    const allMembers = members || ["general", "mail", "code", "data", "creative", "research", "ops"].filter(a => a !== getCurrentAgentId());
    const channelId = await getOrCreateChannel({
      name: channel_name,
      channelType: channel_type || "project",
      projectId: project_id,
      members: [...allMembers, getCurrentAgentId()], // Include self in channel members
    });
    if (!channelId) return { success: false, error: "Failed to create/get channel" };

    const msgId = await postToChannel(channelId, {
      agentId: getCurrentAgentId(),
      content: message,
      messageType: "message",
    });

    // Also broadcast to members' inboxes
    const { broadcastA2AMessage } = await import("@/lib/communication/a2a");
    await broadcastA2AMessage({
      fromAgent: getCurrentAgentId(),
      targets: allMembers,
      topic: `New message in #${channel_name}`,
      payload: { content: message.slice(0, 500), channelId, source: "a2a_collaborate" },
      priority: "normal",
    });

    return { success: true, channelId, msgId, channel: channel_name, members: allMembers };
  }),
});

