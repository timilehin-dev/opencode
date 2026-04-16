// ---------------------------------------------------------------------------
// Google Drive Search API — For the chat file picker
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { gDriveListFiles } from "@/lib/google";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const query = searchParams.get("q") || "";
    const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);

    // Search for non-Google-apps files (actual uploaded files)
    const driveQuery = query
      ? `name contains '${query.replace(/'/g, "\\'")}' and trashed=false and 'root' in parents`
      : `trashed=false and 'root' in parents`;

    const files = await gDriveListFiles({
      q: driveQuery,
      pageSize,
      orderBy: "modifiedTime desc",
      fields: "files(id,name,mimeType,size,modifiedTime,webViewLink)",
    });

    // Filter to only show downloadable file types
    const downloadableFiles = files.filter(
      (f) =>
        !f.mimeType?.startsWith("application/vnd.google-apps"),
    );

    return NextResponse.json({
      success: true,
      data: downloadableFiles.map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size ? parseInt(f.size, 10) : null,
        modifiedTime: f.modifiedTime,
        webViewLink: f.webViewLink,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to search Drive";
    console.error("[Drive/Search] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
