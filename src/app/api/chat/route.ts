// ---------------------------------------------------------------------------
// Chat API Route — Streaming LLM responses with tool calling (AI SDK v6)
// ---------------------------------------------------------------------------

import { streamText, stepCountIs, convertToModelMessages } from "ai";
import type { UIMessage } from "ai";
import { getAgent, getProvider, updateAgentStatus } from "@/lib/agents";
import { allTools } from "@/lib/tools";

export const maxDuration = 60;

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
          .map((p) => p.text)
          .join("")
      : null;

    // Update agent status
    updateAgentStatus(id, {
      status: "busy",
      currentTask: lastContent?.slice(0, 100) || null,
      lastActivity: new Date().toISOString(),
    });

    // Get the model
    const model = getProvider(agent);

    // Convert UI messages to model-compatible format
    const modelMessages = await convertToModelMessages(messages);

    const result = streamText({
      model,
      system: agent.systemPrompt,
      messages: modelMessages,
      tools: agentTools,
      stopWhen: stepCountIs(5),
      onFinish: ({ steps }) => {
        const completedSteps = steps.length;
        updateAgentStatus(id, {
          status: "idle",
          currentTask: null,
          lastActivity: new Date().toISOString(),
          tasksCompleted: completedSteps,
        });
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("Chat API error:", error);

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
