"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { TodoView } from "@/hooks/use-dashboard-stream";

interface ActiveTasksProps {
  todos?: TodoView[];
}

const PRIORITY_STYLES: Record<string, string> = {
  critical: "bg-red-500/15 text-red-400 border border-red-500/20",
  high: "bg-red-500/10 text-red-400 border border-red-500/15",
  medium: "bg-amber-500/10 text-amber-400 border border-amber-500/15",
  med: "bg-amber-500/10 text-amber-400 border border-amber-500/15",
  low: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/15",
};

// Agent emoji map
const AGENT_EMOJI: Record<string, { emoji: string; bg: string }> = {
  general: { emoji: "🤵", bg: "bg-emerald-500/[0.15]" },
  mail: { emoji: "✉️", bg: "bg-blue-500/[0.15]" },
  code: { emoji: "💻", bg: "bg-purple-500/[0.15]" },
  data: { emoji: "📊", bg: "bg-amber-500/[0.15]" },
  creative: { emoji: "🧠", bg: "bg-rose-500/[0.15]" },
  research: { emoji: "🔍", bg: "bg-teal-500/[0.15]" },
  ops: { emoji: "⚡", bg: "bg-orange-500/[0.15]" },
};

export function ActiveTasks({ todos }: ActiveTasksProps) {
  const [localTodos, setLocalTodos] = useState<TodoView[]>(todos || []);
  const [updating, setUpdating] = useState<number | null>(null);

  // Sync external todos to local state
  if (todos && todos !== localTodos && todos.length !== localTodos.length) {
    setLocalTodos(todos);
  }

  const toggleDone = useCallback(async (todo: TodoView) => {
    const newStatus = todo.status === "done" ? "open" : "done";
    setUpdating(todo.id);

    // Optimistic update
    setLocalTodos((prev) =>
      prev.map((t) => (t.id === todo.id ? { ...t, status: newStatus } : t))
    );

    try {
      await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: todo.id, status: newStatus }),
      });
    } catch {
      // Revert on error
      setLocalTodos((prev) =>
        prev.map((t) => (t.id === todo.id ? { ...t, status: todo.status } : t))
      );
    } finally {
      setUpdating(null);
    }
  }, []);

  const openTodos = localTodos.filter((t) => t.status !== "done" && t.status !== "archived");
  const doneTodos = localTodos.filter((t) => t.status === "done").slice(0, 3);
  const displayTodos = [...openTodos, ...doneTodos];

  const getPriorityLabel = (priority: string, done: boolean) => {
    if (done) return "Done";
    if (priority === "medium" || priority === "med") return "Med";
    return priority;
  };

  const formatMeta = (todo: TodoView) => {
    const parts: string[] = [];
    if (todo.due_date) {
      const today = new Date().toISOString().split("T")[0];
      const due = todo.due_date;
      if (due === today) parts.push("Due today");
      else {
        try {
          const d = new Date(due + "T00:00:00");
          parts.push(`Due ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
        } catch {
          parts.push(`Due ${due}`);
        }
      }
    }
    if (todo.assigned_agent) {
      const meta = AGENT_EMOJI[todo.assigned_agent];
      if (meta) parts.push(`Assigned to ${todo.assigned_agent}`);
      else parts.push(`Assigned to ${todo.assigned_agent}`);
    }
    if (todo.status === "done") parts.push("Completed");
    return parts.join(" · ") || "No details";
  };

  const getAgentMeta = (todo: TodoView) => {
    if (!todo.assigned_agent) return { emoji: "📋", bg: "bg-white/[0.06]" };
    return AGENT_EMOJI[todo.assigned_agent] || { emoji: "📋", bg: "bg-white/[0.06]" };
  };

  return (
    <div className="cyber-card flex flex-col overflow-hidden h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.06]">
        <span className="text-[13px] font-bold text-white">Active Tasks</span>
        <span className="text-[10px] text-emerald-400 cursor-pointer hover:text-emerald-300 transition-colors">
          View All →
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 p-3 overflow-y-auto custom-scrollbar">
        {displayTodos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-8 h-8 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-600">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </div>
            <div className="text-[11px] text-slate-600">
              No tasks yet
            </div>
            <div className="text-[10px] text-slate-700 mt-0.5">
              Ask an agent to create tasks
            </div>
          </div>
        ) : (
          displayTodos.map((todo) => {
            const done = todo.status === "done";
            const isUpdating = updating === todo.id;
            const agentMeta = getAgentMeta(todo);
            const priorityKey = todo.priority || "medium";

            return (
              <div
                key={todo.id}
                className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg border-b last:border-b-0" style={{ borderColor: "rgba(255,255,255,0.04)" }}
              >
                {/* Checkbox */}
                <button
                  onClick={() => toggleDone(todo)}
                  disabled={isUpdating}
                  className={cn(
                    "w-[18px] h-[18px] rounded-md border-2 flex-shrink-0 flex items-center justify-center cursor-pointer transition-all duration-150",
                    done
                      ? "bg-emerald-500 border-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]"
                      : "border-slate-600 hover:border-slate-400",
                    isUpdating && "opacity-50"
                  )}
                >
                  {done && (
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div
                    className={cn(
                      "text-xs font-semibold",
                      done
                        ? "line-through text-slate-600"
                        : "text-slate-200"
                    )}
                  >
                    {todo.title}
                  </div>
                  <div className="text-[10px] text-slate-600 mt-0.5">
                    {formatMeta(todo)}
                  </div>
                </div>

                {/* Priority badge */}
                <span
                  className={cn(
                    "text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0",
                    PRIORITY_STYLES[priorityKey] || PRIORITY_STYLES.medium
                  )}
                >
                  {getPriorityLabel(priorityKey, done)}
                </span>

                {/* Agent chip */}
                <div
                  className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-[10px] flex-shrink-0 ${agentMeta.bg}`}
                >
                  {agentMeta.emoji}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
