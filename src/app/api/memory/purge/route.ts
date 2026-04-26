import { NextResponse } from "next/server";
import { purgeAllConversations } from "@/lib/memory";

export async function POST() {
  try {
    const result = await purgeAllConversations();
    return NextResponse.json({
      success: true,
      data: result,
      message: "All conversation history purged successfully.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to purge conversations";
    console.error("[Memory] Purge error:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    const result = await purgeAllConversations();
    return NextResponse.json({
      success: true,
      data: result,
      message: "All conversation history purged successfully.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to purge conversations";
    console.error("[Memory] Purge error:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
