"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { lazy } from "react";
import { OpsFeed } from "@/components/dashboard/ops-feed";
import { ServiceChips } from "@/components/dashboard/service-chips";
import { MetricsRow } from "@/components/dashboard/metrics-row";
import { CoordinationMap } from "@/components/dashboard/coordination-map";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardStream } from "@/hooks/use-dashboard-stream";
import type { ServiceStatus, RepoInfo as _RepoInfo, GmailProfile as _GmailProfile } from "@/lib/types";
type RepoInfo = _RepoInfo;
type GmailProfile = _GmailProfile;

// Lazy-load heavy chat component
const ChatView = lazy(() =>
  import("@/components/dashboard/chat-view").then((m) => ({ default: m.ChatView }))
);

function MetricsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="bg-white px-4 py-3.5 min-w-[140px] rounded-lg border border-[#e8e5df] shadow-sm">
          <Skeleton className="h-3 w-16 mb-2" />
          <Skeleton className="h-7 w-12 mb-1" />
          <Skeleton className="h-2 w-20" />
        </div>
      ))}
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
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);
  const [, setRepo] = useState<RepoInfo | null>(null);
  const [, setGmProfile] = useState<GmailProfile | null>(null);

  const { agentStatuses, activity, metrics, delegations, isConnected } = useDashboardStream();

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
    <div className="flex flex-col h-full min-h-0">
      {/* ── Top Section — Fixed, not scrollable ── */}
      <div className="flex-shrink-0 px-4 lg:px-6 pt-4 lg:pt-6 space-y-4">
        {/* Service Chips */}
        <section>
          <ServiceChips serviceStatus={serviceStatus} />
        </section>

        {/* Metrics Row */}
        <section>
          <MetricsRow metrics={metrics} agentStatuses={agentStatuses} />
        </section>
      </div>

      {/* ── Bottom Section — Fills remaining height ── */}
      <div className="flex-1 min-h-0 px-4 lg:px-6 pb-4 lg:pb-6 pt-4">
        <div className="flex flex-col lg:flex-row gap-4 h-full">
          {/* Left Column (60%) — Ops Feed + Coordination Map stacked */}
          <div className="flex flex-col gap-4 min-w-0 lg:w-[60%] h-[50vh] lg:h-full">
            {/* Ops Feed — scrollable, max-h ~45vh on lg */}
            <div className="bg-white rounded-lg border border-[#e8e5df] shadow-sm flex flex-col min-h-0 lg:max-h-[45vh]">
              <OpsFeed events={activity} isConnected={isConnected} />
            </div>

            {/* Coordination Map — scrollable, max-h ~45vh on lg */}
            <div className="bg-white rounded-lg border border-[#e8e5df] shadow-sm flex flex-col min-h-0 lg:max-h-[45vh] overflow-hidden">
              <CoordinationMap delegations={delegations || []} />
            </div>
          </div>

          {/* Right Column (40%) — Chat Panel — fills full height */}
          <div className="hidden lg:flex flex-col bg-white rounded-lg border border-[#e8e5df] shadow-sm w-[40%] min-w-0 overflow-hidden">
            {/* Chat Tabs */}
            <div className="flex border-b border-[#e8e5df] flex-shrink-0">
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
            {/* ChatView — fills remaining space */}
            <div className="flex-1 min-h-0">
              <Suspense fallback={<ChatViewSkeleton />}>
                <ChatView />
              </Suspense>
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile Chat — full width at bottom ── */}
      <div className="lg:hidden flex-shrink-0 border-t border-[#e8e5df] bg-white" style={{ height: "50vh" }}>
        {/* Chat Tabs */}
        <div className="flex border-b border-[#e8e5df] flex-shrink-0">
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
        {/* ChatView — fills remaining space */}
        <div className="flex-1 min-h-0 overflow-hidden" style={{ height: "calc(50vh - 42px)" }}>
          <Suspense fallback={<ChatViewSkeleton />}>
            <ChatView />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
