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
// Usage: import { getPool, query, withPool } from "@/lib/db"
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-require-imports */
const { Pool } = require("pg");

let _pool: ReturnType<typeof Pool> | null = null;
let _poolError: string | null = null;

/**
 * Get or create the shared connection pool singleton.
 * Uses SUPABASE_DB_URL environment variable with pgbouncer for connection pooling.
 */
export function getPool(): ReturnType<typeof Pool> {
  if (_poolError) {
    throw new Error(_poolError);
  }

  if (_pool) return _pool;

  let connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    _poolError = "SUPABASE_DB_URL environment variable is not configured";
    throw new Error(_poolError);
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
  connectionString = url.toString();

  _pool = new Pool({
    connectionString,
    // Connection pool settings tuned for Supabase + Vercel serverless
    max: 5,                     // Keep low — Supavisor multiplexes to backend
    min: 0,                     // No idle connections in serverless
    idleTimeoutMillis: 10000,   // Release idle connections after 10s (was 15s)
    connectionTimeoutMillis: 8000, // Fail fast (was 10s)
    // Allow prepared statements to be reused across connections
    allowExitOnIdle: true,      // Let process exit if pool is idle
    // Statement timeout to prevent runaway queries from holding connections
    statement_timeout: 30000,   // 30s max per query
  });

  // Log pool errors (don't crash the process)
  _pool.on("error", (err: Error) => {
    console.error("[DB] Pool error:", err.message);
  });

  // Log pool stats periodically for monitoring
  if (process.env.NODE_ENV === "development") {
    setInterval(() => {
      const stats = {
        total: _pool!.totalCount,
        idle: _pool!.idleCount,
        waiting: _pool!.waitingCount,
      };
      if (stats.waiting > 0) {
        console.warn("[DB] Pool congestion:", stats);
      }
    }, 30000);
  }

  return _pool;
}

/**
 * Execute a single SQL query against the shared pool.
 * Shorthand for getPool().query(sql, params).
 */
export async function query(sql: string, params?: unknown[]) {
  const pool = getPool();
  return pool.query(sql, params);
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
