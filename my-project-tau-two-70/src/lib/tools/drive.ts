// ---------------------------------------------------------------------------
// Drive Tools
// ---------------------------------------------------------------------------
import { z, tool, zodSchema, safeJson, safeParseRes,
  gDriveListFiles, gDriveCreateFolder, gDriveCreateFile } from "./shared";

// ---------------------------------------------------------------------------
// Drive Tools
// ---------------------------------------------------------------------------

export const driveListTool = tool({
  description: "List files and folders in Google Drive. Supports search queries.",
  inputSchema: zodSchema(z.object({
    query: z.string().optional().describe("Search query (e.g., \"mimeType='application/vnd.google-apps.folder'\")"),
    pageSize: z.number().optional().describe("Number of results (default: 50)"),
    orderBy: z.string().optional().describe("Order by field (e.g., 'modifiedTime desc', 'name')"),
  })),
  execute: safeJson(async ({ query, pageSize, orderBy }) => {
    return await gDriveListFiles({ q: query, pageSize, orderBy });
  }),
});

export const driveCreateFolderTool = tool({
  description: "Create a new folder in Google Drive.",
  inputSchema: zodSchema(z.object({
    name: z.string().describe("Folder name"),
    parents: z.array(z.string()).optional().describe("Parent folder IDs to place the folder in"),
  })),
  execute: safeJson(async ({ name, parents }) => {
    return await gDriveCreateFolder(name, parents);
  }),
});

export const driveCreateFileTool = tool({
  description: "Create a new file in Google Drive (including Google Docs, Sheets, or Slides by specifying the MIME type).",
  inputSchema: zodSchema(z.object({
    name: z.string().describe("File name"),
    mimeType: z.string().optional().describe("MIME type (e.g., 'application/vnd.google-apps.document' for Docs, 'application/vnd.google-apps.spreadsheet' for Sheets)"),
    parents: z.array(z.string()).optional().describe("Parent folder IDs"),
  })),
  execute: safeJson(async ({ name, mimeType, parents }) => {
    return await gDriveCreateFile(name, mimeType || "application/vnd.google-apps.document", parents);
  }),
});

// Download Google Drive File Tool
// ---------------------------------------------------------------------------

export const downloadDriveFileTool = tool({
  description: "Download a file from Google Drive by its file ID. Returns the file content that can be used for analysis or processing. For Google Docs/Sheets/Slides, exports to a readable format first.",
  inputSchema: zodSchema(z.object({
    fileId: z.string().describe("The Google Drive file ID"),
    mimeType: z.string().optional().describe("Desired export MIME type (for Google Docs/Sheets). Example: 'text/plain', 'application/pdf'"),
  })),
  execute: safeJson(async ({ fileId, mimeType }) => {
    const token = await (await import("../google")).getAccessToken();

    // First, get file metadata
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!metaRes.ok) throw new Error(`Failed to get file metadata: ${metaRes.status}`);
    const metadata = (await metaRes.json()) as { id: string; name: string; mimeType: string; size?: string };

    // Google Docs/Sheets/Slides need to be exported
    const isGoogleApp = metadata.mimeType.startsWith("application/vnd.google-apps");

    let fileContent: string;
    let actualMimeType: string;

    if (isGoogleApp) {
      // Export to a readable format
      const exportMime = mimeType || "text/plain";
      const exportRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (!exportRes.ok) throw new Error(`Failed to export file: ${exportRes.status}`);
      fileContent = await exportRes.text();
      actualMimeType = exportMime;
    } else {
      // Download actual file content
      const downloadRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (!downloadRes.ok) throw new Error(`Failed to download file: ${downloadRes.status}`);

      // Check if text content
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
        // Binary file — return base64
        const buffer = Buffer.from(await downloadRes.arrayBuffer());
        fileContent = buffer.toString("base64");
        actualMimeType = contentType;
      }
    }

    return {
      fileId: metadata.id,
      name: metadata.name,
      mimeType: actualMimeType,
      size: metadata.size,
      isGoogleApp,
      content: fileContent.slice(0, 100000), // Truncate very large files
      contentTruncated: fileContent.length > 100000,
    };
  }),
});
