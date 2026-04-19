// ---------------------------------------------------------------------------
// Claw AI — Per-Agent Override Store (localStorage-backed)
// ---------------------------------------------------------------------------
// Allows users to customize individual agents without editing source code.
// Overrides are merged at runtime: base config (agents.ts) ← user overrides.
// ---------------------------------------------------------------------------

export interface AgentOverrides {
  /** Custom model string (e.g. "gpt-4o", "claude-3.5-sonnet") */
  model?: string;
  /** Temperature override (0.0 – 2.0) */
  temperature?: number;
  /** Max output tokens override */
  maxTokens?: number;
  /** Tools to DISABLE (removed from agent's default tool set) */
  disabledTools?: string[];
  /** Extra tools to ENABLE (added beyond agent's default tool set) */
  enabledTools?: string[];
  /** Custom system prompt (replaces the default entirely) */
  customSystemPrompt?: string;
  /** Custom agent name */
  name?: string;
  /** Custom agent role/label */
  role?: string;
  /** Whether this agent is enabled */
  enabled?: boolean;
}

function storageKey(agentId: string): string {
  return `claw-agent-override-${agentId}`;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export function loadAgentOverrides(agentId: string): AgentOverrides {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(storageKey(agentId));
    if (!raw) return {};
    return JSON.parse(raw) as AgentOverrides;
  } catch {
    return {};
  }
}

export function saveAgentOverrides(agentId: string, overrides: AgentOverrides): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(agentId), JSON.stringify(overrides));
  } catch {
    // Storage full
  }
}

export function updateAgentOverrides(agentId: string, patch: Partial<AgentOverrides>): AgentOverrides {
  const current = loadAgentOverrides(agentId);
  const updated = { ...current, ...patch };
  saveAgentOverrides(agentId, updated);
  return updated;
}

export function resetAgentOverrides(agentId: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(storageKey(agentId));
}

export function loadAllAgentOverrides(): Record<string, AgentOverrides> {
  if (typeof window === "undefined") return {};
  const all: Record<string, AgentOverrides> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith("claw-agent-override-")) {
      const agentId = key.replace("claw-agent-override-", "");
      try {
        all[agentId] = JSON.parse(localStorage.getItem(key) || "{}");
      } catch {
        // skip
      }
    }
  }
  return all;
}

// ---------------------------------------------------------------------------
// Merge helpers — apply overrides to base agent config
// ---------------------------------------------------------------------------

export function getEffectiveTools(
  baseTools: string[],
  overrides: AgentOverrides
): string[] {
  let tools = [...baseTools];

  if (overrides.disabledTools?.length) {
    const disabled = new Set(overrides.disabledTools);
    tools = tools.filter((t) => !disabled.has(t));
  }

  if (overrides.enabledTools?.length) {
    const existing = new Set(tools);
    for (const t of overrides.enabledTools) {
      if (!existing.has(t)) tools.push(t);
    }
  }

  return tools;
}

export function getEffectiveSystemPrompt(
  basePrompt: string,
  overrides: AgentOverrides
): string {
  return overrides.customSystemPrompt || basePrompt;
}

export function hasOverrides(agentId: string): boolean {
  const o = loadAgentOverrides(agentId);
  return (
    (o.model !== undefined && o.model !== "") ||
    (o.temperature !== undefined) ||
    (o.maxTokens !== undefined) ||
    (o.disabledTools !== undefined && o.disabledTools.length > 0) ||
    (o.enabledTools !== undefined && o.enabledTools.length > 0) ||
    (o.customSystemPrompt !== undefined && o.customSystemPrompt !== "") ||
    (o.name !== undefined) ||
    (o.role !== undefined) ||
    (o.enabled !== undefined)
  );
}
