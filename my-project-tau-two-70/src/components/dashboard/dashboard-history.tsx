"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface HistoryEntry {
  id: number;
  type: "task_completed" | "task_failed" | "delegation" | "chat" | "tool_call";
  agent_id: string;
  agent_name: string;
  summary: string;
  timestamp: string;
  duration_ms?: number | null;
  metadata?: Record<string, unknown>;
}

const AGENT_META: Record<string, { emoji: string; bg: string; name: string }> = {
  general: { emoji: "🤵", bg: "bg-[#eef2ff]", name: "Klawhub General" },
  mail: { emoji: "✉️", bg: "bg-[#eff6ff]", name: "Mail Agent" },
  code: { emoji: "💻", bg: "bg-[#faf5ff]", name: "Code Agent" },
  data: { emoji: "📊", bg: "bg-[#fffbeb]", name: "Data Agent" },
  creative: { emoji: "🧠", bg: "bg-[#fff1f2]", name: "Creative Agent" },
  research: { emoji: "🔍", bg: "bg-[#f0fdfa]", name: "Research Agent" },
  ops: { emoji: "⚡", bg: "bg-[#fff7ed]", name: "Ops Agent" },
  unknown: { emoji: "🤖", bg: "bg-card", name: "Agent" },
};

const TYPE_ICONS: Record<string, { icon: string; label: string }> = {
  task_completed: { icon: "✅", label: "Task done" },
  task_failed: { icon: "❌", label: "Task failed" },
  delegation: { icon: "🔗", label: "Delegation" },
  chat: { icon: "💬", label: "Chat" },
  tool_call: { icon: "🔧", label: "Tool call" },
};

export function DashboardHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard");
      const json = await res.json();
      if (json.success && json.data) {
        const entries: HistoryEntry[] = [];

        // Build from completed/failed tasks
        const tasks = json.data.tasks || [];
        for (const t of tasks) {
          if (t.status === "completed" || t.status === "failed") {
            const agent = AGENT_META[t.agent_id] || AGENT_META["unknown"];
            entries.push({
              id: t.id,
              type: t.status === "completed" ? "task_completed" : "task_failed",
              agent_id: t.agent_id,
              agent_name: agent.name,
              summary: t.task,
              timestamp: t.completed_at || t.created_at,
              duration_ms: t.started_at && t.completed_at
                ? new Date(t.completed_at).getTime() - new Date(t.started_at).getTime()
                : null,
            });
          }
        }

        // Build from delegations
        const delegations = json.data.delegations || [];
        for (const d of delegations) {
          if (d.status === "completed" || d.status === "failed") {
            const from = AGENT_META[d.initiator_agent] || AGENT_META["unknown"];
            const to = AGENT_META[d.assigned_agent] || AGENT_META["unknown"];
            entries.push({
              id: d.id + 100000,
              type: "delegation",
              agent_id: d.initiator_agent,
              agent_name: from.name,
              summary: `${from.emoji} → ${to.emoji}: ${d.task}`,
              timestamp: d.completed_at || d.created_at,
              duration_ms: d.duration_ms,
            });
          }
        }

        // Build from activity events
        const activity = json.data.activity || [];
        for (const a of activity) {
          if (a.action === "chat_message" || a.action === "tool_call") {
            entries.push({
              id: a.id + 200000,
              type: a.action === "chat_message" ? "chat" : "tool_call",
              agent_id: a.agent_id,
              agent_name: a.agent_name || a.agent_id,
              summary: a.detail || a.action,
              timestamp: a.created_at,
            });
          }
        }

        // Sort by timestamp descending, cap at 20
        entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setHistory(entries.slice(0, 20));
      }
    } catch {
      // silent
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, 15000);
    return () => clearInterval(interval);
  }, [fetchHistory]);

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      if (isToday) {
        return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
      }
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
        " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    } catch {
      return "";
    }
  };

  const formatDuration = (ms: number | null | undefined) => {
    if (!ms) return null;
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-[11px] font-semibold text-foreground">Recent History</span>
        <button
          onClick={fetchHistory}
          className="text-[10px] text-[#3730a3] hover:underline transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* History list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center mb-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
                <path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <span className="text-[11px] text-muted-foreground">No history yet</span>
            <span className="text-[10px] text-muted-foreground/60 mt-0.5">
              Completed tasks and activity will appear here
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {history.map((entry) => {
              const agent = AGENT_META[entry.agent_id] || AGENT_META["unknown"];
              const typeInfo = TYPE_ICONS[entry.type] || TYPE_ICONS["chat"];
              const duration = formatDuration(entry.duration_ms);

              return (
                <div
                  key={entry.id}
                  className="flex items-start gap-2.5 px-3 py-2 rounded-lg hover:bg-card transition-colors"
                >
                  {/* Type icon */}
                  <span className="text-xs flex-shrink-0 mt-0.5">{typeInfo.icon}</span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-foreground leading-snug truncate">
                      {entry.summary}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] text-muted-foreground">{formatTime(entry.timestamp)}</span>
                      {duration && (
                        <span className="text-[9px] text-muted-foreground">{duration}</span>
                      )}
                      <span className="text-[9px] text-muted-foreground/60">{agent.name}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
