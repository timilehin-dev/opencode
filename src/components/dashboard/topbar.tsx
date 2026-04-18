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
    <header className="flex items-center justify-between px-4 sm:px-6 h-14 bg-[#0d1117]/90 backdrop-blur-xl border-b border-white/[0.06] z-10 flex-shrink-0 relative"
      style={{ boxShadow: "0 1px 0 0 rgba(16, 185, 129, 0.05), 0 4px 20px rgba(0, 0, 0, 0.2)" }}
    >
      {/* Left: Logo + Nav (desktop) / Logo + Hamburger (mobile) */}
      <div className="flex items-center gap-8">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white text-sm font-black neon-glow">
            C
          </div>
          <div className="text-base font-extrabold tracking-tight text-white">
            CLAW<span className="text-emerald-400">HUB</span>
          </div>
        </div>

        {/* Nav Items — desktop only (lg+) */}
        <nav className="hidden lg:flex gap-1">
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
                  "px-3.5 py-1.5 text-[13px] font-medium rounded-lg cursor-pointer transition-all duration-200",
                  isActive
                    ? "text-white bg-emerald-500/20 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
                    : "text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent"
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
        <button className="hidden sm:flex w-9 h-9 rounded-lg items-center justify-center cursor-pointer text-slate-400 hover:bg-white/[0.04] hover:text-white transition-all duration-200">
          <Search className="w-[18px] h-[18px]" />
        </button>

        {/* Notifications */}
        <NotificationBellTopbar />

        {/* User Pill — desktop only */}
        <div className="hidden sm:flex items-center gap-2 pl-2.5 pr-3 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06] cursor-pointer hover:border-white/[0.1] transition-all duration-200">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-emerald-500 to-emerald-600" />
          <span className="text-xs font-semibold text-slate-200">User</span>
        </div>

        {/* Hamburger — mobile only (shown on < lg) */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="lg:hidden w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer text-slate-400 hover:bg-white/[0.04] hover:text-white transition-all duration-200"
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
              className="fixed inset-0 top-14 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
            {/* Menu Panel */}
            <motion.div
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -8, height: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute top-full left-0 right-0 z-50 bg-[#0d1117]/95 backdrop-blur-xl border-b border-white/[0.06] overflow-hidden lg:hidden"
              style={{ boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)" }}
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
                        "w-full text-left px-4 py-3 rounded-lg text-sm font-medium cursor-pointer transition-all duration-200",
                        isActive
                          ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/15"
                          : "text-slate-400 hover:text-white hover:bg-white/[0.04]"
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
    <button className="relative w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer text-slate-400 hover:bg-white/[0.04] hover:text-white transition-all duration-200">
      <Bell className="w-[18px] h-[18px]" />
      <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-red-500 text-white text-[8px] font-extrabold flex items-center justify-center ring-2 ring-[#0d1117]">
        3
      </span>
    </button>
  );
}
