/**
 * Key Usage Manager — Smart API key rotation with token tracking
 *
 * Uses Supabase JS client (HTTP/REST) instead of raw pg — no TLS dependency,
 * fully compatible with Vercel serverless functions.
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
// Supabase client (HTTP/REST — no pg/tls needed)
// ---------------------------------------------------------------------------

async function getSupabase() {
  // Dynamic import to avoid circular dependency and client bundling
  const { getSupabase: getClient } = await import("./supabase");
  return getClient();
}

async function initTable() {
  try {
    const supabase = await getSupabase();
    if (!supabase) {
      console.warn("[KeyManager] Supabase not configured — key persistence disabled");
      return;
    }
    // Use the Supabase RPC to create table (since anon key can't run DDL directly)
    // We'll try an upsert to test — if the table doesn't exist we'll get a clear error
    // The table should be created via SQL Editor using KEY_USAGE_SCHEMA_SQL
    const { error } = await supabase
      .from("key_usage")
      .select("key_hash")
      .limit(1);
    if (error && error.message.includes("does not exist")) {
      console.warn("[KeyManager] 'key_usage' table not found. Please run the schema SQL in Supabase SQL Editor.");
    }
  } catch (err) {
    console.warn("[KeyManager] Failed to check table:", err);
  }
}

async function loadUsageFromDB(): Promise<void> {
  try {
    const supabase = await getSupabase();
    if (!supabase) return;

    const today = getTodayUTC();
    const { data, error } = await supabase
      .from("key_usage")
      .select("key_hash, tokens_used, requests_today, last_used_at, last_error, error_count")
      .eq("usage_date", today);

    if (error) {
      console.warn("[KeyManager] Failed to load usage:", error.message);
      return;
    }

    if (data) {
      for (const row of data) {
        usageCache.set(row.key_hash, {
          tokens_used: Number(row.tokens_used),
          requests_today: Number(row.requests_today),
          last_used_at: row.last_used_at || "",
          last_error: row.last_error,
          error_count: Number(row.error_count),
          cooldown_until: null,
        });
      }
    }
    cacheInitialized = true;
  } catch (err) {
    console.warn("[KeyManager] Failed to load usage from DB:", err);
  }
}

async function persistUsage(keyHash: string, provider: string, keyLabel: string, tokens: number): Promise<void> {
  try {
    const supabase = await getSupabase();
    if (!supabase) return;

    const today = getTodayUTC();
    const { error } = await supabase
      .from("key_usage")
      .upsert({
        key_hash: keyHash,
        provider,
        key_label: keyLabel,
        tokens_used: tokens,
        requests_today: 1,
        usage_date: today,
        last_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "key_hash",
        ignoreDuplicates: false,
      });

    if (error) {
      console.warn("[KeyManager] Failed to persist usage:", error.message);
    }
  } catch (err) {
    console.warn("[KeyManager] Failed to persist usage:", err);
  }
}

async function persistIncrementalUsage(keyHash: string, tokens: number): Promise<void> {
  try {
    const supabase = await getSupabase();
    if (!supabase) return;

    // FIX: Use raw SQL via Supabase RPC for atomic increment.
    // The previous read-modify-write pattern had a race condition:
    // two concurrent requests could both read the same value and
    // overwrite each other's increments, losing token counts.
    // Using SQL SET col = col + $1 is atomic and race-free.
    const { error } = await supabase.rpc("increment_key_usage", {
      p_key_hash: keyHash,
      p_tokens: tokens,
      p_requests: 1,
      p_today: getTodayUTC(),
    });

    // Fallback: if RPC doesn't exist yet, use the non-atomic approach
    if (error && (error.message?.includes("does not exist") || error.message?.includes("function"))) {
      const { data: existing } = await supabase
        .from("key_usage")
        .select("tokens_used, requests_today")
        .eq("key_hash", keyHash)
        .single();

      await supabase
        .from("key_usage")
        .update({
          tokens_used: (existing?.tokens_used || 0) + tokens,
          requests_today: (existing?.requests_today || 0) + 1,
          last_used_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_error: null,
          error_count: 0,
        })
        .eq("key_hash", keyHash);
    } else if (error) {
      console.warn("[KeyManager] Failed to persist incremental usage:", error.message);
    }
  } catch (err) {
    console.warn("[KeyManager] Failed to persist incremental usage:", err);
  }
}

async function persistError(keyHash: string, error: string): Promise<void> {
  try {
    const supabase = await getSupabase();
    if (!supabase) return;

    // Get current error_count first
    const { data: existing } = await supabase
      .from("key_usage")
      .select("error_count")
      .eq("key_hash", keyHash)
      .single();

    await supabase
      .from("key_usage")
      .update({
        last_error: error,
        error_count: (existing?.error_count || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("key_hash", keyHash);
  } catch (err) {
    console.warn("[KeyManager] Failed to persist error:", err);
  }
}

async function resetDailyCounters(): Promise<void> {
  try {
    const supabase = await getSupabase();
    if (!supabase) return;

    // FIX: Only reset counters for rows from PREVIOUS days.
    // The old code reset ALL rows regardless of date, which meant:
    // - If two serverless instances started on the same day, the second
    //   instance would reset the first instance's counters to 0.
    // - If no key was selected on a new day, old records with stale
    //   usage_date would linger forever.
    const today = getTodayUTC();
    await supabase
      .from("key_usage")
      .update({
        tokens_used: 0,
        requests_today: 0,
        error_count: 0,
        last_error: null,
        usage_date: today,
        updated_at: new Date().toISOString(),
      })
      .neq("usage_date", today);
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
  // Ensure cache is initialized (parallel init to reduce cold-start latency)
  if (!cacheInitialized) {
    await Promise.all([initTable(), loadUsageFromDB()]);
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
      rotationReason += `${label} (cooldown ${remaining}s) -> `;
      triedCount++;
      continue;
    }

    // Check error count
    if (cached && cached.error_count >= MAX_CONSECUTIVE_ERRORS) {
      rotationReason += `${label} (${cached.error_count} errors) -> `;
      triedCount++;
      continue;
    }

    // Check quota
    if (cached) {
      const usagePercent = cached.tokens_used / dailyLimit;
      if (usagePercent >= QUOTA_WARNING_THRESHOLD) {
        rotationReason += `${label} (${Math.round(usagePercent * 100)}% used) -> `;
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
  persistIncrementalUsage(keyHash, totalTokens).catch(() => {});
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
    await Promise.all([initTable(), loadUsageFromDB()]);
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

// ---------------------------------------------------------------------------
// Key Usage Table Schema SQL (for Supabase SQL Editor)
// ---------------------------------------------------------------------------

export const KEY_USAGE_SCHEMA_SQL = `
-- Key Usage Tracking (for smart rotation)
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
CREATE INDEX IF NOT EXISTS idx_key_usage_date ON key_usage(usage_date);

-- Atomic increment function for key usage (race-condition safe)
-- Avoids the read-modify-write pattern that loses increments under
-- concurrent serverless function invocations.
CREATE OR REPLACE FUNCTION increment_key_usage(
  p_key_hash TEXT,
  p_tokens BIGINT DEFAULT 1,
  p_requests INT DEFAULT 1,
  p_today TEXT DEFAULT CURRENT_DATE
) RETURNS VOID AS $$
BEGIN
  INSERT INTO key_usage (key_hash, tokens_used, requests_today, usage_date, updated_at, last_used_at, last_error, error_count)
  VALUES (p_key_hash, p_tokens, p_requests, p_today, NOW(), NOW(), NULL, 0)
  ON CONFLICT (key_hash) DO UPDATE SET
    tokens_used = key_usage.tokens_used + p_tokens,
    requests_today = key_usage.requests_today + p_requests,
    usage_date = p_today,
    updated_at = NOW(),
    last_used_at = NOW(),
    last_error = NULL,
    error_count = 0;
END;
$$ LANGUAGE plpgsql;
`;
