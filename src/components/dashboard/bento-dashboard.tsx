"use client";

import { useState, useEffect, useMemo, Suspense, lazy, useCallback, useRef } from "react";
import Link from "next/link";
import { useDashboardStream } from "@/hooks/use-dashboard-stream";
import { AGENT_MAP, AGENT_LIST, getAgentMeta } from "@/lib/agent/agent-map";
import type { ServiceStatus } from "@/lib/types";
import type { ActivityEventView, AgentTaskView } from "@/hooks/use-dashboard-stream";
import { cn } from "@/lib/core/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/context/toast-context";
import {
  MessageSquare,
  Wrench,
  ListTodo,
  Users,
  Zap,
  Clock,
  TrendingUp,
  Send,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Activity,
  Bot,
  ArrowRight,
  Sparkles,
  Workflow,
  Brain,
  Loader2,
} from "lucide-react";

// Lazy-load chat
const ChatView = lazy(() =>
  import("@/components/dashboard/chat-view").then((m) => ({
    default: m.ChatView,
  }))
);

// Lazy-load system intelligence
const SystemIntelligenceCard = lazy(() =>
  import("@/components/dashboard/system-intelligence").then((m) => ({
    default: m.SystemIntelligenceCard,
  }))
);

// ---------------------------------------------------------------------------
// Service metadata
// ---------------------------------------------------------------------------

const SERVICE_META: {
  key: keyof ServiceStatus;
  label: string;
  icon: string;
  color: string;
}[] = [
  { key: "gmail", label: "Gmail", icon: "📧", color: "#EA4335" },
  { key: "github", label: "GitHub", icon: "🐙", color: "#161b22" },
  { key: "googlecalendar", label: "Calendar", icon: "📅", color: "#4285F4" },
  { key: "googledrive", label: "Drive", icon: "💾", color: "#0066DA" },
  { key: "googlesheets", label: "Sheets", icon: "📊", color: "#0F9D58" },
  { key: "googledocs", label: "Docs", icon: "📝", color: "#4285F4" },
  { key: "vercel", label: "Vercel", icon: "⚡", color: "#1a1a1a" },
];

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatTimeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Agent Crew Card — shows all 7 agents with status
// ---------------------------------------------------------------------------

const AGENT_CAPABILITIES: Record<string, { role: string; tools: number; specialties: string[] }> = {
  general: { role: "Orchestrator", tools: 140, specialties: ["Multi-agent coordination", "Task delegation", "System monitoring"] },
  mail: { role: "Communication", tools: 24, specialties: ["Email management", "Calendar scheduling", "Contact lookup"] },
  code: { role: "Engineering", tools: 94, specialties: ["Code generation", "GitHub operations", "Vercel deployments"] },
  data: { role: "Analytics", tools: 28, specialties: ["Data analysis", "Spreadsheet ops", "File processing"] },
  creative: { role: "Design", tools: 18, specialties: ["Image generation", "Content creation", "Design assets"] },
  research: { role: "Intelligence", tools: 22, specialties: ["Web research", "Document analysis", "Knowledge synthesis"] },
  ops: { role: "Operations", tools: 20, specialties: ["Automation", "Monitoring", "System health"] },
};

function AgentCrewCard({
  agentStatuses,
  tasks,
  selectedAgent,
  onAgentClick,
}: {
  agentStatuses: ReturnType<typeof useDashboardStream>["agentStatuses"];
  tasks: AgentTaskView[];
  selectedAgent: string | null;
  onAgentClick: (agentId: string) => void;
}) {
  const { success, error } = useToast();
  const [quickTask, setQuickTask] = useState("");
  const [dispatching, setDispatching] = useState(false);
  const dispatchingRef = useRef(false);

  const agentStats = useMemo(() => {
    const stats: Record<
      string,
      { active: number; completed: number; failed: number; lastAction: string | null }
    > = {};
    for (const agent of AGENT_LIST) {
      stats[agent.id] = { active: 0, completed: 0, failed: 0, lastAction: null };
    }
    for (const task of tasks) {
      if (!stats[task.agent_id]) continue;
      if (task.status === "pending" || task.status === "running")
        stats[task.agent_id].active++;
      if (task.status === "completed") stats[task.agent_id].completed++;
      if (task.status === "failed") stats[task.agent_id].failed++;
    }
    for (const status of agentStatuses) {
      if (stats[status.id]?.lastAction === null && status.lastActivity) {
        stats[status.id].lastAction = status.lastActivity;
      }
    }
    return stats;
  }, [agentStatuses, tasks]);

  const statusFromSSE = useMemo(() => {
    const map: Record<string, { status: string; tasksCompleted: number; messagesProcessed: number }> = {};
    for (const s of agentStatuses) map[s.id] = { status: s.status, tasksCompleted: s.tasksCompleted, messagesProcessed: s.messagesProcessed };
    return map;
  }, [agentStatuses]);

  const handleQuickDispatch = async () => {
    if (!selectedAgent || !quickTask.trim() || dispatchingRef.current) return;
    dispatchingRef.current = true;
    setDispatching(true);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dispatch", agentId: selectedAgent, task: quickTask.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        success(`Task dispatched to ${getAgentMeta(selectedAgent).emoji} ${getAgentMeta(selectedAgent).name}`);
        setQuickTask("");
      } else {
        error(json.error || "Failed to dispatch task");
      }
    } catch {
      error("Network error — could not dispatch task");
    }
    setDispatching(false);
    dispatchingRef.current = false;
  };

  const expandedAgent = selectedAgent ? getAgentMeta(selectedAgent) : null;
  const expandedStats = selectedAgent ? agentStats[selectedAgent] : null;
  const expandedStatus = selectedAgent ? statusFromSSE[selectedAgent] : null;
  const expandedCaps = selectedAgent ? AGENT_CAPABILITIES[selectedAgent] : null;

  return (
    <div className="bento-card flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Agent Crew</h3>
        <span className="text-[10px] font-medium text-muted-foreground">
          {agentStatuses.filter((s) => s.status === "busy").length} active
        </span>
      </div>

      {/* Expanded Agent Detail */}
      {expandedAgent && expandedStats && expandedCaps && (
        <div className="mb-3 p-3 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-base"
                style={{ backgroundColor: `${expandedAgent.color}20`, boxShadow: `0 0 12px ${expandedAgent.color}30` }}
              >
                {expandedAgent.emoji}
              </div>
              <div>
                <p className="text-xs font-bold text-foreground">{expandedAgent.name}</p>
                <p className="text-[10px] text-muted-foreground">{expandedCaps.role} · {expandedCaps.tools} tools</p>
              </div>
            </div>
            <button
              onClick={() => selectedAgent && onAgentClick(selectedAgent)}
              className="p-1 rounded-md hover:bg-muted transition-colors"
            >
              <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center py-1.5 rounded-lg bg-card/60">
              <div className="text-sm font-bold text-foreground">{expandedStatus?.tasksCompleted ?? 0}</div>
              <div className="text-[9px] text-muted-foreground">Tasks</div>
            </div>
            <div className="text-center py-1.5 rounded-lg bg-card/60">
              <div className="text-sm font-bold text-foreground">{expandedStatus?.messagesProcessed ?? 0}</div>
              <div className="text-[9px] text-muted-foreground">Messages</div>
            </div>
            <div className="text-center py-1.5 rounded-lg bg-card/60">
              <div className="text-sm font-bold text-foreground">{expandedStats.active}</div>
              <div className="text-[9px] text-muted-foreground">Active</div>
            </div>
          </div>

          {/* Specialties */}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Specialties</p>
            <div className="flex flex-wrap gap-1">
              {expandedCaps.specialties.map((s) => (
                <span key={s} className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-card border border-border text-foreground">
                  {s}
                </span>
              ))}
            </div>
          </div>

          {/* Quick Dispatch */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Quick Dispatch</p>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={quickTask}
                onChange={(e) => setQuickTask(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleQuickDispatch()}
                placeholder="Describe a task..."
                className="flex-1 h-8 px-2.5 rounded-lg border border-border bg-card text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 transition-all"
              />
              <button
                onClick={handleQuickDispatch}
                disabled={!quickTask.trim() || dispatching}
                className="h-8 px-3 rounded-lg bg-primary text-white text-[10px] font-semibold disabled:opacity-40 flex items-center gap-1 hover:bg-primary/90 transition-colors"
              >
                {dispatching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                Go
              </button>
            </div>
          </div>

          {/* Link to full agent page */}
          <Link
            href={`/agents/${selectedAgent}`}
            className="flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-semibold text-primary hover:text-primary/80 transition-colors"
          >
            Full Configuration <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      <div className="flex-1 space-y-1 overflow-y-auto custom-scrollbar">
        {AGENT_LIST.map((agent) => {
          const stats = agentStats[agent.id];
          const sseData = statusFromSSE[agent.id];
          const status = sseData?.status || "idle";
          const isActive = status === "busy";
          const isExpanded = selectedAgent === agent.id;
          const meta = getAgentMeta(agent.id);
          const caps = AGENT_CAPABILITIES[agent.id];

          return (
            <button
              key={agent.id}
              onClick={() => onAgentClick(agent.id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg border transition-all duration-200 group text-left",
                isExpanded
                  ? "border-primary/30 bg-primary/5"
                  : "border-transparent hover:border-border hover:bg-card/80"
              )}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0 transition-transform duration-200 group-hover:scale-110"
                style={{
                  backgroundColor: `${agent.color}15`,
                  boxShadow: isActive ? `0 0 8px ${agent.color}40` : "none",
                }}
              >
                {agent.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-foreground truncate">
                    {meta.name.replace(" Agent", "").replace("Klawhub ", "")}
                  </span>
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full flex-shrink-0",
                      isActive ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/30"
                    )}
                  />
                </div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {isExpanded ? (caps?.role || "") : (stats.lastAction || "Idle")}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {stats.active > 0 && (
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                    {stats.active}
                  </span>
                )}
                {isExpanded ? (
                  <ChevronUp className="w-3 h-3 text-primary" />
                ) : (
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metrics Card — animated counters
// ---------------------------------------------------------------------------

function MetricsCard({
  metrics,
  agentStatuses,
}: {
  metrics: ReturnType<typeof useDashboardStream>["metrics"] | null;
  agentStatuses: ReturnType<typeof useDashboardStream>["agentStatuses"];
}) {
  const activeAgents =
    agentStatuses?.filter((s) => s.status === "busy").length ?? 0;

  const statItems = [
    {
      icon: <MessageSquare className="w-4 h-4" />,
      label: "Messages",
      value: metrics?.messagesToday ?? 0,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      icon: <Wrench className="w-4 h-4" />,
      label: "Tool Calls",
      value: metrics?.toolCallsToday ?? 0,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
    },
    {
      icon: <ListTodo className="w-4 h-4" />,
      label: "Tasks Done",
      value: metrics?.tasksDone ?? 0,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      icon: <Users className="w-4 h-4" />,
      label: "Delegations",
      value: metrics?.activeDelegations ?? 0,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
    {
      icon: <Bot className="w-4 h-4" />,
      label: "Active Agents",
      value: activeAgents,
      color: "text-rose-500",
      bg: "bg-rose-500/10",
    },
  ];

  return (
    <div className="bento-card">
      <h3 className="text-sm font-semibold text-foreground mb-3">Overview</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {statItems.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-card/60 border border-border/50"
          >
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", item.bg)}>
              <span className={item.color}>{item.icon}</span>
            </div>
            <div className="min-w-0">
              <div className={cn("text-lg font-bold leading-none", item.color)}>
                {item.value}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {item.label}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Services Health Card
// ---------------------------------------------------------------------------

function ServicesHealthCard({
  services,
}: {
  services: ServiceStatus | null;
}) {
  const connectedCount = services
    ? Object.values(services).filter((s) => s.connected).length
    : 0;

  return (
    <div className="bento-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Services</h3>
        <span className="text-[10px] font-medium text-emerald-600">
          {connectedCount}/{SERVICE_META.length} connected
        </span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-1.5">
        {SERVICE_META.map((svc) => {
          const connected = services?.[svc.key]?.connected ?? false;
          return (
            <div
              key={svc.key}
              className={cn(
                "flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-lg border transition-all duration-200",
                connected
                  ? "bg-card border-border/50 hover:border-emerald-500/30"
                  : "bg-card/40 border-border/30 opacity-50"
              )}
            >
              <div className="text-lg">{svc.icon}</div>
              <span className="text-[9px] font-medium text-muted-foreground">
                {svc.label}
              </span>
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  connected ? "bg-emerald-500" : "bg-muted-foreground/30"
                )}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity Feed Card
// ---------------------------------------------------------------------------

const AGENT_DOT_COLORS: Record<string, string> = {
  general: "bg-emerald-500",
  mail: "bg-blue-500",
  code: "bg-purple-500",
  data: "bg-amber-500",
  creative: "bg-rose-500",
  research: "bg-teal-500",
  ops: "bg-orange-500",
};

const KNOWN_AGENT_IDS = new Set(["general", "mail", "code", "data", "creative", "research", "ops"]);

type ActivityFilterTab = "all" | "errors" | "agents" | "system";

const FILTER_TABS: { key: ActivityFilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "errors", label: "Errors" },
  { key: "agents", label: "Agents" },
  { key: "system", label: "System" },
];

function ActivityFeedCard({
  events,
  isConnected,
}: {
  events: ActivityEventView[];
  isConnected: boolean;
}) {
  const [activeTab, setActiveTab] = useState<ActivityFilterTab>("all");
  const [expandedErrorId, setExpandedErrorId] = useState<number | null>(null);

  const allEvents = useMemo(
    () => [...events].reverse().slice(0, 50),
    [events]
  );

  const displayEvents = useMemo(() => {
    let filtered = allEvents;
    switch (activeTab) {
      case "errors":
        filtered = allEvents.filter((e) => e.action === "error");
        break;
      case "agents":
        filtered = allEvents.filter((e) => KNOWN_AGENT_IDS.has(e.agent_id));
        break;
      case "system":
        filtered = allEvents.filter(
          (e) => e.agent_id === "system" || e.action.startsWith("system_")
        );
        break;
    }
    return filtered.slice(0, 10);
  }, [allEvents, activeTab]);

  const lastUpdated = allEvents.length > 0
    ? new Date(allEvents[0].created_at).toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  return (
    <div className="bento-card flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Activity Feed</h3>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              isConnected ? "bg-emerald-500" : "bg-red-500"
            )}
          />
          <span
            className={cn(
              "text-[10px] font-medium",
              isConnected ? "text-emerald-600" : "text-red-500"
            )}
          >
            {isConnected ? "Live" : "Offline"}
          </span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5 mb-3">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key);
              setExpandedErrorId(null);
            }}
            className={cn(
              "flex-1 px-2 py-1 text-[9px] rounded-md transition-colors text-center font-medium",
              activeTab === tab.key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-0.5">
        {displayEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center mb-2">
              <Activity className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-[11px] text-muted-foreground">No activity yet</p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">
              Send a message to get started
            </p>
          </div>
        ) : (
          displayEvents.map((event) => {
            const isError = event.action === "error";
            const isExpanded = expandedErrorId === event.id;

            return (
              <div
                key={event.id}
                onClick={() => isError && setExpandedErrorId(isExpanded ? null : event.id)}
                className={cn(
                  "flex items-start gap-2.5 py-2 px-1 rounded-lg hover:bg-card/60 transition-colors",
                  isError && "cursor-pointer border-l-2 border-l-red-500 pl-1",
                  isExpanded && "bg-red-500/5",
                )}
              >
                <div
                  className={cn(
                    "w-2 h-2 rounded-full mt-1.5 flex-shrink-0",
                    isError
                      ? "bg-red-500"
                      : AGENT_DOT_COLORS[event.agent_id] || "bg-gray-400"
                  )}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-foreground leading-relaxed">
                    <span className="font-semibold">
                      {(event.agent_name || event.agent_id).replace(" Agent", "").replace("Klawhub ", "")}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      {isExpanded && isError
                        ? event.detail || event.action
                        : isError
                          ? (event.detail || event.action).slice(0, 120) + ((event.detail || event.action).length > 120 ? "..." : "")
                          : event.detail || event.action}
                    </span>
                  </p>
                  {isError && (event.detail || "").length > 120 && (
                    <p className="text-[9px] text-red-400 mt-0.5">
                      {isExpanded ? "Click to collapse" : "Click to see full error"}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                    {formatTime(event.created_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Last Updated */}
      {lastUpdated && (
        <div className="pt-2 mt-auto border-t border-border/30">
          <p className="text-[9px] text-muted-foreground/60">
            Last updated {lastUpdated}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick Actions Card
// ---------------------------------------------------------------------------

function QuickActionsCard() {
  const actions = [
    { label: "New Task", icon: <ListTodo className="w-3.5 h-3.5" />, href: "/taskboard", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20" },
    { label: "Run Workflow", icon: <Workflow className="w-3.5 h-3.5" />, href: "/workflows", color: "bg-purple-500/10 text-purple-600 border-purple-500/20 hover:bg-purple-500/20" },
    { label: "Schedule", icon: <Clock className="w-3.5 h-3.5" />, href: "/routines", color: "bg-blue-500/10 text-blue-600 border-blue-500/20 hover:bg-blue-500/20" },
    { label: "Ask AI", icon: <Sparkles className="w-3.5 h-3.5" />, href: "/chat", color: "bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500/20" },
    { label: "Skills", icon: <Brain className="w-3.5 h-3.5" />, href: "/skills", color: "bg-rose-500/10 text-rose-600 border-rose-500/20 hover:bg-rose-500/20" },
    { label: "Insights", icon: <TrendingUp className="w-3.5 h-3.5" />, href: "/insights", color: "bg-teal-500/10 text-teal-600 border-teal-500/20 hover:bg-teal-500/20" },
  ];

  return (
    <div className="bento-card">
      <h3 className="text-sm font-semibold text-foreground mb-3">Quick Actions</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {actions.map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className={cn(
              "flex items-center gap-2 px-3 py-2.5 rounded-lg border text-[11px] font-semibold transition-all duration-200",
              action.color
            )}
          >
            {action.icon}
            {action.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tasks Summary Card
// ---------------------------------------------------------------------------

function TasksSummaryCard({
  tasks,
}: {
  tasks: AgentTaskView[];
}) {
  const summary = useMemo(() => {
    const active = tasks.filter(
      (t) => t.status === "pending" || t.status === "running"
    ).length;
    const completed = tasks.filter((t) => t.status === "completed").length;
    const failed = tasks.filter((t) => t.status === "failed").length;
    const total = tasks.length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { active, completed, failed, total, pct };
  }, [tasks]);

  const recentTasks = useMemo(
    () =>
      [...tasks]
        .filter((t) => t.status === "pending" || t.status === "running")
        .slice(0, 4),
    [tasks]
  );

  const AGENT_EMOJI: Record<string, string> = {
    general: "🧠",
    mail: "📧",
    code: "💻",
    data: "📊",
    creative: "🎨",
    research: "🔬",
    ops: "⚙️",
  };

  return (
    <div className="bento-card flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Tasks</h3>
        <Link
          href="/taskboard"
          className="text-[10px] font-medium text-primary hover:text-primary/80 transition-colors"
        >
          View all
        </Link>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-muted-foreground">
            {summary.completed}/{summary.total} completed
          </span>
          <span className="text-[10px] font-semibold text-foreground">
            {summary.pct}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-700 ease-out"
            style={{ width: `${summary.pct}%` }}
          />
        </div>
        <div className="flex items-center gap-3 mt-2">
          <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            {summary.active} active
          </span>
          <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {summary.completed} done
          </span>
          <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            {summary.failed} failed
          </span>
        </div>
      </div>

      {/* Recent active tasks */}
      <div className="flex-1 space-y-1.5 overflow-y-auto custom-scrollbar">
        {recentTasks.length === 0 ? (
          <div className="flex items-center justify-center py-6 text-center">
            <p className="text-[11px] text-muted-foreground">All caught up!</p>
          </div>
        ) : (
          recentTasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-card/60 transition-colors"
            >
              <span className="text-xs">{AGENT_EMOJI[task.agent_id] || "🤖"}</span>
              <span className="text-[11px] text-foreground truncate flex-1">
                {task.task}
              </span>
              <span
                className={cn(
                  "text-[9px] font-semibold px-1.5 py-0.5 rounded",
                  task.status === "running"
                    ? "bg-primary/10 text-primary"
                    : "bg-amber-50 text-amber-700 border border-amber-200"
                )}
              >
                {task.status}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact Chat Strip
// ---------------------------------------------------------------------------

function ChatStrip() {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      {/* Collapsed strip */}
      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-card/80 hover:bg-card transition-all duration-200 group"
        >
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Send className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-xs font-semibold text-foreground">Quick Chat</p>
            <p className="text-[10px] text-muted-foreground truncate">
              Ask any agent a question...
            </p>
          </div>
          <ChevronUp className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </button>
      )}

      {/* Expanded chat view */}
      {expanded && (
        <div className="flex flex-col rounded-xl border border-border bg-card overflow-hidden shadow-lg" style={{ height: "min(480px, 60vh)" }}>
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card flex-shrink-0">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold text-foreground">Chat</span>
            </div>
            <button
              onClick={() => setExpanded(false)}
              className="p-1 rounded-md hover:bg-muted transition-colors"
            >
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              }
            >
              <ChatView />
            </Suspense>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <div className="p-4 lg:p-6 space-y-4 animate-pulse">
      {/* Welcome banner skeleton */}
      <div className="h-16 rounded-xl bg-muted" />
      {/* Metrics skeleton */}
      <div className="h-24 rounded-xl bg-muted" />
      {/* Grid skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="h-64 rounded-xl bg-muted lg:col-span-1" />
        <div className="h-64 rounded-xl bg-muted lg:col-span-1" />
        <div className="h-64 rounded-xl bg-muted lg:col-span-1" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(
    null
  );
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const {
    agentStatuses,
    activity,
    metrics,
    tasks,
    isConnected,
  } = useDashboardStream();

  // Fetch service status
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/services?action=status", {
          signal: controller.signal,
        });
        const json = await res.json();
        if (json.success) setServiceStatus(json.data);
      } catch {
        /* silent */
      }
    })();
    return () => controller.abort();
  }, []);

  const handleAgentClick = useCallback((agentId: string) => {
    setSelectedAgent(agentId === selectedAgent ? null : agentId);
  }, [selectedAgent]);

  // Filter tasks for selected agent
  const filteredTasks = useMemo(() => {
    if (!selectedAgent) return tasks;
    return tasks.filter((t) => t.agent_id === selectedAgent);
  }, [tasks, selectedAgent]);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex-1 min-h-0">
        <div className="p-4 lg:p-6 max-w-[1600px] mx-auto space-y-4 lg:space-y-5">
          {/* ── Welcome Banner ── */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-1">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
                {getGreeting()} 👋
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">{today}</p>
            </div>
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold",
                  isConnected
                    ? "bg-emerald-500/10 text-emerald-600"
                    : "bg-red-500/10 text-red-500"
                )}
              >
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    isConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                  )}
                />
                {isConnected ? "System Online" : "Reconnecting..."}
              </div>
              <Link
                href="/analytics"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-card border border-border text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:border-border transition-all"
              >
                <TrendingUp className="w-3 h-3" />
                Analytics
              </Link>
            </div>
          </div>

          {/* ── Bento Grid ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5">
            {/* Left column: Agent Crew (spans 1 col) */}
            <div className="lg:row-span-2">
              <AgentCrewCard
                agentStatuses={agentStatuses}
                tasks={tasks}
                selectedAgent={selectedAgent}
                onAgentClick={handleAgentClick}
              />
            </div>

            {/* Center column: Metrics + Tasks + Quick Actions */}
            <div className="lg:col-span-2 space-y-4 lg:space-y-5">
              {/* Metrics ribbon */}
              <MetricsCard
                metrics={metrics}
                agentStatuses={agentStatuses}
              />

              {/* System Intelligence — Proactive Agent Brain */}
              <Suspense
                fallback={
                  <div className="bento-card flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  </div>
                }
              >
                <SystemIntelligenceCard />
              </Suspense>

              {/* Tasks + Services row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">
                <TasksSummaryCard tasks={filteredTasks} />
                <ServicesHealthCard services={serviceStatus} />
              </div>

              {/* Quick Actions */}
              <QuickActionsCard />

              {/* Activity Feed */}
              <ActivityFeedCard
                events={activity}
                isConnected={isConnected}
              />
            </div>
          </div>

          {/* ── Chat Strip ── */}
          <div className="pb-2">
            <ChatStrip />
          </div>
        </div>
      </div>
    </div>
  );
}
