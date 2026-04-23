// ---------------------------------------------------------------------------
// Settings Store — Unit Tests
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock localStorage before importing the module
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get _store() {
      return store;
    },
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

// Mock global fetch so syncSettingsToCloud doesn't actually make network calls
vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response())));

// Import after mocks are set up
const {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  updateSettings,
  resetSettings,
} = await import("@/lib/settings-store");

describe("settings-store", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // DEFAULT_SETTINGS
  // -----------------------------------------------------------------------
  describe("DEFAULT_SETTINGS", () => {
    it("has the expected top-level keys", () => {
      expect(DEFAULT_SETTINGS).toHaveProperty("workspaceName");
      expect(DEFAULT_SETTINGS).toHaveProperty("displayName");
      expect(DEFAULT_SETTINGS).toHaveProperty("timezone");
      expect(DEFAULT_SETTINGS).toHaveProperty("theme");
      expect(DEFAULT_SETTINGS).toHaveProperty("compactMode");
      expect(DEFAULT_SETTINGS).toHaveProperty("sidebarCollapsed");
      expect(DEFAULT_SETTINGS).toHaveProperty("defaultAgent");
      expect(DEFAULT_SETTINGS).toHaveProperty("maxTokens");
      expect(DEFAULT_SETTINGS).toHaveProperty("temperature");
      expect(DEFAULT_SETTINGS).toHaveProperty("persistConversations");
      expect(DEFAULT_SETTINGS).toHaveProperty("analyticsEnabled");
      expect(DEFAULT_SETTINGS).toHaveProperty("autoPurgeDays");
    });

    it("has the expected notification keys", () => {
      expect(DEFAULT_SETTINGS).toHaveProperty("notifEmail");
      expect(DEFAULT_SETTINGS).toHaveProperty("notifCalendar");
      expect(DEFAULT_SETTINGS).toHaveProperty("notifGithub");
      expect(DEFAULT_SETTINGS).toHaveProperty("notifSystem");
      expect(DEFAULT_SETTINGS).toHaveProperty("notifAgent");
      expect(DEFAULT_SETTINGS).toHaveProperty("notifDesktop");
      expect(DEFAULT_SETTINGS).toHaveProperty("notifSound");
      expect(DEFAULT_SETTINGS).toHaveProperty("pollIntervalActive");
      expect(DEFAULT_SETTINGS).toHaveProperty("pollIntervalBackground");
    });

    it("has sensible default values", () => {
      expect(DEFAULT_SETTINGS.theme).toBe("light");
      expect(DEFAULT_SETTINGS.compactMode).toBe(false);
      expect(DEFAULT_SETTINGS.sidebarCollapsed).toBe(false);
      expect(DEFAULT_SETTINGS.defaultAgent).toBe("general");
      expect(DEFAULT_SETTINGS.maxTokens).toBe(262144);
      expect(DEFAULT_SETTINGS.temperature).toBe(0.7);
      expect(DEFAULT_SETTINGS.persistConversations).toBe(true);
      expect(DEFAULT_SETTINGS.analyticsEnabled).toBe(true);
      expect(DEFAULT_SETTINGS.autoPurgeDays).toBe(30);
    });
  });

  // -----------------------------------------------------------------------
  // loadSettings
  // -----------------------------------------------------------------------
  describe("loadSettings()", () => {
    it("returns DEFAULT_SETTINGS when localStorage is empty", () => {
      const settings = loadSettings();
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });

    it("returns saved settings when they exist in localStorage", () => {
      const custom = { ...DEFAULT_SETTINGS, workspaceName: "Test Workspace" };
      localStorageMock.setItem("klaw-settings", JSON.stringify(custom));

      const settings = loadSettings();
      expect(settings.workspaceName).toBe("Test Workspace");
    });

    it("merges partial saved settings with defaults", () => {
      localStorageMock.setItem(
        "klaw-settings",
        JSON.stringify({ theme: "dark", temperature: 0.9 }),
      );

      const settings = loadSettings();
      expect(settings.theme).toBe("dark");
      expect(settings.temperature).toBe(0.9);
      // The rest should fall back to defaults
      expect(settings.workspaceName).toBe(DEFAULT_SETTINGS.workspaceName);
      expect(settings.maxTokens).toBe(DEFAULT_SETTINGS.maxTokens);
    });

    it("returns defaults when localStorage contains invalid JSON", () => {
      localStorageMock.setItem("klaw-settings", "not-json{{");

      const settings = loadSettings();
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });
  });

  // -----------------------------------------------------------------------
  // saveSettings
  // -----------------------------------------------------------------------
  describe("saveSettings()", () => {
    it("writes settings to localStorage as JSON", () => {
      const custom = { ...DEFAULT_SETTINGS, displayName: "Alice" };
      saveSettings(custom);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "klaw-settings",
        expect.any(String),
      );

      const written = JSON.parse(
        localStorageMock.setItem.mock.calls[
          localStorageMock.setItem.mock.calls.length - 1
        ][1],
      );
      expect(written.displayName).toBe("Alice");
    });

    it("triggers a cloud sync fetch call", () => {
      saveSettings(DEFAULT_SETTINGS);

      expect(globalThis.fetch).toHaveBeenCalledWith("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: expect.any(String),
      });
    });
  });

  // -----------------------------------------------------------------------
  // updateSettings
  // -----------------------------------------------------------------------
  describe("updateSettings()", () => {
    it("merges partial updates with current settings", () => {
      // Seed initial settings
      saveSettings({ ...DEFAULT_SETTINGS, theme: "dark" });

      const updated = updateSettings({ temperature: 1.0 });

      expect(updated.theme).toBe("dark");
      expect(updated.temperature).toBe(1.0);
    });

    it("saves the merged result to localStorage", () => {
      updateSettings({ compactMode: true });

      const raw = localStorageMock.getItem("klaw-settings");
      const parsed = JSON.parse(raw!);
      expect(parsed.compactMode).toBe(true);
    });

    it("returns the fully merged AppSettings object", () => {
      const result = updateSettings({ sidebarCollapsed: true });
      expect(result.sidebarCollapsed).toBe(true);
      // Default fields should still be present
      expect(result).toHaveProperty("workspaceName");
      expect(result).toHaveProperty("maxTokens");
    });
  });

  // -----------------------------------------------------------------------
  // resetSettings
  // -----------------------------------------------------------------------
  describe("resetSettings()", () => {
    it("removes the settings key from localStorage", () => {
      localStorageMock.setItem("klaw-settings", JSON.stringify({ theme: "dark" }));
      resetSettings();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith("klaw-settings");
    });

    it("returns DEFAULT_SETTINGS", () => {
      const result = resetSettings();
      expect(result).toEqual(DEFAULT_SETTINGS);
    });

    it("leaves localStorage empty after reset", () => {
      localStorageMock.setItem("klaw-settings", JSON.stringify({ theme: "dark" }));
      resetSettings();

      expect(localStorageMock.getItem("klaw-settings")).toBeNull();
    });
  });
});
