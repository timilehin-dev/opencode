"use client";

import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/dashboard/header";
import { GitHubView } from "@/components/dashboard/github-view";
import { GmailView } from "@/components/dashboard/gmail-view";
import { CalendarView } from "@/components/dashboard/calendar-view";
import { DriveView } from "@/components/dashboard/drive-view";
import { VercelView } from "@/components/dashboard/vercel-view";
import { DocsView } from "@/components/dashboard/docs-view";
import { SheetsView } from "@/components/dashboard/sheets-view";
import type {
  ServiceKey,
  ServiceStatus,
  RepoInfo,
  GmailProfile,
} from "@/lib/types";

export default function Dashboard() {
  const [activeService, setActiveService] = useState<ServiceKey>("github");
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);
  const [repo, setRepo] = useState<RepoInfo | null>(null);
  const [gmProfile, setGmProfile] = useState<GmailProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    fetchServiceStatus();
    fetchRepo();
    fetchGmailProfile();
  }, [fetchServiceStatus, fetchRepo, fetchGmailProfile]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <Header
        activeService={activeService}
        serviceStatus={serviceStatus}
        repo={repo}
        gmProfile={gmProfile}
        onServiceChange={setActiveService}
        onClearError={() => setError(null)}
      />

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        {/* Error Banner */}
        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-3 underline hover:text-red-300">
              Dismiss
            </button>
          </div>
        )}

        {/* Service Views */}
        {activeService === "github" && (
          <GitHubView />
        )}

        {activeService === "gmail" && (
          <GmailView />
        )}

        {activeService === "calendar" && (
          <CalendarView serviceStatus={serviceStatus} />
        )}

        {activeService === "drive" && (
          <DriveView serviceStatus={serviceStatus} />
        )}

        {activeService === "sheets" && (
          <SheetsView serviceStatus={serviceStatus} />
        )}

        {activeService === "docs" && (
          <DocsView serviceStatus={serviceStatus} />
        )}

        {activeService === "vercel" && (
          <VercelView serviceStatus={serviceStatus} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-[#0c1322] mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-xs text-slate-500">
            OpenCode Control Hub &middot;{" "}
            {activeService === "github" && (
              <>GitHub &middot; Data from{" "}
                <a href="https://github.com/timilehin-dev/opencode" target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:text-emerald-400 transition-colors">timilehin-dev/opencode</a>
              </>
            )}
            {activeService === "gmail" && <>Gmail &middot; Connected via <span className="text-red-400">Composio</span></>}
            {activeService === "calendar" && <>Calendar &middot; Connected via <span className="text-blue-400">Composio</span></>}
            {activeService === "drive" && <>Drive &middot; Connected via <span className="text-green-400">Composio</span></>}
            {activeService === "sheets" && <>Sheets &middot; Connected via <span className="text-emerald-400">Composio</span></>}
            {activeService === "docs" && <>Docs &middot; Connected via <span className="text-blue-400">Composio</span></>}
            {activeService === "vercel" && <>Vercel &middot; Connected via <span className="text-slate-300">Composio</span></>}
          </p>
        </div>
      </footer>
    </div>
  );
}
