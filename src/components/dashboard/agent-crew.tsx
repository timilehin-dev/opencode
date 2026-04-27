"use client";

import { cn } from "@/lib/core/utils";
import type { AgentConfig } from "@/lib/agent/agents";
import type { AgentStatusView } from "@/hooks/use-dashboard-stream";

interface AgentCrewProps {
  agents: AgentConfig[];
  selectedAgentId: string;
  onSelectAgent: (id: string) => void;
  agentStatuses?: AgentStatusView[];
}

const STATUS_DOT: Record<string, string> = {
  busy: "bg-emerald-500",
  idle: "bg-[#999999]",
  error: "bg-red-500",
  offline: "bg-[#d5d0c9]",
};

const STATUS_TEXT: Record<string, string> = {
  busy: "text-emerald-600",
  idle: "text-muted-foreground",
  error: "text-red-600",
  offline: "text-muted-foreground/60",
};

const STATUS_LABEL: Record<string, string> = {
  busy: "Active",
  idle: "Standby",
  error: "Error",
  offline: "Offline",
};

export function AgentCrew({ agents, selectedAgentId, onSelectAgent, agentStatuses }: AgentCrewProps) {
  const statusMap = new Map<string, AgentStatusView>();
  if (agentStatuses) {
    for (const s of agentStatuses) {
      statusMap.set(s.id, s);
    }
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Agent Crew
        </span>
        <span className="text-[11px] text-[#3730a3] cursor-pointer font-semibold hover:underline transition-colors">
          + Add Agent
        </span>
      </div>

      {/* Grid */}
      <div className="px-5 pb-3.5 grid grid-cols-2 gap-2">
        {agents.map((agent) => {
          const isActive = agent.id === selectedAgentId;
          const realStatus = statusMap.get(agent.id);
          const status = realStatus?.status || "idle";
          const currentTask = realStatus?.currentTask || null;

          return (
            <button
              key={agent.id}
              onClick={() => onSelectAgent(agent.id)}
              title={currentTask || undefined}
              className={cn(
                "p-3 rounded-lg text-center cursor-pointer transition-all duration-200",
                "bg-card border border-border",
                "hover:bg-card hover:border-border",
                isActive && "border-l-2 border-l-primary bg-[#eef2ff]/50 border-t-border border-r-border border-b-border"
              )}
            >
              {/* Avatar */}
              <div className="w-11 h-11 rounded-full mx-auto mb-1.5 flex items-center justify-center text-xl">
                {agent.emoji}
              </div>
              <div className="text-[11px] font-semibold text-foreground">
                {agent.name}
              </div>
              <div className="text-[9px] text-muted-foreground mt-0.5">
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
