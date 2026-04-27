// ---------------------------------------------------------------------------
// Post-Task Self-Improvement Reflection
//
// Automatically triggers agent self-reflection after complex tasks complete.
// Fire-and-forget: runs async after task completion, never blocks the task.
//
// Trigger conditions:
//   - Task completed successfully
//   - Task had enough steps or was sufficiently complex
//   - Agent hasn't reflected recently (cooldown: 1 hour)
//
// Creates a corrective or reinforcement insight in the learning_insights table.
// ---------------------------------------------------------------------------

import { query } from "@/lib/core/db";
import { logger } from "@/lib/core/logger";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Minimum task steps/context length to trigger reflection */
const MIN_TASK_COMPLEXITY = 200; // characters of context

/** Cooldown between reflections per agent (ms) — 1 hour */
const REFLECTION_COOLDOWN_MS = 3600_000;

// ---------------------------------------------------------------------------
// Main reflection function
// ---------------------------------------------------------------------------

export async function triggerPostTaskReflection(params: {
  taskId: string | number;
  agentId: string;
  taskTitle: string;
  result: string;
  success: boolean;
  error?: string;
}): Promise<void> {
  const { taskId, agentId, taskTitle, result, success, error } = params;

  try {
    // 1. Check cooldown — don't reflect too frequently
    const cooldownResult = await query(
      `SELECT id FROM learning_insights
       WHERE agent_id = $1
         AND insight_type = 'post_task_reflection'
         AND created_at > NOW() - INTERVAL '1 hour'
       LIMIT 1`,
      [agentId]
    );
    if (cooldownResult.rows.length > 0) {
      logger.info("post-task-reflection", `Skipped — agent ${agentId} reflected within the last hour`);
      return;
    }

    // 2. Build reflection content from task result
    const resultSummary = (result || "").slice(0, 1000);
    const taskContext = `Task: ${taskTitle}\nStatus: ${success ? "COMPLETED" : "FAILED"}\nResult: ${resultSummary}${error ? `\nError: ${error.slice(0, 500)}` : ""}`;

    // 3. Create a reflection insight
    const insightContent = success
      ? `Task completed successfully: "${taskTitle}". Result summary: ${resultSummary.slice(0, 300)}. Reinforce this approach for similar tasks.`
      : `Task failed: "${taskTitle}". Error: ${error || "Unknown"}. Review and adjust approach for similar tasks in the future.`;

    const confidence = success ? 0.7 : 0.85; // Failed tasks get higher priority insights

    await query(
      `INSERT INTO learning_insights (agent_id, insight_type, content, source, confidence)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [agentId, "post_task_reflection", insightContent, "auto_post_task", confidence]
    );

    // 4. Also record in agent_metrics for benchmarking
    await query(
      `INSERT INTO agent_metrics (agent_id, metric_type, metric_value, metadata)
       VALUES ($1, 'post_task_reflection', $2, $3)
       ON CONFLICT DO NOTHING`,
      [
        agentId,
        success ? "reflected_on_success" : "reflected_on_failure",
        JSON.stringify({ task_id: taskId, task_title: taskTitle, success, reflected_at: new Date().toISOString() }),
      ]
    ).catch(() => { /* non-critical */ });

    logger.info("post-task-reflection", `Reflection saved for agent ${agentId}: ${success ? "success" : "failure"}`);
  } catch (err) {
    // Never propagate — this is fire-and-forget
    logger.warn("post-task-reflection", "Failed to trigger reflection", {
      agentId,
      taskId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Periodic improvement analysis (called by cron)
//
// Loops all agents, analyzes last 7 days of tasks, creates insights
// based on success/failure patterns.
// ---------------------------------------------------------------------------

export async function runPeriodicImprovementAnalysis(): Promise<{
  agentsAnalyzed: number;
  insightsCreated: number;
}> {
  let agentsAnalyzed = 0;
  let insightsCreated = 0;

  try {
    // Get all agents that have had tasks in the last 7 days
    const agentsResult = await query(
      `SELECT agent_id,
              COUNT(*) FILTER (WHERE status = 'completed') as completed,
              COUNT(*) FILTER (WHERE status = 'failed') as failed,
              COUNT(*) as total,
              ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - created_at)))::numeric, 0) as avg_duration_sec
       FROM agent_tasks
       WHERE created_at > NOW() - INTERVAL '7 days'
       GROUP BY agent_id`
    );

    for (const agent of agentsResult.rows) {
      const agentId = agent.agent_id;
      const completed = parseInt(agent.completed, 10);
      const failed = parseInt(agent.failed, 10);
      const total = parseInt(agent.total, 10);
      const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
      const avgDuration = parseInt(agent.avg_duration_sec, 10) || 0;

      agentsAnalyzed++;

      if (total < 3) continue; // Not enough data

      // Low success rate → corrective insight
      if (successRate < 70 && failed >= 2) {
        await query(
          `INSERT INTO learning_insights (agent_id, insight_type, content, source, confidence)
           VALUES ($1, 'correction', $2, 'periodic_analysis', 0.85)
           ON CONFLICT DO NOTHING`,
          [agentId, `PERIODIC ALERT: Success rate is ${successRate}% (${failed}/${total} failures in last 7 days). Review failed tasks and adjust strategy. Average task duration: ${avgDuration}s.`]
        ).catch(() => {});
        insightsCreated++;
      }

      // High success rate → reinforcement insight
      if (successRate > 90 && completed >= 5) {
        await query(
          `INSERT INTO learning_insights (agent_id, insight_type, content, source, confidence)
           VALUES ($1, 'reinforcement', $2, 'periodic_analysis', 0.7)
           ON CONFLICT DO NOTHING`,
          [agentId, `PERIODIC PRAISE: Excellent performance with ${successRate}% success rate (${completed}/${total} completed in last 7 days). Current strategy is working well. Average task duration: ${avgDuration}s.`]
        ).catch(() => {});
        insightsCreated++;
      }
    }

    logger.info("periodic-improvement", `Analyzed ${agentsAnalyzed} agents, created ${insightsCreated} insights`);
  } catch (err) {
    logger.error("periodic-improvement", "Periodic analysis failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { agentsAnalyzed, insightsCreated };
}
