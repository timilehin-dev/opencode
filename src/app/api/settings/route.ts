import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/core/db";

// ---------------------------------------------------------------------------
// GET /api/settings — Read settings from user_preferences
// ---------------------------------------------------------------------------
export async function GET() {
  try {
    const res = await query(
      'SELECT value FROM user_preferences WHERE key = $1 LIMIT 1',
      ['app_settings']
    );

    const row = res.rows[0];
    if (row) {
      return NextResponse.json({
        success: true,
        settings: row.value,
        source: "database",
      });
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
// POST /api/settings — Save settings to user_preferences
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

    await query(
      `INSERT INTO user_preferences (key, value, updated_at)
       VALUES ('app_settings', $1::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = NOW()`,
      [settings]
    );

    return NextResponse.json({ success: true, source: "database" });
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
    await query('DELETE FROM user_preferences WHERE key = $1', ['app_settings']);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: "Failed to reset settings" },
      { status: 500 },
    );
  }
}
