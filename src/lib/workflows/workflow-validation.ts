// ---------------------------------------------------------------------------
// Workflow Validation — validateStep()
// ---------------------------------------------------------------------------

import { getPool } from "@/lib/core/db";
import { logger } from "@/lib/core/logger";
import { callLLM, logExecution } from "./workflow-types";
import type { WorkflowStepRow, ValidationResult } from "./workflow-types";

// ---------------------------------------------------------------------------
// validateStepInternal — Core validation logic (used by execution + public API)
// ---------------------------------------------------------------------------

export async function validateStepInternal(
  pool: ReturnType<typeof getPool>,
  stepId: string,
  outputResult: string,
  stepDescription: string,
): Promise<ValidationResult> {
  const validatorPrompt = `You are a quality validator. Evaluate this step's output quality.

Step Description: ${stepDescription}

Output to evaluate:
${outputResult.slice(0, 3000)}

Score each dimension 0-100 and provide brief feedback:
- completeness: Did it cover everything required?
- accuracy: Is the information correct?
- relevance: Is it relevant to the step's purpose?
- clarity: Is it well-structured and clear?
- concreteness: Is this ACTUAL OUTPUT or just a template/outline/methodology?
  - 100 = Fully concrete, deliverable-ready output
  - 50 = Mix of concrete content and some template-like sections
  - 0 = Pure template, outline, framework, or methodology with no actual content

TEMPLATE DETECTION RULES — Score concreteness 0-30 if the output contains ANY of:
- Placeholders like "[insert here]", "[your content]", "TODO", "fill in"
- Template language: "Here is a template...", "Framework for...", "Outline:"
- More than 2 levels of heading hierarchy with no body content underneath
- Generic advice without specific data, examples, or concrete recommendations
- Empty sections or sections with only 1-2 sentences describing what should go there

If concreteness < 40, the output MUST be rejected regardless of other scores. Set overall = concreteness.

Respond ONLY in JSON (no markdown, no code blocks):
{"completeness": 85, "accuracy": 90, "relevance": 95, "clarity": 80, "concreteness": 90, "overall": 87, "feedback": "Brief feedback"}`;

  const validationText = await callLLM(validatorPrompt, 0.2);

  try {
    const cleaned = validationText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned) as ValidationResult;
    return parsed;
  } catch {
    return {
      completeness: 70,
      accuracy: 70,
      relevance: 70,
      clarity: 70,
      overall: 70,
      feedback: "Validation parsing failed — assigned default score",
    };
  }
}

// ---------------------------------------------------------------------------
// validateStep — Public API: Evaluate a step's output quality
// ---------------------------------------------------------------------------

export async function validateStep(
  stepId: string,
  outputResult: string,
  stepDescription: string,
): Promise<{ score: number; feedback: string }> {
  const pool = getPool();

  try {
    // Fetch the step
    const stepResult = await pool.query(`SELECT * FROM workflow_steps WHERE id = $1`, [stepId]);
    if (stepResult.rows.length === 0) throw new Error("Step not found");
    const step = stepResult.rows[0] as WorkflowStepRow;

    const result = outputResult || step.output_result || "";
    const description = stepDescription || step.description || "";

    if (!result) throw new Error("No output to validate");

    const validation = await validateStepInternal(pool, stepId, result, description);

    // Update the step
    await pool.query(
      `UPDATE workflow_steps
       SET validation_score = $1, validation_feedback = $2
       WHERE id = $3`,
      [validation.overall, validation.feedback, stepId],
    );

    await logExecution(pool, {
      workflowId: step.workflow_id,
      stepId,
      phase: "validate",
      action: `Validated step ${step.step_number}: score ${validation.overall}/100`,
      outputData: JSON.stringify(validation),
    });

    return { score: validation.overall, feedback: validation.feedback };
  } finally {
    // NOTE: No pool.end() — shared pool persists
  }
}
