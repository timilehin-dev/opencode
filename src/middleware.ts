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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only apply to /api/* routes
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
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

  // Check for API key in Authorization header or x-api-key header
  const apiKey = request.headers.get("authorization")?.replace("Bearer ", "")
    || request.headers.get("x-api-key");

  const apiSecret = process.env.API_SECRET;

  // If no API_SECRET is configured, allow all requests (development mode)
  if (!apiSecret) {
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
