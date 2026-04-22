// ---------------------------------------------------------------------------
// Phase 7A: Hybrid Skill Search Route
// ---------------------------------------------------------------------------
// POST /api/skills/search — Combines vector + keyword search with RRF reranking
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { generateEmbedding, embeddingToPgVector } from "@/lib/embeddings";

/* eslint-disable @typescript-eslint/no-require-imports */
const { Pool } = require("pg");

function getPool() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) throw new Error("SUPABASE_DB_URL not configured");
  return new Pool({ connectionString, max: 3, idleTimeoutMillis: 10000 });
}

// ---------------------------------------------------------------------------
// TF-IDF-like scoring (from skill-router, replicated for the search API)
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
  "as", "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "again", "further", "then",
  "once", "here", "there", "when", "where", "why", "how", "all", "both",
  "each", "few", "more", "most", "other", "some", "such", "no", "nor",
  "not", "only", "own", "same", "so", "than", "too", "very", "just",
  "because", "but", "and", "or", "if", "while", "about", "up", "it",
  "its", "i", "me", "my", "myself", "we", "our", "you", "your", "he",
  "him", "his", "she", "her", "they", "them", "their", "this", "that",
  "these", "those", "what", "which", "who", "whom", "please", "help",
  "want", "make", "get", "tell", "give", "try", "know", "think", "like",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, " ")
    .split(/\s+/)
    .filter((w: string) => w.length > 1 && !STOP_WORDS.has(w));
}

function computeTfIdfScore(
  queryTokens: string[],
  fieldTokens: string[]
): number {
  if (queryTokens.length === 0 || fieldTokens.length === 0) return 0;

  const fieldFreq = new Map<string, number>();
  for (const token of fieldTokens) {
    fieldFreq.set(token, (fieldFreq.get(token) || 0) + 1);
  }

  const fieldLen = fieldTokens.length;
  let score = 0;

  for (const qt of queryTokens) {
    const freq = fieldFreq.get(qt) || 0;
    if (freq > 0) {
      const tf = freq / fieldLen;
      const idf = 1 + Math.log(1 + 1 / queryTokens.length);
      score += tf * idf;
    }
  }

  const matched = queryTokens.filter((qt) => fieldFreq.has(qt)).length;
  const coverage = matched / queryTokens.length;
  return score * (0.4 + 0.6 * coverage);
}

// ---------------------------------------------------------------------------
// Reciprocal Rank Fusion (RRF)
// ---------------------------------------------------------------------------

function reciprocalRankFusion(
  vectorResults: Array<{ id: string; score: number }>,
  keywordResults: Array<{ id: string; score: number }>,
  k: number = 60
): Array<{ id: string; rrf_score: number; methods: string[] }> {
  const rrfScores = new Map<
    string,
    { rrf_score: number; methods: Set<string> }
  >();

  // Add vector search results
  for (let rank = 0; rank < vectorResults.length; rank++) {
    const item = vectorResults[rank];
    const existing = rrfScores.get(item.id);
    const rrfContribution = 1 / (k + rank + 1);
    if (existing) {
      existing.rrf_score += rrfContribution;
      existing.methods.add("vector");
    } else {
      rrfScores.set(item.id, {
        rrf_score: rrfContribution,
        methods: new Set(["vector"]),
      });
    }
  }

  // Add keyword search results
  for (let rank = 0; rank < keywordResults.length; rank++) {
    const item = keywordResults[rank];
    const existing = rrfScores.get(item.id);
    const rrfContribution = 1 / (k + rank + 1);
    if (existing) {
      existing.rrf_score += rrfContribution;
      existing.methods.add("keyword");
    } else {
      rrfScores.set(item.id, {
        rrf_score: rrfContribution,
        methods: new Set(["keyword"]),
      });
    }
  }

  // Convert to array and sort by RRF score
  return Array.from(rrfScores.entries())
    .map(([id, data]) => ({
      id,
      rrf_score: data.rrf_score,
      methods: Array.from(data.methods),
    }))
    .sort((a, b) => b.rrf_score - a.rrf_score);
}

// ---------------------------------------------------------------------------
// Main search handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const pool = getPool();

  try {
    const body = await request.json();
    const { query, agent_id, top_k = 10 } = body as {
      query: string;
      agent_id?: string;
      top_k?: number;
    };

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Query is required" },
        { status: 400 }
      );
    }

    const kLimit = Math.min(Math.max(Number(top_k) || 10, 1), 50);

    // Run vector search and keyword search in parallel
    const [vectorResults, keywordResults] = await Promise.all([
      runVectorSearch(pool, query, kLimit * 2),
      runKeywordSearch(pool, query, agent_id, kLimit * 2),
    ]);

    // Merge using Reciprocal Rank Fusion
    const merged = reciprocalRankFusion(vectorResults, keywordResults);

    // Fetch full skill details for the top results
    const topIds = merged.slice(0, kLimit).map((r) => r.id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let skills: any[] = [];
    if (topIds.length > 0) {
      const skillsResult = await pool.query(
        `SELECT id, name, display_name, description, category, difficulty,
                tags, performance_score, total_uses, has_embedding
         FROM skills
         WHERE id = ANY($1)
         ORDER BY array_position($1, id)`,
        [topIds]
      );
      skills = skillsResult.rows;
    }

    // Attach RRF scores and match methods
    const results = skills.map((skill) => {
      const rrfData = merged.find((r) => r.id === skill.id);
      return {
        ...skill,
        performance_score: Number(skill.performance_score) || 0,
        total_uses: Number(skill.total_uses) || 0,
        rrf_score: rrfData?.rrf_score || 0,
        match_methods: rrfData?.methods || ["keyword"],
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        query,
        results,
        vector_count: vectorResults.length,
        keyword_count: keywordResults.length,
        merged_count: merged.length,
      },
    });
  } catch (error) {
    console.error("[SkillSearch] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to search skills",
      },
      { status: 500 }
    );
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// Vector search (pgvector cosine similarity)
// ---------------------------------------------------------------------------

async function runVectorSearch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pool: any,
  query: string,
  limit: number
): Promise<Array<{ id: string; score: number }>> {
  try {
    const embedding = await generateEmbedding(query);
    const vectorStr = embeddingToPgVector(embedding);

    const result = await pool.query(
      `SELECT id, embedding <=> $1::vector AS distance
       FROM skills
       WHERE is_active = true AND has_embedding = true
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [vectorStr, limit]
    );

    // Convert distance to similarity score (1 - distance for cosine)
    return result.rows.map((r: { id: string; distance: string }) => ({
      id: r.id,
      score: 1 - Number(r.distance),
    }));
  } catch (error) {
    console.warn("[SkillSearch] Vector search failed, returning empty:", error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Keyword search (TF-IDF scoring)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runKeywordSearch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pool: any,
  query: string,
  _agentId?: string,
  limit?: number
): Promise<Array<{ id: string; score: number }>> {
  try {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const result = await pool.query(
      `SELECT id, display_name, description, category, tags,
              prompt_template, agent_bindings, performance_score
       FROM skills
       WHERE is_active = true`
    );
    const skills = result.rows;

    const scored: Array<{ id: string; score: number }> = [];

    for (const skill of skills) {
      const perfScore = Number(skill.performance_score) || 0;
      const tags = Array.isArray(skill.tags) ? skill.tags.join(" ") : "";

      const nameTokens = tokenize(skill.display_name || "");
      const descTokens = tokenize(skill.description || "");
      const tagTokens = tokenize(tags);
      const categoryTokens = tokenize(skill.category || "");
      const promptTokens = tokenize((skill.prompt_template || "").slice(0, 500));

      const nameScore = computeTfIdfScore(queryTokens, nameTokens) * 3.0;
      const descScore = computeTfIdfScore(queryTokens, descTokens) * 2.0;
      const tagScore = computeTfIdfScore(queryTokens, tagTokens) * 1.5;
      const categoryScore = computeTfIdfScore(queryTokens, categoryTokens) * 1.0;
      const promptScore = computeTfIdfScore(queryTokens, promptTokens) * 0.5;

      let rawScore =
        nameScore + descScore + tagScore + categoryScore + promptScore;

      // Performance weighting
      const performanceMultiplier = perfScore / 100 + 0.2;
      rawScore *= performanceMultiplier;

      if (rawScore > 0) {
        scored.push({ id: skill.id, score: rawScore });
      }
    }

    // Sort by score and return top results
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit || 20);
  } catch (error) {
    console.warn("[SkillSearch] Keyword search failed:", error);
    return [];
  }
}
