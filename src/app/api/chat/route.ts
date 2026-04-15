// ---------------------------------------------------------------------------
// Chat API Route — Streaming LLM responses with tool calling (AI SDK v6)
// ---------------------------------------------------------------------------
//
// KEY ARCHITECTURE DECISIONS:
// 1. Use provider.chat() — NOT provider() — because provider() uses OpenAI's
//    Responses API which aihubmix/ollama don't support. .chat() = Chat Completions.
// 2. Use convertToModelMessages() from AI SDK v6 — it correctly pairs
//    ToolCallParts with ToolResultParts across multi-turn conversations.
//    Custom converters miss this pairing and cause "Tool result is missing" errors.
// ---------------------------------------------------------------------------

import { streamText, stepCountIs, convertToModelMessages } from "ai";
import type { UIMessage } from "ai";
import { getAgent, getProvider, updateAgentStatus } from "@/lib/agents";
import { allTools } from "@/lib/tools";

export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages, agentId } = body as {
      messages: UIMessage[];
      agentId?: string;
    };

    const id = agentId || "general";
    const agent = getAgent(id);

    if (!agent) {
      return new Response(
        JSON.stringify({ error: `Unknown agent: ${id}` }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Build subset of tools for this agent
    const agentTools: Record<string, typeof allTools.gmail_send> = {};
    for (const toolId of agent.tools) {
      if (allTools[toolId]) {
        agentTools[toolId] = allTools[toolId];
      }
    }

    // Extract last user message for status display
    const lastMsg = messages[messages.length - 1];
    const lastContent = lastMsg?.parts
      ? lastMsg.parts
          .filter((p) => p.type === "text")
          .map((p) => p.text as string)
          .join("")
      : null;

    // Update agent status
    updateAgentStatus(id, {
      status: "busy",
      currentTask: lastContent?.slice(0, 100) || null,
      lastActivity: new Date().toISOString(),
    });

    // Get the model (with key rotation) — uses .chat() for Chat Completions API
    const model = getProvider(agent);

    // Convert UI messages to model messages using the SDK's built-in converter.
    // This correctly pairs tool calls with tool results across turns, preventing
    // "Tool result is missing for tool call" errors on follow-up messages.
    const modelMessages = await convertToModelMessages(messages);

    // Note: Analytics tracking is now client-side (localStorage).
    // Server-side trackEvent removed — it required SQLite which doesn't work on Vercel serverless.

    console.log(`[Chat] Agent: ${agent.name} (${agent.provider}/${agent.model})`);
    for (let i = 0; i < modelMessages.length; i++) {
      const m = modelMessages[i];
      const contentStr = typeof m.content === "string"
        ? m.content.slice(0, 60)
        : Array.isArray(m.content)
          ? `[${m.content.length} parts: ${m.content.map((p) => p.type).join(",")}]`
          : String(m.content).slice(0, 60);
      console.log(`[Chat]   [${i}] ${m.role}: ${contentStr}`);
    }

    // Safety check
    if (modelMessages.length === 0) {
      return new Response(
        JSON.stringify({ error: "No valid messages to send. Please try again." }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Reinforce identity in system prompt for specialist agents.
    // Ollama/gemma4 models sometimes ignore system prompts, so we inject
    // the agent identity as a strong prefix at the very top.
    const systemPrompt =
      id !== "general"
        ? `[IDENTITY OVERRIDE] You are "${agent.name}" (${agent.role}). You are NOT Claw General, NOT a general assistant, NOT any other agent. You MUST call yourself "${agent.name}" at all times. You have exactly these tools: ${agent.tools.join(", ")}. Nothing else.\n\n${agent.systemPrompt}`
        : agent.systemPrompt;

    const result = streamText({
      model,
      system: systemPrompt,
      messages: modelMessages,
      tools: agentTools,
      stopWhen: stepCountIs(5),
      onFinish: ({ steps }) => {
        console.log(`[Chat] ${agent.name} done. Steps: ${steps.length}`);
        // Tool call tracking is handled client-side via analytics-store
        updateAgentStatus(id, {
          status: "idle",
          currentTask: null,
          lastActivity: new Date().toISOString(),
          tasksCompleted: steps.length,
        });
      },
      onError: ({ error }) => {
        console.error(`[Chat] ${agent.name} stream error:`, error);
        updateAgentStatus(id, {
          status: "error",
          currentTask: null,
          lastActivity: new Date().toISOString(),
        });
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[Chat] API error:", error);

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
