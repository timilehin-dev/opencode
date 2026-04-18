"use client";

import { cn } from "@/lib/utils";
import type { DelegationView } from "@/hooks/use-dashboard-stream";

// Agent metadata map for emojis and colors
const AGENT_META: Record<string, { emoji: string; bg: string; name: string }> = {
  general: { emoji: "🤵", bg: "bg-emerald-500/[0.15]", name: "Claw General" },
  mail: { emoji: "✉️", bg: "bg-blue-500/[0.15]", name: "Mail Agent" },
  code: { emoji: "💻", bg: "bg-purple-500/[0.15]", name: "Code Agent" },
  data: { emoji: "📊", bg: "bg-amber-500/[0.15]", name: "Data Agent" },
  creative: { emoji: "🧠", bg: "bg-rose-500/[0.15]", name: "Creative Agent" },
  research: { emoji: "🔍", bg: "bg-teal-500/[0.15]", name: "Research Agent" },
  ops: { emoji: "⚡", bg: "bg-orange-500/[0.15]", name: "Ops Agent" },
  unknown: { emoji: "🤖", bg: "bg-accent", name: "Agent" },
};

function getAgentMeta(agentId: string) {
  return AGENT_META[agentId] || AGENT_META["unknown"];
}

interface CoordinationMapProps {
  delegations: DelegationView[];
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-400",
  running: "bg-emerald-500/10 text-emerald-400",
  completed: "bg-blue-500/10 text-blue-400",
  failed: "bg-red-500/10 text-red-400",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "queued",
  running: "running",
  completed: "done",
  failed: "failed",
};

export function CoordinationMap({ delegations }: CoordinationMapProps) {
  const activeCount = delegations.filter((d) => d.status === "running").length;

  return (
    <div className="bg-secondary border border-border rounded-[14px] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
        <span className="text-[13px] font-bold text-foreground">
          Agent Coordination Map
        </span>
        <span className="text-[10px] text-muted-foreground">{activeCount} active flows</span>
      </div>

      {/* Banner */}
      <div className="px-4 py-2 bg-emerald-500/5 border-b border-border">
        <span className="text-[10px] text-muted-foreground/60">
          {delegations.length > 0
            ? `Showing ${Math.min(delegations.length, 20)} recent delegation(s)`
            : "No delegations yet"}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 p-3 overflow-y-auto custom-scrollbar max-h-96">
        {delegations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-10 h-10 rounded-full bg-secondary border border-border flex items-center justify-center mb-3">
              <span className="text-muted-foreground text-sm">🔗</span>
            </div>
            <span className="text-[11px] text-muted-foreground">
              Agent delegations will appear here
            </span>
            <span className="text-[10px] text-muted-foreground/50 mt-1">
              Use delegate_to_agent or query_agent to start
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {delegations.slice(0, 20).map((delegation) => {
              const from = getAgentMeta(delegation.initiator_agent);
              const to = getAgentMeta(delegation.assigned_agent);
              const statusKey = delegation.status || "pending";
              const statusStyle = STATUS_STYLES[statusKey] || STATUS_STYLES["pending"];
              const statusLabel = STATUS_LABELS[statusKey] || statusKey;

              return (
                <div
                  key={delegation.id}
                  className="flex items-center gap-2 px-2.5 py-2.5 rounded-lg bg-secondary hover:bg-accent/30 transition-colors"
                >
                  {/* From avatar */}
                  <div
                    className={`w-[30px] h-[30px] rounded-full flex items-center justify-center text-sm ${from.bg} flex-shrink-0`}
                    title={from.name}
                  >
                    {from.emoji}
                  </div>
                  {/* Arrow */}
                  <span className="text-muted-foreground/50 text-xs flex-shrink-0">→</span>
                  {/* To avatar */}
                  <div
                    className={`w-[30px] h-[30px] rounded-full flex items-center justify-center text-sm ${to.bg} flex-shrink-0`}
                    title={to.name}
                  >
                    {to.emoji}
                  </div>
                  {/* Description */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-muted-foreground leading-snug truncate">
                      <strong className="text-foreground">{delegation.task}</strong>
                    </div>
                    {delegation.duration_ms != null && (
                      <div className="text-[9px] text-muted-foreground/50 mt-0.5">
                        {(delegation.duration_ms / 1000).toFixed(1)}s
                      </div>
                    )}
                  </div>
                  {/* Status badge */}
                  <span
                    className={cn(
                      "text-[9px] font-bold px-1.5 py-0.5 rounded uppercase flex-shrink-0",
                      statusStyle,
                    )}
                  >
                    {statusLabel}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
