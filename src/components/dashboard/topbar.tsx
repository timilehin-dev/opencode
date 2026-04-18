"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Bell, X } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { PageKey } from "@/components/dashboard/sidebar";

const NAV_ITEMS: { key: PageKey; label: string }[] = [
  { key: "control", label: "Mission Control" },
  { key: "agents", label: "Agent Crew" },
  { key: "services", label: "Services" },
  { key: "automations", label: "Workflows" },
  { key: "memory", label: "Memory" },
  { key: "settings", label: "Settings" },
];

interface TopbarProps {
  activePage: PageKey;
  onPageChange: (key: PageKey) => void;
}

export function Topbar({ activePage, onPageChange }: TopbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavClick = (key: PageKey) => {
    onPageChange(key);
    setMobileMenuOpen(false);
  };

  return (
    <header className="flex items-center justify-between px-4 sm:px-6 h-14 bg-zinc-950/80 backdrop-blur-xl border-b border-white/[0.06] z-10 flex-shrink-0 relative">
      {/* Left: Logo + Nav (desktop) / Logo + Hamburger (mobile) */}
      <div className="flex items-center gap-8">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white text-sm font-black">
            C
          </div>
          <div className="text-base font-extrabold tracking-tight">
            CLAW<span className="text-emerald-400">HUB</span>
          </div>
        </div>

        {/* Nav Items — desktop only (lg+) */}
        <nav className="hidden lg:flex gap-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.key === "control"
                ? activePage === "control"
                : activePage === item.key;
            return (
              <button
                key={item.key}
                onClick={() => onPageChange(item.key)}
                className={cn(
                  "px-3.5 py-1.5 text-[13px] font-medium rounded-lg cursor-pointer transition-all duration-150",
                  isActive
                    ? "text-zinc-50 bg-white/[0.06]"
                    : "text-zinc-500 hover:text-zinc-400 hover:bg-white/[0.03]"
                )}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Right: Search + Notifications + User */}
      <div className="flex items-center gap-2">
        {/* Search — desktop only */}
        <button className="hidden sm:flex w-9 h-9 rounded-[10px] items-center justify-center cursor-pointer text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-50 transition-all duration-150">
          <Search className="w-[18px] h-[18px]" />
        </button>

        {/* Notifications */}
        <NotificationBellTopbar />

        {/* User Pill — desktop only */}
        <div className="hidden sm:flex items-center gap-2 pl-2 pr-3 py-1 rounded-[10px] bg-white/[0.04] border border-white/[0.06] cursor-pointer">
          <div className="w-7 h-7 rounded-[7px] bg-gradient-to-br from-emerald-500 to-emerald-600" />
          <span className="text-xs font-semibold text-zinc-300">User</span>
        </div>

        {/* Hamburger — mobile only (shown on < lg) */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="lg:hidden w-9 h-9 rounded-[10px] flex items-center justify-center cursor-pointer text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-50 transition-all duration-150"
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? (
            <X className="w-5 h-5" />
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile Slide-Down Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 top-14 z-40 bg-black/40 lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
            {/* Menu Panel */}
            <motion.div
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -8, height: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute top-full left-0 right-0 z-50 bg-zinc-950/95 backdrop-blur-xl border-b border-white/[0.06] overflow-hidden lg:hidden"
            >
              <div className="px-4 py-3 space-y-1">
                {NAV_ITEMS.map((item) => {
                  const isActive =
                    item.key === "control"
                      ? activePage === "control"
                      : activePage === item.key;
                  return (
                    <button
                      key={item.key}
                      onClick={() => handleNavClick(item.key)}
                      className={cn(
                        "w-full text-left px-4 py-3 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150",
                        isActive
                          ? "text-emerald-400 bg-emerald-500/10"
                          : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                      )}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}

/** Compact bell button for the topbar (renders inline, not as a sidebar item) */
function NotificationBellTopbar() {
  return (
    <button className="relative w-9 h-9 rounded-[10px] flex items-center justify-center cursor-pointer text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-50 transition-all duration-150">
      <Bell className="w-[18px] h-[18px]" />
      <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-red-500 text-white text-[8px] font-extrabold flex items-center justify-center">
        3
      </span>
    </button>
  );
}
