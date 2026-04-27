"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type {
  AppNotification,
  NotificationPreferences,
  NotificationType,
} from "@/lib/notifications/notifications";
import {
  DEFAULT_PREFERENCES,
  requestDesktopPermission,
  sendDesktopNotification,
  PRIORITY_CONFIG,
} from "@/lib/notifications/notifications";
import type { PageKey } from "@/components/dashboard/sidebar";

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface SeenIds {
  email: string[];
  calendar: string[];
  github: string[];
}

interface NotificationContextValue {
  /** All notifications currently in the tray (newest first). */
  notifications: AppNotification[];
  /** Number of unread notifications. */
  unreadCount: number;
  /** Whether a poll is currently in-flight. */
  isLoading: boolean;
  /** Whether the notification drawer is open. */
  isOpen: boolean;
  /** Active filter — 'all' or a specific NotificationType. */
  filter: NotificationType | "all";
  /** Current live counts from services. */
  liveCounts: {
    unreadEmails: number;
    upcomingEvents: number;
    openIssues: number;
    openPRs: number;
  } | null;
  /** User notification preferences. */
  preferences: NotificationPreferences;
  /** Callback to navigate (used when clicking notification actions). */
  onNavigate?: (key: PageKey) => void;

  // Actions
  fetchNow: () => Promise<void>;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  dismiss: (id: string) => void;
  clearAll: () => void;
  togglePanel: () => void;
  closePanel: () => void;
  setFilter: (f: NotificationType | "all") => void;
  updatePreferences: (patch: Partial<NotificationPreferences>) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const POLL_ACTIVE = 60_000; // 1 minute when tab is visible
const POLL_BACKGROUND = 5 * 60_000; // 5 minutes when tab is hidden
const MAX_NOTIFICATIONS = 100; // keep tray trimmed

export function NotificationProvider({
  children,
  onNavigate,
}: {
  children: ReactNode;
  onNavigate?: (key: PageKey) => void;
}) {
  // Notification store
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<NotificationType | "all">("all");
  const [liveCounts, setLiveCounts] = useState<NotificationContextValue["liveCounts"]>(null);
  const [preferences, setPreferences] = useState<NotificationPreferences>(() => {
    if (typeof window === "undefined") return DEFAULT_PREFERENCES;
    try {
      const stored = localStorage.getItem("klaw-notif-prefs");
      if (stored) return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
    } catch {
      /* ignore */
    }
    return DEFAULT_PREFERENCES;
  });

  // Deduplication state — tracks what the server has already told us about
  // Persist to localStorage so cleared notifications don't reappear after refresh
  const seenIdsRef = useRef<SeenIds>(
    typeof window !== "undefined"
      ? (() => {
          try {
            const stored = localStorage.getItem("klaw-notif-seen-ids");
            if (stored) return JSON.parse(stored);
          } catch { /* ignore */ }
          return { email: [], calendar: [], github: [] };
        })()
      : { email: [], calendar: [], github: [] },
  );
  // Tracks source IDs that have been dismissed/cleared by the user.
  // These are excluded from re-appearing even if the server somehow returns them.
  // Persisted to localStorage to survive page refreshes.
  const dismissedSourceIdsRef = useRef<Set<string>>(
    typeof window !== "undefined"
      ? (() => {
          try {
            const stored = localStorage.getItem("klaw-notif-dismissed-ids");
            if (stored) return new Set<string>(JSON.parse(stored));
          } catch { /* ignore */ }
          return new Set<string>();
        })()
      : new Set<string>(),
  );
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTabVisibleRef = useRef(true);

  // Derived
  const unreadCount = notifications.filter((n) => !n.read).length;

  // -------------------------------------------------------------------------
  // Persist preferences
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("klaw-notif-prefs", JSON.stringify(preferences));
    } catch {
      /* ignore */
    }
  }, [preferences]);

  // Persist seen IDs to localStorage on every fetch (survives page refresh)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("klaw-notif-seen-ids", JSON.stringify(seenIdsRef.current));
    } catch {
      /* ignore */
    }
  });

  // -------------------------------------------------------------------------
  // Tab visibility — adjust poll rate
  // -------------------------------------------------------------------------
  useEffect(() => {
    const onVisibility = () => {
      isTabVisibleRef.current = !document.hidden;
      // If tab became visible, trigger an immediate poll
      if (!document.hidden && !isLoading) {
        void fetchNow();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // Core fetch function
  // -------------------------------------------------------------------------
  const fetchNow = useCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seenIds: seenIdsRef.current }),
      });

      const json = await res.json();
      if (!json.success) return;

      // Update live counts
      if (json.currentCounts) {
        setLiveCounts(json.currentCounts);
      }

      // Update seen IDs from server response
      if (json.newSeenIds) {
        seenIdsRef.current = {
          email: json.newSeenIds.email ?? seenIdsRef.current.email,
          calendar: json.newSeenIds.calendar ?? seenIdsRef.current.calendar,
          github: json.newSeenIds.github ?? seenIdsRef.current.github,
        };
      }

      // Add new notifications (avoid duplicates by sourceId and dismissed)
      if (json.notifications?.length > 0) {
        const existingSourceIds = new Set(notifications.map((n) => n.sourceId));
        const trulyNew = json.notifications.filter(
          (n: AppNotification) =>
            !existingSourceIds.has(n.sourceId) &&
            !dismissedSourceIdsRef.current.has(n.sourceId),
        );

        if (trulyNew.length > 0) {
          const mapped: AppNotification[] = trulyNew.map((n: AppNotification) => ({
            ...n,
            read: false,
          }));

          setNotifications((prev) => {
            const combined = [...mapped, ...prev];
            // Trim to max
            return combined.slice(0, MAX_NOTIFICATIONS);
          });

          // Desktop notifications for high-priority items
          if (preferences.desktop) {
            for (const n of trulyNew) {
              const config = PRIORITY_CONFIG[n.priority as keyof typeof PRIORITY_CONFIG];
              if (config?.desktopNotify) {
                sendDesktopNotification(n.title, n.body, () => {
                  if (n.actionUrl && onNavigate) {
                    onNavigate(n.actionUrl as PageKey);
                  }
                });
              }
            }
          }
        }
      }
    } catch {
      // Silently fail — polling errors should not break the UI
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, notifications, preferences.desktop, onNavigate]);

  // -------------------------------------------------------------------------
  // Polling loop
  // -------------------------------------------------------------------------
  useEffect(() => {
    // Initial fetch after a short delay (let the page load first)
    const initialTimer = setTimeout(() => {
      void fetchNow();
    }, 3_000);

    return () => clearTimeout(initialTimer);
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restart poll timer after each fetch completes
  useEffect(() => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);

    const interval = isTabVisibleRef.current ? POLL_ACTIVE : POLL_BACKGROUND;
    pollTimerRef.current = setTimeout(() => {
      void fetchNow();
    }, interval);

    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [isLoading, fetchNow]); // re-schedule after each fetch

  // -------------------------------------------------------------------------
  // Request desktop permission on mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (preferences.desktop) {
      requestDesktopPermission();
    }
  }, [preferences.desktop]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------
  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  }, []);

  // Helper to persist dismissed IDs to localStorage
  const persistDismissed = useCallback(() => {
    try {
      const arr = Array.from(dismissedSourceIdsRef.current).slice(0, 500);
      localStorage.setItem("klaw-notif-dismissed-ids", JSON.stringify(arr));
    } catch {
      /* ignore */
    }
  }, []);

  // Mark all as read AND clear the notification list.
  // The user expects notifications to disappear when marked as read.
  // seenIdsRef prevents the server from re-sending them on next poll.
  // dismissedSourceIdsRef is an extra client-side safety net.
  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => {
      for (const n of prev) {
        dismissedSourceIdsRef.current.add(n.sourceId);
      }
      return [];
    });
    persistDismissed();
  }, [persistDismissed]);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => {
      const notif = prev.find((n) => n.id === id);
      if (notif) {
        dismissedSourceIdsRef.current.add(notif.sourceId);
      }
      return prev.filter((n) => n.id !== id);
    });
    persistDismissed();
  }, [persistDismissed]);

  const clearAll = useCallback(() => {
    setNotifications((prev) => {
      for (const n of prev) {
        dismissedSourceIdsRef.current.add(n.sourceId);
      }
      return [];
    });
    persistDismissed();
  }, [persistDismissed]);

  const togglePanel = useCallback(() => setIsOpen((p) => !p), []);
  const closePanel = useCallback(() => setIsOpen(false), []);

  const updatePreferences = useCallback(
    (patch: Partial<NotificationPreferences>) => {
      setPreferences((prev) => ({ ...prev, ...patch }));
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Value
  // -------------------------------------------------------------------------
  const value: NotificationContextValue = {
    notifications,
    unreadCount,
    isLoading,
    isOpen,
    filter,
    liveCounts,
    preferences,
    onNavigate,
    fetchNow,
    markAsRead,
    markAllAsRead,
    dismiss,
    clearAll,
    togglePanel,
    closePanel,
    setFilter,
    updatePreferences,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within <NotificationProvider>");
  }
  return ctx;
}
