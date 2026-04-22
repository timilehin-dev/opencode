// ---------------------------------------------------------------------------
// Phase 6B: Skill Evolution Analytics API
// ---------------------------------------------------------------------------
// GET /api/skills/evolution?skill_id=...&period=7d|30d|90d
// Returns execution history, evaluation trends, evolution timeline, and
// performance summary.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";

/* eslint-disable @typescript-eslint/no-require-imports */
const { Pool } = require("pg");

function getPool() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) throw new Error("SUPABASE_DB_URL not configured");
  return new Pool({ connectionString, max: 3, idleTimeoutMillis: 10000 });
}

function parsePeriod(period: string): { days: number; label: string } {
  const map: Record<string, { days: number; label: string }> = {
    "7d": { days: 7, label: "7 days" },
    "30d": { days: 30, label: "30 days" },
    "90d": { days: 90, label: "90 days" },
  };
  return map[period] || map["30d"];
}

// --- GET /api/skills/evolution ---
export async function GET(req: Request) {
  const pool = getPool();

  try {
    const { searchParams } = new URL(req.url);
    const skillId = searchParams.get("skill_id") || "";
    const period = searchParams.get("period") || "30d";
    const { days, label } = parsePeriod(period);

    // --- Execution History (use actual DB column names) ---
    const executionsResult = await pool.query(
      `SELECT se.id, se.skill_id, se.agent_id, se.task_description, se.quality_score,
              se.duration_ms, se.status, se.steps_taken, se.tokens_used, se.created_at,
              s.display_name as skill_name, s.category as skill_category
       FROM skill_executions se
       JOIN skills s ON s.id = se.skill_id
       WHERE se.created_at >= NOW() - INTERVAL '1 day' * $1
       ${skillId ? "AND se.skill_id = $2" : ""}
       ORDER BY se.created_at DESC
       LIMIT 100`,
      skillId ? [days, skillId] : [days]
    );

    const executions = executionsResult.rows.map((row: Record<string, unknown>) => ({
      ...row,
      quality_score: row.quality_score ? Number(row.quality_score) : null,
      duration_ms: row.duration_ms ? Number(row.duration_ms) : null,
      tokens_used: row.tokens_used ? Number(row.tokens_used) : null,
    }));

    // --- Evaluation Trends (use actual DB column names with _score suffix) ---
    const trendsResult = await pool.query(
      `SELECT
          DATE(se.created_at) as date,
          COUNT(*) as eval_count,
          ROUND(AVG(se.overall_score)::numeric, 1) as avg_score,
          ROUND(AVG(se.relevance_score)::numeric, 1) as avg_relevance,
          ROUND(AVG(se.accuracy_score)::numeric, 1) as avg_accuracy,
          ROUND(AVG(se.completeness_score)::numeric, 1) as avg_completeness,
          ROUND(AVG(se.clarity_score)::numeric, 1) as avg_clarity,
          ROUND(AVG(se.efficiency_score)::numeric, 1) as avg_efficiency
       FROM skill_evaluations se
       WHERE se.created_at >= NOW() - INTERVAL '1 day' * $1
       ${skillId ? "AND se.skill_id = $2" : ""}
       GROUP BY DATE(se.created_at)
       ORDER BY date DESC`,
      skillId ? [days, skillId] : [days]
    );

    const evaluationTrends = trendsResult.rows.map((row: Record<string, unknown>) => ({
      date: row.date,
      eval_count: Number(row.eval_count) || 0,
      avg_score: Number(row.avg_score) || 0,
      avg_relevance: Number(row.avg_relevance) || 0,
      avg_accuracy: Number(row.avg_accuracy) || 0,
      avg_completeness: Number(row.avg_completeness) || 0,
      avg_clarity: Number(row.avg_clarity) || 0,
      avg_efficiency: Number(row.avg_efficiency) || 0,
    }));

    // --- Evolution Timeline (use actual DB column names) ---
    const evolutionResult = await pool.query(
      `SELECT ev.id, ev.skill_id, ev.change_type, ev.previous_state, ev.new_state,
              ev.change_reason, ev.trigger_agent_id, ev.created_at,
              s.display_name as skill_name
       FROM skill_evolution ev
       JOIN skills s ON s.id = ev.skill_id
       WHERE ev.created_at >= NOW() - INTERVAL '1 day' * $1
       ${skillId ? "AND ev.skill_id = $2" : ""}
       ORDER BY ev.created_at DESC
       LIMIT 50`,
      skillId ? [days, skillId] : [days]
    );

    const evolutionTimeline = evolutionResult.rows.map((row: Record<string, unknown>) => ({
      ...row,
      change_summary: typeof row.change_reason === "string" ? row.change_reason : String(row.change_reason || ""),
      triggered_by: row.trigger_agent_id || "",
    }));

    // --- Performance Summary ---
    const summaryResult = await pool.query(
      `SELECT
          COUNT(DISTINCT se.id) as total_executions,
          COUNT(DISTINCT sve.id) as total_evaluations,
          ROUND(AVG(sve.overall_score)::numeric, 1) as avg_performance_score,
          COUNT(DISTINCT CASE WHEN se.success = true THEN se.id END) as successful_executions,
          COUNT(DISTINCT ev.id) as skills_evolved
       FROM skill_executions se
       LEFT JOIN skill_evaluations sve ON sve.skill_id = se.skill_id
         AND sve.created_at >= NOW() - INTERVAL '1 day' * $1
       LEFT JOIN skill_evolution ev ON ev.created_at >= NOW() - INTERVAL '1 day' * $1
       WHERE se.created_at >= NOW() - INTERVAL '1 day' * $1
       ${skillId ? "AND se.skill_id = $2" : ""}`,
      skillId ? [days, skillId] : [days]
    );

    const summary = summaryResult.rows[0];
    const totalExecutions = Number(summary?.total_executions) || 0;
    const successfulExecutions = Number(summary?.successful_executions) || 0;

    const performanceSummary = {
      total_executions: totalExecutions,
      total_evaluations: Number(summary?.total_evaluations) || 0,
      avg_performance_score: Number(summary?.avg_performance_score) || 0,
      success_rate: totalExecutions > 0 ? Math.round((successfulExecutions / totalExecutions) * 100) : 0,
      skills_evolved: Number(summary?.skills_evolved) || 0,
      period: label,
    };

    // --- Top Skills by Performance ---
    const topSkillsResult = await pool.query(
      `SELECT
          s.id, s.display_name, s.name, s.category, s.difficulty,
          s.performance_score, s.total_uses, s.avg_rating,
          COUNT(eve.id) as eval_count
       FROM skills s
       LEFT JOIN skill_evaluations eve ON eve.skill_id = s.id
         AND eve.created_at >= NOW() - INTERVAL '1 day' * $1
       WHERE s.is_active = true
       GROUP BY s.id
       ORDER BY s.performance_score DESC NULLS LAST
       LIMIT 10`,
      [days]
    );

    const topSkills = topSkillsResult.rows.map((row: Record<string, unknown>) => ({
      id: row.id,
      display_name: row.display_name,
      name: row.name,
      category: row.category,
      difficulty: row.difficulty,
      performance_score: Number(row.performance_score) || 0,
      total_uses: Number(row.total_uses) || 0,
      avg_rating: Number(row.avg_rating) || 0,
      eval_count: Number(row.eval_count) || 0,
    }));

    // --- Recent Evaluations (for the list) ---
    const recentEvalsResult = await pool.query(
      `SELECT eve.id, eve.skill_id, eve.agent_id, eve.overall_score,
              eve.strengths, eve.weaknesses, eve.created_at,
              s.display_name as skill_name
       FROM skill_evaluations eve
       JOIN skills s ON s.id = eve.skill_id
       WHERE eve.created_at >= NOW() - INTERVAL '1 day' * $1
       ${skillId ? "AND eve.skill_id = $2" : ""}
       ORDER BY eve.created_at DESC
       LIMIT 10`,
      skillId ? [days, skillId] : [days]
    );

    const recentEvaluations = recentEvalsResult.rows.map((row: Record<string, unknown>) => ({
      ...row,
      overall_score: Number(row.overall_score) || 0,
    }));

    return NextResponse.json({
      success: true,
      data: {
        period: label,
        performance_summary: performanceSummary,
        evaluation_trends: evaluationTrends,
        top_skills: topSkills,
        recent_evaluations: recentEvaluations,
        execution_history: executions,
        evolution_timeline: evolutionTimeline,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch evolution data";
    console.error("[SkillEvolution] Error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  } finally {
    await pool.end();
  }
}
