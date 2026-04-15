// ---------------------------------------------------------------------------
// Claw — Memory System
//
// Hybrid persistence: Supabase (cloud) with localStorage (offline fallback).
// - When Supabase is configured: reads/writes to Supabase, syncs to localStorage cache
// - When Supabase is not configured: pure localStorage
//
// Two types of memory:
// 1. Conversation History — per-agent, per-session message logs
// 2. Agent Memory — persistent facts/preferences/instructions the agent remembers
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
  category: "general" | "preference" | "context" | "instruction";
  content: string;
  importance: number; // 1-10
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Storage constants (localStorage fallback)
// ---------------------------------------------------------------------------

const CONV_KEY = "claw-conversations";
const MEMORY_KEY = "claw-agent-memory";
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

/** Save a conversation message (both localStorage and Supabase). */
export async function saveMessage(msg: {
  sessionId: string;
  agentId: string;
  role: string;
  content: string;
  toolCalls?: unknown[];
}): Promise<ConversationMessage> {
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

  // Save to Supabase (fire-and-forget)
  const supabase = getSupabase();
  if (supabase) {
    supabase.from("conversations").insert({
      session_id: message.sessionId,
      agent_id: message.agentId,
      role: message.role,
      content: message.content,
      tool_calls: message.toolCalls || null,
    }).then(({ error }) => {
      if (error) console.warn("[Memory] Supabase save failed:", error.message);
    });
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
        // Group by session_id
        const sessions = new Map<string, { messages: string[]; lastActivity: string }>();
        for (const row of data) {
          const sid = row.session_id as string;
          if (!sessions.has(sid)) {
            sessions.set(sid, { messages: [], lastActivity: row.created_at as string });
          }
          sessions.get(sid)!.messages.push(row.content as string);
        }

        const result: Array<{ sessionId: string; lastMessage: string; lastActivity: string; messageCount: number }> = [];
        for (const [sessionId, info] of sessions) {
          const lastMsg = info.messages[info.messages.length - 1] || "";
          result.push({
            sessionId,
            lastMessage: lastMsg.slice(0, 100),
            lastActivity: info.lastActivity,
            messageCount: info.messages.length,
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

// ---------------------------------------------------------------------------
// Agent Memory (Persistent Facts)
// ---------------------------------------------------------------------------

/** Add a memory for an agent. */
export async function addMemory(memory: {
  agentId: string;
  category: "general" | "preference" | "context" | "instruction";
  content: string;
  importance?: number;
}): Promise<AgentMemory> {
  const mem: AgentMemory = {
    id: genId(),
    agentId: memory.agentId,
    category: memory.category,
    content: memory.content,
    importance: memory.importance || 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Save to localStorage
  const all = loadJSON<AgentMemory[]>(MEMORY_KEY, []);
  all.push(mem);
  saveJSON(MEMORY_KEY, all.slice(-MAX_MEMORIES));

  // Save to Supabase
  const supabase = getSupabase();
  if (supabase) {
    await supabase.from("agent_memory").insert({
      agent_id: mem.agentId,
      category: mem.category,
      content: mem.content,
      importance: mem.importance,
    });
  }

  return mem;
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
        .order("updated_at", { ascending: false });

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

/** Get a summary of all agent memories (for context injection). */
export async function getMemorySummary(agentId: string): Promise<string> {
  const memories = await getAgentMemories(agentId);
  if (memories.length === 0) return "";

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

  return parts.join("\n");
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
    // Convert string id to number for Supabase
    const numId = parseInt(id.split("-").pop() || "0", 10);
    if (!isNaN(numId)) {
      await supabase.from("agent_memory").delete().eq("id", numId);
    }
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
