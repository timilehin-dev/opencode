import { NextRequest, NextResponse } from "next/server";
import { deleteSession, purgeAllConversations } from "@/lib/memory/memory";

// ---------------------------------------------------------------------------
// DELETE /api/conversations — Delete a session or all conversations
// ---------------------------------------------------------------------------

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();

    // Delete all conversations
    if (body.all === true) {
      const result = await purgeAllConversations();
      return NextResponse.json({
        success: true,
        result,
      });
    }

    // Delete a specific session
    const { sessionId, agentId } = body;
    if (!sessionId || !agentId) {
      return NextResponse.json(
        { success: false, error: "sessionId and agentId are required" },
        { status: 400 },
      );
    }

    const deleted = await deleteSession(sessionId, agentId);
    if (!deleted) {
      return NextResponse.json({
        success: true,
        message: "No messages found for this session",
        deleted: false,
      });
    }

    return NextResponse.json({ success: true, deleted: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: "Failed to delete conversations" },
      { status: 500 },
    );
  }
}
