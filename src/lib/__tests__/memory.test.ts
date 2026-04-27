// ---------------------------------------------------------------------------
// Memory System — Unit Tests
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock localStorage
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

// Mock getSupabase to return null so tests exercise the localStorage path only
vi.mock("@/lib/schema/supabase", () => ({
  getSupabase: vi.fn(() => null),
}));

// Import after mocks
const {
  saveMessage,
  getConversationHistory,
  deleteSession,
  purgeAllConversations,
} = await import("@/lib/memory/memory");

describe("memory", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // saveMessage
  // -----------------------------------------------------------------------
  describe("saveMessage()", () => {
    it("stores and returns a message with an id and createdAt", async () => {
      const msg = await saveMessage({
        sessionId: "sess-1",
        agentId: "general",
        role: "user",
        content: "Hello world",
      });

      expect(msg.id).toBeDefined();
      expect(msg.sessionId).toBe("sess-1");
      expect(msg.agentId).toBe("general");
      expect(msg.role).toBe("user");
      expect(msg.content).toBe("Hello world");
      expect(msg.createdAt).toBeDefined();
    });

    it("persists the message in localStorage", async () => {
      await saveMessage({
        sessionId: "sess-1",
        agentId: "general",
        role: "user",
        content: "Hello world",
      });

      expect(localStorageMock.setItem).toHaveBeenCalled();
      const lastCall = localStorageMock.setItem.mock.calls.at(-1);
      const key = lastCall![0];
      expect(key).toBe("klaw-conversations");

      const stored = JSON.parse(lastCall![1]);
      expect(stored).toHaveLength(1);
      expect(stored[0].content).toBe("Hello world");
    });

    it("deduplicates identical consecutive messages (same session, agent, role, content)", async () => {
      const msg1 = await saveMessage({
        sessionId: "sess-1",
        agentId: "general",
        role: "user",
        content: "Duplicate me",
      });
      const msg2 = await saveMessage({
        sessionId: "sess-1",
        agentId: "general",
        role: "user",
        content: "Duplicate me",
      });

      // Should return the same message object
      expect(msg2.id).toBe(msg1.id);

      // localStorage should only have been called once for insert (second call is a no-op)
      // The second call should still have setItem but with the same single message
      const lastCall = localStorageMock.setItem.mock.calls.at(-1);
      const stored = JSON.parse(lastCall![1]);
      expect(stored).toHaveLength(1);
    });

    it("allows different messages with same session/agent but different content", async () => {
      await saveMessage({
        sessionId: "sess-1",
        agentId: "general",
        role: "user",
        content: "First",
      });
      await saveMessage({
        sessionId: "sess-1",
        agentId: "general",
        role: "user",
        content: "Second",
      });

      const lastCall = localStorageMock.setItem.mock.calls.at(-1);
      const stored = JSON.parse(lastCall![1]);
      expect(stored).toHaveLength(2);
      expect(stored[0].content).toBe("First");
      expect(stored[1].content).toBe("Second");
    });
  });

  // -----------------------------------------------------------------------
  // getConversationHistory
  // -----------------------------------------------------------------------
  describe("getConversationHistory()", () => {
    it("returns messages filtered by sessionId and agentId", async () => {
      // Seed two sessions
      await saveMessage({ sessionId: "sess-1", agentId: "general", role: "user", content: "Hello" });
      await saveMessage({ sessionId: "sess-1", agentId: "general", role: "assistant", content: "Hi there" });
      await saveMessage({ sessionId: "sess-2", agentId: "general", role: "user", content: "Other session" });

      const history = await getConversationHistory("sess-1", "general");
      expect(history).toHaveLength(2);
      expect(history[0].content).toBe("Hello");
      expect(history[1].content).toBe("Hi there");
    });

    it("returns empty array when no messages exist for the session", async () => {
      const history = await getConversationHistory("nonexistent", "general");
      expect(history).toEqual([]);
    });

    it("respects the limit parameter", async () => {
      for (let i = 0; i < 10; i++) {
        await saveMessage({ sessionId: "sess-1", agentId: "general", role: "user", content: `Msg ${i}` });
      }

      const history = await getConversationHistory("sess-1", "general", 3);
      expect(history).toHaveLength(3);
      // Should return the last 3 messages
      expect(history[0].content).toBe("Msg 7");
      expect(history[2].content).toBe("Msg 9");
    });
  });

  // -----------------------------------------------------------------------
  // deleteSession
  // -----------------------------------------------------------------------
  describe("deleteSession()", () => {
    it("removes messages for a specific sessionId and agentId", async () => {
      await saveMessage({ sessionId: "sess-1", agentId: "general", role: "user", content: "A" });
      await saveMessage({ sessionId: "sess-1", agentId: "general", role: "assistant", content: "B" });
      await saveMessage({ sessionId: "sess-2", agentId: "general", role: "user", content: "C" });

      const deleted = await deleteSession("sess-1", "general");
      expect(deleted).toBe(true);

      // Verify remaining messages
      const remaining = await getConversationHistory("sess-1", "general");
      expect(remaining).toHaveLength(0);

      const otherSession = await getConversationHistory("sess-2", "general");
      expect(otherSession).toHaveLength(1);
      expect(otherSession[0].content).toBe("C");
    });

    it("returns false when no messages exist for the session", async () => {
      const deleted = await deleteSession("nonexistent", "general");
      expect(deleted).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // purgeAllConversations
  // -----------------------------------------------------------------------
  describe("purgeAllConversations()", () => {
    it("clears all conversation data from localStorage", async () => {
      await saveMessage({ sessionId: "sess-1", agentId: "general", role: "user", content: "A" });
      await saveMessage({ sessionId: "sess-2", agentId: "general", role: "user", content: "B" });

      const result = await purgeAllConversations();
      expect(result.localStorage).toBe(true);

      // Verify conversations key was removed
      expect(localStorageMock.removeItem).toHaveBeenCalledWith("klaw-conversations");
    });

    it("returns the status of both localStorage and supabase clear operations", async () => {
      // Supabase is mocked to null, so supabase should be false
      const result = await purgeAllConversations();
      expect(result).toMatchObject({
        localStorage: true,
        supabase: false,
      });
      // Additional purge keys should all be false (no DB connection in test env)
      expect(result.agentMemory).toBe(false);
      expect(result.agentActivity).toBe(false);
      expect(result.learningInsights).toBe(false);
    });
  });
});
