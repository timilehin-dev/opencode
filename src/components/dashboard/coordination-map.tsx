"use client";

import { cn } from "@/lib/utils";

interface CoordFlow {
  id: number;
  fromEmoji: string;
  fromBg: string;
  toEmoji: string;
  toBg: string;
  title: string;
  status: "running" | "done" | "queued";
}

const MOCK_FLOWS: CoordFlow[] = [
  {
    id: 1,
    fromEmoji: "🤵",
    fromBg: "bg-emerald-500/[0.15]",
    toEmoji: "✉️",
    toBg: "bg-blue-500/[0.15]",
    title: "Review urgent emails",
    status: "running",
  },
  {
    id: 2,
    fromEmoji: "🤵",
    fromBg: "bg-emerald-500/[0.15]",
    toEmoji: "🔧",
    toBg: "bg-orange-500/[0.15]",
    title: "Check deployment status",
    status: "done",
  },
  {
    id: 3,
    fromEmoji: "🎨",
    fromBg: "bg-rose-500/[0.15]",
    toEmoji: "🔍",
    toBg: "bg-teal-500/[0.15]",
    title: "Research competitor analysis",
    status: "running",
  },
  {
    id: 4,
    fromEmoji: "🤵",
    fromBg: "bg-emerald-500/[0.15]",
    toEmoji: "📊",
    toBg: "bg-amber-500/[0.15]",
    title: "Generate Q2 revenue report",
    status: "queued",
  },
  {
    id: 5,
    fromEmoji: "✉️",
    fromBg: "bg-blue-500/[0.15]",
    toEmoji: "📅",
    toBg: "bg-blue-500/[0.15]",
    title: "Schedule team standup",
    status: "done",
  },
];

const STATUS_STYLES = {
  running: "bg-emerald-500/10 text-emerald-400",
  done: "bg-blue-500/10 text-blue-400",
  queued: "bg-white/[0.04] text-zinc-500",
};

export function CoordinationMap() {
  const activeCount = MOCK_FLOWS.filter((f) => f.status === "running").length;

  return (
    <div className="bg-white/[0.02] border border-white/[0.05] rounded-[14px] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.04]">
        <span className="text-[13px] font-bold text-zinc-100">
          Agent Coordination Map
        </span>
        <span className="text-[10px] text-zinc-500">{activeCount} active flows</span>
      </div>

      {/* Body */}
      <div className="flex-1 p-3 overflow-y-auto custom-scrollbar">
        <div className="flex flex-col gap-2.5">
          {MOCK_FLOWS.map((flow) => (
            <div
              key={flow.id}
              className="flex items-center gap-2 px-2.5 py-2.5 rounded-lg bg-white/[0.02]"
            >
              {/* From avatar */}
              <div
                className={`w-[30px] h-[30px] rounded-full flex items-center justify-center text-sm ${flow.fromBg}`}
              >
                {flow.fromEmoji}
              </div>
              {/* Arrow */}
              <span className="text-zinc-700 text-xs">→</span>
              {/* To avatar */}
              <div
                className={`w-[30px] h-[30px] rounded-full flex items-center justify-center text-sm ${flow.toBg}`}
              >
                {flow.toEmoji}
              </div>
              {/* Description */}
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-zinc-400 leading-snug">
                  <strong className="text-zinc-200">{flow.title}</strong>
                </div>
              </div>
              {/* Status badge */}
              <span
                className={cn(
                  "text-[9px] font-bold px-1.5 py-0.5 rounded uppercase flex-shrink-0",
                  STATUS_STYLES[flow.status]
                )}
              >
                {flow.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
