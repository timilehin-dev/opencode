// ---------------------------------------------------------------------------
// Phase 7B: Workflow Database Setup Route
// ---------------------------------------------------------------------------
// Idempotent route that creates the workflow tables in Supabase/PostgreSQL.
// POST to create tables, GET to check status.
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-require-imports */
const { Pool } = require("pg");

function getPool() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) throw new Error("SUPABASE_DB_URL not configured");
  return new Pool({ connectionString, max: 3, idleTimeoutMillis: 10000 });
}

export async function POST() {
  try {
    const pool = getPool();

    await pool.query(`
      CREATE TABLE IF NOT EXISTS agent_workflows (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        agent_id VARCHAR(100) NOT NULL,
        query TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'planning',
        strategy JSONB DEFAULT '{}',
        total_steps INTEGER DEFAULT 0,
        completed_steps INTEGER DEFAULT 0,
        failed_steps INTEGER DEFAULT 0,
        quality_score NUMERIC(5,2),
        error_message TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS workflow_steps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workflow_id UUID NOT NULL REFERENCES agent_workflows(id) ON DELETE CASCADE,
        step_number INTEGER NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        skill_id VARCHAR(100),
        skill_name VARCHAR(100),
        status VARCHAR(50) DEFAULT 'pending',
        input_context TEXT,
        output_result TEXT,
        output_summary TEXT,
        validation_score NUMERIC(5,2),
        validation_feedback TEXT,
        error_message TEXT,
        attempts INTEGER DEFAULT 0,
        max_attempts INTEGER DEFAULT 2,
        duration_ms INTEGER,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(workflow_id, step_number)
      );

      CREATE TABLE IF NOT EXISTS workflow_executions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workflow_id UUID NOT NULL REFERENCES agent_workflows(id) ON DELETE CASCADE,
        step_id UUID REFERENCES workflow_steps(id) ON DELETE SET NULL,
        phase VARCHAR(50) NOT NULL,
        agent_id VARCHAR(100),
        action TEXT NOT NULL,
        input_data TEXT,
        output_data TEXT,
        duration_ms INTEGER,
        error TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_workflows_agent ON agent_workflows(agent_id);
      CREATE INDEX IF NOT EXISTS idx_workflows_status ON agent_workflows(status);
      CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow ON workflow_steps(workflow_id);
      CREATE INDEX IF NOT EXISTS idx_workflow_steps_status ON workflow_steps(status);
      CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow ON workflow_executions(workflow_id);
    `);

    await pool.end();

    return Response.json({
      success: true,
      message: "Workflow tables created/verified successfully",
      tables: ["agent_workflows", "workflow_steps", "workflow_executions"],
    });
  } catch (error) {
    console.error("[WorkflowSetup] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json(
      { success: false, error: message },
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

export async function GET() {
  try {
    const pool = getPool();

    const tablesResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('agent_workflows', 'workflow_steps', 'workflow_executions')
      ORDER BY table_name
    `);

    const existingTables = tablesResult.rows.map((r: { table_name: string }) => r.table_name);

    let rowCount = 0;
    if (existingTables.includes("agent_workflows")) {
      const countResult = await pool.query(`SELECT COUNT(*)::int as count FROM agent_workflows`);
      rowCount = Number(countResult.rows[0]?.count || 0);
    }

    await pool.end();

    return Response.json({
      success: true,
      tables_exist: {
        agent_workflows: existingTables.includes("agent_workflows"),
        workflow_steps: existingTables.includes("workflow_steps"),
        workflow_executions: existingTables.includes("workflow_executions"),
      },
      all_tables_ready: existingTables.length === 3,
      workflow_count: rowCount,
    });
  } catch (error) {
    console.error("[WorkflowSetup] Status check error:", error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
