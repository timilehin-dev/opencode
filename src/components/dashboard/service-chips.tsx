"use client";

import { cn } from "@/lib/utils";

import {
  GitHubIcon,
  MailIcon,
  CalendarIcon,
  DriveIcon,
  SheetsIcon,
  DocsIcon,
  VercelIcon,
} from "@/components/icons";
import type { ServiceStatus } from "@/lib/types";

const SERVICES = [
  {
    key: "github",
    name: "GitHub",
    icon: GitHubIcon,
    iconBg: "bg-[#161b22] border border-[#30363d]",
    statusKey: "github" as const,
  },
  {
    key: "gmail",
    name: "Gmail",
    icon: MailIcon,
    iconBg: "bg-red-500",
    statusKey: "gmail" as const,
  },
  {
    key: "calendar",
    name: "Calendar",
    icon: CalendarIcon,
    iconBg: "bg-blue-500",
    statusKey: "googlecalendar" as const,
  },
  {
    key: "drive",
    name: "Drive",
    icon: DriveIcon,
    iconBg: "bg-amber-400",
    statusKey: "googledrive" as const,
  },
  {
    key: "sheets",
    name: "Sheets",
    icon: SheetsIcon,
    iconBg: "bg-green-600",
    statusKey: "googlesheets" as const,
  },
  {
    key: "docs",
    name: "Docs",
    icon: DocsIcon,
    iconBg: "bg-blue-500",
    statusKey: "googledocs" as const,
  },
  {
    key: "vercel",
    name: "Vercel",
    icon: VercelIcon,
    iconBg: "bg-white border border-white/20",
    statusKey: "vercel" as const,
  },
];

interface ServiceChipsProps {
  serviceStatus: ServiceStatus | null;
}

export function ServiceChips({ serviceStatus }: ServiceChipsProps) {
  return (
    <div className="flex gap-2.5 mb-5 overflow-x-auto scrollbar-none pb-1">
      {SERVICES.map((svc) => {
        const Icon = svc.icon;
        const connected = serviceStatus?.[svc.statusKey]?.connected ?? false;

        return (
          <div
            key={svc.key}
            className="flex items-center gap-2 px-3.5 py-2 rounded-[10px] bg-white/[0.03] border border-white/[0.06] cursor-pointer transition-all duration-200 whitespace-nowrap flex-shrink-0 hover:bg-white/[0.06] hover:border-white/[0.1]"
          >
            <div
              className={cn(
                "w-7 h-7 rounded-[7px] flex items-center justify-center",
                svc.iconBg
              )}
            >
              <Icon className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-200">
                {svc.name}
              </div>
              <div
                className={cn(
                  "text-[9px] font-bold uppercase tracking-[0.5px]",
                  connected ? "text-emerald-400" : "text-slate-600"
                )}
              >
                {connected ? "Connected" : "Offline"}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
