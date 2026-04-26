// ---------------------------------------------------------------------------
// Phase 7C: Shared Database Connection Pool
// ---------------------------------------------------------------------------
// Single singleton pool for all database operations. Uses Supabase's
// connection pooler (Supavisor) for efficient connection management.
//
// IMPORTANT: Uses transaction-mode pooling via ?pgbouncer=true to avoid
// EMAXCONNSESSION errors. Each query gets its own backend connection
// from Supavisor's pool, then returns it immediately after the transaction.
//
// Features:
// - Auto-recovery: if the pool hits EMAXCONNSESSION, it's recreated
// - Retry logic: transient connection errors get up to 2 retries
// - Connection-aware: logs congestion warnings
//
// Usage: import { getPool, query, withPool } from "@/lib/db"
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-require-imports */
const { Pool } = require("pg");

let _pool: ReturnType<typeof Pool> | null = null;
let _creatingPool = false;

/**
 * Build the connection string with pgbouncer params.
 */
function buildConnectionString(): string {
  let connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    throw new Error("SUPABASE_DB_URL environment variable is not configured");
  }

  // Force transaction-mode pooling via pgbouncer to avoid EMAXCONNSESSION errors.
  // Supabase's Supavisor limits sessions to pool_size (15 on free tier).
  // With pgbouncer=true, connections are multiplexed efficiently.
  const url = new URL(connectionString);
  if (!url.searchParams.has("pgbouncer")) {
    url.searchParams.set("pgbouncer", "true");
  }
  // Disable prepared statements when using pgbouncer (required for transaction mode)
  if (!url.searchParams.has("prepare")) {
    url.searchParams.set("prepare", "false");
  }
  return url.toString();
}

/**
 * Create a new pool instance. Does NOT cache — caller must assign to _pool.
 */
function createPool(): ReturnType<typeof Pool> {
  const connectionString = buildConnectionString();

  const pool = new Pool({
    connectionString,
    // Connection pool settings tuned for Supabase + Vercel serverless
    max: 3,                      // Keep very low — Supavisor multiplexes to backend
    min: 0,                      // No idle connections in serverless
    idleTimeoutMillis: 5000,     // Release idle connections fast (5s)
    connectionTimeoutMillis: 5000, // Fail fast (5s)
    allowExitOnIdle: true,       // Let process exit if pool is idle
    statement_timeout: 30000,    // 30s max per query
  });

  // On pool-level error (e.g. backend crash), mark pool for recreation
  pool.on("error", (err: Error) => {
    console.error("[DB] Pool error:", err.message);
    // If it's a session limit error, destroy and recreate the pool
    if (err.message.includes("EMAXCONNSESSION") || err.message.includes("max clients")) {
      console.warn("[DB] Session limit hit — destroying pool for recreation");
      _pool = null;
    }
  });

  return pool;
}

/**
 * Get or create the shared connection pool singleton.
 * If the pool was destroyed due to EMAXCONNSESSION, a fresh one is created.
 */
export function getPool(): ReturnType<typeof Pool> {
  // Pool exists and is healthy — return it
  if (_pool) return _pool;

  // Prevent concurrent pool creation
  if (_creatingPool) {
    throw new Error("Database pool is being recreated — please retry in a moment");
  }

  _creatingPool = true;
  try {
    _pool = createPool();
    return _pool;
  } finally {
    _creatingPool = false;
  }
}

/**
 * Destroy the current pool and create a fresh one.
 * Used for recovery after EMAXCONNSESSION errors.
 */
export async function resetPool(): Promise<void> {
  if (_pool) {
    try {
      await _pool.end();
    } catch {
      // Ignore errors during shutdown
    }
    _pool = null;
  }
  // Create fresh pool on next getPool() call
  getPool();
}

/**
 * Check if an error is a transient connection/session error that can be
 * retried by creating a new pool.
 */
function isSessionError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message;
    return (
      msg.includes("EMAXCONNSESSION") ||
      msg.includes("max clients") ||
      msg.includes("connection") ||
      msg.includes("terminating connection") ||
      msg.includes("too many connections") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("ECONNRESET") ||
      msg.includes("socket hang up")
    );
  }
  return false;
}

/**
 * Execute a single SQL query against the shared pool.
 * Includes retry logic for transient connection errors.
 */
export async function query(sql: string, params?: unknown[]) {
  const maxRetries = 2;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const pool = getPool();
      return await pool.query(sql, params);
    } catch (error) {
      lastError = error;

      // If it's a session/connection error, reset the pool and retry
      if (isSessionError(error) && attempt < maxRetries) {
        console.warn(`[DB] Session error on attempt ${attempt + 1}, resetting pool...`);
        try {
          await resetPool();
          // Brief delay before retry
          await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
        } catch (resetErr) {
          console.error("[DB] Pool reset failed:", resetErr);
        }
        continue;
      }

      // Non-retriable error or max retries exceeded
      throw error;
    }
  }

  throw lastError;
}

/**
 * Run a function with the shared pool. Useful for transaction patterns.
 * The pool is NOT ended after the callback — it persists.
 */
export async function withPool<T>(
  fn: (pool: ReturnType<typeof Pool>) => Promise<T>,
): Promise<T> {
  const pool = getPool();
  return fn(pool);
}

/**
 * Check if the database connection is healthy.
 * Returns true if a simple query succeeds.
 */
export async function isDatabaseReady(): Promise<boolean> {
  try {
    const pool = getPool();
    const result = await pool.query("SELECT 1 as ok");
    return result.rows.length > 0 && result.rows[0].ok === 1;
  } catch {
    return false;
  }
}

/**
 * Get pool statistics for monitoring.
 */
export function getPoolStats() {
  try {
    const pool = getPool();
    return {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    };
  } catch {
    return { total: 0, idle: 0, waiting: 0, error: "Pool not initialized" };
  }
}
