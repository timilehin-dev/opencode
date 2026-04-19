"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ServiceStatus, RepoInfo, GmailProfile } from "@/lib/types";

interface ServicePageHeaderProps {
  title: string;
  icon: React.ReactNode;
  repo?: RepoInfo | null;
  gmProfile?: GmailProfile | null;
  serviceStatus?: ServiceStatus | null;
  serviceKey?: string;
}

export function ServicePageHeader({
  title,
  icon,
  repo,
  gmProfile,
  serviceStatus,
  serviceKey,
}: ServicePageHeaderProps) {
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
      <div className="flex items-center gap-3 mb-2">
        <Link
          href="/services"
          className="text-xs text-[#999999] hover:text-[#3730a3] transition-colors font-medium"
        >
          &larr; Services
        </Link>
      </div>
      <div className="flex items-center gap-3 mb-1">
        <span className="text-[#6b6b6b]">{icon}</span>
        <h1 className="text-2xl font-bold text-[#1a1a1a]">{title}</h1>
        {serviceKey && (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium",
              connected
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-700"
            )}
          >
            <span
              className={cn(
                "w-2 h-2 rounded-full",
                connected ? "bg-emerald-500" : "bg-red-500"
              )}
            />
            {connected ? "Connected" : "Disconnected"}
          </span>
        )}
      </div>

      {/* GitHub specific stats */}
      {repo && title === "GitHub" && (
        <div className="flex items-center gap-4 mt-2 text-sm text-[#6b6b6b] flex-wrap">
          <span>
            <span className="text-[#d97706] font-semibold">{repo.stargazers_count.toLocaleString()}</span> stars
          </span>
          <span>
            <span className="text-[#1a1a1a] font-semibold">{repo.forks_count.toLocaleString()}</span> forks
          </span>
          <span>
            <span className="text-[#059669] font-semibold">{repo.open_issues_count}</span> open issues
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
            className="text-xs text-[#3730a3] hover:underline transition-colors ml-auto"
          >
            View on GitHub
          </a>
        </div>
      )}

      {/* Gmail specific stats */}
      {gmProfile && title === "Gmail" && (
        <div className="flex items-center gap-4 mt-2 text-sm text-[#6b6b6b] flex-wrap">
          <span className="font-medium text-[#1a1a1a]">{gmProfile.emailAddress}</span>
          <span>
            <span className="text-[#3730a3] font-semibold">{gmProfile.messagesTotal.toLocaleString()}</span> messages
          </span>
          <span>
            <span className="text-[#059669] font-semibold">{gmProfile.threadsTotal.toLocaleString()}</span> threads
          </span>
        </div>
      )}
    </div>
  );
}
