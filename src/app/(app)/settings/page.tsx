"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings as SettingsIcon,
  User,
  Palette,
  Bell,
  Cpu,
  Database,
  AlertTriangle,
  Check,
  X,
  Eye,
  EyeOff,
  RefreshCw,
  TrashIcon,
  Globe,
  Moon,
  Sun,
  Monitor,
  ChevronRightIcon,
  Shield,
  Download,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import {
  type AppSettings,
  DEFAULT_SETTINGS,
  loadSettings,
  loadSettingsFromCloud,
  saveSettings,
  resetSettings,
  TIMEZONES,
} from "@/lib/settings-store";
import { getAllAgents } from "@/lib/agents";
import { useNotifications } from "@/context/notification-context";

// ---------------------------------------------------------------------------
// Section definitions
// ---------------------------------------------------------------------------

type SectionId = "workspace" | "appearance" | "notifications" | "agents" | "data" | "danger";

interface SectionDef {
  id: SectionId;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const SECTIONS: SectionDef[] = [
  {
    id: "workspace",
    label: "Workspace",
    description: "Name, timezone, and identity",
    icon: <User className="w-4 h-4" />,
  },
  {
    id: "appearance",
    label: "Appearance",
    description: "Theme and display options",
    icon: <Palette className="w-4 h-4" />,
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Alert preferences and sounds",
    icon: <Bell className="w-4 h-4" />,
  },
  {
    id: "agents",
    label: "Agent Configuration",
    description: "Models, temperature, and defaults",
    icon: <Cpu className="w-4 h-4" />,
  },
  {
    id: "data",
    label: "Data & Privacy",
    description: "Storage, analytics, and export",
    icon: <Database className="w-4 h-4" />,
  },
  {
    id: "danger",
    label: "Danger Zone",
    description: "Reset and destructive actions",
    icon: <AlertTriangle className="w-4 h-4" />,
  },
];

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

// ---------------------------------------------------------------------------
// Toggle component (reusable)
// ---------------------------------------------------------------------------

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between py-3 gap-3">
      <div className="flex-1 min-w-0 pr-2">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={cn(
          "relative rounded-full transition-colors duration-200 flex-shrink-0 min-h-[44px] min-w-[52px]",
          checked ? "bg-[#3730a3]" : "bg-[#e8e5df]"
        )}
        style={{ width: "52px", height: "28px" }}
        aria-label={checked ? `Disable ${label}` : `Enable ${label}`}
      >
        <span
          className={cn(
            "absolute top-[5px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform duration-200",
            checked ? "translate-x-[29px]" : "translate-x-[5px]"
          )}
        />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toast notification
// ---------------------------------------------------------------------------

function Toast({ message, visible }: { message: string; visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="fixed top-6 right-6 z-[100] bg-emerald-600 text-white px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2 text-sm font-medium"
        >
          <Check className="w-4 h-4" />
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Main Settings Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [activeSection, setActiveSection] = useState<SectionId>("workspace");
  const [toast, setToast] = useState("");
  const [resetConfirm, setResetConfirm] = useState(false);
  const [clearConvoConfirm, setClearConvoConfirm] = useState(false);
  const [clearAnalyticsConfirm, setClearAnalyticsConfirm] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [cloudSyncing, setCloudSyncing] = useState(true);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { updatePreferences, preferences: notifPrefs } = useNotifications();
  const { theme, setTheme } = useTheme();
  const [saving, setSaving] = useState(false);

  // Load settings on mount — localStorage first, then sync from cloud
  useEffect(() => {
    const local = loadSettings();
    setSettings(local);

    // Attempt to load from cloud and merge (cloud overrides localStorage)
    loadSettingsFromCloud()
      .then((cloud) => {
        if (cloud) {
          const merged = { ...local, ...cloud };
          setSettings(merged);
          saveSettings(merged); // Persist merged settings back to localStorage
        }
      })
      .catch(() => {})
      .finally(() => setCloudSyncing(false));
  }, []);

  // Sync notification preferences from context into settings store
  useEffect(() => {
    if (notifPrefs) {
      setSettings((prev) => ({
        ...prev,
        notifEmail: notifPrefs.email,
        notifCalendar: notifPrefs.calendar,
        notifGithub: notifPrefs.github,
        notifSystem: notifPrefs.system,
        notifAgent: notifPrefs.agent,
        notifDesktop: notifPrefs.desktop,
        notifSound: notifPrefs.sound,
      }));
    }
  }, [notifPrefs]);

  const agents = getAllAgents();

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const patch = useCallback((partial: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      saveSettings(next);
      return next;
    });
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(""), 3000);
  }, []);

  // ---------------------------------------------------------------------------
  // Save to Supabase explicitly
  // ---------------------------------------------------------------------------

  const handleSaveToCloud = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      const json = await res.json();
      if (json.success) {
        showToast("Settings saved to cloud ✓");
      } else {
        showToast("Failed to save — " + (json.error || "unknown error"));
      }
    } catch {
      showToast("Failed to save — network error");
    }
    setSaving(false);
  }, [settings, showToast]);

  // ---------------------------------------------------------------------------
  // Sync notification settings with the notification context
  // ---------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleNotifChange = useCallback(
    (settingsKey: string, notifKey: string, value: boolean) => {
      patch({ [settingsKey]: value } as any);
      updatePreferences({ [notifKey]: value } as any);
    },
    [patch, updatePreferences],
  );

  // ---------------------------------------------------------------------------
  // Theme change handler
  // ---------------------------------------------------------------------------

  const handleThemeChange = useCallback(
    (val: "light" | "dark" | "system") => {
      patch({ theme: val });
      setTheme(val);
    },
    [patch, setTheme],
  );

  // ---------------------------------------------------------------------------
  // Reset handler
  // ---------------------------------------------------------------------------

  const handleReset = useCallback(() => {
    resetSettings();
    setSettings(DEFAULT_SETTINGS);
    setResetConfirm(false);
    showToast("Settings reset to defaults");
  }, [showToast]);

  // ---------------------------------------------------------------------------
  // Clear conversations
  // ---------------------------------------------------------------------------

  const handleClearConversations = useCallback(async () => {
    try {
      await fetch("/api/memory/purge", { method: "DELETE" });
      localStorage.removeItem("claw-conversations");
      setClearConvoConfirm(false);
      showToast("All conversations cleared");
    } catch {
      showToast("Failed to clear conversations");
    }
  }, [showToast]);

  // ---------------------------------------------------------------------------
  // Clear analytics
  // ---------------------------------------------------------------------------

  const handleClearAnalytics = useCallback(() => {
    localStorage.removeItem("claw-analytics");
    setClearAnalyticsConfirm(false);
    showToast("Analytics data cleared");
  }, [showToast]);

  // ---------------------------------------------------------------------------
  // Export data
  // ---------------------------------------------------------------------------

  const handleExport = useCallback(() => {
    const data: Record<string, string | null> = {
      settings: localStorage.getItem("claw-settings"),
      analytics: localStorage.getItem("claw-analytics"),
      automations: localStorage.getItem("claw-automations"),
      conversations: localStorage.getItem("claw-conversations"),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `claw-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Data exported successfully");
  }, [showToast]);

  // ---------------------------------------------------------------------------
  // Scroll to section on mobile nav click
  // ---------------------------------------------------------------------------

  const scrollToSection = useCallback((id: SectionId) => {
    setActiveSection(id);
    setMobileNavOpen(false);
    const el = document.getElementById(`settings-section-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8"
    >
      {/* Toast */}
      <Toast message={toast} visible={toast.length > 0} />

      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <SettingsIcon className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-xl font-bold text-foreground">Settings</h2>
          {cloudSyncing && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-[10px] text-muted-foreground flex items-center gap-1"
            >
              <Loader2 className="w-3 h-3 animate-spin" />
              Syncing…
            </motion.span>
          )}
        </div>
        <p className="text-sm text-muted-foreground ml-8">
          Configure your workspace, agents, and preferences
        </p>
      </div>

      {/* Save to Cloud Button */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          size="sm"
          onClick={handleSaveToCloud}
          disabled={saving}
          className="gap-2 bg-[#3730a3] hover:bg-[#3730a3]/90 text-white text-xs font-semibold px-5"
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
          {saving ? "Saving..." : "Save Settings to Cloud"}
        </Button>
        <span className="text-[10px] text-muted-foreground hidden sm:inline">
          Auto-saved locally. Click to sync to Supabase.
        </span>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* ---------------------------------------------------------------- */}
        {/* Section Navigation — Desktop: sidebar, Mobile: horizontal scroll  */}
        {/* ---------------------------------------------------------------- */}
        <nav className="lg:w-56 flex-shrink-0">
          {/* Desktop vertical nav */}
          <div className="hidden lg:block sticky top-8">
            <div className="space-y-1">
              {SECTIONS.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 group",
                    activeSection === section.id
                      ? "bg-[#eef2ff] text-[#3730a3] font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-white"
                  )}
                >
                  <span
                    className={cn(
                      "transition-colors duration-200",
                      activeSection === section.id
                        ? "text-[#3730a3]"
                        : "text-muted-foreground group-hover:text-foreground"
                    )}
                  >
                    {section.icon}
                  </span>
                  <span className="flex-1 text-left">{section.label}</span>
                  <ChevronRightIcon
                    className={cn(
                      "w-3.5 h-3.5 transition-opacity",
                      activeSection === section.id
                        ? "opacity-100 text-[#3730a3]"
                        : "opacity-0 group-hover:opacity-50"
                    )}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Mobile horizontal scroll — sticky at top */}
          <div className="lg:hidden overflow-x-auto scrollbar-none -mx-4 px-4 sticky top-0 z-10 bg-[#f5f3ef]/90 backdrop-blur-sm py-2 -mt-2">
            <div className="flex gap-2">
              {SECTIONS.map((section) => (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap border transition-all duration-200 flex-shrink-0 min-h-[36px]",
                    activeSection === section.id
                      ? "bg-[#eef2ff] text-[#3730a3] border-[#3730a3]/20"
                      : "bg-white text-muted-foreground border-[#e8e5df] hover:border-[#999999]/30"
                  )}
                >
                  {section.icon}
                  {section.label}
                </button>
              ))}
            </div>
          </div>
        </nav>

        {/* ---------------------------------------------------------------- */}
        {/* Settings Content                                                  */}
        {/* ---------------------------------------------------------------- */}
        <motion.div
          className="flex-1 space-y-8"
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          {/* ============================================================ */}
          {/* SECTION: Workspace                                           */}
          {/* ============================================================ */}
          {activeSection === "workspace" && (
            <motion.div id="settings-section-workspace" variants={itemVariants} space-y-4>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="w-4 h-4 text-[#3730a3]" />
                    Workspace Profile
                  </CardTitle>
                  <CardDescription>
                    Customize your workspace identity and regional settings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Workspace Name */}
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      Workspace Name
                    </label>
                    <Input
                      value={settings.workspaceName}
                      onChange={(e) => patch({ workspaceName: e.target.value })}
                      placeholder="My Workspace"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      This name appears in the sidebar and notifications
                    </p>
                  </div>

                  {/* Display Name */}
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      Display Name
                    </label>
                    <Input
                      value={settings.displayName}
                      onChange={(e) => patch({ displayName: e.target.value })}
                      placeholder="Your Name"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      How agents address you in conversations
                    </p>
                  </div>

                  {/* Timezone */}
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5" />
                        Timezone
                      </div>
                    </label>
                    <select
                      value={settings.timezone}
                      onChange={(e) => patch({ timezone: e.target.value })}
                      className="w-full h-10 rounded-lg border border-[#e8e5df] bg-white px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3730a3]/20 focus-visible:border-[#3730a3] transition-colors"
                    >
                      {TIMEZONES.map((tz) => (
                        <option key={tz} value={tz}>
                          {tz.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Affects scheduling, reminders, and timestamps
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Connection Status Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-[#3730a3]" />
                    Connected Services
                  </CardTitle>
                  <CardDescription>
                    Status of your integrated service connections
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ServiceStatusRow />
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* ============================================================ */}
          {/* SECTION: Appearance                                          */}
          {/* ============================================================ */}
          {activeSection === "appearance" && (
            <motion.div id="settings-section-appearance" variants={itemVariants}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Palette className="w-4 h-4 text-[#3730a3]" />
                    Theme & Display
                  </CardTitle>
                  <CardDescription>
                    Control how the interface looks and feels
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Theme Selection */}
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-3">
                      Theme
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { value: "light" as const, label: "Light", icon: <Sun className="w-5 h-5" /> },
                        { value: "dark" as const, label: "Dark", icon: <Moon className="w-5 h-5" /> },
                        { value: "system" as const, label: "System", icon: <Monitor className="w-5 h-5" /> },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => handleThemeChange(opt.value)}
                          className={cn(
                            "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all duration-200",
                            settings.theme === opt.value
                              ? "border-[#3730a3] bg-[#eef2ff] text-[#3730a3]"
                              : "border-[#e8e5df] text-muted-foreground hover:border-[#999999]/40 hover:bg-white"
                          )}
                        >
                          {opt.icon}
                          <span className="text-xs font-medium">{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-[#f0ede8]" />

                  {/* Compact Mode */}
                  <Toggle
                    checked={settings.compactMode}
                    onChange={(v) => patch({ compactMode: v })}
                    label="Compact Mode"
                    description="Reduce spacing and padding for a denser layout"
                  />

                  {/* Sidebar Default */}
                  <Toggle
                    checked={settings.sidebarCollapsed}
                    onChange={(v) => patch({ sidebarCollapsed: v })}
                    label="Collapse Sidebar by Default"
                    description="Start with the sidebar minimized on desktop"
                  />
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* ============================================================ */}
          {/* SECTION: Notifications                                       */}
          {/* ============================================================ */}
          {activeSection === "notifications" && (
            <motion.div id="settings-section-notifications" variants={itemVariants}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-[#3730a3]" />
                    Notification Preferences
                  </CardTitle>
                  <CardDescription>
                    Choose which notifications you want to receive
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-1">
                  <Toggle
                    checked={settings.notifEmail}
                    onChange={(v) => handleNotifChange("notifEmail", "email", v)}
                    label="Email Notifications"
                    description="New emails and important inbox updates"
                  />
                  <div className="border-t border-[#f0ede8]" />
                  <Toggle
                    checked={settings.notifCalendar}
                    onChange={(v) => handleNotifChange("notifCalendar", "calendar", v)}
                    label="Calendar Notifications"
                    description="Upcoming events, meeting reminders, and schedule changes"
                  />
                  <div className="border-t border-[#f0ede8]" />
                  <Toggle
                    checked={settings.notifGithub}
                    onChange={(v) => handleNotifChange("notifGithub", "github", v)}
                    label="GitHub Notifications"
                    description="Issues, pull requests, and repository activity"
                  />
                  <div className="border-t border-[#f0ede8]" />
                  <Toggle
                    checked={settings.notifSystem}
                    onChange={(v) => handleNotifChange("notifSystem", "system", v)}
                    label="System Notifications"
                    description="Deployment status, service health, and errors"
                  />
                  <div className="border-t border-[#f0ede8]" />
                  <Toggle
                    checked={settings.notifAgent}
                    onChange={(v) => handleNotifChange("notifAgent", "agent", v)}
                    label="Agent Activity"
                    description="Task completions, delegations, and agent status changes"
                  />
                </CardContent>
              </Card>

              {/* Desktop & Sound */}
              <Card className="mt-6">
                <CardContent className="pt-6 space-y-1">
                  <Toggle
                    checked={settings.notifDesktop}
                    onChange={(v) => handleNotifChange("notifDesktop", "desktop", v)}
                    label="Desktop Push Notifications"
                    description="Show browser notifications for high-priority items"
                  />
                  <div className="border-t border-[#f0ede8]" />
                  <Toggle
                    checked={settings.notifSound}
                    onChange={(v) => handleNotifChange("notifSound", "sound", v)}
                    label="Notification Sound"
                    description="Play a subtle sound for incoming notifications"
                  />
                </CardContent>
              </Card>

              {/* Polling Intervals */}
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="text-sm">Polling Frequency</CardTitle>
                  <CardDescription>
                    How often the platform checks for new notifications
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      Active Tab Interval
                    </label>
                    <select
                      value={settings.pollIntervalActive}
                      onChange={(e) => patch({ pollIntervalActive: Number(e.target.value) })}
                      className="w-full h-10 rounded-lg border border-[#e8e5df] bg-white px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3730a3]/20 focus-visible:border-[#3730a3] transition-colors"
                    >
                      <option value={30}>Every 30 seconds</option>
                      <option value={60}>Every 1 minute</option>
                      <option value={120}>Every 2 minutes</option>
                      <option value={300}>Every 5 minutes</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      Background Tab Interval
                    </label>
                    <select
                      value={settings.pollIntervalBackground}
                      onChange={(e) => patch({ pollIntervalBackground: Number(e.target.value) })}
                      className="w-full h-10 rounded-lg border border-[#e8e5df] bg-white px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3730a3]/20 focus-visible:border-[#3730a3] transition-colors"
                    >
                      <option value={120}>Every 2 minutes</option>
                      <option value={300}>Every 5 minutes</option>
                      <option value={600}>Every 10 minutes</option>
                      <option value={900}>Every 15 minutes</option>
                    </select>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* ============================================================ */}
          {/* SECTION: Agent Configuration                                 */}
          {/* ============================================================ */}
          {activeSection === "agents" && (
            <motion.div id="settings-section-agents" variants={itemVariants} space-y-4>
              {/* Default Agent */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-[#3730a3]" />
                    Agent Defaults
                  </CardTitle>
                  <CardDescription>
                    Default model behavior when starting conversations
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Default Agent */}
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      Default Agent
                    </label>
                    <select
                      value={settings.defaultAgent}
                      onChange={(e) => patch({ defaultAgent: e.target.value })}
                      className="w-full h-10 rounded-lg border border-[#e8e5df] bg-white px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3730a3]/20 focus-visible:border-[#3730a3] transition-colors"
                    >
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.emoji} {agent.name} — {agent.role}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Agent selected when you open the chat page
                    </p>
                  </div>

                  {/* Temperature */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-medium text-foreground">
                        Temperature
                      </label>
                      <span className="text-xs font-mono text-[#3730a3] bg-[#eef2ff] px-2 py-0.5 rounded">
                        {settings.temperature.toFixed(1)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                      value={settings.temperature}
                      onChange={(e) => patch({ temperature: parseFloat(e.target.value) })}
                      className="w-full h-2 rounded-full appearance-none bg-[#e8e5df] accent-[#3730a3] cursor-pointer"
                    />
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] text-muted-foreground">Precise (0)</span>
                      <span className="text-[10px] text-muted-foreground">Creative (2)</span>
                    </div>
                  </div>

                  {/* Max Tokens */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-medium text-foreground">
                        Max Tokens
                      </label>
                      <span className="text-xs font-mono text-[#3730a3] bg-[#eef2ff] px-2 py-0.5 rounded">
                        {settings.maxTokens.toLocaleString()}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="256"
                      max="16384"
                      step="256"
                      value={settings.maxTokens}
                      onChange={(e) => patch({ maxTokens: parseInt(e.target.value) })}
                      className="w-full h-2 rounded-full appearance-none bg-[#e8e5df] accent-[#3730a3] cursor-pointer"
                    />
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] text-muted-foreground">Short (256)</span>
                      <span className="text-[10px] text-muted-foreground">Long (16k)</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Agent Overview Cards */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Agent Overview</CardTitle>
                  <CardDescription>
                    All configured agents and their current settings
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {agents.map((agent) => (
                      <div
                        key={agent.id}
                        className="flex items-center gap-3 p-3 rounded-lg bg-[#faf9f7] border border-[#f0ede8]"
                      >
                        <span className="text-lg flex-shrink-0">{agent.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {agent.name}
                            </p>
                            {settings.defaultAgent === agent.id && (
                              <Badge variant="default" className="text-[9px] px-1.5 py-0">
                                Default
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {agent.role}
                          </p>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <p className="text-[10px] font-medium text-foreground">{agent.model}</p>
                          <p className="text-[10px] text-muted-foreground">{agent.provider}</p>
                        </div>
                        <div className="flex-shrink-0">
                          <Badge variant="outline" className="text-[9px]">
                            {agent.tools.length} tools
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* ============================================================ */}
          {/* SECTION: Data & Privacy                                      */}
          {/* ============================================================ */}
          {activeSection === "data" && (
            <motion.div id="settings-section-data" variants={itemVariants} space-y-4>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-[#3730a3]" />
                    Storage & Analytics
                  </CardTitle>
                  <CardDescription>
                    Control how your data is stored and used
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-1">
                  <Toggle
                    checked={settings.persistConversations}
                    onChange={(v) => patch({ persistConversations: v })}
                    label="Persist Conversations"
                    description="Save chat history to Supabase for continuity across sessions"
                  />
                  <div className="border-t border-[#f0ede8]" />
                  <Toggle
                    checked={settings.analyticsEnabled}
                    onChange={(v) => patch({ analyticsEnabled: v })}
                    label="Usage Analytics"
                    description="Track message counts, tool usage, and agent performance metrics"
                  />
                  <div className="border-t border-[#f0ede8]" />
                  <div className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="pr-4">
                        <p className="text-sm font-medium text-foreground">Auto-Purge Old Data</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Automatically remove conversations older than this
                        </p>
                      </div>
                      <select
                        value={settings.autoPurgeDays}
                        onChange={(e) => patch({ autoPurgeDays: Number(e.target.value) })}
                        className="h-9 rounded-lg border border-[#e8e5df] bg-white px-3 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3730a3]/20 transition-colors"
                      >
                        <option value={7}>7 days</option>
                        <option value={14}>14 days</option>
                        <option value={30}>30 days</option>
                        <option value={60}>60 days</option>
                        <option value={90}>90 days</option>
                        <option value={0}>Never</option>
                      </select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Actions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Data Management</CardTitle>
                  <CardDescription>
                    Export, clear, or manage your stored data
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Export */}
                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-[#eef2ff] flex items-center justify-center">
                        <Download className="w-4 h-4 text-[#3730a3]" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Export All Data</p>
                        <p className="text-xs text-muted-foreground">
                          Download settings, analytics, and conversations as JSON
                        </p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
                      <Download className="w-3.5 h-3.5" />
                      Export
                    </Button>
                  </div>

                  <div className="border-t border-[#f0ede8]" />

                  {/* Clear Conversations */}
                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
                        <TrashIcon className="w-4 h-4 text-red-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Clear Conversations</p>
                        <p className="text-xs text-muted-foreground">
                          Delete all chat history from local storage
                        </p>
                      </div>
                    </div>
                    {clearConvoConfirm ? (
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={handleClearConversations}
                          className="text-[10px] h-7 px-2"
                        >
                          Confirm
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setClearConvoConfirm(false)}
                          className="text-[10px] h-7 px-2"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setClearConvoConfirm(true)}
                        className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                        Clear
                      </Button>
                    )}
                  </div>

                  <div className="border-t border-[#f0ede8]" />

                  {/* Clear Analytics */}
                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
                        <TrashIcon className="w-4 h-4 text-amber-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Clear Analytics</p>
                        <p className="text-xs text-muted-foreground">
                          Remove all usage analytics and metrics
                        </p>
                      </div>
                    </div>
                    {clearAnalyticsConfirm ? (
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={handleClearAnalytics}
                          className="text-[10px] h-7 px-2"
                        >
                          Confirm
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setClearAnalyticsConfirm(false)}
                          className="text-[10px] h-7 px-2"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setClearAnalyticsConfirm(true)}
                        className="gap-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-50 border-amber-200"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                        Clear
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* ============================================================ */}
          {/* SECTION: Danger Zone                                         */}
          {/* ============================================================ */}
          {activeSection === "danger" && (
            <motion.div id="settings-section-danger" variants={itemVariants}>
              <Card className="border-red-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-red-600">
                    <AlertTriangle className="w-4 h-4" />
                    Danger Zone
                  </CardTitle>
                  <CardDescription>
                    Irreversible actions that permanently affect your workspace
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 rounded-lg bg-red-50 border border-red-100">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <h4 className="text-sm font-semibold text-red-800 mb-1">
                          Reset All Settings
                        </h4>
                        <p className="text-xs text-red-600 mb-3">
                          This will reset every setting to its default value. Your conversations,
                          analytics, and automations will NOT be deleted, but all preferences will
                          revert to factory defaults. This action cannot be undone.
                        </p>
                        {resetConfirm ? (
                          <div className="flex items-center gap-2">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={handleReset}
                              className="gap-1.5"
                            >
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Yes, Reset Everything
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setResetConfirm(false)}
                              className="text-xs"
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setResetConfirm(true)}
                            className="gap-1.5"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Reset to Defaults
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-[#faf9f7] border border-[#f0ede8]">
                    <div className="flex items-start gap-3">
                      <RefreshCw className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <h4 className="text-sm font-semibold text-foreground mb-1">
                          Resync with Supabase
                        </h4>
                        <p className="text-xs text-muted-foreground mb-3">
                          Reload settings from the Supabase database, overwriting any local changes.
                          Useful if you have changed settings on another device.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              const res = await fetch("/api/settings");
                              const json = await res.json();
                              if (json.success && json.settings) {
                                setSettings({ ...DEFAULT_SETTINGS, ...json.settings });
                                saveSettings({ ...DEFAULT_SETTINGS, ...json.settings });
                                showToast("Settings synced from Supabase");
                              } else {
                                showToast("No remote settings found");
                              }
                            } catch {
                              showToast("Sync failed — check connection");
                            }
                          }}
                          className="gap-1.5"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Sync Now
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Service Status Row (sub-component)
// ---------------------------------------------------------------------------

function ServiceStatusRow() {
  const [services, setServices] = useState<Record<string, { connected: boolean; name: string }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/services")
      .then((r) => r.json())
      .then((json) => {
        if (json.services) setServices(json.services);
      })
      .catch(() => {
        // Silently fail
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4">
        <div className="w-4 h-4 border-2 border-[#3730a3] border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-muted-foreground">Checking services...</span>
      </div>
    );
  }

  const serviceList = [
    { key: "gmail", name: "Gmail" },
    { key: "github", name: "GitHub" },
    { key: "google_calendar", name: "Calendar" },
    { key: "google_drive", name: "Drive" },
    { key: "google_sheets", name: "Sheets" },
    { key: "google_docs", name: "Docs" },
    { key: "vercel", name: "Vercel" },
  ];

  return (
    <div className="space-y-2">
      {serviceList.map((svc) => {
        const status = services[svc.key];
        const connected = status?.connected ?? false;
        return (
          <div
            key={svc.key}
            className="flex items-center justify-between py-2 px-3 rounded-lg bg-[#faf9f7]"
          >
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "w-2 h-2 rounded-full flex-shrink-0",
                  connected ? "bg-emerald-500" : "bg-[#e8e5df]"
                )}
              />
              <span className="text-sm text-foreground">{svc.name}</span>
            </div>
            <Badge
              variant={connected ? "success" : "secondary"}
              className="text-[10px]"
            >
              {connected ? "Connected" : "Not configured"}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}
