"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  ActivityIcon,
  MessageSquare,
  WrenchIcon,
  Bot,
  Clock,
  Sparkles,
  RefreshCw,
  Users,
} from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/helpers";
import {
  type AnalyticsSummary,
  getAnalyticsSummary,
  clearAnalytics,
} from "@/lib/analytics-store";
import type { PageKey } from "@/components/dashboard/sidebar";

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function getActivityIcon(type: string) {
  switch (type) {
    case "chat_message":
      return <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />;
    case "tool_call":
      return <WrenchIcon className="w-3.5 h-3.5 text-amber-400" />;
    case "agent_switch":
      return <Bot className="w-3.5 h-3.5 text-purple-400" />;
    case "page_view":
      return <Activity className="w-3.5 h-3.5 text-blue-400" />;
    case "automation_run":
      return <Sparkles className="w-3.5 h-3.5 text-rose-400" />;
    default:
      return <Activity className="w-3.5 h-3.5 text-muted-foreground" />;
  }
}

function getActivityLabel(type: string): string {
  switch (type) {
    case "chat_message":
      return "Chat Message";
    case "tool_call":
      return "Tool Call";
    case "agent_switch":
      return "Agent Switch";
    case "page_view":
      return "Page View";
    case "automation_run":
      return "Automation Run";
    default:
      return type.replace(/_/g, " ");
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AnalyticsViewProps {
  onNavigate?: (key: PageKey) => void;
}

export function AnalyticsView({ onNavigate: _onNavigate }: AnalyticsViewProps) {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  const refresh = useCallback(() => {
    setLoading(true);
    // Use requestAnimationFrame to ensure we're in the browser
    requestAnimationFrame(() => {
      try {
        const summary = getAnalyticsSummary(days);
        setData(summary);
      } catch (e) {
        console.error("[Analytics] Error:", e);
      }
      setLoading(false);
    });
  }, [days]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Also refresh every 10 seconds to pick up new activity
  useEffect(() => {
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleClear = () => {
    if (window.confirm("Clear all analytics data? This cannot be undone.")) {
      clearAnalytics();
      refresh();
    }
  };

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">No data available</p>
        <Button variant="outline" size="sm" onClick={refresh}>
          Retry
        </Button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const mostActiveAgent = data.agentUsage.length > 0 ? data.agentUsage[0] : null;
  const avgToolsPerMessage = data.totalMessages > 0
    ? (data.totalToolCalls / data.totalMessages).toFixed(1)
    : "0";

  const maxDailyCount = Math.max(...data.dailyMessageCounts.map((d) => d.count), 1);
  const maxToolCount = Math.max(...data.toolUsage.map((t) => t.count), 1);
  const maxAgentMessages = Math.max(...data.agentUsage.map((a) => a.messages), 1);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <motion.div
      key="analytics"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Page Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Activity className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-xl font-bold text-foreground">Analytics</h2>
          </div>
          <p className="text-sm text-muted-foreground ml-8">
            Activity overview — tracked locally in your browser
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-0.5">
            {[3, 7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-md transition-colors",
                  days === d
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
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

      {/* A. Summary Cards */}
      <motion.div
        className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {[
          {
            label: "Total Messages",
            value: data.totalMessages,
            icon: <MessageSquare className="w-5 h-5 text-emerald-400" />,
            bgColor: "bg-emerald-500/10",
          },
          {
            label: "Total Tool Calls",
            value: data.totalToolCalls,
            icon: <WrenchIcon className="w-5 h-5 text-amber-400" />,
            bgColor: "bg-amber-500/10",
          },
          {
            label: "Most Active Agent",
            value: mostActiveAgent?.agentName ?? "N/A",
            icon: <Bot className="w-5 h-5 text-purple-400" />,
            bgColor: "bg-purple-500/10",
            isText: true,
          },
          {
            label: "Avg Tools/Message",
            value: avgToolsPerMessage,
            icon: <Sparkles className="w-5 h-5 text-rose-400" />,
            bgColor: "bg-rose-500/10",
          },
        ].map((stat) => (
          <motion.div key={stat.label} variants={itemVariants}>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn("p-2.5 rounded-lg", stat.bgColor)}>
                  {stat.icon}
                </div>
                <div className="min-w-0">
                  <p className={cn(
                    "font-bold text-foreground truncate",
                    stat.isText ? "text-sm" : "text-xl"
                  )}>
                    {stat.value}
                  </p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* B. Activity Chart — 2/3 width */}
        <div className="lg:col-span-2">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.35 }}
          >
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                  <ActivityIcon className="w-4 h-4 text-muted-foreground" />
                  Daily Messages (Last {days} Days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.dailyMessageCounts.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    No messages in the selected period. Start chatting with your agents!
                  </div>
                ) : (
                  <div className="flex items-end gap-3 h-48">
                    {data.dailyMessageCounts.map((day) => {
                      const heightPct = Math.max((day.count / maxDailyCount) * 100, 4);
                      return (
                        <div key={day.date} className="flex-1 flex flex-col items-center gap-2">
                          <span className="text-xs font-semibold text-foreground">
                            {day.count}
                          </span>
                          <div className="w-full relative group">
                            <motion.div
                              className="w-full rounded-t-md bg-primary/80 hover:bg-primary transition-colors cursor-default"
                              initial={{ height: 0 }}
                              animate={{ height: `${heightPct}%` }}
                              transition={{ duration: 0.5, ease: "easeOut" }}
                              style={{ minHeight: "4px" }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground text-center leading-tight truncate w-full">
                            {formatDayLabel(day.date)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* C. Agent Usage Breakdown — 1/3 width */}
        <div>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.35 }}
          >
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  Agent Usage
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.agentUsage.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    No agent activity recorded.
                  </div>
                ) : (
                  <div className="space-y-4 max-h-72 overflow-y-auto custom-scrollbar">
                    {data.agentUsage.map((agent) => {
                      const pct = Math.max((agent.messages / maxAgentMessages) * 100, 4);
                      return (
                        <div key={agent.agentId}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm font-medium text-foreground truncate">
                              {agent.agentName}
                            </span>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{agent.messages} msgs</span>
                              <span>·</span>
                              <span>{agent.toolCalls} tools</span>
                            </div>
                          </div>
                          <div className="w-full h-2 rounded-full bg-accent/60">
                            <motion.div
                              className="h-full rounded-full bg-primary/70"
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.5, ease: "easeOut" }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>

      {/* Bottom grid: Tool Usage + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {/* D. Tool Usage */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.35 }}
        >
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <WrenchIcon className="w-4 h-4 text-muted-foreground" />
                Top Tools Used
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.toolUsage.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No tool calls in the selected period.
                </div>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
                  {data.toolUsage.map((tool, i) => {
                    const pct = Math.max((tool.count / maxToolCount) * 100, 6);
                    return (
                      <div key={tool.toolName} className="flex items-center gap-3">
                        <span className="text-[10px] text-muted-foreground w-5 text-right font-mono">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-mono text-foreground truncate">
                              {tool.toolName}
                            </span>
                            <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
                              {tool.count}
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-accent/60">
                            <motion.div
                              className="h-full rounded-full bg-amber-500/70"
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.5, ease: "easeOut", delay: i * 0.03 }}
                            />
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

        {/* E. Recent Activity Feed */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.35 }}
        >
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.recentActivity.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No recent activity recorded.
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
                  {data.recentActivity.map((event, i) => (
                    <div
                      key={`${event.id || `${event.type}-${i}`}`}
                      className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-accent/30 border border-border/30 hover:border-primary/20 transition-colors"
                    >
                      <div className="w-7 h-7 rounded-full bg-background/60 border border-border/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                        {getActivityIcon(event.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-foreground">
                            {getActivityLabel(event.type)}
                          </span>
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                            {event.agentName}
                          </Badge>
                        </div>
                        {event.data && Object.keys(event.data).length > 0 && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                            {typeof event.data.detail === "string"
                              ? event.data.detail
                              : typeof event.data.toolName === "string"
                                ? `Tool: ${event.data.toolName}`
                                : typeof event.data.messageLength === "number"
                                  ? `Message: ${event.data.messageLength} chars`
                                  : typeof event.data.fromAgentId === "string"
                                    ? `From: ${event.data.fromAgentId}`
                                    : JSON.stringify(event.data).slice(0, 80)}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                          {timeAgo(event.createdAt)}
                        </p>
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
