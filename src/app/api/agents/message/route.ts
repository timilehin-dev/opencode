// ---------------------------------------------------------------------------
// Inter-Agent Message Bus — POST /api/agents/message
//
// Enables agents to send async messages to each other.
// Messages are persisted in the a2a_messages Supabase table.
// Agents can poll their inbox via POST /api/agents with action="inbox".
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { getAllAgents } from "@/lib/agent/agents";
import { sendA2AMessage, getAgentA2AMessages } from "@/lib/communication/a2a";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body as { action?: string };

    // POST /api/agents/message?action=send
    if (action === "send") {
      const { fromAgent, toAgent, topic, payload, type } = body as {
        fromAgent?: string;
        toAgent?: string;
        topic?: string;
        payload?: Record<string, unknown>;
        type?: "request" | "response" | "broadcast" | "context_share";
      };

      if (!fromAgent || !toAgent || !topic) {
        return NextResponse.json(
          { success: false, error: "Missing fromAgent, toAgent, or topic" },
          { status: 400 },
        );
      }

      const validAgents = getAllAgents().map((a) => a.id);
      if (!validAgents.includes(fromAgent)) {
        return NextResponse.json(
          { success: false, error: `Invalid fromAgent: ${fromAgent}` },
          { status: 400 },
        );
      }
      if (!validAgents.includes(toAgent)) {
        return NextResponse.json(
          { success: false, error: `Invalid toAgent: ${toAgent}` },
          { status: 400 },
        );
      }

      const msg = await sendA2AMessage({
        fromAgent,
        toAgent,
        topic,
        payload: payload || {},
        type: type || "request",
      });

      if (!msg) {
        return NextResponse.json(
          { success: false, error: "Failed to send message — database unavailable" },
          { status: 503 },
        );
      }

      return NextResponse.json({ success: true, data: { delivered: true, messageId: msg.id, message: msg } });
    }

    // POST /api/agents/message?action=inbox&agentId=mail
    if (action === "inbox") {
      const { agentId, limit } = body as { agentId?: string; limit?: number };

      if (!agentId) {
        return NextResponse.json(
          { success: false, error: "Missing agentId" },
          { status: 400 },
        );
      }

      const messages = await getAgentA2AMessages(agentId, limit || 50);
      return NextResponse.json({ success: true, data: { messages, count: messages.length } });
    }

    return NextResponse.json(
      { success: false, error: `Unknown action: ${action}. Use 'send' or 'inbox'.` },
      { status: 400 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
