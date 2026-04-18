"use client";

import { useRef, useEffect } from "react";
import type { ActivityEventView } from "@/hooks/use-dashboard-stream";

interface OpsFeedProps {
  events: ActivityEventView[];
  isConnected: boolean;
}

// Map agent IDs to display colors for the dot indicator
const AGENT_DOT_COLORS: Record<string, string> = {
  general: "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]",
  mail: "bg-blue-500",
  code: "bg-purple-500",
  data: "bg-amber-500",
  creative: "bg-rose-500",
  research: "bg-teal-500",
  ops: "bg-orange-500",
};

// Map actions to descriptions
const ACTION_LABELS: Record<string, string> = {
  chat_message: "responded",
  tool_call: "tool call",
  status_change: "status update",
  delegation: "delegated",
  task_complete: "completed task",
  error: "error",
};

export function OpsFeed({ events, isConnected }: OpsFeedProps) {
  const feedEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to newest event
  useEffect(() => {
    if (feedEndRef.current) {
      feedEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [events.length]);

  // Format timestamp to HH:MM:SS
  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return "";
    }
  };

  // Build the HTML content for an event
  const buildHtml = (event: ActivityEventView) => {
    const agentName = event.agent_name || event.agent_id;
    const detail = event.detail || ACTION_LABELS[event.action] || event.action;
    // Bold the agent name
    return `<strong>${agentName}</strong> ${detail}`;
  };

  // Get dot color based on agent or action
  const getDotColor = (event: ActivityEventView) => {
    if (event.action === "error") return "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.4)]";
    return AGENT_DOT_COLORS[event.agent_id] || "bg-slate-500";
  };

  return (
    <div className="flex-1 border-t flex flex-col min-h-0" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-[18px] py-4 pb-1">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-bold uppercase tracking-[1px] text-slate-500">
            Live Operations
          </span>
        </div>
        <span
          className={`text-[10px] flex items-center gap-1 ${
            isConnected ? "text-emerald-400" : "text-red-400"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isConnected ? "bg-emerald-500 animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.5)]" : "bg-red-500"
            }`}
          />
          {isConnected ? "Live" : "Disconnected"}
        </span>
      </div>

      {/* Feed */}
      <div className="flex-1 px-[18px] pb-2 overflow-y-auto custom-scrollbar">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-8 h-8 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-600">
                <path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <div className="text-[11px] text-slate-600">
              No activity yet
            </div>
            <div className="text-[10px] text-slate-700 mt-0.5">
              Send a message to see operations
            </div>
          </div>
        ) : (
          events.map((event) => (
            <div
              key={event.id}
              className="flex items-start gap-2 py-2 border-b last:border-b-0" style={{ borderColor: "rgba(255,255,255,0.04)" }}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${getDotColor(event)}`}
              />
              <div className="min-w-0">
                <div
                  className="text-[11.5px] text-slate-400 leading-relaxed [&_strong]:text-slate-200 [&_strong]:font-semibold"
                  dangerouslySetInnerHTML={{ __html: buildHtml(event) }}
                />
                <div className="text-[10px] text-slate-600 mt-0.5">
                  {formatTime(event.created_at)}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={feedEndRef} />
      </div>
    </div>
  );
}
