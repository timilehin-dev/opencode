// ---------------------------------------------------------------------------
// API — Proactive Notifications
// POST /api/notifications/proactive — send, mark_read, mark_all_read
// GET  /api/notifications/proactive — unread, recent, count
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import {
  sendProactiveNotification,
  getUnreadNotifications,
  getRecentNotifications,
  markNotificationRead,
  markAllRead,
  getNotificationCount,
} from "@/lib/proactive-notifications";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "unread";
  const limit = parseInt(searchParams.get("limit") || "20", 10);

  try {
    switch (action) {
      case "unread":
        return NextResponse.json({ success: true, data: await getUnreadNotifications(limit) });

      case "recent":
        return NextResponse.json({ success: true, data: await getRecentNotifications(limit) });

      case "count":
        return NextResponse.json({ success: true, count: await getNotificationCount() });

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error("[API] Proactive notifications GET error:", error);
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
      case "send": {
        const { agentId, agentName, type, title, body: bodyText, priority, actionUrl, actionLabel, metadata } = body as {
          agentId?: string;
          agentName?: string;
          type?: string;
          title?: string;
          body?: string;
          priority?: string;
          actionUrl?: string;
          actionLabel?: string;
          metadata?: Record<string, unknown>;
        };

        if (!agentId || !agentName || !type || !title) {
          return NextResponse.json(
            { error: "Missing required fields: agentId, agentName, type, title" },
            { status: 400 },
          );
        }

        const validTypes = ["info", "alert", "task_update", "routine_result", "handoff", "reminder", "insight"];
        if (!validTypes.includes(type)) {
          return NextResponse.json({ error: `Invalid type: ${type}` }, { status: 400 });
        }

        const validPriorities = ["low", "normal", "high", "urgent"];
        const prio = validPriorities.includes(priority || "") ? priority : "normal";

        const notification = await sendProactiveNotification({
          agentId,
          agentName,
          type: type as "info" | "alert" | "task_update" | "routine_result" | "handoff" | "reminder" | "insight",
          title,
          body: bodyText || "",
          priority: prio as "low" | "normal" | "high" | "urgent",
          actionUrl,
          actionLabel,
          metadata,
        });

        return NextResponse.json({ success: true, data: notification });
      }

      case "mark_read": {
        const { id } = body as { id?: string };
        if (!id) {
          return NextResponse.json({ error: "Missing id" }, { status: 400 });
        }

        const ok = await markNotificationRead(id);
        return NextResponse.json({ success: ok });
      }

      case "mark_all_read": {
        const count = await markAllRead();
        return NextResponse.json({ success: true, marked: count });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}. Use send, mark_read, or mark_all_read.` },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error("[API] Proactive notifications POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
