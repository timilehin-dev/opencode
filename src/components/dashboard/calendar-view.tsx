"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  CalendarIcon,
  TrashIcon,
  Spinner,
} from "@/components/icons";
import { ConnectServiceCard } from "@/components/connect-service-card";
import type {
  CalendarEvent,
  CalendarInfo,
  CalendarTab,
  ServiceStatus,
} from "@/lib/types";

interface CalendarViewProps {
  serviceStatus: ServiceStatus | null;
}

const calTabs: { key: CalendarTab; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "create", label: "Create Event" },
  { key: "calendars", label: "Calendars" },
];

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

  useEffect(() => {
    if (!serviceStatus?.googlecalendar.connected) return;
    const controller = new AbortController();
    (async () => {
      switch (calTab) {
        case "upcoming": await fetchCalendars(); break;
        case "calendars": await fetchCalendars(); break;
      }
    })();
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calTab, serviceStatus]);

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

  return (
    <motion.div
      key="calendar"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Calendar Tab Navigation */}
      <nav className="border-b border-slate-800 mb-6">
        <div className="flex gap-0 overflow-x-auto">
          {calTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setCalTab(tab.key); }}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                calTab === tab.key
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {loading && <Spinner color="blue" />}

      {/* Upcoming Tab */}
      {calTab === "upcoming" && !loading && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Upcoming Events</h2>
          {calEvents.length === 0 ? (
            <div className="bg-[#1a2332] border border-slate-700/50 rounded-xl p-8 text-center text-slate-400">
              <CalendarIcon />
              <p className="mt-3 text-sm">No upcoming events found. Your calendar events will appear here.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto custom-scrollbar">
              {calEvents.map((evt) => (
                <div key={evt.id} className="bg-[#1a2332] border border-slate-700/50 rounded-lg px-5 py-4 hover:border-slate-600 transition-colors group">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                        <span className="text-white font-medium truncate">{evt.summary || "(No title)"}</span>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-400 flex-wrap">
                        {evt.start.dateTime && (
                          <span>{new Date(evt.start.dateTime).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                        )}
                        {evt.start.date && (
                          <span>{new Date(evt.start.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" })}</span>
                        )}
                        {evt.location && <span>📍 {evt.location}</span>}
                      </div>
                      {evt.description && (
                        <p className="text-xs text-slate-500 mt-1.5 truncate">{evt.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {evt.htmlLink && (
                        <a href={evt.htmlLink} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:text-blue-300 transition-colors px-2 py-1 rounded hover:bg-blue-500/10">
                          Open
                        </a>
                      )}
                      <button
                        onClick={() => handleDeleteEvent(evt.id)}
                        disabled={deletingEventId === evt.id}
                        className="text-xs text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded hover:bg-red-500/10"
                      >
                        {deletingEventId === evt.id ? "..." : <TrashIcon />}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Event Tab */}
      {calTab === "create" && (
        <div className="max-w-2xl">
          <div className="bg-[#1a2332] border border-slate-700/50 rounded-xl p-5">
            <h2 className="text-lg font-semibold text-white mb-4">Create New Event</h2>
            {evtSuccess && (
              <div className="mb-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-3 rounded-lg text-sm">
                Event created successfully!
                <button onClick={() => setEvtSuccess(false)} className="ml-3 underline hover:text-emerald-300">Dismiss</button>
              </div>
            )}
            {evtError && (
              <div className="mb-4 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
                {evtError}
                <button onClick={() => setEvtError(null)} className="ml-3 underline hover:text-red-300">Dismiss</button>
              </div>
            )}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1 block">Event Title</label>
                <input type="text" placeholder="Team standup" value={evtSummary} onChange={(e) => setEvtSummary(e.target.value)}
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-400 mb-1 block">Start Date & Time</label>
                  <input type="datetime-local" value={evtStart} onChange={(e) => setEvtStart(e.target.value)}
                    className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400 mb-1 block">Duration (minutes)</label>
                  <select value={evtDuration} onChange={(e) => setEvtDuration(e.target.value)}
                    className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500">
                    <option value="15">15 min</option>
                    <option value="30">30 min</option>
                    <option value="60">1 hour</option>
                    <option value="90">1.5 hours</option>
                    <option value="120">2 hours</option>
                    <option value="180">3 hours</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1 block">Location</label>
                <input type="text" placeholder="Office / Zoom link" value={evtLocation} onChange={(e) => setEvtLocation(e.target.value)}
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1 block">Description</label>
                <textarea placeholder="Add event details..." rows={3} value={evtDescription} onChange={(e) => setEvtDescription(e.target.value)}
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 resize-y" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1 block">Attendees (comma-separated)</label>
                <input type="text" placeholder="john@example.com, jane@example.com" value={evtAttendees} onChange={(e) => setEvtAttendees(e.target.value)}
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500" />
              </div>
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={evtMeet} onChange={(e) => setEvtMeet(e.target.checked)}
                    className="sr-only peer" />
                  <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
                <span className="text-sm text-slate-300">Add Google Meet video conferencing</span>
              </div>
              <button onClick={handleCreateEvent} disabled={creatingEvent || !evtStart}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors">
                {creatingEvent && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {creatingEvent ? "Creating..." : "Create Event"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Calendars Tab */}
      {calTab === "calendars" && !loading && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">
            Your Calendars <span className="ml-2 text-sm font-normal text-slate-400">({calendars.length})</span>
          </h2>
          {calendars.length === 0 ? (
            <div className="bg-[#1a2332] border border-slate-700/50 rounded-xl p-8 text-center text-slate-400">No calendars found</div>
          ) : (
            <div className="bg-[#1a2332] border border-slate-700/50 rounded-xl overflow-hidden">
              {calendars.map((cal) => (
                <div key={cal.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#1e293b] transition-colors border-b border-slate-700/30 last:border-b-0">
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${cal.primary ? "bg-blue-500" : "bg-slate-500"}`} />
                  <span className="text-sm text-white font-medium">{cal.summary}</span>
                  {cal.primary && (
                    <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-medium">Primary</span>
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
