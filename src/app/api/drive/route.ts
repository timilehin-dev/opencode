import { NextRequest, NextResponse } from "next/server";
import {
  gDriveListFiles,
  gDriveCreateFolder,
  gDriveCreateFile,
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

      case "files": {
        const q = searchParams.get("q") || "trashed=false";
        const pageSize = Number(searchParams.get("pageSize")) || 50;
        const orderBy = searchParams.get("orderBy") || "modifiedTime desc";
        const files = await gDriveListFiles({ q, pageSize, orderBy });
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
    const body = await req.json();

    switch (action) {
      case "createFolder": {
        const { folderName, parentId } = body as {
          folderName: string;
          parentId?: string;
        };
        if (!folderName) return err("Missing 'folderName'", 400);
        const folder = await gDriveCreateFolder(
          folderName,
          parentId ? [parentId] : undefined,
        );
        return ok(folder);
      }

      case "createFile": {
        const { name, mimeType, parents } = body as {
          name: string;
          mimeType?: string;
          parents?: string[];
        };
        if (!name) return err("Missing 'name'", 400);
        const file = await gDriveCreateFile(
          name,
          mimeType || "application/vnd.google-apps.document",
          parents,
        );
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
