"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  MessageSquare,
  Wrench,
  Bot,
  Clock,
  Zap,
  RefreshCw,
  Users,
  TrendingUp,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Inbox,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/helpers";

// ---------------------------------------------------------------------------
// Types for the API response
// ---------------------------------------------------------------------------

interface AgentUsageRow {
  agentId: string;
  agentName: string;
  messages: number;
  toolCalls: number;
}

interface RecentActivityItem {
  id: string;
  type: string;
  agentId: string;
  agentName: string;
  data: { detail?: string; toolName?: string };
  createdAt: string;
}

interface AgentStatusRow {
  agentId: string;
  status: string;
  currentTask: string | null;
  tasksCompleted: number;
  messagesProcessed: number;
  lastActivity: string | null;
}

interface AutomationRow {
  name: string;
  enabled: boolean;
  runCount: number;
  lastRunAt: string | null;
  lastStatus: string | null;
}

interface AnalyticsApiResponse {
  totalMessages: number;
  totalToolCalls: number;
  activeAgents: number;
  activeSessions: number;
  agentUsage: AgentUsageRow[];
  toolUsage: { toolName: string; count: number }[];
  recentActivity: RecentActivityItem[];
  agentStatuses: AgentStatusRow[];
  tasks: { total: number; completed: number; pending: number; failed: number };
  automations: { total: number; enabled: number; totalRuns: number; list: AutomationRow[] };
  dailyMessageCounts: { date: string; count: number }[];
  hourlyData: Record<number, number>;
}

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDayShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatHour(h: number): string {
  if (h === 0) return "12am";
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

function getActivityIcon(type: string) {
  switch (type) {
    case "chat_message": return <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />;
    case "tool_call": return <Wrench className="w-3.5 h-3.5 text-amber-600" />;
    case "agent_switch": return <Bot className="w-3.5 h-3.5 text-purple-600" />;
    case "page_view": return <Activity className="w-3.5 h-3.5 text-blue-600" />;
    case "automation_run": return <Zap className="w-3.5 h-3.5 text-rose-600" />;
    default: return <Activity className="w-3.5 h-3.5 text-muted-foreground" />;
  }
}

function getActivityLabel(type: string): string {
  switch (type) {
    case "chat_message": return "Chat Message";
    case "tool_call": return "Tool Call";
    case "agent_switch": return "Agent Switch";
    case "page_view": return "Page View";
    case "automation_run": return "Automation Run";
    default: return type.replace(/_/g, " ");
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case "idle": return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "busy": return "bg-amber-100 text-amber-700 border-amber-200";
    case "error": return "bg-red-100 text-red-700 border-red-200";
    case "offline": return "bg-gray-100 text-gray-500 border-gray-200";
    default: return "bg-gray-100 text-gray-500 border-gray-200";
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case "idle": return <div className="w-2 h-2 rounded-full bg-emerald-500" />;
    case "busy": return <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />;
    case "error": return <div className="w-2 h-2 rounded-full bg-red-500" />;
    case "offline": return <div className="w-2 h-2 rounded-full bg-gray-400" />;
    default: return <div className="w-2 h-2 rounded-full bg-gray-400" />;
  }
}

// Color palette for agent charts
const AGENT_COLORS: Record<string, string> = {
  general: "#3730a3",
  mail: "#2563eb",
  code: "#7c3aed",
  data: "#d97706",
  creative: "#e11d48",
  research: "#0d9488",
  ops: "#ea580c",
};

function getAgentColor(agentId: string): string {
  const keys = Object.keys(AGENT_COLORS);
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) hash = agentId.charCodeAt(i) + ((hash << 5) - hash);
  return AGENT_COLORS[keys[Math.abs(hash) % keys.length]] || "#3730a3";
}

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="p-2 rounded-lg bg-[#f0ede8] w-9 h-9 animate-pulse" />
          <div className="w-14 h-5 rounded-full bg-[#f0ede8] animate-pulse" />
        </div>
        <div className="w-20 h-7 rounded bg-[#f0ede8] animate-pulse" />
        <div className="w-28 h-3 rounded bg-[#f0ede8] animate-pulse" />
      </CardContent>
    </Card>
  );
}

function SkeletonWide() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="w-40 h-5 rounded bg-[#f0ede8] animate-pulse" />
      </CardHeader>
      <CardContent>
        <div className="h-44 w-full rounded bg-[#f0ede8]/50 animate-pulse" />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// SVG Bar Chart (daily messages)
// ---------------------------------------------------------------------------

function BarChart({ data, maxVal }: { data: { date: string; count: number }[]; maxVal: number }) {
  const max = Math.max(maxVal, 1);
  return (
    <div className="flex items-end gap-1 h-44 w-full">
      {data.map((day) => {
        const pct = Math.max((day.count / max) * 100, 2);
        return (
          <div key={day.date} className="flex-1 flex flex-col items-center gap-1.5 group relative min-w-0">
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[#1a1a1a] text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
              {day.count} messages
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#1a1a1a] rotate-45" />
            </div>
            <span className="text-[10px] font-semibold text-foreground">
              {day.count > 0 ? day.count : ""}
            </span>
            <div className="w-full relative">
              <motion.div
                className="w-full rounded-t bg-[#3730a3]/70 hover:bg-[#3730a3] transition-colors cursor-default min-h-[2px]"
                initial={{ height: 0 }}
                animate={{ height: `${pct}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            </div>
            <span className="text-[9px] text-muted-foreground text-center leading-tight truncate w-full">
              {formatDayShort(day.date).split(" ").slice(1).join(" ")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hour-of-Day Heatmap
// ---------------------------------------------------------------------------

function HourHeatmap({ data }: { data: Record<number, number> }) {
  const maxVal = Math.max(...Object.values(data), 1);
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="grid grid-cols-6 sm:grid-cols-8 lg:grid-cols-12 gap-1.5">
      {hours.map((h) => {
        const val = data[h] || 0;
        const intensity = val / maxVal;
        const bg = intensity === 0 ? "bg-[#f5f3ef]" : "bg-[#3730a3]";
        const opacity = intensity === 0 ? 1 : Math.max(0.15, intensity);

        return (
          <div
            key={h}
            className={cn(
              "rounded-md flex flex-col items-center justify-center p-1.5 transition-transform hover:scale-110 cursor-default",
              bg
            )}
            style={{ opacity }}
            title={`${formatHour(h)}: ${val} events`}
          >
            <span className="text-[9px] text-muted-foreground font-medium">{formatHour(h)}</span>
            <span className="text-[10px] font-bold text-foreground">{val}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Donut Chart (tool distribution)
// ---------------------------------------------------------------------------

function DonutChart({
  segments,
  size = 160,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 12;
  const strokeWidth = 18;
  const circumference = 2 * Math.PI * r;

  // Pre-compute arc data to avoid reassigning inside render
  const arcs = segments.reduce<Array<{ label: string; color: string; dashLength: number; offset: number }>>(
    (acc, seg) => {
      const pct = seg.value / total;
      const dashLength = pct * circumference;
      const offset = acc.length === 0 ? 0 : acc[acc.length - 1].offset + acc[acc.length - 1].dashLength;
      acc.push({ label: seg.label, color: seg.color, dashLength, offset });
      return acc;
    },
    [],
  );

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-40 h-40">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f0ede8" strokeWidth={strokeWidth} />
        {arcs.map((arc) => (
          <circle
            key={arc.label}
            cx={cx} cy={cy} r={r}
            fill="none" stroke={arc.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${arc.dashLength} ${circumference - arc.dashLength}`}
            strokeDashoffset={-arc.offset}
            strokeLinecap="butt"
            className="transition-all duration-500"
          />
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-foreground text-lg font-bold">
          {total}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" className="fill-muted-foreground text-[10px]">
          total calls
        </text>
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="text-center py-12">
      <Icon className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Analytics Page
// ---------------------------------------------------------------------------

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics?days=${days}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data as AnalyticsApiResponse);
        setLastRefreshed(new Date());
      } else {
        throw new Error("Invalid response");
      }
    } catch (err) {
      console.error("[Analytics] Fetch error:", err);
      setError(err instanceof Error ? err.message : "Failed to load analytics");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const interval = setInterval(refresh, 300000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Derived data
  const peakHour = useMemo(() => {
    if (!data?.hourlyData) return "N/A";
    let maxH = 0, maxV = 0;
    for (const [h, v] of Object.entries(data.hourlyData)) {
      if (v > maxV) { maxV = v; maxH = Number(h); }
    }
    return maxV > 0 ? formatHour(maxH) : "N/A";
  }, [data]);

  const maxDailyCount = Math.max(...(data?.dailyMessageCounts.map(d => d.count) || [0]), 1);
  const maxToolCount = Math.max(...(data?.toolUsage.map(t => t.count) || [0]), 1);
  const maxAgentMessages = Math.max(...(data?.agentUsage.map(a => a.messages) || [0]), 1);

  const toolCategoryData = useMemo(() => {
    if (!data) return [];
    const catMap: Record<string, number> = {};
    for (const tool of data.toolUsage) {
      const cat = tool.toolName.split("_")[0];
      catMap[cat] = (catMap[cat] || 0) + tool.count;
    }
    const colors = ["#3730a3", "#2563eb", "#7c3aed", "#d97706", "#e11d48", "#0d9488", "#ea580c", "#059669"];
    return Object.entries(catMap).sort((a, b) => b[1] - a[1]).map(([cat, val], i) => ({
      label: cat.charAt(0).toUpperCase() + cat.slice(1),
      value: val,
      color: colors[i % colors.length],
    }));
  }, [data]);

  const hasData = data && (data.totalMessages > 0 || data.totalToolCalls > 0 || data.agentStatuses.length > 0 || data.automations.total > 0);

  // -------------------------------------------------------------------------
  // Loading state — skeleton cards
  // -------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-5 h-5 rounded bg-[#f0ede8] animate-pulse" />
              <div className="w-28 h-6 rounded bg-[#f0ede8] animate-pulse" />
            </div>
            <div className="w-64 h-4 rounded bg-[#f0ede8] animate-pulse ml-8" />
          </div>
          <div className="flex items-center gap-2 ml-8 sm:ml-0">
            <div className="w-32 h-8 rounded-lg bg-[#f0ede8] animate-pulse" />
            <div className="w-20 h-8 rounded bg-[#f0ede8] animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonWide />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------
  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        <div className="text-center py-20">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Failed to load analytics</h3>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button variant="outline" size="sm" onClick={refresh}>Try Again</Button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        <div className="text-center py-20">
          <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">No data available</h3>
          <p className="text-sm text-muted-foreground mb-4">Analytics will appear here once agents start processing data.</p>
          <Button variant="outline" size="sm" onClick={refresh}>Retry</Button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Main content
  // -------------------------------------------------------------------------
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8"
    >
      {/* Page Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <BarChart3 className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-xl font-bold text-foreground">Analytics</h2>
            {lastRefreshed && (
              <span className="text-[10px] text-muted-foreground">
                Updated {timeAgo(lastRefreshed.toISOString())}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground ml-8">
            Activity trends, agent performance, and usage patterns
          </p>
        </div>
        <div className="flex items-center gap-2 ml-8 sm:ml-0 flex-wrap">
          <div className="flex items-center gap-1 bg-white border border-[#e8e5df] rounded-lg p-0.5">
            {[3, 7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-colors min-h-[32px]",
                  days === d ? "bg-[#3730a3] text-white" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {d}d
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading} className="gap-1.5">
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* A. Summary Stats Cards */}
      <motion.div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6" variants={containerVariants} initial="hidden" animate="show">
        {[
          { label: "Total Messages", value: data.totalMessages, icon: <MessageSquare className="w-4 h-4 text-emerald-600" />, bg: "bg-emerald-500/10" },
          { label: "Tool Calls", value: data.totalToolCalls, icon: <Wrench className="w-4 h-4 text-amber-600" />, bg: "bg-amber-500/10" },
          { label: "Active Agents", value: data.activeAgents, icon: <Bot className="w-4 h-4 text-purple-600" />, bg: "bg-purple-500/10" },
          { label: "Active Sessions", value: data.activeSessions, icon: <Users className="w-4 h-4 text-rose-600" />, bg: "bg-rose-500/10" },
          { label: "Peak Hour", value: peakHour, icon: <Clock className="w-4 h-4 text-blue-600" />, bg: "bg-blue-500/10", isText: true },
        ].map((stat) => (
          <motion.div key={stat.label} variants={itemVariants}>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className={cn("p-2 rounded-lg", stat.bg)}>{stat.icon}</div>
                </div>
                <p className={cn("font-bold text-foreground truncate", stat.isText ? "text-sm" : "text-xl")}>
                  {stat.isText ? stat.value : (stat.value as number).toLocaleString()}
                </p>
                <p className="text-[11px] text-muted-foreground">{stat.label}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* B. Daily Messages Bar Chart */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              Daily Messages — Last {days} Days
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.dailyMessageCounts.every(d => d.count === 0) ? (
              <EmptyState icon={Inbox} message="No messages in this period yet" />
            ) : (
              <BarChart data={data.dailyMessageCounts} maxVal={maxDailyCount} />
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* C. Hour Heatmap + Tool Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-muted-foreground" />
                Activity by Hour
              </CardTitle>
              <CardDescription>When you use the platform most</CardDescription>
            </CardHeader>
            <CardContent>
              {Object.values(data.hourlyData).every(v => v === 0) ? (
                <EmptyState icon={Clock} message="No activity recorded yet" />
              ) : (
                <HourHeatmap data={data.hourlyData} />
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Wrench className="w-4 h-4 text-muted-foreground" />
                Tool Call Distribution
              </CardTitle>
              <CardDescription>Service categories by usage</CardDescription>
            </CardHeader>
            <CardContent>
              {toolCategoryData.length === 0 ? (
                <EmptyState icon={Wrench} message="No tool calls recorded yet" />
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <DonutChart segments={toolCategoryData} size={160} />
                  <div className="flex-1 space-y-2 min-w-0">
                    {toolCategoryData.slice(0, 7).map((seg) => (
                      <div key={seg.label} className="flex items-center gap-2.5">
                        <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: seg.color }} />
                        <span className="text-xs font-medium text-foreground flex-1 truncate">{seg.label}</span>
                        <span className="text-xs text-muted-foreground">{seg.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* D. Agent Status Overview (from agent_status table) */}
      {data.agentStatuses.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }} className="mb-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Bot className="w-4 h-4 text-muted-foreground" />
                Agent Status
              </CardTitle>
              <CardDescription>Live agent status and task progress</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.agentStatuses.map((agent) => (
                  <div key={agent.agentId} className="flex items-center gap-3 p-3 rounded-lg bg-[#faf9f7] border border-[#f0ede8]">
                    {getStatusIcon(agent.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">{agent.agentId}</span>
                        <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 border", getStatusColor(agent.status))}>
                          {agent.status}
                        </Badge>
                      </div>
                      {agent.currentTask && (
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">{agent.currentTask}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] text-muted-foreground">
                          <CheckCircle2 className="w-3 h-3 inline mr-0.5 text-emerald-500" />
                          {agent.tasksCompleted} tasks
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          <MessageSquare className="w-3 h-3 inline mr-0.5 text-blue-500" />
                          {agent.messagesProcessed} msgs
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* E. Task Stats + Automation Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Task Stats */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
                Task Completion
              </CardTitle>
              <CardDescription>Agent task pipeline status</CardDescription>
            </CardHeader>
            <CardContent>
              {data.tasks.total === 0 ? (
                <EmptyState icon={CheckCircle2} message="No tasks have been created yet" />
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground font-medium">Total Tasks</span>
                    <span className="text-sm font-bold text-foreground">{data.tasks.total}</span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full h-3 rounded-full bg-[#f0ede8] overflow-hidden flex">
                    {data.tasks.total > 0 && (
                      <>
                        <motion.div
                          className="h-full bg-emerald-500"
                          initial={{ width: 0 }}
                          animate={{ width: `${(data.tasks.completed / data.tasks.total) * 100}%` }}
                          transition={{ duration: 0.6, ease: "easeOut" }}
                        />
                        <motion.div
                          className="h-full bg-amber-400"
                          initial={{ width: 0 }}
                          animate={{ width: `${(data.tasks.pending / data.tasks.total) * 100}%` }}
                          transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
                        />
                        <motion.div
                          className="h-full bg-red-400"
                          initial={{ width: 0 }}
                          animate={{ width: `${(data.tasks.failed / data.tasks.total) * 100}%` }}
                          transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
                        />
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                      Completed: <strong>{data.tasks.completed}</strong>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-amber-400" />
                      Pending: <strong>{data.tasks.pending}</strong>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-red-400" />
                      Failed: <strong>{data.tasks.failed}</strong>
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Automation Stats */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.26 }}>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Zap className="w-4 h-4 text-muted-foreground" />
                Automations
              </CardTitle>
              <CardDescription>Scheduled tasks and workflows</CardDescription>
            </CardHeader>
            <CardContent>
              {data.automations.total === 0 ? (
                <EmptyState icon={Zap} message="No automations configured yet" />
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total automations</span>
                    <span className="font-bold text-foreground">{data.automations.total}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Enabled</span>
                    <span className="font-bold text-emerald-600">{data.automations.enabled}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total runs</span>
                    <span className="font-bold text-foreground">{data.automations.totalRuns.toLocaleString()}</span>
                  </div>
                  <div className="border-t border-[#f0ede8] pt-3 mt-3 space-y-2 max-h-36 overflow-y-auto custom-scrollbar">
                    {data.automations.list.slice(0, 5).map((auto) => (
                      <div key={auto.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={cn("w-2 h-2 rounded-full", auto.enabled ? "bg-emerald-500" : "bg-gray-300")} />
                          <span className="text-xs text-foreground truncate">{auto.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">{auto.runCount} runs</span>
                          {auto.lastStatus && (
                            <Badge variant="outline" className={cn(
                              "text-[9px] px-1 py-0 border",
                              auto.lastStatus === "success" ? "text-emerald-600 bg-emerald-50 border-emerald-200" : "text-red-600 bg-red-50 border-red-200"
                            )}>
                              {auto.lastStatus}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* F. Agent Performance Table */}
      {data.agentUsage.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }} className="mb-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                Agent Performance
              </CardTitle>
              <CardDescription>Per-agent usage breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto scrollbar-none -mx-6 px-6">
                <table className="w-full min-w-[500px]">
                  <thead>
                    <tr className="border-b border-[#e8e5df]">
                      <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-3">Agent</th>
                      <th className="text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-3">Messages</th>
                      <th className="text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-3">Tools</th>
                      <th className="text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-3">Avg Tools</th>
                      <th className="text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-3">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.agentUsage.map((agent) => {
                      const totalMsgs = data.agentUsage.reduce((s, a) => s + a.messages, 0) || 1;
                      const share = ((agent.messages / totalMsgs) * 100).toFixed(1);
                      const avg = agent.messages > 0 ? (agent.toolCalls / agent.messages).toFixed(1) : "0";
                      const color = AGENT_COLORS[agent.agentId] || getAgentColor(agent.agentId);
                      const pct = Math.max((agent.messages / maxAgentMessages) * 100, 2);

                      return (
                        <tr key={agent.agentId} className="border-b border-[#f0ede8] last:border-0">
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                              <span className="text-sm font-medium text-foreground">{agent.agentName}</span>
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-sm font-semibold text-foreground">{agent.messages}</span>
                              <div className="w-16 h-1.5 rounded-full bg-[#f0ede8] hidden sm:block">
                                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
                              </div>
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-right"><span className="text-sm text-foreground">{agent.toolCalls}</span></td>
                          <td className="py-3 pr-4 text-right"><span className="text-sm text-muted-foreground">{avg}</span></td>
                          <td className="py-3 text-right"><Badge variant="secondary" className="text-[10px]">{share}%</Badge></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* G. Top Tools + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Wrench className="w-4 h-4 text-muted-foreground" />
                Top Tools Used
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.toolUsage.length === 0 ? (
                <EmptyState icon={Wrench} message="No tool calls in this period." />
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
                  {data.toolUsage.map((tool, i) => {
                    const pct = Math.max((tool.count / maxToolCount) * 100, 4);
                    return (
                      <div key={tool.toolName} className="flex items-center gap-3">
                        <span className="text-[10px] text-muted-foreground w-5 text-right font-mono">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-mono text-foreground truncate">{tool.toolName}</span>
                            <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">{tool.count}</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-[#f0ede8]">
                            <motion.div className="h-full rounded-full bg-amber-500/70" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.5, ease: "easeOut", delay: i * 0.03 }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.recentActivity.length === 0 ? (
                <EmptyState icon={Inbox} message="No recent activity recorded." />
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
                  {data.recentActivity.map((event, i) => (
                    <div key={`${event.id || `evt-${i}`}`} className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-[#faf9f7] border border-[#f0ede8] hover:border-[#3730a3]/20 transition-colors">
                      <div className="w-7 h-7 rounded-full bg-white border border-[#e8e5df] flex items-center justify-center flex-shrink-0 mt-0.5">
                        {getActivityIcon(event.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-foreground">{getActivityLabel(event.type)}</span>
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0">{event.agentName}</Badge>
                        </div>
                        {event.data && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                            {event.data.detail || event.data.toolName || ""}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">{timeAgo(event.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* H. "No data yet" banner (shown when Supabase connected but completely empty) */}
      {!hasData && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="mt-6">
          <Card className="border-dashed border-[#d4d0c8]">
            <CardContent className="p-8 text-center">
              <Loader2 className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3 animate-spin" />
              <h3 className="text-sm font-semibold text-foreground mb-1">Waiting for data</h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Analytics are connected to your Supabase database. Start chatting with agents or running automations to see real-time metrics appear here.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}
