"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  BellOff,
  Mail,
  Calendar,
  GitHubIcon,
  CheckCheck,
  Trash2,
  X,
  Loader2,
  Inbox,
  MonitorUp,
} from "@/components/icons";
import { useNotifications } from "@/context/notification-context";
import { cn } from "@/lib/utils";
import {
  TYPE_STYLES,
  PRIORITY_CONFIG,
  formatNotifTime,
  groupByTime,
} from "@/lib/notifications";
import type { NotificationType, AppNotification } from "@/lib/notifications";

// ---------------------------------------------------------------------------
// Notification type → Lucide icon
// ---------------------------------------------------------------------------

function NotifTypeIcon({ type }: { type: NotificationType }) {
  const iconProps = { className: "w-4 h-4" };
  switch (type) {
    case "email":
      return <Mail {...iconProps} />;
    case "calendar":
      return <Calendar {...iconProps} />;
    case "github":
      return <GitHubIcon {...iconProps} />;
    case "agent":
      return <MonitorUp {...iconProps} />;
    default:
      return <Bell {...iconProps} />;
  }
}

// ---------------------------------------------------------------------------
// Single notification row
// ---------------------------------------------------------------------------

function NotifRow({ notif }: { notif: AppNotification }) {
  const { markAsRead, dismiss, onNavigate } = useNotifications();
  const style = TYPE_STYLES[notif.type];
  const priorityCfg = PRIORITY_CONFIG[notif.priority];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "group relative flex gap-3 px-4 py-3 transition-colors cursor-pointer",
        "hover:bg-accent/50 border-b border-border/30 last:border-b-0",
        !notif.read && "bg-primary/[0.03]",
      )}
      onClick={() => {
        markAsRead(notif.id);
        if (notif.actionUrl && onNavigate) {
          onNavigate(notif.actionUrl as Parameters<typeof onNavigate>[0]);
        }
      }}
    >
      {/* Unread dot */}
      {!notif.read && (
        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary" />
      )}

      {/* Icon */}
      <div
        className={cn(
          "flex-shrink-0 w-9 h-9 rounded-lg border flex items-center justify-center mt-0.5",
          style.bgColor,
          style.borderColor,
          style.color,
        )}
      >
        <NotifTypeIcon type={notif.type} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              "text-sm leading-snug truncate",
              notif.read ? "text-muted-foreground font-normal" : "text-foreground font-medium",
            )}
          >
            {notif.title}
          </p>
          <span
            className={cn(
              "flex-shrink-0 w-2 h-2 rounded-full mt-1.5",
              priorityCfg.dotColor,
            )}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">
          {notif.body}
        </p>
        <p className="text-[11px] text-muted-foreground/60 mt-1">
          {formatNotifTime(notif.timestamp)}
        </p>
      </div>

      {/* Dismiss button — shown on hover */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          dismiss(notif.id);
        }}
        className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Filter tabs
// ---------------------------------------------------------------------------

const FILTERS: { key: NotificationType | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "email", label: "Email" },
  { key: "calendar", label: "Calendar" },
  { key: "github", label: "GitHub" },
];

// ---------------------------------------------------------------------------
// Notification Panel (slide-out drawer from the right)
// ---------------------------------------------------------------------------

export function NotificationPanel() {
  const {
    notifications,
    unreadCount,
    isLoading,
    isOpen,
    filter,
    preferences,
    markAllAsRead,
    clearAll,
    togglePanel,
    closePanel,
    setFilter,
    updatePreferences,
    fetchNow,
  } = useNotifications();

  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) closePanel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, closePanel]);

  // Filtered notifications
  const filtered =
    filter === "all"
      ? notifications
      : notifications.filter((n) => n.type === filter);

  const { recent, earlier } = groupByTime(filtered);

  return (
    <>
      {/* Bell toggle button (renders in parent layout) */}

      {/* Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
            onClick={closePanel}
          />
        )}
      </AnimatePresence>

      {/* Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={panelRef}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 z-[70] h-full w-full sm:w-[420px] bg-card border-l border-border shadow-2xl flex flex-col"
          >
            {/* ---- Header ---- */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
              <div className="flex items-center gap-2.5">
                <Bell className="w-5 h-5 text-primary" />
                <h2 className="text-base font-bold text-foreground">Notifications</h2>
                {unreadCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-bold rounded-full bg-primary text-primary-foreground">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1">
                {/* Refresh */}
                <button
                  onClick={() => void fetchNow()}
                  disabled={isLoading}
                  className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  title="Refresh"
                >
                  <Loader2
                    className={cn("w-4 h-4", isLoading && "animate-spin")}
                  />
                </button>

                {/* Mark all read */}
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                    title="Mark all as read"
                  >
                    <CheckCheck className="w-4 h-4" />
                  </button>
                )}

                {/* Clear all */}
                {notifications.length > 0 && (
                  <button
                    onClick={clearAll}
                    className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    title="Clear all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}

                {/* Settings toggle */}
                <button
                  onClick={() =>
                    updatePreferences({ desktop: !preferences.desktop })
                  }
                  className={cn(
                    "p-2 rounded-lg transition-colors",
                    preferences.desktop
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-accent text-muted-foreground hover:text-foreground",
                  )}
                  title={preferences.desktop ? "Desktop alerts ON" : "Desktop alerts OFF"}
                >
                  {preferences.desktop ? (
                    <MonitorUp className="w-4 h-4" />
                  ) : (
                    <BellOff className="w-4 h-4" />
                  )}
                </button>

                {/* Close */}
                <button
                  onClick={closePanel}
                  className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* ---- Filter tabs ---- */}
            <div className="flex items-center gap-1 px-5 py-3 border-b border-border/30">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200",
                    filter === f.key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent",
                  )}
                >
                  {f.label}
                </button>
              ))}

              {/* Spacer */}
              <div className="flex-1" />

              {/* Desktop alerts toggle pill */}
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <MonitorUp className="w-3 h-3" />
                {preferences.desktop ? "Alerts on" : "Alerts off"}
              </span>
            </div>

            {/* ---- Notification list ---- */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {isLoading && notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin mb-3" />
                  <span className="text-sm">Checking for updates...</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <div className="w-14 h-14 rounded-full bg-accent flex items-center justify-center mb-4">
                    <Inbox className="w-7 h-7" />
                  </div>
                  <p className="text-sm font-medium">You're all caught up</p>
                  <p className="text-xs mt-1 text-muted-foreground/60">
                    New notifications will appear here
                  </p>
                </div>
              ) : (
                <div>
                  {/* Recent section */}
                  {recent.length > 0 && (
                    <div>
                      <div className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                        Recent
                      </div>
                      <AnimatePresence initial={false}>
                        {recent.map((n) => (
                          <NotifRow key={n.id} notif={n} />
                        ))}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* Earlier section */}
                  {earlier.length > 0 && (
                    <div>
                      <div className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                        Earlier
                      </div>
                      <AnimatePresence initial={false}>
                        {earlier.map((n) => (
                          <NotifRow key={n.id} notif={n} />
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ---- Footer ---- */}
            <div className="px-5 py-3 border-t border-border/30 text-center">
              <button
                onClick={() => void fetchNow()}
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                {isLoading ? "Checking..." : "Refresh now"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------------------
// Bell button — meant to be placed in the sidebar
// ---------------------------------------------------------------------------

export function NotificationBell() {
  const { unreadCount, togglePanel } = useNotifications();

  return (
    <button
      onClick={togglePanel}
      className="relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-accent"
    >
      <Bell className="w-5 h-5" />
      <span className="flex-1 text-left">Notifications</span>
      {unreadCount > 0 && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold rounded-full bg-red-500 text-white"
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </motion.span>
      )}
    </button>
  );
}
