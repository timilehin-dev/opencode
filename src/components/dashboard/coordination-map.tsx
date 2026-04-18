"use client";

import { cn } from "@/lib/utils";
import type { DelegationView } from "@/hooks/use-dashboard-stream";

const AGENT_META: Record<string, { emoji: string; bg: string; name: string }> = {
  general: { emoji: "🤵", bg: "bg-[#eef2ff]", name: "Claw General" },
  mail: { emoji: "✉️", bg: "bg-[#eff6ff]", name: "Mail Agent" },
  code: { emoji: "💻", bg: "bg-[#faf5ff]", name: "Code Agent" },
  data: { emoji: "📊", bg: "bg-[#fffbeb]", name: "Data Agent" },
  creative: { emoji: "🧠", bg: "bg-[#fff1f2]", name: "Creative Agent" },
  research: { emoji: "🔍", bg: "bg-[#f0fdfa]", name: "Research Agent" },
  ops: { emoji: "⚡", bg: "bg-[#fff7ed]", name: "Ops Agent" },
  unknown: { emoji: "🤖", bg: "bg-[#faf9f7]", name: "Agent" },
};

function getAgentMeta(agentId: string) {
  return AGENT_META[agentId] || AGENT_META["unknown"];
}

interface CoordinationMapProps {
  delegations: DelegationView[];
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border border-amber-200",
  running: "bg-[#eef2ff] text-[#3730a3] border border-indigo-200",
  completed: "bg-[#faf9f7] text-[#999999] border border-[#e8e5df]",
  failed: "bg-red-50 text-red-700 border border-red-200",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "queued",
  running: "running",
  completed: "done",
  failed: "failed",
};

export function CoordinationMap({ delegations }: CoordinationMapProps) {
  const activeCount = delegations.filter((d) => d.status === "running").length;

  const uniqueAgents = new Map<string, { emoji: string; x: number; y: number; count: number }>();
  const centerX = 150;
  const centerY = 100;
  const radius = 80;

  delegations.forEach((d) => {
    const id = d.assigned_agent || "unknown";
    const current = uniqueAgents.get(id);
    if (current) {
      current.count++;
    } else {
      uniqueAgents.set(id, { emoji: getAgentMeta(id).emoji, x: 0, y: 0, count: 1 });
    }
  });

  const agents = Array.from(uniqueAgents.entries());
  agents.forEach(([id, agent], i) => {
    const angle = (2 * Math.PI * i) / Math.max(agents.length, 1) - Math.PI / 2;
    agent.x = centerX + radius * Math.cos(angle);
    agent.y = centerY + radius * Math.sin(angle);
  });

  return (
    <div className="bg-white rounded-lg border border-[#e8e5df] shadow-sm flex flex-col overflow-hidden h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#e8e5df]">
        <span className="text-[13px] font-semibold text-[#1a1a1a]">
          Agent Coordination Map
        </span>
        <span className="text-[10px] text-[#999999]">{activeCount} active flows</span>
      </div>

      {/* SVG Network Visualization */}
      {delegations.length > 0 && (
        <div className="px-4 py-3 border-b border-[#e8e5df]">
          <svg viewBox="0 0 300 200" className="w-full h-auto" style={{ maxHeight: "160px" }}>
            <defs>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <radialGradient id="centerGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(55,48,163,0.15)" />
                <stop offset="100%" stopColor="rgba(55,48,163,0)" />
              </radialGradient>
            </defs>

            {/* Connection lines */}
            {agents.map(([id, agent]) => (
              <line
                key={`line-${id}`}
                x1={centerX}
                y1={centerY}
                x2={agent.x}
                y2={agent.y}
                stroke="rgba(55,48,163,0.12)"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
            ))}

            {/* Center node */}
            <circle cx={centerX} cy={centerY} r="30" fill="url(#centerGrad)" />
            <circle cx={centerX} cy={centerY} r="18" fill="white" stroke="rgba(55,48,163,0.2)" strokeWidth="1.5" />
            <text x={centerX} y={centerY + 5} textAnchor="middle" fontSize="14">🤵</text>
            <text x={centerX} y={centerY + 32} textAnchor="middle" fill="rgba(26,26,26,0.4)" fontSize="7" fontWeight="600">GENERAL</text>

            {/* Agent nodes */}
            {agents.map(([id, agent]) => {
              const hasActive = delegations.some(d => d.assigned_agent === id && d.status === "running");
              return (
                <g key={`node-${id}`}>
                  <circle cx={agent.x} cy={agent.y} r="14" fill="white" stroke={hasActive ? "rgba(55,48,163,0.3)" : "rgba(0,0,0,0.08)"} strokeWidth="1" />
                  <text x={agent.x} y={agent.y + 4} textAnchor="middle" fontSize="11">{agent.emoji}</text>
                  <text x={agent.x} y={agent.y + 24} textAnchor="middle" fill="rgba(26,26,26,0.3)" fontSize="6" fontWeight="500">{(getAgentMeta(id).name).toUpperCase().slice(0, 8)}</text>
                  {agent.count > 1 && (
                    <>
                      <circle cx={agent.x + 10} cy={agent.y - 10} r="6" fill="white" stroke="rgba(0,0,0,0.06)" strokeWidth="0.5" />
                      <text x={agent.x + 10} y={agent.y - 7.5} textAnchor="middle" fill="rgba(26,26,26,0.4)" fontSize="6" fontWeight="600">{agent.count}</text>
                    </>
                  )}
                </g>
              );
            })}

            {/* Animated pulse on active connections */}
            {activeCount > 0 && (
              <circle cx={centerX} cy={centerY} r="22" fill="none" stroke="rgba(55,48,163,0.2)" strokeWidth="0.5">
                <animate attributeName="r" from="18" to="40" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.3" to="0" dur="2s" repeatCount="indefinite" />
              </circle>
            )}
          </svg>
        </div>
      )}

      {/* Banner */}
      <div className="px-4 py-2 bg-[#faf9f7] border-b border-[#e8e5df]">
        <span className="text-[10px] text-[#999999]">
          {delegations.length > 0
            ? `Showing ${Math.min(delegations.length, 20)} recent delegation(s)`
            : "No delegations yet"}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 p-3 overflow-y-auto custom-scrollbar">
        {delegations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-10 h-10 rounded-full bg-[#faf9f7] border border-[#e8e5df] flex items-center justify-center mb-3">
              <span className="text-[#999999] text-sm">🔗</span>
            </div>
            <span className="text-[11px] text-[#999999]">
              Agent delegations will appear here
            </span>
            <span className="text-[10px] text-[#d5d0c9] mt-1">
              Use delegate_to_agent or query_agent to start
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {delegations.slice(0, 20).map((delegation) => {
              const from = getAgentMeta(delegation.initiator_agent);
              const to = getAgentMeta(delegation.assigned_agent);
              const statusKey = delegation.status || "pending";
              const statusStyle = STATUS_STYLES[statusKey] || STATUS_STYLES["pending"];
              const statusLabel = STATUS_LABELS[statusKey] || statusKey;

              return (
                <div
                  key={delegation.id}
                  className="flex items-center gap-2 px-2.5 py-2.5 rounded-lg bg-[#faf9f7] hover:bg-white border border-[#f0ede8] transition-colors"
                >
                  <div className={`w-[30px] h-[30px] rounded-full flex items-center justify-center text-sm ${from.bg} flex-shrink-0`} title={from.name}>
                    {from.emoji}
                  </div>
                  <span className="text-[#d5d0c9] text-xs flex-shrink-0">→</span>
                  <div className={`w-[30px] h-[30px] rounded-full flex items-center justify-center text-sm ${to.bg} flex-shrink-0`} title={to.name}>
                    {to.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-[#6b6b6b] leading-snug truncate">
                      <strong className="text-[#1a1a1a]">{delegation.task}</strong>
                    </div>
                    {delegation.duration_ms != null && (
                      <div className="text-[9px] text-[#999999] mt-0.5">
                        {(delegation.duration_ms / 1000).toFixed(1)}s
                      </div>
                    )}
                  </div>
                  <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0", statusStyle)}>
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
