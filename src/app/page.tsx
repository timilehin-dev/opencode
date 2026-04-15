"use client";

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { NotificationProvider } from "@/context/notification-context";
import { NotificationPanel } from "@/components/dashboard/notification-panel";
import { Sidebar, type PageKey } from "@/components/dashboard/sidebar";
import { OverviewPage } from "@/components/dashboard/overview";
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
import type {
  ServiceStatus,
  RepoInfo,
  GmailProfile,
} from "@/lib/types";

export default function Dashboard() {
  const [activePage, setActivePage] = useState<PageKey>("overview");
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);
  const [repo, setRepo] = useState<RepoInfo | null>(null);
  const [gmProfile, setGmProfile] = useState<GmailProfile | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

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
  // Render
  // ---------------------------------------------------------------------------

  return (
    <NotificationProvider onNavigate={handlePageChange}>
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Notification slide-out panel */}
      <NotificationPanel />

      {/* Sidebar */}
      <Sidebar
        activePage={activePage}
        onPageChange={handlePageChange}
        serviceStatus={serviceStatus}
        mobileOpen={mobileSidebarOpen}
        onMobileToggle={() => setMobileSidebarOpen(prev => !prev)}
      />

      {/* Main Content */}
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pt-16 lg:pt-6">
          <AnimatePresence mode="wait">
            {activePage === "overview" && (
              <OverviewPage
                key="overview"
                onNavigate={handlePageChange}
              />
            )}

            {activePage === "chat" && (
              <motion.div key="chat-page" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2 }}>
                <ChatView key="chat" />
              </motion.div>
            )}

            {activePage === "agents" && (
              <motion.div key="agents-page" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2 }}>
                <AgentsView key="agents" onNavigate={handlePageChange} />
              </motion.div>
            )}

            {activePage === "analytics" && (
              <motion.div key="analytics-page" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2 }}>
                <AnalyticsView key="analytics" onNavigate={handlePageChange} />
              </motion.div>
            )}

            {activePage === "automations" && (
              <motion.div key="automations-page" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2 }}>
                <AutomationsView key="automations" onNavigate={handlePageChange} />
              </motion.div>
            )}

            {activePage === "memory" && (
              <motion.div key="memory-page" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2 }}>
                <MemoryView key="memory" onNavigate={handlePageChange} />
              </motion.div>
            )}

            {activePage === "github" && (
              <motion.div
                key="github-page"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.2 }}
              >
                {/* Service header for GitHub */}
                <ServicePageHeader
                  title="GitHub"
                  icon={<GitHubIcon />}
                  repo={repo}
                />
                <GitHubView />
              </motion.div>
            )}

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
      </main>
    </div>
    </NotificationProvider>
  );
}

// ---------------------------------------------------------------------------
// Service Page Header — compact header shown above each service view
// ---------------------------------------------------------------------------

import {
  GitHubIcon,
  MailIcon,
  CalendarIcon,
  DriveIcon,
  SheetsIcon,
  DocsIcon,
  VercelIcon,
} from "@/components/icons";

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
        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
          <span>
            <span className="text-amber-400 font-semibold">{repo.stargazers_count.toLocaleString()}</span> stars
          </span>
          <span>
            <span className="text-slate-400 font-semibold">{repo.forks_count.toLocaleString()}</span> forks
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
            className="text-xs text-primary hover:text-primary/80 transition-colors ml-auto"
          >
            View on GitHub
          </a>
        </div>
      )}

      {/* Gmail specific stats */}
      {gmProfile && title === "Gmail" && (
        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
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
