"use client";

import type { DashboardMetricsView } from "@/hooks/use-dashboard-stream";

interface MetricsRowProps {
  metrics?: DashboardMetricsView | null;
}

export function MetricsRow({ metrics }: MetricsRowProps) {
  const messagesToday = metrics ? String(metrics.messagesToday) : "—";
  const toolCallsToday = metrics ? String(metrics.toolCallsToday) : "—";
  const activeDelegations = metrics ? String(metrics.activeDelegations) : "—";
  const tasksDone = metrics ? String(metrics.tasksDone) : "—";
  const uptime = "99.9%";

  const data = [
    {
      label: "Messages",
      value: messagesToday,
      delta: metrics && metrics.messagesToday > 0 ? `${metrics.messagesToday} today` : "—",
    },
    {
      label: "Tool Calls",
      value: toolCallsToday,
      delta: metrics && metrics.toolCallsToday > 0 ? `${metrics.toolCallsToday} today` : "—",
    },
    {
      label: "Delegations",
      value: activeDelegations,
      delta: metrics && metrics.activeDelegations > 0 ? `${metrics.activeDelegations} active` : "0 active",
    },
    {
      label: "Tasks Done",
      value: tasksDone,
      delta: metrics && metrics.tasksDone > 0 ? "completed" : "—",
    },
    {
      label: "Uptime",
      value: uptime,
      delta: "All systems",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
      {data.map((m) => (
        <div
          key={m.label}
          className="bg-white px-4 py-3.5 min-w-[140px] rounded-lg border border-[#e8e5df] shadow-sm"
        >
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-[#999999] mb-1.5">
              {m.label}
            </div>
            <div className="text-[26px] font-extrabold leading-none text-[#1a1a1a]">
              {m.label === "Uptime" ? (
                <>
                  {m.value.replace("%", "")}
                  <span className="text-sm font-bold">%</span>
                </>
              ) : (
                m.value
              )}
            </div>
            <div className="text-[10px] mt-1 text-[#999999]">
              {m.delta}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
