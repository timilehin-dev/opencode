// ---------------------------------------------------------------------------
// Claw AI Agent System — File Parsing Utility
// ---------------------------------------------------------------------------
// Parses uploaded files into structured content for the chat interface.
// Supports: PDF, DOCX, TXT, CSV, XLSX, JSON, MD, Images (PNG, JPG, GIF, WEBP)
// ---------------------------------------------------------------------------

import { readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedFile {
  content: string;
  type: "text" | "image" | "structured";
  metadata: {
    name: string;
    size: number;
    mimeType: string;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const SUPPORTED_TYPES: Record<string, { type: ParsedFile["type"]; parser: "pdf" | "docx" | "text" | "csv" | "xlsx" | "json" | "image" }> = {
  // Documents
  "application/pdf": { type: "text", parser: "pdf" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { type: "text", parser: "docx" },
  // Spreadsheets
  "text/csv": { type: "structured", parser: "csv" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { type: "structured", parser: "xlsx" },
  "application/vnd.ms-excel": { type: "structured", parser: "xlsx" },
  // Text formats
  "text/plain": { type: "text", parser: "text" },
  "text/markdown": { type: "text", parser: "text" },
  "application/json": { type: "text", parser: "json" },
  // Images
  "image/png": { type: "image", parser: "image" },
  "image/jpeg": { type: "image", parser: "image" },
  "image/gif": { type: "image", parser: "image" },
  "image/webp": { type: "image", parser: "image" },
};

// Also map by extension for files that may not have proper MIME types
const EXTENSION_MAP: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".csv": "text/csv",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds the 10MB limit.` };
  }

  const ext = getExtension(file.name);
  const mimeType = SUPPORTED_TYPES[file.type] ? file.type : (EXTENSION_MAP[ext] || "");

  if (!mimeType || !SUPPORTED_TYPES[mimeType]) {
    return { valid: false, error: `Unsupported file type: ${file.type || ext}. Supported: PDF, DOCX, CSV, XLSX, TXT, JSON, MD, PNG, JPG, GIF, WEBP` };
  }

  return { valid: true };
}

function getExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : "";
}

function resolveMimeType(file: File): string {
  if (SUPPORTED_TYPES[file.type]) return file.type;
  const ext = getExtension(file.name);
  return EXTENSION_MAP[ext] || file.type;
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

async function parsePDF(buffer: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse");
    const data = await pdfParse(buffer);
    return data.text || "";
  } catch (error) {
    console.error("[FileParser] PDF parsing error:", error);
    // Fallback: try reading as text
    return buffer.toString("utf-8").slice(0, 50000);
  }
}

async function parseDOCX(buffer: Buffer): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value || "";
  } catch (error) {
    console.error("[FileParser] DOCX parsing error:", error);
    throw new Error("Failed to parse DOCX file. The file may be corrupted.");
  }
}

async function parseCSV(buffer: Buffer): Promise<string> {
  const text = buffer.toString("utf-8");
  const lines = text.split(/\r?\n/).filter((line) => line.trim());

  if (lines.length === 0) return "(Empty CSV file)";

  // Format as a markdown table
  const headers = lines[0].split(",").map((h) => h.trim());
  let table = `| ${headers.join(" | ")} |\n`;
  table += `| ${headers.map(() => "---").join(" | ")} |\n`;

  for (let i = 1; i < Math.min(lines.length, 101); i++) {
    const cells = lines[i].split(",").map((c) => c.trim());
    table += `| ${cells.join(" | ")} |\n`;
  }

  if (lines.length > 101) {
    table += `\n... and ${lines.length - 101} more rows`;
  }

  return `**CSV Data** (${lines.length - 1} rows, ${headers.length} columns)\n\n${table}`;
}

async function parseXLSX(buffer: Buffer): Promise<string> {
  try {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

    let result = "";
    for (const [sheetName, worksheet] of Object.entries(workbook.worksheets)) {
      if (worksheet.rowCount === 0) continue;

      result += `**Sheet: ${sheetName}**\n`;

      // Format as markdown table (max 50 rows)
      const maxRows = Math.min(worksheet.rowCount, 51);

      // Get headers from first row
      const headerRow = worksheet.getRow(1);
      const headers: string[] = [];
      headerRow.eachCell({ includeEmpty: true }, (cell) => {
        headers.push(String(cell.value ?? ""));
      });

      if (headers.length === 0) continue;

      result += `| ${headers.join(" | ")} |\n`;
      result += `| ${headers.map(() => "---").join(" | ")} |\n`;

      for (let i = 2; i <= maxRows; i++) {
        const row = worksheet.getRow(i);
        const cells: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell) => {
          cells.push(String(cell.value ?? ""));
        });
        // Pad cells array to match header count
        while (cells.length < headers.length) cells.push("");
        result += `| ${cells.join(" | ")} |\n`;
      }

      if (worksheet.rowCount > 51) {
        result += `\n... and ${worksheet.rowCount - 51} more rows\n`;
      }
      result += "\n";
    }

    return result.trim() || "(Empty spreadsheet)";
  } catch (error) {
    console.error("[FileParser] XLSX parsing error:", error);
    throw new Error("Failed to parse XLSX file. The file may be corrupted.");
  }
}

function parseText(buffer: Buffer, mimeType: string): string {
  const text = buffer.toString("utf-8");

  if (mimeType === "application/json") {
    try {
      // Pretty-print JSON
      const parsed = JSON.parse(text);
      return "```json\n" + JSON.stringify(parsed, null, 2) + "\n```";
    } catch {
      // Not valid JSON, treat as plain text
      return text;
    }
  }

  return text;
}

function parseImage(buffer: Buffer): string {
  return buffer.toString("base64");
}

// ---------------------------------------------------------------------------
// Main Parser
// ---------------------------------------------------------------------------

export async function parseFile(file: File): Promise<ParsedFile> {
  // Validate first
  const validation = validateFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const mimeType = resolveMimeType(file);
  const fileInfo = SUPPORTED_TYPES[mimeType];

  if (!fileInfo) {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  // Read file as buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let content: string;

  switch (fileInfo.parser) {
    case "pdf":
      content = await parsePDF(buffer);
      break;
    case "docx":
      content = await parseDOCX(buffer);
      break;
    case "csv":
      content = await parseCSV(buffer);
      break;
    case "xlsx":
      content = await parseXLSX(buffer);
      break;
    case "text":
    case "json":
      content = parseText(buffer, mimeType);
      break;
    case "image":
      content = parseImage(buffer);
      break;
    default:
      throw new Error(`No parser for type: ${fileInfo.parser}`);
  }

  return {
    content,
    type: fileInfo.type,
    metadata: {
      name: file.name,
      size: file.size,
      mimeType,
    },
  };
}

// ---------------------------------------------------------------------------
// Parse from base64 data (for use in tools/APIs)
// ---------------------------------------------------------------------------

export async function parseFileFromBuffer(
  buffer: Buffer,
  filename: string,
  mimeType?: string,
): Promise<ParsedFile> {
  const ext = getExtension(filename);
  const resolvedMime = mimeType || EXTENSION_MAP[ext] || "application/octet-stream";
  const fileInfo = SUPPORTED_TYPES[resolvedMime];

  if (!fileInfo) {
    throw new Error(`Unsupported file type: ${resolvedMime}`);
  }

  let content: string;

  switch (fileInfo.parser) {
    case "pdf":
      content = await parsePDF(buffer);
      break;
    case "docx":
      content = await parseDOCX(buffer);
      break;
    case "csv":
      content = await parseCSV(buffer);
      break;
    case "xlsx":
      content = await parseXLSX(buffer);
      break;
    case "text":
    case "json":
      content = parseText(buffer, resolvedMime);
      break;
    case "image":
      content = parseImage(buffer);
      break;
    default:
      throw new Error(`No parser for type: ${fileInfo.parser}`);
  }

  return {
    content,
    type: fileInfo.type,
    metadata: {
      name: filename,
      size: buffer.length,
      mimeType: resolvedMime,
    },
  };
}
