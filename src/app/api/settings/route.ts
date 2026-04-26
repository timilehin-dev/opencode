import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// GET /api/settings — Read settings from Supabase user_preferences or fallback
// ---------------------------------------------------------------------------
export async function GET() {
  try {
    const supabase = getSupabase();

    if (supabase) {
      const { data, error } = await supabase
        .from("user_preferences")
        .select("key, value")
        .eq("key", "app_settings")
        .single();

      if (!error && data) {
        return NextResponse.json({
          success: true,
          settings: data.value,
          source: "supabase",
        });
      }
    }

    return NextResponse.json({
      success: true,
      settings: null,
      source: "local",
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch settings" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/settings — Save settings to Supabase user_preferences
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { settings } = body;

    if (!settings || typeof settings !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid settings payload" },
        { status: 400 },
      );
    }

    const supabase = getSupabase();

    if (supabase) {
      const { error } = await supabase
        .from("user_preferences")
        .upsert(
          {
            key: "app_settings",
            value: settings,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" },
        );

      if (error) {
        console.error("Settings upsert error:", error);
        return NextResponse.json(
          { success: false, error: "Failed to save to Supabase" },
          { status: 500 },
        );
      }

      return NextResponse.json({ success: true, source: "supabase" });
    }

    return NextResponse.json({
      success: true,
      source: "local",
      message: "Settings saved locally (Supabase not configured)",
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: "Failed to save settings" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/settings — Reset settings
// ---------------------------------------------------------------------------
export async function DELETE() {
  try {
    const supabase = getSupabase();

    if (supabase) {
      const { error } = await supabase
        .from("user_preferences")
        .delete()
        .eq("key", "app_settings");

      if (error) {
        console.error("Settings delete error:", error);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: "Failed to reset settings" },
      { status: 500 },
    );
  }
}
