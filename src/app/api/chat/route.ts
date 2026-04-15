// ---------------------------------------------------------------------------
// Chat API Route — Streaming LLM responses with tool calling
// ---------------------------------------------------------------------------

import { streamText, stepCountIs } from "ai";
import { getAgent, getProvider, updateAgentStatus } from "@/lib/agents";
import { allTools } from "@/lib/tools";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages, agentId } = body as {
      messages: { role: string; content: string }[];
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

    // Update agent status
    updateAgentStatus(id, {
      status: "busy",
      currentTask: messages[messages.length - 1]?.content?.slice(0, 100) || null,
      lastActivity: new Date().toISOString(),
    });

    // Get the model
    const model = getProvider(agent);

    const result = streamText({
      model,
      system: agent.systemPrompt,
      messages: messages.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      })),
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

    // Update agent status to error
    try {
      const body = await req.json().catch(() => ({}));
      const agentId = (body as { agentId?: string })?.agentId || "general";
      updateAgentStatus(agentId, { status: "error", lastActivity: new Date().toISOString() });
    } catch {
      /* ignore status update failure */
    }

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
