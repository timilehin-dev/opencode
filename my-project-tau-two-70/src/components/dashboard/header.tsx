// @deprecated — This component is not currently used in the application.
// Consider removing in a future cleanup.
"use client";

import {
  GitHubIcon,
  MailIcon,
  CalendarIcon,
  DriveIcon,
  SheetsIcon,
  DocsIcon,
  VercelIcon,
  StarIcon,
  ForkIcon,
  IssuesIcon,
  ExternalLinkIcon,
} from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";
import type { ServiceKey, ServiceStatus, RepoInfo, GmailProfile } from "@/lib/types";

interface HeaderProps {
  activeService: ServiceKey;
  serviceStatus: ServiceStatus | null;
  repo: RepoInfo | null;
  gmProfile: GmailProfile | null;
  onServiceChange: (key: ServiceKey) => void;
  onClearError: () => void;
}

const serviceButtons: { key: ServiceKey; label: string; icon: React.ReactNode; activeClass: string }[] = [
  { key: "github", label: "GitHub", icon: <GitHubIcon className="w-5 h-5" />, activeClass: "bg-slate-700 text-white shadow-sm" },
  { key: "gmail", label: "Gmail", icon: <MailIcon className="w-5 h-5" />, activeClass: "bg-red-600/90 text-white shadow-sm" },
  { key: "calendar", label: "Calendar", icon: <CalendarIcon className="w-5 h-5" />, activeClass: "bg-blue-600/90 text-white shadow-sm" },
  { key: "drive", label: "Drive", icon: <DriveIcon className="w-5 h-5" />, activeClass: "bg-yellow-600/90 text-white shadow-sm" },
  { key: "sheets", label: "Sheets", icon: <SheetsIcon className="w-5 h-5" />, activeClass: "bg-emerald-600/90 text-white shadow-sm" },
  { key: "docs", label: "Docs", icon: <DocsIcon className="w-5 h-5" />, activeClass: "bg-blue-500/90 text-white shadow-sm" },
  { key: "vercel", label: "Vercel", icon: <VercelIcon className="w-5 h-5" />, activeClass: "bg-gray-100 text-black shadow-sm" },
];

export function Header({ activeService, serviceStatus, repo, gmProfile, onServiceChange, onClearError }: HeaderProps) {
  return (
    <header className="border-b border-slate-800 bg-[#0c1322]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              OpenCode
              <span className="text-slate-400 font-normal ml-2 text-base sm:text-lg">
                Control Hub
              </span>
            </h1>
            <p className="text-slate-500 text-xs mt-0.5">Your unified dashboard for services</p>
          </div>

          <div className="flex items-center gap-2">
            {/* Service Switcher */}
            <div className="flex items-center gap-1 bg-[#1a2332] rounded-lg p-1 overflow-x-auto max-w-[calc(100vw-8rem)] sm:max-w-none">
              {serviceButtons.map((svc) => (
                <button
                  key={svc.key}
                  onClick={() => { onServiceChange(svc.key); onClearError(); }}
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-md text-sm font-medium transition-colors flex-shrink-0 ${
                    activeService === svc.key
                      ? svc.activeClass
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {svc.icon}
                  <span className="hidden sm:inline">{svc.label}</span>
                </button>
              ))}
            </div>

            {/* Theme Toggle */}
            <ThemeToggle />
          </div>
        </div>

        {/* Service-specific stats */}
        {activeService === "github" && repo && (
          <div className="flex items-center gap-5 mt-4 flex-wrap">
            <div className="flex items-center gap-1.5 text-sm text-slate-300">
              <span className="text-amber-400"><StarIcon /></span>
              <span className="font-semibold">{repo.stargazers_count.toLocaleString()}</span>
              <span className="text-slate-500 hidden sm:inline">stars</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-slate-300">
              <span className="text-slate-400"><ForkIcon /></span>
              <span className="font-semibold">{repo.forks_count.toLocaleString()}</span>
              <span className="text-slate-500 hidden sm:inline">forks</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-slate-300">
              <span className="text-emerald-400"><IssuesIcon /></span>
              <span className="font-semibold">{repo.open_issues_count}</span>
              <span className="text-slate-500 hidden sm:inline">open issues</span>
            </div>
            {repo.language && (
              <div className="flex items-center gap-1.5 text-sm text-slate-300">
                <span className="w-3 h-3 rounded-full bg-orange-400 inline-block" />
                <span>{repo.language}</span>
              </div>
            )}
            <a
              href={repo.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors ml-auto"
            >
              View on GitHub <ExternalLinkIcon />
            </a>
          </div>
        )}

        {activeService === "gmail" && gmProfile && (
          <div className="flex items-center gap-5 mt-4 flex-wrap">
            <div className="flex items-center gap-1.5 text-sm text-slate-300">
              <MailIcon />
              <span className="font-semibold">{gmProfile.emailAddress}</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-slate-300">
              <span className="text-blue-400">{gmProfile.messagesTotal.toLocaleString()}</span>
              <span className="text-slate-500">messages</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-slate-300">
              <span className="text-purple-400">{gmProfile.threadsTotal.toLocaleString()}</span>
              <span className="text-slate-500">threads</span>
            </div>
          </div>
        )}

        {activeService === "calendar" && serviceStatus?.googlecalendar.connected && (
          <div className="flex items-center gap-5 mt-4 flex-wrap">
            <div className="flex items-center gap-1.5 text-sm text-slate-300">
              <CalendarIcon />
              <span className="font-semibold">Google Calendar</span>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs bg-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-full font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              Connected
            </span>
          </div>
        )}

        {activeService === "drive" && serviceStatus?.googledrive.connected && (
          <div className="flex items-center gap-5 mt-4 flex-wrap">
            <div className="flex items-center gap-1.5 text-sm text-slate-300">
              <DriveIcon />
              <span className="font-semibold">Google Drive</span>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs bg-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-full font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              Connected
            </span>
          </div>
        )}

        {activeService === "sheets" && serviceStatus?.googlesheets.connected && (
          <div className="flex items-center gap-5 mt-4 flex-wrap">
            <div className="flex items-center gap-1.5 text-sm text-slate-300">
              <SheetsIcon />
              <span className="font-semibold">Google Sheets</span>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs bg-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-full font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              Connected
            </span>
          </div>
        )}

        {activeService === "docs" && serviceStatus?.googledocs.connected && (
          <div className="flex items-center gap-5 mt-4 flex-wrap">
            <div className="flex items-center gap-1.5 text-sm text-slate-300">
              <DocsIcon />
              <span className="font-semibold">Google Docs</span>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs bg-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-full font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              Connected
            </span>
          </div>
        )}

        {activeService === "vercel" && serviceStatus?.vercel.connected && (
          <div className="flex items-center gap-5 mt-4 flex-wrap">
            <div className="flex items-center gap-1.5 text-sm text-slate-300">
              <VercelIcon />
              <span className="font-semibold">Vercel</span>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs bg-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-full font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              Connected
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
