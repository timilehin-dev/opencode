"use client";

import { cn } from "@/lib/utils";
import type { AgentConfig } from "@/lib/agents";
import type { AgentStatusView } from "@/hooks/use-dashboard-stream";

interface AgentCrewProps {
  agents: AgentConfig[];
  selectedAgentId: string;
  onSelectAgent: (id: string) => void;
  agentStatuses?: AgentStatusView[];
}

const COLOR_RING_MAP: Record<string, string> = {
  emerald: "before:border-emerald-500/40",
  blue: "before:border-blue-500/30",
  purple: "before:border-purple-500/30",
  amber: "before:border-amber-500/30",
  rose: "before:border-rose-500/30",
  orange: "before:border-orange-500/30",
  teal: "before:border-teal-500/30",
};

const COLOR_ACTIVE_BG: Record<string, string> = {
  emerald: "bg-emerald-500/[0.08] border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]",
  blue: "bg-blue-500/[0.08] border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]",
  purple: "bg-purple-500/[0.08] border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.1)]",
  amber: "bg-amber-500/[0.08] border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]",
  rose: "bg-rose-500/[0.08] border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.1)]",
  orange: "bg-orange-500/[0.08] border-orange-500/20 shadow-[0_0_15px_rgba(249,115,22,0.1)]",
  teal: "bg-teal-500/[0.08] border-teal-500/20 shadow-[0_0_15px_rgba(20,184,166,0.1)]",
};

const STATUS_DOT: Record<string, string> = {
  busy: "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]",
  idle: "bg-slate-500",
  error: "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]",
  offline: "bg-slate-600",
};

const STATUS_TEXT: Record<string, string> = {
  busy: "text-emerald-400",
  idle: "text-slate-500",
  error: "text-red-400",
  offline: "text-slate-600",
};

const STATUS_LABEL: Record<string, string> = {
  busy: "Active",
  idle: "Standby",
  error: "Error",
  offline: "Offline",
};

export function AgentCrew({ agents, selectedAgentId, onSelectAgent, agentStatuses }: AgentCrewProps) {
  // Build a status lookup map
  const statusMap = new Map<string, AgentStatusView>();
  if (agentStatuses) {
    for (const s of agentStatuses) {
      statusMap.set(s.id, s);
    }
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-[18px] py-4">
        <span className="text-[12px] font-bold uppercase tracking-[1px] text-slate-500">
          Agent Crew
        </span>
        <span className="text-[11px] text-emerald-400 cursor-pointer font-semibold hover:text-emerald-300 transition-colors">
          + Add Agent
        </span>
      </div>

      {/* Grid */}
      <div className="px-[18px] pb-3.5 grid grid-cols-2 gap-2">
        {agents.map((agent) => {
          const isActive = agent.id === selectedAgentId;
          const colorClass = agent.color || "emerald";
          const realStatus = statusMap.get(agent.id);
          const status = realStatus?.status || "idle";
          const currentTask = realStatus?.currentTask || null;

          return (
            <button
              key={agent.id}
              onClick={() => onSelectAgent(agent.id)}
              title={currentTask || undefined}
              className={cn(
                "p-3 rounded-xl text-center cursor-pointer transition-all duration-200",
                "bg-white/[0.03] border border-white/[0.06]",
                "hover:bg-white/[0.06] hover:border-white/[0.1]",
                isActive && COLOR_ACTIVE_BG[colorClass]
              )}
            >
              {/* Avatar ring */}
              <div
                className={cn(
                  "w-11 h-11 rounded-full mx-auto mb-1.5 flex items-center justify-center text-xl relative",
                  "before:content-[''] before:absolute before:inset-[-2px] before:rounded-full before:border-2 before:border-transparent",
                  COLOR_RING_MAP[colorClass]
                )}
              >
                {agent.emoji}
              </div>
              <div className="text-[11.5px] font-semibold text-white">
                {agent.name}
              </div>
              <div className="text-[9.5px] text-slate-500 mt-0.5">
                {agent.role.split("—")[0].trim()}
              </div>
              <div className="flex items-center justify-center gap-1 mt-1.5">
                <div
                  className={cn(
                    "w-1.5 h-1.5 rounded-full transition-colors duration-500",
                    STATUS_DOT[status] || STATUS_DOT.idle
                  )}
                />
                <span
                  className={cn(
                    "text-[9px] font-semibold uppercase tracking-[0.5px] transition-colors duration-500",
                    STATUS_TEXT[status] || STATUS_TEXT.idle
                  )}
                >
                  {STATUS_LABEL[status] || "Standby"}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}
