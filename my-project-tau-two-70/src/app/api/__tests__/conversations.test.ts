// ---------------------------------------------------------------------------
// Conversations API Route — Unit Tests
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock the memory module functions
// ---------------------------------------------------------------------------

const mockDeleteSession = vi.fn();
const mockPurgeAllConversations = vi.fn();

vi.mock("@/lib/memory", () => ({
  deleteSession: (...args: unknown[]) => mockDeleteSession(...args),
  purgeAllConversations: (...args: unknown[]) => mockPurgeAllConversations(...args),
}));

// Mock next/server
const mockJson = vi.fn();
vi.mock("next/server", () => ({
  NextResponse: {
    json: (...args: unknown[]) => {
      mockJson(...args);
      return { status: args[1]?.status ?? 200, body: args[0] };
    },
  },
}));

// Import after mocks
const { DELETE } = await import("@/app/api/conversations/route");

describe("/api/conversations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteSession.mockResolvedValue(true);
    mockPurgeAllConversations.mockResolvedValue({ localStorage: true, supabase: false });
  });

  function makeRequest(body: unknown) {
    return new Request("http://localhost/api/conversations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  // -----------------------------------------------------------------------
  // DELETE with sessionId + agentId
  // -----------------------------------------------------------------------
  describe("DELETE with sessionId + agentId", () => {
    it("calls deleteSession with the correct arguments", async () => {
      const req = makeRequest({ sessionId: "sess-1", agentId: "general" });
      await DELETE(req as any);

      expect(mockDeleteSession).toHaveBeenCalledWith("sess-1", "general");
      expect(mockPurgeAllConversations).not.toHaveBeenCalled();
    });

    it("returns success with deleted: true when messages are found", async () => {
      mockDeleteSession.mockResolvedValue(true);
      const req = makeRequest({ sessionId: "sess-1", agentId: "general" });
      await DELETE(req as any);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, deleted: true }),
      );
    });

    it("returns success with deleted: false when no messages found", async () => {
      mockDeleteSession.mockResolvedValue(false);
      const req = makeRequest({ sessionId: "sess-1", agentId: "general" });
      await DELETE(req as any);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          deleted: false,
          message: "No messages found for this session",
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // DELETE with all: true
  // -----------------------------------------------------------------------
  describe("DELETE with all: true", () => {
    it("calls purgeAllConversations instead of deleteSession", async () => {
      const req = makeRequest({ all: true });
      await DELETE(req as any);

      expect(mockPurgeAllConversations).toHaveBeenCalled();
      expect(mockDeleteSession).not.toHaveBeenCalled();
    });

    it("returns success with the purge result", async () => {
      mockPurgeAllConversations.mockResolvedValue({
        localStorage: true,
        supabase: true,
      });
      const req = makeRequest({ all: true });
      await DELETE(req as any);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          result: { localStorage: true, supabase: true },
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Validation
  // -----------------------------------------------------------------------
  describe("validation", () => {
    it("returns 400 when sessionId is missing", async () => {
      const req = makeRequest({ agentId: "general" });
      await DELETE(req as any);

      expect(mockJson).toHaveBeenCalledWith(
        { success: false, error: "sessionId and agentId are required" },
        { status: 400 },
      );
      expect(mockDeleteSession).not.toHaveBeenCalled();
    });

    it("returns 400 when agentId is missing", async () => {
      const req = makeRequest({ sessionId: "sess-1" });
      await DELETE(req as any);

      expect(mockJson).toHaveBeenCalledWith(
        { success: false, error: "sessionId and agentId are required" },
        { status: 400 },
      );
      expect(mockDeleteSession).not.toHaveBeenCalled();
    });

    it("returns 400 when body is empty (not all, no sessionId/agentId)", async () => {
      const req = makeRequest({});
      await DELETE(req as any);

      expect(mockJson).toHaveBeenCalledWith(
        { success: false, error: "sessionId and agentId are required" },
        { status: 400 },
      );
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------
  describe("error handling", () => {
    it("handles deleteSession errors gracefully", async () => {
      mockDeleteSession.mockRejectedValue(new Error("DB write failed"));
      const req = makeRequest({ sessionId: "sess-1", agentId: "general" });
      await DELETE(req as any);

      expect(mockJson).toHaveBeenCalledWith(
        { success: false, error: "Failed to delete conversations" },
        { status: 500 },
      );
    });

    it("handles purgeAllConversations errors gracefully", async () => {
      mockPurgeAllConversations.mockRejectedValue(new Error("Storage error"));
      const req = makeRequest({ all: true });
      await DELETE(req as any);

      expect(mockJson).toHaveBeenCalledWith(
        { success: false, error: "Failed to delete conversations" },
        { status: 500 },
      );
    });

    it("handles malformed JSON body gracefully", async () => {
      const req = new Request("http://localhost/api/conversations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: "invalid-json{{{",
      });
      await DELETE(req as any);

      expect(mockJson).toHaveBeenCalledWith(
        { success: false, error: "Failed to delete conversations" },
        { status: 500 },
      );
    });
  });
});
