import { NextRequest, NextResponse } from "next/server";
import {
  gSheetsGet,
  gSheetsGetValues,
  gSheetsCreate,
  gSheetsAddSheet,
  gSheetsAppendValues,
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

      case "get": {
        const spreadsheetId = searchParams.get("id") || searchParams.get("spreadsheetId");
        if (!spreadsheetId) return err("Missing spreadsheet ID", 400);
        const data = await gSheetsGet(spreadsheetId);
        return ok(data);
      }

      case "values": {
        const spreadsheetId = searchParams.get("id") || searchParams.get("spreadsheetId");
        const range = searchParams.get("range");
        if (!spreadsheetId) return err("Missing spreadsheet ID", 400);
        if (!range) return err("Missing 'range' parameter (e.g. 'Sheet1!A1:Z100')", 400);
        const data = await gSheetsGetValues(spreadsheetId, range);
        return ok(data.values);
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
        const data = await gSheetsCreate(title);
        return ok(data);
      }

      case "addSheet": {
        const { spreadsheetId, sheetName } = body as {
          spreadsheetId: string;
          sheetName: string;
        };
        if (!spreadsheetId || !sheetName) return err("Missing 'spreadsheetId' or 'sheetName'", 400);
        const data = await gSheetsAddSheet(spreadsheetId, sheetName);
        return ok(data);
      }

      case "append": {
        const { spreadsheetId, range, values } = body as {
          spreadsheetId: string;
          range: string;
          values: string[][];
        };
        if (!spreadsheetId || !range || !values) {
          return err("Missing 'spreadsheetId', 'range', or 'values'", 400);
        }
        const data = await gSheetsAppendValues(spreadsheetId, range, values);
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
