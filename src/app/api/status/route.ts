// GET /api/status — Backend health check including Supabase connectivity
import { NextResponse } from "next/server";
import { isSupabaseReady } from "@/lib/schema/supabase";

export async function GET() {
  const supabaseReady = await isSupabaseReady();

  return NextResponse.json({
    success: true,
    data: {
      status: "ok",
      supabase: supabaseReady ? "connected" : "not_configured",
      timestamp: new Date().toISOString(),
    },
  });
}
