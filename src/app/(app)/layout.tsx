"use client";

import { useRouter } from "next/navigation";
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
  const router = useRouter();

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
      taskboard: "/taskboard",
      routines: "/routines",
      insights: "/insights",
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
    router.push(path);
  };

  return (
    <NotificationProvider onNavigate={handleNotificationNavigate}>
      <div className="h-dvh h-screen flex overflow-hidden bg-secondary">
        {/* Left Sidebar (desktop) */}
        <AppSidebar />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto custom-scrollbar mobile-scroll pb-[var(--bottom-nav-height)]">
          <div className="min-h-full">
            {children}
          </div>
          {/* Legal footer — required by Google OAuth verification */}
          <footer className="px-6 py-4 text-center text-[11px] text-muted-foreground border-t border-border/40">
            <span className="opacity-70">&copy; {new Date().getFullYear()} Klawhub.</span>{" "}
            <a href="/privacy-policy" className="underline hover:text-foreground transition-colors">Privacy Policy</a>
            {" · "}
            <a href="/terms-of-service" className="underline hover:text-foreground transition-colors">Terms of Service</a>
          </footer>
        </main>

        {/* Bottom Nav (mobile) */}
        <AppBottomNav />

        {/* Notification slide-out panel */}
        <NotificationPanel />
      </div>
    </NotificationProvider>
  );
}
