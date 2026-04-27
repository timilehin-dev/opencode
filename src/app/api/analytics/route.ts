// GET /api/analytics
// Returns aggregated real analytics data from Supabase tables.
// Falls back gracefully to empty/zero data if Supabase is unavailable.
import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/schema/supabase";

export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const { searchParams } = new URL(req.url);
  const days = Math.min(Math.max(Number(searchParams.get("days") || 7), 1), 90);

  // If no Supabase, return empty dataset
  if (!supabase) {
    return NextResponse.json({ success: true, data: emptyResponse() });
  }

  const since = new Date(Date.now() - days * 86400000).toISOString();

  try {
    // Run all queries in parallel for performance
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
    ] = await Promise.all([
      // 1. Total messages
      supabase
        .from("analytics_events")
        .select("id", { count: "exact", head: true })
        .eq("type", "chat_message")
        .gte("created_at", since),

      // 2. Total tool calls
      supabase
        .from("analytics_events")
        .select("id", { count: "exact", head: true })
        .eq("type", "tool_call")
        .gte("created_at", since),

      // 3. Messages per agent (from analytics_events)
      supabase
        .from("analytics_events")
        .select("agent_id, agent_name")
        .eq("type", "chat_message")
        .gte("created_at", since),

      // 4. Tool calls per tool name (from agent_activity)
      supabase
        .from("agent_activity")
        .select("tool_name, agent_id, agent_name")
        .gte("created_at", since),

      // 5. Recent activity feed (last 20 from agent_activity)
      supabase
        .from("agent_activity")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20),

      // 6. Agent status overview
      supabase
        .from("agent_status")
        .select("*"),

      // 7. Task completion stats
      supabase
        .from("agent_tasks")
        .select("status"),

      // 8. Automation stats
      supabase
        .from("automations")
        .select("name, enabled, run_count, last_run_at, last_status"),

      // 9. Daily message counts (last N days)
      supabase
        .from("analytics_events")
        .select("created_at")
        .eq("type", "chat_message")
        .gte("created_at", since)
        .order("created_at", { ascending: true }),

      // 10. Active sessions (distinct session_id from conversations where created_at > now - 24h)
      supabase
        .from("conversations")
        .select("session_id")
        .gte("created_at", new Date(Date.now() - 86400000).toISOString()),
    ]);

    // -----------------------------------------------------------------------
    // 1 & 2. Total counts
    // -----------------------------------------------------------------------
    const totalMessages = messagesRes.count ?? 0;
    const totalToolCalls = toolCallsRes.count ?? 0;

    // -----------------------------------------------------------------------
    // 3. Messages per agent
    // -----------------------------------------------------------------------
    const agentMsgMap = new Map<string, { agentId: string; agentName: string; messages: number; toolCalls: number }>();
    if (agentMessagesRes.data) {
      for (const row of agentMessagesRes.data) {
        const id = row.agent_id;
        if (!agentMsgMap.has(id)) {
          agentMsgMap.set(id, { agentId: id, agentName: row.agent_name || id, messages: 0, toolCalls: 0 });
        }
        agentMsgMap.get(id)!.messages++;
      }
    }

    // Also count tool calls per agent from analytics_events (type = 'tool_call')
    const agentToolCallsRes = await supabase
      .from("analytics_events")
      .select("agent_id, agent_name")
      .eq("type", "tool_call")
      .gte("created_at", since);

    if (agentToolCallsRes.data) {
      for (const row of agentToolCallsRes.data) {
        const id = row.agent_id;
        if (!agentMsgMap.has(id)) {
          agentMsgMap.set(id, { agentId: id, agentName: row.agent_name || id, messages: 0, toolCalls: 0 });
        }
        agentMsgMap.get(id)!.toolCalls++;
      }
    }

    const agentUsage = Array.from(agentMsgMap.values())
      .sort((a, b) => b.messages - a.messages);

    // -----------------------------------------------------------------------
    // 4. Tool usage (from agent_activity.tool_name)
    // -----------------------------------------------------------------------
    const toolMap = new Map<string, number>();
    if (agentToolsRes.data) {
      for (const row of agentToolsRes.data) {
        if (row.tool_name) {
          toolMap.set(row.tool_name, (toolMap.get(row.tool_name) || 0) + 1);
        }
      }
    }
    // Also aggregate tool calls from analytics_events data JSONB
    const toolCallsDataRes = await supabase
      .from("analytics_events")
      .select("data")
      .eq("type", "tool_call")
      .gte("created_at", since);

    if (toolCallsDataRes.data) {
      for (const row of toolCallsDataRes.data) {
        const d = row.data as Record<string, unknown> | null;
        if (d?.toolName && typeof d.toolName === "string") {
          toolMap.set(d.toolName, (toolMap.get(d.toolName) || 0) + 1);
        }
      }
    }
    const toolUsage = Array.from(toolMap.entries())
      .map(([toolName, count]) => ({ toolName, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    // -----------------------------------------------------------------------
    // 5. Recent activity feed (agent_activity rows mapped to AnalyticsEvent-like shape)
    // -----------------------------------------------------------------------
    const recentActivity = (activityRes.data || []).map((row) => ({
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
    const agentStatuses = (agentStatusRes.data || []).map((row) => ({
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
    const allTasks = tasksRes.data || [];
    const tasksCompleted = allTasks.filter((t) => t.status === "completed").length;
    const tasksPending = allTasks.filter((t) => t.status === "pending" || t.status === "running").length;
    const tasksFailed = allTasks.filter((t) => t.status === "failed").length;

    // -----------------------------------------------------------------------
    // 8. Automation stats
    // -----------------------------------------------------------------------
    const automationStats = (automationsRes.data || []).map((a) => ({
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
    if (dailyMessagesRes.data) {
      for (const row of dailyMessagesRes.data) {
        const day = row.created_at?.slice(0, 10);
        if (day) {
          dayMap.set(day, (dayMap.get(day) || 0) + 1);
        }
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
      (sessionsRes.data || []).map((r) => r.session_id)
    ).size;

    // -----------------------------------------------------------------------
    // Build hourly heatmap data from analytics_events
    // -----------------------------------------------------------------------
    const hourMap: Record<number, number> = {};
    for (let h = 0; h < 24; h++) hourMap[h] = 0;

    const hourlyRes = await supabase
      .from("analytics_events")
      .select("created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: true });

    if (hourlyRes.data) {
      for (const row of hourlyRes.data) {
        const hour = new Date(row.created_at).getHours();
        hourMap[hour] = (hourMap[hour] || 0) + 1;
      }
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
    console.error("[Analytics API] Error querying Supabase:", err);
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
