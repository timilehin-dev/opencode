import { NextRequest, NextResponse } from "next/server";
import {
  listDocs,
  createDoc,
  readDoc,
  appendDocText,
  getAccountId,
} from "@/lib/composio";

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
      case "list": {
        const accountId = getAccountId("googledocs");
        if (!accountId) {
          return err("Google Docs not connected. Please connect it from the Composio dashboard.", 400);
        }
        const docs = await listDocs(accountId);
        return ok(docs);
      }

      case "read": {
        const accountId = getAccountId("googledocs");
        if (!accountId) {
          return err("Google Docs not connected. Please connect it from the Composio dashboard.", 400);
        }
        const documentId = searchParams.get("id");
        if (!documentId) return err("Missing 'id' parameter", 400);
        const content = await readDoc(documentId, accountId);
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
    const accountId = getAccountId("googledocs");
    if (!accountId) {
      return err("Google Docs not connected. Please connect it from the Composio dashboard.", 400);
    }

    const body = await req.json();

    switch (action) {
      case "create": {
        const { title } = body as { title: string };
        if (!title) return err("Missing 'title'", 400);
        const doc = await createDoc(title, accountId);
        return ok(doc);
      }

      case "append": {
        const { documentId, text } = body as {
          documentId: string;
          text: string;
        };
        if (!documentId || !text) return err("Missing 'documentId' or 'text'", 400);
        const result = await appendDocText(documentId, text, accountId);
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
