// ---------------------------------------------------------------------------
// Phase 4 Advanced: Conversation Memory with Semantic Search
// ---------------------------------------------------------------------------
// Stores key conversation exchanges with embeddings for semantic retrieval.
// Used by the chat route to inject relevant past context into prompts.
//
// Key capabilities:
// 1. Extract and store conversation memories with auto-summaries
// 2. Semantic search via pgvector cosine similarity + keyword fallback
// 3. Recent memories retrieval for prompt injection
// 4. Importance decay for old memories
//
// Usage:
//   import { extractConversationMemory, searchConversationMemories, getRecentMemories } from "@/lib/memory/conversation-memory"
// ---------------------------------------------------------------------------

import { query } from "@/lib/core/db";
import { logger } from "@/lib/core/logger";
import {
  generateEmbedding,
  embeddingToPgVector,
  EMBEDDING_DIM,
} from "@/lib/memory/embeddings";

// ---------------------------------------------------------------------------
// Schema SQL — exported for the unified schema setup
// ---------------------------------------------------------------------------

export const CONVERSATION_MEMORIES_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS conversation_memories (
  id BIGSERIAL PRIMARY KEY,
  agent_id VARCHAR(100) NOT NULL,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  summary TEXT,
  embedding vector(${EMBEDDING_DIM}),
  importance NUMERIC(3,2) DEFAULT 0.5,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conv_mem_agent ON conversation_memories(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_mem_session ON conversation_memories(session_id);
`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConversationMemory {
  id: number;
  agent_id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  summary: string | null;
  importance: number;
  metadata: Record<string, unknown>;
  created_at: string;
  similarity?: number;
}

// ---------------------------------------------------------------------------
// LLM Summary — generate a brief summary for long content
// ---------------------------------------------------------------------------

async function generateSummary(content: string): Promise<string | null> {
  try {
    const { callLLM } = await import("@/lib/workflows/workflow-types");
    const summary = await callLLM(
      `Summarize the following conversation exchange in 1-2 concise sentences (max 300 characters). Focus on key facts, decisions, and action items:\n\n${content.slice(0, 2000)}`,
      0.2,
    );
    return summary.trim().slice(0, 300) || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Extract and store a conversation memory
// ---------------------------------------------------------------------------

/**
 * Extract a key conversation exchange and store it as a conversation memory.
 * Auto-generates a summary via LLM if content > 200 chars and embeds the summary.
 *
 * @param agentId  - The agent ID this memory belongs to
 * @param sessionId - The conversation session ID
 * @param content   - The raw content of the exchange
 * @param role      - Whether this was a 'user' or 'assistant' message
 * @param importance - Optional importance score (0.0-1.0, default 0.5)
 */
export async function extractConversationMemory(
  agentId: string,
  sessionId: string,
  content: string,
  role: "user" | "assistant",
  importance: number = 0.5,
): Promise<{ id: number; summary: string | null } | null> {
  try {
    // Skip very short or empty content
    if (!content || content.trim().length < 10) {
      return null;
    }

    // Auto-generate summary for long content
    let summary: string | null = content.trim().slice(0, 300);
    if (content.length > 200) {
      summary = await generateSummary(content);
    }

    // Generate embedding for the summary (or content if no summary)
    const textToEmbed = summary || content.slice(0, 500);
    const embedding = await generateEmbedding(textToEmbed);
    const vectorStr = embeddingToPgVector(embedding);

    const clampedImportance = Math.min(1, Math.max(0, importance));

    const result = await query(
      `INSERT INTO conversation_memories (agent_id, session_id, role, content, summary, embedding, importance)
       VALUES ($1, $2, $3, $4, $5, $6::vector, $7)
       RETURNING id`,
      [
        agentId,
        sessionId,
        role,
        content.slice(0, 10000), // Cap content length
        summary,
        vectorStr,
        clampedImportance,
      ],
    );

    if (result.rows.length > 0) {
      logger.debug("conversation-memory", `Stored memory #${result.rows[0].id}`, {
        agentId,
        sessionId,
        role,
        contentLength: content.length,
        hasSummary: !!summary,
      });
      return { id: result.rows[0].id, summary };
    }

    return null;
  } catch (error) {
    logger.error("conversation-memory", "Failed to extract conversation memory", {
      agentId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Semantic search with keyword fallback (hybrid approach like skill-router)
// ---------------------------------------------------------------------------

/**
 * Search conversation memories using hybrid semantic + keyword search.
 * Uses pgvector cosine similarity for vector search and falls back to
 * keyword matching when embeddings are unavailable.
 *
 * @param agentId - The agent to search memories for
 * @param queryText - The search query
 * @param limit - Max results (default 10)
 */
export async function searchConversationMemories(
  agentId: string,
  queryText: string,
  limit: number = 10,
): Promise<ConversationMemory[]> {
  try {
    const embedding = await generateEmbedding(queryText);
    const vectorStr = embeddingToPgVector(embedding);

    // Hybrid: vector search with keyword boost via ILIKE
    const result = await query(
      `SELECT
         id, agent_id, session_id, role, content, summary, importance,
         metadata, created_at,
         (embedding <=> $1::vector) AS distance
       FROM conversation_memories
       WHERE agent_id = $2 AND summary IS NOT NULL AND summary != ''
       ORDER BY
         (embedding <=> $1::vector) ASC,
         importance DESC,
         created_at DESC
       LIMIT $3`,
      [vectorStr, agentId, limit],
    );

    if (result.rows.length > 0) {
      return result.rows.map((row: Record<string, unknown>) => ({
        id: Number(row.id),
        agent_id: row.agent_id as string,
        session_id: row.session_id as string,
        role: row.role as "user" | "assistant",
        content: row.content as string,
        summary: row.summary as string | null,
        importance: Number(row.importance),
        metadata: (typeof row.metadata === "string"
          ? JSON.parse(row.metadata)
          : (row.metadata || {})) as Record<string, unknown>,
        created_at: row.created_at as string,
        similarity: 1 - Number(row.distance),
      }));
    }

    // Keyword fallback — use ILIKE when vector search returns nothing
    logger.debug("conversation-memory", "Vector search returned no results, falling back to keyword search");
    const keywords = queryText
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .slice(0, 5);

    if (keywords.length === 0) return [];

    const keywordConditions = keywords
      .map((_, i) => `(summary ILIKE $${i + 3} OR content ILIKE $${i + 3})`)
      .join(" OR ");

    const keywordParams = [
      agentId,
      limit,
      ...keywords.map((kw) => `%${kw}%`),
    ];

    const keywordResult = await query(
      `SELECT id, agent_id, session_id, role, content, summary, importance,
              metadata, created_at
       FROM conversation_memories
       WHERE agent_id = $1 AND (${keywordConditions})
       ORDER BY importance DESC, created_at DESC
       LIMIT $2`,
      keywordParams,
    );

    return keywordResult.rows.map((row: Record<string, unknown>) => ({
      id: Number(row.id),
      agent_id: row.agent_id as string,
      session_id: row.session_id as string,
      role: row.role as "user" | "assistant",
      content: row.content as string,
      summary: row.summary as string | null,
      importance: Number(row.importance),
      metadata: (typeof row.metadata === "string"
        ? JSON.parse(row.metadata)
        : (row.metadata || {})) as Record<string, unknown>,
      created_at: row.created_at as string,
    }));
  } catch (error) {
    logger.error("conversation-memory", "Failed to search conversation memories", {
      agentId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

// ---------------------------------------------------------------------------
// Recent memories for prompt injection
// ---------------------------------------------------------------------------

/**
 * Get the most recent conversation memories for an agent.
 * Used by the chat route to inject relevant past context into prompts.
 *
 * @param agentId - The agent to get memories for
 * @param limit - Max memories to return (default 20)
 */
export async function getRecentMemories(
  agentId: string,
  limit: number = 20,
): Promise<ConversationMemory[]> {
  try {
    const result = await query(
      `SELECT id, agent_id, session_id, role, content, summary, importance,
              metadata, created_at
       FROM conversation_memories
       WHERE agent_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [agentId, limit],
    );

    return result.rows.map((row: Record<string, unknown>) => ({
      id: Number(row.id),
      agent_id: row.agent_id as string,
      session_id: row.session_id as string,
      role: row.role as "user" | "assistant",
      content: row.content as string,
      summary: row.summary as string | null,
      importance: Number(row.importance),
      metadata: (typeof row.metadata === "string"
        ? JSON.parse(row.metadata)
        : (row.metadata || {})) as Record<string, unknown>,
      created_at: row.created_at as string,
    }));
  } catch (error) {
    logger.error("conversation-memory", "Failed to get recent memories", {
      agentId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

// ---------------------------------------------------------------------------
// Decay old memories — reduce importance over time
// ---------------------------------------------------------------------------

/**
 * Decay the importance of memories older than 30 days.
 * Memories lose 0.05 importance per decay run (capped at 0.1 minimum).
 * Called by the self-improvement cron or manually.
 *
 * @returns The number of memories decayed
 */
export async function decayConversationMemories(): Promise<number> {
  try {
    const result = await query(
      `UPDATE conversation_memories
       SET importance = GREATEST(0.10, importance - 0.05)
       WHERE created_at < NOW() - INTERVAL '30 days'
         AND importance > 0.10`,
    );

    const count = result.rowCount || 0;
    if (count > 0) {
      logger.info("conversation-memory", `Decayed ${count} old memories`);
    }
    return count;
  } catch (error) {
    logger.error("conversation-memory", "Failed to decay memories", {
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}
