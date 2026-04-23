"use client";

import { useState, useEffect, Suspense, lazy } from "react";
import { OpsFeed } from "@/components/dashboard/ops-feed";
import { DashboardTasks } from "@/components/dashboard/dashboard-tasks";
import { DashboardHistory } from "@/components/dashboard/dashboard-history";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardStream } from "@/hooks/use-dashboard-stream";
import type { ServiceStatus } from "@/lib/types";
import type { DashboardMetricsView } from "@/hooks/use-dashboard-stream";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  Activity,
  ListTodo,
  X,
  PanelRightOpen,
  PanelRightClose,
} from "lucide-react";

// Lazy-load heavy chat component
const ChatView = lazy(() =>
  import("@/components/dashboard/chat-view").then((m) => ({
    default: m.ChatView,
  }))
);

// ---------------------------------------------------------------------------
// Service metadata for dots
// ---------------------------------------------------------------------------

const SERVICE_META: {
  key: keyof ServiceStatus;
  label: string;
}[] = [
  { key: "gmail", label: "Gmail" },
  { key: "github", label: "GitHub" },
  { key: "googlecalendar", label: "Calendar" },
  { key: "googledrive", label: "Drive" },
  { key: "googlesheets", label: "Sheets" },
  { key: "googledocs", label: "Docs" },
  { key: "vercel", label: "Vercel" },
];

// ---------------------------------------------------------------------------
// Service Status Dots — compact inline component
// ---------------------------------------------------------------------------

function ServiceDots({ services }: { services: ServiceStatus | null }) {
  return (
    <div className="flex items-center gap-1.5">
      {SERVICE_META.map((svc) => {
        const connected = services?.[svc.key]?.connected ?? false;
        return (
          <span
            key={svc.key}
            title={`${svc.label}: ${connected ? "Connected" : "Offline"}`}
            className={cn(
              "w-2 h-2 rounded-full transition-colors",
              connected ? "bg-emerald-500" : "bg-muted-foreground/30"
            )}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact Metrics — inline text in the top bar
// ---------------------------------------------------------------------------

function CompactMetrics({
  metrics,
  agentStatuses,
}: {
  metrics?: DashboardMetricsView | null;
  agentStatuses?: Array<{ status: string }>;
}) {
  const msgs = metrics ? String(metrics.messagesToday) : "—";
  const tasks = metrics ? String(metrics.tasksDone) : "—";
  const agents = agentStatuses
    ? String(agentStatuses.filter((s) => s.status === "busy").length)
    : "—";

  return (
    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1">
        <MessageSquare className="w-3 h-3" />
        {msgs} msgs
      </span>
      <span className="flex items-center gap-1">
        <ListTodo className="w-3 h-3" />
        {tasks} done
      </span>
      <span className="flex items-center gap-1">
        <Activity className="w-3 h-3" />
        {agents} active
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat Loading Skeleton
// ---------------------------------------------------------------------------

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
      <div className="border-t border-border p-3">
        <Skeleton className="h-9 w-full rounded-lg" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right Panel Tabs
// ---------------------------------------------------------------------------

type RightTab = "activity" | "tasks";

function RightPanel({
  events,
  isConnected,
  tasks,
}: {
  events: Parameters<typeof OpsFeed>[0]["events"];
  isConnected: boolean;
  tasks: Parameters<typeof DashboardTasks>[0]["tasks"];
}) {
  const [activeTab, setActiveTab] = useState<RightTab>("activity");

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center border-b border-border flex-shrink-0 px-1">
        <button
          onClick={() => setActiveTab("activity")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-semibold transition-colors border-b-2 -mb-px",
            activeTab === "activity"
              ? "text-foreground border-primary"
              : "text-muted-foreground border-transparent hover:text-foreground/70"
          )}
        >
          <Activity className="w-3 h-3" />
          Activity
        </button>
        <button
          onClick={() => setActiveTab("tasks")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-semibold transition-colors border-b-2 -mb-px",
            activeTab === "tasks"
              ? "text-foreground border-primary"
              : "text-muted-foreground border-transparent hover:text-foreground/70"
          )}
        >
          <ListTodo className="w-3 h-3" />
          Tasks
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {activeTab === "activity" ? (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <OpsFeed events={events} isConnected={isConnected} />
          </div>
        ) : (
          <div className="flex flex-col h-full overflow-hidden">
            <div className="flex-1 min-h-0 overflow-hidden">
              <DashboardTasks tasks={tasks} />
            </div>
            <div className="h-px bg-border" />
            <div className="h-[200px] min-h-0 overflow-hidden">
              <DashboardHistory />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile Overlay Panel
// ---------------------------------------------------------------------------

function MobileOverlayPanel({
  events,
  isConnected,
  tasks,
  open,
  onClose,
}: {
  events: Parameters<typeof OpsFeed>[0]["events"];
  isConnected: boolean;
  tasks: Parameters<typeof DashboardTasks>[0]["tasks"];
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel — slides up from bottom */}
      <div className="absolute inset-x-0 bottom-0 max-h-[80vh] bg-background border-t border-border rounded-t-2xl shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-200">
        {/* Drag handle + title */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <span className="text-sm font-semibold text-foreground">
            Dashboard
          </span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-accent transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <RightPanel
            events={events}
            isConnected={isConnected}
            tasks={tasks}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(
    null
  );
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);

  const {
    agentStatuses,
    activity,
    metrics,
    tasks,
    isConnected,
  } = useDashboardStream();

  // Service-level data fetching (runs once on mount)
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/services?action=status", {
          signal: controller.signal,
        });
        const json = await res.json();
        if (json.success) setServiceStatus(json.data);
      } catch {
        /* silent */
      }
    })();
    return () => controller.abort();
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── Slim Top Bar (48px) ── */}
      <header className="flex items-center justify-between h-12 px-4 lg:px-5 border-b border-border/60 flex-shrink-0 bg-background/80 backdrop-blur-sm">
        {/* Left: Agent identity */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
          <span className="text-xs font-semibold text-foreground truncate">
            🤖 Klawhub General
          </span>
        </div>

        {/* Center: Service dots (desktop only) */}
        <div className="hidden md:flex items-center">
          <ServiceDots services={serviceStatus} />
        </div>

        {/* Right: Compact metrics (desktop) + mobile panel toggle */}
        <div className="flex items-center gap-3">
          <div className="hidden lg:flex items-center">
            <CompactMetrics
              metrics={metrics}
              agentStatuses={agentStatuses}
            />
          </div>

          {/* Desktop right-panel toggle */}
          <button
            onClick={() => setRightPanelCollapsed((v) => !v)}
            className="hidden lg:flex p-1.5 rounded-lg hover:bg-accent transition-colors"
            title={rightPanelCollapsed ? "Show panel" : "Hide panel"}
          >
            {rightPanelCollapsed ? (
              <PanelRightOpen className="w-4 h-4 text-muted-foreground" />
            ) : (
              <PanelRightClose className="w-4 h-4 text-muted-foreground" />
            )}
          </button>

          {/* Mobile panel toggle */}
          <button
            onClick={() => setMobilePanelOpen(true)}
            className="lg:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-secondary border border-border text-[11px] font-medium text-foreground hover:bg-accent transition-colors"
          >
            <Activity className="w-3 h-3" />
            <span className="hidden sm:inline">Feed</span>
          </button>
        </div>
      </header>

      {/* ── Main Content Area ── */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* ── Chat Area (hero) ── */}
        <div className="flex-1 min-w-0 min-h-0">
          <Suspense fallback={<ChatViewSkeleton />}>
            <ChatView />
          </Suspense>
        </div>

        {/* ── Right Panel (desktop only, collapsible) ── */}
        {!rightPanelCollapsed && (
          <aside className="hidden lg:flex w-[320px] xl:w-[360px] flex-shrink-0 border-l border-border bg-card overflow-hidden">
            <div className="flex-1 min-h-0 flex flex-col">
              <RightPanel
                events={activity}
                isConnected={isConnected}
                tasks={tasks}
              />
            </div>
          </aside>
        )}
      </div>

      {/* ── Mobile Overlay Panel ── */}
      <MobileOverlayPanel
        events={activity}
        isConnected={isConnected}
        tasks={tasks}
        open={mobilePanelOpen}
        onClose={() => setMobilePanelOpen(false)}
      />
    </div>
  );
}
