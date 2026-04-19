// ---------------------------------------------------------------------------
// Claw — Phase 3: Delegation Logger
// Uses raw pg Pool (same pattern as activity.ts)
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

export interface Delegation {
  id: number;
  initiator_agent: string;
  assigned_agent: string;
  task: string;
  context: string;
  status: string;
  result: string;
  delegation_chain: string[];
  duration_ms: number | null;
  created_at: string;
  completed_at: string | null;
}

// ---------------------------------------------------------------------------
// logDelegation — Log a new delegation
// ---------------------------------------------------------------------------

export async function logDelegation(params: {
  initiator_agent: string;
  assigned_agent: string;
  task: string;
  context?: string;
  delegation_chain?: string[];
}): Promise<number> {
  if (!process.env.SUPABASE_DB_URL) return -1;

  const pool = getPool();
  try {
    const chain = params.delegation_chain || [params.initiator_agent, params.assigned_agent];
    const result = await pool.query(
      `INSERT INTO delegations (initiator_agent, assigned_agent, task, context, status, delegation_chain)
       VALUES ($1, $2, $3, $4, 'pending', $5)
       RETURNING id`,
      [
        params.initiator_agent,
        params.assigned_agent,
        params.task,
        params.context || "",
        JSON.stringify(chain),
      ],
    );
    return Number(result.rows[0]?.id || -1);
  } catch (err) {
    console.warn("[Delegations] Failed to log delegation:", err);
    return -1;
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// updateDelegation — Update delegation status
// ---------------------------------------------------------------------------

export async function updateDelegation(
  delegationId: number,
  params: {
    status: string;
    result?: string;
    duration_ms?: number;
  },
): Promise<void> {
  if (!process.env.SUPABASE_DB_URL) return;

  const pool = getPool();
  try {
    if (params.status === "completed" || params.status === "failed") {
      await pool.query(
        `UPDATE delegations
         SET status = $1, result = $2, duration_ms = $3, completed_at = NOW()
         WHERE id = $4`,
        [
          params.status,
          params.result ? params.result.slice(0, 10000) : null,
          params.duration_ms || null,
          delegationId,
        ],
      );
    } else {
      await pool.query(
        `UPDATE delegations
         SET status = $1, result = $2, duration_ms = $3
         WHERE id = $4`,
        [
          params.status,
          params.result ? params.result.slice(0, 10000) : null,
          params.duration_ms || null,
          delegationId,
        ],
      );
    }
  } catch (err) {
    console.warn("[Delegations] Failed to update delegation:", err);
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// getRecentDelegations — Get recent delegations for coordination map
// ---------------------------------------------------------------------------

export async function getRecentDelegations(limit = 20): Promise<Delegation[]> {
  if (!process.env.SUPABASE_DB_URL) return [];

  const pool = getPool();
  try {
    const result = await pool.query(
      `SELECT * FROM delegations
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    );
    return result.rows.map(rowToDelegation) as Delegation[];
  } catch (err) {
    console.warn("[Delegations] Failed to fetch recent delegations:", err);
    return [];
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// Row Converter
// ---------------------------------------------------------------------------

function rowToDelegation(row: Record<string, unknown>): Delegation {
  return {
    id: Number(row.id),
    initiator_agent: row.initiator_agent as string,
    assigned_agent: row.assigned_agent as string,
    task: row.task as string,
    context: row.context as string,
    status: row.status as string,
    result: row.result as string,
    delegation_chain: typeof row.delegation_chain === "string"
      ? JSON.parse(row.delegation_chain)
      : (row.delegation_chain as string[] || []),
    duration_ms: row.duration_ms ? Number(row.duration_ms) : null,
    created_at: row.created_at as string,
    completed_at: row.completed_at as string | null,
  };
}
