// ---------------------------------------------------------------------------
// Workflow Status — Read-only status queries
// ---------------------------------------------------------------------------

import { getPool } from "@/lib/core/db";
import type { WorkflowRow, WorkflowWithSteps, WorkflowStepRow } from "./workflow-types";

// ---------------------------------------------------------------------------
// getWorkflowStatus — Get full workflow with steps
// ---------------------------------------------------------------------------

export async function getWorkflowStatus(workflowId: string): Promise<WorkflowWithSteps> {
  const pool = getPool();

  try {
    const wfResult = await pool.query(`SELECT * FROM agent_workflows WHERE id = $1`, [workflowId]);
    if (wfResult.rows.length === 0) throw new Error("Workflow not found");

    const workflow = wfResult.rows[0] as WorkflowRow;

    const stepsResult = await pool.query(
      `SELECT * FROM workflow_steps WHERE workflow_id = $1 ORDER BY step_number ASC`,
      [workflowId],
    );

    const steps = stepsResult.rows.map((s: WorkflowStepRow) => ({
      ...s,
      validation_score: s.validation_score ? Number(s.validation_score) : null,
    }));

    return {
      ...workflow,
      quality_score: workflow.quality_score ? Number(workflow.quality_score) : null,
      total_steps: Number(workflow.total_steps),
      completed_steps: Number(workflow.completed_steps),
      failed_steps: Number(workflow.failed_steps),
      steps,
    };
  } finally {
    // NOTE: No pool.end() — shared pool persists
  }
}

// ---------------------------------------------------------------------------
// listWorkflows — List workflows with optional filters
// ---------------------------------------------------------------------------

export async function listWorkflows(
  agentId?: string,
  status?: string,
  limit = 20,
): Promise<Array<WorkflowRow>> {
  const pool = getPool();

  try {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (agentId) {
      conditions.push(`agent_id = $${paramIndex++}`);
      params.push(agentId);
    }
    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await pool.query(
      `SELECT * FROM agent_workflows ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex}`,
      [...params, limit],
    );

    return result.rows.map((r: WorkflowRow) => ({
      ...r,
      total_steps: Number(r.total_steps),
      completed_steps: Number(r.completed_steps),
      failed_steps: Number(r.failed_steps),
      quality_score: r.quality_score ? Number(r.quality_score) : null,
    }));
  } finally {
    // NOTE: No pool.end() — shared pool persists
  }
}
