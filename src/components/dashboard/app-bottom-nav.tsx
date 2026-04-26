"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

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

interface TabConfig {
  href: string;
  label: string;
  icon: React.FC<{ className?: string }>;
}

const TABS: TabConfig[] = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/chat", label: "Chat", icon: ChatIcon },
  { href: "/agents", label: "Agents", icon: UsersIcon },
  { href: "/services", label: "Services", icon: GridIcon },
  { href: "__more__", label: "More", icon: DotsIcon },
];

const MORE_ITEMS: { href: string; label: string; emoji: string }[] = [
  { href: "/workflows", label: "Workflows", emoji: "\u26A1" },
  { href: "/taskboard", label: "Task Board", emoji: "\uD83D\uDCCB" },
  { href: "/routines", label: "Routines", emoji: "\u23F0" },
  { href: "/insights", label: "Insights", emoji: "\uD83D\uDCA1" },
  { href: "/skills", label: "Skills", emoji: "\u2728" },
  { href: "/memory", label: "Memory", emoji: "\uD83D\uDCDA" },
  { href: "/analytics", label: "Analytics", emoji: "\uD83D\uDCC8" },
  { href: "/settings", label: "Settings", emoji: "\u2699\uFE0F" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AppBottomNav() {
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const moreRef = useRef<HTMLDivElement>(null);

  // Poll notification count
  useEffect(() => {
    let cancelled = false;
    const fetchCount = async () => {
      try {
        const res = await fetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "count" }),
        });
        const json = await res.json();
        if (!cancelled && json.success && typeof json.data?.total === "number") {
          setNotifCount(json.data.total);
        }
      } catch { /* silent */ }
    };
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

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

  const isActive = (tab: TabConfig) => {
    if (tab.href === "__more__") {
      return MORE_ITEMS.some((item) => pathname === item.href);
    }
    if (tab.href === "/") return pathname === "/";
    return pathname.startsWith(tab.href);
  };

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-white/20 bg-white/80 backdrop-blur-xl backdrop-saturate-2 supports-[backdrop-filter]:bg-white/70">
      <div className="flex items-center justify-around h-[60px] pb-safe relative">
        {TABS.map((tab) => {
          const active = isActive(tab);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.label}
              href={tab.href === "__more__" ? "#" : tab.href}
              onClick={tab.href === "__more__" ? (e) => { e.preventDefault(); setShowMore((prev) => !prev); } : undefined}
              className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full relative min-h-[44px]"
            >
              <Icon
                className={cn(
                  "w-6 h-6 transition-all duration-200",
                  active ? "text-[#3730a3]" : "text-muted-foreground"
                )}
              />
              <span
                className={cn(
                  "text-[10px] font-medium transition-all duration-200 relative",
                  active ? "text-[#3730a3]" : "text-muted-foreground"
                )}
              >
                {tab.label}
                {tab.href === "/chat" && notifCount > 0 && (
                  <span className="absolute -top-1 -right-3 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-red-500 text-white text-[8px] font-bold leading-none px-1">
                    {notifCount > 9 ? "9+" : notifCount}
                  </span>
                )}
              </span>
              {active && (
                <motion.div
                  layoutId="bottom-nav-indicator"
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </Link>
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
                className="absolute bottom-[68px] right-3 z-50 bg-card border border-border rounded-lg shadow-lg overflow-hidden min-w-[160px]"
              >
                {MORE_ITEMS.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setShowMore(false)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors border-b border-border last:border-b-0 min-h-[44px]",
                        active
                          ? "bg-[#eef2ff] text-[#3730a3]"
                          : "text-foreground hover:bg-card"
                      )}
                    >
                      <span className="text-base">{item.emoji}</span>
                      <span className="text-sm font-medium">{item.label}</span>
                      {active && (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
                      )}
                    </Link>
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
