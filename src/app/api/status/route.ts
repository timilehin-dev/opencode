// GET /api/status — Backend health check including database connectivity
import { NextResponse } from "next/server";
import { isDatabaseReady } from "@/lib/core/db";

export async function GET() {
  const dbReady = await isDatabaseReady();

  return NextResponse.json({
    success: true,
    data: {
      status: "ok",
      database: dbReady ? "connected" : "not_configured",
      timestamp: new Date().toISOString(),
    },
  });
}
