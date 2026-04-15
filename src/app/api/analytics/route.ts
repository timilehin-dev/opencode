// GET /api/analytics — Returns analytics summary for the dashboard
import { NextResponse } from "next/server";
import { getAnalyticsSummary } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const days = parseInt(url.searchParams.get("days") || "7", 10);

    const summary = getAnalyticsSummary(days);

    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error("[Analytics] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch analytics" },
      { status: 500 },
    );
  }
}
