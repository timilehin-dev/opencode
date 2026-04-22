// ---------------------------------------------------------------------------
// Phase 7C: Shared Database Connection Pool
// ---------------------------------------------------------------------------
// Single singleton pool for all database operations. Replaces the per-request
// `new Pool()` pattern that was causing connection leaks and wasted resources.
//
// Usage: import { getPool, query, withPool } from "@/lib/db"
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-require-imports */
const { Pool } = require("pg");

let _pool: ReturnType<typeof Pool> | null = null;
let _poolError: string | null = null;

/**
 * Get or create the shared connection pool singleton.
 * Uses SUPABASE_DB_URL environment variable.
 */
export function getPool(): ReturnType<typeof Pool> {
  if (_poolError) {
    throw new Error(_poolError);
  }

  if (_pool) return _pool;

  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    _poolError = "SUPABASE_DB_URL environment variable is not configured";
    throw new Error(_poolError);
  }

  _pool = new Pool({
    connectionString,
    // Connection pool settings tuned for serverless (Vercel)
    max: 10,                   // Max concurrent connections
    min: 0,                    // No idle connections in serverless
    idleTimeoutMillis: 15000,  // Close idle connections after 15s
    connectionTimeoutMillis: 10000, // Fail fast on connection (10s)
    // Allow prepared statements to be reused across connections
    allowExitOnIdle: true,     // Let process exit if pool is idle
  });

  // Log pool errors (don't crash the process)
  _pool.on("error", (err: Error) => {
    console.error("[DB] Pool error:", err.message);
  });

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
