// ---------------------------------------------------------------------------
// Workflow Types — All interfaces, types, and shared utilities
// ---------------------------------------------------------------------------

import { getPool } from "@/lib/core/db";
import { logger } from "@/lib/core/logger";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface WorkflowPlan {
  strategy_summary: string;
  steps: Array<{
    title: string;
    description: string;
    skill_name?: string;
    input_context: string;
  }>;
}

export interface WorkflowStepRow {
  id: string;
  workflow_id: string;
  step_number: number;
  title: string;
  description: string;
  skill_id: string | null;
  skill_name: string | null;
  status: string;
  input_context: string | null;
  output_result: string | null;
  output_summary: string | null;
  validation_score: number | null;
  validation_feedback: string | null;
  error_message: string | null;
  attempts: number;
  max_attempts: number;
  duration_ms: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface WorkflowRow {
  id: string;
  name: string;
  description: string | null;
  agent_id: string;
  query: string;
  status: string;
  strategy: Record<string, unknown> | null;
  total_steps: number;
  completed_steps: number;
  failed_steps: number;
  quality_score: number | null;
  error_message: string | null;
  schedule_interval: number | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface WorkflowWithSteps extends Omit<WorkflowRow, "quality_score" | "total_steps" | "completed_steps" | "failed_steps" | "schedule_interval"> {
  quality_score: number | null;
  total_steps: number;
  completed_steps: number;
  failed_steps: number;
  schedule_interval: number | null;
  steps: Array<Omit<WorkflowStepRow, "validation_score"> & { validation_score: number | null }>;
}

export interface ValidationResult {
  completeness: number;
  accuracy: number;
  relevance: number;
  clarity: number;
  concreteness?: number;
  overall: number;
  feedback: string;
}

// ---------------------------------------------------------------------------
// LLM Helper — Gemma 4 via Ollama Cloud
// ---------------------------------------------------------------------------

// System prompt for workflow step execution — prevents the "Template Trap"
// where agents describe HOW to do work instead of actually doing it.
export const EXECUTOR_SYSTEM_PROMPT = `You are a production executor in a multi-step workflow. Your ONLY job is to PRODUCE ACTUAL OUTPUT, not describe how to produce it.

ABSOLUTE RULES:
1. NEVER provide templates, frameworks, outlines, or methodologies unless the step EXPLICITLY asks for one.
2. NEVER say "Here is a template you could use" or "Consider the following approach."
3. ALWAYS produce the final, actual, deliverable content that the step requires.
4. If the step says "Write a report about X", WRITE THE ACTUAL REPORT — every section, every paragraph, every word. Not a report outline.
5. If the step says "Analyze data about X", provide the actual analysis with real findings, numbers, and conclusions — not "here are the steps to analyze."
6. If the step says "Create a strategy for X", provide the actual strategy document with specific tactics, timelines, and KPIs — not a "strategy framework."
7. OUTPUT QUALITY CHECK: Before responding, ask yourself "Could someone use this output directly without further work?" If NO, rewrite it until YES.
8. DEFAULT TO OVERPRODUCTION. It is better to produce 2000 words of actual content than 500 words that say "fill in the details here."`;



export async function callLLM(prompt: string, temperature = 0.3, systemPrompt?: string): Promise<string> {
  const { generateText } = await import("ai");
  const { createOpenAI } = await import("@ai-sdk/openai");

  const provider = createOpenAI({
    apiKey: process.env.OLLAMA_CLOUD_KEY_1 || "ollama",
    baseURL: process.env.OLLAMA_BASE_URL || "https://ollama.com/v1",
  });
  const model = provider.chat("gemma4:31b-cloud");

  const result = await generateText({
    model,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    prompt,
    maxOutputTokens: 262144,
    temperature,
    abortSignal: AbortSignal.timeout(60000),
  });

  return result.text;
}

// ---------------------------------------------------------------------------
// Log execution events
// ---------------------------------------------------------------------------

export async function logExecution(
  pool: ReturnType<typeof getPool>,
  params: {
    workflowId: string;
    stepId?: string;
    phase: string;
    agentId?: string;
    action: string;
    inputData?: string;
    outputData?: string;
    durationMs?: number;
    error?: string;
  },
) {
  try {
    await pool.query(
      `INSERT INTO workflow_executions (workflow_id, step_id, phase, agent_id, action, input_data, output_data, duration_ms, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        params.workflowId,
        params.stepId || null,
        params.phase,
        params.agentId || null,
        params.action,
        params.inputData || null,
        params.outputData || null,
        params.durationMs || null,
        params.error || null,
      ],
    );
  } catch (err) {
    // Execution logging is non-critical
    logger.warn("workflow-engine", "Failed to log execution event", {
      workflowId: params.workflowId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Internal: Recalculate workflow state from step statuses
// ---------------------------------------------------------------------------
// Phase 7C Fix: When all steps are complete but some failed, the workflow
// should be marked "completed_with_errors" rather than always "completed".
// ---------------------------------------------------------------------------

export async function recalcWorkflowState(pool: ReturnType<typeof getPool>, workflowId: string) {
  // Count step statuses
  const countsResult = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'completed') AS completed,
       COUNT(*) FILTER (WHERE status = 'failed') AS failed,
       COUNT(*) FILTER (WHERE status = 'skipped') AS skipped,
       COUNT(*) AS total
     FROM workflow_steps
     WHERE workflow_id = $1`,
    [workflowId],
  );

  const counts = countsResult.rows[0];
  const completed = Number(counts.completed || 0);
  const failed = Number(counts.failed || 0);
  const skipped = Number(counts.skipped || 0);
  const total = Number(counts.total || 0);

  // Calculate average validation score
  const scoreResult = await pool.query(
    `SELECT AVG(validation_score)::numeric(5,2) as avg_score
     FROM workflow_steps
     WHERE workflow_id = $1 AND validation_score IS NOT NULL`,
    [workflowId],
  );
  const avgScore = scoreResult.rows[0]?.avg_score ? Number(scoreResult.rows[0].avg_score) : null;

  // Determine workflow status
  let newStatus: string;
  if ((completed + skipped === total) && total > 0) {
    // All steps are done (completed or skipped) — treat as completed
    newStatus = failed > 0 ? "completed_with_errors" : "completed";
  } else if (completed === total && total > 0) {
    // Phase 7C Fix: Distinguish between clean completion and completion with failures
    newStatus = failed > 0 ? "completed_with_errors" : "completed";
  } else if (failed > total * 0.3) {
    newStatus = "failed";
  } else {
    newStatus = "running";
  }

  // Calculate quality score if all steps completed
  const qualityScore = completed === total ? avgScore : null;

  if (completed === total) {
    await pool.query(
      `UPDATE agent_workflows
       SET status = $1,
           completed_steps = $2,
           failed_steps = $3,
           quality_score = $4,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $5`,
      [newStatus, completed, failed, qualityScore, workflowId],
    );
  } else {
    await pool.query(
      `UPDATE agent_workflows
       SET status = $1,
           completed_steps = $2,
           failed_steps = $3,
           quality_score = $4,
           completed_at = NULL,
           updated_at = NOW()
       WHERE id = $5`,
      [newStatus, completed, failed, qualityScore, workflowId],
    );
  }
}
