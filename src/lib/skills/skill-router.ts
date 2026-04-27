// ---------------------------------------------------------------------------
// Phase 6B: Skill Router Engine
// ---------------------------------------------------------------------------
// Matches user queries to the best-fit skill using TF-IDF-like scoring,
// category boosting, semantic relevance, agent affinity, and performance
// weighting.
//
// Phase 7A: Hybrid Vector Search
// Extended to optionally include pgvector cosine similarity search when
// sufficient skills have embeddings (>=50%). Results are merged using
// Reciprocal Rank Fusion (RRF).
//
// Phase 7C: Refactored to use shared connection pool + structured logger.
// ---------------------------------------------------------------------------

import { getPool } from "@/lib/core/db";
import { logger } from "@/lib/core/logger";

// ---------------------------------------------------------------------------
// In-memory TTL cache for skills list (avoids DB query on every chat message)
// ---------------------------------------------------------------------------
interface SkillsCache {
  data: SkillRow[];
  expiresAt: number;
}
let skillsCache: SkillsCache | null = null;
const SKILLS_CACHE_TTL = 60_000; // 1 minute

// In-memory TTL cache for embedding coverage
interface EmbeddingCoverageCache {
  value: number;
  expiresAt: number;
}
let embeddingCoverageCache: EmbeddingCoverageCache | null = null;
const EMBEDDING_COVERAGE_TTL = 120_000; // 2 minutes

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillMatch {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  category: string;
  difficulty: string;
  score: number;
  match_reason: string;
}

export interface RouteResult {
  skill: SkillMatch | null;
  method: string;
  confidence: number;
  alternatives: SkillMatch[];
}

interface SkillRow {
  id: string;
  name: string;
  display_name: string;
  description: string;
  category: string;
  difficulty: string;
  tags: string[];
  agent_bindings: string[];
  performance_score: string | number;
  prompt_template: string;
  total_uses: string | number;
}

// ---------------------------------------------------------------------------
// Tokenizer — simple stop-word removal + lowercasing
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
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

// ---------------------------------------------------------------------------
// TF-IDF-like scoring
// ---------------------------------------------------------------------------

function computeTfIdfScore(queryTokens: string[], fieldTokens: string[]): number {
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
      // TF: term frequency in field, normalized
      const tf = freq / fieldLen;
      // IDF approximation: rarer query terms get higher weight
      const idf = 1 + Math.log(1 + (1 / (queryTokens.length)));
      score += tf * idf;
    }
  }

  // Normalize by number of query terms matched
  const matched = queryTokens.filter((qt) => fieldFreq.has(qt)).length;
  const coverage = matched / queryTokens.length;
  return score * (0.4 + 0.6 * coverage);
}

// ---------------------------------------------------------------------------
// Category boosting
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  research: ["research", "investigate", "analyze", "study", "explore", "deep dive", "find", "lookup", "look up", "discover"],
  code: ["code", "program", "debug", "deploy", "build", "develop", "implement", "refactor", "review", "pr", "pull request", "commit", "branch"],
  communication: ["email", "mail", "send", "compose", "write", "draft", "message", "reply", "schedule", "meeting", "calendar", "invite"],
  data: ["data", "spreadsheet", "chart", "graph", "calculate", "statistics", "analyze data", "pivot", "clean", "transform"],
  planning: ["plan", "strategy", "roadmap", "goal", "project", "task", "milestone", "timeline", "budget", "quarter"],
  ops: ["health", "monitor", "status", "deploy", "server", "incident", "uptime", "error", "log", "performance", "metrics"],
  content: ["content", "blog", "article", "post", "social", "copy", "creative", "design", "brand", "campaign", "story"],
};

function getCategoryBoost(queryLower: string, skillCategory: string): number {
  const keywords = CATEGORY_KEYWORDS[skillCategory];
  if (!keywords) return 0;

  let matchCount = 0;
  for (const kw of keywords) {
    if (queryLower.includes(kw)) {
      matchCount++;
    }
  }

  // Small boost proportional to keyword matches (max 0.15)
  return Math.min(matchCount * 0.05, 0.15);
}

// ---------------------------------------------------------------------------
// Phase 7A: Vector search helpers
// ---------------------------------------------------------------------------

// In-memory cache for query embeddings within a single request
const queryEmbeddingCache = new Map<string, number[]>();

async function checkEmbeddingCoverage(pool: ReturnType<typeof getPool>): Promise<number> {
  try {
    const result = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE is_active = true) AS total,
        COUNT(*) FILTER (WHERE is_active = true AND has_embedding = true) AS with_embedding
       FROM skills`
    );
    const row = result.rows[0];
    const total = Number(row.total) || 0;
    const withEmbedding = Number(row.with_embedding) || 0;
    return total > 0 ? withEmbedding / total : 0;
  } catch (err) {
    logger.warn("skill-router", "Failed to check embedding coverage", {
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

async function runVectorSearch(
  pool: ReturnType<typeof getPool>,
  query: string,
  limit: number
): Promise<Array<{ id: string; score: number }>> {
  try {
    const { generateEmbedding, embeddingToPgVector } = await import("@/lib/memory/embeddings");

    // Check cache first
    let embedding = queryEmbeddingCache.get(query);
    if (!embedding) {
      embedding = await generateEmbedding(query);
      queryEmbeddingCache.set(query, embedding);
    }

    const vectorStr = embeddingToPgVector(embedding);

    const result = await pool.query(
      `SELECT id, embedding <=> $1::vector AS distance
       FROM skills
       WHERE is_active = true AND has_embedding = true
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [vectorStr, limit]
    );

    // Convert cosine distance to similarity score
    return result.rows.map((r: { id: string; distance: string }) => ({
      id: r.id,
      score: 1 - Number(r.distance),
    }));
  } catch (err) {
    logger.warn("skill-router", "Vector search failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

// ---------------------------------------------------------------------------
// Reciprocal Rank Fusion
// ---------------------------------------------------------------------------

function reciprocalRankFusion(
  vectorResults: Array<{ id: string; score: number }>,
  keywordResults: Array<{ id: string; rawScore: number }>,
  k: number = 60
): Map<string, number> {
  const rrfScores = new Map<string, number>();

  // Keyword results (already sorted by rawScore)
  for (let rank = 0; rank < keywordResults.length; rank++) {
    const id = keywordResults[rank].id;
    const existing = rrfScores.get(id) || 0;
    rrfScores.set(id, existing + 1 / (k + rank + 1));
  }

  // Vector results (sorted by cosine similarity — higher = better)
  for (let rank = 0; rank < vectorResults.length; rank++) {
    const id = vectorResults[rank].id;
    const existing = rrfScores.get(id) || 0;
    rrfScores.set(id, existing + 1 / (k + rank + 1));
  }

  return rrfScores;
}

// ---------------------------------------------------------------------------
// Main routing function
// ---------------------------------------------------------------------------

export async function routeSkill(query: string, agentId?: string): Promise<RouteResult> {
  const pool = getPool();

  try {
    // 1. Fetch all active skills (with TTL cache)
    let skills: SkillRow[];
    const now = Date.now();
    if (skillsCache && skillsCache.expiresAt > now) {
      skills = skillsCache.data;
    } else {
      const result = await pool.query(
        `SELECT id, name, display_name, description, category, difficulty,
                tags, agent_bindings, performance_score, prompt_template, total_uses
         FROM skills
         WHERE is_active = true
         ORDER BY performance_score DESC`
      );
      skills = result.rows;
      skillsCache = { data: skills, expiresAt: now + SKILLS_CACHE_TTL };
    }

    if (skills.length === 0) {
      return { skill: null, method: "none", confidence: 0, alternatives: [] };
    }
    const queryLower = query.toLowerCase();
    const queryTokens = tokenize(query);

    // 2. Score each skill with TF-IDF
    const scored: Array<SkillMatch & { rawScore: number }> = [];

    for (const skill of skills) {
      const perfScore = Number(skill.performance_score) || 0;
      const tags = Array.isArray(skill.tags) ? skill.tags : [];
      const agentBindings = Array.isArray(skill.agent_bindings) ? skill.agent_bindings : [];

      // Build combined text corpus for this skill
      const nameTokens = tokenize(skill.display_name || skill.name);
      const descTokens = tokenize(skill.description || "");
      const tagTokens = tokenize(tags.join(" "));
      const categoryTokens = tokenize(skill.category || "");
      const promptTokens = tokenize((skill.prompt_template || "").slice(0, 500));

      // Weighted scoring across fields
      const nameScore = computeTfIdfScore(queryTokens, nameTokens) * 3.0; // Name is most important
      const descScore = computeTfIdfScore(queryTokens, descTokens) * 2.0;
      const tagScore = computeTfIdfScore(queryTokens, tagTokens) * 1.5;
      const categoryScore = computeTfIdfScore(queryTokens, categoryTokens) * 1.0;
      const promptScore = computeTfIdfScore(queryTokens, promptTokens) * 0.5;

      let rawScore = nameScore + descScore + tagScore + categoryScore + promptScore;

      // 3. Category boosting
      rawScore += getCategoryBoost(queryLower, skill.category);

      // 4. Agent affinity: boost skills bound to this agent
      if (agentId && agentBindings.length > 0) {
        if (agentBindings.includes(agentId)) {
          rawScore *= 1.2; // 20% boost for agent-bound skills
        }
      }

      // 5. Performance weighting: multiply by (performance_score/100 + 0.2)
      // This ensures proven skills rank higher, but even new skills get some weight
      const performanceMultiplier = (perfScore / 100) + 0.2;
      rawScore *= performanceMultiplier;

      // Determine match reason
      let matchReason = "";
      const matchedQueryTokens = queryTokens.filter(
        (qt) =>
          nameTokens.includes(qt) ||
          descTokens.includes(qt) ||
          tagTokens.includes(qt) ||
          categoryTokens.includes(qt)
      );

      if (matchedQueryTokens.length > 0) {
        matchReason = `Matched keywords: ${matchedQueryTokens.slice(0, 5).join(", ")}`;
      } else if (rawScore > 0.05) {
        matchReason = `Semantic relevance in ${skill.category} category`;
      } else {
        matchReason = `Low relevance match`;
      }

      scored.push({
        id: skill.id,
        name: skill.name,
        display_name: skill.display_name || skill.name,
        description: skill.description,
        category: skill.category,
        difficulty: skill.difficulty,
        score: rawScore,
        match_reason: matchReason,
        rawScore,
      });
    }

    // 6. Rerank: sort by final composite score
    scored.sort((a, b) => b.rawScore - a.rawScore);

    // ---------------------------------------------------------------------------
    // Phase 7A: Hybrid Vector Search
    // ---------------------------------------------------------------------------

    // Check if enough skills have embeddings for vector search to be useful
    // Use cached coverage or fetch from DB
    let coverage: number;
    if (embeddingCoverageCache && embeddingCoverageCache.expiresAt > now) {
      coverage = embeddingCoverageCache.value;
    } else {
      coverage = await checkEmbeddingCoverage(pool);
      embeddingCoverageCache = { value: coverage, expiresAt: now + EMBEDDING_COVERAGE_TTL };
    }
    let vectorUsed = false;

    if (coverage >= 0.5 && queryTokens.length > 0) {
      try {
        const vectorResults = await runVectorSearch(pool, query, 20);

        if (vectorResults.length > 0) {
          vectorUsed = true;
          const rrfScores = reciprocalRankFusion(vectorResults, scored);

          // Merge RRF scores into the existing scored array
          for (const item of scored) {
            const rrfScore = rrfScores.get(item.id);
            if (rrfScore !== undefined) {
              // Blend: 60% RRF score + 40% original TF-IDF score
              item.rawScore = (rrfScore * 3) + (item.rawScore * 0.4);
              // Update match_reason if vector was a contributor
              if (item.match_reason.startsWith("Matched keywords") || item.match_reason.startsWith("Semantic")) {
                item.match_reason += ` + vector similarity`;
              }
            }
          }

          // Re-sort after merging
          scored.sort((a, b) => b.rawScore - a.rawScore);
        }
      } catch (err) {
        logger.warn("skill-router", "Vector search skipped due to error", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Clear the query embedding cache (request-scoped, not persistent)
    queryEmbeddingCache.delete(query);

    // 7. Determine routing method
    const top = scored[0];
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const alternatives = scored.slice(1, 6).map(({ rawScore: _unused, ...rest }) => rest);

    if (!top || top.rawScore < 0.05) {
      return { skill: null, method: "none", confidence: 0, alternatives: [] };
    }

    // Determine confidence and method
    let method = "keyword";
    if (vectorUsed) {
      method = "hybrid_vector";
    }
    const confidence = Math.min(top.rawScore / 1.5, 1.0); // Normalize: score of 1.5 = 100% confidence

    if (!vectorUsed) {
      if (confidence > 0.7) {
        method = "semantic";
      } else if (confidence > 0.4) {
        method = "hybrid";
      }
    }

    // 8. Confidence threshold: only return match if confidence > 0.3
    if (confidence < 0.3) {
      return { skill: null, method: "low_confidence", confidence, alternatives: [] };
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { rawScore: _unused2, ...topMatch } = top;

    return {
      skill: topMatch,
      method,
      confidence,
      alternatives,
    };
  } catch (err) {
    logger.error("skill-router", "Error routing skill", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { skill: null, method: "error", confidence: 0, alternatives: [] };
  }
  // NOTE: No pool.end() — shared pool persists
}
