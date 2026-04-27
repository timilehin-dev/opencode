// ---------------------------------------------------------------------------
// Observability Dashboard — Live Metrics SSE Stream
// GET /api/dashboard/stream
//
// Returns a Server-Sent Events stream that pushes aggregate stats every 5s.
// Auto-closes after 60 seconds. Connect with EventSource in frontend.
//
// Format: data: ${JSON.stringify({ timestamp, stats })}\n\n
// ---------------------------------------------------------------------------

import { query } from "@/lib/core/db";
import { logger } from "@/lib/core/logger";

// Vercel Hobby (free) tier limits function execution to 60s.
export const maxDuration = 60;

const POLL_INTERVAL_MS = 5000; // Push stats every 5 seconds
const MAX_CONNECTION_MS = 60_000; // Auto-close after 60s

/**
 * Fetch all dashboard stats in parallel (same queries as /api/dashboard/stats).
 */
async function fetchStats() {
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
    query(
      `SELECT COUNT(*)::int AS total FROM agent_tasks
       WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '24 hours'`
    ).catch(() => ({ rows: [{ total: 0 }] })),

    query(
      `SELECT agent_id,
              COUNT(*) FILTER (WHERE status = 'completed') AS completed,
              COUNT(*) FILTER (WHERE status = 'failed') AS failed,
              COUNT(*) AS total
       FROM agent_tasks
       WHERE created_at > NOW() - INTERVAL '7 days'
       GROUP BY agent_id`
    ).catch(() => ({ rows: [] })),

    query(
      `SELECT COUNT(*)::int AS depth FROM agent_tasks WHERE status = 'pending'`
    ).catch(() => ({ rows: [{ depth: 0 }] })),

    query(
      `SELECT AVG((metadata->>'durationMs')::numeric)::numeric(10,2) AS avg_latency_ms
       FROM agent_activity
       WHERE action LIKE '%task%'
         AND metadata->>'durationMs' IS NOT NULL
         AND created_at > NOW() - INTERVAL '24 hours'`
    ).catch(() => ({ rows: [{ avg_latency_ms: null }] })),

    query(
      `SELECT COUNT(*)::int AS active FROM agent_workflows
       WHERE status IN ('running', 'planning')`
    ).catch(() => ({ rows: [{ active: 0 }] })),

    query(
      `SELECT
         CASE WHEN COUNT(*) > 0
           THEN ROUND((COUNT(*) FILTER (WHERE has_embedding = true)::float / COUNT(*)::float) * 100, 1)
           ELSE 0 END AS coverage_pct
       FROM skills WHERE is_active = true`
    ).catch(() => ({ rows: [{ coverage_pct: 0 }] })),

    query(
      `SELECT COUNT(*)::int AS insight_count FROM learning_insights
       WHERE created_at > NOW() - INTERVAL '7 days'`
    ).catch(() => ({ rows: [{ insight_count: 0 }] })),

    query(
      `SELECT COUNT(*)::int AS sent FROM a2a_messages
       WHERE created_at > NOW() - INTERVAL '24 hours'`
    ).catch(() => ({ rows: [{ sent: 0 }] })),
  ]);

  // Compute derived metrics
  const tasksLast24h = Number(tasksPerHourResult.rows[0]?.total) || 0;
  const queueDepth = Number(queueDepthResult.rows[0]?.depth) || 0;

  const successRateByAgent: Record<string, { completed: number; failed: number; total: number; rate: number }> = {};
  for (const row of successRateResult.rows) {
    const completed = Number(row.completed) || 0;
    const failed = Number(row.failed) || 0;
    const total = Number(row.total) || 0;
    successRateByAgent[row.agent_id as string] = {
      completed,
      failed,
      total,
      rate: total > 0 ? Math.round((completed / total) * 100) / 100 : 0,
    };
  }

  // Compute alerts
  const alerts: Array<{ level: "warning" | "critical"; message: string }> = [];
  const totalCompleted = Object.values(successRateByAgent).reduce((s, a) => s + a.completed, 0);
  const totalFailed = Object.values(successRateByAgent).reduce((s, a) => s + a.failed, 0);
  const totalAll = totalCompleted + totalFailed;
  const overallSuccessRate = totalAll > 0 ? totalCompleted / totalAll : 1;

  if (queueDepth > 100) {
    alerts.push({ level: "critical", message: `Task queue depth (${queueDepth}) exceeds 100` });
  } else if (queueDepth > 50) {
    alerts.push({ level: "warning", message: `Task queue depth (${queueDepth}) is elevated` });
  }
  if (overallSuccessRate < 0.5 && totalAll > 5) {
    alerts.push({ level: "critical", message: `Success rate (${Math.round(overallSuccessRate * 100)}%) below 50%` });
  } else if (overallSuccessRate < 0.7 && totalAll > 5) {
    alerts.push({ level: "warning", message: `Success rate (${Math.round(overallSuccessRate * 100)}%) below 70%` });
  }

  return {
    tasks_per_hour: Math.round((tasksLast24h / 24) * 100) / 100,
    success_rate_by_agent: successRateByAgent,
    queue_depth: queueDepth,
    avg_llm_latency_ms: Number(llmLatencyResult.rows[0]?.avg_latency_ms) || null,
    active_workflows: Number(activeWorkflowsResult.rows[0]?.active) || 0,
    embedding_coverage: Number(embeddingCoverageResult.rows[0]?.coverage_pct) || 0,
    self_improvement_insights: Number(selfImprovementResult.rows[0]?.insight_count) || 0,
    a2a_messages_sent: Number(a2aMessagesResult.rows[0]?.sent) || 0,
    alerts,
  };
}

export async function GET(req: Request) {
  const encoder = new TextEncoder();
  const startTime = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial stats immediately
      try {
        const stats = await fetchStats();
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ timestamp: new Date().toISOString(), stats })}\n\n`),
        );
      } catch {
        // If initial fetch fails, send empty stats
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ timestamp: new Date().toISOString(), stats: {} })}\n\n`),
        );
      }

      // Polling loop — push stats every 5 seconds
      const interval = setInterval(async () => {
        // Auto-close after max duration
        if (Date.now() - startTime >= MAX_CONNECTION_MS) {
          clearInterval(interval);
          try {
            controller.close();
          } catch {
            // Already closed
          }
          return;
        }

        try {
          const stats = await fetchStats();
          const payload = JSON.stringify({ timestamp: new Date().toISOString(), stats });
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        } catch {
          // Silently skip failed polls — keep the stream alive
        }
      }, POLL_INTERVAL_MS);

      // Cleanup on abort
      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  logger.debug("dashboard-stream", "SSE stream opened");

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
