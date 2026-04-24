// ---------------------------------------------------------------------------
// Phase 7C: Rate Limiter
// ---------------------------------------------------------------------------
// In-memory sliding window rate limiter for API routes.
// Configurable per-route with different limits for GET vs mutating requests.
//
// Usage:
//   import { rateLimit, checkRateLimit } from "@/lib/rate-limiter"
//
//   // In an API route:
//   export async function POST(req) {
//     const limiter = checkRateLimit(req, "chat", { maxRequests: 10, windowMs: 60000 });
//     if (limiter.limited) return limiter.response;
//     ...
//   }
//
//   // Or with the decorator:
//   export async function POST(req) {
//     return rateLimit(req, "chat", { maxRequests: 10, windowMs: 60000 }, handler);
//   }
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Sliding Window Rate Limiter
// ---------------------------------------------------------------------------

interface RateLimitConfig {
  /** Maximum requests in the window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Different limit for mutating requests (default: same as maxRequests) */
  maxMutatingRequests?: number;
}

interface RateLimitEntry {
  timestamps: number[];
}

interface RateLimitResult {
  limited: boolean;
  remaining: number;
  resetAt: number;
  response?: Response;
}

// Default configs per route prefix
const DEFAULT_CONFIGS: Record<string, RateLimitConfig> = {
  chat: { maxRequests: 30, windowMs: 60000, maxMutatingRequests: 15 },
  embeddings: { maxRequests: 20, windowMs: 60000 },
  workflows: { maxRequests: 20, windowMs: 60000 },
  skills: { maxRequests: 40, windowMs: 60000 },
  search: { maxRequests: 30, windowMs: 60000 },
  evolution: { maxRequests: 10, windowMs: 60000 },
  // Default for everything else
  default: { maxRequests: 60, windowMs: 60000 },
};

// In-memory store (auto-cleaned on each check)
const store = new Map<string, RateLimitEntry>();

/**
 * Get client identifier from request (IP or x-forwarded-for).
 */
function getClientId(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "anonymous";
}

/**
 * Clean expired timestamps from an entry.
 */
function cleanEntry(entry: RateLimitEntry, now: number, windowMs: number) {
  const cutoff = now - windowMs;
  entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff);
}

/**
 * Get rate limit config for a route.
 */
function getConfig(route: string): RateLimitConfig {
  // Match longest prefix
  for (const [prefix, config] of Object.entries(DEFAULT_CONFIGS)) {
    if (prefix !== "default" && route.includes(prefix)) {
      return config;
    }
  }
  return DEFAULT_CONFIGS.default;
}

/**
 * Check rate limit for a request. Returns a result object.
 * If limited, includes a pre-built 429 Response.
 */
export function checkRateLimit(
  req: NextRequest,
  route: string,
  config?: Partial<RateLimitConfig>,
): RateLimitResult {
  const fullConfig = { ...getConfig(route), ...config };
  const clientId = getClientId(req);
  const key = `${route}:${clientId}`;
  const now = Date.now();

  // Get or create entry
  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Clean expired timestamps
  cleanEntry(entry, now, fullConfig.windowMs);

  // Check limit
  const isMutating = req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS";
  const limit = isMutating && fullConfig.maxMutatingRequests
    ? fullConfig.maxMutatingRequests
    : fullConfig.maxRequests;

  if (entry.timestamps.length >= limit) {
    const oldestInWindow = entry.timestamps[0];
    const resetAt = oldestInWindow + fullConfig.windowMs;
    const retryAfterSec = Math.ceil((resetAt - now) / 1000);
    return {
      limited: true,
      remaining: 0,
      resetAt,
      response: new Response(
        JSON.stringify({
          success: false,
          error: "Rate limit exceeded. Try again later.",
          code: "RATE_LIMITED",
          retryAfter: retryAfterSec,
        }),
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfterSec),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
          },
        },
      ),
    };
  }

  // Record this request
  entry.timestamps.push(now);
  const remaining = limit - entry.timestamps.length;
  const resetAt = entry.timestamps[0] + fullConfig.windowMs;

  return { limited: false, remaining, resetAt };
}

/**
 * Decorator: wraps an API handler with rate limiting.
 * If rate limited, returns 429 response immediately.
 */
export async function rateLimit<T extends Response>(
  req: NextRequest,
  route: string,
  config: Partial<RateLimitConfig>,
  handler: () => Promise<T>,
): Promise<Response> {
  const result = checkRateLimit(req, route, config);

  if (result.limited) {
    return result.response!;
  }

  const response = await handler();

  // Add rate limit headers to successful responses without consuming the body.
  // Pass response.body (ReadableStream) directly to preserve streaming and
  // avoid buffering the entire response into memory.
  const newHeaders = new Headers(response.headers);
  newHeaders.set("X-RateLimit-Remaining", String(result.remaining));
  newHeaders.set("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

/**
 * Periodically clean up old entries from the store.
 * Call this from a cron job or at startup.
 */
export function cleanupStore() {
  const now = Date.now();
  for (const [key, entry] of store) {
    // Remove if empty
    if (entry.timestamps.length === 0) {
      store.delete(key);
      continue;
    }
    // Clean expired
    const windowMs = getConfig(key.split(":")[0]).windowMs;
    cleanEntry(entry, now, windowMs);
    if (entry.timestamps.length === 0) {
      store.delete(key);
    }
  }
}

// Auto-cleanup every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(cleanupStore, 5 * 60 * 1000);
}
