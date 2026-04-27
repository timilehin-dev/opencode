"use client";

import { useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/core/utils";
import type { TodoView } from "@/hooks/use-dashboard-stream";

interface ActiveTasksProps {
  todos?: TodoView[];
}

const PRIORITY_STYLES: Record<string, string> = {
  critical: "bg-red-50 text-red-700 border border-red-200",
  high: "bg-red-50 text-red-600 border border-red-100",
  medium: "bg-amber-50 text-amber-700 border border-amber-200",
  med: "bg-amber-50 text-amber-700 border border-amber-200",
  low: "bg-[#eef2ff] text-[#3730a3] border border-indigo-200",
};

const AGENT_EMOJI: Record<string, { emoji: string; bg: string }> = {
  general: { emoji: "🤵", bg: "bg-[#eef2ff]" },
  mail: { emoji: "✉️", bg: "bg-[#eff6ff]" },
  code: { emoji: "💻", bg: "bg-[#faf5ff]" },
  data: { emoji: "📊", bg: "bg-[#fffbeb]" },
  creative: { emoji: "🧠", bg: "bg-[#fff1f2]" },
  research: { emoji: "🔍", bg: "bg-[#f0fdfa]" },
  ops: { emoji: "⚡", bg: "bg-[#fff7ed]" },
};

export function ActiveTasks({ todos }: ActiveTasksProps) {
  const [localTodos, setLocalTodos] = useState<TodoView[]>(todos || []);
  const [updating, setUpdating] = useState<number | null>(null);

  // Sync parent-provided todos into local state (avoid render-time setState)
  useEffect(() => {
    if (todos && todos !== localTodos && todos.length !== localTodos.length) {
      setLocalTodos(todos);
    }
  }, [todos]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleDone = useCallback(async (todo: TodoView) => {
    const newStatus = todo.status === "done" ? "open" : "done";
    setUpdating(todo.id);

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
      parts.push(`Assigned to ${todo.assigned_agent}`);
    }
    if (todo.status === "done") parts.push("Completed");
    return parts.join(" · ") || "No details";
  };

  const getAgentMeta = (todo: TodoView) => {
    if (!todo.assigned_agent) return { emoji: "📋", bg: "bg-card" };
    return AGENT_EMOJI[todo.assigned_agent] || { emoji: "📋", bg: "bg-card" };
  };

  return (
    <div className="bg-card rounded-lg border border-border shadow-sm flex flex-col overflow-hidden h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
        <span className="text-[13px] font-semibold text-foreground">Active Tasks</span>
        <span className="text-[10px] text-[#3730a3] cursor-pointer hover:underline transition-colors">
          View All →
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 p-3 overflow-y-auto custom-scrollbar">
        {displayTodos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center mb-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </div>
            <div className="text-[11px] text-muted-foreground">No tasks yet</div>
            <div className="text-[10px] text-muted-foreground/60 mt-0.5">Ask an agent to create tasks</div>
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
                className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg border-b last:border-b-0 border-border"
              >
                <button
                  onClick={() => toggleDone(todo)}
                  disabled={isUpdating}
                  className={cn(
                    "w-[18px] h-[18px] rounded-md border-2 flex-shrink-0 flex items-center justify-center cursor-pointer transition-all duration-150",
                    done
                      ? "bg-primary border-primary"
                      : "border-border hover:border-border",
                    isUpdating && "opacity-50"
                  )}
                >
                  {done && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <div className={cn("text-xs font-semibold", done ? "line-through text-muted-foreground" : "text-foreground")}>
                    {todo.title}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{formatMeta(todo)}</div>
                </div>
                <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0", PRIORITY_STYLES[priorityKey] || PRIORITY_STYLES.medium)}>
                  {getPriorityLabel(priorityKey, done)}
                </span>
                <div className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-[10px] flex-shrink-0 ${agentMeta.bg}`}>
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
