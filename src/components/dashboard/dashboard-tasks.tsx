"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Plus, Check, Loader2 } from "lucide-react";
import type { AgentTaskView } from "@/hooks/use-dashboard-stream";
import { getAllAgents } from "@/lib/agents";

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
  unknown: { emoji: "🤖", bg: "bg-card", name: "Agent" },
};

const PRIORITY_STYLES: Record<string, string> = {
  critical: "bg-red-50 text-red-700 border border-red-200",
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
  const [showCreate, setShowCreate] = useState(false);
  const [createAgent, setCreateAgent] = useState("general");
  const [createPriority, setCreatePriority] = useState("medium");
  const [createText, setCreateText] = useState("");
  const [creating, setCreating] = useState(false);
  const [completing, setCompleting] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

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
    .slice(0, 5);

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

  const handleCreateTask = async () => {
    if (!createText.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "dispatch",
          agentId: createAgent,
          task: createText.trim(),
          priority: createPriority,
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast("Task created");
        setCreateText("");
        setShowCreate(false);
        fetchTasks();
      } else {
        showToast(json.error || "Failed to create task");
      }
    } catch {
      showToast("Failed to create task");
    }
    setCreating(false);
  };

  const handleMarkDone = async (taskId: number) => {
    setCompleting(taskId);
    try {
      const res = await fetch("/api/taskboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", taskId: String(taskId), status: "done" }),
      });
      const json = await res.json();
      if (json.success) {
        showToast("Task completed ✓");
        fetchTasks();
      }
    } catch {
      showToast("Failed to update task");
    }
    setCompleting(null);
  };

  const agents = getAllAgents();

  return (
    <div className="flex flex-col h-full">
      {/* Header with filter + create button */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-1">
          {(["all", "active", "completed"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "text-[10px] font-semibold px-2.5 py-1 rounded-md capitalize transition-colors",
                filter === f
                  ? "bg-primary text-white"
                  : "bg-card text-muted-foreground hover:bg-muted"
              )}
            >
              {f}
            </button>
          ))}
          <span className="text-[10px] text-muted-foreground ml-1">
            {filtered.length}
          </span>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className={cn(
            "text-[10px] font-semibold px-2.5 py-1 rounded-md transition-colors",
            showCreate
              ? "bg-primary text-white"
              : "bg-card text-[#3730a3] hover:bg-accent"
          )}
        >
          + New
        </button>
      </div>

      {/* Create Task Form */}
      {showCreate && (
        <div className="px-4 py-3 border-b border-border bg-card space-y-2">
          <textarea
            value={createText}
            onChange={(e) => setCreateText(e.target.value)}
            placeholder="Describe the task..."
            rows={2}
            className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring/40 transition-all"
          />
          <div className="flex items-center gap-2">
            <select
              value={createAgent}
              onChange={(e) => setCreateAgent(e.target.value)}
              className="flex-1 h-7 rounded-md border border-border bg-card px-2 py-0.5 text-[10px] text-foreground focus:outline-none focus:border-ring/40"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.emoji} {a.name}
                </option>
              ))}
            </select>
            <select
              value={createPriority}
              onChange={(e) => setCreatePriority(e.target.value)}
              className="h-7 rounded-md border border-border bg-card px-2 py-0.5 text-[10px] text-foreground focus:outline-none focus:border-ring/40"
            >
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <button
              onClick={handleCreateTask}
              disabled={!createText.trim() || creating}
              className="h-7 px-3 rounded-md bg-primary text-white text-[10px] font-semibold disabled:opacity-50 flex items-center gap-1"
            >
              {creating ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : null}
              Create
            </button>
          </div>
        </div>
      )}

      {/* Task list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 relative">
        {/* Toast */}
        {toast && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-lg bg-[#1a1a2e] text-white text-[10px] font-medium shadow-lg">
            {toast}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center mb-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
                <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                <rect x="9" y="3" width="6" height="4" rx="2" />
              </svg>
            </div>
            <span className="text-[11px] text-muted-foreground">No tasks yet</span>
            <span className="text-[10px] text-muted-foreground/60 mt-0.5">
              Click + New to create one
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filtered.map((task) => {
              const agent = AGENT_META[task.agent_id] || AGENT_META["unknown"];
              const priorityStyle = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES["medium"];
              const statusStyle = STATUS_STYLES[task.status] || STATUS_STYLES["pending"];
              const duration = formatDuration(task.started_at, task.completed_at);
              const isActive = task.status === "pending" || task.status === "running";

              return (
                <div
                  key={task.id}
                  className={cn(
                    "flex items-start gap-2.5 px-3 py-2.5 rounded-lg border transition-colors",
                    task.status === "running"
                      ? "bg-[#eef2ff]/50 border-primary/20"
                      : "bg-card border-border hover:border-border"
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
                    <div className="text-[11px] font-semibold text-foreground leading-snug truncate">
                      {task.task}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[9px] text-muted-foreground">
                        {formatTime(task.created_at)}
                      </span>
                      {duration && (
                        <span className="text-[9px] text-muted-foreground">{duration}</span>
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

                  {/* Mark done button for active tasks */}
                  {isActive && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleMarkDone(task.id); }}
                      disabled={completing === task.id}
                      className={cn(
                        "flex-shrink-0 mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors",
                        completing === task.id
                          ? "border-primary/30 bg-primary/10"
                          : "border-border hover:border-emerald-500 hover:bg-emerald-50"
                      )}
                      title="Mark as done"
                    >
                      {completing === task.id ? (
                        <Loader2 className="w-3 h-3 animate-spin text-[#3730a3]" />
                      ) : (
                        <Check className="w-3 h-3 text-transparent group-hover:text-emerald-600" />
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
