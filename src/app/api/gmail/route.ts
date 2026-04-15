import { NextRequest, NextResponse } from "next/server";
import {
  gGmailProfile,
  gGmailFetchEmails,
  gGmailSendEmail,
  gGmailListLabels,
  gGmailCreateLabel,
  gGmailDeleteLabel,
  gGmailListDrafts,
  gGmailSendDraft,
  gGmailDeleteMessage,
  getAccessToken,
} from "@/lib/google";

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

      case "profile":
        return ok(await gGmailProfile());

      case "inbox": {
        const max = Number(searchParams.get("max")) || 15;
        const query = searchParams.get("query") || undefined;
        const page = searchParams.get("page") || undefined;
        const data = await gGmailFetchEmails({
          maxResults: max,
          query,
          labelIds: ["INBOX"],
          pageToken: page,
        });
        return ok(data);
      }

      case "search": {
        const q = searchParams.get("query");
        if (!q) return err("Missing 'query' parameter", 400);
        const max = Number(searchParams.get("max")) || 20;
        return ok(await gGmailFetchEmails({ maxResults: max, query: q }));
      }

      case "labels":
        return ok(await gGmailListLabels());

      case "drafts": {
        const max = Number(searchParams.get("max")) || 20;
        const page = searchParams.get("page") || undefined;
        return ok(await gGmailListDrafts(max, page));
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
      case "send": {
        const { to, subject, body: emailBody, is_html, cc, bcc } = body as {
          to: string;
          subject?: string;
          body: string;
          is_html?: boolean;
          cc?: string[];
          bcc?: string[];
        };
        if (!to || !emailBody) return err("Missing 'to' or 'body'", 400);
        return ok(await gGmailSendEmail({ to, subject, body: emailBody, isHtml: is_html, cc, bcc }));
      }

      case "createLabel": {
        const { name } = body as { name: string };
        if (!name) return err("Missing 'name'", 400);
        return ok(await gGmailCreateLabel(name));
      }

      case "deleteLabel": {
        const { labelId } = body as { labelId: string };
        if (!labelId) return err("Missing 'labelId'", 400);
        await gGmailDeleteLabel(labelId);
        return ok({ deleted: true });
      }

      case "sendDraft": {
        const { draftId } = body as { draftId: string };
        if (!draftId) return err("Missing 'draftId'", 400);
        return ok(await gGmailSendDraft(draftId));
      }

      case "deleteMessage": {
        const { messageId } = body as { messageId: string };
        if (!messageId) return err("Missing 'messageId'", 400);
        await gGmailDeleteMessage(messageId);
        return ok({ deleted: true });
      }

      default:
        return err(`Unknown action: ${action}`, 400);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return err(message);
  }
}
