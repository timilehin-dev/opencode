// ---------------------------------------------------------------------------
// Klawhub Agent System — Agent Configurations & Provider Setup
// ---------------------------------------------------------------------------
// This file is the Next.js-facing entry-point for agent data.  All shared
// constants, system prompts, tool lists, and agent metadata live in
// `@/lib/agent-config.ts` so they can be reused by standalone scripts
// without pulling in Next.js or AI SDK dependencies.
//
// **Kept here (Next.js / AI SDK specific):**
//   - `AgentConfig` / `AgentStatus` types
//   - The `agents` array (assembled from shared config)
//   - Agent status tracking + DB hydration
//   - Provider factory with key rotation
//   - All exported functions consumed by API routes & components
// ---------------------------------------------------------------------------

import { createOpenAI } from "@ai-sdk/openai";

import {
  AGENT_DEFINITIONS,
  AGENT_TOOL_LISTS,
  AGENT_SUGGESTED_ACTIONS,
  getAgentSystemPrompt,
} from "@/lib/agent/agent-config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  emoji: string;
  description: string;
  provider: "aihubmix" | "openrouter" | "ollama";
  model: string;
  color: string;
  systemPrompt: string;
  tools: string[];
  suggestedActions: { label: string; prompt: string }[];
  /** Optional: specific env var keys to use instead of the default pool */
  keyEnvVars?: string[];
}

export interface AgentStatus {
  id: string;
  status: "idle" | "busy" | "error" | "offline";
  currentTask: string | null;
  lastActivity: string | null;
  tasksCompleted: number;
  messagesProcessed: number;
}

// ---------------------------------------------------------------------------
// Build the flat `agents` array from shared configuration
// ---------------------------------------------------------------------------

const agents: AgentConfig[] = Object.keys(AGENT_DEFINITIONS).map((id) => {
  const def = AGENT_DEFINITIONS[id]!;
  return {
    id: def.id,
    name: def.name,
    role: def.role,
    emoji: def.emoji,
    description: def.description,
    provider: def.provider,
    model: def.model,
    color: def.color,
    keyEnvVars: def.keyEnvVars,
    systemPrompt: getAgentSystemPrompt(id),
    tools: AGENT_TOOL_LISTS[id] ?? [],
    suggestedActions: AGENT_SUGGESTED_ACTIONS[id] ?? [],
  };
});

// ---------------------------------------------------------------------------
// Agent Status (in-memory)
// ---------------------------------------------------------------------------

const agentStatuses = new Map<string, AgentStatus>();

agents.forEach((agent) => {
  agentStatuses.set(agent.id, {
    id: agent.id,
    status: "idle",
    currentTask: null,
    lastActivity: null,
    tasksCompleted: 0,
    messagesProcessed: 0,
  });
});

// ---------------------------------------------------------------------------
// Hydrate agent statuses from database on cold start
// ---------------------------------------------------------------------------

async function hydrateAgentStatuses() {
  try {
    const { query } = await import("@/lib/core/db");
    const result = await query("SELECT * FROM agent_status");
    for (const row of result.rows) {
      agentStatuses.set(row.agent_id, {
        id: row.agent_id,
        status: row.status,
        currentTask: row.current_task,
        lastActivity: row.last_activity,
        tasksCompleted: row.tasks_completed || 0,
        messagesProcessed: row.messages_processed || 0,
      });
    }
    console.log(`[Agents] Hydrated ${result.rows.length} agent statuses from DB`);
  } catch {
    console.log("[Agents] Could not hydrate statuses from DB (will use defaults)");
  }
}

// Only hydrate on server side (avoids pulling pg into client bundles)
if (typeof window === "undefined") {
  hydrateAgentStatuses();
}

// ---------------------------------------------------------------------------
// Exported Functions
// ---------------------------------------------------------------------------

export function getAllAgents(): AgentConfig[] {
  return agents;
}

export function getAgent(id: string): AgentConfig | undefined {
  return agents.find((a) => a.id === id);
}

export function getAgentStatus(id: string): AgentStatus {
  const status = agentStatuses.get(id);
  if (!status) {
    const fallback: AgentStatus = {
      id,
      status: "offline",
      currentTask: null,
      lastActivity: null,
      tasksCompleted: 0,
      messagesProcessed: 0,
    };
    agentStatuses.set(id, fallback);
    return fallback;
  }
  return status;
}

export function updateAgentStatus(
  id: string,
  update: Partial<Pick<AgentStatus, "status" | "currentTask" | "lastActivity" | "tasksCompleted" | "messagesProcessed">>,
): AgentStatus {
  const current = getAgentStatus(id);
  const updated: AgentStatus = {
    ...current,
    ...update,
    id,
  };
  agentStatuses.set(id, updated);

  // Also persist to database (fire-and-forget — non-async context)
  // Build dynamic SET clause — only update columns that were explicitly provided.
  // This prevents accidentally resetting status to "idle" when only counters are updated.
  const hasStatusUpdate = "status" in update;
  const hasTaskUpdate = "currentTask" in update;
  const hasActivityUpdate = "lastActivity" in update;
  const hasCounterUpdate = "tasksCompleted" in update || "messagesProcessed" in update;
  const counterTasks = hasCounterUpdate ? (update.tasksCompleted ?? 0) : 0;
  const counterMsgs = hasCounterUpdate ? (update.messagesProcessed ?? 0) : 0;

  const hasAnyDbUpdate = hasStatusUpdate || hasTaskUpdate || hasActivityUpdate || hasCounterUpdate;
  if (hasAnyDbUpdate) {
    const sets: string[] = ["updated_at = NOW()"];
    const params: unknown[] = [id];
    let pIdx = 2;

    if (hasStatusUpdate) {
      sets.push(`status = $${pIdx++}`);
      params.push(updated.status);
    }
    if (hasTaskUpdate) {
      sets.push(`current_task = $${pIdx++}`);
      params.push(updated.currentTask ?? null);
    }
    if (hasActivityUpdate) {
      sets.push(`last_activity = $${pIdx++}`);
      params.push(updated.lastActivity ?? null);
    }
    if (hasCounterUpdate) {
      sets.push(`tasks_completed = agent_status.tasks_completed + $${pIdx++}`);
      params.push(counterTasks);
      sets.push(`messages_processed = agent_status.messages_processed + $${pIdx++}`);
      params.push(counterMsgs);
    }

    const sql = `INSERT INTO agent_status (agent_id, status, current_task, last_activity, tasks_completed, messages_processed)
       VALUES ($1, 'idle', NULL, NULL, 0, 0)
       ON CONFLICT (agent_id) DO UPDATE SET ${sets.join(", ")}`;

    import("@/lib/core/db").then(({ query }) =>
      query(sql, params)
        .catch((err) => { console.warn("[Agents] Failed to persist status:", err); })
    ).catch(() => { /* module import failed */ });
  }

  return updated;
}

export function getAllAgentStatuses(): AgentStatus[] {
  return agents.map((a) => getAgentStatus(a.id));
}

// ---------------------------------------------------------------------------
// API Key Rotation — Smart rotation with token tracking & auto-skip
// ---------------------------------------------------------------------------

// Cached key-manager module — avoid re-importing on every getProvider() call
let _keyManagerModule: typeof import("@/lib/settings/key-manager") | null = null;
async function loadKeyManager() {
  if (!_keyManagerModule) {
    _keyManagerModule = await import("@/lib/settings/key-manager");
  }
  return _keyManagerModule;
}

// Shared key pools (used by agents without dedicated keyEnvVars)
const aihubmixKeys: string[] = [
  process.env.AIHUBMIX_API_KEY_1 || "",
  process.env.AIHUBMIX_API_KEY_2 || "",
  process.env.AIHUBMIX_API_KEY_3 || "",
  process.env.AIHUBMIX_API_KEY_4 || "",
  process.env.AIHUBMIX_API_KEY_5 || "",
].filter(Boolean);

const aihubmixLabels: string[] = [
  process.env.AIHUBMIX_API_KEY_1 ? "AIHUBMIX_API_KEY_1" : "",
  process.env.AIHUBMIX_API_KEY_2 ? "AIHUBMIX_API_KEY_2" : "",
  process.env.AIHUBMIX_API_KEY_3 ? "AIHUBMIX_API_KEY_3" : "",
  process.env.AIHUBMIX_API_KEY_4 ? "AIHUBMIX_API_KEY_4" : "",
  process.env.AIHUBMIX_API_KEY_5 ? "AIHUBMIX_API_KEY_5" : "",
].filter(Boolean);

const ollamaKeys: string[] = [
  process.env.OLLAMA_CLOUD_KEY_1 || "",
  process.env.OLLAMA_CLOUD_KEY_2 || "",
  process.env.OLLAMA_CLOUD_KEY_3 || "",
  process.env.OLLAMA_CLOUD_KEY_4 || "",
  process.env.OLLAMA_CLOUD_KEY_5 || "",
  process.env.OLLAMA_CLOUD_KEY_6 || "",
  process.env.OLLAMA_CLOUD_KEY_7 || "",
].filter(Boolean);

const ollamaLabels: string[] = [
  process.env.OLLAMA_CLOUD_KEY_1 ? "OLLAMA_CLOUD_KEY_1" : "",
  process.env.OLLAMA_CLOUD_KEY_2 ? "OLLAMA_CLOUD_KEY_2" : "",
  process.env.OLLAMA_CLOUD_KEY_3 ? "OLLAMA_CLOUD_KEY_3" : "",
  process.env.OLLAMA_CLOUD_KEY_4 ? "OLLAMA_CLOUD_KEY_4" : "",
  process.env.OLLAMA_CLOUD_KEY_5 ? "OLLAMA_CLOUD_KEY_5" : "",
  process.env.OLLAMA_CLOUD_KEY_6 ? "OLLAMA_CLOUD_KEY_6" : "",
  process.env.OLLAMA_CLOUD_KEY_7 ? "OLLAMA_CLOUD_KEY_7" : "",
].filter(Boolean);

// Per-agent dedicated key arrays (cached)
const dedicatedKeyCache = new Map<string, { keys: string[]; labels: string[] }>();

function getDedicatedKeys(agentId: string, envVars: string[]): { keys: string[]; labels: string[] } {
  const cacheKey = `${agentId}:${envVars.join(",")}`;
  if (dedicatedKeyCache.has(cacheKey)) return dedicatedKeyCache.get(cacheKey)!;

  const labels = [...envVars];
  const keys = envVars.map((envVar) => process.env[envVar] || "").filter(Boolean);

  dedicatedKeyCache.set(cacheKey, { keys, labels });
  return { keys, labels };
}

// ---------------------------------------------------------------------------
// Provider Factory (with smart key rotation)
// ---------------------------------------------------------------------------

export interface ProviderResult {
  model: ReturnType<ReturnType<typeof createOpenAI>["chat"]>;
  keySelection: Awaited<ReturnType<typeof import("@/lib/settings/key-manager")["selectBestKey"]>>;
  provider: "aihubmix" | "ollama" | "openrouter";
}

export async function getProvider(agent: AgentConfig): Promise<ProviderResult> {
  let keys: string[];
  let labels: string[];

  // Determine key pool
  if (agent.keyEnvVars && agent.keyEnvVars.length > 0) {
    const dedicated = getDedicatedKeys(agent.id, agent.keyEnvVars);
    keys = dedicated.keys;
    labels = dedicated.labels;
  } else if (agent.provider === "aihubmix") {
    keys = aihubmixKeys;
    labels = aihubmixLabels;
  } else if (agent.provider === "ollama") {
    keys = ollamaKeys;
    labels = ollamaLabels;
  } else {
    keys = [];
    labels = [];
  }

  // OpenRouter (single key, no rotation needed)
  // NOTE: OpenRouter is preserved for future rotation when an API key is
  // available. Currently only Ollama is active. If OPENROUTER_API_KEY is
  // not set, this falls through to the Ollama pool instead of throwing.
  if (agent.provider === "openrouter") {
    if (!process.env.OPENROUTER_API_KEY) {
      // Gracefully fall back to Ollama instead of crashing
      console.warn(`[KeyRotation] ${agent.name}: OpenRouter requested but no API key configured. Falling back to Ollama.`);
      const fallbackKeys = ollamaKeys.length > 0 ? ollamaKeys : [];
      const fallbackLabels = ollamaLabels.length > 0 ? ollamaLabels : [];

      if (fallbackKeys.length === 0) {
        throw new Error(`No OpenRouter API key and no Ollama fallback keys configured for agent '${agent.id}'.`);
      }

      const keyMgr = await loadKeyManager();
      const selection = await keyMgr.selectBestKey(fallbackKeys, "ollama", fallbackLabels);

      const provider = createOpenAI({
        apiKey: selection.key,
        baseURL: process.env.OLLAMA_BASE_URL || "https://ollama.com/v1",
      });
      return {
        model: provider.chat("gemma4:31b-cloud"),
        keySelection: selection,
        provider: "ollama",
      };
    }
    const provider = createOpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    });
    return {
      model: provider.chat(agent.model),
      keySelection: { key: process.env.OPENROUTER_API_KEY, key_label: "OPENROUTER_API_KEY", index: 0, was_rotated: false, rotation_reason: "" },
      provider: "openrouter",
    };
  }

  // Smart key selection with token tracking
  if (keys.length === 0) {
    throw new Error(`No ${agent.provider} API keys configured for agent '${agent.id}'.`);
  }

  const keyMgr = await loadKeyManager();
  const selection = await keyMgr.selectBestKey(keys, agent.provider, labels);

  if (selection.was_rotated) {
    console.log(`[KeyRotation] ${agent.name}: ${selection.rotation_reason} → using ${selection.key_label}`);
  }

  const baseURL = agent.provider === "aihubmix"
    ? process.env.AIHUBMIX_BASE_URL || "https://aihubmix.com/v1"
    : process.env.OLLAMA_BASE_URL || "https://ollama.com/v1";

  const provider = createOpenAI({ apiKey: selection.key, baseURL });
  return {
    model: provider.chat(agent.model),
    keySelection: selection,
    provider: agent.provider,
  };
}

/** Get key rotation stats */
export function getKeyRotationStats() {
  return {
    aihubmix: { availableKeys: aihubmixKeys.length },
    ollama: { availableKeys: ollamaKeys.length },
    dedicated: Array.from(dedicatedKeyCache.entries()).map(([key, val]) => ({
      agent: key.split(":")[0],
      availableKeys: val.keys.length,
      labels: val.labels,
    })),
  };
}

/** Re-export for use in chat route */
export async function recordTokenUsage(...args: Parameters<Awaited<ReturnType<typeof loadKeyManager>>["recordTokenUsage"]>) {
  const km = await loadKeyManager();
  return km.recordTokenUsage(...args);
}

export async function recordKeyError(...args: Parameters<Awaited<ReturnType<typeof loadKeyManager>>["recordKeyError"]>) {
  const km = await loadKeyManager();
  return km.recordKeyError(...args);
}

export async function getAllKeyHealth(...args: Parameters<Awaited<ReturnType<typeof loadKeyManager>>["getAllKeyHealth"]>) {
  const km = await loadKeyManager();
  return km.getAllKeyHealth(...args);
}
