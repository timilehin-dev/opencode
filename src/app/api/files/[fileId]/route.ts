// ---------------------------------------------------------------------------
// File Serve API — Serve generated files (PDF, DOCX) from /tmp
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

// Map of content types for generated files
const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".json": "application/json",
  ".md": "text/markdown",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  try {
    const { fileId } = await params;

    // Security: only allow alphanumeric, dash, underscore, dot
    if (!/^[a-zA-Z0-9._-]+$/.test(fileId)) {
      return NextResponse.json({ error: "Invalid file ID" }, { status: 400 });
    }

    // Resolve file path — must be in /tmp and start with "claw-"
    const safeFileId = fileId.startsWith("claw-") ? fileId : `claw-${fileId}`;
    const filePath = join(tmpdir(), safeFileId);

    // Check file exists and is in /tmp
    const fileStat = await stat(filePath).catch(() => null);
    if (!fileStat || !fileStat.isFile()) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Verify the resolved path is still in /tmp (prevent path traversal)
    const resolved = (await import("path")).resolve(filePath);
    const tmpResolved = (await import("path")).resolve(tmpdir());
    if (!resolved.startsWith(tmpResolved)) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }

    // Read file
    const buffer = await readFile(filePath);

    // Determine content type from extension
    const ext = (await import("path")).extname(fileId).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || "application/octet-stream";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.length),
        "Content-Disposition": `inline; filename="${fileId}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to serve file";
    console.error("[Files] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
