"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { AgentTaskView } from "@/hooks/use-dashboard-stream";

interface DashboardTasksProps {
  tasks: AgentTaskView[];
}

const AGENT_META: Record<string, { emoji: string; bg: string; name: string }> = {
  general: { emoji: "🤵", bg: "bg-[#eef2ff]", name: "Claw General" },
  mail: { emoji: "✉️", bg: "bg-[#eff6ff]", name: "Mail Agent" },
  code: { emoji: "💻", bg: "bg-[#faf5ff]", name: "Code Agent" },
  data: { emoji: "📊", bg: "bg-[#fffbeb]", name: "Data Agent" },
  creative: { emoji: "🧠", bg: "bg-[#fff1f2]", name: "Creative Agent" },
  research: { emoji: "🔍", bg: "bg-[#f0fdfa]", name: "Research Agent" },
  ops: { emoji: "⚡", bg: "bg-[#fff7ed]", name: "Ops Agent" },
  unknown: { emoji: "🤖", bg: "bg-[#faf9f7]", name: "Agent" },
};

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-red-50 text-red-600 border border-red-100",
  medium: "bg-amber-50 text-amber-700 border border-amber-200",
  low: "bg-[#eef2ff] text-[#3730a3] border border-indigo-200",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border border-amber-200",
  running: "bg-[#eef2ff] text-[#3730a3] border border-indigo-200",
  completed: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  failed: "bg-red-50 text-red-700 border border-red-200",
};

export function DashboardTasks({ tasks: streamTasks }: DashboardTasksProps) {
  const [tasks, setTasks] = useState<AgentTaskView[]>([]);
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");

  // Fetch latest tasks from API on mount and periodically
  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard");
      const json = await res.json();
      if (json.success && json.data?.tasks) {
        setTasks(json.data.tasks);
      }
    } catch {
      // use stream data as fallback
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 10000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  // Merge stream tasks for real-time feel
  const mergedTasks = streamTasks.length > tasks.length ? streamTasks : tasks;

  // Filter
  const filtered = mergedTasks
    .filter((t) => {
      if (filter === "active") return t.status === "pending" || t.status === "running";
      if (filter === "completed") return t.status === "completed" || t.status === "failed";
      return true;
    })
    .slice(0, 10); // Always cap at 10, newest first

  const formatTime = (iso: string | null) => {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return "";
    }
  };

  const formatDuration = (started: string | null, completed: string | null) => {
    if (!started || !completed) return null;
    const ms = new Date(completed).getTime() - new Date(started).getTime();
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with filter */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8e5df]">
        <div className="flex items-center gap-1">
          {(["all", "active", "completed"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "text-[10px] font-semibold px-2.5 py-1 rounded-md capitalize transition-colors",
                filter === f
                  ? "bg-[#3730a3] text-white"
                  : "bg-[#faf9f7] text-[#6b6b6b] hover:bg-[#f0ede8]"
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-[#999999]">
          {filtered.length} shown
        </span>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-10 h-10 rounded-full bg-[#faf9f7] border border-[#e8e5df] flex items-center justify-center mb-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[#999999]">
                <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                <rect x="9" y="3" width="6" height="4" rx="2" />
              </svg>
            </div>
            <span className="text-[11px] text-[#999999]">No tasks yet</span>
            <span className="text-[10px] text-[#d5d0c9] mt-0.5">
              Assign a task from the Agents page
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filtered.map((task) => {
              const agent = AGENT_META[task.agent_id] || AGENT_META["unknown"];
              const priorityStyle = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES["medium"];
              const statusStyle = STATUS_STYLES[task.status] || STATUS_STYLES["pending"];
              const duration = formatDuration(task.started_at, task.completed_at);

              return (
                <div
                  key={task.id}
                  className={cn(
                    "flex items-start gap-2.5 px-3 py-2.5 rounded-lg border transition-colors",
                    task.status === "running"
                      ? "bg-[#eef2ff]/50 border-[#3730a3]/20"
                      : "bg-white border-[#f0ede8] hover:border-[#e8e5df]"
                  )}
                >
                  {/* Agent avatar */}
                  <div
                    className={cn(
                      "w-[26px] h-[26px] rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5",
                      agent.bg
                    )}
                    title={agent.name}
                  >
                    {agent.emoji}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-semibold text-[#1a1a1a] leading-snug truncate">
                      {task.task}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[9px] text-[#999999]">
                        {formatTime(task.created_at)}
                      </span>
                      {duration && (
                        <span className="text-[9px] text-[#999999]">{duration}</span>
                      )}
                      <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded", statusStyle)}>
                        {task.status}
                      </span>
                      <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded", priorityStyle)}>
                        {task.priority}
                      </span>
                    </div>
                    {task.error && (
                      <div className="text-[10px] text-red-500 mt-1 truncate">{task.error}</div>
                    )}
                  </div>

                  {/* Task ID */}
                  <span className="text-[9px] text-[#d5d0c9] font-mono flex-shrink-0">
                    #{task.id}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
