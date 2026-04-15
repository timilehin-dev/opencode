// ---------------------------------------------------------------------------
// Chat API Route — Streaming LLM responses with tool calling (AI SDK v6)
// ---------------------------------------------------------------------------
//
// CRITICAL FIXES:
// 1. Use provider.chat() not provider() — the default uses OpenAI Responses API
//    which aihubmix/ollama don't support. .chat() uses Chat Completions format.
// 2. Manually convert UIMessage[] → ModelMessage[] because some providers reject
//    structured content arrays. We ensure content is always a simple string.
// 3. Use correct AI SDK v6 types: ModelMessage, ToolCallPart, ToolResultPart.
// ---------------------------------------------------------------------------

import { streamText, stepCountIs } from "ai";
import type { ModelMessage, ToolCallPart, ToolResultPart, TextPart } from "ai";
import type { UIMessage } from "ai";
import { getAgent, getProvider, updateAgentStatus } from "@/lib/agents";
import { allTools } from "@/lib/tools";

export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Manual UIMessage → ModelMessage conversion (provider-safe)
// ---------------------------------------------------------------------------

/**
 * Converts AI SDK v6 UIMessage[] (with `parts`) into ModelMessage[] with
 * simple string content that all OpenAI-compatible providers accept.
 *
 * We do NOT use convertToModelMessages() because it may produce formats
 * incompatible with some providers.
 */
function toModelMessages(uiMessages: UIMessage[]): ModelMessage[] {
  const result: ModelMessage[] = [];

  for (const msg of uiMessages) {
    if (!msg.parts || msg.parts.length === 0) continue;

    const parts = msg.parts as Array<Record<string, unknown>>;

    // --- Extract text content ---
    const textContent = parts
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text as string)
      .join("")
      .trim();

    // --- Extract tool invocations ---
    const toolInvocations = parts.filter((p) =>
      p.type === "tool-invocation" ||
      (typeof p.type === "string" && p.type.startsWith("tool-"))
    );

    // Categorize: tool calls vs tool results
    const toolCalls: ToolCallPart[] = [];
    const toolResults: ToolResultPart[] = [];

    for (const inv of toolInvocations) {
      const toolName = String(inv.toolName || "unknown");
      const toolCallId = String(inv.toolCallId || `tc-${Math.random().toString(36).slice(2, 8)}`);
      const input = (inv.args ?? inv.input ?? {}) as Record<string, unknown>;
      const state = String(inv.state || "");
      const output = inv.result ?? inv.output;

      if (state === "result") {
        // Tool result
        toolResults.push({
          type: "tool-result",
          toolCallId,
          toolName,
          output: {
            type: "text" as const,
            value: typeof output === "string" ? output : JSON.stringify(output ?? { success: false, error: "No result" }),
          },
        });
      } else {
        // Tool call (pending or in-progress)
        toolCalls.push({
          type: "tool-call",
          toolCallId,
          toolName,
          input,
        });
      }
    }

    // Build messages by role
    if (msg.role === "user") {
      // User message with text content
      if (textContent) {
        result.push({ role: "user" as const, content: textContent });
      }
      // Tool results can also appear in user messages
      if (toolResults.length > 0) {
        result.push({ role: "tool" as const, content: toolResults });
      }
    } else if (msg.role === "assistant") {
      // Assistant message can have text + tool calls
      const contentParts: Array<TextPart | ToolCallPart> = [];
      if (textContent) {
        contentParts.push({ type: "text", text: textContent });
      }
      contentParts.push(...toolCalls);

      if (contentParts.length > 0) {
        result.push({ role: "assistant" as const, content: contentParts });
      }

      // Tool results following the assistant message
      if (toolResults.length > 0) {
        result.push({ role: "tool" as const, content: toolResults });
      }
    }
    // Skip "system" role — handled separately via system prompt
  }

  return result;
}

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
          .map((p) => (p as TextPart).text)
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

    // Convert UI messages to model-compatible format (provider-safe)
    const modelMessages = toModelMessages(messages);

    console.log(`[Chat] Agent: ${agent.name} (${agent.provider}/${agent.model})`);
    console.log(`[Chat] Messages: ${modelMessages.length}`);
    if (modelMessages.length > 0) {
      const last = modelMessages[modelMessages.length - 1];
      console.log(`[Chat] Last role: ${last.role}, content type: ${typeof last.content}`);
    } else {
      console.log(`[Chat] WARNING: No messages! Raw:`, JSON.stringify(
        messages.map(m => ({ role: m.role, partsCount: m.parts?.length, types: m.parts?.map(p => p.type) }))
      ));
    }

    // Safety check
    if (modelMessages.length === 0) {
      return new Response(
        JSON.stringify({ error: "No valid messages to send. Please try again." }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const result = streamText({
      model,
      system: agent.systemPrompt,
      messages: modelMessages,
      tools: agentTools,
      stopWhen: stepCountIs(5),
      onFinish: ({ steps }) => {
        console.log(`[Chat] ${agent.name} done. Steps: ${steps.length}`);
        updateAgentStatus(id, {
          status: "idle",
          currentTask: null,
          lastActivity: new Date().toISOString(),
          tasksCompleted: steps.length,
        });
      },
      onError: ({ error }) => {
        console.error(`[Chat] ${agent.name} error:`, error);
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
