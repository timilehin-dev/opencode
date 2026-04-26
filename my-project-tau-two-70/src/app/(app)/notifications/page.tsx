"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  BellOff,
  Plus,
  Trash2,
  X,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Link2,
  MonitorUp,
  Mail,
  Clock,
  Moon,
  Sun,
  Copy,
  Zap,
  Globe,
  TestTube,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  type AppNotification,
  TYPE_STYLES,
  PRIORITY_CONFIG,
  formatNotifTime,
} from "@/lib/notifications";
import {
  loadDeliveryConfig,
  saveDeliveryConfig,
  addWebhook,
  removeWebhook,
  updateWebhook,
  type NotificationDeliveryConfig,
  type WebhookConfig,
  shouldDeliver,
  deliverWebhook,
} from "@/lib/notification-delivery";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = "history" | "channels" | "preferences";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "history", label: "History", icon: <Bell className="w-3.5 h-3.5" /> },
  { id: "channels", label: "Delivery Channels", icon: <Globe className="w-3.5 h-3.5" /> },
  { id: "preferences", label: "Preferences", icon: <Zap className="w-3.5 h-3.5" /> },
];

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("history");
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [deliveryConfig, setDeliveryConfig] = useState<NotificationDeliveryConfig | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // Load data
  useEffect(() => {
    setDeliveryConfig(loadDeliveryConfig());
    // Load notifications from localStorage cache
    try {
      const stored = localStorage.getItem("klaw-notif-history");
      if (stored) setNotifications(JSON.parse(stored));
    } catch {
      // empty
    }
    setLoading(false);
  }, []);

  // Fetch fresh notifications from API
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seenIds: { email: [], calendar: [], github: [] } }),
      });
      const json = await res.json();
      if (json.success && json.notifications) {
        setNotifications(json.notifications);
        localStorage.setItem("klaw-notif-history", JSON.stringify(json.notifications));
      }
    } catch {
      // silent
    }
  }, []);

  // Stats
  const stats = useMemo(() => {
    const unread = notifications.filter((n) => !n.read).length;
    const byType: Record<string, number> = {};
    for (const n of notifications) {
      byType[n.type] = (byType[n.type] || 0) + 1;
    }
    return { total: notifications.length, unread, byType };
  }, [notifications]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8"
    >
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1a1a2e] text-white text-sm font-medium shadow-lg"
          >
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Bell className="w-5 h-5 text-[#3730a3]" />
            <h1 className="text-xl font-bold text-foreground">Notifications</h1>
            {stats.unread > 0 && (
              <Badge className="text-[10px] gap-1 bg-primary text-white border-primary">
                {stats.unread} unread
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground ml-8">
            Manage delivery channels, preferences, and notification history
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={fetchNotifications}>
          <Bell className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total", value: stats.total, icon: <Bell className="w-4 h-4" /> },
          { label: "Unread", value: stats.unread, icon: <AlertCircle className="w-4 h-4" /> },
          { label: "Webhooks", value: deliveryConfig?.webhooks.length || 0, icon: <Link2 className="w-4 h-4" /> },
          { label: "Desktop", value: deliveryConfig?.desktopEnabled ? "On" : "Off", icon: <MonitorUp className="w-4 h-4" /> },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              {s.icon}
              <span className="text-[10px] font-medium uppercase tracking-wider">{s.label}</span>
            </div>
            <p className="text-lg font-bold text-[#3730a3]">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1 scrollbar-none">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap min-h-[40px]",
              activeTab === tab.id
                ? "bg-primary text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === "history" && (
            <HistoryTab notifications={notifications} stats={stats} onRefresh={fetchNotifications} />
          )}
          {activeTab === "channels" && (
            <ChannelsTab
              config={deliveryConfig || loadDeliveryConfig()}
              onUpdate={(config) => { setDeliveryConfig(config); saveDeliveryConfig(config); }}
              showToast={showToast}
            />
          )}
          {activeTab === "preferences" && (
            <PreferencesTab
              config={deliveryConfig || loadDeliveryConfig()}
              onUpdate={(config) => { setDeliveryConfig(config); saveDeliveryConfig(config); }}
              showToast={showToast}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

// ===========================================================================
// History Tab
// ===========================================================================

function HistoryTab({
  notifications,
  stats,
  onRefresh,
}: {
  notifications: AppNotification[];
  stats: { total: number; unread: number; byType: Record<string, number> };
  onRefresh: () => void;
}) {
  const [filter, setFilter] = useState<string>("all");

  const filtered = filter === "all"
    ? notifications
    : notifications.filter((n) => n.type === filter);

  const timeGroups = useMemo(() => {
    const recent: AppNotification[] = [];
    const earlier: AppNotification[] = [];
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const n of filtered) {
      if (new Date(n.timestamp).getTime() > oneHourAgo) recent.push(n);
      else earlier.push(n);
    }
    return { recent, earlier };
  }, [filtered]);

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Filter:</span>
        <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
          <button
            onClick={() => setFilter("all")}
            className={cn(
              "px-2.5 py-1 text-[10px] rounded-md transition-colors",
              filter === "all" ? "bg-card text-foreground shadow-sm font-medium" : "text-muted-foreground"
            )}
          >
            All ({stats.total})
          </button>
          {Object.entries(stats.byType).map(([type, count]) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={cn(
                "px-2.5 py-1 text-[10px] rounded-md transition-colors",
                filter === type ? "bg-card text-foreground shadow-sm font-medium" : "text-muted-foreground"
              )}
            >
              {TYPE_STYLES[type as keyof typeof TYPE_STYLES]?.label || type} ({count})
            </button>
          ))}
        </div>
      </div>

      {/* Notification list */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
              <Bell className="w-7 h-7 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-1">No notifications</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Notifications will appear here as events happen across your connected services.
            </p>
            <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={onRefresh}>
              <Bell className="w-3.5 h-3.5" />
              Check for updates
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1">
          {timeGroups.recent.length > 0 && (
            <div>
              <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Recent
              </div>
              {timeGroups.recent.map((n) => <NotifRow key={n.id} notif={n} />)}
            </div>
          )}
          {timeGroups.earlier.length > 0 && (
            <div>
              <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Earlier
              </div>
              {timeGroups.earlier.map((n) => <NotifRow key={n.id} notif={n} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NotifRow({ notif }: { notif: AppNotification }) {
  const style = TYPE_STYLES[notif.type as keyof typeof TYPE_STYLES] || TYPE_STYLES.system;
  const priorityCfg = PRIORITY_CONFIG[notif.priority as keyof typeof PRIORITY_CONFIG];

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-3 py-3.5 rounded-lg border border-border bg-card transition-all hover:border-primary/20 min-h-[60px]",
        !notif.read && "bg-[#eef2ff]/40"
      )}
    >
      <div className={cn("w-9 h-9 rounded-lg border flex items-center justify-center flex-shrink-0 mt-0.5", style.bgColor, style.borderColor, style.color)}>
        <Bell className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className={cn("text-sm truncate", notif.read ? "text-muted-foreground" : "text-foreground font-medium")}>
            {notif.title}
          </p>
          <span className={cn("w-2 h-2 rounded-full flex-shrink-0", priorityCfg?.dotColor || "bg-blue-500")} />
        </div>
        <p className="text-xs text-muted-foreground truncate">{notif.body}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-muted-foreground">{formatNotifTime(notif.timestamp)}</span>
          <Badge variant="outline" className="text-[8px] px-1 py-0">{style.label}</Badge>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Channels Tab
// ===========================================================================

function ChannelsTab({
  config,
  onUpdate,
  showToast,
}: {
  config: NotificationDeliveryConfig;
  onUpdate: (config: NotificationDeliveryConfig) => void;
  showToast: (msg: string) => void;
}) {
  const [showAddWebhook, setShowAddWebhook] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newEvents, setNewEvents] = useState<string[]>([]);
  const [testingIdx, setTestingIdx] = useState<number | null>(null);

  const handleAdd = () => {
    if (!newUrl.trim()) return;
    const updated = addWebhook({ url: newUrl.trim(), enabled: true, events: newEvents });
    onUpdate(updated);
    setNewUrl("");
    setNewEvents([]);
    setShowAddWebhook(false);
    showToast("Webhook added");
  };

  const handleRemove = (index: number) => {
    const updated = removeWebhook(index);
    onUpdate(updated);
    showToast("Webhook removed");
  };

  const handleToggle = (index: number) => {
    const updated = updateWebhook(index, { enabled: !config.webhooks[index]?.enabled });
    onUpdate(updated);
  };

  const handleTest = async (index: number) => {
    const webhook = config.webhooks[index];
    if (!webhook) return;
    setTestingIdx(index);
    const success = await deliverWebhook(webhook, {
      type: "system",
      priority: "normal",
      title: "Test Notification from Klawhub",
      body: "This is a test notification. If you received this, your webhook is configured correctly.",
      timestamp: new Date().toISOString(),
      sourceId: `test-${Date.now()}`,
    });
    setTestingIdx(null);
    showToast(success ? "Test sent successfully" : "Test failed — check the URL");
  };

  const toggleEvent = (event: string) => {
    setNewEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const EVENT_TYPES = [
    { id: "email", label: "Email" },
    { id: "calendar", label: "Calendar" },
    { id: "github", label: "GitHub" },
    { id: "system", label: "System" },
    { id: "agent", label: "Agent" },
  ];

  return (
    <div className="space-y-4">
      {/* Desktop Push */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <MonitorUp className="w-4 h-4 text-muted-foreground" />
            Browser Push Notifications
          </CardTitle>
          <CardDescription>Receive notifications directly in your browser</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => onUpdate({ ...config, desktopEnabled: !config.desktopEnabled })}
                className={cn(
                  "w-11 h-[26px] rounded-full transition-all duration-200 relative flex-shrink-0 min-h-[44px]",
                  config.desktopEnabled ? "bg-primary" : "bg-[#d1d1d1]"
                )}
              >
                <span
                  className={cn(
                    "absolute top-[3px] w-4 h-4 bg-card rounded-full shadow-sm transition-all duration-200",
                    config.desktopEnabled ? "left-[22px]" : "left-[3px]"
                  )}
                />
              </button>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {config.desktopEnabled ? "Enabled" : "Disabled"}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {config.desktopEnabled
                    ? "You'll see browser notifications for high-priority events"
                    : "Enable to receive browser push notifications"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Webhooks */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Link2 className="w-4 h-4 text-muted-foreground" />
                Webhooks
              </CardTitle>
              <CardDescription className="mt-1">Send notifications to external URLs (Slack, Discord, n8n, etc.)</CardDescription>
            </div>
            <Button size="sm" variant="outline" className="gap-2 text-xs" onClick={() => setShowAddWebhook(true)}>
              <Plus className="w-3.5 h-3.5" />
              Add Webhook
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {config.webhooks.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-border rounded-lg">
              <Link2 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No webhooks configured</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Add a webhook URL to receive notifications in Slack, Discord, or any service
              </p>
            </div>
          ) : (
            config.webhooks.map((webhook, i) => (
              <motion.div
                key={i}
                variants={itemVariants}
                initial="hidden"
                animate="show"
                className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card"
              >
                <button
                  onClick={() => handleToggle(i)}
                  className={cn(
                    "w-8 h-[18px] rounded-full transition-all duration-200 relative flex-shrink-0",
                    webhook.enabled ? "bg-primary" : "bg-[#d1d1d1]"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-[2px] w-[14px] h-[14px] bg-card rounded-full shadow-sm transition-all duration-200",
                      webhook.enabled ? "left-[15px]" : "left-[2px]"
                    )}
                  />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-foreground truncate">{webhook.url}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    {webhook.events.length === 0 ? (
                      <span className="text-[10px] text-muted-foreground">All events</span>
                    ) : (
                      webhook.events.map((e) => (
                        <Badge key={e} variant="secondary" className="text-[8px] px-1 py-0">
                          {TYPE_STYLES[e as keyof typeof TYPE_STYLES]?.label || e}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleTest(i)}
                    disabled={testingIdx === i || !webhook.enabled}
                    className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-[#3730a3] transition-colors disabled:opacity-50"
                    title="Send test notification"
                  >
                    {testingIdx === i ? (
                      <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <TestTube className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => handleRemove(i)}
                    className="p-1.5 rounded-md hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            ))
          )}

          {/* Add webhook form */}
          <AnimatePresence>
            {showAddWebhook && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="p-4 rounded-lg border border-primary/20 bg-primary/5 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">Webhook URL</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="url"
                        value={newUrl}
                        onChange={(e) => setNewUrl(e.target.value)}
                        placeholder="https://hooks.slack.com/services/..."
                        className="flex-1 px-3 py-2 rounded-lg border border-border bg-card text-xs font-mono focus:outline-none focus:border-ring/40"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Supports Slack, Discord, n8n, Make.com, or any HTTP endpoint
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      Events <span className="text-muted-foreground font-normal">(empty = all)</span>
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {EVENT_TYPES.map((e) => (
                        <button
                          key={e.id}
                          onClick={() => toggleEvent(e.id)}
                          className={cn(
                            "px-2 py-1 rounded-md border text-[10px] transition-all",
                            newEvents.includes(e.id)
                              ? "border-primary bg-primary/10 text-[#3730a3]"
                              : "border-border text-muted-foreground hover:border-primary/30"
                          )}
                        >
                          {e.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowAddWebhook(false)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="text-xs gap-1.5 bg-primary hover:bg-primary/90"
                      onClick={handleAdd}
                      disabled={!newUrl.trim()}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Webhook
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Email info card */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Mail className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Email Notifications</h3>
              <p className="text-xs text-muted-foreground">Coming soon — configure SMTP to send notifications via email</p>
            </div>
            <Badge variant="secondary" className="text-[9px] ml-auto">Planned</Badge>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Email delivery requires an SMTP server configuration. This feature will allow you to receive notification
            digests and urgent alerts directly in your inbox. Use webhooks as an alternative for now — they work
            with services like Slack and Discord.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ===========================================================================
// Preferences Tab
// ===========================================================================

function PreferencesTab({
  config,
  onUpdate,
  showToast,
}: {
  config: NotificationDeliveryConfig;
  onUpdate: (config: NotificationDeliveryConfig) => void;
  showToast: (msg: string) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Sound */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            Sound
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Notification sounds</p>
              <p className="text-[10px] text-muted-foreground">Play a sound when a new notification arrives</p>
            </div>
            <button
              onClick={() => onUpdate({ ...config, soundEnabled: !config.soundEnabled })}
              className={cn(
                "w-10 h-[22px] rounded-full transition-all duration-200 relative",
                config.soundEnabled ? "bg-primary" : "bg-[#d1d1d1]"
              )}
            >
              <span
                className={cn(
                  "absolute top-[3px] w-4 h-4 bg-card rounded-full shadow-sm transition-all duration-200",
                  config.soundEnabled ? "left-[22px]" : "left-[3px]"
                )}
              />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Quiet Hours */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <Moon className="w-4 h-4 text-muted-foreground" />
            Quiet Hours
          </CardTitle>
          <CardDescription>
            {config.quietHoursEnabled
              ? `Muted from ${config.quietHoursStart} to ${config.quietHoursEnd} (except urgent)`
              : "Notification delivery runs 24/7"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => onUpdate({ ...config, quietHoursEnabled: !config.quietHoursEnabled })}
                className={cn(
                  "w-10 h-[22px] rounded-full transition-all duration-200 relative",
                  config.quietHoursEnabled ? "bg-primary" : "bg-[#d1d1d1]"
                )}
              >
                <span
                  className={cn(
                    "absolute top-[3px] w-4 h-4 bg-card rounded-full shadow-sm transition-all duration-200",
                    config.quietHoursEnabled ? "left-[22px]" : "left-[3px]"
                  )}
                />
              </button>
              <span className="text-sm font-medium text-foreground">
                {config.quietHoursEnabled ? "Enabled" : "Disabled"}
              </span>
            </div>
          </div>

          {config.quietHoursEnabled && (
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                  Start Time
                </label>
                <input
                  type="time"
                  value={config.quietHoursStart || "22:00"}
                  onChange={(e) => onUpdate({ ...config, quietHoursStart: e.target.value })}
                  className="px-3 py-2 rounded-lg border border-border bg-card text-xs focus:outline-none focus:border-ring/40"
                />
              </div>
              <div className="flex items-center pt-5">
                <span className="text-muted-foreground">→</span>
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                  End Time
                </label>
                <input
                  type="time"
                  value={config.quietHoursEnd || "08:00"}
                  onChange={(e) => onUpdate({ ...config, quietHoursEnd: e.target.value })}
                  className="px-3 py-2 rounded-lg border border-border bg-card text-xs focus:outline-none focus:border-ring/40"
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            {[
              { label: "Night (22:00–08:00)", start: "22:00", end: "08:00" },
              { label: "Late Night (00:00–07:00)", start: "00:00", end: "07:00" },
              { label: "Afternoon Nap (13:00–14:00)", start: "13:00", end: "14:00" },
            ].map((p) => (
              <button
                key={p.label}
                onClick={() =>
                  onUpdate({ ...config, quietHoursEnabled: true, quietHoursStart: p.start, quietHoursEnd: p.end })
                }
                className={cn(
                  "px-2.5 py-1.5 rounded-md border text-[10px] transition-all",
                  config.quietHoursStart === p.start && config.quietHoursEnd === p.end
                    ? "border-primary bg-primary/10 text-[#3730a3] font-medium"
                    : "border-border text-muted-foreground hover:border-primary/30"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Info */}
      <div className="rounded-lg border border-border bg-secondary p-4">
        <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
          <Sun className="w-3.5 h-3.5" />
          How Notifications Work
        </h4>
        <ul className="text-[11px] text-muted-foreground space-y-1.5 list-disc list-inside">
          <li><strong className="text-foreground">Desktop push</strong> — Browser Notification API (requires permission). Only high-priority events trigger desktop alerts.</li>
          <li><strong className="text-foreground">Webhooks</strong> — HTTP POST to your URL. Works with Slack, Discord, n8n, Make.com, or any endpoint. Event filtering supported.</li>
          <li><strong className="text-foreground">Quiet hours</strong> — Mutes all delivery except urgent notifications during the configured time window.</li>
          <li><strong className="text-foreground">Polling</strong> — The app checks for new notifications every 60 seconds (5 minutes in background tabs).</li>
        </ul>
      </div>
    </div>
  );
}
