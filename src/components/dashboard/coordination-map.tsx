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
  unknown: { emoji: "🤖", bg: "bg-white/[0.06]", name: "Agent" },
};

function getAgentMeta(agentId: string) {
  return AGENT_META[agentId] || AGENT_META["unknown"];
}

interface CoordinationMapProps {
  delegations: DelegationView[];
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  running: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  completed: "bg-slate-500/10 text-slate-400 border border-slate-500/20",
  failed: "bg-red-500/10 text-red-400 border border-red-500/20",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "queued",
  running: "running",
  completed: "done",
  failed: "failed",
};

export function CoordinationMap({ delegations }: CoordinationMapProps) {
  const activeCount = delegations.filter((d) => d.status === "running").length;

  // Build node positions for SVG visualization
  const uniqueAgents = new Map<string, { emoji: string; x: number; y: number; count: number }>();
  const centerX = 150;
  const centerY = 100;
  const radius = 80;

  // Count delegations per agent
  delegations.forEach((d) => {
    const id = d.assigned_agent || "unknown";
    const current = uniqueAgents.get(id);
    if (current) {
      current.count++;
    } else {
      uniqueAgents.set(id, { emoji: getAgentMeta(id).emoji, x: 0, y: 0, count: 1 });
    }
  });

  // Position agents in a circle around center
  const agents = Array.from(uniqueAgents.entries());
  agents.forEach(([id, agent], i) => {
    const angle = (2 * Math.PI * i) / Math.max(agents.length, 1) - Math.PI / 2;
    agent.x = centerX + radius * Math.cos(angle);
    agent.y = centerY + radius * Math.sin(angle);
  });

  return (
    <div className="cyber-card flex flex-col overflow-hidden h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.06]">
        <span className="text-[13px] font-bold text-white">
          Agent Coordination Map
        </span>
        <span className="text-[10px] text-slate-500">{activeCount} active flows</span>
      </div>

      {/* SVG Network Visualization */}
      {delegations.length > 0 && (
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <svg viewBox="0 0 300 200" className="w-full h-auto" style={{ maxHeight: "160px" }}>
            {/* Glow filter */}
            <defs>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <radialGradient id="centerGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(16,185,129,0.3)" />
                <stop offset="100%" stopColor="rgba(16,185,129,0)" />
              </radialGradient>
            </defs>

            {/* Connection lines */}
            {agents.map(([id, agent], i) => (
              <line
                key={`line-${id}`}
                x1={centerX}
                y1={centerY}
                x2={agent.x}
                y2={agent.y}
                stroke="rgba(16,185,129,0.15)"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
            ))}

            {/* Center node */}
            <circle cx={centerX} cy={centerY} r="30" fill="url(#centerGrad)" />
            <circle cx={centerX} cy={centerY} r="18" fill="rgba(26,31,46,0.9)" stroke="rgba(16,185,129,0.3)" strokeWidth="1.5" filter="url(#glow)" />
            <text x={centerX} y={centerY + 5} textAnchor="middle" fontSize="14">🤵</text>
            <text x={centerX} y={centerY + 32} textAnchor="middle" fill="rgba(148,163,184,0.7)" fontSize="7" fontWeight="600">GENERAL</text>

            {/* Agent nodes */}
            {agents.map(([id, agent], i) => {
              const hasActive = delegations.some(d => d.assigned_agent === id && d.status === "running");
              return (
                <g key={`node-${id}`}>
                  <circle cx={agent.x} cy={agent.y} r="14" fill="rgba(26,31,46,0.9)" stroke={hasActive ? "rgba(16,185,129,0.4)" : "rgba(255,255,255,0.08)"} strokeWidth="1" filter={hasActive ? "url(#glow)" : undefined} />
                  <text x={agent.x} y={agent.y + 4} textAnchor="middle" fontSize="11">{agent.emoji}</text>
                  <text x={agent.x} y={agent.y + 24} textAnchor="middle" fill="rgba(148,163,184,0.5)" fontSize="6" fontWeight="500">{(getAgentMeta(id).name).toUpperCase().slice(0, 8)}</text>
                  {agent.count > 1 && (
                    <>
                      <circle cx={agent.x + 10} cy={agent.y - 10} r="6" fill="rgba(26,31,46,0.9)" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
                      <text x={agent.x + 10} y={agent.y - 7.5} textAnchor="middle" fill="rgba(148,163,184,0.7)" fontSize="6" fontWeight="600">{agent.count}</text>
                    </>
                  )}
                </g>
              );
            })}

            {/* Animated pulse on active connections */}
            {activeCount > 0 && (
              <circle cx={centerX} cy={centerY} r="22" fill="none" stroke="rgba(16,185,129,0.3)" strokeWidth="0.5">
                <animate attributeName="r" from="18" to="40" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.4" to="0" dur="2s" repeatCount="indefinite" />
              </circle>
            )}
          </svg>
        </div>
      )}

      {/* Banner */}
      <div className="px-4 py-2 bg-emerald-500/[0.03] border-b border-white/[0.06]">
        <span className="text-[10px] text-slate-600">
          {delegations.length > 0
            ? `Showing ${Math.min(delegations.length, 20)} recent delegation(s)`
            : "No delegations yet"}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 p-3 overflow-y-auto custom-scrollbar max-h-96">
        {delegations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-3">
              <span className="text-slate-600 text-sm">🔗</span>
            </div>
            <span className="text-[11px] text-slate-500">
              Agent delegations will appear here
            </span>
            <span className="text-[10px] text-slate-600 mt-1">
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
                  className="flex items-center gap-2 px-2.5 py-2.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.04] transition-colors"
                >
                  {/* From avatar */}
                  <div
                    className={`w-[30px] h-[30px] rounded-full flex items-center justify-center text-sm ${from.bg} flex-shrink-0`}
                    title={from.name}
                  >
                    {from.emoji}
                  </div>
                  {/* Arrow */}
                  <span className="text-slate-600 text-xs flex-shrink-0">→</span>
                  {/* To avatar */}
                  <div
                    className={`w-[30px] h-[30px] rounded-full flex items-center justify-center text-sm ${to.bg} flex-shrink-0`}
                    title={to.name}
                  >
                    {to.emoji}
                  </div>
                  {/* Description */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-slate-400 leading-snug truncate">
                      <strong className="text-slate-200">{delegation.task}</strong>
                    </div>
                    {delegation.duration_ms != null && (
                      <div className="text-[9px] text-slate-600 mt-0.5">
                        {(delegation.duration_ms / 1000).toFixed(1)}s
                      </div>
                    )}
                  </div>
                  {/* Status badge */}
                  <span
                    className={cn(
                      "text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0",
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
