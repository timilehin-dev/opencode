"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  GitHubIcon,
  MailIcon,
  CalendarIcon,
  DriveIcon,
  SheetsIcon,
  DocsIcon,
  VercelIcon,
  Menu,
  X,
  ChatIcon,
  AgentsIcon,
  Activity,
  Zap,
  Brain,
} from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/dashboard/notification-panel";
import { cn } from "@/lib/utils";
import type { ServiceKey, ServiceStatus } from "@/lib/types";

export type PageKey = "overview" | "chat" | "agents" | "analytics" | "automations" | "memory" | ServiceKey;

interface NavItem {
  key: PageKey;
  label: string;
  icon: React.ReactNode;
  serviceKey?: ServiceKey;
}

const navItems: NavItem[] = [
  { key: "overview", label: "Overview", icon: <LayoutDashboard className="w-5 h-5" /> },
  { key: "chat", label: "Chat", icon: <ChatIcon className="w-5 h-5" /> },
  { key: "agents", label: "Agents", icon: <AgentsIcon className="w-5 h-5" /> },
  { key: "analytics", label: "Analytics", icon: <Activity className="w-5 h-5" /> },
  { key: "automations", label: "Automations", icon: <Zap className="w-5 h-5" /> },
  { key: "memory", label: "Memory", icon: <Brain className="w-5 h-5" /> },
  { key: "github", label: "GitHub", icon: <GitHubIcon className="w-5 h-5" />, serviceKey: "github" },
  { key: "gmail", label: "Gmail", icon: <MailIcon className="w-5 h-5" />, serviceKey: "gmail" },
  { key: "calendar", label: "Calendar", icon: <CalendarIcon className="w-5 h-5" />, serviceKey: "calendar" },
  { key: "drive", label: "Drive", icon: <DriveIcon className="w-5 h-5" />, serviceKey: "drive" },
  { key: "sheets", label: "Sheets", icon: <SheetsIcon className="w-5 h-5" />, serviceKey: "sheets" },
  { key: "docs", label: "Docs", icon: <DocsIcon className="w-5 h-5" />, serviceKey: "docs" },
  { key: "vercel", label: "Vercel", icon: <VercelIcon className="w-5 h-5" />, serviceKey: "vercel" },
];

interface SidebarProps {
  activePage: PageKey;
  onPageChange: (key: PageKey) => void;
  serviceStatus: ServiceStatus | null;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

function getStatusDot(serviceKey: ServiceKey | undefined, serviceStatus: ServiceStatus | null) {
  if (!serviceKey || !serviceStatus) return null;
  const statusMap: Record<string, { connected: boolean }> = {
    github: serviceStatus.github,
    gmail: serviceStatus.gmail,
    calendar: serviceStatus.googlecalendar,
    drive: serviceStatus.googledrive,
    sheets: serviceStatus.googlesheets,
    docs: serviceStatus.googledocs,
    vercel: serviceStatus.vercel,
  };
  const svc = statusMap[serviceKey];
  if (!svc) return null;
  return (
    <span
      className={cn(
        "w-2 h-2 rounded-full flex-shrink-0",
        svc.connected ? "bg-emerald-400" : "bg-red-400/60"
      )}
    />
  );
}

function SidebarContent({
  activePage,
  onPageChange,
  serviceStatus,
  onItem,
}: {
  activePage: PageKey;
  onPageChange: (key: PageKey) => void;
  serviceStatus: ServiceStatus | null;
  onItem: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Logo / Brand */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-border/50">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <LayoutDashboard className="w-4 h-4 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-base font-bold text-foreground tracking-tight">Claw</h1>
          <p className="text-[11px] text-muted-foreground">AI Agent Hub</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto custom-scrollbar">
        {navItems.map((item) => {
          const isActive = activePage === item.key;
          return (
            <button
              key={item.key}
              onClick={() => {
                onPageChange(item.key);
                onItem();
              }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              <span
                className={cn(
                  "transition-colors duration-200",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground group-hover:text-foreground"
                )}
              >
                {item.icon}
              </span>
              <span className="flex-1 text-left">{item.label}</span>
              {item.key !== "overview" && getStatusDot(item.serviceKey, serviceStatus)}
            </button>
          );
        })}
      </nav>

      {/* Bottom section — Notifications + Theme toggle */}
      <div className="px-3 py-4 border-t border-border/50 space-y-1">
        <NotificationBell />
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs text-muted-foreground">Appearance</span>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}

export function Sidebar({
  activePage,
  onPageChange,
  serviceStatus,
  mobileOpen,
  onMobileClose,
}: SidebarProps) {
  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => !mobileOpen && onMobileClose()}
        className={cn(
          "fixed top-4 left-4 z-50 lg:hidden p-2 rounded-lg bg-card border border-border shadow-lg transition-colors",
          mobileOpen && "hidden"
        )}
        aria-label="Open navigation"
      >
        <Menu className="w-5 h-5 text-foreground" />
      </button>

      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={onMobileClose}
          />
        )}
      </AnimatePresence>

      {/* Sidebar — Desktop: always visible, Mobile: slide in */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-full w-64 bg-sidebar-background border-r border-sidebar-border flex flex-col transition-transform duration-300 lg:translate-x-0 lg:static lg:z-auto",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Mobile close button */}
        <div className="flex items-center justify-end px-4 pt-3 lg:hidden">
          <button
            onClick={onMobileClose}
            className="p-1.5 rounded-lg hover:bg-accent transition-colors"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <SidebarContent
          activePage={activePage}
          onPageChange={onPageChange}
          serviceStatus={serviceStatus}
          onItem={onMobileClose}
        />
      </aside>
    </>
  );
}
