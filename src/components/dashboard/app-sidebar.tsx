"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  Zap,
  Brain,
  ChevronRightIcon,
  ChevronDownIcon,
  ServicesIcon,
} from "@/components/icons";
import { Settings as SettingsIcon } from "lucide-react";
import { NotificationBell } from "@/components/dashboard/notification-panel";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Nav item definitions
// ---------------------------------------------------------------------------

interface NavItemDef {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const coreNavItems: NavItemDef[] = [
  { href: "/", label: "Dashboard", icon: <LayoutDashboard className="w-5 h-5" /> },
  { href: "/chat", label: "Chat", icon: <ChatIcon className="w-5 h-5" /> },
  { href: "/agents", label: "Agents", icon: <AgentsIcon className="w-5 h-5" /> },
  { href: "/workflows", label: "Workflows", icon: <Zap className="w-5 h-5" /> },
  { href: "/memory", label: "Memory", icon: <Brain className="w-5 h-5" /> },
  { href: "/settings", label: "Settings", icon: <SettingsIcon className="w-5 h-5" /> },
];

const serviceNavItems: NavItemDef[] = [
  { href: "/services/github", label: "GitHub", icon: <GitHubIcon className="w-4 h-4" /> },
  { href: "/services/gmail", label: "Gmail", icon: <MailIcon className="w-4 h-4" /> },
  { href: "/services/calendar", label: "Calendar", icon: <CalendarIcon className="w-4 h-4" /> },
  { href: "/services/drive", label: "Drive", icon: <DriveIcon className="w-4 h-4" /> },
  { href: "/services/sheets", label: "Sheets", icon: <SheetsIcon className="w-4 h-4" /> },
  { href: "/services/docs", label: "Docs", icon: <DocsIcon className="w-4 h-4" /> },
  { href: "/services/vercel", label: "Vercel", icon: <VercelIcon className="w-4 h-4" /> },
];

// ---------------------------------------------------------------------------
// Sidebar content
// ---------------------------------------------------------------------------

function SidebarContent({ onItemClick }: { onItemClick?: () => void }) {
  const pathname = usePathname();
  const [servicesOpen, setServicesOpen] = useState(true);

  const isActive = (href: string) => pathname === href;
  const isServicesActive = pathname.startsWith("/services");

  return (
    <div className="flex flex-col h-full">
      {/* Logo / Brand */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-[#e8e5df]">
        <div className="w-8 h-8 rounded-lg bg-[#3730a3] flex items-center justify-center">
          <span className="text-sm font-black text-white">C</span>
        </div>
        <div>
          <h1 className="text-base font-bold text-[#1a1a1a] tracking-tight">CLAW</h1>
          <p className="text-[11px] text-[#999999] font-medium">Agent Hub</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto custom-scrollbar">
        {/* Core navigation items */}
        {coreNavItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onItemClick}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group",
                active
                  ? "bg-[#eef2ff] text-[#3730a3] font-semibold border-l-[3px] border-[#3730a3]"
                  : "text-[#6b6b6b] hover:text-[#1a1a1a] hover:bg-[#faf9f7] border-l-[3px] border-transparent"
              )}
            >
              <span
                className={cn(
                  "transition-colors duration-200",
                  active
                    ? "text-[#3730a3]"
                    : "text-[#999999] group-hover:text-[#6b6b6b]"
                )}
              >
                {item.icon}
              </span>
              <span className="flex-1 text-left">{item.label}</span>
            </Link>
          );
        })}

        {/* Divider */}
        <div className="my-2 mx-3 border-t border-[#f0ede8]" />

        {/* Services collapsible folder */}
        <button
          onClick={() => setServicesOpen(!servicesOpen)}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group border-l-[3px]",
            isServicesActive
              ? "text-[#3730a3] border-[#3730a3]"
              : "text-[#6b6b6b] hover:text-[#1a1a1a] border-transparent"
          )}
        >
          <span className={cn(
            "transition-colors duration-200",
            isServicesActive
              ? "text-[#3730a3]"
              : "text-[#999999] group-hover:text-[#6b6b6b]"
          )}>
            <ServicesIcon className="w-5 h-5" />
          </span>
          <span className="flex-1 text-left">Services</span>
          {servicesOpen ? (
            <ChevronDownIcon className="w-3.5 h-3.5 text-[#999999]" />
          ) : (
            <ChevronRightIcon className="w-3.5 h-3.5 text-[#999999]" />
          )}
        </button>

        {/* Service items (collapsible) */}
        <AnimatePresence initial={false}>
          {servicesOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="ml-3 pl-3 border-l border-[#f0ede8] space-y-0.5 py-1">
                {serviceNavItems.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onItemClick}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-200 group",
                        active
                          ? "bg-[#eef2ff] text-[#3730a3] font-semibold"
                          : "text-[#6b6b6b] hover:text-[#1a1a1a] hover:bg-[#faf9f7]"
                      )}
                    >
                      <span
                        className={cn(
                          "transition-colors duration-200",
                          active
                            ? "text-[#3730a3]"
                            : "text-[#999999] group-hover:text-[#6b6b6b]"
                        )}
                      >
                        {item.icon}
                      </span>
                      <span className="flex-1 text-left">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Bottom section — Notifications */}
      <div className="px-3 py-4 border-t border-[#e8e5df]">
        <NotificationBell />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported sidebar component
// ---------------------------------------------------------------------------

export function AppSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className={cn(
          "fixed top-4 left-4 z-50 lg:hidden p-2 rounded-lg bg-white border border-[#e8e5df] shadow-sm transition-colors",
          mobileOpen && "hidden"
        )}
        aria-label="Open navigation"
      >
        <Menu className="w-5 h-5 text-[#1a1a1a]" />
      </button>

      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/30 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar — Desktop: always visible, Mobile: slide in */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-full w-[240px] bg-white border-r border-[#e8e5df] flex flex-col transition-transform duration-300 lg:translate-x-0 lg:static lg:z-auto",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Mobile close button */}
        <div className="flex items-center justify-end px-4 pt-3 lg:hidden">
          <button
            onClick={() => setMobileOpen(false)}
            className="p-1.5 rounded-lg hover:bg-[#faf9f7] transition-colors"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5 text-[#6b6b6b]" />
          </button>
        </div>

        <SidebarContent onItemClick={() => setMobileOpen(false)} />
      </aside>
    </>
  );
}
