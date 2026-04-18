"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  CalendarIcon,
  TrashIcon,
  Spinner,
  ExternalLinkIcon,
  MapPin,
} from "@/components/icons";
import { ConnectServiceCard } from "@/components/connect-service-card";
import { cn } from "@/lib/utils";
import type {
  CalendarEvent,
  CalendarInfo,
  CalendarTab,
  ServiceStatus,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

interface CalendarViewProps {
  serviceStatus: ServiceStatus | null;
}

const calTabs: { key: CalendarTab; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "create", label: "Create Event" },
  { key: "calendars", label: "Calendars" },
];

const EVENT_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-violet-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-teal-500",
];

function eventColor(summary: string): string {
  let hash = 0;
  for (let i = 0; i < summary.length; i++) {
    hash = summary.charCodeAt(i) + ((hash << 5) - hash);
  }
  return EVENT_COLORS[Math.abs(hash) % EVENT_COLORS.length];
}

function formatTime(dateStr?: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getDateKey(start: CalendarEvent["start"]): string | null {
  if (start.dateTime) {
    return new Date(start.dateTime).toDateString();
  }
  if (start.date) {
    return new Date(start.date + "T00:00:00").toDateString();
  }
  return null;
}

function formatEventDate(dateKey: string): string {
  const today = new Date();
  const todayKey = today.toDateString();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = tomorrow.toDateString();

  const eventDate = new Date(dateKey);

  if (dateKey === todayKey) {
    return `Today, ${eventDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }
  if (dateKey === tomorrowKey) {
    return `Tomorrow, ${eventDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }
  return eventDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function isAllDayEvent(event: CalendarEvent): boolean {
  return !!event.start.date && !event.start.dateTime;
}

function getTimeRange(event: CalendarEvent): string {
  if (isAllDayEvent(event)) return "All day";
  const start = formatTime(event.start.dateTime);
  const end = formatTime(event.end.dateTime);
  if (start && end) return `${start} - ${end}`;
  if (start) return start;
  return "";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CalendarView({ serviceStatus }: CalendarViewProps) {
  const [calTab, setCalTab] = useState<CalendarTab>("upcoming");
  const [calendars, setCalendars] = useState<CalendarInfo[]>([]);
  const [calEvents, setCalEvents] = useState<CalendarEvent[]>([]);
  // Create event form
  const [evtSummary, setEvtSummary] = useState("");
  const [evtStart, setEvtStart] = useState("");
  const [evtDuration, setEvtDuration] = useState("60");
  const [evtLocation, setEvtLocation] = useState("");
  const [evtDescription, setEvtDescription] = useState("");
  const [evtAttendees, setEvtAttendees] = useState("");
  const [evtMeet, setEvtMeet] = useState(false);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [evtSuccess, setEvtSuccess] = useState(false);
  const [evtError, setEvtError] = useState<string | null>(null);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // -----------------------------------------------------------------------
  // Data fetchers
  // -----------------------------------------------------------------------

  const fetchCalendars = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/calendar?action=calendars");
      const json = await res.json();
      if (json.success) {
        setCalendars(json.data);
      }
    } catch {
      /* silent */
    }
    setLoading(false);
  }, []);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const timeMin = new Date().toISOString();
      const res = await fetch(`/api/calendar?action=events&timeMin=${encodeURIComponent(timeMin)}&maxResults=50`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setCalEvents(json.data as CalendarEvent[]);
      }
    } catch {
      /* silent */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!serviceStatus?.googlecalendar.connected) return;
    const controller = new AbortController();
    (async () => {
      switch (calTab) {
        case "upcoming": await fetchEvents(); break;
        case "calendars": await fetchCalendars(); break;
      }
    })();
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calTab, serviceStatus]);

  // -----------------------------------------------------------------------
  // Group events by date
  // -----------------------------------------------------------------------

  const groupedEvents = useMemo(() => {
    const groups: { dateKey: string; label: string; events: CalendarEvent[] }[] = [];
    const seen = new Set<string>();

    for (const evt of calEvents) {
      const dateKey = getDateKey(evt.start);
      if (!dateKey || seen.has(dateKey)) continue;
      seen.add(dateKey);
      groups.push({
        dateKey,
        label: formatEventDate(dateKey),
        events: calEvents.filter((e) => getDateKey(e.start) === dateKey),
      });
    }

    // Sort by date
    groups.sort((a, b) => new Date(a.dateKey).getTime() - new Date(b.dateKey).getTime());
    return groups;
  }, [calEvents]);

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleCreateEvent = async () => {
    if (!evtStart) return;
    setCreatingEvent(true);
    setEvtSuccess(false);
    setEvtError(null);
    try {
      const attendeeList = evtAttendees.split(",").map((a) => a.trim()).filter(Boolean);
      const body: Record<string, unknown> = {
        start_datetime: evtStart,
        event_duration_minutes: Number(evtDuration) || 60,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      if (evtSummary) body.summary = evtSummary;
      if (evtLocation) body.location = evtLocation;
      if (evtDescription) body.description = evtDescription;
      if (attendeeList.length > 0) body.attendees = attendeeList;
      if (evtMeet) body.create_meeting_room = true;

      const res = await fetch("/api/calendar?action=createEvent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        setEvtSuccess(true);
        setEvtSummary("");
        setEvtStart("");
        setEvtLocation("");
        setEvtDescription("");
        setEvtAttendees("");
        setEvtMeet(false);
      } else {
        setEvtError(json.error);
      }
    } catch {
      setEvtError("Failed to create event");
    }
    setCreatingEvent(false);
  };

  const handleDeleteEvent = async (eventId: string) => {
    setDeletingEventId(eventId);
    try {
      const res = await fetch("/api/calendar?action=deleteEvent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const json = await res.json();
      if (json.success) {
        setCalEvents((prev) => prev.filter((e) => e.id !== eventId));
      }
    } catch {
      /* silent */
    }
    setDeletingEventId(null);
  };

  // -----------------------------------------------------------------------
  // Disconnected state
  // -----------------------------------------------------------------------

  if (!serviceStatus?.googlecalendar.connected) {
    return (
      <motion.div
        key="calendar"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <ConnectServiceCard
          serviceName="Google Calendar"
          description="Connect your Google Calendar to manage events, create meetings, and view your schedule directly from this dashboard."
          accentColor="blue"
          icon={<CalendarIcon />}
        />
      </motion.div>
    );
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <motion.div
      key="calendar"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Tab Navigation */}
      <nav className="border-b border-[#e8e5df] mb-6">
        <div className="flex gap-0 overflow-x-auto">
          {calTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setCalTab(tab.key); }}
              className={cn(
                "px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                calTab === tab.key
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-[#6b6b6b] hover:text-[#1a1a1a] hover:border-[#d5d0c9]",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {loading && <Spinner color="blue" />}

      {/* ================================================================= */}
      {/* UPCOMING TAB                                                      */}
      {/* ================================================================= */}
      {calTab === "upcoming" && !loading && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[#1a1a1a]">Upcoming Events</h2>
            <button
              onClick={fetchEvents}
              className="text-xs text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors px-3 py-1.5 rounded-lg hover:bg-[#1e293b]"
            >
              Refresh
            </button>
          </div>

          {calEvents.length === 0 ? (
            <div className="bg-[#faf9f7] border border-[#e8e5df] rounded-xl p-12 text-center">
              <CalendarIcon className="w-10 h-10 text-[#999999] mx-auto mb-3" />
              <p className="text-sm text-[#6b6b6b]">No upcoming events found.</p>
              <p className="text-xs text-[#999999] mt-1">Your calendar events will appear here.</p>
            </div>
          ) : (
            <div className="max-h-[700px] overflow-y-auto custom-scrollbar space-y-5">
              {groupedEvents.map(({ dateKey, label, events }) => (
                <div key={dateKey}>
                  {/* Date header */}
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="text-sm font-semibold text-[#1a1a1a] whitespace-nowrap">{label}</h3>
                    <div className="flex-1 h-px bg-[#e8e5df]/50" />
                    <span className="text-xs text-[#999999]">{events.length} event{events.length > 1 ? "s" : ""}</span>
                  </div>

                  {/* Event cards */}
                  <div className="space-y-2">
                    {events.map((evt) => {
                      const isAllDay = isAllDayEvent(evt);
                      const timeRange = getTimeRange(evt);
                      return (
                        <div
                          key={evt.id}
                          className="bg-[#faf9f7] border border-[#e8e5df] rounded-xl px-4 py-3.5 hover:bg-[#1e293b] hover:border-[#d5d0c9] transition-all duration-200 group"
                        >
                          <div className="flex items-start gap-3">
                            {/* Color dot + time */}
                            <div className="flex flex-col items-center gap-1.5 pt-0.5 flex-shrink-0 w-14">
                              <span className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", eventColor(evt.summary || ""))} />
                              {timeRange && (
                                <span className="text-xs text-[#999999] leading-tight text-center">
                                  {isAllDay ? (
                                    <span className="font-medium text-[#6b6b6b]">All day</span>
                                  ) : (
                                    <>
                                      <span className="block">{formatTime(evt.start.dateTime)}</span>
                                      {formatTime(evt.end.dateTime) && (
                                        <span className="block text-[#999999]">{formatTime(evt.end.dateTime)}</span>
                                      )}
                                    </>
                                  )}
                                </span>
                              )}
                            </div>

                            {/* Content */}
                            <div className="min-w-0 flex-1">
                              <h4 className="text-sm font-medium text-[#1a1a1a] truncate">
                                {evt.summary || "(No title)"}
                              </h4>

                              {/* Location */}
                              {evt.location && (
                                <div className="flex items-center gap-1 mt-1 text-xs text-[#6b6b6b]">
                                  <MapPin className="w-3 h-3 flex-shrink-0" />
                                  <span className="truncate">{evt.location}</span>
                                </div>
                              )}

                              {/* Attendees */}
                              {evt.attendees && evt.attendees.length > 0 && (
                                <div className="flex items-center gap-1 mt-1 text-xs text-[#999999]">
                                  <span>{evt.attendees.length} attendee{evt.attendees.length > 1 ? "s" : ""}</span>
                                </div>
                              )}

                              {/* Description preview */}
                              {evt.description && (
                                <p className="text-xs text-[#999999] mt-1.5 truncate max-w-md">
                                  {evt.description}
                                </p>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              {evt.htmlLink && (
                                <a
                                  href={evt.htmlLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[#999999] hover:text-blue-600 transition-colors p-1.5 rounded-lg hover:bg-blue-500/10"
                                  title="Open in Google Calendar"
                                >
                                  <ExternalLinkIcon className="w-3.5 h-3.5" />
                                </a>
                              )}
                              <button
                                onClick={() => handleDeleteEvent(evt.id)}
                                disabled={deletingEventId === evt.id}
                                className="text-[#999999] hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/10 disabled:opacity-50"
                                title="Delete event"
                              >
                                {deletingEventId === evt.id ? (
                                  <div className="w-3.5 h-3.5 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
                                ) : (
                                  <TrashIcon className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* CREATE EVENT TAB                                                  */}
      {/* ================================================================= */}
      {calTab === "create" && (
        <div className="max-w-2xl">
          <div className="bg-[#faf9f7] border border-[#e8e5df] rounded-xl overflow-hidden">
            <div className="px-5 py-4 bg-[#faf9f7] border-b border-[#e8e5df]">
              <h2 className="text-lg font-semibold text-[#1a1a1a]">Create New Event</h2>
            </div>

            <div className="p-5 space-y-4">
              {/* Success / Error banners */}
              {evtSuccess && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 px-4 py-3 rounded-lg text-sm flex items-center justify-between">
                  <span>Event created successfully!</span>
                  <button onClick={() => setEvtSuccess(false)} className="underline hover:text-emerald-600 text-xs">
                    Dismiss
                  </button>
                </div>
              )}
              {evtError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm flex items-center justify-between">
                  <span>{evtError}</span>
                  <button onClick={() => setEvtError(null)} className="underline hover:text-red-300 text-xs">
                    Dismiss
                  </button>
                </div>
              )}

              {/* Event Title */}
              <div>
                <label className="text-xs font-medium text-[#6b6b6b] mb-1.5 block">Event Title</label>
                <input
                  type="text"
                  placeholder="Team standup"
                  value={evtSummary}
                  onChange={(e) => setEvtSummary(e.target.value)}
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-[#1a1a1a] placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors"
                />
              </div>

              {/* Start & Duration */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[#6b6b6b] mb-1.5 block">Start Date & Time</label>
                  <input
                    type="datetime-local"
                    value={evtStart}
                    onChange={(e) => setEvtStart(e.target.value)}
                    className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-[#1a1a1a] placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#6b6b6b] mb-1.5 block">Duration</label>
                  <select
                    value={evtDuration}
                    onChange={(e) => setEvtDuration(e.target.value)}
                    className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors"
                  >
                    <option value="15">15 min</option>
                    <option value="30">30 min</option>
                    <option value="60">1 hour</option>
                    <option value="90">1.5 hours</option>
                    <option value="120">2 hours</option>
                    <option value="180">3 hours</option>
                  </select>
                </div>
              </div>

              {/* Location */}
              <div>
                <label className="text-xs font-medium text-[#6b6b6b] mb-1.5 block">Location</label>
                <input
                  type="text"
                  placeholder="Office / Zoom link"
                  value={evtLocation}
                  onChange={(e) => setEvtLocation(e.target.value)}
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-[#1a1a1a] placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-medium text-[#6b6b6b] mb-1.5 block">Description</label>
                <textarea
                  placeholder="Add event details..."
                  rows={3}
                  value={evtDescription}
                  onChange={(e) => setEvtDescription(e.target.value)}
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-[#1a1a1a] placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 resize-y transition-colors"
                />
              </div>

              {/* Attendees */}
              <div>
                <label className="text-xs font-medium text-[#6b6b6b] mb-1.5 block">Attendees (comma-separated)</label>
                <input
                  type="text"
                  placeholder="john@example.com, jane@example.com"
                  value={evtAttendees}
                  onChange={(e) => setEvtAttendees(e.target.value)}
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-[#1a1a1a] placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors"
                />
              </div>

              {/* Google Meet toggle */}
              <div className="flex items-center gap-3 py-1">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={evtMeet}
                    onChange={(e) => setEvtMeet(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-[#e8e5df] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                </label>
                <span className="text-sm text-[#1a1a1a]">Add Google Meet video conferencing</span>
              </div>

              {/* Submit button */}
              <button
                onClick={handleCreateEvent}
                disabled={creatingEvent || !evtStart}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-[#e8e5df] disabled:text-[#999999] text-[#1a1a1a] px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                {creatingEvent && (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                <CalendarIcon className="w-4 h-4" />
                {creatingEvent ? "Creating..." : "Create Event"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* CALENDARS TAB                                                     */}
      {/* ================================================================= */}
      {calTab === "calendars" && !loading && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[#1a1a1a]">
              Your Calendars
              <span className="ml-2 text-sm font-normal text-[#6b6b6b]">{calendars.length}</span>
            </h2>
          </div>

          {calendars.length === 0 ? (
            <div className="bg-[#faf9f7] border border-[#e8e5df] rounded-xl p-12 text-center">
              <CalendarIcon className="w-10 h-10 text-[#999999] mx-auto mb-3" />
              <p className="text-sm text-[#6b6b6b]">No calendars found</p>
            </div>
          ) : (
            <div className="bg-[#faf9f7] border border-[#e8e5df] rounded-xl overflow-hidden">
              {calendars.map((cal) => (
                <div
                  key={cal.id}
                  className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#1e293b] transition-colors border-b border-slate-700/30 last:border-b-0"
                >
                  <div className={cn(
                    "w-3 h-3 rounded-full flex-shrink-0",
                    cal.primary ? "bg-blue-500" : "bg-slate-500",
                  )} />
                  <span className="text-sm text-[#1a1a1a] font-medium flex-1 truncate">{cal.summary}</span>
                  {cal.primary && (
                    <span className="text-xs bg-blue-500/20 text-blue-600 px-2.5 py-0.5 rounded-full font-medium flex-shrink-0">
                      Primary
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
