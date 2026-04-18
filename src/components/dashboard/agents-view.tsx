"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ChatIcon,
  SendIcon,
  WrenchIcon,
  ActivityIcon,
  SparklesIcon,
  Loader2,
  Users,
} from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PageKey } from "@/components/dashboard/sidebar";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentCard {
  id: string;
  name: string;
  role: string;
  emoji: string;
  description: string;
  provider: string;
  model: string;
  color: string;
  tools: string[];
  status: {
    id: string;
    status: "idle" | "busy" | "error" | "offline";
    currentTask: string | null;
    lastActivity: string | null;
    tasksCompleted: number;
    messagesProcessed: number;
  };
}

interface ActivityEntry {
  id: string;
  timestamp: string;
  agentEmoji: string;
  agentName: string;
  action: string;
}

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

// ---------------------------------------------------------------------------
// Color map
// ---------------------------------------------------------------------------

const colorMap: Record<string, { bg: string; text: string; border: string; badge: string; dot: string; ring: string }> = {
  emerald: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-600",
    border: "border-emerald-500/30",
    badge: "bg-emerald-500/20 text-emerald-600",
    dot: "bg-emerald-500",
    ring: "ring-emerald-500/20",
  },
  blue: {
    bg: "bg-blue-500/10",
    text: "text-blue-600",
    border: "border-blue-500/30",
    badge: "bg-blue-500/20 text-blue-600",
    dot: "bg-blue-400",
    ring: "ring-blue-500/20",
  },
  purple: {
    bg: "bg-purple-500/10",
    text: "text-purple-600",
    border: "border-purple-500/30",
    badge: "bg-purple-500/20 text-purple-600",
    dot: "bg-purple-400",
    ring: "ring-purple-500/20",
  },
  amber: {
    bg: "bg-amber-500/10",
    text: "text-amber-600",
    border: "border-amber-500/30",
    badge: "bg-amber-500/20 text-amber-600",
    dot: "bg-amber-400",
    ring: "ring-amber-500/20",
  },
  rose: {
    bg: "bg-rose-500/10",
    text: "text-rose-600",
    border: "border-rose-500/30",
    badge: "bg-rose-500/20 text-rose-600",
    dot: "bg-rose-400",
    ring: "ring-rose-500/20",
  },
  teal: {
    bg: "bg-teal-500/10",
    text: "text-teal-600",
    border: "border-teal-500/30",
    badge: "bg-teal-500/20 text-teal-600",
    dot: "bg-teal-400",
    ring: "ring-teal-500/20",
  },
  orange: {
    bg: "bg-orange-500/10",
    text: "text-orange-600",
    border: "border-orange-500/30",
    badge: "bg-orange-500/20 text-orange-600",
    dot: "bg-orange-400",
    ring: "ring-orange-500/20",
  },
};

// ---------------------------------------------------------------------------
// Status color
// ---------------------------------------------------------------------------

const statusColors: Record<string, string> = {
  idle: "bg-emerald-500",
  busy: "bg-amber-400",
  error: "bg-red-500",
  offline: "bg-muted-foreground",
};

const statusLabels: Record<string, string> = {
  idle: "Idle",
  busy: "Busy",
  error: "Error",
  offline: "Offline",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AgentsViewProps {
  onNavigate: (key: PageKey) => void;
}

export function AgentsView({ onNavigate }: AgentsViewProps) {
  const [agents, setAgents] = useState<AgentCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [quickTaskAgent, setQuickTaskAgent] = useState<string | null>(null);
  const [quickTaskText, setQuickTaskText] = useState("");
  const [dispatching, setDispatching] = useState(false);

  // Fetch agents with status — fetch once on mount, then only on-demand
  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/agents");
      const json = await res.json();
      if (json.success && json.data) {
        setAgents(json.data);
      }
    } catch {
      /* silent */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAgents();
    // No auto-polling — agents view fetches once on mount.
    // Status updates come from the notification system (Phase 2).
  }, [fetchAgents]);

  // Handle dispatch quick task
  const handleQuickTask = async (agentId: string) => {
    if (!quickTaskText.trim()) return;
    setDispatching(true);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "dispatch",
          agentId,
          task: quickTaskText,
        }),
      });
      const json = await res.json();
      if (json.success) {
        // Add activity
        const agent = agents.find((a) => a.id === agentId);
        if (agent) {
          setActivities((prev) => [
            {
              id: Date.now().toString(),
              timestamp: new Date().toISOString(),
              agentEmoji: agent.emoji,
              agentName: agent.name,
              action: `Task dispatched: ${quickTaskText.slice(0, 60)}`,
            },
            ...prev,
          ]);
        }
        setQuickTaskText("");
        setQuickTaskAgent(null);
        // Refresh
        setTimeout(fetchAgents, 1000);
      }
    } catch {
      /* silent */
    }
    setDispatching(false);
  };

  // Handle Chat button
  const handleChat = (agentId: string) => {
    localStorage.setItem("claw-selected-agent", agentId);
    onNavigate("chat");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <Users className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-xl font-bold text-foreground">Agent Team</h2>
        </div>
        <p className="text-sm text-muted-foreground ml-8">
          Manage and monitor your AI specialist agents
        </p>
      </div>

      {/* Agent Cards Grid */}
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {agents.map((agent) => {
          const colors = colorMap[agent.color] || colorMap.emerald;

          return (
            <motion.div key={agent.id}>
              <Card className="hover:border-primary/20 transition-all duration-300 hover:shadow-md">
                <CardContent className="p-5">
                  {/* Top row: Agent info + Status */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", colors.bg)}>
                        <span className="text-2xl">{agent.emoji}</span>
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">{agent.name}</h3>
                        <p className="text-[11px] text-muted-foreground">{agent.role}</p>
                      </div>
                    </div>
                    <Badge
                      variant={
                        agent.status.status === "idle"
                          ? "success"
                          : agent.status.status === "busy"
                            ? "warning"
                            : agent.status.status === "error"
                              ? "destructive"
                              : "secondary"
                      }
                      className="text-[10px] gap-1"
                    >
                      <span className={cn("w-1.5 h-1.5 rounded-full", statusColors[agent.status.status])} />
                      {statusLabels[agent.status.status]}
                    </Badge>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                    {agent.description}
                  </p>

                  {/* Stats row */}
                  <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <WrenchIcon className="w-3 h-3" />
                      <span>{agent.tools.length} tools</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ActivityIcon className="w-3 h-3" />
                      <span>{agent.status.tasksCompleted} tasks</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <SparklesIcon className="w-3 h-3" />
                      <span>{agent.status.messagesProcessed} msgs</span>
                    </div>
                  </div>

                  {/* Model info */}
                  <div className="flex items-center gap-2 mb-4">
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {agent.provider}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground font-mono truncate">
                      {agent.model}
                    </span>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleChat(agent.id)}
                      className={cn(
                        "text-xs gap-1.5 flex-1 transition-colors",
                        colors.border,
                        colors.text,
                        "hover:bg-opacity-10"
                      )}
                    >
                      <ChatIcon className="w-3.5 h-3.5" />
                      Chat
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setQuickTaskAgent(quickTaskAgent === agent.id ? null : agent.id)}
                      className="text-xs gap-1.5 flex-1 text-muted-foreground hover:text-foreground"
                    >
                      <SendIcon className="w-3.5 h-3.5" />
                      Quick Task
                    </Button>
                  </div>

                  {/* Quick Task Inline Form */}
                  {quickTaskAgent === agent.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-3 pt-3 border-t border-border/50"
                    >
                      <textarea
                        value={quickTaskText}
                        onChange={(e) => setQuickTaskText(e.target.value)}
                        placeholder="Describe a quick task..."
                        rows={2}
                        className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                      <div className="flex justify-end mt-2">
                        <Button
                          size="sm"
                          onClick={() => handleQuickTask(agent.id)}
                          disabled={!quickTaskText.trim() || dispatching}
                          className={cn("text-xs gap-1", colors.bg, colors.text)}
                        >
                          {dispatching ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <SendIcon className="w-3 h-3" />
                          )}
                          Dispatch
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Activity Log */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.35 }}
      >
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <ActivityIcon className="w-4 h-4 text-muted-foreground" />
              Activity Log
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full bg-accent/50 flex items-center justify-center mx-auto mb-3">
                  <ActivityIcon className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">No recent activity</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Dispatch tasks or chat with agents to see activity here.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar">
                {activities.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-accent/30 border border-border/30"
                  >
                    <span className="text-sm mt-0.5">{activity.agentEmoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground">{activity.action}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {activity.agentName} ·{" "}
                        {new Date(activity.timestamp).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
