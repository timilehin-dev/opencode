// ---------------------------------------------------------------------------
// Calendar Tools
// ---------------------------------------------------------------------------
import { z, tool, zodSchema, safeJson, safeParseRes, googleFetch,
  gCalListCalendars, gCalListEvents, gCalCreateEvent, gCalDeleteEvent, gCalUpdateEvent } from "./shared";

// ---------------------------------------------------------------------------
// Calendar Tools
// ---------------------------------------------------------------------------

export const calendarListTool = tool({
  description: "List all Google Calendars available to the user.",
  inputSchema: zodSchema(z.object({})),
  execute: safeJson(async () => {
    return await gCalListCalendars();
  }),
});

export const calendarEventsTool = tool({
  description: "List events from a Google Calendar. Returns upcoming events by default.",
  inputSchema: zodSchema(z.object({
    calendarId: z.string().optional().describe("Calendar ID (default: 'primary')"),
    timeMin: z.string().optional().describe("Start of time range (ISO 8601, e.g., '2024-01-01T00:00:00Z')"),
    timeMax: z.string().optional().describe("End of time range (ISO 8601)"),
    maxResults: z.number().optional().describe("Max events to return (default: 25)"),
  })),
  execute: safeJson(async ({ calendarId, timeMin, timeMax, maxResults }) => {
    return await gCalListEvents(calendarId || "primary", timeMin, timeMax, maxResults || 25);
  }),
});

export const calendarCreateTool = tool({
  description: "Create a new Google Calendar event. Supports adding attendees who will receive email invitations. Always use this for scheduling meetings with others.",
  inputSchema: zodSchema(z.object({
    summary: z.string().optional().describe("Event title"),
    calendarId: z.string().optional().describe("Calendar ID (default: 'primary')"),
    start: z.string().describe("Start time in ISO 8601 or date string (e.g., '2024-01-01T09:00:00' or '2024-01-01')"),
    end: z.string().describe("End time in ISO 8601 or date string"),
    location: z.string().optional().describe("Event location"),
    description: z.string().optional().describe("Event description"),
    attendees: z.array(z.object({ email: z.string() })).optional().describe("List of attendee email addresses — they WILL receive calendar invitations"),
    addMeetLink: z.boolean().optional().describe("If true, automatically adds a Google Meet video conference link to the event"),
  })),
  execute: safeJson(async ({ summary, calendarId, start, end, location, description, attendees, addMeetLink }) => {
    const isDateTime = start.includes("T");
    return await gCalCreateEvent(calendarId || "primary", {
      summary,
      start: isDateTime
        ? { dateTime: start, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
        : { date: start },
      end: isDateTime
        ? { dateTime: end, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
        : { date: end },
      location,
      description,
      attendees,
      conferenceData: addMeetLink ? { createRequest: { requestId: `klaw-meet-${Date.now()}` } } : undefined,
    });
  }),
});

export const calendarDeleteTool = tool({
  description: "Delete a Google Calendar event by its ID.",
  inputSchema: zodSchema(z.object({
    calendarId: z.string().optional().describe("Calendar ID (default: 'primary')"),
    eventId: z.string().describe("The event ID to delete"),
  })),
  execute: safeJson(async ({ calendarId, eventId }) => {
    await gCalDeleteEvent(calendarId || "primary", eventId);
    return { deleted: true, eventId };
  }),
});

export const calendarUpdateTool = tool({
  description: "Update an existing Google Calendar event. Change the title, time, location, description, or attendees. Use this to reschedule meetings, update event details, or add attendees to an existing event.",
  inputSchema: zodSchema(z.object({
    calendarId: z.string().optional().describe("Calendar ID (default: 'primary')"),
    eventId: z.string().describe("The event ID to update"),
    summary: z.string().optional().describe("New event title"),
    start: z.string().optional().describe("New start time in ISO 8601 format (e.g., '2025-05-01T09:00:00') or all-day date (e.g., '2025-05-01')"),
    end: z.string().optional().describe("New end time in ISO 8601 format or all-day date"),
    location: z.string().optional().describe("New location for the event"),
    description: z.string().optional().describe("New description for the event"),
    addAttendees: z.array(z.string()).optional().describe("Email addresses of attendees to ADD to the event"),
  })),
  execute: safeJson(async ({ calendarId, eventId, summary, start, end, location, description, addAttendees }) => {
    const event: Record<string, unknown> = {};
    if (summary) event.summary = summary;
    if (start) event.start = { dateTime: start, timeZone: "Africa/Lagos" };
    if (end) event.end = { dateTime: end, timeZone: "Africa/Lagos" };
    if (location) event.location = location;
    if (description) event.description = description;
    if (addAttendees?.length) event.attendees = addAttendees.map(email => ({ email }));

    const updated = await gCalUpdateEvent(calendarId || "primary", eventId, event as Parameters<typeof gCalUpdateEvent>[2]);
    return {
      updated: true,
      eventId,
      summary: updated.summary,
      start: updated.start,
      end: updated.end,
      location: updated.location,
      htmlLink: updated.htmlLink,
    };
  }),
});

// ---------------------------------------------------------------------------
// Calendar FreeBusy Tool
// ---------------------------------------------------------------------------

export const calendarFreebusyTool = tool({
  description: "Check free/busy availability slots for one or more attendees. Returns busy periods for each attendee within the specified time range.",
  inputSchema: zodSchema(z.object({
    attendeeEmails: z.array(z.string()).describe("List of attendee email addresses to check availability for"),
    timeMin: z.string().describe("Start of time range (ISO 8601, e.g., '2024-01-01T00:00:00Z')"),
    timeMax: z.string().describe("End of time range (ISO 8601)"),
  })),
  execute: safeJson(async ({ attendeeEmails, timeMin, timeMax }) => {
    const res = await googleFetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      body: JSON.stringify({
        timeMin,
        timeMax,
        items: attendeeEmails.map(e => ({ id: e })),
      }),
    });
    return safeParseRes(res);
  }),
});

