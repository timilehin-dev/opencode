"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { lazy } from "react";
import { OpsFeed } from "@/components/dashboard/ops-feed";
import { ServiceChips } from "@/components/dashboard/service-chips";
import { MetricsRow } from "@/components/dashboard/metrics-row";
import { CoordinationMap } from "@/components/dashboard/coordination-map";
import { DashboardTasks } from "@/components/dashboard/dashboard-tasks";
import { DashboardHistory } from "@/components/dashboard/dashboard-history";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardStream } from "@/hooks/use-dashboard-stream";
import type { ServiceStatus, RepoInfo as _RepoInfo, GmailProfile as _GmailProfile } from "@/lib/types";
type RepoInfo = _RepoInfo;
type GmailProfile = _GmailProfile;

// Lazy-load heavy chat component
const ChatView = lazy(() =>
  import("@/components/dashboard/chat-view").then((m) => ({ default: m.ChatView }))
);

type TabId = "chat" | "tasks" | "history";

const TABS: { id: TabId; label: string }[] = [
  { id: "chat", label: "💬 Chat" },
  { id: "tasks", label: "📋 Tasks" },
  { id: "history", label: "🕐 History" },
];

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

function TabBar({ activeTab, onTabChange }: { activeTab: TabId; onTabChange: (tab: TabId) => void }) {
  return (
    <div className="flex border-b border-[#e8e5df] flex-shrink-0">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex-1 py-3 text-center text-xs font-semibold transition-all duration-150 border-b-2 ${
            activeTab === tab.id
              ? "text-[#3730a3] border-[#3730a3]"
              : "text-[#999999] border-transparent hover:text-[#6b6b6b]"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function TabContent({ activeTab, tasks }: { activeTab: TabId; tasks: Parameters<typeof DashboardTasks>[0]["tasks"] }) {
  switch (activeTab) {
    case "tasks":
      return <DashboardTasks tasks={tasks} />;
    case "history":
      return <DashboardHistory />;
    case "chat":
    default:
      return (
        <Suspense fallback={<ChatViewSkeleton />}>
          <ChatView />
        </Suspense>
      );
  }
}

export default function DashboardPage() {
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);
  const [, setRepo] = useState<RepoInfo | null>(null);
  const [, setGmProfile] = useState<GmailProfile | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("chat");

  const { agentStatuses, activity, metrics, delegations, tasks, isConnected } = useDashboardStream();

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
      {/* ── Top Section — Fixed, compact to maximize chat space ── */}
      <div className="flex-shrink-0 px-4 lg:px-6 pt-3 lg:pt-4 space-y-2.5">
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
      <div className="flex-1 min-h-0 px-4 lg:px-6 pb-3 lg:pb-4 pt-2.5">
        <div className="flex flex-col lg:flex-row gap-4 h-full">
          {/* Left Column (60%) — Desktop only: Ops Feed + Coordination Map stacked */}
          <div className="hidden lg:flex flex-col gap-4 min-w-0 lg:w-[60%] h-full">
            {/* Ops Feed */}
            <div className="bg-white rounded-lg border border-[#e8e5df] shadow-sm flex flex-col min-h-0 max-h-[50%]">
              <OpsFeed events={activity} isConnected={isConnected} />
            </div>

            {/* Coordination Map */}
            <div className="bg-white rounded-lg border border-[#e8e5df] shadow-sm flex flex-col min-h-0 flex-1 overflow-hidden">
              <CoordinationMap delegations={delegations || []} />
            </div>
          </div>

          {/* Right Column (40%) — Desktop: tabbed panel fills full height */}
          <div className="hidden lg:flex flex-col bg-white rounded-lg border border-[#e8e5df] shadow-sm w-[40%] min-w-0 overflow-hidden">
            <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
            <div className="flex-1 min-h-0">
              <TabContent activeTab={activeTab} tasks={tasks} />
            </div>
          </div>

          {/* Mobile: Full-screen tabbed panel (no duplicate content) */}
          <div className="lg:hidden flex flex-col bg-white rounded-lg border border-[#e8e5df] shadow-sm h-full min-h-[400px] overflow-hidden">
            <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
            <div className="flex-1 min-h-0">
              <TabContent activeTab={activeTab} tasks={tasks} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
