// ---------------------------------------------------------------------------
// Claw — Self-Learning System
//
// Enables agents to learn from user interactions to improve over time.
// Uses pg Pool with SUPABASE_DB_URL (same pattern as activity.ts).
//
// Agents record insights (preferences, corrections, patterns, skill gains,
// workflows) and apply them in future conversations.
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-require-imports */
const { Pool } = require("pg");
/* eslint-enable @typescript-eslint/no-require-imports */

function getPool() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) throw new Error("SUPABASE_DB_URL is not configured.");
  return new Pool({ connectionString });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LearningInsight {
  id: string;
  agentId: string;
  insightType: "preference" | "correction" | "pattern" | "skill_gain" | "workflow";
  content: string;
  source: "user_feedback" | "correction" | "pattern_detection" | "routine_result";
  confidence: number;
  applicationCount: number;
  lastAppliedAt: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// SQL Schema
// ---------------------------------------------------------------------------

export const LEARNING_INSIGHTS_SCHEMA = `
CREATE TABLE IF NOT EXISTS learning_insights (
  id BIGSERIAL PRIMARY KEY,
  agent_id TEXT NOT NULL,
  insight_type TEXT NOT NULL DEFAULT 'preference' CHECK (insight_type IN ('preference', 'correction', 'pattern', 'skill_gain', 'workflow')),
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'user_feedback' CHECK (source IN ('user_feedback', 'correction', 'pattern_detection', 'routine_result')),
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.50 CHECK (confidence >= 0 AND confidence <= 1),
  application_count INTEGER NOT NULL DEFAULT 0,
  last_applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_agent ON learning_insights(agent_id, insight_type);
CREATE INDEX IF NOT EXISTS idx_learning_confidence ON learning_insights(confidence DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_applied ON learning_insights(last_applied_at DESC);
`;

// ---------------------------------------------------------------------------
// recordLearning — Save a new insight
// ---------------------------------------------------------------------------

export async function recordLearning(params: {
  agentId: string;
  insightType: LearningInsight["insightType"];
  content: string;
  source: LearningInsight["source"];
  confidence?: number;
}): Promise<LearningInsight | null> {
  if (!process.env.SUPABASE_DB_URL) return null;

  const pool = getPool();
  try {
    const conf = Math.min(1, Math.max(0, params.confidence ?? 0.5));

    const result = await pool.query(
      `INSERT INTO learning_insights (agent_id, insight_type, content, source, confidence)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, agent_id, insight_type, content, source, confidence, application_count, last_applied_at, created_at, updated_at`,
      [params.agentId, params.insightType, params.content, params.source, conf],
    );
    await pool.end();

    if (result.rows.length > 0) return mapRow(result.rows[0]);
    return null;
  } catch (err) {
    console.warn("[SelfLearning] Failed to record learning:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// getAgentInsights — Get learnings for an agent (optionally filtered by type)
// ---------------------------------------------------------------------------

export async function getAgentInsights(
  agentId: string,
  type?: LearningInsight["insightType"],
  limit = 50,
): Promise<LearningInsight[]> {
  if (!process.env.SUPABASE_DB_URL) return [];

  const pool = getPool();
  try {
    let query: string;
    let params: (string | number)[];

    if (type) {
      query = `SELECT id, agent_id, insight_type, content, source, confidence, application_count, last_applied_at, created_at, updated_at
               FROM learning_insights
               WHERE agent_id = $1 AND insight_type = $2
               ORDER BY confidence DESC, updated_at DESC
               LIMIT $3`;
      params = [agentId, type, limit];
    } else {
      query = `SELECT id, agent_id, insight_type, content, source, confidence, application_count, last_applied_at, created_at, updated_at
               FROM learning_insights
               WHERE agent_id = $1
               ORDER BY confidence DESC, updated_at DESC
               LIMIT $2`;
      params = [agentId, limit];
    }

    const result = await pool.query(query, params);
    await pool.end();
    return result.rows.map(mapRow);
  } catch (err) {
    console.warn("[SelfLearning] Failed to get agent insights:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// getInsightsForPrompt — Format top insights for injection into system prompt
// ---------------------------------------------------------------------------

export async function getInsightsForPrompt(agentId: string, maxInsights = 10): Promise<string> {
  const insights = await getAgentInsights(agentId, undefined, maxInsights);
  if (insights.length === 0) return "";

  const parts: string[] = ["[LEARNED BEHAVIORS — Apply these patterns from past interactions]"];

  for (const insight of insights) {
    const confPct = Math.round(insight.confidence * 100);
    const sourceLabel = insight.source.replace(/_/g, " ");
    const appliedStr = insight.applicationCount > 0 ? ` (applied ${insight.applicationCount}x)` : "";
    parts.push(`- [${insight.insightType.toUpperCase()}] ${insight.content} (confidence: ${confPct}%, source: ${sourceLabel}${appliedStr})`);
  }

  parts.push("[END LEARNED BEHAVIORS]");

  // Mark all applied insights to update their application_count and last_applied_at
  markInsightsApplied(insights.map(i => String(i.id))).catch(() => {});

  return parts.join("\n");
}

/**
 * Mark multiple insights as applied in a single query.
 * Updates application_count, last_applied_at, confidence, and updated_at.
 */
async function markInsightsApplied(insightIds: string[]): Promise<void> {
  if (insightIds.length === 0) return;
  try {
    const pool = getPool();
    await pool.query(
      `UPDATE learning_insights
       SET application_count = application_count + 1,
           last_applied_at = NOW(),
           confidence = LEAST(1.0, confidence + 0.02),
           updated_at = NOW()
       WHERE id = ANY($1::text[])`,
      [insightIds],
    );
    await pool.end();
  } catch { /* non-critical */ }
}

// ---------------------------------------------------------------------------
// applyInsight — Increment application count and update last_applied_at
// ---------------------------------------------------------------------------

export async function applyInsight(id: string): Promise<boolean> {
  if (!process.env.SUPABASE_DB_URL) return false;

  const pool = getPool();
  try {
    const numId = parseInt(id, 10);
    if (isNaN(numId)) return false;

    await pool.query(
      `UPDATE learning_insights
       SET application_count = application_count + 1,
           last_applied_at = NOW(),
           confidence = LEAST(1.0, confidence + 0.02),
           updated_at = NOW()
       WHERE id = $1`,
      [numId],
    );
    await pool.end();
    return true;
  } catch (err) {
    console.warn("[SelfLearning] Failed to apply insight:", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// detectPatterns — Analyze recent conversations to find patterns
// Lightweight heuristic-based pattern detection (no LLM call needed).
// ---------------------------------------------------------------------------

export async function detectPatterns(
  agentId: string,
  recentConversations: Array<{ role: string; content: string }>,
): Promise<LearningInsight[]> {
  if (!process.env.SUPABASE_DB_URL || recentConversations.length === 0) return [];

  const detected: Array<{
    insightType: LearningInsight["insightType"];
    content: string;
    confidence: number;
  }> = [];

  // Pattern 1: User frequently uses certain phrasing (e.g., "make it shorter", "more detail")
  const userMessages = recentConversations
    .filter((m) => m.role === "user")
    .map((m) => m.content.toLowerCase());

  // Detect "make it shorter/longer" preference
  const shortenRequests = userMessages.filter((m) =>
    m.includes("shorter") || m.includes("brief") || m.includes("concise") || m.includes("keep it short"),
  ).length;
  const lengthenRequests = userMessages.filter((m) =>
    m.includes("longer") || m.includes("more detail") || m.includes("elaborate") || m.includes("expand"),
  ).length;

  if (shortenRequests >= 2) {
    detected.push({
      insightType: "preference",
      content: "User prefers concise, brief responses. Keep answers short and to the point.",
      confidence: Math.min(0.9, 0.5 + shortenRequests * 0.1),
    });
  }
  if (lengthenRequests >= 2) {
    detected.push({
      insightType: "preference",
      content: "User prefers detailed, elaborate responses with thorough explanations.",
      confidence: Math.min(0.9, 0.5 + lengthenRequests * 0.1),
    });
  }

  // Pattern 2: User prefers specific formatting (code blocks, lists, tables)
  const formatRequests = userMessages.filter((m) =>
    m.includes("format") || m.includes("table") || m.includes("list") || m.includes("bullet"),
  ).length;
  const tableRequests = userMessages.filter((m) => m.includes("table")).length;
  const listRequests = userMessages.filter((m) => m.includes("list") || m.includes("bullet")).length;

  if (tableRequests >= 2) {
    detected.push({
      insightType: "preference",
      content: "User frequently requests tabular formatting. Present data in tables when possible.",
      confidence: Math.min(0.85, 0.5 + tableRequests * 0.1),
    });
  }
  if (listRequests >= 3) {
    detected.push({
      insightType: "preference",
      content: "User prefers list/bullet-point formatting for structured information.",
      confidence: Math.min(0.85, 0.5 + listRequests * 0.08),
    });
  }

  // Pattern 3: Detect recurring topics (tool usage patterns)
  const toolRelatedMessages = userMessages.filter((m) =>
    m.includes("schedule") || m.includes("remind") || m.includes("todo") || m.includes("task"),
  ).length;
  if (toolRelatedMessages >= 3) {
    detected.push({
      insightType: "workflow",
      content: "User frequently works with scheduling and task management. Proactively suggest using reminders and todos when relevant.",
      confidence: Math.min(0.8, 0.4 + toolRelatedMessages * 0.08),
    });
  }

  // Pattern 4: Detect correction patterns (user says "no", "wrong", "not what I meant")
  const corrections = userMessages.filter((m) =>
    m.includes("not what") || m.includes("wrong") || m.includes("that's not") || m.includes("i meant") || m.includes("no,"),
  ).length;
  if (corrections >= 2) {
    detected.push({
      insightType: "correction",
      content: "User has made several corrections recently. Pay extra attention to the specific request and clarify before proceeding.",
      confidence: Math.min(0.85, 0.5 + corrections * 0.1),
    });
  }

  // Save detected patterns as insights (avoid duplicates)
  const saved: LearningInsight[] = [];
  for (const pattern of detected) {
    // Check if similar insight already exists
    const existing = await getAgentInsights(agentId, pattern.insightType, 50);
    const isDuplicate = existing.some(
      (e) => e.content.toLowerCase().slice(0, 50) === pattern.content.toLowerCase().slice(0, 50),
    );
    if (!isDuplicate) {
      const insight = await recordLearning({
        agentId,
        insightType: pattern.insightType,
        content: pattern.content,
        source: "pattern_detection",
        confidence: pattern.confidence,
      });
      if (insight) saved.push(insight);
    }
  }

  return saved;
}

// ---------------------------------------------------------------------------
// decayInsights — Reduce confidence of unused insights over time
// Insights not applied in 30+ days lose 10% confidence per run.
// ---------------------------------------------------------------------------

export async function decayInsights(): Promise<number> {
  if (!process.env.SUPABASE_DB_URL) return 0;

  const pool = getPool();
  try {
    const result = await pool.query(
      `UPDATE learning_insights
       SET confidence = GREATEST(0.1, confidence - 0.10),
           updated_at = NOW()
       WHERE ((last_applied_at IS NULL AND created_at < NOW() - INTERVAL '30 days')
          OR (last_applied_at IS NOT NULL AND last_applied_at < NOW() - INTERVAL '30 days'))
         AND confidence > 0.1`,
    );
    await pool.end();
    return result.rowCount || 0;
  } catch (err) {
    console.warn("[SelfLearning] Failed to decay insights:", err);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// getLearningStats — Aggregate stats for the learning system
// ---------------------------------------------------------------------------

export async function getLearningStats(): Promise<{
  totalInsights: number;
  byAgent: Record<string, number>;
  byType: Record<string, number>;
  avgConfidence: number;
  topApplied: number;
}> {
  if (!process.env.SUPABASE_DB_URL) {
    return { totalInsights: 0, byAgent: {}, byType: {}, avgConfidence: 0, topApplied: 0 };
  }

  const pool = getPool();
  try {
    const totalResult = await pool.query(`SELECT COUNT(*) as count FROM learning_insights`);
    const agentResult = await pool.query(`SELECT agent_id, COUNT(*) as count FROM learning_insights GROUP BY agent_id ORDER BY count DESC`);
    const typeResult = await pool.query(`SELECT insight_type, COUNT(*) as count FROM learning_insights GROUP BY insight_type ORDER BY count DESC`);
    const confResult = await pool.query(`SELECT AVG(confidence)::numeric as avg_conf FROM learning_insights`);
    const appliedResult = await pool.query(
      `SELECT COALESCE(SUM(application_count), 0) as total FROM learning_insights`,
    );

    await pool.end();

    const byAgent: Record<string, number> = {};
    for (const row of agentResult.rows) {
      byAgent[row.agent_id] = parseInt(row.count, 10);
    }
    const byType: Record<string, number> = {};
    for (const row of typeResult.rows) {
      byType[row.insight_type] = parseInt(row.count, 10);
    }

    return {
      totalInsights: parseInt(totalResult.rows[0]?.count || "0", 10),
      byAgent,
      byType,
      avgConfidence: parseFloat(confResult.rows[0]?.avg_conf || "0"),
      topApplied: parseInt(appliedResult.rows[0]?.total || "0", 10),
    };
  } catch (err) {
    console.warn("[SelfLearning] Failed to get stats:", err);
    return { totalInsights: 0, byAgent: {}, byType: {}, avgConfidence: 0, topApplied: 0 };
  }
}

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

function mapRow(row: Record<string, unknown>): LearningInsight {
  return {
    id: String(row.id),
    agentId: row.agent_id as string,
    insightType: row.insight_type as LearningInsight["insightType"],
    content: row.content as string,
    source: row.source as LearningInsight["source"],
    confidence: parseFloat(row.confidence as string),
    applicationCount: parseInt(row.application_count as string, 10),
    lastAppliedAt: (row.last_applied_at as string) || "",
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
