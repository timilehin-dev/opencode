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

        // Simulate task completion after a brief delay (placeholder)
        setTimeout(() => {
          updateAgentStatus(agentId, {
            status: "idle",
            currentTask: null,
            lastActivity: new Date().toISOString(),
          });
        }, 5000);

        return ok({
          dispatched: true,
          agentId,
          task,
          instruction,
          message: `Task dispatched to ${agent.name}. ${agent.emoji}`,
        });
      }

      default:
        return err(`Unknown action: ${action}`, 400);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return err(message);
  }
}
