// ---------------------------------------------------------------------------
// Phase 6C: Skill Evolution Engine
// ---------------------------------------------------------------------------
// Core intelligence that auto-improves skills based on evaluation feedback.
// Analyzes weaknesses, rewrites prompt templates, and manages evolution state.
//
// Phase 7C: Refactored to use shared connection pool + structured logger.
// ---------------------------------------------------------------------------

import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { getPool } from "@/lib/db";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EvolveResult {
  success: boolean;
  skill_id: string;
  change_type: string;
  new_version: number;
  improvements: string[];
  previous_prompt: string;
  new_prompt: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Core: evolveSkill
// ---------------------------------------------------------------------------

export async function evolveSkill(skillId: string, triggerAgentId?: string): Promise<EvolveResult> {
  const pool = getPool();

  try {
    // 1. Fetch the skill
    const skillResult = await pool.query(
      `SELECT id, name, display_name, description, category, difficulty, prompt_template, version, performance_score
       FROM skills WHERE id = $1`,
      [skillId]
    );

    if (skillResult.rows.length === 0) {
      return { success: false, skill_id: skillId, change_type: "none", new_version: 0, improvements: [], previous_prompt: "", new_prompt: "", error: "Skill not found" };
    }

    const skill = skillResult.rows[0];
    const previousPrompt = skill.prompt_template || "";

    // 2. Fetch recent evaluations (last 10)
    const evalsResult = await pool.query(
      `SELECT id, relevance_score, accuracy_score, completeness_score, clarity_score, efficiency_score,
              overall_score, strengths, weaknesses, improvement_suggestions, created_at
       FROM skill_evaluations
       WHERE skill_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [skillId]
    );

    const evaluations = evalsResult.rows;

    // 3. Check evolution threshold: avg overall_score < 50 AND eval_count >= 3
    const evalCount = evaluations.length;
    const avgScore = evalCount > 0
      ? evaluations.reduce((sum: number, ev: Record<string, unknown>) => sum + (Number(ev.overall_score) || 0), 0) / evalCount
      : 100;

    if (evalCount < 3 || avgScore >= 50) {
      return {
        success: false,
        skill_id: skillId,
        change_type: "none",
        new_version: Number(skill.version) || 1,
        improvements: [],
        previous_prompt: previousPrompt,
        new_prompt: previousPrompt,
        error: `Evolution not needed: ${evalCount} evaluations, avg score ${avgScore.toFixed(1)} (need >= 3 evals with avg < 50)`,
      };
    }

    // 4. Analyze patterns from evaluations
    const weaknessesMap = new Map<string, number>();
    const suggestions: string[] = [];

    for (const ev of evaluations) {
      // Track dimension-level weaknesses (scores < 50)
      const dims = ["relevance_score", "accuracy_score", "completeness_score", "clarity_score", "efficiency_score"] as const;
      for (const dim of dims) {
        const score = Number(ev[dim]) || 0;
        if (score < 50) {
          const label = dim.replace("_score", "");
          weaknessesMap.set(label, (weaknessesMap.get(label) || 0) + 1);
        }
      }

      // Collect improvement suggestions
      try {
        const parsed = typeof ev.improvement_suggestions === "string"
          ? JSON.parse(ev.improvement_suggestions)
          : ev.improvement_suggestions;
        if (Array.isArray(parsed)) {
          suggestions.push(...parsed.filter((s: string) => s.length > 0));
        }
      } catch { /* ignore */ }
    }

    const topWeaknesses = Array.from(weaknessesMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => `${name} (low in ${count} evaluations)`);

    const uniqueSuggestions = [...new Set(suggestions)].slice(0, 5);

    // 5. Use Ollama Gemma 4 to rewrite the prompt_template
    const provider = createOpenAI({
      apiKey: process.env.OLLAMA_CLOUD_KEY_1 || "ollama",
      baseURL: process.env.OLLAMA_BASE_URL || "https://ollama.com/v1",
    });
    const model = provider.chat("deepseek-v4-flash:cloud");

    const evolutionPrompt = `You are a skill optimization expert. Your task is to improve a skill's prompt template based on evaluation feedback.

## Current Skill
- Name: ${skill.display_name || skill.name}
- Category: ${skill.category}
- Description: ${skill.description || ""}
- Current Performance: avg score ${avgScore.toFixed(1)} / 100 across ${evalCount} evaluations

## Current Prompt Template
\`\`\`
${previousPrompt}
\`\`\`

## Identified Weaknesses
${topWeaknesses.length > 0 ? topWeaknesses.map((w) => `- ${w}`).join("\n") : "- No specific dimension weaknesses identified"}

## Improvement Suggestions from Evaluators
${uniqueSuggestions.length > 0 ? uniqueSuggestions.map((s) => `- ${s}`).join("\n") : "- No specific suggestions available"}

## Instructions
Rewrite the prompt template to address the identified weaknesses. Rules:
1. Keep the core intent and domain of the skill intact
2. Add specific instructions to address the weak dimensions
3. Include guardrails to prevent common failure modes
4. Make the prompt more structured and precise
5. Keep the prompt to a reasonable length (do not bloat it)
6. MUST include keywords related to: ${skill.category}, ${skill.name}

Return ONLY the improved prompt template text — no explanation, no markdown fences, no code blocks. Just the prompt text itself.`;

    let newPrompt = "";
    try {
      const llmResult = await generateText({
        model,
        prompt: evolutionPrompt,
        maxOutputTokens: 262144,
        temperature: 0.4,
        abortSignal: AbortSignal.timeout(60000),
      });

      newPrompt = llmResult.text.trim();
      // Strip markdown fences if present
      if (newPrompt.startsWith("```")) {
        newPrompt = newPrompt.replace(/^```(?:prompt|text|markdown)?\s*\n?/, "").replace(/\n?```\s*$/, "");
      }
    } catch (llmError) {
      logger.error("skill-evolution", "LLM call failed", {
        skillId,
        error: llmError instanceof Error ? llmError.message : String(llmError),
      });
      return {
        success: false,
        skill_id: skillId,
        change_type: "none",
        new_version: Number(skill.version) || 1,
        improvements: [],
        previous_prompt: previousPrompt,
        new_prompt: previousPrompt,
        error: `LLM call failed: ${llmError instanceof Error ? llmError.message : "Unknown error"}`,
      };
    }

    // 6. Validate the new prompt: must be > 50 chars, must contain domain keywords
    if (newPrompt.length <= 50) {
      return {
        success: false,
        skill_id: skillId,
        change_type: "none",
        new_version: Number(skill.version) || 1,
        improvements: [],
        previous_prompt: previousPrompt,
        new_prompt: previousPrompt,
        error: "Generated prompt is too short (< 50 characters). Evolution aborted.",
      };
    }

    const coreKeywords = [
      skill.category,
      skill.name,
      ...(skill.description || "").split(/\s+/).filter((w: string) => w.length > 4).slice(0, 5),
    ].map((k: string) => k.toLowerCase());
    const promptLower = newPrompt.toLowerCase();
    const hasKeywords = coreKeywords.some((kw) => promptLower.includes(kw));

    if (!hasKeywords) {
      return {
        success: false,
        skill_id: skillId,
        change_type: "none",
        new_version: Number(skill.version) || 1,
        improvements: [],
        previous_prompt: previousPrompt,
        new_prompt: previousPrompt,
        error: "Generated prompt doesn't contain relevant domain keywords. Evolution aborted.",
      };
    }

    // 7. Save previous state to skill_evolution table
    const previousVersion = Number(skill.version) || 1;
    const newVersion = previousVersion + 1;

    const previousState = {
      version: previousVersion,
      prompt_template: previousPrompt,
      performance_score: Number(skill.performance_score) || 0,
      avg_evaluation_score: avgScore,
    };

    const newState = {
      version: newVersion,
      prompt_template: newPrompt,
      performance_score: null,
      evolution_reason: `Auto-evolved: avg score ${avgScore.toFixed(1)}/100 across ${evalCount} evals`,
    };

    await pool.query(
      `INSERT INTO skill_evolution (skill_id, change_type, previous_state, new_state, change_reason, trigger_agent_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING id`,
      [
        skillId,
        "auto_improvement",
        JSON.stringify(previousState),
        JSON.stringify(newState),
        `Auto-evolved: avg score ${avgScore.toFixed(1)}/100 across ${evalCount} evals. Weaknesses: ${topWeaknesses.join("; ")}`,
        triggerAgentId || "system",
      ]
    );

    // 8. Update the skill via PUT to /api/skills/[id]
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const bypassHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (process.env.VERCEL_PROTECTION_BYPASS) {
      bypassHeaders["x-vercel-protection-bypass"] = process.env.VERCEL_PROTECTION_BYPASS;
    }
    const updateRes = await fetch(`${baseUrl}/api/skills/${skillId}`, {
      method: "PUT",
      headers: bypassHeaders,
      body: JSON.stringify({ prompt_template: newPrompt }),
      signal: AbortSignal.timeout(15000),
    });

    if (!updateRes.ok) {
      const updateErr = await updateRes.text().catch(() => "Unknown error");
      return {
        success: false,
        skill_id: skillId,
        change_type: "auto_improvement",
        new_version: newVersion,
        improvements: topWeaknesses,
        previous_prompt: previousPrompt,
        new_prompt: newPrompt,
        error: `Failed to update skill: ${updateErr}`,
      };
    }

    const improvements = [
      ...topWeaknesses.map((w) => `Addressed weakness: ${w}`),
      ...uniqueSuggestions.slice(0, 3).map((s) => `Applied suggestion: ${s}`),
    ];

    return {
      success: true,
      skill_id: skillId,
      change_type: "auto_improvement",
      new_version: newVersion,
      improvements,
      previous_prompt: previousPrompt,
      new_prompt: newPrompt,
    };
  } catch (error) {
    logger.error("skill-evolution", "evolveSkill error", {
      skillId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      skill_id: skillId,
      change_type: "none",
      new_version: 0,
      improvements: [],
      previous_prompt: "",
      new_prompt: "",
      error: error instanceof Error ? error.message : "Evolution failed",
    };
  }
  // NOTE: No pool.end() — shared pool persists
}
