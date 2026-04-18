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
      delta: metrics && metrics.messagesToday > 0 ? `${metrics.messagesToday} today` : "—",
      deltaType: "up" as const,
    },
    {
      label: "Tool Calls",
      value: toolCallsToday,
      color: "text-blue-400",
      delta: metrics && metrics.toolCallsToday > 0 ? `${metrics.toolCallsToday} today` : "—",
      deltaType: "up" as const,
    },
    {
      label: "Delegations",
      value: activeDelegations,
      color: "text-purple-400",
      delta: metrics && metrics.activeDelegations > 0 ? `${metrics.activeDelegations} active` : "0 active",
      deltaType: "up" as const,
    },
    {
      label: "Tasks Done",
      value: tasksDone,
      color: "text-amber-400",
      delta: metrics && metrics.tasksDone > 0 ? "completed" : "—",
      deltaType: "up" as const,
    },
    {
      label: "Uptime",
      value: uptime,
      color: "text-emerald-300",
      delta: "All systems",
      deltaType: "up" as const,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 mb-5 overflow-x-auto scrollbar-none">
      {data.map((m) => (
        <div
          key={m.label}
          className="bg-secondary border border-border rounded-xl px-4 py-3.5 min-w-[140px]"
        >
          <div className="text-[10px] font-semibold uppercase tracking-[0.8px] text-muted-foreground/70 mb-1.5">
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
            className={`text-[10px] mt-1 ${m.deltaType === "up" ? "text-emerald-400" : "text-red-400"}`}
          >
            {m.delta}
          </div>
        </div>
      ))}
    </div>
  );
}
