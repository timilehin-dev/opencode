// ---------------------------------------------------------------------------
// Phase 7C: Health Check & Monitoring API
// ---------------------------------------------------------------------------
// GET /api/health — Returns system health status for monitoring.
// Used by uptime checks, Vercel deployment health, and dashboard status.
// ---------------------------------------------------------------------------

import { isDatabaseReady, getPoolStats } from "@/lib/db";
import { getEnvInfo, hasMinimumConfig } from "@/lib/env-validation";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  const startTime = Date.now();

  // Check database connectivity
  const dbReady = await isDatabaseReady();
  const poolStats = getPoolStats();

  // Check environment configuration
  const envInfo = getEnvInfo();
  const minConfig = hasMinimumConfig();

  // Determine overall status
  let status: "healthy" | "degraded" | "unhealthy";
  const issues: string[] = [];

  if (!minConfig) {
    status = "unhealthy";
    issues.push("Missing required environment variables");
  } else if (!dbReady) {
    status = "unhealthy";
    issues.push("Database connection failed");
  } else if (poolStats.waiting > 5) {
    status = "degraded";
    issues.push("Database connection pool under pressure");
  } else {
    status = "healthy";
  }

  const responseTime = Date.now() - startTime;

  // Log health check (info level for unhealthy, debug for healthy)
  if (status !== "healthy") {
    logger.warn("health", `Health check: ${status}`, { issues, poolStats, responseTime });
  } else {
    logger.debug("health", `Health check: healthy`, { responseTime });
  }

  return Response.json(
    {
      status,
      timestamp: new Date().toISOString(),
      responseTimeMs: responseTime,
      version: "7C", // Phase 7C
      checks: {
        database: {
          status: dbReady ? "ok" : "error",
          pool: poolStats,
        },
        environment: envInfo,
        config: {
          status: minConfig ? "ok" : "error",
        },
      },
      issues: issues.length > 0 ? issues : undefined,
    },
    {
      status: status === "healthy" ? 200 : status === "degraded" ? 200 : 503,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}
