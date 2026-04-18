"use client";

import { cn } from "@/lib/utils";

interface Task {
  id: number;
  title: string;
  meta: string;
  priority: "high" | "med" | "low";
  done: boolean;
  agentEmoji: string;
  agentBg: string;
}

const MOCK_TASKS: Task[] = [
  {
    id: 1,
    title: "Respond to client contract renewal",
    meta: "Due today · Assigned to Mail Agent",
    priority: "high",
    done: false,
    agentEmoji: "✉️",
    agentBg: "bg-blue-500/[0.15]",
  },
  {
    id: 2,
    title: "Review and merge PR #42",
    meta: "Due today · Assigned to Code Agent",
    priority: "high",
    done: false,
    agentEmoji: "💻",
    agentBg: "bg-purple-500/[0.15]",
  },
  {
    id: 3,
    title: "SaaS market research brief",
    meta: "Due tomorrow · Assigned to Research Agent",
    priority: "med",
    done: false,
    agentEmoji: "🔍",
    agentBg: "bg-teal-500/[0.15]",
  },
  {
    id: 4,
    title: "Update deployment to staging",
    meta: "Completed · Code Agent",
    priority: "low",
    done: true,
    agentEmoji: "💻",
    agentBg: "bg-purple-500/[0.15]",
  },
  {
    id: 5,
    title: "Send meeting notes to team",
    meta: "Completed · Mail Agent",
    priority: "low",
    done: true,
    agentEmoji: "✉️",
    agentBg: "bg-blue-500/[0.15]",
  },
  {
    id: 6,
    title: "Create pitch deck slides 1-10",
    meta: "Due in 3 days · Assigned to Creative Agent",
    priority: "med",
    done: false,
    agentEmoji: "🎨",
    agentBg: "bg-rose-500/[0.15]",
  },
];

const PRIORITY_STYLES = {
  high: "bg-red-500/10 text-red-400",
  med: "bg-amber-500/10 text-amber-400",
  low: "bg-blue-500/10 text-blue-400",
};

export function ActiveTasks() {
  return (
    <div className="bg-white/[0.02] border border-white/[0.05] rounded-[14px] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.04]">
        <span className="text-[13px] font-bold text-zinc-100">Active Tasks</span>
        <span className="text-[10px] text-emerald-400 cursor-pointer">
          View All →
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 p-3 overflow-y-auto custom-scrollbar">
        {MOCK_TASKS.map((task) => (
          <div
            key={task.id}
            className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg border-b border-white/[0.03] last:border-b-0"
          >
            {/* Checkbox */}
            <div
              className={cn(
                "w-[18px] h-[18px] rounded-md border-2 flex-shrink-0 flex items-center justify-center",
                task.done
                  ? "bg-emerald-500 border-emerald-500"
                  : "border-zinc-700"
              )}
            >
              {task.done && (
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
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div
                className={cn(
                  "text-xs font-semibold",
                  task.done
                    ? "line-through text-zinc-600"
                    : "text-zinc-200"
                )}
              >
                {task.title}
              </div>
              <div className="text-[10px] text-zinc-600 mt-0.5">
                {task.meta}
              </div>
            </div>

            {/* Priority badge */}
            <span
              className={cn(
                "text-[9px] font-bold px-1.5 py-0.5 rounded uppercase flex-shrink-0",
                PRIORITY_STYLES[task.priority]
              )}
            >
              {task.priority === "med" ? "Med" : task.priority === "low" && task.done ? "Done" : task.priority}
            </span>

            {/* Agent chip */}
            <div
              className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-[10px] flex-shrink-0 ${task.agentBg}`}
            >
              {task.agentEmoji}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
