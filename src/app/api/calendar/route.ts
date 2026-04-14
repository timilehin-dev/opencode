import { NextRequest, NextResponse } from "next/server";
import {
  listCalendars,
  createEvent,
  deleteEvent,
  getAccountId,
} from "@/lib/composio";

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
      case "calendars": {
        const accountId = getAccountId("googlecalendar");
        if (!accountId) {
          return err("Google Calendar not connected. Please connect it from the Composio dashboard.", 400);
        }
        const calendars = await listCalendars(accountId);
        return ok(calendars);
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
    const accountId = getAccountId("googlecalendar");
    if (!accountId) {
      return err("Google Calendar not connected. Please connect it from the Composio dashboard.", 400);
    }

    const body = await req.json();

    switch (action) {
      case "createEvent": {
        const {
          summary,
          start_datetime,
          event_duration_hour,
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
          event_duration_hour?: number;
          event_duration_minutes?: number;
          location?: string;
          description?: string;
          attendees?: string[];
          calendar_id?: string;
          create_meeting_room?: boolean;
          timezone?: string;
        };

        if (!start_datetime) return err("Missing 'start_datetime'", 400);

        const event = await createEvent(
          {
            summary,
            start_datetime,
            event_duration_hour,
            event_duration_minutes,
            location,
            description,
            attendees,
            calendar_id,
            create_meeting_room,
            timezone,
          },
          accountId,
        );
        return ok(event);
      }

      case "deleteEvent": {
        const { eventId, calendarId } = body as {
          eventId: string;
          calendarId?: string;
        };
        if (!eventId) return err("Missing 'eventId'", 400);
        await deleteEvent(eventId, calendarId, accountId);
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
