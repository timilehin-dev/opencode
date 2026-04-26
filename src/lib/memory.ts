// ---------------------------------------------------------------------------
// Klawhub — Memory System (Enhanced with 3-Layer Architecture)
//
// Hybrid persistence: Supabase (cloud) with localStorage (offline fallback).
// - When Supabase is configured: reads/writes to Supabase, syncs to localStorage cache
// - When Supabase is not configured: pure localStorage
//
// Three memory layers (per roadmap):
// 1. Episodic Memory — What happened (events, interactions, outcomes)
// 2. Semantic Memory — What was learned (facts, preferences, knowledge)
// 3. Procedural Memory — How to do things (workflows, recipes, best practices)
//
// Legacy categories (general, preference, context, instruction) still work.
// ---------------------------------------------------------------------------

import { getSupabase } from "./supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConversationMessage {
  id: string;
  sessionId: string;
  agentId: string;
  role: "user" | "assistant" | "system";
  content: string;
  toolCalls?: unknown[];
  createdAt: string;
}

export interface AgentMemory {
  id: string;
  agentId: string;
  category: "general" | "preference" | "context" | "instruction" | "episodic" | "semantic" | "procedural";
  content: string;
  importance: number; // 1-10
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>; // Optional structured data (e.g., outcome, tags)
}

// ---------------------------------------------------------------------------
// Storage constants (localStorage fallback)
// ---------------------------------------------------------------------------

const CONV_KEY = "klaw-conversations";
const MEMORY_KEY = "klaw-agent-memory";
const MAX_CONV_MESSAGES = 200; // Per session
const MAX_MEMORIES = 500; // Total across all agents

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    console.warn(`[Memory] Failed to save ${key} to localStorage`);
  }
}

// ---------------------------------------------------------------------------
// Conversation History
// ---------------------------------------------------------------------------

/** Save a conversation message (both localStorage and Supabase).
 *  Includes deduplication: if the last message for this session has the same
 *  role + content (first 50 chars), it's a duplicate and is skipped. */
export async function saveMessage(msg: {
  sessionId: string;
  agentId: string;
  role: string;
  content: string;
  toolCalls?: unknown[];
}): Promise<ConversationMessage> {
  // Deduplicate: skip if last message in localStorage for this session is identical
  const existing = loadJSON<ConversationMessage[]>(CONV_KEY, []);
  const lastForSession = [...existing].reverse().find(
    (m) => m.sessionId === msg.sessionId && m.agentId === msg.agentId
  );
  if (lastForSession && lastForSession.role === msg.role && lastForSession.content === msg.content) {
    return lastForSession; // Exact duplicate — skip
  }

  const message: ConversationMessage = {
    id: genId(),
    sessionId: msg.sessionId,
    agentId: msg.agentId,
    role: msg.role as ConversationMessage["role"],
    content: msg.content,
    toolCalls: msg.toolCalls,
    createdAt: new Date().toISOString(),
  };

  // Save to localStorage
  const all = loadJSON<ConversationMessage[]>(CONV_KEY, []);
  all.push(message);
  // Trim to last N messages
  const trimmed = all.length > MAX_CONV_MESSAGES
    ? all.slice(-MAX_CONV_MESSAGES)
    : all;
  saveJSON(CONV_KEY, trimmed);

  // Save to Supabase with retry (up to 2 retries)
  const supabase = getSupabase();
  if (supabase) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { error } = await supabase.from("conversations").insert({
          session_id: message.sessionId,
          agent_id: message.agentId,
          role: message.role,
          content: message.content,
          tool_calls: message.toolCalls || null,
        });
        if (error) throw error;
        break; // Success — exit retry loop
      } catch (err) {
        if (attempt === 2) {
          console.error("[Memory] Supabase save failed after 3 attempts:", err instanceof Error ? err.message : err);
        } else {
          // Exponential backoff: 100ms, 300ms
          await new Promise(r => setTimeout(r, 100 * Math.pow(3, attempt)));
        }
      }
    }
  }

  return message;
}

/** Get conversation history for a specific agent session. */
export async function getConversationHistory(
  sessionId: string,
  agentId: string,
  limit: number = 50
): Promise<ConversationMessage[]> {
  const supabase = getSupabase();

  // Try Supabase first
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, session_id, agent_id, role, content, tool_calls, created_at")
        .eq("session_id", sessionId)
        .eq("agent_id", agentId)
        .order("created_at", { ascending: true })
        .limit(limit);

      if (!error && data && data.length > 0) {
        return data.map(rowToConversation);
      }
    } catch {
      // Fall through to localStorage
    }
  }

  // Fallback: localStorage
  const all = loadJSON<ConversationMessage[]>(CONV_KEY, []);
  return all
    .filter((m) => m.sessionId === sessionId && m.agentId === agentId)
    .slice(-limit);
}

/** Get session messages formatted for useChat's initialMessages. */
export async function getSessionMessages(
  sessionId: string,
  agentId: string,
): Promise<Array<{ role: string; content: string }>> {
  const history = await getConversationHistory(sessionId, agentId, 100);
  return history.map((msg) => ({
    role: msg.role === "assistant" ? "assistant" : "user",
    content: msg.content,
  }));
}

/** Get a list of recent session IDs for an agent (for conversations panel). */
export async function getAgentSessions(
  agentId: string,
  limit: number = 20,
): Promise<Array<{ sessionId: string; lastMessage: string; lastActivity: string; messageCount: number }>> {
  const supabase = getSupabase();

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("conversations")
        .select("session_id, content, created_at")
        .eq("agent_id", agentId)
        .order("created_at", { ascending: false })
        .limit(500);

      if (!error && data && data.length > 0) {
        // Group by session_id — data is descending by created_at
        const sessions = new Map<string, { lastMessage: string; messageCount: number; lastActivity: string }>();
        for (const row of data) {
          const sid = row.session_id as string;
          if (!sessions.has(sid)) {
            // First row is the newest message for this session
            sessions.set(sid, {
              lastMessage: (row.content as string).slice(0, 100),
              messageCount: 1,
              lastActivity: row.created_at as string,
            });
          } else {
            sessions.get(sid)!.messageCount++;
          }
        }

        const result: Array<{ sessionId: string; lastMessage: string; lastActivity: string; messageCount: number }> = [];
        for (const [sessionId, info] of sessions) {
          result.push({
            sessionId,
            lastMessage: info.lastMessage,
            lastActivity: info.lastActivity,
            messageCount: info.messageCount,
          });
        }

        // Sort by last activity descending
        result.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());
        return result.slice(0, limit);
      }
    } catch {
      // Fall through
    }
  }

  // Fallback: localStorage
  const all = loadJSON<ConversationMessage[]>(CONV_KEY, []);
  const agentMsgs = all.filter((m) => m.agentId === agentId);
  const sessions = new Map<string, { messages: string[]; lastActivity: string }>();
  for (const msg of agentMsgs) {
    if (!sessions.has(msg.sessionId)) {
      sessions.set(msg.sessionId, { messages: [], lastActivity: msg.createdAt });
    }
    sessions.get(msg.sessionId)!.messages.push(msg.content);
  }

  const result: Array<{ sessionId: string; lastMessage: string; lastActivity: string; messageCount: number }> = [];
  for (const [sessionId, info] of sessions) {
    result.push({
      sessionId,
      lastMessage: (info.messages[info.messages.length - 1] || "").slice(0, 100),
      lastActivity: info.lastActivity,
      messageCount: info.messages.length,
    });
  }
  result.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());
  return result.slice(0, limit);
}

/** Get recent conversations across all agents (for the dashboard). */
export async function getRecentConversations(limit: number = 20): Promise<ConversationMessage[]> {
  const supabase = getSupabase();

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, session_id, agent_id, role, content, tool_calls, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (!error && data) {
        return data.map(rowToConversation).reverse();
      }
    } catch {
      // Fall through
    }
  }

  const all = loadJSON<ConversationMessage[]>(CONV_KEY, []);
  return all.slice(-limit);
}

/** Get recent sessions across ALL agents (for global conversation history). */
export async function getAllRecentSessions(limit: number = 30): Promise<Array<{
  sessionId: string;
  agentId: string;
  lastMessage: string;
  lastActivity: string;
  messageCount: number;
}>> {
  const supabase = getSupabase();

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("conversations")
        .select("session_id, agent_id, content, created_at")
        .order("created_at", { ascending: false })
        .limit(1000);

      if (!error && data && data.length > 0) {
        // Group by session_id, track agent_id
        const sessions = new Map<string, { agentId: string; lastMessage: string; messageCount: number; lastActivity: string }>();
        for (const row of data) {
          const sid = row.session_id as string;
          if (!sessions.has(sid)) {
            // First row is the newest (descending order), use it for lastMessage
            sessions.set(sid, {
              agentId: row.agent_id as string,
              lastMessage: (row.content as string).slice(0, 100),
              messageCount: 1,
              lastActivity: row.created_at as string,
            });
          } else {
            sessions.get(sid)!.messageCount++;
          }
        }

        const result = Array.from(sessions.entries()).map(([sessionId, info]) => ({
          sessionId,
          agentId: info.agentId,
          lastMessage: info.lastMessage,
          lastActivity: info.lastActivity,
          messageCount: info.messageCount,
        }));

        result.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());
        return result.slice(0, limit);
      }
    } catch {
      // Fall through
    }
  }

  // Fallback: localStorage
  const all = loadJSON<ConversationMessage[]>(CONV_KEY, []);
  const sessions = new Map<string, { agentId: string; messages: string[]; lastActivity: string }>();
  for (const msg of all) {
    if (!sessions.has(msg.sessionId)) {
      sessions.set(msg.sessionId, { agentId: msg.agentId, messages: [], lastActivity: msg.createdAt });
    }
    sessions.get(msg.sessionId)!.messages.push(msg.content);
  }

  const result = Array.from(sessions.entries()).map(([sessionId, info]) => ({
    sessionId,
    agentId: info.agentId,
    lastMessage: (info.messages[info.messages.length - 1] || "").slice(0, 100),
    lastActivity: info.lastActivity,
    messageCount: info.messages.length,
  }));
  result.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());
  return result.slice(0, limit);
}

/** Clear conversation history for a specific agent. */
export async function clearConversationHistory(agentId?: string): Promise<void> {
  // localStorage
  if (agentId) {
    const all = loadJSON<ConversationMessage[]>(CONV_KEY, []);
    const filtered = all.filter((m) => m.agentId !== agentId);
    saveJSON(CONV_KEY, filtered);
  } else {
    localStorage.removeItem(CONV_KEY);
  }

  // Supabase
  const supabase = getSupabase();
  if (supabase) {
    if (agentId) {
      await supabase.from("conversations").delete().eq("agent_id", agentId);
    } else {
      await supabase.from("conversations").delete().neq("id", 0); // Delete all
    }
  }
}

/** Purge ALL conversation history — localStorage + Supabase + session maps.
 *  Used to start completely fresh.
 *  @param scope - 'conversations' (default) purges only conversation data;
 *                'all' also purges agent_memory, agent_activity, and learning_insights tables. */
export async function purgeAllConversations(scope: 'conversations' | 'all' = 'conversations'): Promise<{ localStorage: boolean; supabase: boolean; agentMemory: boolean; agentActivity: boolean; learningInsights: boolean }> {
  let localStorageCleared = false;
  let supabaseCleared = false;
  let agentMemoryCleared = false;
  let agentActivityCleared = false;
  let learningInsightsCleared = false;

  // Clear localStorage conversation data
  try {
    localStorage.removeItem(CONV_KEY);
    localStorage.removeItem("klaw-agent-sessions");
    localStorage.removeItem("klaw-last-active-agent");
    if (scope === 'all') {
      localStorage.removeItem(MEMORY_KEY);
    }
    localStorageCleared = true;
  } catch {
    // ignore
  }

  // Clear Supabase conversations
  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from("conversations").delete().neq("id", 0);
      supabaseCleared = true;
    } catch {
      // ignore
    }

    // Optionally purge additional tables
    if (scope === 'all') {
      try {
        await supabase.from("agent_memory").delete().neq("id", 0);
        agentMemoryCleared = true;
      } catch {
        // ignore — don't cascade failure
      }

      try {
        await supabase.from("agent_activity").delete().neq("id", 0);
        agentActivityCleared = true;
      } catch {
        // ignore — don't cascade failure
      }

      try {
        await supabase.from("learning_insights").delete().neq("id", 0);
        learningInsightsCleared = true;
      } catch {
        // ignore — don't cascade failure
      }
    }
  }

  return { localStorage: localStorageCleared, supabase: supabaseCleared, agentMemory: agentMemoryCleared, agentActivity: agentActivityCleared, learningInsights: learningInsightsCleared };
}

/** Delete a specific session's messages (both localStorage + Supabase).
 *  Always deletes from Supabase regardless of localStorage state.
 *  Returns true if any messages were found and deleted. */
export async function deleteSession(sessionId: string, agentId: string): Promise<boolean> {
  // localStorage: remove all messages with this sessionId + agentId
  const all = loadJSON<ConversationMessage[]>(CONV_KEY, []);
  const filtered = all.filter(m => !(m.sessionId === sessionId && m.agentId === agentId));
  const found = all.length !== filtered.length;
  saveJSON(CONV_KEY, filtered);

  // Supabase: ALWAYS attempt delete (don't skip based on localStorage state)
  const supabase = getSupabase();
  if (supabase) {
    const { error } = await supabase
      .from("conversations")
      .delete()
      .eq("session_id", sessionId)
      .eq("agent_id", agentId);
    if (error) {
      console.warn("[Memory] Supabase delete session failed:", error.message);
    }
  }

  return found;
}

// ---------------------------------------------------------------------------
// Agent Memory (Persistent Facts)
// ---------------------------------------------------------------------------

/** Add a memory for an agent. */
export async function addMemory(memory: {
  agentId: string;
  category: "general" | "preference" | "context" | "instruction" | "episodic" | "semantic" | "procedural";
  content: string;
  importance?: number;
  metadata?: Record<string, unknown>;
}): Promise<AgentMemory> {
  const mem: AgentMemory = {
    id: genId(),
    agentId: memory.agentId,
    category: memory.category,
    content: memory.content,
    importance: memory.importance || 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: memory.metadata,
  };

  // Save to localStorage
  const all = loadJSON<AgentMemory[]>(MEMORY_KEY, []);
  all.push(mem);
  saveJSON(MEMORY_KEY, all.slice(-MAX_MEMORIES));

  // Save to Supabase
  const supabase = getSupabase();
  if (supabase) {
    const insertData: Record<string, unknown> = {
      agent_id: mem.agentId,
      category: mem.category,
      content: mem.content,
      importance: mem.importance,
    };
    if (mem.metadata) {
      insertData.metadata = mem.metadata;
    }
    await supabase.from("agent_memory").insert(insertData);
  }

  return mem;
}

/** Get all memories across all agents (for memory management page). */
export async function getAllMemories(): Promise<AgentMemory[]> {
  const supabase = getSupabase();

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("agent_memory")
        .select("*")
        .order("importance", { ascending: false })
        .order("updated_at", { ascending: false });

      if (!error && data) {
        return data.map(rowToMemory);
      }
    } catch {
      // Fall through
    }
  }

  return loadJSON<AgentMemory[]>(MEMORY_KEY, [])
    .sort((a, b) => b.importance - a.importance || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/** Get all memories for an agent. */
export async function getAgentMemories(agentId: string): Promise<AgentMemory[]> {
  const supabase = getSupabase();

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("agent_memory")
        .select("*")
        .eq("agent_id", agentId)
        .order("importance", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(50);

      if (!error && data) {
        return data.map(rowToMemory);
      }
    } catch {
      // Fall through
    }
  }

  return loadJSON<AgentMemory[]>(MEMORY_KEY, [])
    .filter((m) => m.agentId === agentId)
    .sort((a, b) => b.importance - a.importance);
}

// Cache memory summaries to avoid Supabase REST query on every request
const _memorySummaryCache = new Map<string, { data: string; ts: number }>();
const MEMORY_SUMMARY_TTL = 30_000; // 30s

/** Get a summary of all agent memories (for context injection). */
export async function getMemorySummary(agentId: string): Promise<string> {
  // Check cache
  const cached = _memorySummaryCache.get(agentId);
  if (cached && Date.now() - cached.ts < MEMORY_SUMMARY_TTL) {
    return cached.data;
  }

  const MAX_MEMORY_CHARS = 4000;
  const memories = await getAgentMemories(agentId);
  if (memories.length === 0) {
    _memorySummaryCache.set(agentId, { data: "", ts: Date.now() });
    return "";
  }

  const byCategory = new Map<string, AgentMemory[]>();
  for (const mem of memories) {
    if (!byCategory.has(mem.category)) byCategory.set(mem.category, []);
    byCategory.get(mem.category)!.push(mem);
  }

  const parts: string[] = [];
  for (const [category, items] of byCategory) {
    parts.push(`[${category.toUpperCase()}]`);
    for (const item of items) {
      parts.push(`- ${item.content}`);
    }
  }

  const result = parts.join("\n");
  const finalResult = result.length > MAX_MEMORY_CHARS
    ? (() => {
        let truncated = "";
        for (const part of parts) {
          if (truncated.length + part.length + 1 > MAX_MEMORY_CHARS) break;
          truncated += (truncated ? "\n" : "") + part;
        }
        return truncated + "\n[Memory truncated — older items omitted to save context]";
      })()
    : result;

  _memorySummaryCache.set(agentId, { data: finalResult, ts: Date.now() });
  return finalResult;
}

/** Delete a memory by ID. */
export async function deleteMemory(id: string): Promise<boolean> {
  // localStorage
  const all = loadJSON<AgentMemory[]>(MEMORY_KEY, []);
  const filtered = all.filter((m) => m.id !== id);
  const found = all.length !== filtered.length;
  saveJSON(MEMORY_KEY, filtered);

  // Supabase
  const supabase = getSupabase();
  if (supabase && found) {
    // Convert string id to number for Supabase (BIGSERIAL)
    // Try parsing the full string first (handles pure numeric IDs from Supabase),
    // then fall back to the first segment before "-" (handles generated IDs like "1234567890-abc123")
    let numId = parseInt(id, 10);
    if (isNaN(numId)) {
      numId = parseInt(id.split("-")[0] || "0", 10);
    }
    if (isNaN(numId)) return false;
    await supabase.from("agent_memory").delete().eq("id", numId);
  }

  return found;
}

// ---------------------------------------------------------------------------
// Row Converters
// ---------------------------------------------------------------------------

function rowToConversation(row: Record<string, unknown>): ConversationMessage {
  return {
    id: String(row.id),
    sessionId: row.session_id as string,
    agentId: row.agent_id as string,
    role: row.role as ConversationMessage["role"],
    content: row.content as string,
    toolCalls: typeof row.tool_calls === "string" ? JSON.parse(row.tool_calls) : (row.tool_calls as unknown[] | undefined),
    createdAt: row.created_at as string,
  };
}

function rowToMemory(row: Record<string, unknown>): AgentMemory {
  return {
    id: String(row.id),
    agentId: row.agent_id as string,
    category: row.category as AgentMemory["category"],
    content: row.content as string,
    importance: row.importance as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ---------------------------------------------------------------------------
// 3-Layer Memory Convenience Functions (per roadmap)
// ---------------------------------------------------------------------------

/** Save an episodic memory — records what happened (event, interaction, outcome). */
export async function saveEpisodicMemory(params: {
  agentId: string;
  event: string;
  outcome: string;
  importance?: number;
}): Promise<AgentMemory> {
  return addMemory({
    agentId: params.agentId,
    category: "episodic",
    content: params.event,
    importance: params.importance || 4,
    metadata: { outcome: params.outcome, type: "episodic" },
  });
}

/** Save a semantic memory — records what was learned (fact, preference, knowledge). */
export async function saveSemanticMemory(params: {
  agentId: string;
  fact: string;
  confidence?: "certain" | "likely" | "observed";
  importance?: number;
}): Promise<AgentMemory> {
  return addMemory({
    agentId: params.agentId,
    category: "semantic",
    content: params.fact,
    importance: params.importance || 6,
    metadata: { confidence: params.confidence || "observed", type: "semantic" },
  });
}

/** Save a procedural memory — records how to do something (workflow, recipe, best practice). */
export async function saveProceduralMemory(params: {
  agentId: string;
  procedure: string;
  context?: string;
  importance?: number;
}): Promise<AgentMemory> {
  return addMemory({
    agentId: params.agentId,
    category: "procedural",
    content: params.procedure,
    importance: params.importance || 7,
    metadata: { context: params.context || "", type: "procedural" },
  });
}

/** Get layered memory summary for injection into agent context. */
export async function getLayeredMemorySummary(agentId: string): Promise<string> {
  const memories = await getAgentMemories(agentId);
  if (memories.length === 0) return "";

  // Group by the 3 layers
  const episodic = memories.filter(m => m.category === "episodic").slice(0, 5);
  const semantic = memories.filter(m => m.category === "semantic" || m.category === "preference").slice(0, 10);
  const procedural = memories.filter(m => m.category === "procedural" || m.category === "instruction").slice(0, 5);

  const parts: string[] = [];

  if (episodic.length > 0) {
    parts.push("[RECENT EVENTS]");
    for (const item of episodic) {
      parts.push(`- ${item.content}`);
    }
  }

  if (semantic.length > 0) {
    parts.push("[WHAT WE KNOW]");
    for (const item of semantic) {
      parts.push(`- ${item.content}`);
    }
  }

  if (procedural.length > 0) {
    parts.push("[HOW TO DO THINGS]");
    for (const item of procedural) {
      parts.push(`- ${item.content}`);
    }
  }

  // Include legacy categories
  const legacy = memories.filter(m => !["episodic", "semantic", "procedural"].includes(m.category)).slice(0, 10);
  if (legacy.length > 0) {
    parts.push("[OTHER NOTES]");
    for (const item of legacy) {
      parts.push(`- [${item.category}] ${item.content}`);
    }
  }

  return parts.join("\n");
}
