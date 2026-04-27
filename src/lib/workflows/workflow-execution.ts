// ---------------------------------------------------------------------------
// Workflow Execution — executeWorkflow() and runSingleStep()
// ---------------------------------------------------------------------------

import { getPool } from "@/lib/core/db";
import { logger } from "@/lib/core/logger";
import {
  callLLM,
  logExecution,
  recalcWorkflowState,
  EXECUTOR_SYSTEM_PROMPT,
} from "./workflow-types";
import type { WorkflowStepRow, WorkflowRow } from "./workflow-types";
import { validateStepInternal } from "./workflow-validation";

// ---------------------------------------------------------------------------
// executeWorkflow — Execute all pending steps sequentially
// ---------------------------------------------------------------------------

export async function executeWorkflow(
  workflowId: string,
  agentId: string,
  autoValidate = true,
): Promise<{ status: string; results: WorkflowStepRow[] }> {
  const pool = getPool();

  try {
    // Fetch workflow
    const wfResult = await pool.query(`SELECT * FROM agent_workflows WHERE id = $1`, [workflowId]);
    if (wfResult.rows.length === 0) throw new Error("Workflow not found");
    const workflow = wfResult.rows[0] as WorkflowRow;

    if (workflow.status === "completed") {
      throw new Error("Workflow already completed");
    }
    if (workflow.status === "cancelled") {
      throw new Error("Workflow is cancelled");
    }

    // Determine the minimum step to fetch based on resumable_from_step
    const resumableFromStep = (workflow as unknown as Record<string, unknown>).resumable_from_step as number | null | undefined;

    // Fetch pending steps — only those >= resumable_from_step if set
    let stepsQuery = `SELECT * FROM workflow_steps
       WHERE workflow_id = $1
         AND (status = 'pending' OR status = 'running')`;
    const queryParams: unknown[] = [workflowId];

    if (resumableFromStep !== null && resumableFromStep !== undefined) {
      stepsQuery += ` AND step_number >= $2`;
      queryParams.push(resumableFromStep);
    }

    stepsQuery += ` ORDER BY step_number ASC`;

    const stepsResult = await pool.query(stepsQuery, queryParams);

    const steps = stepsResult.rows as WorkflowStepRow[];
    if (steps.length === 0) {
      // Check if there are failed steps that could be retried
      const failedSteps = await pool.query(
        `SELECT * FROM workflow_steps
         WHERE workflow_id = $1 AND status = 'failed'
         ORDER BY step_number ASC`,
        [workflowId],
      );
      if (failedSteps.rows.length === 0) {
        throw new Error("No pending steps to execute");
      }
      // Don't recurse — return current status instead of risking stack overflow
      console.warn(`[Workflow] No pending steps found, ${failedSteps.rows.length} failed step(s) remain. Status: ${workflow.status}`);
      return { status: workflow.status, results: [] };
    }

    // Get all completed steps for context passing
    const completedResult = await pool.query(
      `SELECT step_number, output_result, output_summary
       FROM workflow_steps
       WHERE workflow_id = $1 AND status = 'completed'
       ORDER BY step_number ASC`,
      [workflowId],
    );
    const completedSteps = completedResult.rows;

    // Build context from completed steps (mutable — accumulated in-memory per step)
    let previousContext = completedSteps
      .map((s: { step_number: number; output_summary: string | null; output_result: string | null }) =>
        `--- Step ${s.step_number} Output ---\n${s.output_summary || (s.output_result || "").slice(0, 500)}`
      )
      .join("\n\n");

    const allResults: WorkflowStepRow[] = [];

    // Execute each step
    for (const step of steps) {
      // Re-set as running if it was stuck
      await pool.query(
        `UPDATE workflow_steps SET status = 'running', started_at = NOW(), attempts = attempts + 1
         WHERE id = $1`,
        [step.id],
      );

      const startTime = Date.now();

      try {
        // Get the skill prompt if a skill is assigned
        let skillPrompt = "";
        if (step.skill_name && step.skill_name !== "none") {
          const skillResult = await pool.query(
            `SELECT prompt_template FROM skills WHERE (name = $1 OR display_name = $1) AND is_active = true LIMIT 1`,
            [step.skill_name],
          );
          if (skillResult.rows.length > 0 && skillResult.rows[0].prompt_template) {
            skillPrompt = `# Skill: ${step.skill_name}\n\n${skillResult.rows[0].prompt_template}\n\n`;
          }
        }

        // Build executor prompt — includes original query to ground the agent
        const executorPrompt = `${skillPrompt}## ORIGINAL USER REQUEST
${workflow.query || step.description}

## YOUR TASK (Step ${step.step_number}: ${step.title})
${step.description}

## Context from previous steps
${previousContext || "(This is the first step — no prior context)"}

## CRITICAL EXECUTION INSTRUCTIONS
You are EXECUTING this step, not planning it. You must produce the FINAL, ACTUAL deliverable.

FORBIDDEN:
- Templates, frameworks, outlines with placeholders like "[insert here]", "TODO", "fill in"
- Methodology descriptions ("first do X, then do Y, then do Z")
- Meta-commentary ("I would recommend...", "You should consider...")
- Placeholder sections, skeleton content, or abbreviated examples

REQUIRED:
- Complete, finished content that can be used as-is by the next step
- Specific data, actual numbers, real content — never generic placeholders
- If writing content: write every paragraph fully
- If analyzing: provide the actual analysis results, not the analysis method
- If creating: produce the final creation, not a plan for creating

Produce the complete output now.`;

        const outputResult = await callLLM(executorPrompt, 0.2, EXECUTOR_SYSTEM_PROMPT);
        const durationMs = Date.now() - startTime;

        // Generate a brief summary
        const summaryPrompt = `Summarize the following output in 1-2 concise sentences (max 200 chars):\n\n${outputResult}`;
        const outputSummary = await callLLM(summaryPrompt, 0.2)
          .then((s) => s.trim().slice(0, 200))
          .catch(() => outputResult.slice(0, 200));

        // Update step record
        await pool.query(
          `UPDATE workflow_steps
           SET status = 'completed',
               output_result = $1,
               output_summary = $2,
               duration_ms = $3,
               completed_at = NOW()
           WHERE id = $4`,
          [outputResult, outputSummary, durationMs, step.id],
        );

        // Accumulate this step's output in-memory for the next step's context
        previousContext = previousContext
          ? `${previousContext}\n\n--- Step ${step.step_number} Output ---\n${outputSummary}`
          : `--- Step ${step.step_number} Output ---\n${outputSummary}`;

        await logExecution(pool, {
          workflowId,
          stepId: step.id,
          phase: "execute",
          agentId,
          action: `Executed step ${step.step_number}: ${step.title}`,
          outputData: outputSummary,
          durationMs,
        });

        logger.info("workflow-engine", `Step ${step.step_number} completed: ${step.title}`, {
          workflowId,
          stepId: step.id,
          durationMs,
        });

        // Auto-validate if enabled
        if (autoValidate) {
          try {
            const validation = await validateStepInternal(pool, step.id, outputResult, step.description);
            if (validation.overall < 50 && step.attempts < step.max_attempts) {
              // Validation failed — mark for retry
              await pool.query(
                `UPDATE workflow_steps SET status = 'failed', error_message = $1 WHERE id = $2`,
                [`Validation score too low: ${validation.overall}/100. ${validation.feedback}`, step.id],
              );
              await logExecution(pool, {
                workflowId,
                stepId: step.id,
                phase: "validate",
                agentId,
                action: `Validation failed for step ${step.step_number} (score: ${validation.overall})`,
                error: validation.feedback,
              });
              logger.warn("workflow-engine", `Step ${step.step_number} validation failed`, {
                workflowId,
                stepId: step.id,
                score: validation.overall,
                feedback: validation.feedback,
              });
            } else {
              // Validation passed
              await pool.query(
                `UPDATE workflow_steps SET validation_score = $1, validation_feedback = $2 WHERE id = $3`,
                [validation.overall, validation.feedback, step.id],
              );
              // Track validation score for constructing result without re-fetch
              Object.assign(step, {
                validation_score: String(validation.overall),
                validation_feedback: validation.feedback,
              });
            }
          } catch (validationError) {
            // Validation failure is non-fatal
            logger.warn("workflow-engine", `Validation error for step ${step.step_number}`, {
              workflowId,
              error: validationError instanceof Error ? validationError.message : String(validationError),
            });
          }
        }

        // Construct result from known data — avoids redundant SELECT
        allResults.push({
          ...step,
          status: 'completed',
          output_result: outputResult,
          output_summary: outputSummary,
          duration_ms: durationMs,
          completed_at: new Date().toISOString(),
          attempts: step.attempts + 1,
        } as WorkflowStepRow);
      } catch (stepError) {
        const durationMs = Date.now() - startTime;
        const errorMsg = stepError instanceof Error ? stepError.message : "Unknown step error";

        await pool.query(
          `UPDATE workflow_steps
           SET status = 'failed',
               error_message = $1,
               duration_ms = $2,
               completed_at = NOW()
           WHERE id = $3`,
          [errorMsg, durationMs, step.id],
        );

        await logExecution(pool, {
          workflowId,
          stepId: step.id,
          phase: "execute",
          agentId,
          action: `Step ${step.step_number} failed: ${step.title}`,
          error: errorMsg,
          durationMs,
        });

        logger.error("workflow-engine", `Step ${step.step_number} failed: ${step.title}`, {
          workflowId,
          stepId: step.id,
          error: errorMsg,
          durationMs,
        });

        // Check if we should retry (attempts was incremented when set to running)
        const currentAttempts = step.attempts + 1;
        if (currentAttempts < step.max_attempts) {
          // Reset to pending for retry
          await pool.query(
            `UPDATE workflow_steps SET status = 'pending', started_at = NULL, error_message = NULL WHERE id = $1`,
            [step.id],
          );
        }

        // Construct result from known data — avoids redundant SELECT
        allResults.push({
          ...step,
          status: currentAttempts < step.max_attempts ? 'pending' : 'failed',
          error_message: errorMsg,
          duration_ms: durationMs,
          completed_at: currentAttempts >= step.max_attempts ? new Date().toISOString() : null,
          attempts: currentAttempts,
          started_at: currentAttempts < step.max_attempts ? null : step.started_at,
          error: currentAttempts < step.max_attempts ? null : errorMsg,
        } as WorkflowStepRow);

        // FIX: Break on non-retriable step failure. Workflow steps are sequential
        // and depend on previous steps' output. Continuing after a permanently
        // failed step means subsequent steps receive no input context from the
        // failed step, producing garbage results.
        if (currentAttempts >= step.max_attempts) {
          logger.warn("workflow-engine", `Step ${step.step_number} permanently failed — stopping workflow execution`, {
            workflowId,
            stepId: step.id,
            error: errorMsg,
          });
          break;
        }
      }
    }

    // Recalculate workflow state
    await recalcWorkflowState(pool, workflowId);

    // Fetch final workflow status
    const finalResult = await pool.query(`SELECT status FROM agent_workflows WHERE id = $1`, [workflowId]);
    const finalStatus = finalResult.rows[0].status;

    return { status: finalStatus, results: allResults };
  } catch (err) {
    logger.error("workflow-engine", "Workflow execution failed", {
      workflowId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
  // NOTE: No pool.end() — shared pool persists
}

// ---------------------------------------------------------------------------
// runSingleStep — Execute just one step
// ---------------------------------------------------------------------------

export async function runSingleStep(
  workflowId: string,
  stepNumber: number,
  agentId: string,
): Promise<WorkflowStepRow> {
  const pool = getPool();

  try {
    // Fetch the step
    const stepResult = await pool.query(
      `SELECT * FROM workflow_steps WHERE workflow_id = $1 AND step_number = $2`,
      [workflowId, stepNumber],
    );

    if (stepResult.rows.length === 0) throw new Error("Step not found");
    const step = stepResult.rows[0] as WorkflowStepRow;

    if (step.status === "completed") throw new Error("Step already completed");
    if (step.status === "cancelled") throw new Error("Workflow is cancelled");

    // Get workflow
    const wfResult = await pool.query(`SELECT status, query FROM agent_workflows WHERE id = $1`, [workflowId]);
    if (wfResult.rows.length === 0) throw new Error("Workflow not found");
    if (wfResult.rows[0].status === "cancelled") throw new Error("Workflow is cancelled");
    const workflowQuery = wfResult.rows[0].query || step.description;

    // Set status to running
    await pool.query(
      `UPDATE workflow_steps SET status = 'running', started_at = NOW(), attempts = attempts + 1
       WHERE id = $1`,
      [step.id],
    );

    // Update workflow status
    await pool.query(
      `UPDATE agent_workflows SET status = 'running', updated_at = NOW() WHERE id = $1`,
      [workflowId],
    );

    const startTime = Date.now();

    try {
      // Get previous context
      const completedResult = await pool.query(
        `SELECT step_number, output_result, output_summary
         FROM workflow_steps
         WHERE workflow_id = $1 AND status = 'completed' AND step_number < $2
         ORDER BY step_number ASC`,
        [workflowId, stepNumber],
      );

      const previousContext = completedResult.rows
        .map((s: { step_number: number; output_summary: string | null; output_result: string | null }) =>
          `--- Step ${s.step_number} Output ---\n${s.output_summary || (s.output_result || "").slice(0, 500)}`
        )
        .join("\n\n");

      // Get skill prompt
      let skillPrompt = "";
      if (step.skill_name && step.skill_name !== "none") {
        const skillResult = await pool.query(
          `SELECT prompt_template FROM skills WHERE (name = $1 OR display_name = $1) AND is_active = true LIMIT 1`,
          [step.skill_name],
        );
        if (skillResult.rows.length > 0 && skillResult.rows[0].prompt_template) {
          skillPrompt = `# Skill: ${step.skill_name}\n\n${skillResult.rows[0].prompt_template}\n\n`;
        }
      }

      const executorPrompt = `${skillPrompt}## ORIGINAL USER REQUEST
${workflowQuery}

## YOUR TASK (Step ${step.step_number}: ${step.title})
${step.description}

## Context from previous steps
${previousContext || "(This is the first step — no prior context)"}

## CRITICAL EXECUTION INSTRUCTIONS
You are EXECUTING this step, not planning it. You must produce the FINAL, ACTUAL deliverable.

FORBIDDEN:
- Templates, frameworks, outlines with placeholders like "[insert here]", "TODO", "fill in"
- Methodology descriptions ("first do X, then do Y, then do Z")
- Meta-commentary ("I would recommend...", "You should consider...")
- Placeholder sections, skeleton content, or abbreviated examples

REQUIRED:
- Complete, finished content that can be used as-is by the next step
- Specific data, actual numbers, real content — never generic placeholders
- If writing content: write every paragraph fully
- If analyzing: provide the actual analysis results, not the analysis method
- If creating: produce the final creation, not a plan for creating

Produce the complete output now.`;

      const outputResult = await callLLM(executorPrompt, 0.2, EXECUTOR_SYSTEM_PROMPT);
      const durationMs = Date.now() - startTime;

      const summaryPrompt = `Summarize in 1-2 sentences (max 200 chars):\n\n${outputResult}`;
      const outputSummary = await callLLM(summaryPrompt, 0.2)
        .then((s) => s.trim().slice(0, 200))
        .catch(() => outputResult.slice(0, 200));

      await pool.query(
        `UPDATE workflow_steps
         SET status = 'completed',
             output_result = $1,
             output_summary = $2,
             duration_ms = $3,
             completed_at = NOW()
         WHERE id = $4`,
        [outputResult, outputSummary, durationMs, step.id],
      );

      await logExecution(pool, {
        workflowId,
        stepId: step.id,
        phase: "execute",
        agentId,
        action: `Executed step ${stepNumber}: ${step.title}`,
        outputData: outputSummary,
        durationMs,
      });

      logger.info("workflow-engine", `Single step ${stepNumber} completed: ${step.title}`, {
        workflowId,
        durationMs,
      });

      // Recalculate workflow state
      await recalcWorkflowState(pool, workflowId);

      // Construct result from known data — avoids redundant SELECT
      return {
        ...step,
        status: 'completed',
        output_result: outputResult,
        output_summary: outputSummary,
        duration_ms: durationMs,
        completed_at: new Date().toISOString(),
        attempts: step.attempts + 1,
      } as WorkflowStepRow;
    } catch (stepError) {
      const durationMs = Date.now() - startTime;
      const errorMsg = stepError instanceof Error ? stepError.message : "Unknown error";

      await pool.query(
        `UPDATE workflow_steps
         SET status = 'failed', error_message = $1, duration_ms = $2, completed_at = NOW()
         WHERE id = $3`,
        [errorMsg, durationMs, step.id],
      );

      await recalcWorkflowState(pool, workflowId);

      logger.error("workflow-engine", `Single step ${stepNumber} failed`, {
        workflowId,
        error: errorMsg,
        durationMs,
      });

      // Construct result from known data — avoids redundant SELECT
      return {
        ...step,
        status: 'failed',
        error_message: errorMsg,
        duration_ms: durationMs,
        completed_at: new Date().toISOString(),
        attempts: step.attempts + 1,
      } as WorkflowStepRow;
    }
  } catch (err) {
    logger.error("workflow-engine", "Single step execution error", {
      workflowId,
      stepNumber,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
  // NOTE: No pool.end() — shared pool persists
}
