/**
 * Key Usage Manager — Smart API key rotation with token tracking
 *
 * Features:
 * - Tracks input/output tokens per key across the daily quota period
 * - Auto-skips keys at 95% of daily quota (1M tokens default)
 * - Retries on 429 (rate-limit) errors with next available key
 * - Persists usage to Supabase `key_usage` table so it survives Vercel cold starts
 * - Auto-resets counters at the start of each new day (UTC)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KeyUsageRecord {
  key_hash: string;       // SHA-256 hash of the API key (never store raw keys)
  provider: string;       // "aihubmix" | "ollama"
  key_label: string;      // e.g. "AIHUBMIX_API_KEY_1"
  tokens_used: number;    // total tokens used today
  requests_today: number; // request count today
  last_used_at: string;   // ISO timestamp
  last_error: string | null;
  error_count: number;    // consecutive errors
  created_at: string;
  updated_at: string;
}

export interface KeyHealthStatus {
  key_label: string;
  provider: string;
  tokens_used: number;
  tokens_remaining: number;
  tokens_percent: number;
  requests_today: number;
  is_healthy: boolean;
  is_depleted: boolean;
  last_used_at: string | null;
  last_error: string | null;
  cooldown_until: string | null;
}

export interface KeySelectionResult {
  key: string;
  key_label: string;
  index: number;
  was_rotated: boolean;     // true if skipped one or more keys
  rotation_reason: string;  // why previous keys were skipped
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_DAILY_TOKEN_LIMIT = 1_000_000; // 1M tokens per key per day
const QUOTA_WARNING_THRESHOLD = 0.95;       // auto-skip at 95%
const MAX_CONSECUTIVE_ERRORS = 3;           // skip key after 3 consecutive errors
const ERROR_COOLDOWN_MS = 60_000;           // 1 min cooldown after error
const RATE_LIMIT_COOLDOWN_MS = 120_000;     // 2 min cooldown after 429

// ---------------------------------------------------------------------------
// In-memory cache (survives within a single serverless instance)
// ---------------------------------------------------------------------------

const usageCache = new Map<string, {
  tokens_used: number;
  requests_today: number;
  last_used_at: string;
  last_error: string | null;
  error_count: number;
  cooldown_until: number | null;
}>();

let cacheDate = getTodayUTC(); // auto-reset daily
let cacheInitialized = false;

function getTodayUTC(): string {
  return new Date().toISOString().split("T")[0]; // YYYY-MM-DD
}

// ---------------------------------------------------------------------------
// Simple hash (not crypto-grade, just for identifying keys without storing them)
// ---------------------------------------------------------------------------

async function hashKey(key: string): Promise<string> {
  const crypto = await import("crypto");
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 16);
}

// ---------------------------------------------------------------------------
// Supabase persistence
// ---------------------------------------------------------------------------

async function getPool() {
  const { Pool } = await import("pg");
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) throw new Error("SUPABASE_DB_URL not configured");
  return new Pool({ connectionString: dbUrl, max: 3, idleTimeoutMillis: 10000 });
}

async function initTable() {
  try {
    const pool = await getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS key_usage (
        key_hash TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        key_label TEXT NOT NULL,
        tokens_used BIGINT NOT NULL DEFAULT 0,
        requests_today BIGINT NOT NULL DEFAULT 0,
        usage_date TEXT NOT NULL DEFAULT CURRENT_DATE,
        last_used_at TIMESTAMPTZ,
        last_error TEXT,
        error_count INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_key_usage_provider ON key_usage(provider);
    `);
    await pool.end();
  } catch (err) {
    console.warn("[KeyManager] Failed to init table:", err);
  }
}

async function loadUsageFromDB(): Promise<void> {
  try {
    const pool = await getPool();
    const today = getTodayUTC();
    const result = await pool.query(
      `SELECT key_hash, tokens_used, requests_today, last_used_at, last_error, error_count
       FROM key_usage WHERE usage_date = $1`,
      [today],
    );
    await pool.end();

    for (const row of result.rows) {
      usageCache.set(row.key_hash, {
        tokens_used: Number(row.tokens_used),
        requests_today: Number(row.requests_today),
        last_used_at: row.last_used_at || "",
        last_error: row.last_error,
        error_count: Number(row.error_count),
        cooldown_until: null,
      });
    }
    cacheInitialized = true;
  } catch (err) {
    console.warn("[KeyManager] Failed to load usage from DB:", err);
  }
}

async function persistUsage(keyHash: string, provider: string, keyLabel: string, tokens: number): Promise<void> {
  try {
    const pool = await getPool();
    const today = getTodayUTC();
    await pool.query(`
      INSERT INTO key_usage (key_hash, provider, key_label, tokens_used, requests_today, usage_date, last_used_at, updated_at)
      VALUES ($1, $2, $3, $4, 1, $5, NOW(), NOW())
      ON CONFLICT (key_hash) DO UPDATE SET
        tokens_used = key_usage.tokens_used + $4,
        requests_today = key_usage.requests_today + 1,
        last_used_at = NOW(),
        updated_at = NOW()
    `, [keyHash, provider, keyLabel, tokens, today]);
    await pool.end();
  } catch (err) {
    console.warn("[KeyManager] Failed to persist usage:", err);
  }
}

async function persistError(keyHash: string, error: string): Promise<void> {
  try {
    const pool = await getPool();
    await pool.query(`
      UPDATE key_usage SET
        last_error = $1,
        error_count = error_count + 1,
        updated_at = NOW()
      WHERE key_hash = $2
    `, [error, keyHash]);
    await pool.end();
  } catch (err) {
    console.warn("[KeyManager] Failed to persist error:", err);
  }
}

async function resetDailyCounters(): Promise<void> {
  try {
    const pool = await getPool();
    const today = getTodayUTC();
    await pool.query(`
      UPDATE key_usage SET
        tokens_used = 0,
        requests_today = 0,
        error_count = 0,
        last_error = NULL,
        usage_date = $1,
        updated_at = NOW()
    `, [today]);
    await pool.end();
  } catch (err) {
    console.warn("[KeyManager] Failed to reset daily counters:", err);
  }
}

// ---------------------------------------------------------------------------
// Smart Key Selection
// ---------------------------------------------------------------------------

/**
 * Select the best available key from a pool, skipping depleted/error keys.
 * Returns { key, key_label, index, was_rotated, rotation_reason }.
 */
export async function selectBestKey(
  keys: string[],
  provider: string,
  labels: string[],
  dailyLimit: number = DEFAULT_DAILY_TOKEN_LIMIT,
): Promise<KeySelectionResult> {
  // Ensure cache is initialized
  if (!cacheInitialized) {
    await initTable();
    await loadUsageFromDB();
  }

  // Daily reset check
  const today = getTodayUTC();
  if (today !== cacheDate) {
    cacheDate = today;
    usageCache.clear();
    cacheInitialized = false;
    await resetDailyCounters();
    await loadUsageFromDB();
  }

  const now = Date.now();
  let rotationReason = "";
  let triedCount = 0;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const label = labels[i] || `${provider}_KEY_${i + 1}`;
    const keyHash = await hashKey(key);
    const cached = usageCache.get(keyHash);

    // Check cooldown
    if (cached?.cooldown_until && cached.cooldown_until > now) {
      const remaining = Math.ceil((cached.cooldown_until - now) / 1000);
      rotationReason += `${label} (cooldown ${remaining}s) → `;
      triedCount++;
      continue;
    }

    // Check error count
    if (cached && cached.error_count >= MAX_CONSECUTIVE_ERRORS) {
      rotationReason += `${label} (${cached.error_count} errors) → `;
      triedCount++;
      continue;
    }

    // Check quota
    if (cached) {
      const usagePercent = cached.tokens_used / dailyLimit;
      if (usagePercent >= QUOTA_WARNING_THRESHOLD) {
        rotationReason += `${label} (${Math.round(usagePercent * 100)}% used) → `;
        triedCount++;
        continue;
      }
    }

    // This key is good!
    return {
      key,
      key_label: label,
      index: i,
      was_rotated: triedCount > 0,
      rotation_reason: triedCount > 0 ? `Skipped ${triedCount} key(s): ${rotationReason.slice(0, -4)}` : "",
    };
  }

  // All keys exhausted — use the first one as fallback and log a warning
  console.error(`[KeyManager] ALL ${keys.length} ${provider} keys exhausted or in cooldown! Falling back to key #1.`);
  return {
    key: keys[0],
    key_label: labels[0] || `${provider}_KEY_1`,
    index: 0,
    was_rotated: keys.length > 1,
    rotation_reason: `All keys exhausted, using fallback`,
  };
}

// ---------------------------------------------------------------------------
// Record token usage after a successful request
// ---------------------------------------------------------------------------

export async function recordTokenUsage(
  key: string,
  provider: string,
  keyLabel: string,
  promptTokens: number,
  completionTokens: number,
): Promise<void> {
  const totalTokens = promptTokens + completionTokens;
  const keyHash = await hashKey(key);
  const cached = usageCache.get(keyHash);

  usageCache.set(keyHash, {
    tokens_used: (cached?.tokens_used || 0) + totalTokens,
    requests_today: (cached?.requests_today || 0) + 1,
    last_used_at: new Date().toISOString(),
    last_error: null,
    error_count: 0,
    cooldown_until: null,
  });

  // Persist async (fire-and-forget)
  persistUsage(keyHash, provider, keyLabel, totalTokens).catch(() => {});
}

// ---------------------------------------------------------------------------
// Record an error (429, 500, etc.) for a key
// ---------------------------------------------------------------------------

export async function recordKeyError(
  key: string,
  error: string,
  isRateLimit: boolean = false,
): Promise<void> {
  const keyHash = await hashKey(key);
  const cached = usageCache.get(keyHash);
  const cooldownMs = isRateLimit ? RATE_LIMIT_COOLDOWN_MS : ERROR_COOLDOWN_MS;

  usageCache.set(keyHash, {
    tokens_used: cached?.tokens_used || 0,
    requests_today: cached?.requests_today || 0,
    last_used_at: cached?.last_used_at || new Date().toISOString(),
    last_error: error,
    error_count: (cached?.error_count || 0) + 1,
    cooldown_until: Date.now() + cooldownMs,
  });

  console.warn(`[KeyManager] Key error (${isRateLimit ? "429" : "error"}): ${error.slice(0, 100)}. Cooldown for ${cooldownMs / 1000}s.`);

  // Persist async
  persistError(keyHash, error).catch(() => {});
}

// ---------------------------------------------------------------------------
// Get health status for all keys (for monitoring endpoint)
// ---------------------------------------------------------------------------

export async function getAllKeyHealth(
  keys: string[],
  provider: string,
  labels: string[],
  dailyLimit: number = DEFAULT_DAILY_TOKEN_LIMIT,
): Promise<KeyHealthStatus[]> {
  if (!cacheInitialized) {
    await initTable();
    await loadUsageFromDB();
  }

  const statuses: KeyHealthStatus[] = [];

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const label = labels[i] || `${provider}_KEY_${i + 1}`;
    const keyHash = await hashKey(key);
    const cached = usageCache.get(keyHash);
    const now = Date.now();

    const tokensUsed = cached?.tokens_used || 0;
    const tokensRemaining = Math.max(0, dailyLimit - tokensUsed);
    const percent = tokensUsed / dailyLimit;
    const isDepleted = percent >= QUOTA_WARNING_THRESHOLD;
    const isHealthy = !isDepleted && !(cached?.cooldown_until && cached.cooldown_until > now) && (cached?.error_count || 0) < MAX_CONSECUTIVE_ERRORS;

    statuses.push({
      key_label: label,
      provider,
      tokens_used: tokensUsed,
      tokens_remaining: tokensRemaining,
      tokens_percent: Math.round(percent * 100),
      requests_today: cached?.requests_today || 0,
      is_healthy: isHealthy,
      is_depleted: isDepleted,
      last_used_at: cached?.last_used_at || null,
      last_error: cached?.last_error || null,
      cooldown_until: cached?.cooldown_until ? new Date(cached.cooldown_until).toISOString() : null,
    });
  }

  return statuses;
}

// ---------------------------------------------------------------------------
// Get aggregate stats for dashboard
// ---------------------------------------------------------------------------

export function getQuickStats() {
  return {
    total_keys_tracked: usageCache.size,
    cache_date: cacheDate,
    initialized: cacheInitialized,
  };
}
