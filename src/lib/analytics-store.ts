// ---------------------------------------------------------------------------
// Client-Side Analytics Store — localStorage-backed analytics tracking
//
// Designed for Vercel serverless where SQLite is unavailable.
// Data persists in the browser across sessions.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnalyticsEvent {
  id: string;
  type: "chat_message" | "tool_call" | "agent_switch" | "page_view" | "automation_run";
  agentId: string;
  agentName: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface AnalyticsSummary {
  totalMessages: number;
  totalToolCalls: number;
  agentUsage: {
    agentId: string;
    agentName: string;
    messages: number;
    toolCalls: number;
  }[];
  recentActivity: AnalyticsEvent[];
  dailyMessageCounts: { date: string; count: number }[];
  toolUsage: { toolName: string; count: number }[];
}

// ---------------------------------------------------------------------------
// Storage constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "claw-analytics-events";
const MAX_EVENTS = 5000; // Keep last 5000 events to avoid localStorage bloat

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function loadEvents(): AnalyticsEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveEvents(events: AnalyticsEvent[]): void {
  if (typeof window === "undefined") return;
  try {
    // Keep only the most recent events
    const trimmed = events.length > MAX_EVENTS ? events.slice(-MAX_EVENTS) : events;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    // localStorage might be full — clear old events and retry
    console.warn("[Analytics] localStorage full, trimming:", e);
    try {
      const trimmed = events.slice(-1000);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      console.error("[Analytics] Cannot save to localStorage");
    }
  }
}

// ---------------------------------------------------------------------------
// Public API — Event Tracking
// ---------------------------------------------------------------------------

/** Track a single analytics event. Non-blocking, safe to call anywhere. */
export function trackEvent(event: {
  type: string;
  agentId: string;
  agentName?: string;
  data?: Record<string, unknown>;
}): void {
  try {
    const events = loadEvents();
    events.push({
      id: generateId(),
      type: event.type as AnalyticsEvent["type"],
      agentId: event.agentId,
      agentName: event.agentName || event.agentId,
      data: event.data || {},
      createdAt: new Date().toISOString(),
    });
    saveEvents(events);
  } catch {
    // Never let analytics tracking break the app
  }
}

/** Track a chat message event (convenience wrapper). */
export function trackChatMessage(agentId: string, agentName: string, messageLength: number): void {
  trackEvent({
    type: "chat_message",
    agentId,
    agentName,
    data: { messageLength },
  });
}

/** Track a tool call event (convenience wrapper). */
export function trackToolCall(agentId: string, agentName: string, toolName: string): void {
  trackEvent({
    type: "tool_call",
    agentId,
    agentName,
    data: { toolName },
  });
}

/** Track an agent switch event. */
export function trackAgentSwitch(fromAgentId: string, toAgentId: string, toAgentName: string): void {
  trackEvent({
    type: "agent_switch",
    agentId: toAgentId,
    agentName: toAgentName,
    data: { fromAgentId },
  });
}

// ---------------------------------------------------------------------------
// Public API — Queries
// ---------------------------------------------------------------------------

/** Get aggregated analytics summary for the last N days. */
export function getAnalyticsSummary(days: number = 7): AnalyticsSummary {
  const events = loadEvents();
  const since = new Date(Date.now() - days * 86400000).toISOString();

  // Filter to relevant period
  const filtered = events.filter((e) => e.createdAt >= since);

  // Totals
  const totalMessages = filtered.filter((e) => e.type === "chat_message").length;
  const totalToolCalls = filtered.filter((e) => e.type === "tool_call").length;

  // Agent usage breakdown
  const agentMap = new Map<string, { agentId: string; agentName: string; messages: number; toolCalls: number }>();
  for (const event of filtered) {
    if (event.type !== "chat_message" && event.type !== "tool_call") continue;
    if (!agentMap.has(event.agentId)) {
      agentMap.set(event.agentId, { agentId: event.agentId, agentName: event.agentName, messages: 0, toolCalls: 0 });
    }
    const entry = agentMap.get(event.agentId)!;
    if (event.type === "chat_message") entry.messages++;
    if (event.type === "tool_call") entry.toolCalls++;
  }
  const agentUsage = Array.from(agentMap.values()).sort((a, b) => b.messages - a.messages);

  // Recent activity (last 20)
  const recentActivity = events.slice(-20).reverse();

  // Daily message counts
  const dayMap = new Map<string, number>();
  for (const event of filtered) {
    if (event.type !== "chat_message") continue;
    const day = event.createdAt.slice(0, 10); // "YYYY-MM-DD"
    dayMap.set(day, (dayMap.get(day) || 0) + 1);
  }
  const dailyMessageCounts = Array.from(dayMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Tool usage
  const toolMap = new Map<string, number>();
  for (const event of filtered) {
    if (event.type !== "tool_call") continue;
    const toolName = (event.data.toolName as string) || "unknown";
    toolMap.set(toolName, (toolMap.get(toolName) || 0) + 1);
  }
  const toolUsage = Array.from(toolMap.entries())
    .map(([toolName, count]) => ({ toolName, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  return { totalMessages, totalToolCalls, agentUsage, recentActivity, dailyMessageCounts, toolUsage };
}

/** Clear all analytics data. */
export function clearAnalytics(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
