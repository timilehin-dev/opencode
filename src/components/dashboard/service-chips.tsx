"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

import {
  GitHubIcon,
  GmailIcon,
  GoogleCalendarIcon,
  GoogleDriveIcon,
  GoogleSheetsIcon,
  GoogleDocsIcon,
  VercelBrandIcon,
} from "@/components/icons";
import type { ServiceStatus } from "@/lib/types";

const SERVICES = [
  {
    key: "github",
    name: "GitHub",
    href: "/services/github",
    icon: GitHubIcon,
    iconBg: "bg-[#161b22] border border-[#30363d]",
    iconColor: "text-white",
    statusKey: "github" as const,
  },
  {
    key: "gmail",
    name: "Gmail",
    href: "/services/gmail",
    icon: GmailIcon,
    iconBg: "bg-white border border-[#dadce0]",
    iconColor: "text-[#EA4335]",
    statusKey: "gmail" as const,
  },
  {
    key: "calendar",
    name: "Calendar",
    href: "/services/calendar",
    icon: GoogleCalendarIcon,
    iconBg: "bg-white border border-[#dadce0]",
    iconColor: "text-[#4285F4]",
    statusKey: "googlecalendar" as const,
  },
  {
    key: "drive",
    name: "Drive",
    href: "/services/drive",
    icon: GoogleDriveIcon,
    iconBg: "bg-white border border-[#dadce0]",
    iconColor: "text-[#0066DA]",
    statusKey: "googledrive" as const,
  },
  {
    key: "sheets",
    name: "Sheets",
    href: "/services/sheets",
    icon: GoogleSheetsIcon,
    iconBg: "bg-white border border-[#dadce0]",
    iconColor: "text-[#0F9D58]",
    statusKey: "googlesheets" as const,
  },
  {
    key: "docs",
    name: "Docs",
    href: "/services/docs",
    icon: GoogleDocsIcon,
    iconBg: "bg-white border border-[#dadce0]",
    iconColor: "text-[#4285F4]",
    statusKey: "googledocs" as const,
  },
  {
    key: "vercel",
    name: "Vercel",
    href: "/services/vercel",
    icon: VercelBrandIcon,
    iconBg: "bg-[#1a1a1a] border border-[#333]",
    iconColor: "text-white",
    statusKey: "vercel" as const,
  },
];

interface ServiceChipsProps {
  serviceStatus: ServiceStatus | null;
}

export function ServiceChips({ serviceStatus }: ServiceChipsProps) {
  return (
    <div className="flex gap-2.5 overflow-x-auto scrollbar-none pb-1">
      {SERVICES.map((svc) => {
        const Icon = svc.icon;
        const connected = serviceStatus?.[svc.statusKey]?.connected ?? false;

        return (
          <Link
            key={svc.key}
            href={svc.href}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-[#e8e5df] cursor-pointer transition-all duration-200 whitespace-nowrap flex-shrink-0 hover:bg-[#faf9f7] hover:border-[#d5d0c9] shadow-sm"
          >
            <div className={cn("w-7 h-7 rounded-md flex items-center justify-center", svc.iconBg)}>
              <Icon className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-[#1a1a1a]">
                {svc.name}
              </div>
              <div className={cn("text-[9px] font-semibold uppercase tracking-wider", connected ? "text-emerald-600" : "text-[#999999]")}>
                {connected ? "Connected" : "Offline"}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
