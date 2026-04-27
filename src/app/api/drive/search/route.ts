// ---------------------------------------------------------------------------
// Google Drive Search API — For the chat file picker
// ---------------------------------------------------------------------------
// Supports:
// - Recent files list (no query = last 20 modified files across all folders)
// - Search by name (query param) across all folders
// - Google Docs, Sheets, Slides, and regular files (PDF, DOCX, etc.)
// - File download endpoint for attaching content to chat
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { gDriveListFiles, googleFetch, getAccessToken } from "@/lib/integrations/google";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const query = searchParams.get("q") || "";
    const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);

    // Build Drive query:
    // - No query: show all recent files (no 'root' in parents restriction)
    // - With query: search by name across ALL folders
    // - Include both Google Apps files (Docs/Sheets/Slides) and regular files
    const escaped = query ? query.replace(/\\/g, "\\\\").replace(/'/g, "\\'") : "";
    const driveQuery = escaped
      ? `name contains '${escaped}' and trashed=false`
      : `trashed=false`;

    const files = await gDriveListFiles({
      q: driveQuery,
      pageSize,
      orderBy: "modifiedTime desc",
      fields: "files(id,name,mimeType,size,modifiedTime,createdTime,webViewLink,parents)",
    });

    // Categorize file types for the frontend
    const categorized = files.map((f) => {
      const mime = f.mimeType || "";
      let category: "doc" | "sheet" | "slide" | "pdf" | "image" | "video" | "audio" | "other" = "other";
      if (mime.includes("google-apps.document")) category = "doc";
      else if (mime.includes("google-apps.spreadsheet")) category = "sheet";
      else if (mime.includes("google-apps.presentation")) category = "slide";
      else if (mime === "application/pdf") category = "pdf";
      else if (mime.startsWith("image/")) category = "image";
      else if (mime.startsWith("video/")) category = "video";
      else if (mime.startsWith("audio/")) category = "audio";

      const isGoogleApp = mime.startsWith("application/vnd.google-apps");

      return {
        id: f.id,
        name: f.name,
        mimeType: mime,
        category,
        isGoogleApp,
        size: f.size ? parseInt(f.size, 10) : null,
        modifiedTime: f.modifiedTime,
        webViewLink: f.webViewLink,
      };
    });

    return NextResponse.json({
      success: true,
      data: categorized,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to search Drive";
    console.error("[Drive/Search] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST: Download file content for chat attachment
// ---------------------------------------------------------------------------
// Exports Google Docs/Sheets as readable text, downloads regular files.
// Returns base64 content + metadata.
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fileId, fileName, mimeType, isGoogleApp } = body as {
      fileId: string;
      fileName?: string;
      mimeType?: string;
      isGoogleApp?: boolean;
    };

    if (!fileId) {
      return NextResponse.json({ error: "Missing fileId" }, { status: 400 });
    }

    const mime = mimeType || "";
    let content: string;
    let exportMime: string;

    if (isGoogleApp || mime.startsWith("application/vnd.google-apps")) {
      // Export Google Apps files as text-based formats
      if (mime.includes("document")) {
        // Google Docs → export as text/plain
        const exportUrl = `https://docs.google.com/feeds/download/documents/export/Export?id=${fileId}&exportFormat=txt`;
        const res = await googleFetch(exportUrl);
        if (!res.ok) throw new Error(`Failed to export Doc: ${res.status}`);
        content = await res.text();
        exportMime = "text/plain";
      } else if (mime.includes("spreadsheet")) {
        // Google Sheets → export as CSV
        const exportUrl = `https://docs.google.com/spreadsheets/export?id=${fileId}&exportFormat=csv`;
        const res = await googleFetch(exportUrl);
        if (!res.ok) throw new Error(`Failed to export Sheet: ${res.status}`);
        content = await res.text();
        exportMime = "text/csv";
      } else if (mime.includes("presentation")) {
        // Google Slides → export as text (plain text extraction)
        const exportUrl = `https://docs.google.com/feeds/download/presentations/Export?id=${fileId}&exportFormat=txt`;
        const res = await googleFetch(exportUrl);
        if (!res.ok) throw new Error(`Failed to export Slides: ${res.status}`);
        content = await res.text();
        exportMime = "text/plain";
      } else {
        // Other Google Apps → generic export
        const exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
        const res = await googleFetch(exportUrl);
        if (!res.ok) throw new Error(`Failed to export file: ${res.status}`);
        content = await res.text();
        exportMime = "text/plain";
      }
    } else {
      // Regular file → download via Drive API
      const res = await googleFetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      );
      if (!res.ok) throw new Error(`Failed to download file: ${res.status}`);

      // For text-based files, read as text; for binary, base64 encode
      if (
        mime.startsWith("text/") ||
        mime.includes("json") ||
        mime.includes("xml") ||
        mime.includes("csv") ||
        mime.includes("javascript")
      ) {
        content = await res.text();
        exportMime = mime;
      } else {
        // Binary files (PDF, images, etc.) → base64
        const buffer = await res.arrayBuffer();
        content = Buffer.from(buffer).toString("base64");
        exportMime = mime;
      }
    }

    // Truncate very large content to avoid context overflow
    const maxContentLength = 50000; // ~50KB max
    const truncated = content.length > maxContentLength;
    const finalContent = truncated
      ? content.slice(0, maxContentLength) + `\n\n[Content truncated — original size: ${(content.length / 1024).toFixed(0)}KB]`
      : content;

    return NextResponse.json({
      success: true,
      data: {
        fileName: fileName || fileId,
        content: finalContent,
        mimeType: exportMime,
        isBase64: !exportMime.startsWith("text/"),
        size: content.length,
        truncated,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to download file";
    console.error("[Drive/Search] Download error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
