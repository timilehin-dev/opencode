"use client";

import { useMemo } from "react";

interface MetricsRowProps {
  overviewData?: {
    messagesToday?: number;
    toolCalls?: number;
    delegations?: number;
    tasksDone?: number;
    uptime?: number;
  } | null;
}

export function MetricsRow({ overviewData }: MetricsRowProps) {
  const data = useMemo(() => {
    if (overviewData) {
      return [
        {
          label: "Messages",
          value: String(overviewData.messagesToday ?? 247),
          color: "text-emerald-400",
          delta: "↑ 18% today",
          deltaType: "up" as const,
        },
        {
          label: "Tool Calls",
          value: String(overviewData.toolCalls ?? 89),
          color: "text-blue-400",
          delta: "↑ 12% today",
          deltaType: "up" as const,
        },
        {
          label: "Delegations",
          value: String(overviewData.delegations ?? 12),
          color: "text-purple-400",
          delta: "3 active",
          deltaType: "up" as const,
        },
        {
          label: "Tasks Done",
          value: String(overviewData.tasksDone ?? 34),
          color: "text-amber-400",
          delta: "↑ 24% today",
          deltaType: "up" as const,
        },
        {
          label: "Uptime",
          value: `${overviewData.uptime ?? 99.9}%`,
          color: "text-emerald-300",
          delta: "All systems",
          deltaType: "up" as const,
        },
      ];
    }
    return [
      {
        label: "Messages",
        value: "247",
        color: "text-emerald-400",
        delta: "↑ 18% today",
        deltaType: "up" as const,
      },
      {
        label: "Tool Calls",
        value: "89",
        color: "text-blue-400",
        delta: "↑ 12% today",
        deltaType: "up" as const,
      },
      {
        label: "Delegations",
        value: "12",
        color: "text-purple-400",
        delta: "3 active",
        deltaType: "up" as const,
      },
      {
        label: "Tasks Done",
        value: "34",
        color: "text-amber-400",
        delta: "↑ 24% today",
        deltaType: "up" as const,
      },
      {
        label: "Uptime",
        value: "99.9%",
        color: "text-emerald-300",
        delta: "All systems",
        deltaType: "up" as const,
      },
    ];
  }, [overviewData]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 mb-5 overflow-x-auto scrollbar-none">
      {data.map((m) => (
        <div
          key={m.label}
          className="bg-white/[0.02] border border-white/[0.04] rounded-xl px-4 py-3.5 min-w-[140px]"
        >
          <div className="text-[10px] font-semibold uppercase tracking-[0.8px] text-zinc-600 mb-1.5">
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
