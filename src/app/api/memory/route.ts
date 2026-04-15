// POST/GET/DELETE /api/memory — Agent memory CRUD
import { NextRequest, NextResponse } from "next/server";
import {
  getAgentMemories,
  addMemory,
  deleteMemory,
  getRecentConversations,
  clearConversationHistory,
} from "@/lib/memory";

// GET — List memories (optionally filtered by ?agentId=x) or conversation history (?type=conversations)
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const agentId = url.searchParams.get("agentId");
    const type = url.searchParams.get("type");

    if (type === "conversations") {
      const limit = parseInt(url.searchParams.get("limit") || "20", 10);
      const conversations = await getRecentConversations(limit);
      return NextResponse.json({ success: true, data: conversations });
    }

    if (!agentId) {
      return NextResponse.json({ success: false, error: "agentId is required" }, { status: 400 });
    }

    const memories = await getAgentMemories(agentId);
    return NextResponse.json({ success: true, data: memories });
  } catch (error) {
    console.error("[Memory] GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch memories" }, { status: 500 });
  }
}

// POST — Add a new memory
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId, category, content, importance } = body;

    if (!agentId || !content) {
      return NextResponse.json(
        { success: false, error: "agentId and content are required" },
        { status: 400 },
      );
    }

    const memory = await addMemory({
      agentId,
      category: category || "general",
      content: content.trim(),
      importance: importance || 5,
    });

    return NextResponse.json({ success: true, data: memory }, { status: 201 });
  } catch (error) {
    console.error("[Memory] POST error:", error);
    return NextResponse.json({ success: false, error: "Failed to add memory" }, { status: 500 });
  }
}

// DELETE — Remove a memory or clear conversation history
export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const clearAgent = url.searchParams.get("clearAgent");

    if (clearAgent) {
      await clearConversationHistory(clearAgent);
      return NextResponse.json({ success: true });
    }

    if (!id) {
      return NextResponse.json({ success: false, error: "id is required" }, { status: 400 });
    }

    const deleted = await deleteMemory(id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: "Memory not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Memory] DELETE error:", error);
    return NextResponse.json({ success: false, error: "Failed to delete memory" }, { status: 500 });
  }
}
