// ---------------------------------------------------------------------------
// Agents API Route — Agent management and status
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import {
  getAllAgents,
  getAgentStatus,
  getAllAgentStatuses,
  updateAgentStatus,
} from "@/lib/agents";
import {
  sendA2AMessage,
  getAgentA2AMessages,
} from "@/lib/a2a";
import { createTask } from "@/lib/task-queue";

function ok(data: unknown) {
  return NextResponse.json({ success: true, data });
}

function err(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

// ---------------------------------------------------------------------------
// GET: Return all agents with configs and status
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const agents = getAllAgents();
    const statuses = getAllAgentStatuses();

    const data = agents.map((agent) => ({
      ...agent,
      status: getAgentStatus(agent.id),
    }));

    return ok(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return err(message);
  }
}

// ---------------------------------------------------------------------------
// POST: Actions — status, dispatch
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body as { action?: string };

    switch (action) {
      case "status": {
        const statuses = getAllAgentStatuses();
        return ok(statuses);
      }

      case "dispatch": {
        const { agentId, task, instruction } = body as {
          agentId?: string;
          task?: string;
          instruction?: string;
        };

        if (!agentId || !task) {
          return err("Missing agentId or task", 400);
        }

        const agent = getAllAgents().find((a) => a.id === agentId);
        if (!agent) {
          return err(`Unknown agent: ${agentId}`, 400);
        }

        // Log the dispatch (for now, just update status)
        updateAgentStatus(agentId, {
          status: "busy",
          currentTask: task,
          lastActivity: new Date().toISOString(),
        });

        // Actually enqueue the task via the task-queue system
        try {
          const taskId = await createTask({
            agent_id: agentId,
            task,
            context: instruction || "Quick task dispatched from dashboard",
            trigger_type: "user_dispatch",
            trigger_source: "dashboard",
            priority: "medium",
          });
          console.log(`[Agents API] Task enqueued: id=${taskId}`);
        } catch (enqueueErr) {
          console.error("[Agents API] Failed to enqueue task:", enqueueErr);
        }

        return ok({
          dispatched: true,
          agentId,
          task,
          instruction,
          message: `Task dispatched to ${agent.name}. ${agent.emoji}`,
        });
      }

      case "message": {
        // Inter-Agent Message Bus: send async message to another agent
        const { fromAgent, toAgent, topic, payload, type } = body as {
          fromAgent?: string;
          toAgent?: string;
          topic?: string;
          payload?: Record<string, unknown>;
          type?: "request" | "response" | "broadcast" | "context_share";
        };

        if (!fromAgent || !toAgent || !topic) {
          return err("Missing fromAgent, toAgent, or topic", 400);
        }

        const validAgents = getAllAgents().map(a => a.id);
        if (!validAgents.includes(fromAgent)) {
          return err(`Invalid fromAgent: ${fromAgent}`, 400);
        }
        if (!validAgents.includes(toAgent)) {
          return err(`Invalid toAgent: ${toAgent}`, 400);
        }

        const msg = await sendA2AMessage({
          fromAgent,
          toAgent,
          topic,
          payload: payload || {},
          type: type || "request",
        });

        if (!msg) {
          return err("Failed to send message — database unavailable", 503);
        }

        return ok({ delivered: true, messageId: msg.id, message: msg });
      }

      case "inbox": {
        // Get messages for a specific agent
        const { agentId, limit } = body as { agentId?: string; limit?: number };

        if (!agentId) {
          return err("Missing agentId", 400);
        }

        const messages = await getAgentA2AMessages(agentId, limit || 50);
        return ok({ messages, count: messages.length });
      }

      default:
        return err(`Unknown action: ${action}`, 400);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return err(message);
  }
}
