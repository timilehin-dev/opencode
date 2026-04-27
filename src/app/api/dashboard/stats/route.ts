// ---------------------------------------------------------------------------
// Observability Dashboard — Aggregate Metrics Endpoint
// GET /api/dashboard/stats
//
// Returns a comprehensive snapshot of system health and performance metrics.
// Uses parallel queries for optimal performance.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { query } from "@/lib/core/db";
import { logger } from "@/lib/core/logger";

function ok(data: unknown) {
  return NextResponse.json({ success: true, data });
}

function err(msg: string, status = 500) {
  return NextResponse.json({ success: false, error: msg }, { status });
}

export async function GET() {
  try {
    // Run all metric queries in parallel
    const [
      tasksPerHourResult,
      successRateResult,
      queueDepthResult,
      llmLatencyResult,
      activeWorkflowsResult,
      embeddingCoverageResult,
      selfImprovementResult,
      a2aMessagesResult,
    ] = await Promise.all([
      // Tasks completed in last 24h (for tasks_per_hour calculation)
      query(
        `SELECT COUNT(*)::int AS total FROM agent_tasks
         WHERE status = 'completed'
           AND completed_at > NOW() - INTERVAL '24 hours'`
      ).catch(() => ({ rows: [{ total: 0 }] })),

      // Per-agent success rate
      query(
        `SELECT agent_id,
                COUNT(*) FILTER (WHERE status = 'completed') AS completed,
                COUNT(*) FILTER (WHERE status = 'failed') AS failed,
                COUNT(*) AS total
         FROM agent_tasks
         WHERE created_at > NOW() - INTERVAL '7 days'
         GROUP BY agent_id
         ORDER BY agent_id`
      ).catch(() => ({ rows: [] })),

      // Queue depth — pending tasks
      query(
        `SELECT COUNT(*)::int AS depth FROM agent_tasks WHERE status = 'pending'`
      ).catch(() => ({ rows: [{ depth: 0 }] })),

      // Avg LLM latency from agent_activity (task-related actions)
      query(
        `SELECT AVG(
           (metadata->>'durationMs')::numeric
         )::numeric(10,2) AS avg_latency_ms
         FROM agent_activity
         WHERE action LIKE '%task%'
           AND metadata->>'durationMs' IS NOT NULL
           AND created_at > NOW() - INTERVAL '24 hours'`
      ).catch(() => ({ rows: [{ avg_latency_ms: null }] })),

      // Active workflows count
      query(
        `SELECT COUNT(*)::int AS active FROM agent_workflows
         WHERE status IN ('running', 'planning')`
      ).catch(() => ({ rows: [{ active: 0 }] })),

      // Embedding coverage — % skills with embeddings
      query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE has_embedding = true)::int AS with_embedding,
           CASE
             WHEN COUNT(*) > 0
             THEN ROUND((COUNT(*) FILTER (WHERE has_embedding = true)::float / COUNT(*)::float) * 100, 1)
             ELSE 0
           END AS coverage_pct
         FROM skills
         WHERE is_active = true`
      ).catch(() => ({ rows: [{ total: 0, with_embedding: 0, coverage_pct: 0 }] })),

      // Self-improvement insights from last 7 days
      query(
        `SELECT COUNT(*)::int AS insight_count FROM learning_insights
         WHERE created_at > NOW() - INTERVAL '7 days'`
      ).catch(() => ({ rows: [{ insight_count: 0 }] })),

      // A2A messages sent in last 24h
      query(
        `SELECT COUNT(*)::int AS sent FROM a2a_messages
         WHERE created_at > NOW() - INTERVAL '24 hours'`
      ).catch(() => ({ rows: [{ sent: 0 }] })),
    ]);

    // --- Compute derived metrics ---

    // Tasks per hour
    const tasksLast24h = Number(tasksPerHourResult.rows[0]?.total) || 0;
    const tasksPerHour = Math.round((tasksLast24h / 24) * 100) / 100;

    // Per-agent success rate
    const successRateByAgent: Record<string, {
      completed: number;
      failed: number;
      total: number;
      rate: number;
    }> = {};
    for (const row of successRateResult.rows) {
      const agent = row.agent_id as string;
      const completed = Number(row.completed) || 0;
      const failed = Number(row.failed) || 0;
      const total = Number(row.total) || 0;
      successRateByAgent[agent] = {
        completed,
        failed,
        total,
        rate: total > 0 ? Math.round((completed / total) * 100) / 100 : 0,
      };
    }

    // Queue depth
    const queueDepth = Number(queueDepthResult.rows[0]?.depth) || 0;

    // Avg LLM latency
    const avgLlmLatencyMs = Number(llmLatencyResult.rows[0]?.avg_latency_ms) || null;

    // Active workflows
    const activeWorkflows = Number(activeWorkflowsResult.rows[0]?.active) || 0;

    // Embedding coverage
    const embeddingCoverageRow = embeddingCoverageResult.rows[0] as Record<string, unknown>;
    const embeddingCoverage = Number(embeddingCoverageRow?.coverage_pct) || 0;

    // Self-improvement insights
    const selfImprovementInsights = Number(selfImprovementResult.rows[0]?.insight_count) || 0;

    // A2A messages
    const a2aMessagesSent = Number(a2aMessagesResult.rows[0]?.sent) || 0;

    // --- Compute alerts ---
    const alerts: Array<{ level: "warning" | "critical"; message: string }> = [];

    // Overall success rate for alerting
    const totalCompleted = Object.values(successRateByAgent).reduce((s, a) => s + a.completed, 0);
    const totalFailed = Object.values(successRateByAgent).reduce((s, a) => s + a.failed, 0);
    const totalAll = totalCompleted + totalFailed;
    const overallSuccessRate = totalAll > 0 ? totalCompleted / totalAll : 1;

    if (queueDepth > 100) {
      alerts.push({
        level: "critical",
        message: `Task queue depth (${queueDepth}) exceeds threshold of 100`,
      });
    } else if (queueDepth > 50) {
      alerts.push({
        level: "warning",
        message: `Task queue depth (${queueDepth}) is elevated`,
      });
    }

    if (overallSuccessRate < 0.5 && totalAll > 5) {
      alerts.push({
        level: "critical",
        message: `Task success rate (${Math.round(overallSuccessRate * 100)}%) is below 50% threshold`,
      });
    } else if (overallSuccessRate < 0.7 && totalAll > 5) {
      alerts.push({
        level: "warning",
        message: `Task success rate (${Math.round(overallSuccessRate * 100)}%) is below 70%`,
      });
    }

    const stats = {
      timestamp: new Date().toISOString(),
      tasks_per_hour: tasksPerHour,
      tasks_last_24h: tasksLast24h,
      success_rate_by_agent: successRateByAgent,
      queue_depth: queueDepth,
      avg_llm_latency_ms: avgLlmLatencyMs,
      active_workflows: activeWorkflows,
      embedding_coverage: embeddingCoverage,
      self_improvement_insights: selfImprovementInsights,
      a2a_messages_sent: a2aMessagesSent,
      alerts,
    };

    logger.debug("dashboard-stats", "Stats computed", {
      tasksPerHour,
      queueDepth,
      activeWorkflows,
      alertsCount: alerts.length,
    });

    return ok(stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    logger.error("dashboard-stats", "Failed to compute stats", { error: message });
    return err(message);
  }
}
