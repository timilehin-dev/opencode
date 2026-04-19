"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { lazy } from "react";
import { AgentCrew } from "@/components/dashboard/agent-crew";
import { OpsFeed } from "@/components/dashboard/ops-feed";
import { Skeleton } from "@/components/ui/skeleton";
import { getAllAgents } from "@/lib/agents";
import { useDashboardStream } from "@/hooks/use-dashboard-stream";
import type { ServiceStatus, RepoInfo as _RepoInfo, GmailProfile as _GmailProfile } from "@/lib/types";
type RepoInfo = _RepoInfo;
type GmailProfile = _GmailProfile;

// Lazy-load heavy dashboard components for code splitting
const MissionControl = lazy(() =>
  import("@/components/dashboard/mission-control").then((m) => ({ default: m.MissionControl }))
);
const ChatView = lazy(() =>
  import("@/components/dashboard/chat-view").then((m) => ({ default: m.ChatView }))
);

function MissionControlSkeleton() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="space-y-2">
        <div className="h-6 w-48 rounded bg-[#e8e5df] animate-pulse" />
        <div className="h-3 w-72 rounded bg-[#e8e5df] animate-pulse" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[#e8e5df] bg-white p-4 space-y-2">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-2 w-24" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-[#e8e5df] bg-white p-6 space-y-3">
        <Skeleton className="h-4 w-36" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

function ChatViewSkeleton() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 p-4 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="w-7 h-7 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-2 w-20" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-[#e8e5df] p-3">
        <Skeleton className="h-9 w-full rounded-lg" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [selectedAgentId, setSelectedAgentId] = useState("general");
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);
  const [, setRepo] = useState<RepoInfo | null>(null);
  const [, setGmProfile] = useState<GmailProfile | null>(null);
  const agents = getAllAgents();

  const { agentStatuses, activity, metrics, todos, delegations, isConnected } = useDashboardStream();

  // Service-level data fetching
  const fetchServiceStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/services?action=status");
      const json = await res.json();
      if (json.success) setServiceStatus(json.data);
    } catch {
      /* silent */
    }
  }, []);

  const fetchRepo = useCallback(async () => {
    try {
      const res = await fetch("/api/github?action=repo");
      const json = await res.json();
      if (json.success) setRepo(json.data);
    } catch {
      /* silent */
    }
  }, []);

  const fetchGmailProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/gmail?action=profile");
      const json = await res.json();
      if (json.success) setGmProfile(json.data);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      await fetchServiceStatus();
      await fetchRepo();
      await fetchGmailProfile();
    })();
    return () => controller.abort();
  }, [fetchServiceStatus, fetchRepo, fetchGmailProfile]);

  return (
    <div className="flex h-full">
      {/* Left Panel — Agent Crew + Ops Feed (desktop only) */}
      <div className="hidden lg:flex w-[300px] border-r border-[#e8e5df] bg-white flex-col flex-shrink-0">
        <AgentCrew
          agents={agents}
          selectedAgentId={selectedAgentId}
          onSelectAgent={setSelectedAgentId}
          agentStatuses={agentStatuses}
        />
        <OpsFeed events={activity} isConnected={isConnected} />
      </div>

      {/* Center Panel — Mission Control */}
      <div className="flex-1 overflow-y-auto custom-scrollbar mobile-scroll">
        <div className="p-4 lg:p-6">
          <Suspense fallback={<MissionControlSkeleton />}>
            <MissionControl
              serviceStatus={serviceStatus}
              metrics={metrics}
              todos={todos}
              delegations={delegations}
              tasks={[]}
            />
          </Suspense>
        </div>
      </div>

      {/* Right Panel — Chat (desktop only) */}
      <div className="hidden lg:flex w-[360px] border-l border-[#e8e5df] bg-white flex-col flex-shrink-0">
        {/* Chat Tabs */}
        <div className="flex border-b border-[#e8e5df]">
          {["Chat", "Tasks", "History"].map((tab, i) => (
            <div
              key={tab}
              className={`flex-1 py-3 text-center text-xs font-semibold cursor-pointer transition-all duration-150 border-b-2 ${
                i === 0
                  ? "text-[#3730a3] border-[#3730a3]"
                  : "text-[#999999] border-transparent hover:text-[#6b6b6b]"
              }`}
            >
              {tab}
            </div>
          ))}
        </div>
        {/* ChatView */}
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={<ChatViewSkeleton />}>
            <ChatView />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
