"use client";

import { Search, Bell } from "@/components/icons";
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
  return (
    <header className="flex items-center justify-between px-6 h-14 bg-zinc-950/80 backdrop-blur-xl border-b border-white/[0.06] z-10 flex-shrink-0">
      {/* Left: Logo + Nav */}
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

        {/* Nav Items */}
        <nav className="flex gap-0.5">
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
        {/* Search */}
        <button className="w-9 h-9 rounded-[10px] flex items-center justify-center cursor-pointer text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-50 transition-all duration-150">
          <Search className="w-[18px] h-[18px]" />
        </button>

        {/* Notifications */}
        <NotificationBellTopbar />

        {/* User Pill */}
        <div className="flex items-center gap-2 pl-2 pr-3 py-1 rounded-[10px] bg-white/[0.04] border border-white/[0.06] cursor-pointer">
          <div className="w-7 h-7 rounded-[7px] bg-gradient-to-br from-emerald-500 to-emerald-600" />
          <span className="text-xs font-semibold text-zinc-300">User</span>
        </div>
      </div>
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
