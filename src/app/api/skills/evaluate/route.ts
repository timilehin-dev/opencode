// ---------------------------------------------------------------------------
// Phase 6B: AI-as-Judge Skill Evaluation API
// ---------------------------------------------------------------------------
// POST /api/skills/evaluate
// Evaluates skill execution quality across 5 dimensions using an LLM judge.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

/* eslint-disable @typescript-eslint/no-require-imports */
const { Pool } = require("pg");

function getPool() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) throw new Error("SUPABASE_DB_URL not configured");
  return new Pool({ connectionString, max: 3, idleTimeoutMillis: 10000 });
}

// --- POST /api/skills/evaluate ---
export async function POST(req: Request) {
  const pool = getPool();

  try {
    const body = await req.json();
    const {
      skill_id,
      agent_id,
      task_id,
      input_summary,
      output_summary,
      execution_duration_ms,
      routing_method,
      success,
    } = body as {
      skill_id: string;
      agent_id: string;
      task_id?: string;
      input_summary: string;
      output_summary: string;
      execution_duration_ms?: number;
      routing_method?: string;
      success?: boolean;
    };

    if (!skill_id || !agent_id || !input_summary || !output_summary) {
      return NextResponse.json(
        { success: false, error: "skill_id, agent_id, input_summary, and output_summary are required" },
        { status: 400 }
      );
    }

    // 1. Fetch the skill details
    const skillResult = await pool.query(
      `SELECT id, name, display_name, description, category, difficulty, prompt_template, performance_score
       FROM skills WHERE id = $1`,
      [skill_id]
    );

    if (skillResult.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Skill not found" }, { status: 404 });
    }

    const skill = skillResult.rows[0];

    // 2. Create a skill_execution record for logging/analytics
    await pool.query(
      `INSERT INTO skill_executions (skill_id, agent_id, task_id, input_summary, output_summary, execution_duration_ms, routing_method, success, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        skill_id,
        agent_id,
        task_id || null,
        input_summary,
        output_summary,
        execution_duration_ms || null,
        routing_method || null,
        success !== undefined ? success : true,
      ]
    ).catch(() => {
      // Non-critical: execution logging may fail if table doesn't exist yet
    });

    // 3. Call LLM to evaluate execution quality
    const provider = createOpenAI({
      apiKey: process.env.AI_KEY_1,
      baseURL: "https://aihubmix.com/v1",
    });
    const model = provider.chat("claude-sonnet-4-20250514");

    const evaluationPrompt = `You are an AI quality judge evaluating the execution of a skill. Evaluate this skill execution objectively and provide structured scores.

## Skill Information
- Name: ${skill.display_name || skill.name}
- Category: ${skill.category}
- Difficulty: ${skill.difficulty}

## Execution Context
- Agent: ${agent_id}
- Input: ${input_summary}
- Output: ${output_summary}
- Duration: ${execution_duration_ms ? Math.round(execution_duration_ms) + "ms" : "N/A"}
- Routing Method: ${routing_method || "N/A"}
- Success: ${success !== undefined ? String(success) : "unknown"}

## Evaluation Instructions
Score each dimension from 0 to 100:
1. **Relevance** (0-100): Did the skill address the user's intent?
2. **Accuracy** (0-100): Was the output factually correct and appropriate?
3. **Completeness** (0-100): Did it cover all required aspects of the task?
4. **Clarity** (0-100): Was the output clear, well-structured, and easy to understand?
5. **Efficiency** (0-100): Was the approach efficient (considering duration if available)?

Also provide:
- **strengths**: 2-3 specific things done well (short phrases)
- **weaknesses**: 2-3 areas for improvement (short phrases)
- **improvement_suggestions**: 1-2 actionable suggestions to improve the skill

Respond ONLY in this exact JSON format (no markdown, no code blocks):
{
  "relevance": <number>,
  "accuracy": <number>,
  "completeness": <number>,
  "clarity": <number>,
  "efficiency": <number>,
  "strengths": ["<str1>", "<str2>"],
  "weaknesses": ["<str1>", "<str2>"],
  "improvement_suggestions": ["<str1>"]
}`;

    let evaluationResult: {
      relevance: number;
      accuracy: number;
      completeness: number;
      clarity: number;
      efficiency: number;
      strengths: string[];
      weaknesses: string[];
      improvement_suggestions: string[];
    };

    try {
      const llmResult = await generateText({
        model,
        prompt: evaluationPrompt,
        maxTokens: 1024,
        temperature: 0.3,
        abortSignal: AbortSignal.timeout(30000),
      });

      // Parse the LLM response — strip markdown code blocks if present
      let jsonText = llmResult.text.trim();
      if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
      }

      evaluationResult = JSON.parse(jsonText);
    } catch (llmError) {
      console.error("[SkillEvaluate] LLM evaluation failed:", llmError);
      // Provide fallback scores
      evaluationResult = {
        relevance: success === false ? 30 : 70,
        accuracy: success === false ? 40 : 65,
        completeness: success === false ? 35 : 60,
        clarity: success === false ? 50 : 65,
        efficiency: 60,
        strengths: ["Execution completed"],
        weaknesses: ["LLM evaluation unavailable"],
        improvement_suggestions: ["Review manually"],
      };
    }

    // 5. Calculate overall_score as weighted average
    const overall_score = Math.round(
      evaluationResult.relevance * 0.3 +
      evaluationResult.accuracy * 0.25 +
      evaluationResult.completeness * 0.2 +
      evaluationResult.clarity * 0.15 +
      evaluationResult.efficiency * 0.1
    );

    // 6. Save to skill_evaluations table
    const evalResult = await pool.query(
      `INSERT INTO skill_evaluations
        (skill_id, agent_id, task_id, relevance, accuracy, completeness, clarity, efficiency,
         overall_score, strengths, weaknesses, improvement_suggestions, input_summary, output_summary,
         routing_method, execution_duration_ms, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
       RETURNING id`,
      [
        skill_id,
        agent_id,
        task_id || null,
        evaluationResult.relevance,
        evaluationResult.accuracy,
        evaluationResult.completeness,
        evaluationResult.clarity,
        evaluationResult.efficiency,
        overall_score,
        JSON.stringify(evaluationResult.strengths || []),
        JSON.stringify(evaluationResult.weaknesses || []),
        JSON.stringify(evaluationResult.improvement_suggestions || []),
        input_summary,
        output_summary,
        routing_method || null,
        execution_duration_ms || null,
      ]
    ).catch(() => null);

    // 7. If evaluation reveals significant insight, create skill_evolution record
    try {
      const weaknesses = evaluationResult.weaknesses || [];
      const hasCriticalWeakness = weaknesses.some(
        (w: string) => w.toLowerCase().includes("incomplete") ||
          w.toLowerCase().includes("inaccurate") ||
          w.toLowerCase().includes("missing") ||
          w.toLowerCase().includes("incorrect")
      );

      if (hasCriticalWeakness && overall_score < 60) {
        await pool.query(
          `INSERT INTO skill_evolution
            (skill_id, change_type, previous_version, new_version, change_summary, triggered_by, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [
            skill_id,
            "evaluation_insight",
            "current",
            "pending_update",
            `Low evaluation (score: ${overall_score}). Weaknesses: ${weaknesses.join("; ")}`,
            agent_id,
          ]
        );
      }
    } catch {
      // Non-critical: evolution logging may fail if table doesn't exist yet
    }

    // 8. Update skill performance_score (rolling average)
    try {
      const avgResult = await pool.query(
        `SELECT AVG(overall_score) as avg_score, COUNT(*) as eval_count
         FROM skill_evaluations WHERE skill_id = $1`,
        [skill_id]
      );

      if (avgResult.rows.length > 0) {
        const newPerfScore = Number(avgResult.rows[0].avg_score) || 0;
        await pool.query(
          `UPDATE skills SET performance_score = $1, updated_at = NOW() WHERE id = $2`,
          [newPerfScore, skill_id]
        );
      }
    } catch {
      // Non-critical
    }

    return NextResponse.json({
      success: true,
      data: {
        evaluation_id: evalResult?.rows[0]?.id || null,
        skill_id,
        skill_name: skill.display_name || skill.name,
        scores: {
          relevance: evaluationResult.relevance,
          accuracy: evaluationResult.accuracy,
          completeness: evaluationResult.completeness,
          clarity: evaluationResult.clarity,
          efficiency: evaluationResult.efficiency,
        },
        overall_score,
        strengths: evaluationResult.strengths || [],
        weaknesses: evaluationResult.weaknesses || [],
        improvement_suggestions: evaluationResult.improvement_suggestions || [],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Evaluation failed";
    console.error("[SkillEvaluate] Error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  } finally {
    await pool.end();
  }
}
