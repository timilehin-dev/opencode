import { NextRequest, NextResponse } from "next/server";
import {
  createSpreadsheet,
  getSpreadsheet,
  batchGetValues,
  addSheet,
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
    const accountId = getAccountId("googlesheets");
    if (!accountId) {
      return err("Google Sheets not connected. Please connect it from the Composio dashboard.", 400);
    }

    switch (action) {
      case "get": {
        const spreadsheetId = searchParams.get("id");
        if (!spreadsheetId) return err("Missing 'id' parameter", 400);
        const ranges = searchParams.get("ranges") || undefined;
        const data = await getSpreadsheet(spreadsheetId, ranges, accountId);
        return ok(data);
      }

      case "values": {
        const spreadsheetId = searchParams.get("id");
        if (!spreadsheetId) return err("Missing 'id' parameter", 400);
        const rangesStr = searchParams.get("ranges");
        if (!rangesStr) return err("Missing 'ranges' parameter", 400);
        const ranges = rangesStr.split(",");
        const data = await batchGetValues(spreadsheetId, ranges, accountId);
        return ok(data);
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
    const accountId = getAccountId("googlesheets");
    if (!accountId) {
      return err("Google Sheets not connected. Please connect it from the Composio dashboard.", 400);
    }

    const body = await req.json();

    switch (action) {
      case "create": {
        const { title } = body as { title: string };
        if (!title) return err("Missing 'title'", 400);
        const data = await createSpreadsheet(title, accountId);
        return ok(data);
      }

      case "addSheet": {
        const { spreadsheetId, properties } = body as {
          spreadsheetId: string;
          properties?: Record<string, unknown>;
        };
        if (!spreadsheetId) return err("Missing 'spreadsheetId'", 400);
        const data = await addSheet(spreadsheetId, properties, accountId);
        return ok(data);
      }

      default:
        return err(`Unknown action: ${action}`, 400);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return err(message);
  }
}
