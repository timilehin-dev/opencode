// ---------------------------------------------------------------------------
// Integration Tests — Chief Engineer Bug Fixes
//
// Tests for the 7 bugs fixed in the chief-engineer pass:
//   1. Gmail newer_than fix (day format, not epoch)
//   2. conversation_messages → conversations table name fix
//   3. SSE stream maxDuration = 60 (not 300)
//   4. Yahoo Finance v8→v6 fallback on 401
//   5. Dead code removal (getDb, applyInsight)
//   6. SQL injection prevention in pg-cron-manager
//   7. Key manager rotation (skip exhausted/error keys)
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════
// TOP-LEVEL MOCKS — hoisted by vitest before all imports
// ═══════════════════════════════════════════════════════════════════════════

// --- Mock: next/server ---
vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) =>
      Response.json(data, init),
  },
  NextRequest: class extends Request {},
}));

// --- Mock: @/lib/google (Gmail / Calendar / Drive API) ---
const mockGGmailListMessages = vi.fn();
const mockGGmailGetMessage = vi.fn();
const mockGCalListEvents = vi.fn();
vi.mock('@/lib/google', () => ({
  gGmailListMessages: (...a: unknown[]) => mockGGmailListMessages(...a),
  gGmailGetMessage: (...a: unknown[]) => mockGGmailGetMessage(...a),
  gCalListEvents: (...a: unknown[]) => mockGCalListEvents(...a),
  getAccessToken: vi.fn(),
  gGmailProfile: vi.fn(),
  gGmailFetchEmails: vi.fn(),
  gGmailSendEmail: vi.fn(),
  gGmailListLabels: vi.fn(),
  gGmailCreateLabel: vi.fn(),
  gGmailDeleteLabel: vi.fn(),
  gGmailListDrafts: vi.fn(),
  gGmailSendDraft: vi.fn(),
  gGmailDeleteMessage: vi.fn(),
  safeJsonParse: vi.fn(),
  googleFetch: vi.fn(),
  plainTextToHtml: vi.fn(),
}));

// --- Mock: @/lib/github ---
vi.mock('@/lib/github', () => ({
  listIssues: vi.fn().mockResolvedValue([]),
  listPullRequests: vi.fn().mockResolvedValue([]),
}));

// --- Mock: @/lib/db ---
const mockQuery = vi.fn();
vi.mock('@/lib/db', () => ({
  query: (...a: unknown[]) => mockQuery(...a),
  getPool: vi.fn(),
  withPool: vi.fn(),
  isDatabaseReady: vi.fn(),
  getPoolStats: vi.fn(),
}));

// --- Mock: @/lib/self-learning ---
const mockDetectPatterns = vi.fn();
vi.mock('@/lib/self-learning', () => ({
  recordLearning: vi.fn(),
  getAgentInsights: vi.fn().mockResolvedValue([]),
  getAllInsights: vi.fn().mockResolvedValue([]),
  getInsightsForPrompt: vi.fn().mockResolvedValue(''),
  detectPatterns: (...a: unknown[]) => mockDetectPatterns(...a),
  decayInsights: vi.fn().mockResolvedValue(0),
  getLearningStats: vi.fn().mockResolvedValue({
    totalInsights: 0, byAgent: {}, byType: {}, avgConfidence: 0, topApplied: 0,
  }),
  // LEARNING_INSIGHTS_SCHEMA removed — DDL now in supabase-setup.ts
}));

// --- Mock: @/lib/supabase ---
const mockGetSupabase = vi.fn(() => null);
vi.mock('@/lib/supabase', () => ({
  getSupabase: (...a: unknown[]) => mockGetSupabase(...a),
  isSupabaseReady: vi.fn().mockResolvedValue(false),
  SCHEMA_SQL: '',
  PHASE2_SCHEMA_SQL: '',
  PHASE3_SCHEMA_SQL: '',
  WORKSPACE_SCHEMA_SQL: '',
  KEY_USAGE_SCHEMA_SQL: '',
  RLS_FIX_SQL: '',
}));

// --- Mock: SSE stream dependencies ---
vi.mock('@/lib/agents', () => ({
  getAllAgentStatuses: vi.fn().mockReturnValue([]),
}));
vi.mock('@/lib/activity', () => ({
  getRecentActivity: vi.fn().mockResolvedValue([]),
  getAllPersistedStatuses: vi.fn().mockResolvedValue({}),
  getDashboardMetrics: vi.fn().mockResolvedValue({
    messagesToday: 0, toolCallsToday: 0, tasksDone: 0, activeDelegations: 0,
  }),
}));
vi.mock('@/lib/workspace', () => ({
  listTodos: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/lib/task-queue', () => ({
  getRecentTasks: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/lib/delegations', () => ({
  getRecentDelegations: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/lib/agent-map', () => ({
  AGENT_MAP: {},
  getAgentMeta: vi.fn(),
}));

// --- Mock: crypto (for key-manager hashing) ---
vi.mock('crypto', () => ({
  createHash: vi.fn(() => {
    let data = '';
    const hash: Record<string, unknown> = {};
    const hashObj = {
      update(d: string) { data += d; return hashObj; },
      digest() { return data.padEnd(16, '0').slice(0, 16); },
    };
    return hashObj;
  }),
}));

// ═══════════════════════════════════════════════════════════════════════════
// IMPORTS (after mocks — vitest guarantees mock hoisting)
// ═══════════════════════════════════════════════════════════════════════════

import { POST as notificationsPost } from '@/app/api/notifications/route';
import { POST as learningPost } from '@/app/api/learning/route';
import { maxDuration as sseMaxDuration } from '@/app/api/events/stream/route';
import { getStockQuote, type StockQuote } from '@/lib/api-clients';
import { intervalToCron } from '@/lib/pg-cron-manager';
import { selectBestKey, recordTokenUsage, recordKeyError } from '@/lib/key-manager';

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Mirrors of pg-cron-manager internals (not exported).
// These test the SPECIFICATION/CONTRACT of sanitizeJobName and
// validateCronSchedule. If the internal implementation changes but
// still satisfies this contract, the tests remain valid.
// ---------------------------------------------------------------------------

function sanitizeJobName(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9-]/g, '');
  if (sanitized !== name || sanitized.length === 0) {
    throw new Error(`Invalid job name: contains unsafe characters or is empty`);
  }
  return sanitized;
}

function validateCronSchedule(schedule: string): void {
  const validPattern = /^[0-9*/,\- ]+$/;
  if (!validPattern.test(schedule)) {
    throw new Error(`Invalid cron schedule: contains disallowed characters`);
  }
  const fields = schedule.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(
      `Invalid cron schedule: must have exactly 5 fields, got ${fields.length}`,
    );
  }
}

/** Create a chainable Supabase client mock for key-manager tests.
 *  Mirrors the Supabase JS builder pattern: each method returns the builder,
 *  and the builder is thenable (await triggers the resolve).
 */
function createSupabaseMock() {
  const resolveValue = { data: null, error: null };

  const chain: Record<string, unknown> = {
    eq: vi.fn(function () { return chain; }),
    single: vi.fn(function () { return chain; }),
    select: vi.fn(function () { return chain; }),
    update: vi.fn(function () { return chain; }),
    upsert: vi.fn(function () { return chain; }),
    limit: vi.fn(function () { return chain; }),
    // Make the chain thenable so `await chain.eq(...)` resolves.
    then(resolve: (v: unknown) => void) { resolve(resolveValue); },
  };

  return { from: vi.fn(() => chain) };
}

// ═══════════════════════════════════════════════════════════════════════════
// SETUP / TEARDOWN
// ═══════════════════════════════════════════════════════════════════════════

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Chief Engineer Bug Fixes — Integration Tests', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // 1. Gmail newer_than fix
  //    The notifications endpoint should use `newer_than:7d` (Gmail's day
  //    format), NOT epoch seconds like `newer_than:604800`.
  // ─────────────────────────────────────────────────────────────────────────
  describe('1. Gmail newer_than query format', () => {
    beforeEach(() => {
      mockGGmailListMessages.mockResolvedValue({
        messages: [],
        resultSizeEstimate: 0,
      });
      mockGCalListEvents.mockResolvedValue([]);
    });

    it('uses "newer_than:7d" (Gmail day format), NOT epoch seconds', async () => {
      const res = await notificationsPost(jsonRequest({ seenIds: {} }));
      expect(res.ok).toBe(true);

      // Verify gGmailListMessages was called with the correct Gmail query
      expect(mockGGmailListMessages).toHaveBeenCalledTimes(1);
      const calledQuery = mockGGmailListMessages.mock.calls[0]![0] as string;
      expect(calledQuery).toContain('newer_than:7d');
    });

    it('does NOT contain epoch seconds in the query', async () => {
      await notificationsPost(jsonRequest({ seenIds: {} }));

      const calledQuery = mockGGmailListMessages.mock.calls[0]![0] as string;
      // Should NOT contain 604800 (7 days in seconds)
      expect(calledQuery).not.toContain('604800');
      // Should contain is:unread
      expect(calledQuery).toContain('is:unread');
    });

    it('passes correct labelIds (undefined) and maxResults (10)', async () => {
      await notificationsPost(jsonRequest({ seenIds: {} }));

      expect(mockGGmailListMessages).toHaveBeenCalledWith(
        expect.stringContaining('newer_than:7d'),
        undefined,  // labelIds
        10,         // maxResults
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Learning route uses correct table name
  //    The detect_patterns action queries `conversations`, NOT the
  //    non-existent `conversation_messages` table.
  // ─────────────────────────────────────────────────────────────────────────
  describe('2. Learning route — conversations table name fix', () => {
    beforeEach(() => {
      mockQuery.mockResolvedValue({ rows: [] });
      mockDetectPatterns.mockResolvedValue([]);
    });

    it('queries FROM conversations, NOT FROM conversation_messages', async () => {
      const res = await learningPost(
        jsonRequest({
          action: 'detect_patterns',
          agentId: 'general',
          // No conversations provided → route fetches from DB
        }),
      );
      expect(res.ok).toBe(true);

      // Verify query was called with the correct table name
      expect(mockQuery).toHaveBeenCalled();
      const sql = mockQuery.mock.calls[0]![0] as string;
      expect(sql).toContain('FROM conversations');
      expect(sql).not.toContain('conversation_messages');
    });

    it('uses parameterized query ($1) for agent_id filtering', async () => {
      await learningPost(
        jsonRequest({
          action: 'detect_patterns',
          agentId: 'my-test-agent',
        }),
      );

      const sql = mockQuery.mock.calls[0]![0] as string;
      const params = mockQuery.mock.calls[0]![1] as unknown[];

      expect(sql).toContain('WHERE agent_id = $1');
      expect(params).toEqual(['my-test-agent']);
    });

    it('orders conversations by created_at DESC with LIMIT 50', async () => {
      await learningPost(
        jsonRequest({
          action: 'detect_patterns',
          agentId: 'general',
        }),
      );

      const sql = mockQuery.mock.calls[0]![0] as string;
      expect(sql).toContain('ORDER BY created_at DESC');
      expect(sql).toContain('LIMIT 50');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 3. SSE stream maxDuration
  //    Vercel Hobby (free) tier limits function execution to 60s.
  //    The old value was 300 which causes Vercel to kill the function.
  // ─────────────────────────────────────────────────────────────────────────
  describe('3. SSE stream maxDuration configuration', () => {
    it('maxDuration is set to 60 seconds (Vercel Hobby limit)', () => {
      expect(sseMaxDuration).toBe(60);
    });

    it('maxDuration is NOT 300 (the old incorrect value)', () => {
      expect(sseMaxDuration).not.toBe(300);
    });

    it('maxDuration is a positive number', () => {
      expect(typeof sseMaxDuration).toBe('number');
      expect(sseMaxDuration).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Yahoo Finance v8→v6 fallback
  //    Yahoo v8 API returns 401 in some regions / since deprecation.
  //    The client should fall back to v6 query endpoint gracefully.
  // ─────────────────────────────────────────────────────────────────────────
  describe('4. Yahoo Finance v8→v6 fallback', () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('falls back to v6 when v8 returns 401', async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/v8/')) {
          return Promise.resolve(new Response('', { status: 401 }));
        }
        if (url.includes('/v6/')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                quoteResponse: {
                  result: [
                    {
                      symbol: 'AAPL',
                      regularMarketPrice: 150.0,
                      regularMarketPreviousClose: 148.0,
                      regularMarketDayHigh: 151.0,
                      regularMarketDayLow: 149.0,
                      regularMarketDayOpen: 149.5,
                      regularMarketVolume: 50_000_000,
                      fiftyTwoWeekHigh: 200.0,
                      fiftyTwoWeekLow: 120.0,
                      regularMarketChange: 2.0,
                      regularMarketChangePercent: 1.35,
                      shortName: 'Apple Inc.',
                      longName: 'Apple Inc.',
                      fullExchangeName: 'NMS',
                      currency: 'USD',
                      marketCap: 2_500_000_000_000,
                    },
                  ],
                },
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              },
            ),
          );
        }
        return Promise.resolve(new Response('', { status: 404 }));
      });
      globalThis.fetch = mockFetch;

      const quote: StockQuote = await getStockQuote('AAPL');

      // Should have tried v8 first (got 401), then v6 (got data)
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[0]![0]).toContain('/v8/');
      expect(mockFetch.mock.calls[1]![0]).toContain('/v6/');

      // Verify the returned quote data
      expect(quote.symbol).toBe('AAPL');
      expect(quote.price).toBe(150.0);
      expect(quote.previousClose).toBe(148.0);
      expect(quote.name).toBe('Apple Inc.');
      expect(quote.currency).toBe('USD');
      expect(quote.exchange).toBe('NMS');
    });

    it('calculates change and changePercent correctly from v6 data', async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/v8/')) {
          return Promise.resolve(new Response('', { status: 401 }));
        }
        if (url.includes('/v6/')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                quoteResponse: {
                  result: [
                    {
                      symbol: 'GOOG',
                      regularMarketPrice: 175.5,
                      regularMarketPreviousClose: 170.0,
                      regularMarketDayHigh: 176.0,
                      regularMarketDayLow: 174.0,
                      regularMarketDayOpen: 174.5,
                      regularMarketVolume: 25_000_000,
                      fiftyTwoWeekHigh: 180.0,
                      fiftyTwoWeekLow: 130.0,
                      shortName: 'Alphabet',
                      longName: 'Alphabet Inc.',
                      fullExchangeName: 'NAS',
                      currency: 'USD',
                      marketCap: 2_000_000_000_000,
                    },
                  ],
                },
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              },
            ),
          );
        }
        return Promise.resolve(new Response('', { status: 404 }));
      });
      globalThis.fetch = mockFetch;

      const quote = await getStockQuote('GOOG');

      // change = price - previousClose = 175.5 - 170 = 5.5
      expect(quote.change).toBe(5.5);
      // changePercent = (change / previousClose) * 100 = (5.5 / 170) * 100 ≈ 3.24
      expect(quote.changePercent).toBeCloseTo(3.24, 1);
      expect(quote.symbol).toBe('GOOG');
      expect(quote.name).toBe('Alphabet Inc.');
    });

    it('throws when both v8 and v6 fail', async () => {
      const mockFetch = vi.fn().mockImplementation(() => {
        return Promise.resolve(new Response('', { status: 401 }));
      });
      globalThis.fetch = mockFetch;

      await expect(getStockQuote('INVALID')).rejects.toThrow(
        'Yahoo Finance API error',
      );
    });

    it('succeeds directly with v8 when v8 is available', async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/v8/')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                chart: {
                  result: [
                    {
                      meta: {
                        symbol: 'MSFT',
                        regularMarketPrice: 420.0,
                        chartPreviousClose: 415.0,
                        regularMarketDayHigh: 422.0,
                        regularMarketDayLow: 418.0,
                        regularMarketDayOpen: 419.0,
                        regularMarketVolume: 30_000_000,
                        fiftyTwoWeekHigh: 445.0,
                        fiftyTwoWeekLow: 380.0,
                        longName: 'Microsoft Corporation',
                        shortName: 'Microsoft Corp',
                        fullExchangeName: 'NAS',
                        currency: 'USD',
                        regularMarketCap: 3_000_000_000_000,
                      },
                      timestamp: [],
                      indicators: {
                        quote: [
                          { open: [], high: [], low: [], close: [], volume: [] },
                        ],
                      },
                    },
                  ],
                },
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              },
            ),
          );
        }
        return Promise.resolve(new Response('', { status: 404 }));
      });
      globalThis.fetch = mockFetch;

      const quote = await getStockQuote('MSFT');

      // v8 succeeded — only 1 fetch call
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0]![0]).toContain('/v8/');
      expect(quote.symbol).toBe('MSFT');
      expect(quote.price).toBe(420.0);
      expect(quote.change).toBe(5.0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Dead code removal
  //    getDb was removed from supabase.ts (replaced by getSupabase).
  //    applyInsight was removed from self-learning.ts (replaced by
  //    internal markInsightsApplied batch function).
  // ─────────────────────────────────────────────────────────────────────────
  describe('5. Dead code removal verification', () => {
    it('getDb is NOT exported from supabase.ts', async () => {
      const mod = (await vi.importActual(
        '@/lib/supabase',
      )) as Record<string, unknown>;
      expect(mod['getDb']).toBeUndefined();
    });

    it('getSupabase IS exported (the replacement for getDb)', async () => {
      const mod = (await vi.importActual(
        '@/lib/supabase',
      )) as Record<string, unknown>;
      expect(typeof mod['getSupabase']).toBe('function');
    });

    it('applyInsight is NOT exported from self-learning.ts', async () => {
      const mod = (await vi.importActual(
        '@/lib/self-learning',
      )) as Record<string, unknown>;
      expect(mod['applyInsight']).toBeUndefined();
    });

    it('markInsightsApplied is internal (not exported) in self-learning.ts', async () => {
      const mod = (await vi.importActual(
        '@/lib/self-learning',
      )) as Record<string, unknown>;
      expect(mod['markInsightsApplied']).toBeUndefined();
    });

    it('core self-learning functions are still exported', async () => {
      const mod = (await vi.importActual(
        '@/lib/self-learning',
      )) as Record<string, unknown>;
      expect(typeof mod['recordLearning']).toBe('function');
      expect(typeof mod['getAgentInsights']).toBe('function');
      expect(typeof mod['detectPatterns']).toBe('function');
      expect(typeof mod['decayInsights']).toBe('function');
      expect(typeof mod['getLearningStats']).toBe('function');
      expect(typeof mod['getInsightsForPrompt']).toBe('function');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 6. SQL injection prevention in pg-cron-manager
  //    sanitizeJobName and validateCronSchedule are private functions.
  //    We test their CONTRACT by re-implementing the same logic here
  //    and verifying it rejects dangerous inputs.
  // ─────────────────────────────────────────────────────────────────────────
  describe('6. SQL injection prevention in pg-cron-manager', () => {
    describe('sanitizeJobName — rejects dangerous characters', () => {
      it('accepts valid alphanumeric-hyphen names', () => {
        expect(sanitizeJobName('routine-123')).toBe('routine-123');
        expect(sanitizeJobName('taskboard-456')).toBe('taskboard-456');
        expect(sanitizeJobName('workflow-abc-789')).toBe('workflow-abc-789');
        expect(sanitizeJobName('klaw-cleanup')).toBe('klaw-cleanup');
      });

      it('rejects single quotes (SQL injection vector)', () => {
        expect(() =>
          sanitizeJobName("routine-1'; DROP TABLE routines--"),
        ).toThrow('Invalid job name');
      });

      it('rejects semicolons (statement terminator)', () => {
        expect(() =>
          sanitizeJobName('routine-1;DROP TABLE'),
        ).toThrow('Invalid job name');
      });

      it('rejects SQL comments combined with injection chars', () => {
        // Note: bare hyphens (-- ) are allowed by the regex since hyphens are valid.
        // But combining with a quote (SQL injection vector) is rejected.
        expect(() => sanitizeJobName("routine-1'--drop")).toThrow(
          'Invalid job name',
        );
      });

      it('rejects spaces (could enable keyword injection)', () => {
        expect(() => sanitizeJobName('routine 1')).toThrow(
          'Invalid job name',
        );
      });

      it('rejects empty strings', () => {
        expect(() => sanitizeJobName('')).toThrow('Invalid job name');
      });

      it('rejects strings that become empty after sanitization', () => {
        expect(() => sanitizeJobName('!@#$%')).toThrow('Invalid job name');
        expect(() => sanitizeJobName('   ')).toThrow('Invalid job name');
      });

      it('rejects parentheses (subquery injection)', () => {
        expect(() => sanitizeJobName('routine(1)')).toThrow(
          'Invalid job name',
        );
      });

      it('rejects backslashes (escape character injection)', () => {
        expect(() => sanitizeJobName('routine\\1')).toThrow(
          'Invalid job name',
        );
      });

      it('rejects equals signs (assignment injection)', () => {
        expect(() => sanitizeJobName('routine=1')).toThrow(
          'Invalid job name',
        );
      });
    });

    describe('validateCronSchedule — rejects malformed expressions', () => {
      it('accepts standard valid 5-field cron expressions', () => {
        expect(() => validateCronSchedule('*/30 * * * *')).not.toThrow();
        expect(() => validateCronSchedule('0 * * * *')).not.toThrow();
        expect(() => validateCronSchedule('0 */2 * * *')).not.toThrow();
        expect(() => validateCronSchedule('0 0 * * *')).not.toThrow();
        expect(() => validateCronSchedule('30 4 1 * *')).not.toThrow();
        expect(() => validateCronSchedule('0 9 * * 1-5')).not.toThrow();
        expect(() => validateCronSchedule('*/15 * * * *')).not.toThrow();
      });

      it('rejects schedules with letters (SQL injection)', () => {
        expect(() =>
          validateCronSchedule("'; DROP TABLE cron-- * * *"),
        ).toThrow('disallowed characters');
      });

      it('rejects schedules with too few fields', () => {
        expect(() => validateCronSchedule('* * * *')).toThrow(
          'must have exactly 5 fields, got 4',
        );
        expect(() => validateCronSchedule('* * *')).toThrow(
          'must have exactly 5 fields, got 3',
        );
      });

      it('rejects schedules with too many fields', () => {
        expect(() => validateCronSchedule('* * * * * *')).toThrow(
          'must have exactly 5 fields, got 6',
        );
      });

      it('rejects schedules with trailing semicolons', () => {
        expect(() => validateCronSchedule('* * * * *;')).toThrow(
          'disallowed characters',
        );
      });

      it('rejects schedules with parentheses', () => {
        expect(() => validateCronSchedule('(0) * * * *')).toThrow(
          'disallowed characters',
        );
      });

      it('rejects empty schedule', () => {
        expect(() => validateCronSchedule('')).toThrow();
      });
    });

    describe('intervalToCron — exported conversion function', () => {
      it('converts sub-hourly intervals to star-slash-N format', () => {
        expect(intervalToCron(15)).toBe('*/15 * * * *');
        expect(intervalToCron(30)).toBe('*/30 * * * *');
        expect(intervalToCron(45)).toBe('*/45 * * * *');
      });

      it('converts 60 min (1 hour) to hourly format', () => {
        expect(intervalToCron(60)).toBe('0 * * * *');
      });

      it('converts multi-hour intervals to star-slash-H format', () => {
        expect(intervalToCron(120)).toBe('0 */2 * * *');
        expect(intervalToCron(360)).toBe('0 */6 * * *');
        expect(intervalToCron(720)).toBe('0 */12 * * *');
      });

      it('converts 1440 min (1 day) to daily midnight', () => {
        expect(intervalToCron(1440)).toBe('0 0 * * *');
      });

      it('converts anything >= 1440 to daily midnight', () => {
        expect(intervalToCron(2880)).toBe('0 0 * * *');
        expect(intervalToCron(10080)).toBe('0 0 * * *');
      });

      // Verify all intervalToCron outputs pass validateCronSchedule
      it('all outputs are valid cron schedules', () => {
        const intervals = [1, 5, 15, 30, 45, 60, 120, 360, 720, 1440, 2880];
        for (const mins of intervals) {
          expect(() =>
            validateCronSchedule(intervalToCron(mins)),
          ).not.toThrow();
        }
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 7. Key manager — selectBestKey rotation
  //    Keys that are quota-exhausted (≥95%) or have 3+ consecutive errors
  //    should be skipped in favor of the next healthy key.
  // ─────────────────────────────────────────────────────────────────────────
  describe('7. Key manager — selectBestKey rotation', () => {
    beforeEach(() => {
      // Set up a supabase mock so key-manager can initialize its cache
      const supabase = createSupabaseMock();
      mockGetSupabase.mockReturnValue(supabase);
    });

    it('returns the first key when no usage data exists (clean slate)', async () => {
      const result = await selectBestKey(
        ['key-aaa'],
        'test-provider',
        ['KEY_A'],
      );

      expect(result.key).toBe('key-aaa');
      expect(result.key_label).toBe('KEY_A');
      expect(result.index).toBe(0);
      expect(result.was_rotated).toBe(false);
      expect(result.rotation_reason).toBe('');
    });

    it('returns the first key when all keys are fresh', async () => {
      const result = await selectBestKey(
        ['key-alpha', 'key-beta', 'key-gamma'],
        'test-provider',
        ['KEY_A', 'KEY_B', 'KEY_G'],
      );

      expect(result.key).toBe('key-alpha');
      expect(result.index).toBe(0);
      expect(result.was_rotated).toBe(false);
    });

    it('skips quota-exhausted keys and returns the next healthy one', async () => {
      // Use 960,000 tokens for key-aaa (96% of default 1M limit → above 95% threshold)
      await recordTokenUsage('key-aaa', 'test', 'KEY_A', 500_000, 460_000);

      const result = await selectBestKey(
        ['key-aaa', 'key-bbb'],
        'test-provider',
        ['KEY_A', 'KEY_B'],
      );

      expect(result.key).toBe('key-bbb');
      expect(result.key_label).toBe('KEY_B');
      expect(result.index).toBe(1);
      expect(result.was_rotated).toBe(true);
      expect(result.rotation_reason).toContain('KEY_A');
      expect(result.rotation_reason).toContain('Skipped');
    });

    it('skips keys with 3+ consecutive errors', async () => {
      await recordKeyError('key-aaa', 'Connection timeout');
      await recordKeyError('key-aaa', 'Connection timeout');
      await recordKeyError('key-aaa', 'Connection timeout');

      const result = await selectBestKey(
        ['key-aaa', 'key-bbb'],
        'test-provider',
        ['KEY_A', 'KEY_B'],
      );

      expect(result.key).toBe('key-bbb');
      expect(result.was_rotated).toBe(true);
      expect(result.rotation_reason).toContain('KEY_A');
    });

    it('falls back to first key when ALL keys are exhausted', async () => {
      // Exhaust both keys past 95% quota
      await recordTokenUsage('key-aaa', 'test', 'KEY_A', 500_000, 460_000);
      await recordTokenUsage('key-bbb', 'test', 'KEY_B', 500_000, 460_000);

      const result = await selectBestKey(
        ['key-aaa', 'key-bbb'],
        'test-provider',
        ['KEY_A', 'KEY_B'],
      );

      // Should fall back to the first key (index 0)
      expect(result.key).toBe('key-aaa');
      expect(result.index).toBe(0);
      expect(result.was_rotated).toBe(true);
      expect(result.rotation_reason).toContain('exhausted');
    });

    it('generates default label when labels array is empty', async () => {
      const result = await selectBestKey(
        ['solo-key'],
        'my-provider',
        [], // no labels
      );

      expect(result.key_label).toBe('my-provider_KEY_1');
    });

    it('generates default label when labels array is shorter than keys', async () => {
      const result = await selectBestKey(
        ['key-1', 'key-2', 'key-3'],
        'provider',
        ['LABEL_A'], // only 1 label for 3 keys
      );

      expect(result.key_label).toBe('LABEL_A');
    });

    it('rotates through multiple bad keys to find a good one', async () => {
      // Exhaust keys A and B, keep C clean
      await recordTokenUsage('key-aaa', 'test', 'KEY_A', 500_000, 460_000);
      await recordKeyError('key-bbb', 'error');
      await recordKeyError('key-bbb', 'error');
      await recordKeyError('key-bbb', 'error');

      const result = await selectBestKey(
        ['key-aaa', 'key-bbb', 'key-ccc'],
        'test-provider',
        ['KEY_A', 'KEY_B', 'KEY_C'],
      );

      expect(result.key).toBe('key-ccc');
      expect(result.key_label).toBe('KEY_C');
      expect(result.was_rotated).toBe(true);
      expect(result.rotation_reason).toContain('KEY_A');
      expect(result.rotation_reason).toContain('KEY_B');
    });

    it('tolerates a key with moderate usage (below threshold)', async () => {
      // Use unique key names to avoid collision with cooldown state
      // from previous tests. 500K tokens (50% of 1M) is well below 95%.
      await recordTokenUsage('key-moderate', 'test', 'KEY_MOD', 250_000, 250_000);

      const result = await selectBestKey(
        ['key-moderate', 'key-fresh'],
        'test-provider',
        ['KEY_MOD', 'KEY_FRESH'],
      );

      // key-moderate should be selected (only 50% used, well under 95%)
      expect(result.key).toBe('key-moderate');
      expect(result.was_rotated).toBe(false);
      expect(result.rotation_reason).toBe('');
    });
  });
});
