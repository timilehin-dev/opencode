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
  ArrowUpIcon,
  ArrowDownIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/helpers";
import {
  type AnalyticsSummary,
  type AnalyticsEvent,
  getAnalyticsSummary,
  clearAnalytics,
} from "@/lib/analytics-store";

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

// ---------------------------------------------------------------------------
// SVG Sparkline
// ---------------------------------------------------------------------------

function SparkLine({
  data,
  color = "#3730a3",
  height = 32,
  width = 96,
}: {
  data: number[];
  color?: string;
  height?: number;
  width?: number;
}) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = width / (data.length - 1);

  const points = data
    .map((v, i) => `${i * step},${height - ((v - min) / range) * (height - 4) - 2}`)
    .join(" ");

  const areaPath = `M0,${height} ${data.map((v, i) => `L${i * step},${height - ((v - min) / range) * (height - 4) - 2}`).join(" ")} L${width},${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#grad-${color.replace("#", "")})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
  let cumulative = 0;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-40 h-40">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f0ede8" strokeWidth={strokeWidth} />
        {segments.map((seg) => {
          const pct = seg.value / total;
          const circumference = 2 * Math.PI * r;
          const offset = (cumulative / total) * circumference;
          const dashLength = pct * circumference;
          cumulative += seg.value;

          return (
            <circle
              key={seg.label}
              cx={cx} cy={cy} r={r}
              fill="none" stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dashLength} ${circumference - dashLength}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              className="transition-all duration-500"
            />
          );
        })}
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
// Main Analytics Page
// ---------------------------------------------------------------------------

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [allEvents, setAllEvents] = useState<AnalyticsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  const refresh = useCallback(() => {
    setLoading(true);
    requestAnimationFrame(() => {
      try {
        const summary = getAnalyticsSummary(days);
        setData(summary);
        const raw = localStorage.getItem("claw-analytics-events");
        if (raw) {
          setAllEvents(JSON.parse(raw));
        }
      } catch (e) {
        console.error("[Analytics] Error:", e);
      }
      setLoading(false);
    });
  }, [days]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleClear = () => {
    if (window.confirm("Clear all analytics data? This cannot be undone.")) {
      clearAnalytics();
      refresh();
    }
  };

  // Derived analytics
  const hourData = useMemo(() => {
    const map: Record<number, number> = {};
    for (let i = 0; i < 24; i++) map[i] = 0;
    const since = new Date(Date.now() - days * 86400000);
    for (const evt of allEvents) {
      const d = new Date(evt.createdAt);
      if (d >= since) map[d.getHours()] = (map[d.getHours()] || 0) + 1;
    }
    return map;
  }, [allEvents, days]);

  const peakHour = useMemo(() => {
    let maxH = 0, maxV = 0;
    for (const [h, v] of Object.entries(hourData)) {
      if (v > maxV) { maxV = v; maxH = Number(h); }
    }
    return maxV > 0 ? formatHour(maxH) : "N/A";
  }, [hourData]);

  const previousPeriodData = useMemo(() => {
    const prevSince = new Date(Date.now() - days * 2 * 86400000);
    const prevEnd = new Date(Date.now() - days * 86400000);
    const msgs = allEvents.filter(e => e.type === "chat_message" && new Date(e.createdAt) >= prevSince && new Date(e.createdAt) < prevEnd).length;
    const tools = allEvents.filter(e => e.type === "tool_call" && new Date(e.createdAt) >= prevSince && new Date(e.createdAt) < prevEnd).length;
    return { messages: msgs, toolCalls: tools };
  }, [allEvents, days]);

  const msgChange = useMemo(() => {
    if (!previousPeriodData.messages) return null;
    return (((data?.totalMessages || 0) - previousPeriodData.messages) / previousPeriodData.messages * 100).toFixed(0);
  }, [data, previousPeriodData]);

  const toolChange = useMemo(() => {
    if (!previousPeriodData.toolCalls) return null;
    return (((data?.totalToolCalls || 0) - previousPeriodData.toolCalls) / previousPeriodData.toolCalls * 100).toFixed(0);
  }, [data, previousPeriodData]);

  const mostActiveAgent = data?.agentUsage.length ? data.agentUsage[0] : null;
  const avgToolsPerMessage = data && data.totalMessages > 0
    ? (data.totalToolCalls / data.totalMessages).toFixed(1) : "0";
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

  const agentSparkData = useMemo(() => {
    if (!allEvents.length) return {};
    const agentDayMap: Record<string, Record<string, number>> = {};
    const since = new Date(Date.now() - days * 86400000);
    for (const evt of allEvents) {
      if (evt.type !== "chat_message") continue;
      const d = new Date(evt.createdAt);
      if (d < since) continue;
      const day = evt.createdAt.slice(0, 10);
      if (!agentDayMap[evt.agentId]) agentDayMap[evt.agentId] = {};
      agentDayMap[evt.agentId][day] = (agentDayMap[evt.agentId][day] || 0) + 1;
    }
    const result: Record<string, number[]> = {};
    for (const [agentId, dayMap] of Object.entries(agentDayMap)) {
      result[agentId] = Object.keys(dayMap).sort().map(d => dayMap[d]);
    }
    return result;
  }, [allEvents, days]);

  // Loading
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        <div className="text-center py-16">
          <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground mb-4">No data available yet</p>
          <Button variant="outline" size="sm" onClick={refresh}>Retry</Button>
        </div>
      </div>
    );
  }

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
          </div>
          <p className="text-sm text-muted-foreground ml-8">
            Activity trends, agent performance, and usage patterns
          </p>
        </div>
        <div className="flex items-center gap-2 ml-8 sm:ml-0">
          <div className="flex items-center gap-1 bg-white border border-[#e8e5df] rounded-lg p-0.5">
            {[3, 7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  days === d ? "bg-[#3730a3] text-white" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {d}d
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
          <Button variant="ghost" size="sm" onClick={handleClear} className="text-xs text-muted-foreground hover:text-red-400">
            Clear
          </Button>
        </div>
      </div>

      {/* A. Summary Stats Cards */}
      <motion.div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6" variants={containerVariants} initial="hidden" animate="show">
        {[
          { label: "Total Messages", value: data.totalMessages, icon: <MessageSquare className="w-4 h-4 text-emerald-600" />, bg: "bg-emerald-500/10", change: msgChange },
          { label: "Tool Calls", value: data.totalToolCalls, icon: <Wrench className="w-4 h-4 text-amber-600" />, bg: "bg-amber-500/10", change: toolChange },
          { label: "Most Active Agent", value: mostActiveAgent?.agentName ?? "N/A", icon: <Bot className="w-4 h-4 text-purple-600" />, bg: "bg-purple-500/10", isText: true },
          { label: "Avg Tools / Message", value: avgToolsPerMessage, icon: <Zap className="w-4 h-4 text-rose-600" />, bg: "bg-rose-500/10" },
          { label: "Peak Hour", value: peakHour, icon: <Clock className="w-4 h-4 text-blue-600" />, bg: "bg-blue-500/10" },
        ].map((stat, idx) => (
          <motion.div key={stat.label} variants={itemVariants}>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className={cn("p-2 rounded-lg", stat.bg)}>{stat.icon}</div>
                  {stat.change !== null && stat.change !== undefined && (
                    <div className={cn(
                      "flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                      Number(stat.change) >= 0 ? "text-emerald-700 bg-emerald-50" : "text-red-700 bg-red-50"
                    )}>
                      {Number(stat.change) >= 0 ? <ArrowUpIcon className="w-2.5 h-2.5" /> : <ArrowDownIcon className="w-2.5 h-2.5" />}
                      {stat.change}%
                    </div>
                  )}
                </div>
                <p className={cn("font-bold text-foreground truncate", stat.isText ? "text-sm" : "text-xl")}>{stat.value}</p>
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
            {data.dailyMessageCounts.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">No messages in this period.</div>
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
            <CardContent><HourHeatmap data={hourData} /></CardContent>
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
                <div className="text-center py-8 text-sm text-muted-foreground">No tool calls recorded yet</div>
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

      {/* D. Agent Performance Table */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              Agent Performance
            </CardTitle>
            <CardDescription>Per-agent usage with trend sparklines</CardDescription>
          </CardHeader>
          <CardContent>
            {data.agentUsage.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">No agent activity recorded.</div>
            ) : (
              <div className="overflow-x-auto scrollbar-none -mx-6 px-6">
                <table className="w-full min-w-[500px]">
                  <thead>
                    <tr className="border-b border-[#e8e5df]">
                      <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-3">Agent</th>
                      <th className="text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-3">Messages</th>
                      <th className="text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-3">Tools</th>
                      <th className="text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-3">Avg Tools</th>
                      <th className="text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-3">Trend</th>
                      <th className="text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-3">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.agentUsage.map((agent) => {
                      const totalMsgs = data.agentUsage.reduce((s, a) => s + a.messages, 0) || 1;
                      const share = ((agent.messages / totalMsgs) * 100).toFixed(1);
                      const avg = agent.messages > 0 ? (agent.toolCalls / agent.messages).toFixed(1) : "0";
                      const spark = agentSparkData[agent.agentId] || [];
                      const color = AGENT_COLORS[agent.agentId] || "#6b6b6b";
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
                          <td className="py-3 px-2">
                            <div className="w-24 h-8 mx-auto">
                              {spark.length >= 2 ? <SparkLine data={spark} color={color} height={32} width={96} /> : <span className="text-[10px] text-muted-foreground">—</span>}
                            </div>
                          </td>
                          <td className="py-3 text-right"><Badge variant="secondary" className="text-[10px]">{share}%</Badge></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* E. Top Tools + Recent Activity */}
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
                <div className="text-center py-8 text-sm text-muted-foreground">No tool calls in this period.</div>
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
                <div className="text-center py-8 text-sm text-muted-foreground">No recent activity.</div>
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
                        {event.data && Object.keys(event.data).length > 0 && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                            {typeof event.data.detail === "string" ? event.data.detail
                              : typeof event.data.toolName === "string" ? `Tool: ${event.data.toolName}`
                              : typeof event.data.messageLength === "number" ? `Message: ${event.data.messageLength} chars`
                              : typeof event.data.fromAgentId === "string" ? `From: ${event.data.fromAgentId}`
                              : JSON.stringify(event.data).slice(0, 80)}
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
    </motion.div>
  );
}
