// Notification types, constants, and utility functions for Klawhub Agent Hub
// Phase 2: Real-Time Updates + Smart Notifications

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationType = 'email' | 'calendar' | 'github' | 'system' | 'agent';
export type NotificationPriority = 'urgent' | 'high' | 'normal' | 'low';

export interface AppNotification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body: string;
  timestamp: string; // ISO 8601
  read: boolean;
  sourceId: string; // Deduplication key
  actionUrl?: string; // App page to navigate to
  actionLabel?: string;
}

export interface NotificationPreferences {
  email: boolean;
  calendar: boolean;
  github: boolean;
  system: boolean;
  agent: boolean;
  desktop: boolean; // Browser push notifications
  sound: boolean;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  email: true,
  calendar: true,
  github: true,
  system: true,
  agent: true,
  desktop: true,
  sound: false,
};

// ---------------------------------------------------------------------------
// Visual style maps — used by notification panel and badges
// ---------------------------------------------------------------------------

export const TYPE_STYLES: Record<
  NotificationType,
  { color: string; bgColor: string; borderColor: string; label: string }
> = {
  email: {
    color: 'text-red-400',
    bgColor: 'bg-red-500/15',
    borderColor: 'border-red-500/30',
    label: 'Email',
  },
  calendar: {
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/15',
    borderColor: 'border-blue-500/30',
    label: 'Calendar',
  },
  github: {
    color: 'text-slate-300',
    bgColor: 'bg-slate-500/15',
    borderColor: 'border-slate-500/30',
    label: 'GitHub',
  },
  system: {
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/15',
    borderColor: 'border-amber-500/30',
    label: 'System',
  },
  agent: {
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/15',
    borderColor: 'border-emerald-500/30',
    label: 'Agent',
  },
};

export const PRIORITY_CONFIG: Record<
  NotificationPriority,
  { dotColor: string; desktopNotify: boolean }
> = {
  urgent: { dotColor: 'bg-red-500', desktopNotify: true },
  high: { dotColor: 'bg-orange-500', desktopNotify: true },
  normal: { dotColor: 'bg-blue-500', desktopNotify: false },
  low: { dotColor: 'bg-slate-500', desktopNotify: false },
};

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

export function formatNotifTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// Group notifications into "Recent" (< 1 hour) and "Earlier"
export function groupByTime(
  notifications: AppNotification[],
): { recent: AppNotification[]; earlier: AppNotification[] } {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const recent: AppNotification[] = [];
  const earlier: AppNotification[] = [];

  for (const n of notifications) {
    if (new Date(n.timestamp).getTime() > oneHourAgo) {
      recent.push(n);
    } else {
      earlier.push(n);
    }
  }

  return { recent, earlier };
}

// ---------------------------------------------------------------------------
// Desktop (browser) notifications
// ---------------------------------------------------------------------------

export function requestDesktopPermission(): void {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    void Notification.requestPermission();
  }
}

export function sendDesktopNotification(
  title: string,
  body: string,
  onClick?: () => void,
  agentId?: string,
): void {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const n = new Notification(title, {
    body,
    tag: `${agentId || "unknown"}:${title}:${body}`, // prevents duplicates
    silent: true,
  });

  if (onClick) {
    n.onclick = () => {
      window.focus();
      onClick();
      n.close();
    };
  }

  // Auto-dismiss after 6 seconds
  setTimeout(() => n.close(), 6_000);
}

// ---------------------------------------------------------------------------
// Agent Push Notifications — proactive alerts from agents
// Called by agents or cron jobs to push notifications to the user.
// ---------------------------------------------------------------------------

export interface AgentNotification {
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body: string;
  sourceId?: string;
  actionUrl?: string;
  actionLabel?: string;
  agentId?: string;
  agentName?: string;
}

/**
 * Push a notification from an agent to the user.
 * Stores in Supabase notifications table (if available) for history.
 * Also sends desktop notification if permission granted.
 */
export function pushAgentNotification(notif: AgentNotification): void {
  const fullNotif: AppNotification = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: notif.type,
    priority: notif.priority,
    title: notif.title,
    body: notif.body,
    timestamp: new Date().toISOString(),
    read: false,
    sourceId: notif.sourceId || `agent:${notif.agentId || "unknown"}:${Date.now()}`,
    actionUrl: notif.actionUrl,
    actionLabel: notif.actionLabel,
  };

  // Store in localStorage for the notification panel
  if (typeof window !== "undefined") {
    try {
      const key = "klaw-notifications";
      const existing = JSON.parse(localStorage.getItem(key) || "[]");
      existing.unshift(fullNotif);
      // Keep last 200 notifications
      localStorage.setItem(key, JSON.stringify(existing.slice(0, 200)));
      // Dispatch custom event for real-time UI updates
      window.dispatchEvent(new CustomEvent("klaw-notification", { detail: fullNotif }));
    } catch {
      // ignore
    }
  }

  // Send desktop notification for high-priority items
  if ((notif.priority === "urgent" || notif.priority === "high") && notif.actionUrl) {
    sendDesktopNotification(
      `${notif.agentName || "Agent"}: ${notif.title}`,
      notif.body,
      notif.actionUrl ? () => { window.location.href = notif.actionUrl!; } : undefined,
      notif.agentId,
    );
  }
}

/** Quick helpers for common proactive notifications */
export function notifyUnreadEmails(count: number, urgentCount: number, agentName?: string): void {
  pushAgentNotification({
    type: "email",
    priority: urgentCount > 0 ? "urgent" : "normal",
    title: `${count} unread email${count > 1 ? "s" : ""}`,
    body: urgentCount > 0
      ? `${urgentCount} urgent email${urgentCount > 1 ? "s" : ""} need${urgentCount > 1 ? "" : "s"} your attention.`
      : `You have ${count} unread email${count > 1 ? "s" : ""} in your inbox.`,
    agentId: "mail",
    agentName: agentName || "Mail Agent",
    actionUrl: "/chat?agent=mail",
    actionLabel: "View emails",
  });
}

export function notifyDeployStatus(status: "success" | "failed", project: string, agentName?: string): void {
  pushAgentNotification({
    type: "system",
    priority: status === "failed" ? "urgent" : "normal",
    title: `Deployment ${status}`,
    body: status === "failed"
      ? `Deployment of "${project}" failed. Check logs for details.`
      : `Deployment of "${project}" succeeded.`,
    agentId: "ops",
    agentName: agentName || "Ops Agent",
    actionUrl: "/services/vercel",
    actionLabel: "View deployments",
  });
}

export function notifyUpcomingEvent(title: string, timeUntil: string, agentName?: string): void {
  pushAgentNotification({
    type: "calendar",
    priority: "high",
    title: `Meeting in ${timeUntil}`,
    body: `"${title}" is starting soon.`,
    agentId: "mail",
    agentName: agentName || "Mail Agent",
    actionUrl: "/chat?agent=mail",
    actionLabel: "View details",
  });
}
