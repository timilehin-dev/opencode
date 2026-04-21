import { NextResponse } from "next/server";
import { parseFile, type ParsedFile } from "@/lib/file-parser";

export async function POST(req: Request) {
  try {
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
