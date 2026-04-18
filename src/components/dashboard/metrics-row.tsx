"use client";

import type { DashboardMetricsView } from "@/hooks/use-dashboard-stream";

interface MetricsRowProps {
  metrics?: DashboardMetricsView | null;
}

export function MetricsRow({ metrics }: MetricsRowProps) {
  // Use real metrics if available, otherwise show dashes
  const messagesToday = metrics ? String(metrics.messagesToday) : "—";
  const toolCallsToday = metrics ? String(metrics.toolCallsToday) : "—";
  const activeDelegations = metrics ? String(metrics.activeDelegations) : "—";
  const tasksDone = metrics ? String(metrics.tasksDone) : "—";
  const uptime = "99.9%";

  const data = [
    {
      label: "Messages",
      value: messagesToday,
      color: "text-emerald-400",
      glow: "shadow-[inset_0_0_20px_rgba(16,185,129,0.05)]",
      delta: metrics && metrics.messagesToday > 0 ? `${metrics.messagesToday} today` : "—",
      deltaType: "up" as const,
    },
    {
      label: "Tool Calls",
      value: toolCallsToday,
      color: "text-cyan-400",
      glow: "shadow-[inset_0_0_20px_rgba(6,182,212,0.05)]",
      delta: metrics && metrics.toolCallsToday > 0 ? `${metrics.toolCallsToday} today` : "—",
      deltaType: "up" as const,
    },
    {
      label: "Delegations",
      value: activeDelegations,
      color: "text-purple-400",
      glow: "shadow-[inset_0_0_20px_rgba(168,85,247,0.05)]",
      delta: metrics && metrics.activeDelegations > 0 ? `${metrics.activeDelegations} active` : "0 active",
      deltaType: "up" as const,
    },
    {
      label: "Tasks Done",
      value: tasksDone,
      color: "text-amber-400",
      glow: "shadow-[inset_0_0_20px_rgba(245,158,11,0.05)]",
      delta: metrics && metrics.tasksDone > 0 ? "completed" : "—",
      deltaType: "up" as const,
    },
    {
      label: "Uptime",
      value: uptime,
      color: "text-emerald-300",
      glow: "shadow-[inset_0_0_20px_rgba(16,185,129,0.05)]",
      delta: "All systems",
      deltaType: "up" as const,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 mb-5 overflow-x-auto scrollbar-none">
      {data.map((m) => (
        <div
          key={m.label}
          className="cyber-card px-4 py-3.5 min-w-[140px] flex justify-between items-start"
        >
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.8px] text-slate-500 mb-1.5">
              {m.label}
            </div>
            <div className={`text-[26px] font-extrabold leading-none ${m.color}`}>
              {m.label === "Uptime" ? (
                <>
                  {m.value.replace("%", "")}
                  <span className="text-sm">%</span>
                </>
              ) : (
                m.value
              )}
            </div>
            <div
              className={`text-[10px] mt-1 ${m.deltaType === "up" ? "text-emerald-400/70" : "text-red-400"}`}
            >
              {m.delta}
            </div>
          </div>
          <svg className="w-4 h-4 text-slate-600 flex-shrink-0 mt-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        </div>
      ))}
    </div>
  );
}
