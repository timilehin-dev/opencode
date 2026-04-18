"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
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

const services = [
  { key: "github", name: "GitHub", icon: <GitHubIcon className="w-6 h-6" />, statusKey: "github" as const },
  { key: "gmail", name: "Gmail", icon: <MailIcon className="w-6 h-6" />, statusKey: "gmail" as const },
  { key: "calendar", name: "Calendar", icon: <CalendarIcon className="w-6 h-6" />, statusKey: "googlecalendar" as const },
  { key: "drive", name: "Drive", icon: <DriveIcon className="w-6 h-6" />, statusKey: "googledrive" as const },
  { key: "sheets", name: "Sheets", icon: <SheetsIcon className="w-6 h-6" />, statusKey: "googlesheets" as const },
  { key: "docs", name: "Docs", icon: <DocsIcon className="w-6 h-6" />, statusKey: "googledocs" as const },
  { key: "vercel", name: "Vercel", icon: <VercelIcon className="w-6 h-6" />, statusKey: "vercel" as const },
];

export default function ServicesPage() {
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/services?action=status");
        const json = await res.json();
        if (json.success) setServiceStatus(json.data);
      } catch {
        /* silent */
      }
    })();
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#1a1a1a] mb-1">Connected Services</h1>
        <p className="text-sm text-[#6b6b6b]">
          Manage your connected services and integrations.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {services.map((svc) => {
          const connected =
            serviceStatus?.[svc.statusKey]?.connected ?? false;
          return (
            <Link
              key={svc.key}
              href={`/services/${svc.key}`}
              className="flex items-center gap-4 p-5 rounded-lg bg-white border border-[#e8e5df] hover:bg-[#faf9f7] hover:border-[#d5d0c9] transition-all duration-200 shadow-sm"
            >
              <div className="w-12 h-12 rounded-lg bg-[#faf9f7] flex items-center justify-center text-[#6b6b6b]">
                {svc.icon}
              </div>
              <div>
                <div className="text-sm font-semibold text-[#1a1a1a]">
                  {svc.name}
                </div>
                <div className={`text-xs mt-0.5 ${connected ? "text-emerald-600" : "text-[#999999]"}`}>
                  {connected ? "Connected" : "Not connected"}
                </div>
              </div>
              <div className="ml-auto">
                <span
                  className={`w-2.5 h-2.5 rounded-full block ${
                    connected ? "bg-emerald-500" : "bg-[#d5d0c9]"
                  }`}
                />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
