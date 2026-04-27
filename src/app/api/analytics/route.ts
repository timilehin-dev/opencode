// GET /api/analytics
// Returns aggregated real analytics data from database tables.
// Falls back gracefully to empty/zero data if the database is unavailable.
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/core/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = Math.min(Math.max(Number(searchParams.get("days") || 7), 1), 90);
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const sessionsSince = new Date(Date.now() - 86400000).toISOString();

  try {
    // Run all independent queries in parallel for performance
    const [
      messagesRes,
      toolCallsRes,
      agentMessagesRes,
      agentToolsRes,
      activityRes,
      agentStatusRes,
      tasksRes,
      automationsRes,
      dailyMessagesRes,
      sessionsRes,
      agentToolCallsRes,
      toolCallsDataRes,
      hourlyRes,
    ] = await Promise.all([
      // 1. Total messages
      query("SELECT count(*)::int as count FROM analytics_events WHERE type = 'chat_message' AND created_at >= $1", [since]),

      // 2. Total tool calls
      query("SELECT count(*)::int as count FROM analytics_events WHERE type = 'tool_call' AND created_at >= $1", [since]),

      // 3. Messages per agent (from analytics_events)
      query("SELECT agent_id, agent_name FROM analytics_events WHERE type = 'chat_message' AND created_at >= $1", [since]),

      // 4. Tool calls per tool name (from agent_activity)
      query("SELECT tool_name, agent_id, agent_name FROM agent_activity WHERE created_at >= $1", [since]),

      // 5. Recent activity feed (last 20 from agent_activity)
      query("SELECT * FROM agent_activity ORDER BY created_at DESC LIMIT 20", []),

      // 6. Agent status overview
      query("SELECT * FROM agent_status", []),

      // 7. Task completion stats
      query("SELECT status FROM agent_tasks", []),

      // 8. Automation stats
      query("SELECT name, enabled, run_count, last_run_at, last_status FROM automations", []),

      // 9. Daily message counts (last N days)
      query("SELECT created_at FROM analytics_events WHERE type = 'chat_message' AND created_at >= $1 ORDER BY created_at ASC", [since]),

      // 10. Active sessions (distinct session_id from conversations where created_at > now - 24h)
      query("SELECT DISTINCT session_id FROM conversations WHERE created_at >= $1", [sessionsSince]),

      // 11. Tool calls per agent (from analytics_events, type = 'tool_call')
      query("SELECT agent_id, agent_name FROM analytics_events WHERE type = 'tool_call' AND created_at >= $1", [since]),

      // 12. Tool calls data from analytics_events for tool name aggregation
      query("SELECT data FROM analytics_events WHERE type = 'tool_call' AND created_at >= $1", [since]),

      // 13. Hourly heatmap data from analytics_events
      query("SELECT created_at FROM analytics_events WHERE created_at >= $1 ORDER BY created_at ASC", [since]),
    ]);

    // -----------------------------------------------------------------------
    // 1 & 2. Total counts
    // -----------------------------------------------------------------------
    const totalMessages = messagesRes.rows[0]?.count ?? 0;
    const totalToolCalls = toolCallsRes.rows[0]?.count ?? 0;

    // -----------------------------------------------------------------------
    // 3. Messages per agent
    // -----------------------------------------------------------------------
    const agentMsgMap = new Map<string, { agentId: string; agentName: string; messages: number; toolCalls: number }>();
    for (const row of agentMessagesRes.rows) {
      const id = row.agent_id;
      if (!agentMsgMap.has(id)) {
        agentMsgMap.set(id, { agentId: id, agentName: row.agent_name || id, messages: 0, toolCalls: 0 });
      }
      agentMsgMap.get(id)!.messages++;
    }

    // Also count tool calls per agent from analytics_events (type = 'tool_call')
    for (const row of agentToolCallsRes.rows) {
      const id = row.agent_id;
      if (!agentMsgMap.has(id)) {
        agentMsgMap.set(id, { agentId: id, agentName: row.agent_name || id, messages: 0, toolCalls: 0 });
      }
      agentMsgMap.get(id)!.toolCalls++;
    }

    const agentUsage = Array.from(agentMsgMap.values())
      .sort((a, b) => b.messages - a.messages);

    // -----------------------------------------------------------------------
    // 4. Tool usage (from agent_activity.tool_name)
    // -----------------------------------------------------------------------
    const toolMap = new Map<string, number>();
    for (const row of agentToolsRes.rows) {
      if (row.tool_name) {
        toolMap.set(row.tool_name, (toolMap.get(row.tool_name) || 0) + 1);
      }
    }
    // Also aggregate tool calls from analytics_events data JSONB
    for (const row of toolCallsDataRes.rows) {
      const d = row.data as Record<string, unknown> | null;
      if (d?.toolName && typeof d.toolName === "string") {
        toolMap.set(d.toolName, (toolMap.get(d.toolName) || 0) + 1);
      }
    }
    const toolUsage = Array.from(toolMap.entries())
      .map(([toolName, count]) => ({ toolName, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    // -----------------------------------------------------------------------
    // 5. Recent activity feed (agent_activity rows mapped to AnalyticsEvent-like shape)
    // -----------------------------------------------------------------------
    const recentActivity = (activityRes.rows || []).map((row) => ({
      id: String(row.id),
      type: mapActivityToEventType(row.action),
      agentId: row.agent_id,
      agentName: row.agent_name || row.agent_id,
      data: {
        detail: row.detail || "",
        toolName: row.tool_name || "",
      },
      createdAt: row.created_at,
    }));

    // -----------------------------------------------------------------------
    // 6. Agent status overview
    // -----------------------------------------------------------------------
    const agentStatuses = (agentStatusRes.rows || []).map((row) => ({
      agentId: row.agent_id,
      status: row.status,
      currentTask: row.current_task,
      tasksCompleted: row.tasks_completed,
      messagesProcessed: row.messages_processed,
      lastActivity: row.last_activity,
    }));

    const activeAgents = agentStatuses.filter((a) => a.status === "busy").length;

    // -----------------------------------------------------------------------
    // 7. Task stats
    // -----------------------------------------------------------------------
    const allTasks = tasksRes.rows || [];
    const tasksCompleted = allTasks.filter((t) => t.status === "completed").length;
    const tasksPending = allTasks.filter((t) => t.status === "pending" || t.status === "running").length;
    const tasksFailed = allTasks.filter((t) => t.status === "failed").length;

    // -----------------------------------------------------------------------
    // 8. Automation stats
    // -----------------------------------------------------------------------
    const automationStats = (automationsRes.rows || []).map((a) => ({
      name: a.name,
      enabled: a.enabled,
      runCount: a.run_count,
      lastRunAt: a.last_run_at,
      lastStatus: a.last_status,
    }));
    const enabledAutomations = automationStats.filter((a) => a.enabled).length;
    const totalAutomationRuns = automationStats.reduce((sum, a) => sum + (a.runCount || 0), 0);

    // -----------------------------------------------------------------------
    // 9. Daily message counts
    // -----------------------------------------------------------------------
    const dayMap = new Map<string, number>();
    for (const row of dailyMessagesRes.rows) {
      const day = row.created_at?.slice(0, 10);
      if (day) {
        dayMap.set(day, (dayMap.get(day) || 0) + 1);
      }
    }
    // Fill in missing days
    const dailyMessageCounts: { date: string; count: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      dailyMessageCounts.push({ date: key, count: dayMap.get(key) || 0 });
    }

    // -----------------------------------------------------------------------
    // 10. Active sessions
    // -----------------------------------------------------------------------
    const activeSessions = new Set(
      (sessionsRes.rows || []).map((r) => r.session_id)
    ).size;

    // -----------------------------------------------------------------------
    // Build hourly heatmap data from analytics_events
    // -----------------------------------------------------------------------
    const hourMap: Record<number, number> = {};
    for (let h = 0; h < 24; h++) hourMap[h] = 0;

    for (const row of hourlyRes.rows) {
      const hour = new Date(row.created_at).getHours();
      hourMap[hour] = (hourMap[hour] || 0) + 1;
    }

    return NextResponse.json({
      success: true,
      data: {
        totalMessages,
        totalToolCalls,
        activeAgents,
        activeSessions,
        agentUsage,
        toolUsage,
        recentActivity,
        agentStatuses,
        tasks: {
          total: allTasks.length,
          completed: tasksCompleted,
          pending: tasksPending,
          failed: tasksFailed,
        },
        automations: {
          total: automationStats.length,
          enabled: enabledAutomations,
          totalRuns: totalAutomationRuns,
          list: automationStats,
        },
        dailyMessageCounts,
        hourlyData: hourMap,
      },
    });
  } catch (err) {
    console.error("[Analytics API] Error querying database:", err);
    return NextResponse.json({ success: true, data: emptyResponse() });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapActivityToEventType(action: string): string {
  const lower = (action || "").toLowerCase();
  if (lower.includes("chat") || lower.includes("message")) return "chat_message";
  if (lower.includes("tool")) return "tool_call";
  if (lower.includes("switch") || lower.includes("delegate")) return "agent_switch";
  if (lower.includes("page") || lower.includes("view") || lower.includes("navigate")) return "page_view";
  if (lower.includes("automation") || lower.includes("auto")) return "automation_run";
  return "chat_message"; // Default fallback
}

function emptyResponse() {
  const dailyMessageCounts: { date: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    dailyMessageCounts.push({ date: d.toISOString().slice(0, 10), count: 0 });
  }
  const hourlyData: Record<number, number> = {};
  for (let h = 0; h < 24; h++) hourlyData[h] = 0;

  return {
    totalMessages: 0,
    totalToolCalls: 0,
    activeAgents: 0,
    activeSessions: 0,
    agentUsage: [],
    toolUsage: [],
    recentActivity: [],
    agentStatuses: [],
    tasks: { total: 0, completed: 0, pending: 0, failed: 0 },
    automations: { total: 0, enabled: 0, totalRuns: 0, list: [] },
    dailyMessageCounts,
    hourlyData,
  };
}
