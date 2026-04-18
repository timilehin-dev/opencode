"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { PageKey } from "@/components/dashboard/sidebar";

// ---------------------------------------------------------------------------
// SVG Icon components (inline for bottom-nav)
// ---------------------------------------------------------------------------

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function DotsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Tab configuration
// ---------------------------------------------------------------------------

type BottomTabKey = PageKey | "__more__";

interface TabConfig {
  key: BottomTabKey;
  label: string;
  icon: React.FC<{ className?: string }>;
}

const TABS: TabConfig[] = [
  { key: "control", label: "Home", icon: HomeIcon },
  { key: "chat", label: "Chat", icon: ChatIcon },
  { key: "agents", label: "Agents", icon: UsersIcon },
  { key: "services", label: "Services", icon: GridIcon },
  { key: "__more__", label: "More", icon: DotsIcon },
];

const MORE_ITEMS: { key: PageKey; label: string; emoji: string }[] = [
  { key: "automations", label: "Workflows", emoji: "\u26A1" },
  { key: "memory", label: "Memory", emoji: "\uD83D\uDCDA" },
  { key: "settings", label: "Settings", emoji: "\u2699\uFE0F" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface BottomNavProps {
  activePage: PageKey;
  onPageChange: (key: PageKey) => void;
}

export function BottomNav({ activePage, onPageChange }: BottomNavProps) {
  const [showMore, setShowMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Close more menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setShowMore(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleTabTap = (key: BottomTabKey) => {
    if (key === "__more__") {
      setShowMore((prev) => !prev);
      return;
    }
    setShowMore(false);
    onPageChange(key);
  };

  const handleMoreItem = (key: PageKey) => {
    setShowMore(false);
    onPageChange(key);
  };

  // Determine if a tab is "active" — for More, check if activePage is one of its children
  const isActive = (tab: TabConfig) => {
    if (tab.key === "__more__") {
      return MORE_ITEMS.some((item) => item.key === activePage);
    }
    return activePage === tab.key;
  };

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0d1117]/90 backdrop-blur-xl border-t border-white/[0.06]"
      style={{ boxShadow: "0 -1px 0 0 rgba(16, 185, 129, 0.05), 0 -4px 20px rgba(0, 0, 0, 0.2)" }}
    >
      <div className="flex items-center justify-around h-[60px] pb-safe relative">
        {TABS.map((tab) => {
          const active = isActive(tab);
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => handleTabTap(tab.key)}
              className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full relative cursor-pointer"
            >
              <Icon
                className={cn(
                  "w-[22px] h-[22px] transition-all duration-200",
                  active ? "text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "text-slate-500"
                )}
              />
              <span
                className={cn(
                  "text-[10px] font-medium transition-all duration-200",
                  active ? "text-emerald-400" : "text-slate-500"
                )}
              >
                {tab.label}
              </span>
              {active && (
                <motion.div
                  layoutId="bottom-nav-indicator"
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          );
        })}

        {/* More Overlay */}
        <AnimatePresence>
          {showMore && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40"
                onClick={() => setShowMore(false)}
              />
              {/* Menu */}
              <motion.div
                ref={moreRef}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute bottom-[68px] right-3 z-50 bg-[#151a25]/95 backdrop-blur-xl border border-white/[0.06] rounded-xl shadow-2xl overflow-hidden min-w-[160px]"
                style={{ boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)" }}
              >
                {MORE_ITEMS.map((item) => {
                  const active = activePage === item.key;
                  return (
                    <button
                      key={item.key}
                      onClick={() => handleMoreItem(item.key)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors cursor-pointer border-b border-white/[0.04] last:border-b-0",
                        active
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "text-slate-300 hover:bg-white/[0.04]"
                      )}
                    >
                      <span className="text-base">{item.emoji}</span>
                      <span className="text-sm font-medium">{item.label}</span>
                      {active && (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
                      )}
                    </button>
                  );
                })}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
