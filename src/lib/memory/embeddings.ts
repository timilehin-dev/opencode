// ---------------------------------------------------------------------------
// Phase 7A: Embedding Generation Module
// ---------------------------------------------------------------------------
// Generates vector embeddings for skill text using Ollama's nomic-embed-text
// model (768-dim) with a hash-based fallback if the API is unavailable.
//
// Phase 7C: Refactored to use structured logger.
// ---------------------------------------------------------------------------

import { logger } from "@/lib/core/logger";

const EMBEDDING_DIM = 768;
const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || "https://ollama.com/v1";
const OLLAMA_KEY = process.env.OLLAMA_CLOUD_KEY_1 || "ollama";

// ---------------------------------------------------------------------------
// Hash-based pseudo-embedding fallback (bag-of-words → float array)
// ---------------------------------------------------------------------------

function generateHashEmbedding(text: string, dim: number): number[] {
  const vec = new Array(dim).fill(0);
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);

  for (const token of tokens) {
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      hash = ((hash << 5) - hash) + token.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % dim;
    vec[idx] += 1 / Math.sqrt(tokens.length);
  }

  // L2 normalize
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

// ---------------------------------------------------------------------------
// Main embedding generation — Ollama API with fallback
// ---------------------------------------------------------------------------

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await fetch(`${OLLAMA_BASE}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OLLAMA_KEY}`,
      },
      body: JSON.stringify({
        model: "nomic-embed-text",
        input: text,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      logger.warn(
        "embeddings", `Ollama API returned ${response.status}, falling back to hash embedding`
      );
      return generateHashEmbedding(text, EMBEDDING_DIM);
    }

    const data = await response.json();
    // OpenAI-compatible format: { data: [{ embedding: number[] }] }
    const embedding = data.data?.[0]?.embedding;
    if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
      logger.warn("embeddings", "Invalid embedding response, falling back to hash");
      return generateHashEmbedding(text, EMBEDDING_DIM);
    }

    // Defensive: If the API returns a different dimension than expected, truncate or pad
    if (embedding.length !== EMBEDDING_DIM) {
      logger.warn("embeddings", `Dimension mismatch: API returned ${embedding.length} dims, expected ${EMBEDDING_DIM}. Truncating/padding to match.`);
      if (embedding.length > EMBEDDING_DIM) {
        embedding.length = EMBEDDING_DIM;
      } else {
        while (embedding.length < EMBEDDING_DIM) embedding.push(0);
      }
    }

    return embedding;
  } catch (error) {
    logger.warn("embeddings", "Ollama API error, falling back to hash", {
      error: error instanceof Error ? error.message : String(error),
    });
    return generateHashEmbedding(text, EMBEDDING_DIM);
  }
}

// ---------------------------------------------------------------------------
// Batch embedding generation (sequential to avoid rate limits)
// ---------------------------------------------------------------------------

export async function batchGenerateEmbeddings(
  texts: string[]
): Promise<number[][]> {
  const results: number[][] = [];
  for (const text of texts) {
    const embedding = await generateEmbedding(text);
    results.push(embedding);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Utility: convert embedding array to PostgreSQL vector literal string
// ---------------------------------------------------------------------------

export function embeddingToPgVector(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export { EMBEDDING_DIM };
