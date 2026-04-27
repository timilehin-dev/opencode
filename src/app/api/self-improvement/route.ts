// ---------------------------------------------------------------------------
// API — Self-Improvement System
// GET  /api/self-improvement — metrics, history, stats
// POST /api/self-improvement — trigger reflection, benchmark, cleanup
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { query } from "@/lib/core/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "stats";
  const agentId = searchParams.get("agentId") || "";

  try {
    switch (action) {
      case "stats": {
        const agentFilter = agentId ? `WHERE agent_id = '${agentId.replace(/'/g, "''")}'` : "";
        const [metricResult, insightResult] = await Promise.all([
          query(`SELECT agent_id, metric_type, COUNT(*) as count, MAX(created_at) as latest
                  FROM agent_metrics ${agentFilter}
                  GROUP BY agent_id, metric_type
                  ORDER BY agent_id, metric_type`),
          query(`SELECT agent_id, insight_type, COUNT(*) as count, ROUND(AVG(confidence)::numeric, 2) as avg_confidence
                  FROM learning_insights ${agentFilter}
                  GROUP BY agent_id, insight_type
                  ORDER BY agent_id, insight_type`),
        ]);

        return NextResponse.json({
          success: true,
          data: {
            metrics: metricResult.rows,
            insights: insightResult.rows,
          },
        });
      }

      case "history": {
        const agent = agentId || "general";
        const limit = parseInt(searchParams.get("limit") || "20", 10);
        const result = await query(
          `SELECT id, agent_id, metric_type, metric_value, metadata, created_at
           FROM agent_metrics
           WHERE agent_id = $1
           ORDER BY created_at DESC
           LIMIT $2`,
          [agent, limit]
        );
        return NextResponse.json({ success: true, data: result.rows });
      }

      case "leaderboard": {
        const result = await query(
          `SELECT agent_id,
                  COUNT(*) FILTER (WHERE metric_type = 'strategy_update') as strategy_updates,
                  COUNT(*) FILTER (WHERE metric_type = 'knowledge_shared') as knowledge_shared,
                  COUNT(*) FILTER (WHERE metric_type = 'benchmark') as benchmarks,
                  COUNT(*) as total_activity
           FROM agent_metrics
           WHERE created_at >= NOW() - INTERVAL '30 days'
           GROUP BY agent_id
           ORDER BY total_activity DESC`
        );
        return NextResponse.json({ success: true, data: result.rows });
      }

      case "team_insights": {
        const result = await query(
          `SELECT agent_id, insight_type, COUNT(*) as count, ROUND(AVG(confidence)::numeric, 2) as avg_confidence
           FROM learning_insights
           WHERE created_at >= NOW() - INTERVAL '30 days'
           GROUP BY agent_id, insight_type
           ORDER BY agent_id, count DESC`
        );
        return NextResponse.json({ success: true, data: result.rows });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error("[API] Self-improvement GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body as { action?: string };

    switch (action) {
      case "decay": {
        const result = await query(
          `UPDATE learning_insights
           SET confidence = GREATEST(0.1, confidence - 0.10),
               updated_at = NOW()
           WHERE ((last_applied_at IS NULL AND created_at < NOW() - INTERVAL '30 days')
              OR (last_applied_at IS NOT NULL AND last_applied_at < NOW() - INTERVAL '30 days'))
             AND confidence > 0.1`
        );
        return NextResponse.json({ success: true, decayed: result.rowCount || 0 });
      }

      case "cleanup_metrics": {
        const result = await query(
          `DELETE FROM agent_metrics WHERE created_at < NOW() - INTERVAL '90 days'`
        );
        return NextResponse.json({ success: true, deleted: result.rowCount || 0 });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}. Use decay or cleanup_metrics.` },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error("[API] Self-improvement POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
