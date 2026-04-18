// ---------------------------------------------------------------------------
// API — Proactive Notifications Polling
// GET /api/notifications/proactive/poll?since=<ISO timestamp>
//
// Returns notifications created after the given timestamp.
// Times out after 30s if no new notifications exist (returns empty array).
// Client can poll this endpoint periodically for real-time updates.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getNotificationsSince } from "@/lib/proactive-notifications";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const since = searchParams.get("since");

  if (!since) {
    return NextResponse.json({ error: "Missing 'since' query parameter" }, { status: 400 });
  }

  try {
    const sinceDate = new Date(since);
    if (isNaN(sinceDate.getTime())) {
      return NextResponse.json({ error: "Invalid 'since' timestamp" }, { status: 400 });
    }

    // Long-poll: check for new notifications, retry every 3s up to 30s
    const startTime = Date.now();
    const POLL_INTERVAL = 3000;
    const MAX_POLL_DURATION = 30000;
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    while (Date.now() - startTime < MAX_POLL_DURATION) {
      const notifications = await getNotificationsSince(since, limit);
      if (notifications.length > 0) {
        return NextResponse.json({ success: true, data: notifications, since });
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
    }

    // Timeout — return empty array
    return NextResponse.json({ success: true, data: [], since });
  } catch (error) {
    console.error("[API] Proactive notifications poll error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
