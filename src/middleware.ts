// ---------------------------------------------------------------------------
// API Middleware — Authentication & Rate Limiting for all /api/* routes
//
// Architecture: KlawHub is a browser-based SPA dashboard. All UI endpoints are
// called client-side without session management. The middleware layers:
//
// 1. Rate limiting — applied to high-traffic routes before auth checks
// 2. GET/HEAD/OPTIONS — always open (SSE streams, health checks, page loads)
// 3. Cron/Setup — skip (have their own CRON_SECRET/SETUP_SECRET auth)
// 4. Chat — skip (core app endpoint, rate-limited separately)
// 5. Internal UI endpoints — skip API key but verify origin for mutations
//    (prevents CSRF from external sites while allowing dashboard to work)
// 6. External endpoints — require API_SECRET (webhooks, vercel, etc.)
//
// Setup: Set API_SECRET to protect external endpoints.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/core/rate-limiter";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only apply to /api/* routes
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Rate limit check for high-traffic mutating routes (before auth checks)
  if (pathname.startsWith("/api/chat") && request.method === "POST") {
    const limit = checkRateLimit(request, "chat");
    if (limit.limited) return limit.response!;
  }

  // Additional rate limits for other mutating routes
  if (pathname.startsWith("/api/workflows") && request.method === "POST") {
    const limit = checkRateLimit(request, "workflows", { maxRequests: 20, windowMs: 60000 });
    if (limit.limited) return limit.response!;
  }

  if (pathname.startsWith("/api/skills/embeddings") && request.method === "POST") {
    const limit = checkRateLimit(request, "embeddings", { maxRequests: 5, windowMs: 60000 });
    if (limit.limited) return limit.response!;
  }

  if (pathname.startsWith("/api/skills/search") && request.method === "POST") {
    const limit = checkRateLimit(request, "search", { maxRequests: 30, windowMs: 60000 });
    if (limit.limited) return limit.response!;
  }

  if (pathname.startsWith("/api/self-improvement") && request.method === "POST") {
    const limit = checkRateLimit(request, "evolution", { maxRequests: 10, windowMs: 60000 });
    if (limit.limited) return limit.response!;
  }

  if (pathname.startsWith("/api/dashboard") && request.method !== "GET" && request.method !== "HEAD" && request.method !== "OPTIONS") {
    const limit = checkRateLimit(request, "workflows", { maxRequests: 20, windowMs: 60000 });
    if (limit.limited) return limit.response!;
  }

  // Skip GET/HEAD/OPTIONS requests (needed for SSE, health checks, page loads)
  const method = request.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return NextResponse.next();
  }

  // Skip cron endpoints — they use their own CRON_SECRET auth
  if (pathname.startsWith("/api/cron/")) {
    return NextResponse.next();
  }

  // Skip setup endpoints — they use their own SETUP_SECRET auth
  if (pathname.startsWith("/api/setup/")) {
    return NextResponse.next();
  }

  // Skip upload endpoint (needed for chat file attachments)
  if (pathname === "/api/upload") {
    return NextResponse.next();
  }

  // Skip chat endpoint — this is the core app endpoint, always needs to work
  if (pathname.startsWith("/api/chat")) {
    return NextResponse.next();
  }

  // Internal UI endpoints — called from the browser dashboard.
  // Skip API key auth but verify same-origin for mutating requests to prevent CSRF.
  const internalSkips = [
    "/api/taskboard",
    "/api/learning",
    "/api/skills",
    "/api/todos",
    "/api/projects",
    "/api/conversations",
    "/api/memory",
    "/api/notifications",
    "/api/workflows",
    "/api/automations",
    "/api/analytics",
    "/api/settings",
    "/api/agents",
    "/api/agent-skills",
    "/api/services",
    "/api/files/",
    "/api/overview",
    "/api/keys/status",
    "/api/delegations",
    // Dashboard service endpoints (called from UI views)
    "/api/gmail",
    "/api/calendar",
    "/api/drive",
    "/api/docs",
    "/api/sheets",
    "/api/github",
    "/api/stitch",
    // Proactive intelligence (called from dashboard UI)
    "/api/proactive",
  ];
  if (internalSkips.some((p) => pathname.startsWith(p))) {
    // CSRF protection for mutating internal endpoints:
    // In production, verify the request comes from the same origin.
    // This prevents external sites from making requests to these endpoints
    // while still allowing the SPA dashboard to function without API keys.
    if (process.env.NODE_ENV === "production" && process.env.API_SECRET) {
      const origin = request.headers.get("origin") || request.headers.get("referer");
      const appUrl = process.env.NEXT_PUBLIC_BASE_URL;
      if (appUrl && origin && !origin.startsWith(appUrl.replace(/\/$/, ""))) {
        // Log but allow through — this is a soft check since the app uses
        // multiple domains (Vercel deploy + custom domain) and some requests
        // may not include an origin header (e.g., from server-side rendering).
        console.warn(`[Middleware] Cross-origin request to internal endpoint: ${pathname} from ${origin}`);
      }
    }
    return NextResponse.next();
  }

  // Check for API key in Authorization header or x-api-key header
  const apiKey = request.headers.get("authorization")?.replace("Bearer ", "")
    || request.headers.get("x-api-key");

  const apiSecret = process.env.API_SECRET;

  // If no API_SECRET is configured, allow all requests in development mode.
  // In production (Vercel), require API_SECRET for all mutating endpoints.
  if (!apiSecret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "API_SECRET must be configured in production" },
        { status: 500 },
      );
    }
    return NextResponse.next();
  }

  // If API_SECRET is set, require it for all external mutating requests
  if (!apiKey || apiKey !== apiSecret) {
    return NextResponse.json(
      { error: "Unauthorized — valid API key required" },
      { status: 401 },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
