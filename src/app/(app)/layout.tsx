"use client";

import { NotificationProvider } from "@/context/notification-context";
import { NotificationPanel } from "@/components/dashboard/notification-panel";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { AppBottomNav } from "@/components/dashboard/app-bottom-nav";
import type { PageKey } from "@/components/dashboard/sidebar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Notification provider needs an onNavigate that converts paths to PageKeys
  const handleNotificationNavigate = (key: PageKey) => {
    // Map PageKeys to actual routes for client-side navigation
    const routeMap: Record<string, string> = {
      control: "/",
      chat: "/chat",
      agents: "/agents",
      services: "/services",
      automations: "/workflows",
      workflows: "/workflows",
      memory: "/memory",
      analytics: "/analytics",
      settings: "/settings",
      github: "/services/github",
      gmail: "/services/gmail",
      calendar: "/services/calendar",
      drive: "/services/drive",
      sheets: "/services/sheets",
      docs: "/services/docs",
      vercel: "/services/vercel",
    };
    const path = routeMap[key as string] || "/";
    window.location.href = path;
  };

  return (
    <NotificationProvider onNavigate={handleNotificationNavigate}>
      <div className="h-screen flex overflow-hidden bg-[#f5f3ef]">
        {/* Left Sidebar (desktop) */}
        <AppSidebar />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto custom-scrollbar mobile-scroll pb-[var(--bottom-nav-height)]">
          <div className="min-h-full">
            {children}
          </div>
        </main>

        {/* Bottom Nav (mobile) */}
        <AppBottomNav />

        {/* Notification slide-out panel */}
        <NotificationPanel />
      </div>
    </NotificationProvider>
  );
}
