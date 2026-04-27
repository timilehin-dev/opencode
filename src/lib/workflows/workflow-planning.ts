// ---------------------------------------------------------------------------
// Workflow Planning — LLM-based workflow planning
// ---------------------------------------------------------------------------

import { getPool } from "@/lib/core/db";
import { withTransaction } from "@/lib/core/db";
import { logger } from "@/lib/core/logger";
import { callLLM, logExecution } from "./workflow-types";
import type { WorkflowPlan } from "./workflow-types";

// ---------------------------------------------------------------------------
// planWorkflow — Plan and create a new workflow
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
    const nameResult = await callLLM(
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

    const planText = await callLLM(plannerPrompt, 0.3);

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

    // Create the workflow and its steps inside a transaction to ensure atomicity.
    // Without this, a failure between inserting the workflow and its steps would
    // leave the database in an inconsistent state (orphan workflow with no steps).
    const { workflowId, workflowName: finalName, plan: finalPlan } = await withTransaction(async (client) => {
      const workflowResult = await client.query(
        `INSERT INTO agent_workflows (name, agent_id, query, status, strategy, total_steps)
         VALUES ($1, $2, $3, 'planning', $4, $5)
         RETURNING id`,
        [workflowName, agentId, query, JSON.stringify(plan), plan.steps.length],
      );

      const wid = workflowResult.rows[0].id;

      // Insert step records
      for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i];
        await client.query(
          `INSERT INTO workflow_steps (workflow_id, step_number, title, description, skill_name, input_context)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [wid, i + 1, step.title, step.description, step.skill_name || null, step.input_context],
        );
      }

      // Update status to running
      await client.query(
        `UPDATE agent_workflows SET status = 'running', updated_at = NOW() WHERE id = $1`,
        [wid],
      );

      return { workflowId: wid, workflowName, plan };
    });

    await logExecution(pool, {
      workflowId,
      phase: "plan",
      agentId,
      action: `Planned workflow "${finalName}" with ${finalPlan.steps.length} steps`,
      outputData: JSON.stringify(finalPlan),
    });

    logger.info("workflow-engine", `Workflow planned: "${finalName}" with ${finalPlan.steps.length} steps`, {
      workflowId,
      agentId,
    });

    timer.end("Workflow planning completed");

    return { workflowId, plan: finalPlan };
  } catch (err) {
    logger.error("workflow-engine", "Workflow planning failed", {
      agentId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
  // NOTE: No pool.end() — shared pool persists
}
