// ---------------------------------------------------------------------------
// API — Self-Learning System
// POST /api/learning — record, detect_patterns, decay
// GET  /api/learning — insights, prompt_context, stats
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import {
  recordLearning,
  getAgentInsights,
  getAllInsights,
  getInsightsForPrompt,
  detectPatterns,
  decayInsights,
  getLearningStats,
} from "@/lib/self-learning";
import type { LearningInsight } from "@/lib/self-learning";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "stats";

  try {
    switch (action) {
      case "insights": {
        const agentIdParam = searchParams.get("agentId") || "";
        const type = searchParams.get("type") as LearningInsight["insightType"] | null;
        const limit = parseInt(searchParams.get("limit") || "50", 10);

        // If agentId is "all" or empty, fetch insights for all agents
        let data;
        if (!agentIdParam || agentIdParam === "all") {
          data = await getAllInsights(type || undefined, limit);
        } else {
          data = await getAgentInsights(agentIdParam, type || undefined, limit);
        }
        return NextResponse.json({ success: true, data });
      }

      case "prompt_context": {
        const agentId = searchParams.get("agentId") || "general";
        const maxInsights = parseInt(searchParams.get("max") || "10", 10);
        const context = await getInsightsForPrompt(agentId, maxInsights);
        return NextResponse.json({ success: true, context });
      }

      case "stats": {
        const stats = await getLearningStats();
        return NextResponse.json({ success: true, data: stats });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error("[API] Self-learning GET error:", error);
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
      case "record": {
        const { agentId, insightType, content, source, confidence } = body as {
          agentId?: string;
          insightType?: string;
          content?: string;
          source?: string;
          confidence?: number;
        };

        if (!agentId || !insightType || !content || !source) {
          return NextResponse.json(
            { error: "Missing required fields: agentId, insightType, content, source" },
            { status: 400 },
          );
        }

        const validTypes = ["preference", "correction", "pattern", "skill_gain", "workflow"];
        if (!validTypes.includes(insightType)) {
          return NextResponse.json({ error: `Invalid insightType: ${insightType}` }, { status: 400 });
        }

        const validSources = ["user_feedback", "correction", "pattern_detection", "routine_result"];
        if (!validSources.includes(source)) {
          return NextResponse.json({ error: `Invalid source: ${source}` }, { status: 400 });
        }

        const insight = await recordLearning({
          agentId,
          insightType: insightType as LearningInsight["insightType"],
          content,
          source: source as LearningInsight["source"],
          confidence,
        });

        return NextResponse.json({ success: true, data: insight });
      }

      case "detect_patterns": {
        const { agentId, conversations } = body as {
          agentId?: string;
          conversations?: Array<{ role: string; content: string }>;
        };

        // If no conversations provided, fetch recent ones from DB
        let effectiveConversations = conversations;
        if (!effectiveConversations || !Array.isArray(effectiveConversations) || effectiveConversations.length === 0) {
          try {
            const { query } = await import("@/lib/db");
            const effectiveAgentId = agentId || "general";
            const convResult = await query(
              `SELECT role, content FROM conversations
               WHERE agent_id = $1
               ORDER BY created_at DESC
               LIMIT 50`,
              [effectiveAgentId]
            );
            effectiveConversations = convResult.rows.map((r: { role: string; content: string }) => ({
              role: r.role === "assistant" ? "assistant" : "user",
              content: r.content,
            })).reverse(); // chronological order
          } catch {
            effectiveConversations = [];
          }
        }

        if (!effectiveConversations || effectiveConversations.length === 0) {
          return NextResponse.json({
            success: true,
            data: [],
            message: "No conversations available to analyze",
          });
        }

        const detected = await detectPatterns(agentId || "general", effectiveConversations.slice(-20));
        return NextResponse.json({ success: true, data: detected });
      }

      case "decay": {
        const count = await decayInsights();
        return NextResponse.json({ success: true, decayed: count });
      }

      case "delete": {
        const { insightId } = body as { insightId?: string };
        if (!insightId) {
          return NextResponse.json({ error: "Missing insightId" }, { status: 400 });
        }
        const { query } = await import("@/lib/db");
        const result = await query("DELETE FROM learning_insights WHERE id = $1 RETURNING id", [insightId]);
        return NextResponse.json({ success: true, deleted: (result.rowCount ?? 0) > 0 });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}. Use record, detect_patterns, or decay.` },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error("[API] Self-learning POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
