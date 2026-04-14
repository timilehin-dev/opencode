import { NextRequest, NextResponse } from "next/server";
import {
  listDriveFiles,
  createDriveFolder,
  createDriveFile,
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
      case "files": {
        const accountId = getAccountId("googledrive");
        if (!accountId) {
          return err("Google Drive not connected. Please connect it from the Composio dashboard.", 400);
        }
        const q = searchParams.get("q") || undefined;
        const pageSize = Number(searchParams.get("pageSize")) || 50;
        const orderBy = searchParams.get("orderBy") || undefined;
        const files = await listDriveFiles(
          q || pageSize !== 50 || orderBy ? { q, pageSize, orderBy } : undefined,
          accountId,
        );
        return ok(files);
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
    const accountId = getAccountId("googledrive");
    if (!accountId) {
      return err("Google Drive not connected. Please connect it from the Composio dashboard.", 400);
    }

    const body = await req.json();

    switch (action) {
      case "createFolder": {
        const { folderName, parentId } = body as {
          folderName: string;
          parentId?: string;
        };
        if (!folderName) return err("Missing 'folderName'", 400);
        const folder = await createDriveFolder(folderName, parentId, accountId);
        return ok(folder);
      }

      case "createFile": {
        const { name, mimeType, parents } = body as {
          name: string;
          mimeType?: string;
          parents?: string[];
        };
        if (!name) return err("Missing 'name'", 400);
        const file = await createDriveFile(name, mimeType, parents, accountId);
        return ok(file);
      }

      default:
        return err(`Unknown action: ${action}`, 400);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return err(message);
  }
}
