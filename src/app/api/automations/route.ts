// POST/GET/PUT/DELETE /api/automations — CRUD for automation rules
import { NextRequest, NextResponse } from "next/server";
import {
  createAutomation,
  getAllAutomations,
  getAutomation,
  updateAutomation,
  deleteAutomation,
  logAutomationRun,
  getAutomationLogs,
} from "@/lib/db";

// GET — List all automations (optionally filter: ?enabled=true)
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const automationId = url.searchParams.get("id");
    const logs = url.searchParams.get("logs") === "true";

    if (logs) {
      const logData = getAutomationLogs(automationId ? parseInt(automationId, 10) : undefined);
      return NextResponse.json({ success: true, data: logData });
    }

    if (automationId) {
      const auto = getAutomation(parseInt(automationId, 10));
      if (!auto) {
        return NextResponse.json({ success: false, error: "Automation not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: auto });
    }

    const automations = getAllAutomations();
    return NextResponse.json({ success: true, data: automations });
  } catch (error) {
    console.error("[Automations] GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch automations" }, { status: 500 });
  }
}

// POST — Create a new automation
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, triggerType, triggerConfig, actionType, actionConfig, agentId } = body;

    if (!name || !triggerType || !actionType) {
      return NextResponse.json(
        { success: false, error: "name, triggerType, and actionType are required" },
        { status: 400 },
      );
    }

    const automation = createAutomation({
      name,
      description,
      triggerType,
      triggerConfig: triggerConfig || {},
      actionType,
      actionConfig: actionConfig || {},
      agentId,
    });

    return NextResponse.json({ success: true, data: automation }, { status: 201 });
  } catch (error) {
    console.error("[Automations] POST error:", error);
    return NextResponse.json({ success: false, error: "Failed to create automation" }, { status: 500 });
  }
}

// PUT — Update an automation
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "id is required" }, { status: 400 });
    }

    const updated = updateAutomation(parseInt(id, 10), data);
    if (!updated) {
      return NextResponse.json({ success: false, error: "Automation not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[Automations] PUT error:", error);
    return NextResponse.json({ success: false, error: "Failed to update automation" }, { status: 500 });
  }
}

// DELETE — Remove an automation
export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "id is required" }, { status: 400 });
    }

    const deleted = deleteAutomation(parseInt(id, 10));
    if (!deleted) {
      return NextResponse.json({ success: false, error: "Automation not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Automations] DELETE error:", error);
    return NextResponse.json({ success: false, error: "Failed to delete automation" }, { status: 500 });
  }
}
