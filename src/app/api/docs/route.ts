import { NextRequest, NextResponse } from "next/server";
import {
  gDocsList,
  gDocsGet,
  gDocsCreate,
  gDocsAppendText,
  getAccessToken,
} from "@/lib/integrations/google";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function ok(data: unknown) {
  return NextResponse.json({ success: true, data });
}

function err(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const action = searchParams.get("action");

  try {
    switch (action) {
      case "status": {
        try {
          await getAccessToken();
          return ok({ connected: true });
        } catch {
          return ok({ connected: false });
        }
      }

      case "list": {
        const docs = await gDocsList();
        return ok(docs);
      }

      case "read": {
        const documentId = searchParams.get("id");
        if (!documentId) return err("Missing 'id' parameter", 400);
        const content = await gDocsGet(documentId);
        return ok(content);
      }

      default:
        return err(`Unknown action: ${action}`, 400);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return err(message);
  }
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const action = searchParams.get("action");

  try {
    const body = await req.json();

    switch (action) {
      case "create": {
        const { title } = body as { title: string };
        if (!title) return err("Missing 'title'", 400);
        const doc = await gDocsCreate(title);
        return ok(doc);
      }

      case "append": {
        const { documentId, text } = body as {
          documentId: string;
          text: string;
        };
        if (!documentId || !text) return err("Missing 'documentId' or 'text'", 400);
        const result = await gDocsAppendText(documentId, text);
        return ok(result);
      }

      default:
        return err(`Unknown action: ${action}`, 400);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return err(message);
  }
}
