/**
 * Shared agent metadata mapping — used across dashboard, events, and SSE routes.
 * Single source of truth for agent IDs, names, emojis, and colors.
 */

export interface AgentMeta {
  id: string;
  name: string;
  emoji: string;
  color: string;
}

export const AGENT_MAP: Record<string, AgentMeta> = {
  general: { id: "general", name: "Claw General", emoji: "🧠", color: "#10B981" },
  mail: { id: "mail", name: "Mail Agent", emoji: "📧", color: "#3B82F6" },
  code: { id: "code", name: "Code Agent", emoji: "💻", color: "#8B5CF6" },
  data: { id: "data", name: "Data Agent", emoji: "📊", color: "#F59E0B" },
  creative: { id: "creative", name: "Creative Agent", emoji: "🎨", color: "#EF4444" },
  research: { id: "research", name: "Research Agent", emoji: "🔬", color: "#14B8A6" },
  ops: { id: "ops", name: "Ops Agent", emoji: "⚙️", color: "#F97316" },
};

export function getAgentMeta(agentId: string): AgentMeta {
  return AGENT_MAP[agentId] || { id: agentId, name: agentId, emoji: "🤖", color: "#6B7280" };
}

export function getAgentEmoji(agentId: string): string {
  return AGENT_MAP[agentId]?.emoji || "🤖";
}

export function getAgentColor(agentId: string): string {
  return AGENT_MAP[agentId]?.color || "#6B7280";
}

export function getAgentName(agentId: string): string {
  return AGENT_MAP[agentId]?.name || agentId;
}

/** Array form of agents (for iteration in select dropdowns, lists, etc.) */
export const AGENT_LIST: AgentMeta[] = Object.values(AGENT_MAP);
