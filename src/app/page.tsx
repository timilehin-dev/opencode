"use client";

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { NotificationProvider } from "@/context/notification-context";
import { NotificationPanel } from "@/components/dashboard/notification-panel";
import { type PageKey } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { AgentCrew } from "@/components/dashboard/agent-crew";
import { OpsFeed } from "@/components/dashboard/ops-feed";
import { MissionControl } from "@/components/dashboard/mission-control";
import { ChatView } from "@/components/dashboard/chat-view";
import { AgentsView } from "@/components/dashboard/agents-view";
import { AnalyticsView } from "@/components/dashboard/analytics-view";
import { AutomationsView } from "@/components/dashboard/automations-view";
import { MemoryView } from "@/components/dashboard/memory-view";
import { GitHubView } from "@/components/dashboard/github-view";
import { GmailView } from "@/components/dashboard/gmail-view";
import { CalendarView } from "@/components/dashboard/calendar-view";
import { DriveView } from "@/components/dashboard/drive-view";
import { VercelView } from "@/components/dashboard/vercel-view";
import { DocsView } from "@/components/dashboard/docs-view";
import { SheetsView } from "@/components/dashboard/sheets-view";
import { getAllAgents } from "@/lib/agents";
import { useDashboardStream } from "@/hooks/use-dashboard-stream";
import {
  GitHubIcon,
  MailIcon,
  CalendarIcon,
  DriveIcon,
  SheetsIcon,
  DocsIcon,
  VercelIcon,
} from "@/components/icons";
import type {
  ServiceStatus,
  RepoInfo,
  GmailProfile,
} from "@/lib/types";

export default function Dashboard() {
  const [activePage, setActivePage] = useState<PageKey>("control");
  const [selectedAgentId, setSelectedAgentId] = useState("general");
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);
  const [repo, setRepo] = useState<RepoInfo | null>(null);
  const [gmProfile, setGmProfile] = useState<GmailProfile | null>(null);
  const agents = getAllAgents();

  // ---------------------------------------------------------------------------
  // Phase 2: Real-time dashboard data
  // ---------------------------------------------------------------------------

  const { agentStatuses, activity, metrics, todos, isConnected } = useDashboardStream();

  // ---------------------------------------------------------------------------
  // Service-level data fetching
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Page change handler
  // ---------------------------------------------------------------------------

  const handlePageChange = (key: PageKey) => {
    setActivePage(key);
  };

  // ---------------------------------------------------------------------------
  // Determine whether to show the 3-column control layout or full-width page
  // ---------------------------------------------------------------------------

  const isControlPage = activePage === "control";
  const isChatPage = activePage === "chat";

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <NotificationProvider onNavigate={handlePageChange}>
      <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
        {/* Notification slide-out panel */}
        <NotificationPanel />

        {/* Top Bar */}
        <Topbar activePage={activePage} onPageChange={handlePageChange} />

        {/* Main 3-column layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel — Agent Crew + Ops Feed (only on Mission Control, desktop only) */}
          {isControlPage && (
            <div className="hidden lg:flex w-[300px] border-r border-border flex-col bg-secondary/60 flex-shrink-0">
              <AgentCrew
                agents={agents}
                selectedAgentId={selectedAgentId}
                onSelectAgent={setSelectedAgentId}
                agentStatuses={agentStatuses}
              />
              <OpsFeed events={activity} isConnected={isConnected} />
            </div>
          )}

          {/* Center Panel */}
          <div className="flex-1 overflow-y-auto custom-scrollbar mobile-scroll">
            <div
              className={
                isControlPage
                  ? "p-4 lg:p-5"
                  : isChatPage
                    ? "p-0 h-full"
                    : "max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6"
              }
            >
              <AnimatePresence mode="wait">
                {/* Mission Control — default page */}
                {isControlPage && (
                  <motion.div
                    key="control-page"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col h-full"
                  >
                    <MissionControl
                      serviceStatus={serviceStatus}
                      metrics={metrics}
                      todos={todos}
                    />
                  </motion.div>
                )}

                {/* Chat — full page */}
                {isChatPage && (
                  <motion.div
                    key="chat-page"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.2 }}
                    className="h-full"
                  >
                    <ChatView key="chat" />
                  </motion.div>
                )}

                {/* Agents / Crew — full page */}
                {(activePage === "agents" || activePage === "crew") && (
                  <motion.div
                    key="agents-page"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <AgentsView key="agents" onNavigate={handlePageChange} />
                  </motion.div>
                )}

                {/* Analytics — full page */}
                {activePage === "analytics" && (
                  <motion.div
                    key="analytics-page"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <AnalyticsView key="analytics" onNavigate={handlePageChange} />
                  </motion.div>
                )}

                {/* Automations / Workflows — full page */}
                {(activePage === "automations" || activePage === "workflows") && (
                  <motion.div
                    key="automations-page"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <AutomationsView key="automations" onNavigate={handlePageChange} />
                  </motion.div>
                )}

                {/* Memory — full page */}
                {activePage === "memory" && (
                  <motion.div
                    key="memory-page"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <MemoryView key="memory" onNavigate={handlePageChange} />
                  </motion.div>
                )}

                {/* Settings — placeholder */}
                {activePage === "settings" && (
                  <motion.div
                    key="settings-page"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <SettingsPlaceholder />
                  </motion.div>
                )}

                {/* Services — grid placeholder */}
                {activePage === "services" && (
                  <motion.div
                    key="services-page"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ServicesGrid
                      serviceStatus={serviceStatus}
                      onNavigate={handlePageChange}
                    />
                  </motion.div>
                )}

                {/* GitHub */}
                {activePage === "github" && (
                  <motion.div
                    key="github-page"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ServicePageHeader
                      title="GitHub"
                      icon={<GitHubIcon />}
                      repo={repo}
                    />
                    <GitHubView />
                  </motion.div>
                )}

                {/* Gmail */}
                {activePage === "gmail" && (
                  <motion.div
                    key="gmail-page"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ServicePageHeader
                      title="Gmail"
                      icon={<MailIcon />}
                      gmProfile={gmProfile}
                    />
                    <GmailView />
                  </motion.div>
                )}

                {/* Calendar */}
                {activePage === "calendar" && (
                  <motion.div
                    key="calendar-page"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ServicePageHeader
                      title="Calendar"
                      icon={<CalendarIcon />}
                      serviceStatus={serviceStatus}
                      serviceKey="googlecalendar"
                    />
                    <CalendarView serviceStatus={serviceStatus} />
                  </motion.div>
                )}

                {/* Drive */}
                {activePage === "drive" && (
                  <motion.div
                    key="drive-page"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ServicePageHeader
                      title="Drive"
                      icon={<DriveIcon />}
                      serviceStatus={serviceStatus}
                      serviceKey="googledrive"
                    />
                    <DriveView serviceStatus={serviceStatus} />
                  </motion.div>
                )}

                {/* Sheets */}
                {activePage === "sheets" && (
                  <motion.div
                    key="sheets-page"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ServicePageHeader
                      title="Sheets"
                      icon={<SheetsIcon />}
                      serviceStatus={serviceStatus}
                      serviceKey="googlesheets"
                    />
                    <SheetsView serviceStatus={serviceStatus} />
                  </motion.div>
                )}

                {/* Docs */}
                {activePage === "docs" && (
                  <motion.div
                    key="docs-page"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ServicePageHeader
                      title="Docs"
                      icon={<DocsIcon />}
                      serviceStatus={serviceStatus}
                      serviceKey="googledocs"
                    />
                    <DocsView serviceStatus={serviceStatus} />
                  </motion.div>
                )}

                {/* Vercel */}
                {activePage === "vercel" && (
                  <motion.div
                    key="vercel-page"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ServicePageHeader
                      title="Vercel"
                      icon={<VercelIcon />}
                      serviceStatus={serviceStatus}
                      serviceKey="vercel"
                    />
                    <VercelView serviceStatus={serviceStatus} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Right Panel — Chat (only on Mission Control page, desktop only) */}
          {isControlPage && (
            <div className="hidden lg:flex w-[360px] border-l border-border flex-col bg-secondary/60 flex-shrink-0">
              {/* Chat Tabs */}
              <div className="flex border-b border-border">
                {["Chat", "Tasks", "History"].map((tab, i) => (
                  <div
                    key={tab}
                    className={`flex-1 py-3 text-center text-xs font-semibold cursor-pointer transition-all duration-150 border-b-2 ${
                      i === 0
                        ? "text-foreground border-emerald-500"
                        : "text-muted-foreground border-transparent hover:text-foreground/80"
                    }`}
                  >
                    {tab}
                  </div>
                ))}
              </div>
              {/* ChatView */}
              <div className="flex-1 overflow-hidden">
                <ChatView />
              </div>
            </div>
          )}
        </div>

        {/* Bottom Navigation — mobile only */}
        <BottomNav activePage={activePage} onPageChange={handlePageChange} />
      </div>
    </NotificationProvider>
  );
}

// ---------------------------------------------------------------------------
// Settings Placeholder
// ---------------------------------------------------------------------------

function SettingsPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="w-16 h-16 rounded-2xl bg-secondary border border-border flex items-center justify-center mb-4">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </div>
      <h2 className="text-lg font-bold text-foreground mb-1">Settings</h2>
      <p className="text-sm text-muted-foreground">Configuration options coming soon.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Services Grid — shows all connected services
// ---------------------------------------------------------------------------

function ServicesGrid({
  serviceStatus,
  onNavigate,
}: {
  serviceStatus: ServiceStatus | null;
  onNavigate: (key: PageKey) => void;
}) {
  const services: { key: PageKey; name: string; icon: React.ReactNode; statusKey: string }[] = [
    { key: "github", name: "GitHub", icon: <GitHubIcon className="w-6 h-6" />, statusKey: "github" },
    { key: "gmail", name: "Gmail", icon: <MailIcon className="w-6 h-6" />, statusKey: "gmail" },
    { key: "calendar", name: "Calendar", icon: <CalendarIcon className="w-6 h-6" />, statusKey: "googlecalendar" },
    { key: "drive", name: "Drive", icon: <DriveIcon className="w-6 h-6" />, statusKey: "googledrive" },
    { key: "sheets", name: "Sheets", icon: <SheetsIcon className="w-6 h-6" />, statusKey: "googlesheets" },
    { key: "docs", name: "Docs", icon: <DocsIcon className="w-6 h-6" />, statusKey: "googledocs" },
    { key: "vercel", name: "Vercel", icon: <VercelIcon className="w-6 h-6" />, statusKey: "vercel" },
  ];

  return (
    <div>
      <h2 className="text-xl font-bold text-foreground mb-1">Connected Services</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Manage your connected services and integrations.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {services.map((svc) => {
          const connected =
            serviceStatus?.[svc.statusKey as keyof ServiceStatus]?.connected ??
            false;
          return (
            <button
              key={svc.key}
              onClick={() => onNavigate(svc.key)}
              className="flex items-center gap-4 p-4 rounded-xl bg-secondary border border-border hover:bg-accent transition-all duration-150 text-left cursor-pointer"
            >
              <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground">
                {svc.icon}
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">
                  {svc.name}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {connected ? "Connected" : "Not connected"}
                </div>
              </div>
              <div className="ml-auto">
                <span
                  className={`w-2.5 h-2.5 rounded-full block ${
                    connected ? "bg-emerald-400" : "bg-muted-foreground/30"
                  }`}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Service Page Header — compact header shown above each service view
// ---------------------------------------------------------------------------

function ServicePageHeader({
  title,
  icon,
  repo,
  gmProfile,
  serviceStatus,
  serviceKey,
}: {
  title: string;
  icon: React.ReactNode;
  repo?: RepoInfo | null;
  gmProfile?: GmailProfile | null;
  serviceStatus?: ServiceStatus | null;
  serviceKey?: string;
}) {
  // Determine connection status
  let connected = false;
  if (serviceStatus && serviceKey) {
    const svc = serviceStatus[serviceKey as keyof ServiceStatus];
    if (svc && "connected" in svc) {
      connected = svc.connected;
    }
  }

  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-1">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="text-xl font-bold text-foreground">{title}</h2>
        {serviceKey && (
          <span
            className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${
              connected
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-red-500/20 text-red-400"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                connected ? "bg-emerald-400" : "bg-red-400"
              }`}
            />
            {connected ? "Connected" : "Disconnected"}
          </span>
        )}
      </div>

      {/* GitHub specific stats */}
      {repo && title === "GitHub" && (
        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
          <span>
            <span className="text-amber-400 font-semibold">{repo.stargazers_count.toLocaleString()}</span> stars
          </span>
          <span>
            <span className="text-muted-foreground font-semibold">{repo.forks_count.toLocaleString()}</span> forks
          </span>
          <span>
            <span className="text-emerald-400 font-semibold">{repo.open_issues_count}</span> open issues
          </span>
          {repo.language && (
            <span>
              <span className="w-3 h-3 rounded-full bg-orange-400 inline-block mr-1" />
              {repo.language}
            </span>
          )}
          <a
            href={repo.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors ml-auto"
          >
            View on GitHub
          </a>
        </div>
      )}

      {/* Gmail specific stats */}
      {gmProfile && title === "Gmail" && (
        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
          <span className="font-medium text-foreground">{gmProfile.emailAddress}</span>
          <span>
            <span className="text-blue-400 font-semibold">{gmProfile.messagesTotal.toLocaleString()}</span> messages
          </span>
          <span>
            <span className="text-purple-400 font-semibold">{gmProfile.threadsTotal.toLocaleString()}</span> threads
          </span>
        </div>
      )}
    </div>
  );
}
