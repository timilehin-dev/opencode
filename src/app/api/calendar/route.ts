import { NextRequest, NextResponse } from "next/server";
import {
  gCalListCalendars,
  gCalListEvents,
  gCalCreateEvent,
  gCalDeleteEvent,
  getAccessToken,
} from "@/lib/google";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function ok(data: unknown) {
  return NextResponse.json({ success: true, data });
}

function err(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const action = searchParams.get("action");

  try {
    switch (action) {
      case "status": {
        // Connection check — try to get a token
        try {
          await getAccessToken();
          return ok({ connected: true });
        } catch {
          return ok({ connected: false });
        }
      }

      case "calendars": {
        const calendars = await gCalListCalendars();
        return ok(calendars);
      }

      case "events": {
        const calendarId = searchParams.get("calendarId") || "primary";
        const timeMin = searchParams.get("timeMin") || undefined;
        const timeMax = searchParams.get("timeMax") || undefined;
        const maxResults = Number(searchParams.get("maxResults")) || 25;
        const events = await gCalListEvents(calendarId, timeMin, timeMax, maxResults);
        return ok(events);
      }

      default:
        return err(`Unknown action: ${action}`, 400);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return err(message);
  }
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const action = searchParams.get("action");

  try {
    const body = await req.json();

    switch (action) {
      case "createEvent": {
        const {
          summary,
          start_datetime,
          event_duration_minutes,
          location,
          description,
          attendees,
          calendar_id,
          create_meeting_room,
          timezone,
        } = body as {
          summary?: string;
          start_datetime: string;
          event_duration_minutes?: number;
          location?: string;
          description?: string;
          attendees?: string[];
          calendar_id?: string;
          create_meeting_room?: boolean;
          timezone?: string;
        };

        if (!start_datetime) return err("Missing 'start_datetime'", 400);

        const startDate = new Date(start_datetime);
        const durationMs = (event_duration_minutes || 60) * 60 * 1000;
        const endDate = new Date(startDate.getTime() + durationMs);
        const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

        const event = await gCalCreateEvent(
          calendar_id || "primary",
          {
            summary,
            start: { dateTime: startDate.toISOString(), timeZone: tz },
            end: { dateTime: endDate.toISOString(), timeZone: tz },
            location,
            description,
            attendees: attendees?.map((email) => ({ email })),
            ...(create_meeting_room
              ? {
                  conferenceData: {
                    createRequest: { requestId: `klaw-${Date.now()}` },
                  },
                }
              : {}),
          },
        );
        return ok(event);
      }

      case "deleteEvent": {
        const { eventId, calendarId } = body as {
          eventId: string;
          calendarId?: string;
        };
        if (!eventId) return err("Missing 'eventId'", 400);
        await gCalDeleteEvent(calendarId || "primary", eventId);
        return ok({ deleted: true });
      }

      default:
        return err(`Unknown action: ${action}`, 400);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return err(message);
  }
}
