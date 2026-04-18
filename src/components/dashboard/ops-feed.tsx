"use client";

import { useRef, useEffect } from "react";
import type { ActivityEventView } from "@/hooks/use-dashboard-stream";

interface OpsFeedProps {
  events: ActivityEventView[];
  isConnected: boolean;
}

const AGENT_DOT_COLORS: Record<string, string> = {
  general: "bg-emerald-500",
  mail: "bg-blue-500",
  code: "bg-purple-500",
  data: "bg-amber-500",
  creative: "bg-rose-500",
  research: "bg-teal-500",
  ops: "bg-orange-500",
};

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

  useEffect(() => {
    if (feedEndRef.current) {
      feedEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [events.length]);

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return "";
    }
  };

  const buildHtml = (event: ActivityEventView) => {
    const agentName = event.agent_name || event.agent_id;
    const detail = event.detail || ACTION_LABELS[event.action] || event.action;
    return `<strong>${agentName}</strong> ${detail}`;
  };

  const getDotColor = (event: ActivityEventView) => {
    if (event.action === "error") return "bg-red-500";
    return AGENT_DOT_COLORS[event.agent_id] || "bg-[#999999]";
  };

  return (
    <div className="flex-1 border-t border-[#e8e5df] flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 pb-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-[#999999]">
            Live Operations
          </span>
        </div>
        <span className={`text-[10px] flex items-center gap-1 ${isConnected ? "text-emerald-600" : "text-red-600"}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-emerald-500" : "bg-red-500"}`} />
          {isConnected ? "Live" : "Disconnected"}
        </span>
      </div>

      {/* Feed */}
      <div className="flex-1 px-5 pb-2 overflow-y-auto custom-scrollbar">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-8 h-8 rounded-full bg-[#faf9f7] border border-[#e8e5df] flex items-center justify-center mb-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[#999999]">
                <path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <div className="text-[11px] text-[#999999]">No activity yet</div>
            <div className="text-[10px] text-[#d5d0c9] mt-0.5">Send a message to see operations</div>
          </div>
        ) : (
          events.map((event) => (
            <div
              key={event.id}
              className="flex items-start gap-2 py-2 border-b last:border-b-0 border-[#f0ede8]"
            >
              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${getDotColor(event)}`} />
              <div className="min-w-0">
                <div
                  className="text-[11px] text-[#6b6b6b] leading-relaxed [&_strong]:text-[#1a1a1a] [&_strong]:font-semibold"
                  dangerouslySetInnerHTML={{ __html: buildHtml(event) }}
                />
                <div className="text-[10px] text-[#999999] mt-0.5">
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
