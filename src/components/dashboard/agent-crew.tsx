"use client";

import { cn } from "@/lib/utils";
import type { AgentConfig } from "@/lib/agents";

interface AgentCrewProps {
  agents: AgentConfig[];
  selectedAgentId: string;
  onSelectAgent: (id: string) => void;
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
  emerald: "bg-emerald-500/[0.06] border-emerald-500/15",
  blue: "bg-blue-500/[0.06] border-blue-500/15",
  purple: "bg-purple-500/[0.06] border-purple-500/15",
  amber: "bg-amber-500/[0.06] border-amber-500/15",
  rose: "bg-rose-500/[0.06] border-rose-500/15",
  orange: "bg-orange-500/[0.06] border-orange-500/15",
  teal: "bg-teal-500/[0.06] border-teal-500/15",
};

export function AgentCrew({ agents, selectedAgentId, onSelectAgent }: AgentCrewProps) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-[18px] py-4">
        <span className="text-[12px] font-bold uppercase tracking-[1px] text-zinc-600">
          Agent Crew
        </span>
        <span className="text-[11px] text-emerald-400 cursor-pointer font-semibold">
          + Add Agent
        </span>
      </div>

      {/* Grid */}
      <div className="px-[18px] pb-3.5 grid grid-cols-2 gap-2">
        {agents.map((agent) => {
          const isActive = agent.id === selectedAgentId;
          const colorClass = agent.color || "emerald";
          return (
            <button
              key={agent.id}
              onClick={() => onSelectAgent(agent.id)}
              className={cn(
                "p-3 rounded-xl text-center cursor-pointer transition-all duration-200",
                "bg-white/[0.02] border border-white/[0.04]",
                "hover:bg-white/[0.04] hover:border-white/[0.08]",
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
              <div className="text-[11.5px] font-semibold text-zinc-200">
                {agent.name}
              </div>
              <div className="text-[9.5px] text-zinc-600 mt-0.5">
                {agent.role.split("—")[0].trim()}
              </div>
              <div className="flex items-center justify-center gap-1 mt-1.5">
                <div
                  className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    agent.id === "general" || agent.id === "mail" || agent.id === "creative"
                      ? "bg-emerald-500"
                      : "bg-zinc-700"
                  )}
                />
                <span
                  className={cn(
                    "text-[9px] font-semibold uppercase tracking-[0.5px]",
                    agent.id === "general" || agent.id === "mail" || agent.id === "creative"
                      ? "text-emerald-500"
                      : "text-zinc-600"
                  )}
                >
                  {agent.id === "general" || agent.id === "mail" || agent.id === "creative"
                    ? "Active"
                    : "Standby"}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}
