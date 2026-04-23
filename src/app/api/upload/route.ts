import { NextResponse } from "next/server";
import { parseFile, type ParsedFile } from "@/lib/file-parser";

const UPLOAD_SECRET = process.env.CLAW_UPLOAD_SECRET || process.env.UPLOAD_SECRET || "";

export async function POST(req: Request) {
  try {
    // Basic auth check if secret is configured
    if (UPLOAD_SECRET) {
      const authHeader = req.headers.get("authorization");
      const expectedAuth = `Bearer ${UPLOAD_SECRET}`;
      if (authHeader !== expectedAuth) {
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 },
        );
      }
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 },
      );
    }

    // Parse the file using our file-parser utility
    const parsed: ParsedFile = await parseFile(file);

    return NextResponse.json({
      success: true,
      data: {
        name: parsed.metadata.name,
        content: parsed.content,
        type: parsed.type,
        mimeType: parsed.metadata.mimeType,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload file";
    console.error("[Upload] Error:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
