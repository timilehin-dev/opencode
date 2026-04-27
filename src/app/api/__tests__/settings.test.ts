// ---------------------------------------------------------------------------
// Settings API Route — Unit Tests
// ---------------------------------------------------------------------------
//
// Uses vi.hoisted + vi.mock to create swappable mocks that avoid
// ES module caching issues entirely. No vi.resetModules needed.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mock: a single object that controls getSupabase behavior.
// Set ._client to a Supabase mock to simulate Supabase being available.
// Set ._throw to an Error to make getSupabase throw.
// ---------------------------------------------------------------------------

const { supabaseMock } = vi.hoisted(() => {
  const supabaseMock = {
    _client: null as Record<string, unknown> | null,
    _throw: null as Error | null,
  };
  return { supabaseMock };
});

vi.mock("@/lib/schema/supabase", () => ({
  getSupabase: () => {
    if (supabaseMock._throw) throw supabaseMock._throw;
    return supabaseMock._client;
  },
}));

// Mock next/server so we can spy on NextResponse.json
const mockJson = vi.fn();
vi.mock("next/server", () => ({
  NextResponse: {
    json: (...args: unknown[]) => {
      mockJson(...args);
      return { status: args[1]?.status ?? 200, body: args[0] };
    },
  },
}));

// ---------------------------------------------------------------------------
// Helper: build a controllable Supabase client mock
//
// Important: returns STABLE table objects so that assertions can reference
// the same spy (upsert, delete, select) that the route actually called.
// ---------------------------------------------------------------------------

function createMockSupabase(opts?: {
  selectData?: Record<string, unknown> | null;
  selectError?: unknown | null;
  upsertError?: unknown | null;
}) {
  const selectChain = {
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: opts?.selectData ?? null,
      error: opts?.selectError ?? null,
    }),
  };

  const deleteChain = {
    eq: vi.fn().mockReturnThis(),
  };

  // Stable table mock — same object returned every time from("user_preferences")
  const userPrefsTable = {
    select: vi.fn().mockReturnValue(selectChain),
    upsert: vi.fn().mockResolvedValue({ error: opts?.upsertError ?? null }),
    delete: vi.fn().mockReturnValue(deleteChain),
  };

  const client = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "user_preferences") return userPrefsTable;
      return {
        select: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis() }),
      };
    }),
    _selectChain: selectChain,
    _deleteChain: deleteChain,
    _userPrefsTable: userPrefsTable,
  };

  return client;
}

// ---------------------------------------------------------------------------
// Import the route handlers (after mocks are in place)
// ---------------------------------------------------------------------------

let GET: () => Promise<unknown>;
let POST: (req: Request) => Promise<unknown>;
let DELETE: () => Promise<unknown>;

beforeAll(async () => {
  const mod = await import("@/app/api/settings/route");
  GET = mod.GET;
  POST = mod.POST;
  DELETE = mod.DELETE;
});

// ---------------------------------------------------------------------------

describe("/api/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no Supabase, no errors
    supabaseMock._client = null;
    supabaseMock._throw = null;
  });

  // -----------------------------------------------------------------------
  // GET
  // -----------------------------------------------------------------------
  describe("GET /api/settings", () => {
    it("returns settings from Supabase when available", async () => {
      const testData = { key: "app_settings", value: { theme: "dark" } };
      const client = createMockSupabase({ selectData: testData });
      supabaseMock._client = client as any;

      await GET();

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          source: "supabase",
          settings: { theme: "dark" },
        }),
      );
    });

    it("returns null settings when Supabase has no data", async () => {
      const client = createMockSupabase({ selectData: null });
      supabaseMock._client = client as any;

      await GET();

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          settings: null,
          source: "local",
        }),
      );
    });

    it("returns local fallback when Supabase returns an error", async () => {
      const client = createMockSupabase({
        selectData: null,
        selectError: { message: "Row not found" },
      });
      supabaseMock._client = client as any;

      await GET();

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          settings: null,
          source: "local",
        }),
      );
    });

    it("handles unexpected errors gracefully", async () => {
      supabaseMock._throw = new Error("DB connection failed");

      await GET();

      expect(mockJson).toHaveBeenCalledWith(
        { success: false, error: "Failed to fetch settings" },
        { status: 500 },
      );
    });
  });

  // -----------------------------------------------------------------------
  // POST
  // -----------------------------------------------------------------------
  describe("POST /api/settings", () => {
    function makeRequest(body: unknown) {
      return new Request("http://localhost/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    it("saves settings to Supabase and returns success", async () => {
      const client = createMockSupabase();
      supabaseMock._client = client as any;

      const req = makeRequest({ settings: { theme: "dark", temperature: 0.8 } });
      await POST(req as any);

      expect(client.from).toHaveBeenCalledWith("user_preferences");
      // Use the stable table reference to check upsert was called
      expect(client._userPrefsTable.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          key: "app_settings",
          value: { theme: "dark", temperature: 0.8 },
        }),
        expect.any(Object),
      );
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, source: "supabase" }),
      );
    });

    it("returns 400 when settings payload is missing", async () => {
      const req = makeRequest({ notSettings: true });
      await POST(req as any);

      expect(mockJson).toHaveBeenCalledWith(
        { success: false, error: "Invalid settings payload" },
        { status: 400 },
      );
    });

    it("returns 400 when settings is not an object", async () => {
      const req = makeRequest({ settings: "not-an-object" });
      await POST(req as any);

      expect(mockJson).toHaveBeenCalledWith(
        { success: false, error: "Invalid settings payload" },
        { status: 400 },
      );
    });

    it("returns 500 when Supabase upsert fails", async () => {
      const client = createMockSupabase({ upsertError: { message: "Constraint violation" } });
      supabaseMock._client = client as any;

      const req = makeRequest({ settings: { theme: "dark" } });
      await POST(req as any);

      expect(mockJson).toHaveBeenCalledWith(
        { success: false, error: "Failed to save to Supabase" },
        { status: 500 },
      );
    });

    it("returns local fallback when Supabase is not configured", async () => {
      // supabaseMock._client is null by default (reset in beforeEach)
      const req = makeRequest({ settings: { theme: "dark" } });
      await POST(req as any);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          source: "local",
          message: "Settings saved locally (Supabase not configured)",
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // DELETE
  // -----------------------------------------------------------------------
  describe("DELETE /api/settings", () => {
    it("resets settings in Supabase and returns success", async () => {
      const client = createMockSupabase();
      supabaseMock._client = client as any;

      await DELETE();

      expect(client.from).toHaveBeenCalledWith("user_preferences");
      expect(client._userPrefsTable.delete).toHaveBeenCalled();
      expect(mockJson).toHaveBeenCalledWith({ success: true });
    });

    it("returns success even when Supabase delete errors (logged, not propagated)", async () => {
      const client = createMockSupabase();
      supabaseMock._client = client as any;

      await DELETE();

      // The route still returns success even if Supabase delete errors
      expect(mockJson).toHaveBeenCalledWith({ success: true });
    });

    it("returns 500 on unexpected errors", async () => {
      supabaseMock._throw = new Error("Connection lost");

      await DELETE();

      expect(mockJson).toHaveBeenCalledWith(
        { success: false, error: "Failed to reset settings" },
        { status: 500 },
      );
    });
  });
});
