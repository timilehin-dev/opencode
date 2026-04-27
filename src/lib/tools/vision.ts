// ---------------------------------------------------------------------------
// Vision Tools
// ---------------------------------------------------------------------------
import { z, tool, zodSchema, safeJson, ocrSpaceExtract } from "./shared";

// ---------------------------------------------------------------------------
// Vision Analyze Tool (OCR.space — FREE, no LLM token consumption)
// ---------------------------------------------------------------------------

export const visionAnalyzeTool = tool({
  description: "Extract text from images using OCR (Optical Character Recognition). This is a FREE service — no LLM tokens consumed. Supports screenshots, scanned documents, photos with text, receipts, invoices, etc. For Google Drive files, use vision_download_analyze instead (handles download + OCR in one step). NOTE: This tool ONLY extracts text via OCR — it cannot describe images or analyze visual content. For visual/image analysis, use the model's native multimodal capabilities instead.",
  inputSchema: zodSchema(z.object({
    prompt: z.string().optional().describe("Optional: specific question about the image content (e.g., 'What is the total amount?', 'Extract all names')"),
    imageUrl: z.string().optional().describe("URL of the image to analyze"),
    imageBase64: z.string().optional().describe("Base64-encoded image data (with or without data URI prefix)"),
  })),
  execute: safeJson(async ({ prompt, imageUrl, imageBase64 }) => {
    if (!imageUrl && !imageBase64) {
      return { analysis: "No image provided. Please provide an imageUrl or imageBase64." };
    }

    // Clean up base64 if it has a data URI prefix
    let cleanBase64 = imageBase64 || "";
    if (cleanBase64.startsWith("data:")) {
      // Extract base64 after the comma
      cleanBase64 = cleanBase64.split(",")[1] || "";
    }

    // Call OCR.space (FREE — no LLM tokens)
    const result = await ocrSpaceExtract({
      base64: cleanBase64 || undefined,
      url: imageUrl || undefined,
    });

    if (!result.text) {
      return {
        analysis: "No text could be extracted from this image. The image may not contain readable text, or the image quality may be too low.",
        prompt,
      };
    }

    // If the user asked a specific question, include it in context
    let analysis = result.text;
    if (prompt) {
      analysis = `**Your question:** ${prompt}\n\n**Extracted text (${result.wordCount} words, ${result.lineCount} lines):**\n\n${result.text}`;
    } else {
      analysis = `**Extracted text (${result.wordCount} words, ${result.lineCount} lines):**\n\n${result.text}`;
    }

    return { analysis };
  }),
});

// ---------------------------------------------------------------------------
// Vision Download & Analyze Tool (OCR.space — direct Drive → OCR, no LLM tokens)
// ---------------------------------------------------------------------------

export const visionDownloadAnalyzeTool = tool({
  description: "Download a file from Google Drive AND analyze it in a single step. For images: uses FREE OCR to extract text (no LLM tokens consumed). For text/CSV/JSON/PDF files: returns content directly. This is the recommended tool for analyzing any Drive file — one call does everything.",
  inputSchema: zodSchema(z.object({
    fileId: z.string().describe("The Google Drive file ID to download and analyze"),
    prompt: z.string().optional().describe("Optional: specific question about the file (e.g., 'What is the total amount?', 'Summarize the key points')"),
  })),
  execute: safeJson(async ({ fileId, prompt }) => {
    const token = await (await import("@/lib/integrations/google")).getAccessToken();

    // Step 1: Get file metadata
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!metaRes.ok) throw new Error(`Failed to get file metadata: ${metaRes.status}`);
    const metadata = (await metaRes.json()) as { id: string; name: string; mimeType: string; size?: string };

    const isGoogleApp = metadata.mimeType.startsWith("application/vnd.google-apps");

    // Step 2: Download/export file content
    let fileContent: string;
    let actualMimeType: string;

    if (isGoogleApp) {
      const exportMime = metadata.mimeType.includes("document") ? "text/plain"
        : metadata.mimeType.includes("sheet") ? "text/csv"
        : "text/plain";
      const exportRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!exportRes.ok) throw new Error(`Failed to export file: ${exportRes.status}`);
      fileContent = await exportRes.text();
      actualMimeType = exportMime;
    } else {
      const downloadRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!downloadRes.ok) throw new Error(`Failed to download file: ${downloadRes.status}`);
      const contentType = downloadRes.headers.get("content-type") || "";
      if (
        contentType.startsWith("text/") ||
        contentType.includes("json") ||
        contentType.includes("xml") ||
        contentType.includes("csv")
      ) {
        fileContent = await downloadRes.text();
        actualMimeType = contentType;
      } else {
        const buffer = Buffer.from(await downloadRes.arrayBuffer());
        fileContent = buffer.toString("base64");
        actualMimeType = contentType;
      }
    }

    // Step 3: Process based on file type
    const isImage = actualMimeType.startsWith("image/");
    const isPdf = actualMimeType.includes("pdf");

    if (isImage) {
      // Image → OCR.space (FREE, no LLM tokens)
      const ocrResult = await ocrSpaceExtract({ base64: fileContent.slice(0, 1000000) });

      if (!ocrResult.text) {
        return {
          fileName: metadata.name,
          mimeType: actualMimeType,
          size: metadata.size,
          analysis: `No readable text was found in this image (${metadata.name}). The image may contain only graphics/visuals without text content.`,
        };
      }

      const analysis = prompt
        ? `**Your question:** ${prompt}\n\n**Extracted text (${ocrResult.wordCount} words, ${ocrResult.lineCount} lines):**\n\n${ocrResult.text}`
        : `**Extracted text (${ocrResult.wordCount} words, ${ocrResult.lineCount} lines):**\n\n${ocrResult.text}`;

      return {
        fileName: metadata.name,
        mimeType: actualMimeType,
        size: metadata.size,
        analysis,
      };
    }

    // For text/CSV/JSON/XML files — return content directly
    return {
      fileName: metadata.name,
      mimeType: actualMimeType,
      size: metadata.size,
      content: fileContent.slice(0, 50000),
      contentTruncated: fileContent.length > 50000,
      note: isPdf
        ? "PDF text extraction — content may be incomplete for image-heavy or scanned PDFs."
        : "Text file content returned directly.",
    };
  }),
});

