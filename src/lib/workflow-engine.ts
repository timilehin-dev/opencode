// ---------------------------------------------------------------------------
// Phase 7B: Multi-Step Workflow Engine
// ---------------------------------------------------------------------------
// Planner → Executor → Validator pattern for multi-step agent workflows.
// Uses Gemma 4 (Ollama Cloud) for planning, execution, and validation.
// All state is persisted in PostgreSQL.
//
// Phase 7C: Refactored to use shared connection pool, structured logger,
// and fixed recalcWorkflowState bug (dead code when failed > 0).
// ---------------------------------------------------------------------------

import { getPool } from "@/lib/db";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
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

interface WorkflowStepRow {
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
  validation_score: string | null;
  validation_feedback: string | null;
  error_message: string | null;
  attempts: number;
  max_attempts: number;
  duration_ms: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface WorkflowRow {
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
  quality_score: string | null;
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

// ---------------------------------------------------------------------------
// LLM Helper — Gemma 4 via Ollama Cloud
// ---------------------------------------------------------------------------

// System prompt for workflow step execution — prevents the "Template Trap"
// where agents describe HOW to do work instead of actually doing it.
const EXECUTOR_SYSTEM_PROMPT = `You are a production executor in a multi-step workflow. Your ONLY job is to PRODUCE ACTUAL OUTPUT, not describe how to produce it.

ABSOLUTE RULES:
1. NEVER provide templates, frameworks, outlines, or methodologies unless the step EXPLICITLY asks for one.
2. NEVER say "Here is a template you could use" or "Consider the following approach."
3. ALWAYS produce the final, actual, deliverable content that the step requires.
4. If the step says "Write a report about X", WRITE THE ACTUAL REPORT — every section, every paragraph, every word. Not a report outline.
5. If the step says "Analyze data about X", provide the actual analysis with real findings, numbers, and conclusions — not "here are the steps to analyze."
6. If the step says "Create a strategy for X", provide the actual strategy document with specific tactics, timelines, and KPIs — not a "strategy framework."
7. OUTPUT QUALITY CHECK: Before responding, ask yourself "Could someone use this output directly without further work?" If NO, rewrite it until YES.
8. DEFAULT TO OVERPRODUCTION. It is better to produce 2000 words of actual content than 500 words that say "fill in the details here."`;



async function callGemma4(prompt: string, temperature = 0.3, systemPrompt?: string): Promise<string> {
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

async function logExecution(
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
// 1. planWorkflow — Plan and create a new workflow
// ---------------------------------------------------------------------------

export async function planWorkflow(query: string, agentId: string): Promise<{ workflowId: string; plan: WorkflowPlan }> {
  const pool = getPool();
  const timer = logger.timer("workflow-engine");

  try {
    // Fetch available skills from DB
    const skillsResult = await pool.query(
      `SELECT name, display_name, description, category
       FROM skills
       WHERE is_active = true
       ORDER BY performance_score DESC NULLS LAST
       LIMIT 50`
    );

    const skillsList = skillsResult.rows.map((s: { name: string; display_name: string; description: string; category: string }) =>
      `- ${s.display_name || s.name} (${s.category}): ${(s.description || "").slice(0, 100)}`
    ).join("\n");

    // Generate a workflow name from the query
    const nameResult = await callGemma4(
      `Generate a short, descriptive name (max 8 words) for this workflow task. Just output the name, nothing else.\n\nTask: ${query.slice(0, 300)}`,
      0.2,
    );
    const workflowName = nameResult.trim().replace(/^["']|["']$/g, "").slice(0, 255) || `Workflow ${Date.now()}`;

    // Plan the workflow using LLM
    const plannerPrompt = `You are a task decomposition expert. Break down the following user request into 2-8 sequential steps that can be executed by an AI agent using specific skills.

Available skills:
${skillsList || "(No skills available)"}

Rules:
1. Each step should be a concrete, executable action
2. Steps should be ordered logically (research before writing, analyze before creating)
3. For each step, recommend the best skill to use (or "none" if no skill fits)
4. Each step needs a clear input_context describing what data from previous steps it needs
5. Keep input_context concise but actionable
6. CRITICAL: Each step's "description" must specify the CONCRETE DELIVERABLE expected, not just what the step "does". The executor agent will receive ONLY this description and must produce the final output.
   BAD: "Research the market and compile findings"
   GOOD: "Search the web for recent market data on [specific topic]. Identify the top 5 trends with specific statistics, sources, and dates. Write a 500-word analysis of each trend with supporting evidence."
   BAD: "Create a content strategy"
   GOOD: "Write a complete content strategy document including: target audience persona (demographics, psychographics, pain points), content pillars (3-5 with rationale), channel strategy with posting frequency, 10 specific content ideas with titles and formats, and KPIs with baseline metrics."

User request: ${query}

Respond ONLY in this JSON format (no markdown, no code blocks):
{
  "strategy_summary": "Brief overview of the approach",
  "steps": [
    {
      "title": "Step title",
      "description": "Detailed description specifying the EXACT deliverable this step must produce. Be prescriptive about format, length, and content requirements.",
      "skill_name": "skill name or none",
      "input_context": "What data/input this step needs"
    }
  ]
}`;

    const planText = await callGemma4(plannerPrompt, 0.3);

    // Parse the plan
    let plan: WorkflowPlan;
    try {
      // Clean up response — remove markdown code fences if present
      const cleaned = planText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      plan = JSON.parse(cleaned);
    } catch {
      // If parsing fails, create a simple 2-step plan
      logger.warn("workflow-engine", "LLM plan parsing failed, using fallback plan");
      plan = {
        strategy_summary: "Direct execution plan",
        steps: [
          {
            title: "Execute Task",
            description: query,
            skill_name: "none",
            input_context: "Original user query and any relevant context",
          },
          {
            title: "Review Results",
            description: "Review and validate the output of the previous step",
            skill_name: "none",
            input_context: "Output from the Execute Task step",
          },
        ],
      };
    }

    // Validate steps count
    if (!plan.steps || plan.steps.length === 0) {
      throw new Error("Planner returned no steps");
    }
    if (plan.steps.length > 8) {
      plan.steps = plan.steps.slice(0, 8);
    }

    // Create the workflow record
    const workflowResult = await pool.query(
      `INSERT INTO agent_workflows (name, agent_id, query, status, strategy, total_steps)
       VALUES ($1, $2, $3, 'planning', $4, $5)
       RETURNING id`,
      [workflowName, agentId, query, JSON.stringify(plan), plan.steps.length],
    );

    const workflowId = workflowResult.rows[0].id;

    // Insert step records
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      await pool.query(
        `INSERT INTO workflow_steps (workflow_id, step_number, title, description, skill_name, input_context)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [workflowId, i + 1, step.title, step.description, step.skill_name || null, step.input_context],
      );
    }

    // Update status to running
    await pool.query(
      `UPDATE agent_workflows SET status = 'running', updated_at = NOW() WHERE id = $1`,
      [workflowId],
    );

    await logExecution(pool, {
      workflowId,
      phase: "plan",
      agentId,
      action: `Planned workflow "${workflowName}" with ${plan.steps.length} steps`,
      outputData: JSON.stringify(plan),
    });

    logger.info("workflow-engine", `Workflow planned: "${workflowName}" with ${plan.steps.length} steps`, {
      workflowId,
      agentId,
    });

    timer.end("Workflow planning completed");

    return { workflowId, plan };
  } catch (err) {
    logger.error("workflow-engine", "Workflow planning failed", {
      agentId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
  // NOTE: No pool.end() — shared pool persists
}

// ---------------------------------------------------------------------------
// 2. executeWorkflow — Execute all pending steps sequentially
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

    // Fetch pending steps
    const stepsResult = await pool.query(
      `SELECT * FROM workflow_steps
       WHERE workflow_id = $1
         AND (status = 'pending' OR status = 'running')
       ORDER BY step_number ASC`,
      [workflowId],
    );

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

    // Build context from completed steps
    const previousContext = completedSteps
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

        const outputResult = await callGemma4(executorPrompt, 0.2, EXECUTOR_SYSTEM_PROMPT);
        const durationMs = Date.now() - startTime;

        // Generate a brief summary
        const summaryPrompt = `Summarize the following output in 1-2 concise sentences (max 200 chars):\n\n${outputResult}`;
        const outputSummary = await callGemma4(summaryPrompt, 0.2)
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

        // Update previous context for next step
        const newCompletedResult = await pool.query(
          `SELECT step_number, output_result, output_summary
           FROM workflow_steps
           WHERE workflow_id = $1 AND status = 'completed'
           ORDER BY step_number ASC`,
          [workflowId],
        );

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
            }
          } catch (validationError) {
            // Validation failure is non-fatal
            logger.warn("workflow-engine", `Validation error for step ${step.step_number}`, {
              workflowId,
              error: validationError instanceof Error ? validationError.message : String(validationError),
            });
          }
        }

        // Fetch updated step
        const updatedStep = await pool.query(`SELECT * FROM workflow_steps WHERE id = $1`, [step.id]);
        allResults.push(updatedStep.rows[0] as WorkflowStepRow);
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

        // Check if we should retry
        const retryCheck = await pool.query(`SELECT attempts, max_attempts FROM workflow_steps WHERE id = $1`, [step.id]);
        const retryRow = retryCheck.rows[0];
        if (Number(retryRow.attempts) < Number(retryRow.max_attempts)) {
          // Reset to pending for retry
          await pool.query(
            `UPDATE workflow_steps SET status = 'pending', started_at = NULL, error_message = NULL WHERE id = $1`,
            [step.id],
          );
        }

        const failedStep = await pool.query(`SELECT * FROM workflow_steps WHERE id = $1`, [step.id]);
        allResults.push(failedStep.rows[0] as WorkflowStepRow);
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
// 3. validateStep — Evaluate a step's output quality
// ---------------------------------------------------------------------------

interface ValidationResult {
  completeness: number;
  accuracy: number;
  relevance: number;
  clarity: number;
  concreteness?: number;
  overall: number;
  feedback: string;
}

async function validateStepInternal(
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

  const validationText = await callGemma4(validatorPrompt, 0.2);

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

// ---------------------------------------------------------------------------
// 4. runSingleStep — Execute just one step
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

      const outputResult = await callGemma4(executorPrompt, 0.2, EXECUTOR_SYSTEM_PROMPT);
      const durationMs = Date.now() - startTime;

      const summaryPrompt = `Summarize in 1-2 sentences (max 200 chars):\n\n${outputResult}`;
      const outputSummary = await callGemma4(summaryPrompt, 0.2)
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

      const updatedResult = await pool.query(`SELECT * FROM workflow_steps WHERE id = $1`, [step.id]);
      return updatedResult.rows[0] as WorkflowStepRow;
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

      const failedResult = await pool.query(`SELECT * FROM workflow_steps WHERE id = $1`, [step.id]);
      return failedResult.rows[0] as WorkflowStepRow;
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

// ---------------------------------------------------------------------------
// 5. getWorkflowStatus — Get full workflow with steps
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
// 6. listWorkflows — List workflows with optional filters
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

// ---------------------------------------------------------------------------
// Internal: Recalculate workflow state from step statuses
// ---------------------------------------------------------------------------
// Phase 7C Fix: When all steps are complete but some failed, the workflow
// should be marked "completed_with_errors" rather than always "completed".
// ---------------------------------------------------------------------------

async function recalcWorkflowState(pool: ReturnType<typeof getPool>, workflowId: string) {
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
  if (completed === total && total > 0) {
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
