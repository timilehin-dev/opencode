// ---------------------------------------------------------------------------
// Claw AI — Settings Store (localStorage-backed, Supabase optional)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AppSettings {
  // Workspace
  workspaceName: string;
  displayName: string;
  timezone: string;

  // Appearance
  theme: "light" | "dark" | "system";
  compactMode: boolean;
  sidebarCollapsed: boolean;

  // Notifications
  notifEmail: boolean;
  notifCalendar: boolean;
  notifGithub: boolean;
  notifSystem: boolean;
  notifAgent: boolean;
  notifDesktop: boolean;
  notifSound: boolean;
  pollIntervalActive: number; // seconds
  pollIntervalBackground: number; // seconds

  // Agent defaults
  defaultAgent: string;
  maxTokens: number;
  temperature: number;

  // Data
  persistConversations: boolean;
  analyticsEnabled: boolean;
  autoPurgeDays: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  workspaceName: "My Workspace",
  displayName: "User",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",

  theme: "light",
  compactMode: false,
  sidebarCollapsed: false,

  notifEmail: true,
  notifCalendar: true,
  notifGithub: true,
  notifSystem: true,
  notifAgent: true,
  notifDesktop: true,
  notifSound: false,
  pollIntervalActive: 60,
  pollIntervalBackground: 300,

  defaultAgent: "general",
  maxTokens: 262144,
  temperature: 0.7,

  persistConversations: true,
  analyticsEnabled: true,
  autoPurgeDays: 30,
};

const STORAGE_KEY = "claw-settings";

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage full or unavailable
  }
  // Fire-and-forget sync to cloud
  syncSettingsToCloud(settings).catch(() => {});
}

/** Sync settings to Supabase via the API. Fire-and-forget safe. */
export async function syncSettingsToCloud(settings: AppSettings): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings }),
    });
  } catch {
    // Network error — ignore, localStorage is the source of truth
  }
}

/** Load settings from Supabase cloud (async). Returns null if unavailable. */
export async function loadSettingsFromCloud(): Promise<AppSettings | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch("/api/settings");
    if (!res.ok) return null;
    const data = await res.json();
    if (data.success && data.settings) {
      return { ...DEFAULT_SETTINGS, ...data.settings };
    }
    return null;
  } catch {
    return null;
  }
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const current = loadSettings();
  const updated = { ...current, ...patch };
  saveSettings(updated);
  return updated;
}

export function resetSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  localStorage.removeItem(STORAGE_KEY);
  return DEFAULT_SETTINGS;
}

// ---------------------------------------------------------------------------
// Timezone helpers
// ---------------------------------------------------------------------------

export const TIMEZONES = [
  "Africa/Lagos",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Nairobi",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "America/Mexico_City",
  "America/Toronto",
  "America/Vancouver",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Singapore",
  "Asia/Seoul",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Moscow",
  "Europe/Istanbul",
  "Pacific/Auckland",
  "Pacific/Honolulu",
  "UTC",
].sort();
