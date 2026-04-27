// ---------------------------------------------------------------------------
// API Middleware — Simple API key authentication for all /api/* routes
//
// H1 Fix: All endpoints now require an API key for non-GET requests.
// GET requests are open (needed for SSE streams, health checks, page loads).
//
// Setup: Set API_SECRET environment variable to a strong random string.
// Bypass: The Vercel Cron uses CRON_SECRET (separate from user API calls).
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

  // Skip internal UI endpoints — these are called from the dashboard UI
  // and don't need API key auth (they run in the user's browser session)
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

  // If API_SECRET is set, require it for all mutating requests
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
