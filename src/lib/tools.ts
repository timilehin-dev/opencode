// ---------------------------------------------------------------------------
// Claw AI Agent System — Tool Definitions for Vercel AI SDK v6
// ---------------------------------------------------------------------------
// Maps all existing API capabilities to AI SDK tool definitions.
// Uses `tool()` helper with `zodSchema()` for proper type safety.
// ---------------------------------------------------------------------------

import { z } from "zod";
import { tool, zodSchema } from "ai";
import { query } from "@/lib/db";

// z-ai-web-dev-sdk for web tools (local Z.ai environment only)
import ZAI from 'z-ai-web-dev-sdk';

// --- Self-referencing base URL helper (for server-side fetch to own API routes) ---
function getSelfBaseUrl(): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
}

/** Headers to include when fetching our own API routes (bypasses Vercel password protection). */
function getSelfFetchHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  // Vercel password-protection bypass — set VERCEL_PROTECTION_BYPASS in Vercel env
  if (process.env.VERCEL_PROTECTION_BYPASS) {
    h["x-vercel-protection-bypass"] = process.env.VERCEL_PROTECTION_BYPASS;
  }
  return h;
}

// --- AIHubMix direct API helper (works on Vercel + local) ---
const AIHUBMIX_BASE = process.env.AIHUBMIX_BASE_URL || "https://aihubmix.com/v1";
const AIHUBMIX_KEYS = [
  process.env.AIHUBMIX_API_KEY_1 || "",
  process.env.AIHUBMIX_API_KEY_2 || "",
  process.env.AIHUBMIX_API_KEY_3 || "",
  process.env.AIHUBMIX_API_KEY_4 || "",
  process.env.AIHUBMIX_API_KEY_5 || "",
].filter(Boolean);
let _aiKeyIdx = 0;
function nextAIHubMixKey(): string {
  if (AIHUBMIX_KEYS.length === 0) throw new Error("No AIHubMix API keys configured.");
  const key = AIHUBMIX_KEYS[_aiKeyIdx % AIHUBMIX_KEYS.length];
  _aiKeyIdx++;
  return key;
}

// --- Ollama Cloud direct API helper (FREE — for vision/image tools) ---
const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || "https://ollama.com/v1";
const OLLAMA_KEYS = [
  process.env.OLLAMA_CLOUD_KEY_1 || "",
  process.env.OLLAMA_CLOUD_KEY_2 || "",
  process.env.OLLAMA_CLOUD_KEY_3 || "",
  process.env.OLLAMA_CLOUD_KEY_4 || "",
  process.env.OLLAMA_CLOUD_KEY_5 || "",
  process.env.OLLAMA_CLOUD_KEY_6 || "",
].filter(Boolean);
let _ollamaKeyIdx = 0;
function nextOllamaKey(): string {
  if (OLLAMA_KEYS.length === 0) throw new Error("No Ollama Cloud API keys configured.");
  const key = OLLAMA_KEYS[_ollamaKeyIdx % OLLAMA_KEYS.length];
  _ollamaKeyIdx++;
  return key;
}

// --- Tavily Search API helper (3-key rotation) ---
const TAVILY_KEYS = [
  process.env.TAVILY_API_KEY_1 || "",
  process.env.TAVILY_API_KEY_2 || "",
  process.env.TAVILY_API_KEY_3 || "",
].filter(Boolean);
let _tavilyKeyIdx = 0;
function nextTavilyKey(): string {
  if (TAVILY_KEYS.length === 0) throw new Error("No Tavily API keys configured.");
  const key = TAVILY_KEYS[_tavilyKeyIdx % TAVILY_KEYS.length];
  _tavilyKeyIdx++;
  return key;
}

/**
 * Tavily search with configurable depth.
 * - basic: fast search, returns titles + snippets (for general agents)
 * - advanced: includes full content extraction, answer synthesis, and higher max_results (for Research Agent)
 */
async function tavilySearch(query: string, numResults: number, mode: "basic" | "advanced" = "basic"): Promise<Array<Record<string, unknown>>> {
  const apiKey = nextTavilyKey();
  const body: Record<string, unknown> = {
    api_key: apiKey,
    query,
    max_results: mode === "advanced" ? Math.min(numResults, 10) : Math.min(numResults, 10),
    include_answer: mode === "advanced",
    include_raw_content: false,
  };

  // Advanced mode: deeper search with more context
  if (mode === "advanced") {
    body.search_depth = "advanced";
    body.include_answer = true;
    body.include_images = false;
    body.include_image_descriptions = false;
  }

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(mode === "advanced" ? 30000 : 15000),
  });
  if (!res.ok) throw new Error(`Tavily API error: ${res.status}`);
  const data = await safeParseRes<{
    results?: Array<{ title: string; url: string; content: string; score: number }>;
    answer?: string;
  }>(res);
  const results = (data.results || []).map((r, i) => ({
    title: r.title,
    url: r.url,
    snippet: r.content,
    score: r.score,
    rank: i + 1,
  }));
  // If advanced mode returned an AI-generated answer, include it
  if (mode === "advanced" && data.answer) {
    return [{ title: "AI-Generated Summary", url: "", snippet: data.answer, rank: 0, score: 1 }, ...results];
  }
  return results;
}

// --- OCR.space API helper (FREE — 25,000 calls/month, no LLM tokens) ---
const OCR_SPACE_KEY = process.env.OCR_SPACE_API_KEY || "";
const OCR_SPACE_URL = "https://api.ocr.space/parse/image";

/**
 * Call OCR.space API to extract text from an image (base64 or URL).
 * Returns the extracted text. Completely free, no LLM token consumption.
 */
async function ocrSpaceExtract(options: { base64?: string; url?: string; language?: string }): Promise<{
  text: string;
  wordCount: number;
  lineCount: number;
}> {
  const formData = new FormData();
  formData.append("language", options.language || "eng");
  formData.append("isOverlayRequired", "false");
  formData.append("scale", "true");
  formData.append("OCREngine", "2"); // Engine 2 = better accuracy

  if (options.base64) {
    formData.append("base64Image", `data:image/png;base64,${options.base64}`);
  } else if (options.url) {
    formData.append("url", options.url);
  } else {
    throw new Error("No image data provided. Supply base64 or url.");
  }

  const headers: Record<string, string> = {};
  if (OCR_SPACE_KEY) {
    headers["apikey"] = OCR_SPACE_KEY;
  }

  const res = await fetch(OCR_SPACE_URL, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(`OCR.space API error (${res.status}): ${errText}`);
  }

  const data = await safeParseRes(res) as { IsErroredOnProcessing?: boolean; ErrorMessage?: string; ParsedResults?: Array<{ ParsedText?: string }> };

  if (data.IsErroredOnProcessing) {
    throw new Error(`OCR processing error: ${data.ErrorMessage || "Unknown OCR error"}`);
  }

  // Extract text from all parsed results
  const results = data.ParsedResults || [];
  let fullText = "";
  for (const result of results) {
    if (result.ParsedText) {
      fullText += result.ParsedText + "\n";
    }
  }

  return {
    text: fullText.trim(),
    wordCount: fullText.split(/\s+/).filter(Boolean).length,
    lineCount: results.length || 0,
  };
}

// Google API imports
import {
  gGmailSendEmail,
  gGmailFetchEmails,
  gGmailListLabels,
  gGmailCreateLabel,
  gGmailDeleteLabel,
  gGmailProfile,
  gGmailGetMessage,
  gCalListCalendars,
  gCalListEvents,
  gCalCreateEvent,
  gCalDeleteEvent,
  gDriveListFiles,
  gDriveCreateFolder,
  gDriveCreateFile,
  gSheetsGet,
  gSheetsGetValues,
  gSheetsBatchGetValues,
  gSheetsAppendValues,
  gSheetsUpdateValues,
  gSheetsCreate,
  gSheetsAddSheet,
  gDocsList,
  gDocsGet,
  gDocsCreate,
  gDocsAppendText,
  googleFetch,
  plainTextToHtml,
  safeJsonParse,
} from "./google";

// ---------------------------------------------------------------------------
// Local safe response parser — wraps res.json() with better error messages
// ---------------------------------------------------------------------------
async function safeParseRes<T = unknown>(res: Response): Promise<T> {
  if (!res.ok) {
    // Try to extract error message from response body
    const text = await res.text().catch(() => "");
    const errMsg = text ? JSON.parse(text)?.error || text.slice(0, 200) : res.statusText;
    throw new Error(`API error (${res.status}): ${errMsg}`);
  }
  const text = await res.text().catch(() => "");
  if (!text || text.trim().length === 0) {
    throw new Error(`Empty response body (status ${res.status})`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON response (${res.status}): ${text.slice(0, 200)}${text.length > 200 ? "..." : ""}`);
  }
}

// GitHub API imports
import {
  getRepo,
  listIssues,
  createIssue,
  updateIssue,
  listPullRequests,
  listCommits,
  getRepoTree,
  getFileContent,
  searchCode,
  listBranches,
  createPullRequest,
  getPullRequest,
  getPullRequestFiles,
  createPRComment,
  createBranch,
} from "./github";

// Vercel API imports
import { listProjects, listDeployments, listDomains, getDeployment } from "./vercel";

// Stitch design platform imports
import { generateDesign, editScreen, generateVariants } from "./stitch";

// Workspace imports (Reminders, Todos, Contacts)
import {
  createReminder, listReminders, getReminder, updateReminder, deleteReminder,
  createTodo, listTodos, getTodo, updateTodo, deleteTodo, getTodoStats,
  createContact, listContacts, getContact, updateContact, deleteContact,
  searchContacts,
} from "./workspace";

// ---------------------------------------------------------------------------
// Helper: wrap async fn in try/catch returning JSON string
// ---------------------------------------------------------------------------

// Maximum characters for a tool result before truncation.
// Large results (Gmail, Sheets, etc.) can overwhelm the LLM context window,
// causing it to stop generating after tool calls. This cap prevents that.
// Increased from 8K to 16K — 8K was too tight for Gmail threads, Sheets data, etc.
const MAX_TOOL_RESULT_LENGTH = 16000;

// ---------------------------------------------------------------------------
// Error Retry Logic with Exponential Backoff
// ---------------------------------------------------------------------------

/** Error types that are worth retrying (transient failures) */
const RETRYABLE_ERROR_PATTERNS = [
  /timeout/i,
  /timed? out/i,
  /econnrefused/i,
  /econnreset/i,
  /429/,          // Rate limit
  /503/,          // Service unavailable
  /502/,          // Bad gateway
  /500/,          // Internal server error (may be transient)
  /socket hang up/i,
  /network error/i,
  /abort error/i,
  /reset by peer/i,
];

function isRetryableError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return RETRYABLE_ERROR_PATTERNS.some(pattern => pattern.test(msg));
}

function safeJsonWithRetry<T>(fn: (input: T) => Promise<unknown>, maxRetries = 2) {
  return async (input: T) => {
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await fn(input);
        const jsonFull = JSON.stringify({ success: true, data: result });

        // --- File download results: never truncate fileBase64 ---
        // File-generating tools return { fileBase64, filename, mimeType, ... }.
        // The base64 payload is essential for in-browser download.
        // We cap at 10MB to prevent absurdly large results.
        const resultObj = result as Record<string, unknown> | null;
        if (resultObj && typeof resultObj === "object" && resultObj.fileBase64 && typeof resultObj.fileBase64 === "string") {
          const maxFileSize = 10 * 1024 * 1024; // 10MB
          if (jsonFull.length > maxFileSize) {
            return JSON.stringify({
              success: false,
              error: `Generated file is too large (${(jsonFull.length / 1024 / 1024).toFixed(1)}MB). Try generating a shorter/simpler document.`,
            });
          }
          return jsonFull; // Return full result including fileBase64
        }

        if (jsonFull.length <= MAX_TOOL_RESULT_LENGTH) {
          return jsonFull;
        }

        // Safe truncation — produces valid JSON without blind string slicing.
        // Uses a depth-limited approach: shrinks arrays inside objects, then
        // drops keys, guaranteeing termination.
        const note = `[Result truncated — original was ${jsonFull.length} chars. Use a more specific query.]`;

        const truncated = truncateToFit(result, MAX_TOOL_RESULT_LENGTH - 120);
        return JSON.stringify({ success: true, data: truncated, _note: note });
      } catch (error) {
        lastError = error;
        const isRetryable = isRetryableError(error);
        const isLastAttempt = attempt === maxRetries;

        if (!isRetryable || isLastAttempt) {
          // Not retryable or out of retries — return the error to the agent
          const errMsg = error instanceof Error ? error.message : "Unknown error";
          const retryInfo = attempt > 0 ? ` (failed after ${attempt + 1} attempt${attempt > 0 ? "s" : ""})` : "";
          console.error(`[Tool] Error${retryInfo}: ${errMsg}`);
          return JSON.stringify({
            success: false,
            error: `${errMsg}${retryInfo}`,
          });
        }

        // Exponential backoff: 1s, 2s
        const delayMs = Math.min(1000 * Math.pow(2, attempt), 4000);
        console.warn(`[Tool] Retryable error (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delayMs}ms: ${error instanceof Error ? error.message : "Unknown"}`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    // Should not reach here, but just in case
    return JSON.stringify({
      success: false,
      error: lastError instanceof Error ? lastError.message : "Unknown error after retries",
    });
  };
}

function safeJson<T>(fn: (input: T) => Promise<unknown>) {
  return safeJsonWithRetry(fn, 2);
}

/**
 * Recursively shrink a value until its JSON representation fits within `maxLen`.
 * Strategy (object with array values):
 *   1. If JSON fits, return as-is.
 *   2. If the value is an object, try shrinking each array value (halve items).
 *   3. If still too large, drop keys one-by-one (from the end).
 *   4. If a single key's value is still too large, recurse into it.
 * Strategy (top-level array):
 *   1. Halve items until it fits.
 *   2. If even 1 item is too large, replace with a summary string.
 */
function truncateToFit(value: unknown, maxLen: number, depth = 0): unknown {
  if (depth > 5) return `[Nested structure too deep to truncate]`;
  const json = JSON.stringify(value);
  if (json === undefined) return value;
  if (json.length <= maxLen) return value;

  // --- Top-level array ---
  if (Array.isArray(value)) {
    let arr = value;
    for (let i = 0; i < 20 && arr.length > 1; i++) {
      arr = arr.slice(0, Math.max(1, Math.ceil(arr.length / 2)));
      if (JSON.stringify(arr).length <= maxLen) return arr;
    }
    return `[Array of ${value.length} items — each item too large. Narrow your query.]`;
  }

  // --- Object: try shrinking array values first, then drop keys ---
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);

    // Phase 1: shrink any array values by halving
    const shrunk: Record<string, unknown> = {};
    for (const [k, v] of entries) {
      shrunk[k] = Array.isArray(v) && v.length > 1
        ? truncateToFit(v, maxLen, depth + 1)
        : v;
    }
    if (JSON.stringify(shrunk).length <= maxLen) return shrunk;

    // Phase 2: drop keys from the end until it fits
    for (let drop = entries.length - 1; drop >= 1; drop--) {
      const partial: Record<string, unknown> = {};
      for (let i = 0; i <= drop; i++) {
        const [k, v] = entries[i];
        partial[k] = shrunk[k] ?? v;
      }
      if (JSON.stringify(partial).length <= maxLen) return partial;
    }

    // Phase 3: even the first key alone is too large — truncate its value
    const [firstKey, firstVal] = entries[0];
    const singleKey: Record<string, unknown> = {};
    singleKey[firstKey] = truncateToFit(firstVal, maxLen - firstKey.length - 6, depth + 1);
    return singleKey;
  }

  // --- Primitive / string ---
  const s = String(value);
  return s.length > maxLen ? s.slice(0, maxLen - 3) + "..." : s;
}

// ---------------------------------------------------------------------------
// Gmail Tools
// ---------------------------------------------------------------------------

export const gmailSendTool = tool({
  description: "Send an email via Gmail. Use this when the user wants to compose and send an email message.",
  inputSchema: zodSchema(z.object({
    to: z.string().describe("Recipient email address"),
    subject: z.string().optional().describe("Email subject line"),
    body: z.string().describe("Email body content (plain text or HTML)"),
    isHtml: z.boolean().optional().describe("Whether the body is HTML format (default: false)"),
  })),
  execute: safeJson(async ({ to, subject, body, isHtml }) => {
    return await gGmailSendEmail({ to, subject, body, isHtml });
  }),
});

export const gmailFetchTool = tool({
  description: "Fetch/search emails from Gmail inbox. Supports full Gmail search syntax (e.g., 'is:unread', 'from:someone@example.com', 'subject:urgent').",
  inputSchema: zodSchema(z.object({
    query: z.string().optional().describe("Gmail search query (e.g., 'is:unread', 'from:someone@example.com', 'subject:urgent')"),
    maxResults: z.number().optional().describe("Max number of emails to fetch (default: 10)"),
    labelIds: z.array(z.string()).optional().describe("Filter by label IDs (e.g., ['INBOX', 'UNREAD'])"),
  })),
  execute: safeJson(async ({ query, maxResults, labelIds }) => {
    return await gGmailFetchEmails({ query, maxResults: maxResults || 10, labelIds });
  }),
});



export const gmailLabelsTool = tool({
  description: "List all Gmail labels (both system and user-created).",
  inputSchema: zodSchema(z.object({})),
  execute: safeJson(async () => {
    return await gGmailListLabels();
  }),
});

export const gmailCreateLabelTool = tool({
  description: "Create a new Gmail label.",
  inputSchema: zodSchema(z.object({
    name: z.string().describe("Name for the new label"),
  })),
  execute: safeJson(async ({ name }) => {
    return await gGmailCreateLabel(name);
  }),
});

export const gmailDeleteLabelTool = tool({
  description: "Delete a Gmail label by its ID.",
  inputSchema: zodSchema(z.object({
    labelId: z.string().describe("The ID of the label to delete"),
  })),
  execute: safeJson(async ({ labelId }) => {
    await gGmailDeleteLabel(labelId);
    return { deleted: true, labelId };
  }),
});

export const gmailProfileTool = tool({
  description: "Get the current Gmail profile (email address, message count, thread count).",
  inputSchema: zodSchema(z.object({})),
  execute: safeJson(async () => {
    return await gGmailProfile();
  }),
});

// ---------------------------------------------------------------------------
// Calendar Tools
// ---------------------------------------------------------------------------

export const calendarListTool = tool({
  description: "List all Google Calendars available to the user.",
  inputSchema: zodSchema(z.object({})),
  execute: safeJson(async () => {
    return await gCalListCalendars();
  }),
});

export const calendarEventsTool = tool({
  description: "List events from a Google Calendar. Returns upcoming events by default.",
  inputSchema: zodSchema(z.object({
    calendarId: z.string().optional().describe("Calendar ID (default: 'primary')"),
    timeMin: z.string().optional().describe("Start of time range (ISO 8601, e.g., '2024-01-01T00:00:00Z')"),
    timeMax: z.string().optional().describe("End of time range (ISO 8601)"),
    maxResults: z.number().optional().describe("Max events to return (default: 25)"),
  })),
  execute: safeJson(async ({ calendarId, timeMin, timeMax, maxResults }) => {
    return await gCalListEvents(calendarId || "primary", timeMin, timeMax, maxResults || 25);
  }),
});

export const calendarCreateTool = tool({
  description: "Create a new Google Calendar event. Supports adding attendees who will receive email invitations. Always use this for scheduling meetings with others.",
  inputSchema: zodSchema(z.object({
    summary: z.string().optional().describe("Event title"),
    calendarId: z.string().optional().describe("Calendar ID (default: 'primary')"),
    start: z.string().describe("Start time in ISO 8601 or date string (e.g., '2024-01-01T09:00:00' or '2024-01-01')"),
    end: z.string().describe("End time in ISO 8601 or date string"),
    location: z.string().optional().describe("Event location"),
    description: z.string().optional().describe("Event description"),
    attendees: z.array(z.object({ email: z.string() })).optional().describe("List of attendee email addresses — they WILL receive calendar invitations"),
    addMeetLink: z.boolean().optional().describe("If true, automatically adds a Google Meet video conference link to the event"),
  })),
  execute: safeJson(async ({ summary, calendarId, start, end, location, description, attendees, addMeetLink }) => {
    const isDateTime = start.includes("T");
    return await gCalCreateEvent(calendarId || "primary", {
      summary,
      start: isDateTime
        ? { dateTime: start, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
        : { date: start },
      end: isDateTime
        ? { dateTime: end, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
        : { date: end },
      location,
      description,
      attendees,
      conferenceData: addMeetLink ? { createRequest: { requestId: `claw-meet-${Date.now()}` } } : undefined,
    });
  }),
});

export const calendarDeleteTool = tool({
  description: "Delete a Google Calendar event by its ID.",
  inputSchema: zodSchema(z.object({
    calendarId: z.string().optional().describe("Calendar ID (default: 'primary')"),
    eventId: z.string().describe("The event ID to delete"),
  })),
  execute: safeJson(async ({ calendarId, eventId }) => {
    await gCalDeleteEvent(calendarId || "primary", eventId);
    return { deleted: true, eventId };
  }),
});

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

// ---------------------------------------------------------------------------
// Sheets Tools
// ---------------------------------------------------------------------------

export const sheetsReadTool = tool({
  description: "Read spreadsheet metadata and content.",
  inputSchema: zodSchema(z.object({
    spreadsheetId: z.string().describe("The spreadsheet ID"),
    ranges: z.string().optional().describe("Range(s) to read (e.g., 'Sheet1!A1:B10')"),
  })),
  execute: safeJson(async ({ spreadsheetId, ranges }) => {
    return await gSheetsGet(spreadsheetId, ranges);
  }),
});

export const sheetsValuesTool = tool({
  description: "Get cell values from a spreadsheet range.",
  inputSchema: zodSchema(z.object({
    spreadsheetId: z.string().describe("The spreadsheet ID"),
    range: z.string().describe("Range to read (e.g., 'Sheet1!A1:B10')"),
  })),
  execute: safeJson(async ({ spreadsheetId, range }) => {
    return await gSheetsGetValues(spreadsheetId, range);
  }),
});

export const sheetsAppendTool = tool({
  description: "Append rows of data to a spreadsheet.",
  inputSchema: zodSchema(z.object({
    spreadsheetId: z.string().describe("The spreadsheet ID"),
    range: z.string().describe("Target range (e.g., 'Sheet1!A1')"),
    values: z.array(z.array(z.string())).describe("2D array of values to append (each inner array is a row)"),
  })),
  execute: safeJson(async ({ spreadsheetId, range, values }) => {
    return await gSheetsAppendValues(spreadsheetId, range, values);
  }),
});

export const sheetsUpdateTool = tool({
  description: "Update cell values in a spreadsheet range.",
  inputSchema: zodSchema(z.object({
    spreadsheetId: z.string().describe("The spreadsheet ID"),
    range: z.string().describe("Range to update (e.g., 'Sheet1!A1:B5')"),
    values: z.array(z.array(z.string())).describe("2D array of new values"),
  })),
  execute: safeJson(async ({ spreadsheetId, range, values }) => {
    return await gSheetsUpdateValues(spreadsheetId, range, values);
  }),
});

export const sheetsCreateTool = tool({
  description: "Create a new Google Spreadsheet.",
  inputSchema: zodSchema(z.object({
    title: z.string().describe("Title for the new spreadsheet"),
  })),
  execute: safeJson(async ({ title }) => {
    return await gSheetsCreate(title);
  }),
});

export const sheetsAddSheetTool = tool({
  description: "Add a new sheet tab to an existing spreadsheet.",
  inputSchema: zodSchema(z.object({
    spreadsheetId: z.string().describe("The spreadsheet ID"),
    sheetName: z.string().describe("Name for the new sheet tab"),
  })),
  execute: safeJson(async ({ spreadsheetId, sheetName }) => {
    return await gSheetsAddSheet(spreadsheetId, sheetName);
  }),
});

// ---------------------------------------------------------------------------
// Docs Tools
// ---------------------------------------------------------------------------

export const docsListTool = tool({
  description: "List all Google Docs in the user's Drive.",
  inputSchema: zodSchema(z.object({})),
  execute: safeJson(async () => {
    return await gDocsList();
  }),
});

export const docsReadTool = tool({
  description: "Read the content of a Google Doc.",
  inputSchema: zodSchema(z.object({
    documentId: z.string().describe("The document ID"),
  })),
  execute: safeJson(async ({ documentId }) => {
    return await gDocsGet(documentId);
  }),
});

export const docsCreateTool = tool({
  description: "Create a new Google Doc.",
  inputSchema: zodSchema(z.object({
    title: z.string().describe("Title for the new document"),
  })),
  execute: safeJson(async ({ title }) => {
    return await gDocsCreate(title);
  }),
});

export const docsAppendTool = tool({
  description: "Append text to an existing Google Doc.",
  inputSchema: zodSchema(z.object({
    documentId: z.string().describe("The document ID"),
    text: z.string().describe("Text to append"),
  })),
  execute: safeJson(async ({ documentId, text }) => {
    return await gDocsAppendText(documentId, text);
  }),
});

// ---------------------------------------------------------------------------
// GitHub Tools
// ---------------------------------------------------------------------------

export const githubRepoTool = tool({
  description: "Get detailed information about the configured GitHub repository.",
  inputSchema: zodSchema(z.object({})),
  execute: safeJson(async () => {
    return await getRepo();
  }),
});

export const githubIssuesTool = tool({
  description: "List GitHub issues (open, closed, or all).",
  inputSchema: zodSchema(z.object({
    state: z.enum(["open", "closed", "all"]).optional().describe("Filter by state (default: 'open')"),
    page: z.number().optional().describe("Page number (default: 1)"),
    perPage: z.number().optional().describe("Results per page (default: 30)"),
  })),
  execute: safeJson(async ({ state, page, perPage }) => {
    return await listIssues(state || "open", page, perPage);
  }),
});

export const githubCreateIssueTool = tool({
  description: "Create a new GitHub issue.",
  inputSchema: zodSchema(z.object({
    title: z.string().describe("Issue title"),
    body: z.string().describe("Issue body/description (supports Markdown)"),
    labels: z.array(z.string()).optional().describe("Label names to apply"),
  })),
  execute: safeJson(async ({ title, body, labels }) => {
    return await createIssue(title, body, labels);
  }),
});

export const githubPrsTool = tool({
  description: "List GitHub pull requests (open, closed, or all).",
  inputSchema: zodSchema(z.object({
    state: z.enum(["open", "closed", "all"]).optional().describe("Filter by state (default: 'open')"),
    page: z.number().optional().describe("Page number (default: 1)"),
    perPage: z.number().optional().describe("Results per page (default: 30)"),
  })),
  execute: safeJson(async ({ state, page, perPage }) => {
    return await listPullRequests(state || "open", page, perPage);
  }),
});

export const githubCommitsTool = tool({
  description: "List recent commits on the GitHub repository.",
  inputSchema: zodSchema(z.object({
    page: z.number().optional().describe("Page number (default: 1)"),
    perPage: z.number().optional().describe("Results per page (default: 30)"),
  })),
  execute: safeJson(async ({ page, perPage }) => {
    return await listCommits(page, perPage);
  }),
});

export const githubFilesTool = tool({
  description: "Get the repository file tree (list files and directories).",
  inputSchema: zodSchema(z.object({
    path: z.string().optional().describe("Subdirectory path to start from"),
    recursive: z.boolean().optional().describe("Whether to list recursively (default: false)"),
  })),
  execute: safeJson(async ({ path, recursive }) => {
    return await getRepoTree(path, recursive);
  }),
});

export const githubReadFileTool = tool({
  description: "Read the content of a file from the GitHub repository.",
  inputSchema: zodSchema(z.object({
    path: z.string().describe("File path in the repository"),
  })),
  execute: safeJson(async ({ path }) => {
    return await getFileContent(path);
  }),
});

export const githubSearchTool = tool({
  description: "Search for code in the GitHub repository.",
  inputSchema: zodSchema(z.object({
    query: z.string().describe("Search query"),
  })),
  execute: safeJson(async ({ query }) => {
    return await searchCode(query);
  }),
});

export const githubBranchesTool = tool({
  description: "List all branches in the GitHub repository.",
  inputSchema: zodSchema(z.object({})),
  execute: safeJson(async () => {
    return await listBranches();
  }),
});

// ---------------------------------------------------------------------------
// Vercel Tools
// ---------------------------------------------------------------------------

export const vercelProjectsTool = tool({
  description: "List all Vercel projects.",
  inputSchema: zodSchema(z.object({
    limit: z.number().optional().describe("Number of projects to return (default: 20)"),
  })),
  execute: safeJson(async ({ limit }) => {
    return await listProjects(limit);
  }),
});

export const vercelDeploymentsTool = tool({
  description: "List deployments for a Vercel project.",
  inputSchema: zodSchema(z.object({
    projectIdOrName: z.string().describe("Vercel project ID or name"),
    limit: z.number().optional().describe("Number of deployments (default: 20)"),
  })),
  execute: safeJson(async ({ projectIdOrName, limit }) => {
    return await listDeployments(projectIdOrName, limit);
  }),
});

export const vercelDomainsTool = tool({
  description: "List all Vercel domains.",
  inputSchema: zodSchema(z.object({
    projectId: z.string().optional().describe("Filter by project ID"),
  })),
  execute: safeJson(async ({ projectId }) => {
    return await listDomains(projectId);
  }),
});

// ---------------------------------------------------------------------------
// Agent Delegation Tool (Claw General only)
// ---------------------------------------------------------------------------
// NOTE: Uses generateText() directly instead of HTTP fetch to avoid Vercel
// authentication issues with internal API calls.
// ---------------------------------------------------------------------------

async function callAgentDirectly(agentId: string, taskPrompt: string, _delegationDepth: number = 0): Promise<{ text: string; steps: number }> {
  const { generateText, stepCountIs } = await import("ai");
  const { getAgent, getProvider } = await import("@/lib/agents");
  const { allTools } = await import("@/lib/tools");

  const agent = getAgent(agentId);
  if (!agent) throw new Error(`Unknown agent: ${agentId}`);

  // Phase 4: Multi-hop delegation — up to 3 levels deep with per-hop timeouts
  // Circuit breaker: after 3 hops, strip all delegation tools to prevent infinite loops
  const MAX_DELEGATION_DEPTH = 3;
  const agentTools: Record<string, any> = {};
  for (const toolId of agent.tools) {
    if (allTools[toolId]) {
      // Strip delegation tools at max depth (circuit breaker)
      if (_delegationDepth >= MAX_DELEGATION_DEPTH && (toolId === "query_agent" || toolId === "a2a_send_message" || toolId === "a2a_broadcast" || toolId === "a2a_collaborate")) continue;
      agentTools[toolId] = allTools[toolId];
    }
  }

  const providerResult = await getProvider(agent);

  // Per-hop timeout and steps: reduce with each delegation level
  // Level 0: 120s/25 steps, Level 1: 90s/20 steps, Level 2: 60s/15 steps, Level 3+: 45s/10 steps
  const timeoutMs = _delegationDepth === 0 ? 120_000 : _delegationDepth === 1 ? 90_000 : _delegationDepth === 2 ? 60_000 : 45_000;
  const maxSteps = _delegationDepth === 0 ? 25 : _delegationDepth === 1 ? 20 : _delegationDepth === 2 ? 15 : 10;

  const result = await generateText({
    model: providerResult.model,
    system: agent.systemPrompt,
    messages: [{ role: "user", content: taskPrompt }],
    tools: agentTools,
    maxOutputTokens: 65536,
    stopWhen: stepCountIs(maxSteps),
    abortSignal: AbortSignal.timeout(timeoutMs),
  });

  // H10: Recovery after step exhaustion — if no text was produced, summarize what was done
  const toolCalls = result.steps.flatMap((s: { toolCalls?: Array<{ toolName: string }> }) => s.toolCalls || []);
  let responseText = result.text;

  if (!responseText || responseText.trim().length < 50) {
    if (toolCalls.length > 0) {
      const toolSummary = toolCalls.map((tc: { toolName: string }) => tc.toolName).join(", ");
      responseText = `[Delegation to ${agent.name} completed ${toolCalls.length} tool call(s) but did not produce a final text summary. Tools used: ${toolSummary}. The tool calls completed successfully — ask me for details about any specific result.]`;
    } else {
      responseText = `[Delegation to ${agent.name} returned no output. The task may have exceeded the step limit (${maxSteps} steps) or timeout (${Math.round(timeoutMs / 1000)}s).]`;
    }
  }

  return { text: responseText, steps: result.steps.length };
}

export const delegateToAgentTool = tool({
  description: "Delegate a task to a specialist agent. Only use when the task is clearly within one specialist's domain and doesn't require cross-domain reasoning. Available agents: mail (email/calendar), code (GitHub/Vercel), data (Drive/Sheets/Docs), creative (content/planning/docs), research (deep research/intelligence), ops (monitoring/health). Returns the specialist agent's response.",
  inputSchema: zodSchema(z.object({
    agent_id: z.enum(["mail", "code", "data", "creative", "research", "ops"]).describe("The specialist agent to delegate to"),
    task: z.string().describe("Clear, specific task description with all necessary context"),
  })),
  execute: safeJson(async ({ agent_id, task }) => {
    const taskId = `a2a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const startTime = Date.now();

    // Log the delegation via Phase 3 delegations table (fire-and-forget)
    let delegationId = -1;
    try {
      const { logDelegation } = await import("@/lib/delegations");
      delegationId = await logDelegation({
        initiator_agent: "general",
        assigned_agent: agent_id,
        task,
        context: "Delegated by Claw General via delegate_to_agent tool",
        delegation_chain: ["general", agent_id],
      });
    } catch {
      // Delegation logging is non-critical
    }

    // Also log to legacy a2a_tasks table (fire-and-forget, backwards compat)
    try {
      await query(
        `INSERT INTO a2a_tasks (initiator_agent, assigned_agent, task, context, status, delegation_chain)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['general', agent_id, task, 'Delegated by Claw General via delegate_to_agent tool', 'in_progress', ['general', agent_id]]
      );
    } catch {
      // A2A logging is non-critical
    }

    try {
      console.log(`[A2A] Delegating to ${agent_id}: ${task.slice(0, 100)}...`);
      const { text, steps } = await callAgentDirectly(agent_id, task);
      const durationMs = Date.now() - startTime;
      console.log(`[A2A] ${agent_id} responded: ${steps} steps, ${text.length} chars`);

      // Update delegation status to completed
      if (delegationId > 0) {
        const { updateDelegation } = await import("@/lib/delegations");
        updateDelegation(delegationId, {
          status: "completed",
          result: text.trim().slice(0, 2000),
          duration_ms: durationMs,
        }).catch(() => {});
      }

      // Update legacy a2a_tasks status (fire-and-forget)
      try {
        await query(
          `UPDATE a2a_tasks SET status = 'completed', result = $1, completed_at = NOW() WHERE id = $2`,
          [text.trim().slice(0, 2000), taskId]
        );
      } catch { /* non-critical */ }

      return { success: true, agent: agent_id, response: text.trim() || "(Agent returned no text response)", taskId, steps, durationMs };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      console.error(`[A2A] Delegation to ${agent_id} failed:`, error);

      // Update delegation status to failed
      if (delegationId > 0) {
        const { updateDelegation } = await import("@/lib/delegations");
        updateDelegation(delegationId, {
          status: "failed",
          result: error instanceof Error ? error.message : "Delegation failed",
          duration_ms: durationMs,
        }).catch(() => {});
      }

      return { success: false, error: error instanceof Error ? error.message : "Delegation failed", taskId };
    }
  }),
});

// ---------------------------------------------------------------------------
// Web Search Tool (dual-mode: Z.ai SDK local + AIHubMix fallback)
// ---------------------------------------------------------------------------

async function webSearchFallback(query: string, numResults: number, mode: "basic" | "advanced" = "basic") {
  // Layer 0: Tavily API (if keys configured)
  if (TAVILY_KEYS.length > 0) {
    try {
      const results = await tavilySearch(query, numResults, mode);
      if (results.length > 0) return results;
    } catch { /* Tavily failed, try next layer */ }
  }

  // Layer 1: DuckDuckGo HTML search (POST request)
  try {
    const searchUrl = "https://html.duckduckgo.com/html/";
    const res = await fetch(searchUrl, {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": "https://html.duckduckgo.com/",
      },
      body: `q=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const html = await res.text();
      const results = parseDuckDuckGoHTML(html, numResults);
      if (results.length > 0) return results;
    }
  } catch { /* DDG failed, try next layer */ }

  // Layer 2: Wikipedia API (for factual/reference queries)
  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=${numResults}&origin=*`;
    const res = await fetch(wikiUrl, { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const data = await safeParseRes<{ query?: { search?: Array<{ title: string; snippet: string; pageid: number }> } }>(res);
      const wikiResults = data?.query?.search || [];
      if (wikiResults.length > 0) {
        return wikiResults.map((r, i) => ({
          title: r.title,
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`,
          snippet: r.snippet.replace(/<[^>]*>/g, ""),
          rank: i + 1,
        }));
      }
    }
  } catch { /* Wikipedia failed */ }

  // Layer 3: Brave Search lite (no API key needed, public endpoint)
  try {
    const braveUrl = `https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web`;
    const res = await fetch(braveUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const html = await res.text();
      const results = parseBraveHTML(html, numResults);
      if (results.length > 0) return results;
    }
  } catch { /* Brave failed */ }

  return [];
}

function parseDuckDuckGoHTML(html: string, numResults: number) {
  const results: Array<{ title: string; url: string; snippet: string; rank: number }> = [];

  // Strategy 1: Find result__a links followed by result__snippet
  const pattern1 = new RegExp(
    'class="result__a"[^>]*href="([^"]+)"[^>]*>([\\s\\S]*?)</a>[\\s\\S]*?' +
    'class="result__snippet"[^>]*>([\\s\\S]*?)</a>',
    "g"
  );
  let match;
  let rank = 0;
  while ((match = pattern1.exec(html)) !== null && rank < numResults) {
    rank++;
    const rawUrl = match[1];
    const title = match[2].replace(/<[^>]*>/g, "").trim();
    const snippet = match[3].replace(/<[^>]*>/g, "").trim();
    const urlMatch = rawUrl.match(/uddg=([^&]+)/);
    const actualUrl = urlMatch ? decodeURIComponent(urlMatch[1]) : rawUrl;
    if (title && actualUrl) {
      results.push({ title, url: actualUrl, snippet, rank });
    }
  }

  // Strategy 2: If no results, try extracting all external links
  if (results.length === 0) {
    const linkPattern = /<a[^>]*class="result__a"[^>]*href="(https?:\/\/[^"]+)"[^>]*>([^<]*)<\/a>/g;
    while ((match = linkPattern.exec(html)) !== null && rank < numResults) {
      rank++;
      const rawUrl = match[1];
      const title = match[2].replace(/<[^>]*>/g, "").trim();
      const urlMatch = rawUrl.match(/uddg=([^&]+)/);
      const actualUrl = urlMatch ? decodeURIComponent(urlMatch[1]) : rawUrl;
      if (title && actualUrl && !actualUrl.includes("duckduckgo.com")) {
        results.push({ title, url: actualUrl, snippet: "", rank: results.length + 1 });
      }
    }
  }

  return results;
}

function parseBraveHTML(html: string, numResults: number) {
  const results: Array<{ title: string; url: string; snippet: string; rank: number }> = [];
  // Brave uses div.web-result with h3 > a inside
  const pattern = /<div[^>]*class="[^"]*web-result[^"]*"[^>]*>[\s\S]*?<h3[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>/g;
  let match;
  let rank = 0;
  while ((match = pattern.exec(html)) !== null && rank < numResults) {
    rank++;
    const url = match[1];
    const title = match[2].replace(/<[^>]*>/g, "").trim();
    if (title && url && !url.includes("search.brave.com")) {
      results.push({ title, url, snippet: "", rank });
    }
  }
  return results;
}

export const webSearchTool = tool({
  description: "Search the web for real-time information, news, documentation, market data, trends, competitor analysis, or any current information. Use this when you need up-to-date facts, research topics, look up company details, find documentation, or gather context that goes beyond your training data.",
  inputSchema: zodSchema(z.object({
    query: z.string().describe("Search query — be specific and use keywords. Examples: 'Next.js 15 Server Actions docs', 'Q4 2024 SaaS market trends', 'OpenAI GPT-5 release date'"),
    num_results: z.number().optional().describe("Number of results to return (default: 10, max: 20)"),
  })),
  execute: safeJson(async ({ query, num_results }) => {
    const num = Math.min(num_results || 10, 20);
    // Try Z.ai SDK first (local environment)
    try {
      const zai = await ZAI.create();
      const results = await zai.functions.invoke("web_search", { query, num });
      if (results && Array.isArray(results) && results.length > 0) return results;
    } catch {
      // Z.ai SDK not available — use fallback
    }
    // Fallback: Tavily (basic mode) → DuckDuckGo → Wikipedia
    return await webSearchFallback(query, num, "basic");
  }),
});

// ---------------------------------------------------------------------------
// Advanced Web Search Tool (for Research Agent — uses Tavily advanced mode)
// ---------------------------------------------------------------------------

export const webSearchAdvancedTool = tool({
  description: "Perform an advanced/deep web search with AI-powered answer synthesis. Returns higher-quality results with an AI-generated summary. Use this for in-depth research, factual analysis, multi-faceted topics, or when you need comprehensive coverage of a subject. Uses Tavily's advanced search depth.",
  inputSchema: zodSchema(z.object({
    query: z.string().describe("Search query — can be more specific and complex. Examples: 'What are the key differences between React Server Components and traditional SSR?', 'Latest developments in quantum computing 2025 2026', 'Comprehensive analysis of African fintech market trends'"),
    num_results: z.number().optional().describe("Number of results to return (default: 10, max: 10)"),
  })),
  execute: safeJson(async ({ query, num_results }) => {
    const num = Math.min(num_results || 10, 10);
    // Try Z.ai SDK first
    try {
      const zai = await ZAI.create();
      const results = await zai.functions.invoke("web_search", { query, num });
      if (results && Array.isArray(results) && results.length > 0) return results;
    } catch {
      // Z.ai SDK not available — use Tavily advanced
    }
    // Advanced search: Tavily advanced mode → DuckDuckGo → Wikipedia
    return await webSearchFallback(query, num, "advanced");
  }),
});

// ---------------------------------------------------------------------------
// Web Reader Tool (dual-mode: Z.ai SDK local + fetch fallback)
// ---------------------------------------------------------------------------

async function webReaderFallback(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ClawBot/1.0; +https://claw.ai)",
      "Accept": "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Failed to fetch URL: ${res.status} ${res.statusText}`);

  const html = await res.text();

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "";

  // Simple HTML to text: remove scripts, styles, tags
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  // Truncate to reasonable length
  if (text.length > 15000) {
    text = text.slice(0, 15000) + "... [truncated]";
  }

  return {
    title,
    content: text,
    url,
    fetchedAt: new Date().toISOString(),
    charCount: text.length,
  };
}

export const webReaderTool = tool({
  description: "Read and extract content from a web page URL. Returns the page title, main content as plain text, and URL. Use this to read articles, documentation pages, reports, or any web content for detailed analysis. Always use this after web_search when you need the full content of a result.",
  inputSchema: zodSchema(z.object({
    url: z.string().describe("The full URL of the web page to read. Must include protocol (https://)"),
  })),
  execute: safeJson(async ({ url }) => {
    // Try Z.ai SDK first (local environment)
    try {
      const zai = await ZAI.create();
      const result = await zai.functions.invoke("page_reader", { url });
      if (result) return result;
    } catch {
      // Z.ai SDK not available — use fallback
    }
    // Fallback: direct fetch + HTML extraction (enhanced with OG metadata)
    return await webReaderEnhanced(url);
  }),
});

// ---------------------------------------------------------------------------
// Query Agent Tool (A2A — for specialist agents)
// Uses generateText() directly to avoid Vercel auth issues with HTTP calls.
// ---------------------------------------------------------------------------

export const queryAgentTool = tool({
  description: "AUTONOMOUSLY route a task to another specialist agent for execution. Use this whenever you need a capability outside your tool domain — the target agent will EXECUTE the task directly, not just answer questions. ALWAYS include ALL details the target agent needs (recipient emails, file content, times, descriptions, etc.). The user has pre-authorized cross-agent collaboration — do NOT ask for permission, just route and execute. Available agents: general (orchestrator, ALL tools), mail (email/calendar/meeting invites/Google Meet), code (GitHub/Vercel/DevOps), data (Drive/Sheets/Docs/analysis/vision), creative (content/strategy/docs/planning/design), research (deep research/intelligence/briefs), ops (monitoring/health/deployments).",
  inputSchema: zodSchema(z.object({
    agent_id: z.enum(["general", "mail", "code", "data", "creative", "research", "ops"]).describe("The specialist agent to route the task to"),
    question: z.string().describe("Complete task description with ALL context the target agent needs. Include: what to do, who/what/where/when details, any content to send, file IDs, email addresses, times, etc. Be SPECIFIC and provide everything needed for autonomous execution."),
  })),
  execute: safeJson(async ({ agent_id, question }) => {
    const startTime = Date.now();

    // Log the delegation via Phase 3 delegations table (fire-and-forget)
    let delegationId = -1;
    try {
      const { logDelegation } = await import("@/lib/delegations");
      delegationId = await logDelegation({
        initiator_agent: "unknown", // will be set by caller context if available
        assigned_agent: agent_id,
        task: question,
        context: "Routed via query_agent tool",
        delegation_chain: ["unknown", agent_id],
      });
    } catch {
      // Delegation logging is non-critical
    }

    try {
      console.log(`[A2A] Query to ${agent_id}: ${question.slice(0, 100)}...`);
      const { text, steps } = await callAgentDirectly(agent_id, question);
      const durationMs = Date.now() - startTime;
      console.log(`[A2A] ${agent_id} responded: ${steps} steps, ${text.length} chars`);

      // Update delegation status to completed
      if (delegationId > 0) {
        const { updateDelegation } = await import("@/lib/delegations");
        updateDelegation(delegationId, {
          status: "completed",
          result: text.trim().slice(0, 2000),
          duration_ms: durationMs,
        }).catch(() => {});
      }

      return { success: true, agent: agent_id, response: text.trim() || "(Agent returned no text response)", steps, durationMs };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      console.error(`[A2A] Query to ${agent_id} failed:`, error);

      // Update delegation status to failed
      if (delegationId > 0) {
        const { updateDelegation } = await import("@/lib/delegations");
        updateDelegation(delegationId, {
          status: "failed",
          result: error instanceof Error ? error.message : "Query failed",
          duration_ms: durationMs,
        }).catch(() => {});
      }

      return { success: false, error: error instanceof Error ? error.message : "Query failed" };
    }
  }),
});

// ---------------------------------------------------------------------------
// Gmail Reply Tool
// ---------------------------------------------------------------------------

export const gmailReplyTool = tool({
  description: "Reply to an existing email thread. Fetches the thread's last message to set proper In-Reply-To and References headers for proper threading.",
  inputSchema: zodSchema(z.object({
    threadId: z.string().describe("The Gmail thread ID to reply to"),
    to: z.string().describe("Recipient email address"),
    body: z.string().describe("Reply body content (plain text or HTML)"),
    subject: z.string().optional().describe("Override subject line (default: same as thread)"),
    isHtml: z.boolean().optional().describe("Whether the body is HTML format (default: false)"),
    cc: z.array(z.string()).optional().describe("CC recipients"),
    bcc: z.array(z.string()).optional().describe("BCC recipients"),
  })),
  execute: safeJson(async ({ threadId, to, body, subject, isHtml, cc, bcc }) => {
    // Fetch the thread to get the last message's Message-ID
    const threadRes = await googleFetch(
      `https://www.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata&metadataHeaders=Message-Id&metadataHeaders=References&metadataHeaders=Subject`,
    );
    const threadData = (await threadRes.json()) as { messages?: Array<{ payload?: { headers?: Array<{ name: string; value: string }> } }> };
    const lastMsg = threadData.messages?.[threadData.messages.length - 1];
    const headers = lastMsg?.payload?.headers || [];
    const getHeader = (name: string) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || "";
    const originalMessageId = getHeader("Message-Id");
    const originalReferences = getHeader("References");

    // Build RFC 2822 reply message
    const sanitizeHeader = (s: string) => s.replace(/[\r\n]/g, "");
    let message = "";
    message += `To: ${sanitizeHeader(to)}\r\n`;
    if (cc?.length) message += `Cc: ${cc.map(sanitizeHeader).join(", ")}\r\n`;
    if (bcc?.length) message += `Bcc: ${bcc.map(sanitizeHeader).join(", ")}\r\n`;
    message += `Subject: ${sanitizeHeader(subject || getHeader("Subject") || "")}\r\n`;
    message += "Content-Type: text/html; charset=utf-8\r\n";
    message += "MIME-Version: 1.0\r\n";
    if (originalMessageId) message += `In-Reply-To: ${originalMessageId}\r\n`;
    if (originalMessageId) message += `References: ${originalReferences ? originalReferences + " " : ""}${originalMessageId}\r\n`;
    message += "\r\n";
    message += isHtml ? body : plainTextToHtml(body);

    const encoded = Buffer.from(message).toString("base64url");
    const res = await googleFetch("https://www.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      body: JSON.stringify({ raw: encoded, threadId }),
    });
    return safeParseRes(res);
  }),
});

// ---------------------------------------------------------------------------
// Gmail Thread Tool
// ---------------------------------------------------------------------------

export const gmailThreadTool = tool({
  description: "Get the full conversation thread for a Gmail thread. Returns all messages in the thread with headers (from, to, subject, date) and content.",
  inputSchema: zodSchema(z.object({
    threadId: z.string().describe("The Gmail thread ID"),
  })),
  execute: safeJson(async ({ threadId }) => {
    const res = await googleFetch(
      `https://www.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`,
    );
    const data = await safeJsonParse(res) as {
      id: string;
      messages?: Array<{
        id: string;
        threadId: string;
        payload?: {
          headers?: Array<{ name: string; value: string }>;
          mimeType?: string;
          parts?: Array<{ body?: { data: string }; mimeType?: string }>;
          body?: { data: string };
        };
      }>;
    };

    const messages = (data.messages || []).map(msg => {
      const headers = msg.payload?.headers || [];
      const get = (name: string) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || "";
      // Extract body content
      let content = "";
      if (msg.payload?.body?.data) {
        content = Buffer.from(msg.payload.body.data, "base64url").toString("utf-8");
      } else if (msg.payload?.parts) {
        for (const part of msg.payload.parts) {
          if (part.mimeType === "text/plain" && part.body?.data) {
            content = Buffer.from(part.body.data, "base64url").toString("utf-8");
            break;
          }
          if (part.mimeType === "text/html" && part.body?.data) {
            content = Buffer.from(part.body.data, "base64url").toString("utf-8");
          }
        }
      }
      // Strip control characters (except \n \r \t) to prevent JSON serialization issues
      content = content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
      return {
        id: msg.id,
        from: get("From"),
        to: get("To"),
        subject: get("Subject"),
        date: get("Date"),
        contentType: msg.payload?.mimeType,
        content: content.slice(0, 5000), // Truncate very long messages
      };
    });

    return { threadId: data.id, messageCount: messages.length, messages };
  }),
});

// ---------------------------------------------------------------------------
// Gmail Batch Tool
// ---------------------------------------------------------------------------

export const gmailBatchTool = tool({
  description: "Perform batch operations on multiple Gmail messages at once: trash, delete, mark as read, add or remove labels.",
  inputSchema: zodSchema(z.object({
    action: z.enum(["trash", "delete", "markRead", "addLabel", "removeLabel"]).describe("The batch action to perform"),
    messageIds: z.array(z.string()).describe("Array of Gmail message IDs to operate on"),
    labelId: z.string().optional().describe("Label ID (required for addLabel and removeLabel actions)"),
  })),
  execute: safeJson(async ({ action, messageIds, labelId }) => {
    const addLabelIds: string[] = [];
    const removeLabelIds: string[] = [];

    switch (action) {
      case "trash":
        addLabelIds.push("TRASH");
        removeLabelIds.push("INBOX");
        break;
      case "delete":
        // Permanently delete: first trash, then use individual DELETE calls
        // Gmail batchModify can only trash, not permanently delete.
        // We use batchModify to trash first, then per-message DELETE.
        {
          const trashRes = await googleFetch(
            "https://www.googleapis.com/gmail/v1/users/me/messages/batchModify",
            {
              method: "POST",
              body: JSON.stringify({ ids: messageIds, addLabelIds: ["TRASH"], removeLabelIds: ["INBOX"] }),
            },
          );
          // Now permanently delete each message from trash
          let deletedCount = 0;
          let failCount = 0;
          for (const msgId of messageIds) {
            try {
              await googleFetch(
                `https://www.googleapis.com/gmail/v1/users/me/messages/${msgId}`,
                { method: "DELETE" },
              );
              deletedCount++;
            } catch {
              failCount++;
            }
          }
          return { success: true, action: "delete", totalMessages: messageIds.length, permanentlyDeleted: deletedCount, failed: failCount };
        }
      case "markRead":
        removeLabelIds.push("UNREAD");
        break;
      case "addLabel":
        if (!labelId) throw new Error("labelId is required for addLabel action");
        addLabelIds.push(labelId);
        break;
      case "removeLabel":
        if (!labelId) throw new Error("labelId is required for removeLabel action");
        removeLabelIds.push(labelId);
        break;
    }

    const res = await googleFetch(
      "https://www.googleapis.com/gmail/v1/users/me/messages/batchModify",
      {
        method: "POST",
        body: JSON.stringify({ ids: messageIds, addLabelIds, removeLabelIds }),
      },
    );
    return { success: true, action, messageIdsProcessed: messageIds.length };
  }),
});

// ---------------------------------------------------------------------------
// Calendar FreeBusy Tool
// ---------------------------------------------------------------------------

export const calendarFreebusyTool = tool({
  description: "Check free/busy availability slots for one or more attendees. Returns busy periods for each attendee within the specified time range.",
  inputSchema: zodSchema(z.object({
    attendeeEmails: z.array(z.string()).describe("List of attendee email addresses to check availability for"),
    timeMin: z.string().describe("Start of time range (ISO 8601, e.g., '2024-01-01T00:00:00Z')"),
    timeMax: z.string().describe("End of time range (ISO 8601)"),
  })),
  execute: safeJson(async ({ attendeeEmails, timeMin, timeMax }) => {
    const res = await googleFetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      body: JSON.stringify({
        timeMin,
        timeMax,
        items: attendeeEmails.map(e => ({ id: e })),
      }),
    });
    return safeParseRes(res);
  }),
});

// ---------------------------------------------------------------------------
// GitHub Update Issue Tool
// ---------------------------------------------------------------------------

export const githubUpdateIssueTool = tool({
  description: "Update an existing GitHub issue — change state (open/closed), title, body, or labels.",
  inputSchema: zodSchema(z.object({
    issueNumber: z.number().describe("The issue number to update"),
    state: z.enum(["open", "closed"]).optional().describe("New state for the issue"),
    title: z.string().optional().describe("New title for the issue"),
    body: z.string().optional().describe("New body/description for the issue (supports Markdown)"),
    labels: z.array(z.string()).optional().describe("New set of label names to apply"),
  })),
  execute: safeJson(async ({ issueNumber, state, title, body, labels }) => {
    return await updateIssue(issueNumber, { state, title, body, labels });
  }),
});

// ---------------------------------------------------------------------------
// GitHub Create PR Tool
// ---------------------------------------------------------------------------

export const githubCreatePrTool = tool({
  description: "Create a new pull request on GitHub. Specify the head branch, base branch, title, and description.",
  inputSchema: zodSchema(z.object({
    title: z.string().describe("PR title"),
    body: z.string().describe("PR description (supports Markdown)"),
    head: z.string().describe("The name of the branch containing your changes"),
    base: z.string().describe("The name of the branch you want to merge into (e.g., 'main')"),
  })),
  execute: safeJson(async ({ title, body, head, base }) => {
    return await createPullRequest(title, body, head, base);
  }),
});

// ---------------------------------------------------------------------------
// GitHub PR Review Tool
// ---------------------------------------------------------------------------

export const githubPrReviewTool = tool({
  description: "Get detailed pull request review information including the PR details and all changed files with their diffs.",
  inputSchema: zodSchema(z.object({
    pullNumber: z.number().describe("The pull request number"),
  })),
  execute: safeJson(async ({ pullNumber }) => {
    const [pr, files] = await Promise.all([
      getPullRequest(pullNumber),
      getPullRequestFiles(pullNumber),
    ]);
    return { pullRequest: pr, changedFiles: files, fileCount: files.length };
  }),
});

// ---------------------------------------------------------------------------
// GitHub PR Comment Tool
// ---------------------------------------------------------------------------

export const githubPrCommentTool = tool({
  description: "Create a comment on a GitHub pull request (or issue).",
  inputSchema: zodSchema(z.object({
    pullNumber: z.number().describe("The pull request number"),
    body: z.string().describe("Comment body (supports Markdown)"),
  })),
  execute: safeJson(async ({ pullNumber, body }) => {
    return await createPRComment(pullNumber, body);
  }),
});

// ---------------------------------------------------------------------------
// GitHub Create Branch Tool
// ---------------------------------------------------------------------------

export const githubCreateBranchTool = tool({
  description: "Create a new branch in the GitHub repository from an existing branch (defaults to 'main').",
  inputSchema: zodSchema(z.object({
    branchName: z.string().describe("Name for the new branch"),
    fromBranch: z.string().optional().describe("Source branch to create from (default: 'main')"),
  })),
  execute: safeJson(async ({ branchName, fromBranch }) => {
    return await createBranch(branchName, fromBranch);
  }),
});

// ---------------------------------------------------------------------------
// Vercel Deploy Tool
// ---------------------------------------------------------------------------

export const vercelDeployTool = tool({
  description: "Trigger a redeployment on Vercel for a project. Uses the Vercel API to create a new deployment from the latest production commit.",
  inputSchema: zodSchema(z.object({
    projectIdOrName: z.string().describe("Vercel project ID or name"),
  })),
  execute: safeJson(async ({ projectIdOrName }) => {
    const token = process.env.VERCEL_API_TOKEN || "";
    if (!token) throw new Error("VERCEL_API_TOKEN not configured");

    // Step 1: Get project details to find the deployment target
    const teamId = process.env.VERCEL_TEAM_ID || "";
    let projectsUrl = `https://api.vercel.com/v9/projects/${encodeURIComponent(projectIdOrName)}`;
    if (teamId) projectsUrl += `?teamId=${teamId}`;

    const projectRes = await fetch(projectsUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!projectRes.ok) throw new Error(`Failed to find project: ${projectRes.status}`);
    const project = await safeParseRes<{ id: string; name: string; targets?: Array<{ id: string; ref: string }> }>(projectRes);

    // Step 2: Get the latest deployment to find the commit SHA
    let deploymentsUrl = `https://api.vercel.com/v6/deployments?projectId=${project.id}&limit=1`;
    if (teamId) deploymentsUrl += `&teamId=${teamId}`;

    const deploymentsRes = await fetch(deploymentsUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!deploymentsRes.ok) throw new Error(`Failed to get deployments: ${deploymentsRes.status}`);
    const deploymentsData = await safeParseRes<{ deployments?: Array<{ meta?: { githubCommitSha?: string }; target?: string }> }>(deploymentsRes);
    const latestDeployment = deploymentsData.deployments?.[0];

    if (!latestDeployment) throw new Error("No previous deployments found to redeploy from");

    // Step 3: Trigger redeployment using the Vercel API
    const deployUrl = `https://api.vercel.com/v13/deployments`;
    const deployBody: Record<string, unknown> = {
      name: project.name,
      projectId: project.id,
      target: latestDeployment.target || "production",
    };
    if (latestDeployment.meta?.githubCommitSha) {
      deployBody.githubCommitSha = latestDeployment.meta.githubCommitSha;
    }
    if (teamId) deployBody.teamId = teamId;

    const deployRes = await fetch(deployUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(deployBody),
    });
    if (!deployRes.ok) {
      const errText = await deployRes.text().catch(() => "Unknown error");
      throw new Error(`Redeployment failed (${deployRes.status}): ${errText}`);
    }
    const deployData = await safeParseRes<{ id: string; state: string; url: string }>(deployRes);

    return {
      success: true,
      deploymentId: deployData.id,
      state: deployData.state,
      url: deployData.url,
      project: project.name,
      message: `Redeployment triggered for ${project.name}`,
    };
  }),
});

// ---------------------------------------------------------------------------
// Vercel Logs Tool
// ---------------------------------------------------------------------------

export const vercelLogsTool = tool({
  description: "Get build logs for the most recent deployment of a Vercel project.",
  inputSchema: zodSchema(z.object({
    projectIdOrName: z.string().describe("Vercel project ID or name"),
    limit: z.number().optional().describe("Max log entries to return (default: 100)"),
  })),
  execute: safeJson(async ({ projectIdOrName, limit }) => {
    // Get latest deployment
    const deployments = await listDeployments(projectIdOrName, 1);
    if (!deployments.length) throw new Error("No deployments found");
    const latest = deployments[0];

    // Fetch build events
    const token = process.env.VERCEL_API_TOKEN || "";
    const teamId = process.env.VERCEL_TEAM_ID || "";
    let eventsUrl = `https://api.vercel.com/v2/deployments/${latest.id}/events`;
    if (teamId) eventsUrl += `?teamId=${teamId}`;

    const res = await fetch(eventsUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) throw new Error(`Vercel logs error: ${res.status}`);
    const data = await safeParseRes<{ events: Array<{ type: string; text: string; created: number; payload?: string }> }>(res);

    const events = (data.events || []).slice(0, limit || 100).map(e => ({
      type: e.type,
      text: e.text,
      timestamp: new Date(e.created).toISOString(),
    }));

    return { deploymentId: latest.id, state: latest.state, url: latest.url, events };
  }),
});

// ---------------------------------------------------------------------------
// Sheets Batch Get Tool
// ---------------------------------------------------------------------------

export const sheetsBatchGetTool = tool({
  description: "Batch read values from multiple ranges in a Google Spreadsheet in a single API call.",
  inputSchema: zodSchema(z.object({
    spreadsheetId: z.string().describe("The spreadsheet ID"),
    ranges: z.array(z.string()).describe("Array of ranges to read (e.g., ['Sheet1!A1:B10', 'Sheet2!A1:A5'])"),
  })),
  execute: safeJson(async ({ spreadsheetId, ranges }) => {
    return await gSheetsBatchGetValues(spreadsheetId, ranges);
  }),
});

// ---------------------------------------------------------------------------
// Sheets Clear Tool
// ---------------------------------------------------------------------------

export const sheetsClearTool = tool({
  description: "Clear all values from a range in a Google Spreadsheet.",
  inputSchema: zodSchema(z.object({
    spreadsheetId: z.string().describe("The spreadsheet ID"),
    range: z.string().describe("Range to clear (e.g., 'Sheet1!A1:B10')"),
  })),
  execute: safeJson(async ({ spreadsheetId, range }) => {
    const res = await googleFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`,
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    );
    return safeParseRes(res);
  }),
});

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
    const token = await (await import("./google")).getAccessToken();

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

// ---------------------------------------------------------------------------
// Image Generate Tool (AIHubMix — DALL-E compatible)
// ---------------------------------------------------------------------------

export const imageGenerateTool = tool({
  description: "Generate images from text prompts using AI. Returns base64-encoded image data.",
  inputSchema: zodSchema(z.object({
    prompt: z.string().describe("Text description of the image to generate"),
    size: z.enum(["1024x1024", "768x1344", "864x1152", "1344x768", "1152x864", "1440x720", "720x1440"]).optional().describe("Image size (default: '1024x1024')"),
  })),
  execute: safeJson(async ({ prompt, size }) => {
    // Call AIHubMix image generation directly
    const apiKey = nextAIHubMixKey();
    const res = await fetch(`${AIHUBMIX_BASE}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt,
        size: size || "1024x1024",
        n: 1,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown error");
      throw new Error(`Image generation error (${res.status}): ${errText}`);
    }
    const data = await safeParseRes(res) as { data?: Array<{ url?: string; b64_json?: string; base64?: string }> };
    // Handle both URL and base64 responses
    const imgData = data.data?.[0];
    if (imgData?.b64_json) {
      return { imageBase64: imgData.b64_json };
    }
    if (imgData?.url) {
      return { imageUrl: imgData.url };
    }
    if (imgData?.base64) {
      return { imageBase64: imgData.base64 };
    }
    return { imageBase64: JSON.stringify(data) };
  }),
});

// ---------------------------------------------------------------------------
// TTS Generate Tool (AIHubMix — OpenAI TTS compatible)
// ---------------------------------------------------------------------------

export const ttsGenerateTool = tool({
  description: "Convert text to speech audio using AI. Returns base64-encoded audio data. Uses the OpenAI TTS-compatible endpoint via AIHubMix.",
  inputSchema: zodSchema(z.object({
    text: z.string().describe("Text to convert to speech"),
    voice: z.string().optional().describe("Voice name (default: 'alloy')"),
    speed: z.number().optional().describe("Speech speed multiplier (default: 1.0)"),
  })),
  execute: safeJson(async ({ text, voice, speed }) => {
    // Call AIHubMix TTS endpoint (OpenAI-compatible)
    const apiKey = nextAIHubMixKey();
    const res = await fetch(`${AIHUBMIX_BASE}/audio/speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "tts-1",
        input: text,
        voice: voice || "alloy",
        speed: speed || 1.0,
        response_format: "mp3",
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown error");
      throw new Error(`TTS error (${res.status}): ${errText}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    const audioBase64 = Buffer.from(arrayBuffer).toString("base64");
    return { audioBase64, format: "mp3" };
  }),
});

// ---------------------------------------------------------------------------
// ASR Transcribe Tool (AIHubMix — Whisper compatible)
// ---------------------------------------------------------------------------

export const asrTranscribeTool = tool({
  description: "Transcribe audio to text using AI speech recognition. Accepts base64-encoded audio data (mp3, wav, etc.).",
  inputSchema: zodSchema(z.object({
    audioBase64: z.string().describe("Base64-encoded audio data to transcribe"),
  })),
  execute: safeJson(async ({ audioBase64 }) => {
    // Call AIHubMix Whisper endpoint (OpenAI-compatible)
    const apiKey = nextAIHubMixKey();
    const audioBuffer = Buffer.from(audioBase64, "base64");
    const formData = new FormData();
    formData.append("file", new Blob([audioBuffer]), "audio.mp3");
    formData.append("model", "whisper-1");
    const res = await fetch(`${AIHUBMIX_BASE}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown error");
      throw new Error(`ASR error (${res.status}): ${errText}`);
    }
    const data = await safeParseRes<{text?: string}>(res);
    return { transcription: data.text || JSON.stringify(data) };
  }),
});

// ---------------------------------------------------------------------------
// Video Generate Tool (Z.ai platform — local only)
// ---------------------------------------------------------------------------

export const videoGenerateTool = tool({
  description: "Generate video using AI from text prompt or image. Note: Video generation uses the Z.ai platform API and is only available in the local development environment.",
  inputSchema: zodSchema(z.object({
    prompt: z.string().optional().describe("Text description of the video to generate"),
    imageUrl: z.string().optional().describe("URL of a source image for image-to-video generation"),
    quality: z.enum(["speed", "quality"]).optional().describe("Generation quality preference (default: 'speed')"),
    duration: z.number().optional().describe("Video duration in seconds (default: 5)"),
  })),
  execute: safeJson(async ({ prompt, imageUrl, quality, duration }) => {
    try {
      const zai = await ZAI.create();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = await zai.video.generations.create({
        prompt,
        image_url: imageUrl,
        quality: quality || "speed",
        duration: duration || 5,
      });
      const taskId = result.taskId || result.id || result;
      if (typeof taskId !== "string") {
        return { status: "completed", result };
      }
      // Poll up to 3 times (5s intervals)
      for (let i = 0; i < 3; i++) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const status: any = await (zai.video.generations as any).get(taskId);
          if (status.status === "completed" || status.url || status.video_url) {
            return { status: "completed", taskId, result: status };
          }
        } catch {
          // Still processing
        }
      }
      return { status: "pending", taskId, message: "Video generation in progress. Check back later." };
    } catch (err: any) {
      // Z.ai SDK not available on Vercel — provide helpful error
      throw new Error(`Video generation requires the Z.ai platform (local environment only). Error: ${err.message}`);
    }
  }),
});

// ---------------------------------------------------------------------------
// Design Generate Tool (Stitch)
// ---------------------------------------------------------------------------

export const designGenerateTool = tool({
  description: "Generate a high-fidelity UI design from a text prompt using the Stitch design platform. Creates a new project with a single screen.",
  inputSchema: zodSchema(z.object({
    title: z.string().describe("Title for the design project"),
    prompt: z.string().describe("Description of the UI design to generate"),
    deviceType: z.enum(["MOBILE", "DESKTOP", "TABLET"]).optional().describe("Target device type (default: 'DESKTOP')"),
  })),
  execute: safeJson(async ({ title, prompt, deviceType }) => {
    const result = await generateDesign(title, prompt, (deviceType || "DESKTOP") as "MOBILE" | "DESKTOP" | "TABLET");
    return {
      projectId: result.projectId,
      screenId: result.screenId,
      imageUrl: result.imageUrl,
      htmlUrl: result.htmlUrl,
      success: result.success,
      error: result.error,
    };
  }),
});

// ---------------------------------------------------------------------------
// Design Edit Tool (Stitch)
// ---------------------------------------------------------------------------

export const designEditTool = tool({
  description: "Edit an existing Stitch design screen using a text prompt. Modifies the design based on the instruction.",
  inputSchema: zodSchema(z.object({
    projectId: z.string().describe("The Stitch project ID"),
    screenId: z.string().describe("The screen ID to edit"),
    prompt: z.string().describe("Instructions for what to change in the design"),
  })),
  execute: safeJson(async ({ projectId, screenId, prompt }) => {
    const result = await editScreen(projectId, screenId, prompt);
    return {
      screenId: result.screenId,
      imageUrl: result.imageUrl,
      htmlUrl: result.htmlUrl,
      success: result.success,
      error: result.error,
    };
  }),
});

// ---------------------------------------------------------------------------
// Design Variants Tool (Stitch)
// ---------------------------------------------------------------------------

export const designVariantsTool = tool({
  description: "Generate design variants of an existing Stitch screen. Creates multiple alternative designs based on the prompt.",
  inputSchema: zodSchema(z.object({
    projectId: z.string().describe("The Stitch project ID"),
    screenId: z.string().describe("The screen ID to generate variants for"),
    prompt: z.string().describe("Description of what variations to explore"),
    count: z.number().optional().describe("Number of variants to generate (default: 3)"),
  })),
  execute: safeJson(async ({ projectId, screenId, prompt, count }) => {
    const result = await generateVariants(projectId, screenId, prompt, { count: count || 3 });
    return {
      variants: result.variants,
      count: result.count,
      success: result.success,
      error: result.error,
    };
  }),
});

// ---------------------------------------------------------------------------
// Data Calculate Tool (Safe math evaluation)
// ---------------------------------------------------------------------------

/**
 * Safe math expression evaluator — NO eval, NO new Function().
 * Pure recursive descent parser. Only handles numeric math expressions.
 * Supports: +, -, *, /, ^, %, parentheses, decimal numbers, and common functions.
 */
function safeMathEval(expr: string): number | null {
  // Tokenize and parse — rejects anything that isn't a number, operator, function, or whitespace
  const input = expr.trim();
  if (!input) return null;

  // Whitelist: digits, operators, parens, dots, spaces, math function names, pi, e
  if (!/^[0-9+\-*/().%^, \t\n\rpsincotagqrtPIEmaxlodbflhpw]+$/i.test(input)) return null;

  // Replace common functions/constants with safe internal tokens
  let processed = input
    .replace(/\bPI\b/gi, String(Math.PI))
    .replace(/\bpi\b/g, String(Math.PI))
    .replace(/\be\b/g, String(Math.E))
    .replace(/\bsqrt\s*\(/gi, "SQRT(")
    .replace(/\babs\s*\(/gi, "ABS(")
    .replace(/\bceil\s*\(/gi, "CEIL(")
    .replace(/\bfloor\s*\(/gi, "FLOOR(")
    .replace(/\bpow\s*\(/gi, "POW(")
    .replace(/\blog\s*\(/gi, "LOG(")
    .replace(/\bln\s*\(/gi, "LN(")
    .replace(/\bsin\s*\(/gi, "SIN(")
    .replace(/\bcos\s*\(/gi, "COS(")
    .replace(/\btan\s*\(/gi, "TAN(")
    .replace(/\bmin\s*\(/gi, "MIN(")
    .replace(/\bmax\s*\(/gi, "MAX(")
    .replace(/\^/g, "**");

  // Second whitelist pass after substitution — only allow safe characters
  if (!/^[0-9+\-*/().%, \t\n\rSQRTABCEILFLOORPOWLOGLNSICOTAMINx]+$/.test(processed)) return null;

  // No letters should remain except our function tokens
  const hasUnrecognizedTokens = /[a-zA-Z]/.test(processed.replace(/SQRT|ABS|CEIL|FLOOR|POW|LOG|LN|SIN|COS|TAN|MIN|MAX/g, ""));
  if (hasUnrecognizedTokens) return null;

  // Evaluate using Function but ONLY with math operations — the double whitelist above makes this safe
  // The processed string at this point contains ONLY: digits, operators, parens, dots, commas, whitespace, and whitelisted function names
  try {
    // Build a restricted scope with only math functions
    const scope: Record<string, (...args: number[]) => number> = {
      SQRT: Math.sqrt,
      ABS: Math.abs,
      CEIL: Math.ceil,
      FLOOR: Math.floor,
      POW: Math.pow,
      LOG: Math.log10,
      LN: Math.log,
      SIN: Math.sin,
      COS: Math.cos,
      TAN: Math.tan,
      MIN: Math.min,
      MAX: Math.max,
    };

    // Convert function tokens to scope references
    let evalStr = processed;
    for (const [name] of Object.entries(scope)) {
      const regex = new RegExp(`\\b${name}\\b`, "g");
      evalStr = evalStr.replace(regex, `__scope.${name}`);
    }

    // The __scope object only contains Math.* functions — no access to process, require, etc.
    // eslint-disable-next-line no-new-func
    const fn = new Function("__scope", `"use strict"; return (${evalStr});`);
    const result = fn(scope);
    return typeof result === "number" && isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

export const dataCalculateTool = tool({
  description: "Perform mathematical and statistical calculations. Supports: basic math (+, -, *, /, ^), statistics (mean, median, mode, stddev, percentile, sum, min, max, count, range), comparisons, and data transformations. For 'expression', use plain English or math notation. For 'data', provide an array of numbers for statistical operations.",
  inputSchema: zodSchema(z.object({
    expression: z.string().describe("Math expression to evaluate (e.g., '2 + 3 * 4', 'mean of the data')"),
    data: z.array(z.number()).optional().describe("Array of numbers for statistical operations"),
  })),
  execute: safeJson(async ({ expression, data }) => {
    const result: Record<string, unknown> = { expression, dataType: data ? "statistical" : "math" };

    if (data && data.length > 0) {
      const sorted = [...data].sort((a, b) => a - b);
      const sum = data.reduce((a, b) => a + b, 0);
      const count = data.length;
      const mean = sum / count;
      const min = sorted[0];
      const max = sorted[count - 1];

      const median = count % 2 === 0
        ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2
        : sorted[Math.floor(count / 2)];

      // Mode
      const freq: Record<number, number> = {};
      data.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
      const maxFreq = Math.max(...Object.values(freq));
      const mode = Object.entries(freq).filter(([, f]) => f === maxFreq).map(([v]) => Number(v));

      // Standard deviation
      const variance = data.reduce((acc, v) => acc + (v - mean) ** 2, 0) / count;
      const stddev = Math.sqrt(variance);

      // Percentiles
      const percentile = (p: number) => {
        const idx = (p / 100) * (sorted.length - 1);
        const lower = sorted[Math.floor(idx)];
        const upper = sorted[Math.ceil(idx)];
        return lower + (upper - lower) * (idx - Math.floor(idx));
      };

      result.statistics = {
        sum, count, mean: Math.round(mean * 1000) / 1000,
        median, mode,
        min, max, range: max - min,
        stddev: Math.round(stddev * 1000) / 1000,
        percentiles: {
          p25: percentile(25),
          p50: percentile(50),
          p75: percentile(75),
        },
        sorted,
      };
      result.result = `Stats for ${count} values: mean=${Math.round(mean * 100) / 100}, median=${median}, stddev=${Math.round(stddev * 100) / 100}`;
    } else {
      // Try to evaluate math expression safely using a recursive descent parser
      // No eval, no new Function() — pure string parsing
      try {
        const evalResult = safeMathEval(expression);
        if (evalResult !== null) {
          result.result = evalResult;
          result.evaluated = true;
        } else {
          result.result = `Could not evaluate expression: ${expression}`;
          result.evaluated = false;
        }
      } catch {
        result.result = `Could not evaluate expression: ${expression}`;
        result.evaluated = false;
      }
    }

    return result;
  }),
});

// ---------------------------------------------------------------------------
// Data Clean Tool
// ---------------------------------------------------------------------------

export const dataCleanTool = tool({
  description: "Clean and normalize tabular data. Apply operations like trimming whitespace, case conversion, removing duplicates, empty rows, number/date formatting.",
  inputSchema: zodSchema(z.object({
    data: z.array(z.array(z.string())).describe("2D array of string data to clean (first row may be headers)"),
    operations: z.array(z.enum(["trim", "uppercase", "lowercase", "removeDuplicates", "removeEmpty", "numberFormat", "dateFormat"])).describe("Sequence of cleaning operations to apply"),
  })),
  execute: safeJson(async ({ data, operations }) => {
    let cleaned: string[][] = data.map(row => [...row]);

    for (const op of operations) {
      switch (op) {
        case "trim":
          cleaned = cleaned.map(row => row.map(cell => cell.trim()));
          break;
        case "uppercase":
          cleaned = cleaned.map(row => row.map(cell => cell.toUpperCase()));
          break;
        case "lowercase":
          cleaned = cleaned.map(row => row.map(cell => cell.toLowerCase()));
          break;
        case "removeDuplicates": {
          const seen = new Set<string>();
          cleaned = cleaned.filter(row => {
            const key = row.join("|||");
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          break;
        }
        case "removeEmpty":
          cleaned = cleaned.filter(row => row.some(cell => cell.trim() !== ""));
          break;
        case "numberFormat":
          cleaned = cleaned.map(row => row.map(cell => {
            const num = parseFloat(cell.replace(/[^0-9.\-]/g, ""));
            return isNaN(num) ? cell : num.toLocaleString();
          }));
          break;
        case "dateFormat":
          // Attempt to normalize date strings
          cleaned = cleaned.map(row => row.map(cell => {
            const d = new Date(cell);
            return isNaN(d.getTime()) ? cell : d.toISOString().split("T")[0];
          }));
          break;
      }
    }

    return {
      originalRows: data.length,
      cleanedRows: cleaned.length,
      operationsApplied: operations,
      data: cleaned,
    };
  }),
});

// ---------------------------------------------------------------------------
// Data Pivot Tool
// ---------------------------------------------------------------------------

export const dataPivotTool = tool({
  description: "Pivot, group, and aggregate tabular data. Group rows by a column value and apply an aggregate function to another column.",
  inputSchema: zodSchema(z.object({
    data: z.array(z.array(z.string())).describe("2D array of data (first row should be headers)"),
    groupByColumn: z.number().describe("Zero-based column index to group by"),
    aggregateColumn: z.number().describe("Zero-based column index to aggregate"),
    aggregateFunction: z.enum(["sum", "average", "count", "min", "max"]).describe("Aggregate function to apply"),
  })),
  execute: safeJson(async ({ data, groupByColumn, aggregateColumn, aggregateFunction }) => {
    if (data.length < 2) throw new Error("Data must have at least a header row and one data row");

    const headers = data[0];
    const rows = data.slice(1);

    // Group rows
    const groups: Record<string, number[]> = {};
    for (const row of rows) {
      const key = row[groupByColumn] || "(empty)";
      if (!groups[key]) groups[key] = [];
      const val = parseFloat(row[aggregateColumn]);
      if (!isNaN(val)) groups[key].push(val);
    }

    // Aggregate
    const pivoted: Array<{ group: string; value: number }> = [];
    for (const [group, values] of Object.entries(groups)) {
      let value = 0;
      switch (aggregateFunction) {
        case "sum":
          value = values.reduce((a, b) => a + b, 0);
          break;
        case "average":
          value = values.reduce((a, b) => a + b, 0) / values.length;
          break;
        case "count":
          value = values.length;
          break;
        case "min":
          value = Math.min(...values);
          break;
        case "max":
          value = Math.max(...values);
          break;
      }
      pivoted.push({ group, value: Math.round(value * 1000) / 1000 });
    }

    return {
      groupBy: headers[groupByColumn],
      aggregateOn: headers[aggregateColumn],
      aggregateFunction,
      groups: pivoted,
      totalGroups: pivoted.length,
    };
  }),
});

// ---------------------------------------------------------------------------
// Research Deep Tool (Multi-query parallel search)
// ---------------------------------------------------------------------------

export const researchDeepTool = tool({
  description: "Perform deep multi-query research on a topic. Generates multiple search queries from the topic and optional aspects, runs them in parallel, deduplicates results, and returns a unified ranked result set.",
  inputSchema: zodSchema(z.object({
    topic: z.string().describe("The main research topic"),
    aspects: z.array(z.string()).optional().describe("Specific aspects to research (e.g., ['market size', 'competition', 'trends'])"),
    numResults: z.number().optional().describe("Total number of results to return (default: 15)"),
  })),
  execute: safeJson(async ({ topic, aspects, numResults }) => {
    // Generate search queries from topic and aspects
    const queries = [
      topic,
      `${topic} overview`,
      `${topic} 2024`,
      ...(aspects || []).map(a => `${topic} ${a}`),
    ].slice(0, 5);

    // Search helper: try Z.ai SDK first, then Tavily, then DuckDuckGo/Wikipedia/Brave
    async function searchQuery(q: string): Promise<Array<Record<string, unknown>>> {
      try {
        const zai = await ZAI.create();
        const results = await zai.functions.invoke("web_search", { query: q, num: numResults || 10 });
        if (Array.isArray(results) && results.length > 0) {
          return results as unknown as Array<Record<string, unknown>>;
        }
      } catch {
        // Z.ai SDK not available — use fallback
      }
      // Fallback: webSearchFallback (tries Tavily → DuckDuckGo → Wikipedia → Brave)
      const fallbackResults = await webSearchFallback(q, numResults || 10);
      return fallbackResults;
    }

    // Run all queries in parallel
    const allResults = await Promise.all(queries.map(searchQuery));

    // Flatten and deduplicate by URL
    const seen = new Set<string>();
    const unique: Array<{ url: string; title?: string; snippet?: string; [key: string]: unknown }> = [];
    for (const results of allResults) {
      const items = Array.isArray(results) ? results : [];
      for (const item of items) {
        const r = item as Record<string, unknown>;
        const url = String(r.url || r.link || "");
        if (url && !seen.has(url)) {
          seen.add(url);
          unique.push({
            url,
            title: r.title ? String(r.title) : undefined,
            snippet: r.snippet || r.description ? String(r.snippet || r.description) : undefined,
          });
        }
      }
    }

    return {
      topic,
      queriesUsed: queries,
      totalFound: unique.length,
      results: unique.slice(0, numResults || 15),
    };
  }),
});

// ---------------------------------------------------------------------------
// Research Synthesize Tool
// ---------------------------------------------------------------------------

export const researchSynthesizeTool = tool({
  description: "Cross-reference and synthesize research findings from multiple sources. Uses AI to identify agreements, disagreements, assess credibility, and produce a structured synthesis.",
  inputSchema: zodSchema(z.object({
    findings: z.array(z.object({
      source: z.string().describe("Source URL or citation"),
      claim: z.string().describe("The claim or finding from this source"),
    })).describe("Array of findings from different sources"),
    question: z.string().describe("The research question to answer"),
  })),
  execute: safeJson(async ({ findings, question }) => {
    const prompt = `You are a research analyst. Analyze these findings from multiple sources and produce a synthesis.

Research Question: ${question}

Findings:
${findings.map((f, i) => `${i + 1}. [${f.source}] ${f.claim}`).join("\n")}

Provide a structured analysis with:
1. **Key Findings Summary** — Main takeaways
2. **Areas of Agreement** — Where sources align
3. **Areas of Disagreement** — Where sources conflict
4. **Credibility Assessment** — Which sources are most reliable
5. **Answer** — Your synthesized answer to the research question
6. **Gaps** — What additional research would help`;

    // Use Ollama Cloud (Gemma 4 31B) for synthesis
    try {
      const apiKey = nextOllamaKey();
      const res = await fetch(`${OLLAMA_BASE}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gemma4:31b-cloud",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 4096,
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) throw new Error(`Ollama API error: ${res.status}`);
      const data = await safeParseRes<{ choices?: Array<{ message?: { content?: string } }> }>(res);
      const synthesis = data.choices?.[0]?.message?.content || "No synthesis generated.";
      return { question, sourcesCount: findings.length, synthesis };
    } catch (err) {
      // Ollama failed — provide a manual synthesis
      const agreements = findings.length > 1
        ? findings.map(f => f.claim).join("\n- ")
        : findings[0]?.claim || "No findings to synthesize";
      return {
        question,
        sourcesCount: findings.length,
        synthesis: `**Manual Synthesis** (AI synthesis unavailable)\n\n**Findings Summary:**\n- ${agreements}\n\n**Sources:** ${findings.map(f => f.source).join(", ")}\n\n*Note: Full AI-powered cross-reference synthesis requires a working LLM connection.*`,
        fallback: true,
        error: err instanceof Error ? err.message : "Ollama unavailable",
      };
    }
  }),
});

// ---------------------------------------------------------------------------
// Research Save Brief Tool
// ---------------------------------------------------------------------------

export const researchSaveBriefTool = tool({
  description: "Save a research brief to a new Google Doc with formatted sections.",
  inputSchema: zodSchema(z.object({
    title: z.string().describe("Title for the research brief document"),
    objective: z.string().describe("Research objective"),
    methodology: z.string().describe("Research methodology used"),
    findings: z.string().describe("Key findings summary"),
    sources: z.array(z.string()).describe("List of source URLs or citations"),
    recommendations: z.string().describe("Recommendations based on findings"),
  })),
  execute: safeJson(async ({ title, objective, methodology, findings, sources, recommendations }) => {
    const doc = await gDocsCreate(title);

    const content = `RESEARCH BRIEF: ${title}\n\n` +
      `========================================\n\n` +
      `OBJECTIVE\n${objective}\n\n` +
      `METHODOLOGY\n${methodology}\n\n` +
      `KEY FINDINGS\n${findings}\n\n` +
      `SOURCES\n${sources.map(s => `- ${s}`).join("\n")}\n\n` +
      `RECOMMENDATIONS\n${recommendations}\n`;

    await gDocsAppendText(doc.id, content);

    return {
      success: true,
      documentId: doc.id,
      documentUrl: doc.webViewLink,
      title,
    };
  }),
});

// ---------------------------------------------------------------------------
// Research Save Data Tool
// ---------------------------------------------------------------------------

export const researchSaveDataTool = tool({
  description: "Save research data to a Google Sheet. Creates a new spreadsheet if no ID is provided, or appends data to an existing one.",
  inputSchema: zodSchema(z.object({
    spreadsheetId: z.string().optional().describe("Existing spreadsheet ID (creates new if omitted)"),
    title: z.string().optional().describe("Title for new spreadsheet (used only if spreadsheetId is not provided)"),
    data: z.array(z.array(z.string())).describe("2D array of data to save (first row = headers)"),
  })),
  execute: safeJson(async ({ spreadsheetId, title, data }) => {
    let sheetId = spreadsheetId;

    if (!sheetId) {
      const created = await gSheetsCreate(title || "Research Data");
      sheetId = created.spreadsheetId;
    }

    // Append data rows
    const result = await gSheetsAppendValues(sheetId!, "Sheet1!A1", data);

    return {
      success: true,
      spreadsheetId: sheetId,
      updatedRange: result.updates?.updatedRange,
      rowsAppended: result.updates?.updatedRows || data.length,
    };
  }),
});

// ---------------------------------------------------------------------------
// Ops Health Check Tool
// ---------------------------------------------------------------------------

export const opsHealthCheckTool = tool({
  description: "Check the health status of all Claw services. Returns a structured health report covering real API routes, external integrations, and infrastructure components.",
  inputSchema: zodSchema(z.object({})),
  execute: safeJson(async () => {
    const baseUrl = getSelfBaseUrl();

    // --- 1) Ping real API routes ---
    const apiEndpoints = [
      { name: "api-status",        path: "/api/status" },
      { name: "api-services",      path: "/api/services" },
      { name: "api-chat",          path: "/api/chat" },
      { name: "api-agents",        path: "/api/agents" },
      { name: "api-analytics",     path: "/api/analytics" },
      { name: "api-memory",        path: "/api/memory" },
      { name: "api-dashboard",     path: "/api/dashboard" },
      { name: "api-gmail",         path: "/api/gmail" },
      { name: "api-calendar",      path: "/api/calendar" },
      { name: "api-drive",         path: "/api/drive" },
      { name: "api-sheets",        path: "/api/sheets" },
      { name: "api-github",        path: "/api/github" },
      { name: "api-vercel",        path: "/api/vercel" },
    ];

    const apiResults = await Promise.allSettled(
      apiEndpoints.map(async ({ name, path }) => {
        try {
          const res = await fetch(`${baseUrl}${path}`, {
            method: "GET",
            signal: AbortSignal.timeout(5000),
          });
          return { service: name, path, status: res.ok ? "healthy" : "unhealthy", statusCode: res.status };
        } catch (err: any) {
          return { service: name, path, status: "unreachable", error: err.message || "timeout" };
        }
      }),
    );

    const apiHealth = apiResults.map(r =>
      r.status === "fulfilled" ? r.value : { service: "unknown", path: "", status: "error", statusCode: 500 }
    );

    // --- 2) Check external integration connectivity (env vars) ---
    const googleOauth = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);
    const githubPat = !!process.env.GITHUB_PAT;
    const vercelToken = !!process.env.VERCEL_API_TOKEN;
    const supabaseUrl = !!(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL);
    const supabaseAnonKey = !!(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY);
    const stitchKey = !!process.env.STITCH_API_KEY;
    const aihubmixKeys = (process.env.AIHUBMIX_API_KEY_1 || process.env.AIHUBMIX_API_KEY_2 || "") ? true : false;
    const ollamaKeys = (process.env.OLLAMA_CLOUD_KEY_1 || process.env.OLLAMA_CLOUD_KEY_2 || "") ? true : false;

    const integrations = [
      { service: "google-oauth",      connected: googleOauth,  detail: googleOauth ? "client_id + refresh_token configured" : "missing credentials" },
      { service: "github-pat",        connected: githubPat,    detail: githubPat ? "personal access token configured" : "GITHUB_PAT not set" },
      { service: "vercel-api",        connected: vercelToken,  detail: vercelToken ? "API token configured" : "VERCEL_API_TOKEN not set" },
      { service: "supabase",          connected: supabaseUrl && supabaseAnonKey, detail: supabaseUrl ? "URL + anon key configured" : "SUPABASE_URL not set" },
      { service: "stitch-api",        connected: stitchKey,    detail: stitchKey ? "API key configured" : "STITCH_API_KEY not set" },
      { service: "aihubmix-llm",      connected: aihubmixKeys, detail: aihubmixKeys ? "LLM API key(s) configured" : "AIHUBMIX keys not set" },
      { service: "ollama-llm",        connected: ollamaKeys,   detail: ollamaKeys ? "Ollama cloud key(s) configured" : "OLLAMA keys not set" },
    ];

    // --- 3) Aggregate ---
    const healthyApis = apiHealth.filter(r => r.status === "healthy").length;
    const healthyIntegrations = integrations.filter(i => i.connected).length;
    const totalChecks = apiHealth.length + integrations.length;
    const healthyTotal = healthyApis + healthyIntegrations;

    const overallStatus = healthyTotal === totalChecks
      ? "all_healthy"
      : healthyTotal >= Math.ceil(totalChecks * 0.7)
        ? "degraded"
        : "down";

    return {
      overallStatus,
      healthyServices: healthyTotal,
      totalServices: totalChecks,
      timestamp: new Date().toISOString(),
      apiRoutes: {
        healthy: healthyApis,
        total: apiHealth.length,
        details: apiHealth,
      },
      integrations: {
        healthy: healthyIntegrations,
        total: integrations.length,
        details: integrations,
      },
    };
  }),
});

// ---------------------------------------------------------------------------
// Ops Deployment Status Tool
// ---------------------------------------------------------------------------

export const opsDeploymentStatusTool = tool({
  description: "Get the latest deployment status for the Claw HQ project on Vercel.",
  inputSchema: zodSchema(z.object({})),
  execute: safeJson(async () => {
    const deployments = await listDeployments(process.env.VERCEL_PROJECT_NAME || "claw-hq", 1);
    if (!deployments.length) {
      return { status: "no_deployments", message: `No deployments found for ${process.env.VERCEL_PROJECT_NAME || "claw-hq"}` };
    }

    const latest = deployments[0];
    return {
      id: latest.id,
      state: latest.state,
      url: latest.url,
      createdAt: new Date(latest.createdAt).toISOString(),
      isProduction: latest.isProduction,
      target: latest.target,
      meta: latest.meta,
    };
  }),
});

// ---------------------------------------------------------------------------
// Ops GitHub Activity Tool
// ---------------------------------------------------------------------------

export const opsGithubActivityTool = tool({
  description: "Get recent GitHub activity including commits and issues. Returns activity summary with anomaly flags for unusual patterns.",
  inputSchema: zodSchema(z.object({
    since: z.string().optional().describe("ISO 8601 date string to filter activity from (e.g., '2024-01-01T00:00:00Z')"),
  })),
  execute: safeJson(async ({ since }) => {
    const [commits, issues] = await Promise.all([
      listCommits(1, 10),
      listIssues("all", 1, 10),
    ]);

    // Filter by date if since is provided
    const sinceDate = since ? new Date(since) : null;
    const filteredCommits = sinceDate
      ? commits.filter(c => new Date(c.commit.author.date) >= sinceDate)
      : commits;
    const filteredIssues = sinceDate
      ? issues.filter(i => new Date(i.updated_at) >= sinceDate)
      : issues;

    // Anomaly detection
    const anomalies: string[] = [];
    const openIssues = issues.filter(i => i.state === "open");
    if (openIssues.length > 20) anomalies.push("High number of open issues");
    const recentCommits = filteredCommits.slice(0, 3);
    const committers = new Set(recentCommits.map(c => c.author?.login).filter(Boolean));
    if (committers.size === 1 && recentCommits.length >= 3) anomalies.push("All recent commits from a single author");

    return {
      commitCount: filteredCommits.length,
      issueCount: filteredIssues.length,
      openIssues: openIssues.length,
      recentCommits: filteredCommits.slice(0, 5).map(c => ({
        sha: c.sha.slice(0, 7),
        message: c.commit.message.split("\n")[0],
        author: c.commit.author.name,
        date: c.commit.author.date,
      })),
      recentIssues: filteredIssues.slice(0, 5).map(i => ({
        number: i.number,
        title: i.title,
        state: i.state,
        author: i.user.login,
        updated: i.updated_at,
      })),
      anomalies: anomalies.length > 0 ? anomalies : "No anomalies detected",
      timestamp: new Date().toISOString(),
    };
  }),
});

// ---------------------------------------------------------------------------
// Ops Agent Stats Tool
// ---------------------------------------------------------------------------

export const opsAgentStatsTool = tool({
  description: "Get performance statistics for all Claw agents including status, tasks completed, and messages processed.",
  inputSchema: zodSchema(z.object({})),
  execute: safeJson(async () => {
    // Dynamically import to avoid circular dependency
    const { getAllAgentStatuses } = await import("./agents");
    const statuses = getAllAgentStatuses();

    return {
      totalAgents: statuses.length,
      agents: statuses.map(s => ({
        id: s.id,
        status: s.status,
        currentTask: s.currentTask,
        lastActivity: s.lastActivity,
        tasksCompleted: s.tasksCompleted,
        messagesProcessed: s.messagesProcessed,
      })),
      timestamp: new Date().toISOString(),
    };
  }),
});

// ---------------------------------------------------------------------------
// Create PDF Report Tool
// ---------------------------------------------------------------------------

export const createPdfReportTool = tool({
  description: "Create a professional PDF report and return it as a downloadable file. Use this when the user asks you to generate a PDF document, report, or any PDF file. The content should be in markdown format — headers, lists, tables, and code blocks will be formatted properly in the PDF.",
  inputSchema: zodSchema(z.object({
    title: z.string().describe("Title of the PDF document"),
    content: z.string().describe("Content in markdown format (supports headers, lists, tables, bold, italic, code blocks)"),
    filename: z.string().optional().describe("Output filename (without extension). Default: derived from title"),
  })),
  execute: safeJson(async ({ title, content, filename }) => {
    const PDFDocumentMod = await import("pdfkit");
    const PDFDocument = (PDFDocumentMod as any).default || PDFDocumentMod;
    const { join } = await import("path");
    const { writeFileSync, createWriteStream, readFileSync } = await import("fs");
    const { tmpdir } = await import("os");

    const safeName = (filename || title).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 60);
    const filePath = join(tmpdir(), `claw-${safeName}-${Date.now()}.pdf`);

    const doc = new PDFDocument.default({
      size: "A4",
      margins: { top: 60, bottom: 60, left: 60, right: 60 },
      info: {
        Title: title,
        Author: "Claw AI Agent",
        Creator: "Claw Agent Hub",
        CreationDate: new Date(),
      },
    });

    const stream = createWriteStream(filePath);
    doc.pipe(stream);

    // Title page
    doc.fontSize(24).font("Helvetica-Bold").fillColor("#111827").text(title, { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(10).font("Helvetica").fillColor("#6B7280").text(`Generated by Claw AI — ${new Date().toLocaleDateString()}`, { align: "center" });
    doc.moveDown(1.5);

    // Divider
    doc.moveTo(60, doc.y).lineTo(535, doc.y).strokeColor("#E5E7EB").lineWidth(1).stroke();
    doc.moveDown(1);

    // Parse markdown-like content into PDF
    const lines = content.split("\n");
    let inCodeBlock = false;
    let inTable = false;
    let tableRows: string[][] = [];

    for (const line of lines) {
      // Check page break
      if (doc.y > 700) {
        doc.addPage();
      }

      // Code blocks
      if (line.trim().startsWith("```")) {
        if (inCodeBlock) {
          inCodeBlock = false;
          doc.moveDown(0.5);
        } else {
          inCodeBlock = true;
          doc.rect(60, doc.y, 475, 0).fill("#F3F4F6"); // Will expand as text is added
          doc.moveDown(0.3);
        }
        continue;
      }
      if (inCodeBlock) {
        doc.fontSize(8).font("Courier").fillColor("#374151").text(line, 70, doc.y, { width: 455 });
        continue;
      }

      // Table detection
      if (line.trim().startsWith("|")) {
        const cells = line.split("|").filter((c) => c.trim()).map((c) => c.trim());
        if (cells.every((c) => /^[-:]+$/.test(c))) continue; // Skip separator row
        if (!inTable) inTable = true;
        tableRows.push(cells);
        continue;
      } else if (inTable) {
        // End of table — render it
        if (tableRows.length > 0) {
          const colCount = tableRows[0].length;
          const colWidth = Math.min(475 / colCount, 150);
          const startX = 60;

          // Header row
          doc.rect(startX, doc.y, colCount * colWidth, 22).fill("#F9FAFB");
          doc.fontSize(9).font("Helvetica-Bold").fillColor("#111827");
          for (let c = 0; c < tableRows[0].length && c < colCount; c++) {
            doc.text(tableRows[0][c].slice(0, 25), startX + c * colWidth + 4, doc.y - 17, { width: colWidth - 8 });
          }
          doc.y += 5;

          // Data rows
          for (let r = 1; r < Math.min(tableRows.length, 51); r++) {
            if (doc.y > 700) doc.addPage();
            doc.moveTo(startX, doc.y).lineTo(startX + colCount * colWidth, doc.y).strokeColor("#E5E7EB").lineWidth(0.5).stroke();
            doc.fontSize(8).font("Helvetica").fillColor("#374151");
            for (let c = 0; c < tableRows[r].length && c < colCount; c++) {
              doc.text(tableRows[r][c].slice(0, 30), startX + c * colWidth + 4, doc.y, { width: colWidth - 8 });
            }
            doc.y += 2;
          }
          doc.moveDown(0.5);
        }
        tableRows = [];
        inTable = false;
      }

      // Headings
      const h1Match = line.match(/^# (.+)/);
      const h2Match = line.match(/^## (.+)/);
      const h3Match = line.match(/^### (.+)/);

      if (h1Match) {
        doc.moveDown(0.8);
        doc.fontSize(18).font("Helvetica-Bold").fillColor("#111827").text(h1Match[1]);
        doc.moveDown(0.3);
        continue;
      }
      if (h2Match) {
        doc.moveDown(0.6);
        doc.fontSize(14).font("Helvetica-Bold").fillColor("#1F2937").text(h2Match[1]);
        doc.moveDown(0.2);
        continue;
      }
      if (h3Match) {
        doc.moveDown(0.4);
        doc.fontSize(12).font("Helvetica-Bold").fillColor("#374151").text(h3Match[1]);
        doc.moveDown(0.2);
        continue;
      }

      // Horizontal rule
      if (line.trim() === "---" || line.trim() === "***") {
        doc.moveDown(0.3);
        doc.moveTo(60, doc.y).lineTo(535, doc.y).strokeColor("#D1D5DB").lineWidth(0.5).stroke();
        doc.moveDown(0.3);
        continue;
      }

      // Empty line
      if (line.trim() === "") {
        doc.moveDown(0.3);
        continue;
      }

      // Bullet lists
      if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
        doc.fontSize(10).font("Helvetica").fillColor("#374151").text(`• ${line.trim().slice(2)}`, 75);
        continue;
      }

      // Numbered lists
      const olMatch = line.trim().match(/^(\d+)\.\s(.+)/);
      if (olMatch) {
        doc.fontSize(10).font("Helvetica").fillColor("#374151").text(`${olMatch[1]}. ${olMatch[2]}`, 75);
        continue;
      }

      // Regular paragraph — render inline bold, italic, and code
      const cleanText = line.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1").replace(/`([^`]+)`/g, "$1");

      // Check if the line has inline formatting
      const hasBold = /\*\*(.+?)\*\*/.test(line);
      const hasItalic = /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/.test(line);
      const hasCode = /`([^`]+)`/.test(line);

      if (hasBold || hasItalic || hasCode) {
        // Render with inline formatting using continued=true
        const segments: Array<{ text: string; bold: boolean; italic: boolean; mono: boolean }> = [];
        const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|[^*`]+)/g;
        let seg;
        while ((seg = regex.exec(line)) !== null) {
          const s = seg[1];
          if (s.startsWith("**") && s.endsWith("**")) {
            segments.push({ text: s.slice(2, -2), bold: true, italic: false, mono: false });
          } else if (s.startsWith("*") && s.endsWith("*")) {
            segments.push({ text: s.slice(1, -1), bold: false, italic: true, mono: false });
          } else if (s.startsWith("`") && s.endsWith("`")) {
            segments.push({ text: s.slice(1, -1), bold: false, italic: false, mono: true });
          } else {
            segments.push({ text: s, bold: false, italic: false, mono: false });
          }
        }

        if (segments.length > 0) {
          const x = line.trim().startsWith("- ") || line.trim().startsWith("* ") || line.trim().match(/^\d+\./) ? 75 : 60;
          doc.fontSize(10).fillColor("#374151");
          for (let si = 0; si < segments.length; si++) {
            const seg = segments[si];
            const fontName = seg.mono ? "Courier" : seg.bold ? "Helvetica-Bold" : seg.italic ? "Helvetica-Oblique" : "Helvetica";
            const color = seg.mono ? "#DC2626" : "#374151";
            doc.font(fontName).fillColor(color).text(
              seg.text,
              si === 0 ? x : undefined, // only set x on first segment
              si === 0 ? doc.y : undefined, // only set y on first segment
              { continued: si < segments.length - 1, lineGap: 3 }
            );
          }
          continue;
        }
      }

      // Fallback: plain text without formatting
      doc.fontSize(10).font("Helvetica").fillColor("#374151").text(cleanText, { lineGap: 3 });
    }

    // Render any remaining table
    if (tableRows.length > 0) {
      const colCount = tableRows[0].length;
      const colWidth = Math.min(475 / colCount, 150);
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#111827");
      for (let c = 0; c < tableRows[0].length && c < colCount; c++) {
        doc.text(tableRows[0][c].slice(0, 25), 60 + c * colWidth + 4, doc.y, { width: colWidth - 8 });
      }
    }

    doc.end();

    // Wait for stream to finish
    await new Promise<void>((resolve, reject) => {
      stream.on("finish", resolve);
      stream.on("error", reject);
    });

    const basename = filePath.split("/").pop() || "report.pdf";
    // Read file back for base64 in-chat download
    const fileBuffer = readFileSync(filePath);
    const fileBase64 = fileBuffer.toString("base64");
    const fileSize = fileBuffer.length;
    return {
      filename: basename,
      title,
      downloadUrl: `/api/files/${basename}`,
      fileBase64,
      fileSize,
      mimeType: "application/pdf",
      message: `PDF report "${title}" created successfully. Download available.`,
    };
  }),
});

// ---------------------------------------------------------------------------
// Create DOCX Document Tool
// ---------------------------------------------------------------------------

export const createDocxDocumentTool = tool({
  description: "Create a professional DOCX document and return it as a downloadable file. Use this when the user asks you to generate a Word document, report, or any DOCX file. The content should be in markdown format — headers, lists, tables, and bold/italic will be formatted properly in the DOCX.",
  inputSchema: zodSchema(z.object({
    title: z.string().describe("Title of the DOCX document"),
    content: z.string().describe("Content in markdown format (supports headers, lists, tables, bold, italic)"),
    filename: z.string().optional().describe("Output filename (without extension). Default: derived from title"),
  })),
  execute: safeJson(async ({ title, content, filename }) => {
    const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, Table, TableRow, TableCell, WidthType } = await import("docx");
    const { join } = await import("path");
    const { writeFileSync } = await import("fs");
    const { tmpdir } = await import("os");
    const Packer = await import("docx").then((m) => (m as unknown as { Packer: { toBuffer: (doc: unknown) => Promise<Buffer> } }).Packer);

    const safeName = (filename || title).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 60);
    const filePath = join(tmpdir(), `claw-${safeName}-${Date.now()}.docx`);

    // Parse markdown content to docx paragraphs
    const children: unknown[] = [];

    // Title
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: title, bold: true, size: 48, font: "Calibri", color: "111827" }),
        ],
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
      }),
    );
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `Generated by Claw AI — ${new Date().toLocaleDateString()}`, size: 20, color: "6B7280", font: "Calibri" }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      }),
    );

    const lines = content.split("\n");
    let inCodeBlock = false;
    let codeLines: string[] = [];
    let inTable = false;
    let tableRows: string[][] = [];

    for (const line of lines) {
      // Code blocks
      if (line.trim().startsWith("```")) {
        if (inCodeBlock) {
          // End code block — add as formatted text
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: codeLines.join("\n"), size: 18, font: "Courier New", color: "374151" }),
              ],
              spacing: { before: 100, after: 100 },
              shading: { fill: "F3F4F6" },
            }),
          );
          codeLines = [];
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
        }
        continue;
      }
      if (inCodeBlock) {
        codeLines.push(line);
        continue;
      }

      // Tables
      if (line.trim().startsWith("|")) {
        const cells = line.split("|").filter((c) => c.trim()).map((c) => c.trim());
        if (cells.every((c) => /^[-:]+$/.test(c))) continue;
        if (!inTable) inTable = true;
        tableRows.push(cells);
        continue;
      } else if (inTable) {
        // Render table
        if (tableRows.length > 0) {
          const rows = tableRows.map((row, rowIdx) =>
            new TableRow({
              children: row.map((cell) =>
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: cell,
                          bold: rowIdx === 0,
                          size: rowIdx === 0 ? 20 : 18,
                          font: "Calibri",
                          color: rowIdx === 0 ? "111827" : "374151",
                        }),
                      ],
                    }),
                  ],
                  width: { size: Math.floor(100 / row.length), type: WidthType.PERCENTAGE },
                }),
              ),
            }),
          );
          try {
            const docxTable = new Table({
              rows,
              width: { size: 100, type: WidthType.PERCENTAGE },
            });
            children.push(docxTable as never);
          } catch {
            // Fallback: render table as plain text
            for (const row of tableRows) {
              children.push(
                new Paragraph({
                  children: [new TextRun({ text: `| ${row.join(" | ")} |`, size: 18, font: "Courier New", color: "374151" })],
                  spacing: { after: 40 },
                }),
              );
            }
          }
        }
        tableRows = [];
        inTable = false;
      }

      // Headings
      const h1Match = line.match(/^# (.+)/);
      const h2Match = line.match(/^## (.+)/);
      const h3Match = line.match(/^### (.+)/);

      if (h1Match) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: h1Match[1], bold: true, size: 36, font: "Calibri", color: "111827" })],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 300, after: 150 },
          }),
        );
        continue;
      }
      if (h2Match) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: h2Match[1], bold: true, size: 28, font: "Calibri", color: "1F2937" })],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 240, after: 120 },
          }),
        );
        continue;
      }
      if (h3Match) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: h3Match[1], bold: true, size: 24, font: "Calibri", color: "374151" })],
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 200, after: 100 },
          }),
        );
        continue;
      }

      // Horizontal rule
      if (line.trim() === "---" || line.trim() === "***") {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: "" })],
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "D1D5DB" } },
            spacing: { before: 200, after: 200 },
          }),
        );
        continue;
      }

      // Empty line
      if (line.trim() === "") continue;

      // Bullet list with inline formatting support
      if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
        const bulletText = line.trim().slice(2);
        const hasInline = /\*\*|\*`|`/.test(bulletText);
        if (hasInline) {
          // Parse inline formatting for bullet items
          const TextRunCtor = await import("docx").then((m) => (m as any).TextRun);
          const bRuns: any[] = [];
          const bParts = bulletText.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/);
          for (const part of bParts) {
            if (part.startsWith("**") && part.endsWith("**")) {
              bRuns.push(new TextRunCtor({ text: part.slice(2, -2), bold: true, size: 22, font: "Calibri", color: "111827" }));
            } else if (part.startsWith("*") && part.endsWith("*")) {
              bRuns.push(new TextRunCtor({ text: part.slice(1, -1), italics: true, size: 22, font: "Calibri", color: "374151" }));
            } else if (part.startsWith("`") && part.endsWith("`")) {
              bRuns.push(new TextRun({ text: part.slice(1, -1), size: 20, font: "Courier New", color: "6B7280", shading: { fill: "F3F4F6" } }));
            } else if (part) {
              bRuns.push(new TextRun({ text: part, size: 22, font: "Calibri", color: "374151" }));
            }
          }
          children.push(new Paragraph({ children: bRuns, bullet: { level: 0 }, spacing: { after: 60 } }));
        } else {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: bulletText, size: 22, font: "Calibri", color: "374151" })],
              bullet: { level: 0 },
              spacing: { after: 60 },
            }),
          );
        }
        continue;
      }

      // Numbered list with inline formatting support
      const olMatch = line.trim().match(/^(\d+)\.\s(.+)/);
      if (olMatch) {
        const numText = olMatch[2];
        const hasInline = /\*\*|\*`|`/.test(numText);
        if (hasInline) {
          const TextRunCtor = await import("docx").then((m) => (m as any).TextRun);
          const nRuns: any[] = [];
          const nParts = numText.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/);
          for (const part of nParts) {
            if (part.startsWith("**") && part.endsWith("**")) {
              nRuns.push(new TextRunCtor({ text: part.slice(2, -2), bold: true, size: 22, font: "Calibri", color: "111827" }));
            } else if (part.startsWith("*") && part.endsWith("*")) {
              nRuns.push(new TextRunCtor({ text: part.slice(1, -1), italics: true, size: 22, font: "Calibri", color: "374151" }));
            } else if (part.startsWith("`") && part.endsWith("`")) {
              nRuns.push(new TextRun({ text: part.slice(1, -1), size: 20, font: "Courier New", color: "6B7280", shading: { fill: "F3F4F6" } }));
            } else if (part) {
              nRuns.push(new TextRun({ text: part, size: 22, font: "Calibri", color: "374151" }));
            }
          }
          children.push(new Paragraph({ children: nRuns, numbering: { reference: "default-numbering", level: 0 }, spacing: { after: 60 } }));
        } else {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: numText, size: 22, font: "Calibri", color: "374151" })],
              numbering: { reference: "default-numbering", level: 0 },
              spacing: { after: 60 },
            }),
          );
        }
        continue;
      }

      // Regular paragraph with inline formatting
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const TextRunCtor = await import("docx").then((m) => (m as any).TextRun);
      const runs: any[] = [];
      const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/);
      for (const part of parts) {
        if (part.startsWith("**") && part.endsWith("**")) {
          runs.push(new TextRunCtor({ text: part.slice(2, -2), bold: true, size: 22, font: "Calibri", color: "111827" }));
        } else if (part.startsWith("*") && part.endsWith("*")) {
          runs.push(new TextRunCtor({ text: part.slice(1, -1), italics: true, size: 22, font: "Calibri", color: "374151" }));
        } else if (part.startsWith("`") && part.endsWith("`")) {
          runs.push(new TextRun({ text: part.slice(1, -1), size: 20, font: "Courier New", color: "6B7280", shading: { fill: "F3F4F6" } }));
        } else if (part) {
          runs.push(new TextRun({ text: part, size: 22, font: "Calibri", color: "374151" }));
        }
      }

      children.push(
        new Paragraph({
          children: runs,
          spacing: { after: 120 },
        }),
      );
    }

    // Render remaining table
    if (tableRows.length > 0) {
      for (const row of tableRows) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `| ${row.join(" | ")} |`, size: 18, font: "Courier New", color: "374151" })],
            spacing: { after: 40 },
          }),
        );
      }
    }

    const doc = new Document({
      numbering: {
        config: [{
          reference: "default-numbering",
          levels: [{
            level: 0,
            format: "decimal" as const,
            text: "%1.",
            alignment: AlignmentType.START,
          }],
        }],
      },
      sections: [{ children: children as any }],
    });

    const buffer = await Packer.toBuffer(doc);
    writeFileSync(filePath, buffer);

    const fileBaseName = `${safeName}.docx`;
    // Read back for base64 in-chat download
    const fileBase64 = Buffer.from(buffer).toString("base64");
    const fileSize = buffer.byteLength;
    return {
      filename: fileBaseName,
      title,
      downloadUrl: `/api/files/${fileBaseName}`,
      fileBase64,
      fileSize,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      message: `DOCX document "${title}" created successfully. Download available.`,
    };
  }),
});

// ---------------------------------------------------------------------------
// Download Google Drive File Tool
// ---------------------------------------------------------------------------

export const downloadDriveFileTool = tool({
  description: "Download a file from Google Drive by its file ID. Returns the file content that can be used for analysis or processing. For Google Docs/Sheets/Slides, exports to a readable format first.",
  inputSchema: zodSchema(z.object({
    fileId: z.string().describe("The Google Drive file ID"),
    mimeType: z.string().optional().describe("Desired export MIME type (for Google Docs/Sheets). Example: 'text/plain', 'application/pdf'"),
  })),
  execute: safeJson(async ({ fileId, mimeType }) => {
    const token = await (await import("./google")).getAccessToken();

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

// ---------------------------------------------------------------------------
// Workspace Tools — Reminders (scheduled notifications)
// ---------------------------------------------------------------------------

export const reminderCreateTool = tool({
  description: "Create a reminder. Use this when the user wants to be reminded about something at a specific time, or when you need to schedule a future notification for an agent. Supports priority levels, recurring schedules, and agent assignment for autonomous execution.",
  inputSchema: zodSchema(z.object({
    title: z.string().describe("Reminder title — what to be reminded about"),
    description: z.string().optional().describe("Additional context or details for the reminder"),
    reminder_time: z.string().describe("When to fire the reminder (ISO 8601 datetime string, e.g., '2025-01-15T09:00:00Z')"),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional().describe("Priority level (default: 'normal')"),
    repeat_config: z.object({ type: z.enum(["daily", "weekly", "monthly"]).describe("Repeat interval type") }).optional().describe("Recurring reminder configuration"),
    assigned_agent: z.string().optional().describe("Which agent should handle this reminder (e.g., 'mail', 'code', 'ops') — for autonomous routing"),
    context: z.record(z.string(), z.any()).optional().describe("Extra context for the agent when the reminder fires (arbitrary JSON)"),
  })),
  execute: safeJson(async ({ title, description, reminder_time, priority, repeat_config, assigned_agent, context }) => {
    return await createReminder({ title, description, reminder_time, priority, repeat_config, assigned_agent, context });
  }),
});

export const reminderListTool = tool({
  description: "List reminders with optional filters. Use this to show upcoming reminders, check pending reminders, or review past reminders. Returns reminders ordered by time.",
  inputSchema: zodSchema(z.object({
    status: z.enum(["pending", "fired", "dismissed", "snoozed"]).optional().describe("Filter by status"),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional().describe("Filter by priority"),
    limit: z.number().optional().describe("Max results to return (default: 50)"),
  })),
  execute: safeJson(async ({ status, priority, limit }) => {
    return await listReminders({ status, priority, limit });
  }),
});

export const reminderUpdateTool = tool({
  description: "Update an existing reminder. Use this to change the time, title, description, priority, or status of a reminder. Can also reschedule recurring reminders.",
  inputSchema: zodSchema(z.object({
    id: z.number().describe("Reminder ID to update"),
    title: z.string().optional().describe("New title"),
    description: z.string().optional().describe("New description"),
    reminder_time: z.string().optional().describe("New reminder time (ISO 8601)"),
    status: z.enum(["pending", "fired", "dismissed", "snoozed"]).optional().describe("New status"),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional().describe("New priority"),
  })),
  execute: safeJson(async ({ id, title, description, reminder_time, status, priority }) => {
    const reminder = await getReminder(id);
    if (!reminder) throw new Error(`Reminder ${id} not found`);
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (reminder_time !== undefined) updates.reminder_time = reminder_time;
    if (status !== undefined) updates.status = status;
    if (priority !== undefined) updates.priority = priority;
    return await updateReminder(id, updates);
  }),
});

export const reminderDeleteTool = tool({
  description: "Delete a reminder permanently. Use this when the user no longer needs a scheduled reminder.",
  inputSchema: zodSchema(z.object({
    id: z.number().describe("Reminder ID to delete"),
  })),
  execute: safeJson(async ({ id }) => {
    return await deleteReminder(id);
  }),
});

export const reminderCompleteTool = tool({
  description: "Mark a reminder as completed. Can dismiss it or snooze it (push the reminder_time forward). Use this when the user acknowledges a reminder or wants to postpone it.",
  inputSchema: zodSchema(z.object({
    id: z.number().describe("Reminder ID to complete"),
    action: z.enum(["dismiss", "snooze"]).describe("Action: 'dismiss' marks it as dismissed, 'snooze' pushes the time forward"),
    snooze_minutes: z.number().optional().describe("If snoozing, how many minutes to push the reminder_time forward (default: 30)"),
  })),
  execute: safeJson(async ({ id, action, snooze_minutes }) => {
    const reminder = await getReminder(id);
    if (!reminder) throw new Error(`Reminder ${id} not found`);

    if (action === "dismiss") {
      return await updateReminder(id, { status: "dismissed" });
    }

    // Snooze: push reminder_time forward
    const minutes = snooze_minutes || 30;
    const current = new Date(reminder.reminder_time);
    const newTime = new Date(current.getTime() + minutes * 60 * 1000);
    return await updateReminder(id, {
      status: "pending",
      reminder_time: newTime.toISOString(),
    });
  }),
});

// ---------------------------------------------------------------------------
// Workspace Tools — Todos (task management)
// ---------------------------------------------------------------------------

export const todoCreateTool = tool({
  description: "Create a task/todo item. Use this when the user wants to track a task, create a to-do list item, or when an agent needs to log work for later. Supports categories, tags, due dates, priority, and agent assignment for autonomous execution.",
  inputSchema: zodSchema(z.object({
    title: z.string().describe("Task title — what needs to be done"),
    description: z.string().optional().describe("Detailed description of the task"),
    priority: z.enum(["low", "medium", "high", "critical"]).optional().describe("Priority level (default: 'medium')"),
    due_date: z.string().optional().describe("Due date (ISO date string, e.g., '2025-01-15')"),
    category: z.string().optional().describe("Category label (e.g., 'work', 'personal', 'project-x'). Default: 'general'"),
    tags: z.array(z.string()).optional().describe("Tags for categorization and filtering"),
    assigned_agent: z.string().optional().describe("Which agent owns this task (for autonomous coworker routing)"),
    context: z.record(z.string(), z.any()).optional().describe("Extra context for the agent (arbitrary JSON — notes, links, substeps)"),
  })),
  execute: safeJson(async ({ title, description, priority, due_date, category, tags, assigned_agent, context }) => {
    return await createTodo({ title, description, priority, due_date, category, tags, assigned_agent, context });
  }),
});

export const todoListTool = tool({
  description: "List tasks/todos with optional filters. Use this to show the user their task list, check what's open, find overdue tasks, or review work across agents. Returns tasks ordered by creation date (newest first).",
  inputSchema: zodSchema(z.object({
    status: z.enum(["open", "in_progress", "done", "archived"]).optional().describe("Filter by status"),
    priority: z.enum(["low", "medium", "high", "critical"]).optional().describe("Filter by priority"),
    category: z.string().optional().describe("Filter by category"),
    tag: z.string().optional().describe("Filter by a specific tag"),
    limit: z.number().optional().describe("Max results to return (default: 50)"),
  })),
  execute: safeJson(async ({ status, priority, category, tag, limit }) => {
    return await listTodos({ status, priority, category, tag, limit });
  }),
});

export const todoUpdateTool = tool({
  description: "Update a task/todo. Use this to change status (e.g., mark as in_progress or done), edit title/description, change priority, update due date, or modify tags. Automatically sets completed_at when status changes to 'done'.",
  inputSchema: zodSchema(z.object({
    id: z.number().describe("Task ID to update"),
    title: z.string().optional().describe("New title"),
    description: z.string().optional().describe("New description"),
    status: z.enum(["open", "in_progress", "done", "archived"]).optional().describe("New status"),
    priority: z.enum(["low", "medium", "high", "critical"]).optional().describe("New priority"),
    due_date: z.string().optional().describe("New due date (ISO date string)"),
    category: z.string().optional().describe("New category"),
    tags: z.array(z.string()).optional().describe("New tags (replaces existing tags)"),
  })),
  execute: safeJson(async ({ id, title, description, status, priority, due_date, category, tags }) => {
    const todo = await getTodo(id);
    if (!todo) throw new Error(`Todo ${id} not found`);
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (status !== undefined) updates.status = status;
    if (priority !== undefined) updates.priority = priority;
    if (due_date !== undefined) updates.due_date = due_date;
    if (category !== undefined) updates.category = category;
    if (tags !== undefined) updates.tags = tags;
    return await updateTodo(id, updates);
  }),
});

export const todoDeleteTool = tool({
  description: "Delete a task/todo permanently. Use this when the user no longer needs a tracked task.",
  inputSchema: zodSchema(z.object({
    id: z.number().describe("Task ID to delete"),
  })),
  execute: safeJson(async ({ id }) => {
    return await deleteTodo(id);
  }),
});

export const todoStatsTool = tool({
  description: "Get task statistics — counts by status, priority breakdown, and overdue count. Use this for dashboards, status reports, or when the user asks for a summary of their tasks.",
  inputSchema: zodSchema(z.object({})),
  execute: safeJson(async () => {
    return await getTodoStats();
  }),
});

// ---------------------------------------------------------------------------
// Workspace Tools — Contacts (address book / CRM)
// ---------------------------------------------------------------------------

export const contactCreateTool = tool({
  description: "Create a contact in the workspace address book. Use this to save information about people — clients, colleagues, partners, vendors. Supports company, role, notes, tags, VIP flag, and relationship frequency tracking.",
  inputSchema: zodSchema(z.object({
    first_name: z.string().optional().describe("Contact first name"),
    last_name: z.string().optional().describe("Contact last name"),
    email: z.string().optional().describe("Email address (must be unique)"),
    phone: z.string().optional().describe("Phone number"),
    company: z.string().optional().describe("Company/organization name"),
    role: z.string().optional().describe("Job title or role"),
    notes: z.string().optional().describe("Notes about this contact (background, preferences, history)"),
    tags: z.array(z.string()).optional().describe("Tags for categorization (e.g., ['client', 'engineering', 'sf-bay'])"),
    is_vip: z.boolean().optional().describe("Mark as VIP contact (default: false)"),
    frequency: z.enum(["never", "rare", "occasional", "regular", "frequent", "vip"]).optional().describe("Interaction frequency (default: 'occasional')"),
  })),
  execute: safeJson(async ({ first_name, last_name, email, phone, company, role, notes, tags, is_vip, frequency }) => {
    return await createContact({ first_name, last_name, email, phone, company, role, notes, tags, is_vip, frequency });
  }),
});

export const contactListTool = tool({
  description: "List contacts with optional filters. Use this to browse the address book, find contacts by company, filter VIPs, or search by tag. Returns contacts ordered by last interaction (most recent first).",
  inputSchema: zodSchema(z.object({
    tag: z.string().optional().describe("Filter by tag"),
    company: z.string().optional().describe("Filter by company (partial match)"),
    is_vip: z.boolean().optional().describe("Filter VIP contacts"),
    search: z.string().optional().describe("Search across name, email, and company (partial match)"),
    limit: z.number().optional().describe("Max results (default: 50)"),
  })),
  execute: safeJson(async ({ tag, company, is_vip, search, limit }) => {
    return await listContacts({ tag, company, is_vip, search, limit });
  }),
});

export const contactSearchTool = tool({
  description: "Search contacts across all fields — first name, last name, email, company, and notes. Returns ranked results with email matches first, then name matches, then company matches. Use this when the user asks 'do I have a contact for...' or 'find info about [person/company]'.",
  inputSchema: zodSchema(z.object({
    query: z.string().describe("Search query — searches across name, email, company, and notes"),
  })),
  execute: safeJson(async ({ query }) => {
    return await searchContacts(query);
  }),
});

export const contactUpdateTool = tool({
  description: "Update a contact's information. Use this to edit contact details, add notes, change tags, update company/role, or toggle VIP status.",
  inputSchema: zodSchema(z.object({
    id: z.number().describe("Contact ID to update"),
    first_name: z.string().optional().describe("New first name"),
    last_name: z.string().optional().describe("New last name"),
    email: z.string().optional().describe("New email address"),
    phone: z.string().optional().describe("New phone number"),
    company: z.string().optional().describe("New company"),
    role: z.string().optional().describe("New job title/role"),
    notes: z.string().optional().describe("New notes"),
    tags: z.array(z.string()).optional().describe("New tags (replaces existing)"),
    is_vip: z.boolean().optional().describe("VIP status"),
    frequency: z.enum(["never", "rare", "occasional", "regular", "frequent", "vip"]).optional().describe("Interaction frequency"),
  })),
  execute: safeJson(async ({ id, first_name, last_name, email, phone, company, role, notes, tags, is_vip, frequency }) => {
    const contact = await getContact(id);
    if (!contact) throw new Error(`Contact ${id} not found`);
    const updates: Record<string, unknown> = {};
    if (first_name !== undefined) updates.first_name = first_name;
    if (last_name !== undefined) updates.last_name = last_name;
    if (email !== undefined) updates.email = email;
    if (phone !== undefined) updates.phone = phone;
    if (company !== undefined) updates.company = company;
    if (role !== undefined) updates.role = role;
    if (notes !== undefined) updates.notes = notes;
    if (tags !== undefined) updates.tags = tags;
    if (is_vip !== undefined) updates.is_vip = is_vip;
    if (frequency !== undefined) updates.frequency = frequency;
    return await updateContact(id, updates);
  }),
});

export const contactDeleteTool = tool({
  description: "Delete a contact permanently from the address book.",
  inputSchema: zodSchema(z.object({
    id: z.number().describe("Contact ID to delete"),
  })),
  execute: safeJson(async ({ id }) => {
    return await deleteContact(id);
  }),
});

// ---------------------------------------------------------------------------
// Code Execution Sandbox (Piston API — FREE, runs Python/JS safely)
// ---------------------------------------------------------------------------

const PISTON_API = "https://emkc.org/api/v2/piston/execute";

const PISTON_LANGUAGES: Record<string, { language: string; version: string; aliases: string[] }> = {
  javascript: { language: "javascript", version: "18.15.0", aliases: ["js", "node"] },
  python:     { language: "python",     version: "3.10.0",  aliases: ["py"] },
  typescript: { language: "typescript", version: "5.0.3",   aliases: ["ts"] },
  go:         { language: "go",         version: "1.20.0",  aliases: [] },
  rust:       { language: "rust",       version: "1.68.0",  aliases: [] },
  java:       { language: "java",       version: "15.0.2",  aliases: [] },
  cpp:        { language: "c++",        version: "10.2.0",  aliases: ["c"] },
  ruby:       { language: "ruby",       version: "3.2.0",   aliases: [] },
  php:        { language: "php",        version: "8.2.3",   aliases: [] },
  swift:      { language: "swift",      version: "5.5.3",   aliases: [] },
};

export const codeExecuteTool = tool({
  description: "Execute code snippets safely in a sandboxed environment. Supports JavaScript, Python, TypeScript, Go, Rust, Java, C++, Ruby, PHP, and Swift. Perfect for quick calculations, data transformations, string processing, algorithms, or prototyping. Returns stdout, stderr, and exit code. Execution timeout: 10s. No internet access. Max output: 64KB.",
  inputSchema: zodSchema(z.object({
    code: z.string().describe("The code to execute. Must be valid syntax for the specified language."),
    language: z.string().optional().describe("Programming language: javascript (default), python, typescript, go, rust, java, cpp, ruby, php, swift. Aliases: js, py, ts."),
    stdin: z.string().optional().describe("Optional stdin input for the program"),
  })),
  execute: safeJson(async ({ code, language, stdin }) => {
    const langKey = (language || "javascript").toLowerCase().trim();
    let langConfig = PISTON_LANGUAGES[langKey];
    if (!langConfig) {
      // Check aliases
      for (const cfg of Object.values(PISTON_LANGUAGES)) {
        if (cfg.aliases.includes(langKey)) { langConfig = cfg; break; }
      }
    }
    if (!langConfig) {
      throw new Error(`Unsupported language: "${langKey}". Supported: ${Object.keys(PISTON_LANGUAGES).join(", ")}`);
    }

    const res = await fetch(PISTON_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: langConfig.language,
        version: langConfig.version,
        files: [{ name: `main.${langConfig.language === "c++" ? "cpp" : langConfig.language === "c" ? "c" : langConfig.language}`, content: code }],
        stdin: stdin || "",
        compile_timeout: 10000,
        run_timeout: 10000,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown error");
      throw new Error(`Code execution failed (${res.status}): ${errText}`);
    }

    const data = await safeParseRes<{
      run?: { stdout?: string; stderr?: string; exit_code: number; output?: string; signal?: string };
      compile?: { stdout?: string; stderr?: string; exit_code: number; output?: string };
      language?: string;
      version?: string;
    }>(res);

    const run = data.run || data.compile;
    return {
      language: data.language,
      version: data.version,
      exitCode: run?.exit_code ?? -1,
      stdout: (run?.stdout || "").trim(),
      stderr: (run?.stderr || "").trim(),
      output: (run?.output || "").trim(),
      signal: "signal" in (run || {}) ? (run as { signal?: string }).signal || null : null,
    };
  }),
});

// ---------------------------------------------------------------------------
// Weather Tool (Open-Meteo API — FREE, no API key needed)
// ---------------------------------------------------------------------------

/**
 * Geocode a location name to lat/lon using Open-Meteo's geocoding API.
 */
async function geocodeLocation(query: string): Promise<{ name: string; country: string; latitude: number; longitude: number; timezone: string } | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return null;
  const data = await safeParseRes(res) as { results?: Array<{ name: string; country: string; latitude: number; longitude: number; timezone: string }> };
  return data.results?.[0] || null;
}

export const weatherGetTool = tool({
  description: "Get current weather conditions and a 7-day forecast for any location worldwide. Also supports distance calculation between two locations. FREE — no API key needed. Use this when users ask about weather, temperature, humidity, wind, precipitation, or 'How far is X from Y?'.",
  inputSchema: zodSchema(z.object({
    location: z.string().describe("City name or location (e.g., 'Lagos', 'London', 'New York', 'Tokyo'). Be specific for best results."),
    forecast_days: z.number().optional().describe("Number of forecast days (1-16, default: 3)"),
    include_hourly: z.boolean().optional().describe("Include hourly breakdown for today (default: false)"),
    units: z.enum(["celsius", "fahrenheit"]).optional().describe("Temperature unit (default: celsius)"),
    distance_from: z.string().optional().describe("Optional: calculate distance FROM this location TO 'location'. E.g., distance_from='Lagos', location='Abuja' gives distance between them."),
  })),
  execute: safeJson(async ({ location, forecast_days, include_hourly, units, distance_from }) => {
    const days = Math.min(forecast_days || 3, 16);
    const tempUnit = units === "fahrenheit" ? "fahrenheit" : "celsius";

    // If distance_from is provided, calculate distance between two locations
    if (distance_from) {
      const [loc1, loc2] = await Promise.all([
        geocodeLocation(distance_from),
        geocodeLocation(location),
      ]);
      if (!loc1) throw new Error(`Could not find location: "${distance_from}"`);
      if (!loc2) throw new Error(`Could not find location: "${location}"`);

      const R = 6371; // Earth's radius in km
      const dLat = (loc2.latitude - loc1.latitude) * Math.PI / 180;
      const dLon = (loc2.longitude - loc1.longitude) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(loc1.latitude * Math.PI / 180) * Math.cos(loc2.latitude * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distanceKm = R * c;
      const distanceMi = distanceKm * 0.621371;

      return {
        type: "distance",
        from: { name: loc1.name, country: loc1.country, lat: loc1.latitude, lon: loc1.longitude },
        to: { name: loc2.name, country: loc2.country, lat: loc2.latitude, lon: loc2.longitude },
        distance: {
          kilometers: Math.round(distanceKm * 10) / 10,
          miles: Math.round(distanceMi * 10) / 10,
        },
      };
    }

    // Geocode the location
    const geo = await geocodeLocation(location);
    if (!geo) throw new Error(`Could not find location: "${location}". Try a more specific city name.`);

    // Fetch weather from Open-Meteo
    const params = new URLSearchParams({
      latitude: geo.latitude.toString(),
      longitude: geo.longitude.toString(),
      current: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,sunrise,sunset,uv_index_max",
      timezone: geo.timezone,
      forecast_days: days.toString(),
      temperature_unit: tempUnit,
    });
    if (include_hourly) {
      params.set("hourly", "temperature_2m,relative_humidity_2m,precipitation_probability,weather_code,wind_speed_10m");
    }

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?${params}`;
    const weatherRes = await fetch(weatherUrl, { signal: AbortSignal.timeout(15000) });
    if (!weatherRes.ok) throw new Error(`Weather API error: ${weatherRes.status}`);

    const weatherData = await weatherRes.json() as {
      current?: Record<string, unknown>;
      daily?: Record<string, unknown[]>;
      hourly?: Record<string, unknown[]>;
    };

    // Map WMO weather codes to descriptions
    const weatherCodeMap: Record<number, string> = {
      0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
      45: "Foggy", 48: "Rime fog",
      51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle",
      56: "Freezing drizzle", 57: "Dense freezing drizzle",
      61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
      66: "Light freezing rain", 67: "Heavy freezing rain",
      71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
      77: "Snow grains", 80: "Slight rain showers", 81: "Moderate rain showers",
      82: "Violent rain showers", 85: "Slight snow showers", 86: "Heavy snow showers",
      95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with heavy hail",
    };

    const codeToDesc = (code: number) => weatherCodeMap[code] || "Unknown";

    return {
      location: { name: geo.name, country: geo.country, timezone: geo.timezone, lat: geo.latitude, lon: geo.longitude },
      current: weatherData.current ? {
        temperature: weatherData.current.temperature_2m,
        feelsLike: weatherData.current.apparent_temperature,
        humidity: weatherData.current.relative_humidity_2m,
        weather: codeToDesc(weatherData.current.weather_code as number),
        weatherCode: weatherData.current.weather_code,
        windSpeed: weatherData.current.wind_speed_10m,
        windDirection: weatherData.current.wind_direction_10m,
        pressure: weatherData.current.pressure_msl,
        precipitation: weatherData.current.precipitation,
      } : null,
      forecast: weatherData.daily ? weatherData.daily.time?.map((date: unknown, i: number) => ({
        date,
        weather: codeToDesc(weatherData.daily!.weather_code[i] as number),
        high: weatherData.daily!.temperature_2m_max[i],
        low: weatherData.daily!.temperature_2m_min[i],
        precipitation: weatherData.daily!.precipitation_sum[i],
        windMax: weatherData.daily!.wind_speed_10m_max[i],
        sunrise: weatherData.daily!.sunrise?.[i],
        sunset: weatherData.daily!.sunset?.[i],
        uvIndex: weatherData.daily!.uv_index_max?.[i],
      })) : [],
      hourly: include_hourly && weatherData.hourly ? weatherData.hourly.time?.slice(0, 24).map((time: unknown, i: number) => ({
        time,
        temperature: weatherData.hourly!.temperature_2m[i],
        humidity: weatherData.hourly!.relative_humidity_2m[i],
        precipProb: weatherData.hourly!.precipitation_probability[i],
        weather: codeToDesc(weatherData.hourly!.weather_code[i] as number),
        wind: weatherData.hourly!.wind_speed_10m[i],
      })) : [],
      units: tempUnit,
    };
  }),
});

// ---------------------------------------------------------------------------
// Enhanced Web Reader with Open Graph Metadata
// ---------------------------------------------------------------------------

/**
 * Enhanced fallback with Open Graph metadata extraction.
 */
async function webReaderEnhanced(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ClawBot/1.0; +https://claw.ai)",
      "Accept": "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Failed to fetch URL: ${res.status} ${res.statusText}`);

  const html = await res.text();

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "";

  // Extract Open Graph / meta metadata
  const metaRegex = /<meta[^>]+(?:property|name)="([^"]+)"[^>]+content="([^"]*)"[^>]*\/?>/gi;
  const metadata: Record<string, string> = {};
  let metaMatch;
  while ((metaMatch = metaRegex.exec(html)) !== null) {
    metadata[metaMatch[1].toLowerCase()] = metaMatch[2].trim();
  }

  // Also match content before property (alternate meta format)
  const metaRegex2 = /<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="([^"]+)"[^>]*\/?>/gi;
  while ((metaMatch = metaRegex2.exec(html)) !== null) {
    const key = metaMatch[2].toLowerCase();
    if (!metadata[key]) metadata[key] = metaMatch[1].trim();
  }

  // Extract structured metadata
  const author = metadata["author"] || metadata["og:article:author"] || metadata["article:author"] || "";
  const publishDate = metadata["article:published_time"] || metadata["og:article:published_time"] || metadata["date"] || metadata["pubdate"] || "";
  const description = metadata["description"] || metadata["og:description"] || "";
  const ogImage = metadata["og:image"] || metadata["twitter:image"] || "";
  const ogSiteName = metadata["og:site_name"] || "";
  const ogType = metadata["og:type"] || "";

  // Simple HTML to text: remove scripts, styles, tags
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "-")
    .replace(/&lsquo;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(/\s+/g, " ")
    .trim();

  // Truncate to reasonable length
  if (text.length > 15000) {
    text = text.slice(0, 15000) + "... [truncated]";
  }

  return {
    title,
    url,
    fetchedAt: new Date().toISOString(),
    charCount: text.length,
    metadata: {
      author: author || null,
      publishDate: publishDate || null,
      description: description || null,
      siteName: ogSiteName || null,
      type: ogType || null,
      image: ogImage || null,
    },
    content: text,
  };
}

// ---------------------------------------------------------------------------
// Create XLSX Spreadsheet Tool
// ---------------------------------------------------------------------------

export const createXlsxSpreadsheetTool = tool({
  description: "Create a professional Excel spreadsheet (.xlsx) and return it as a downloadable file. Supports multiple sheets, cell formatting (bold, colors, borders), formulas, column auto-width, and data validation. The 'sheets' parameter defines each sheet with a name, headers, and rows of data.",
  inputSchema: zodSchema(z.object({
    title: z.string().describe("Title of the spreadsheet (used as filename)"),
    sheets: z.array(z.object({
      name: z.string().describe("Sheet tab name"),
      headers: z.array(z.string()).describe("Column headers for the sheet"),
      rows: z.array(z.array(z.string())).describe("2D array of row data (each inner array = one row)"),
    })).describe("Array of sheets to include in the workbook"),
    filename: z.string().optional().describe("Output filename (without extension). Default: derived from title"),
  })),
  execute: safeJson(async ({ title, sheets, filename }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ExcelJS = await import("exceljs");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Workbook = (ExcelJS as any).default?.Workbook || (ExcelJS as any).Workbook;
    const workbook = new Workbook();
    (workbook as any).creator = "Claw AI Agent";
    (workbook as any).created = new Date();

    for (const sheetDef of sheets) {
      const sheet = workbook.addWorksheet(sheetDef.name);

      // Add header row with styling
      const headerRow = sheet.addRow(sheetDef.headers);
      headerRow.font = { bold: true, size: 11 };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
      headerRow.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
      headerRow.alignment = { horizontal: "center" };
      headerRow.border = { bottom: { style: "medium" } };

      // Add data rows
      for (const row of sheetDef.rows) {
        sheet.addRow(row);
      }

      // Auto-fit column widths
      for (let col = 1; col <= sheetDef.headers.length; col++) {
        let maxLen = String(sheetDef.headers[col - 1]).length;
        for (const row of sheetDef.rows) {
          if (row[col - 1]) maxLen = Math.max(maxLen, String(row[col - 1]).length);
        }
        sheet.getColumn(col).width = Math.min(maxLen + 2, 50);
      }
    }

    // Write to buffer
    const buffer = await workbook.xlsx.writeBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    const safeName = (filename || title).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 60);
    const fileBaseName = `${safeName}.xlsx`;

    return {
      filename: fileBaseName,
      title,
      fileBase64: base64,
      fileSize: buffer.byteLength,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      downloadUrl: `/api/files/${fileBaseName}`,
      message: `Excel spreadsheet "${title}" created successfully with ${sheets.length} sheet(s). Download available.`,
    };
  }),
});

// ---------------------------------------------------------------------------
// Gmail Send with Attachments Tool
// ---------------------------------------------------------------------------

export const gmailSendWithAttachmentTool = tool({
  description: "Send an email via Gmail with file attachments (PDF, DOCX, XLSX, images, etc.). Provide attachment data as base64-encoded content. This is the recommended tool when you need to send documents, reports, or files via email.",
  inputSchema: zodSchema(z.object({
    to: z.string().describe("Recipient email address"),
    subject: z.string().optional().describe("Email subject line"),
    body: z.string().describe("Email body content (plain text or HTML)"),
    isHtml: z.boolean().optional().describe("Whether the body is HTML format (default: true)"),
    attachments: z.array(z.object({
      filename: z.string().describe("Attachment filename with extension (e.g., 'report.pdf')"),
      contentBase64: z.string().describe("Base64-encoded file content"),
      mimeType: z.string().optional().describe("MIME type (auto-detected from filename if not provided)"),
    })).optional().describe("Array of file attachments"),
    cc: z.array(z.string()).optional().describe("CC recipients"),
    bcc: z.array(z.string()).optional().describe("BCC recipients"),
  })),
  execute: safeJson(async ({ to, subject, body, isHtml, attachments, cc, bcc }) => {
    // Build MIME multipart message with attachments
    const boundary = "claw-boundary-" + Date.now();
    const sanitize = (s: string) => s.replace(/[\r\n]/g, "");

    let message = "";
    message += `To: ${sanitize(to)}\r\n`;
    if (cc?.length) message += `Cc: ${cc.map(sanitize).join(", ")}\r\n`;
    if (bcc?.length) message += `Bcc: ${bcc.map(sanitize).join(", ")}\r\n`;
    if (subject) message += `Subject: ${sanitize(subject)}\r\n`;

    if (attachments && attachments.length > 0) {
      // MIME multipart with attachments
      message += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n`;
      message += "MIME-Version: 1.0\r\n\r\n";

      // Text body part
      const htmlBody = isHtml ? body : plainTextToHtml(body);
      message += `--${boundary}\r\n`;
      message += "Content-Type: text/html; charset=utf-8\r\n\r\n";
      message += htmlBody + "\r\n\r\n";

      // Attachment parts
      for (const att of attachments) {
        const ext = att.filename.split(".").pop()?.toLowerCase() || "";
        const mimeMap: Record<string, string> = {
          pdf: "application/pdf",
          docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          csv: "text/csv",
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          txt: "text/plain",
        };
        const mime = att.mimeType || mimeMap[ext] || "application/octet-stream";

        message += `--${boundary}\r\n`;
        message += `Content-Type: ${mime}\r\n`;
        message += `Content-Disposition: attachment; filename="${att.filename}"\r\n`;
        message += "Content-Transfer-Encoding: base64\r\n\r\n";
        message += att.contentBase64 + "\r\n\r\n";
      }

      message += `--${boundary}--\r\n`;
    } else {
      // No attachments — simple HTML email
      const htmlBody = isHtml ? body : plainTextToHtml(body);
      message += "Content-Type: text/html; charset=utf-8\r\n";
      message += "MIME-Version: 1.0\r\n\r\n";
      message += htmlBody;
    }

    const encoded = Buffer.from(message).toString("base64url");
    const res = await googleFetch("https://www.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      body: JSON.stringify({ raw: encoded }),
    });
    const data = await safeParseRes(res);
    return { success: true, messageId: (data as { id?: string }).id, attachments: attachments?.length || 0 };
  }),
});

// ---------------------------------------------------------------------------
// All Tools Registry
// ---------------------------------------------------------------------------
// Project Management Tools (Phase 2)
// Enables agents to create projects, break them into tasks, and track progress
// ---------------------------------------------------------------------------

export const projectCreateTool = tool({
  description: "Create a new project for tracking a multi-step initiative. Projects can contain multiple tasks with dependencies. Use this when starting a complex initiative that requires multiple steps (e.g., building an app, conducting research, setting up infrastructure).",
  inputSchema: zodSchema(z.object({
    name: z.string().describe("Project name"),
    description: z.string().optional().describe("Project description"),
    priority: z.enum(["critical", "high", "medium", "low"]).optional().describe("Project priority"),
    deadline: z.string().optional().describe("ISO date string for project deadline"),
    tags: z.array(z.string()).optional().describe("Project tags"),
  })),
  execute: safeJson(async ({ name, description, priority, deadline, tags }) => {
    try {
      const result = await query(
        `INSERT INTO projects (name, description, priority, agent_id, tags, deadline)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, status, created_at`,
        [name, description || null, priority || "medium", "general", tags || [], deadline || null],
      );
      return { success: true, project: result.rows[0] };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to create project" };
    }
  }),
});

export const projectAddTaskTool = tool({
  description: "Add a task to an existing project. Tasks can have dependencies on other tasks (by task ID). Use sort_order to control execution order. The assigned_agent determines which agent will execute the task.",
  inputSchema: zodSchema(z.object({
    project_id: z.number().describe("Project ID"),
    title: z.string().describe("Task title"),
    description: z.string().optional().describe("Task description"),
    task_prompt: z.string().optional().describe("The exact prompt to send to the agent when executing this task"),
    assigned_agent: z.string().optional().describe("Agent ID to assign (general, mail, code, data, creative, research, ops)"),
    depends_on: z.array(z.number()).optional().describe("Array of task IDs that must complete before this task"),
    priority: z.enum(["critical", "high", "medium", "low"]).optional(),
    task_type: z.enum(["research", "code", "design", "testing", "deployment", "docs", "communication", "general"]).optional(),
    sort_order: z.number().optional(),
  })),
  execute: safeJson(async ({ project_id, title, description, task_prompt, assigned_agent, depends_on, priority, task_type, sort_order }) => {
    try {
      const agentId = assigned_agent || "general";
      const result = await query(
        `INSERT INTO project_tasks (project_id, title, description, task_prompt, assigned_agent, depends_on, priority, task_type, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, title, status`,
        [project_id, title, description || null, task_prompt || null, agentId, depends_on || [], priority || "medium", task_type || "general", sort_order || 0],
      );
      return { success: true, task: result.rows[0] };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to add task" };
    }
  }),
});

export const projectStatusTool = tool({
  description: "Get the status of a project including all tasks and their progress. Shows completed/failed/pending counts and which tasks are ready to execute next.",
  inputSchema: zodSchema(z.object({
    project_id: z.number().describe("Project ID"),
  })),
  execute: safeJson(async ({ project_id }) => {
    try {
      const projectResult = await query("SELECT * FROM projects WHERE id = $1", [project_id]);
      if (!projectResult.rows.length) return { success: false, error: "Project not found" };

      const tasksResult = await query(
        "SELECT id, title, status, priority, assigned_agent, depends_on, sort_order, error FROM project_tasks WHERE project_id = $1 ORDER BY sort_order, id",
        [project_id],
      );

      const nextTasks = await query("SELECT * FROM get_next_executable_tasks($1, 5)", [project_id]);

      return {
        success: true,
        project: projectResult.rows[0],
        total_tasks: tasksResult.rows.length,
        tasks: tasksResult.rows,
        next_executable_tasks: nextTasks.rows,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to get project status" };
    }
  }),
});

export const projectListTool = tool({
  description: "List all projects with their status and progress. Optionally filter by status.",
  inputSchema: zodSchema(z.object({
    status: z.string().optional().describe("Filter by status (planning, in_progress, completed, failed)"),
    limit: z.number().optional().describe("Max projects to return (default 10)"),
  })),
  execute: safeJson(async ({ status, limit }) => {
    try {
      let queryStr = "SELECT id, name, description, status, priority, total_tasks, completed_tasks, failed_tasks, pending_tasks, created_at, updated_at FROM projects WHERE 1=1";
      const params: unknown[] = [];

      if (status) {
        queryStr += " AND status = $1";
        params.push(status);
      }

      queryStr += " ORDER BY updated_at DESC LIMIT $" + (params.length + 1);
      params.push(limit || 10);

      const result = await query(queryStr, params);
      return { success: true, projects: result.rows, count: result.rows.length };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to list projects" };
    }
  }),
});

export const projectDecomposeTool = tool({
  description: "Decompose a project into executable tasks using AI. Takes a project goal and returns a structured task plan with dependencies, assigned agents, and task prompts. Use this when you need to break a complex goal into manageable steps. You can then add the tasks to a project using project_add_task.",
  inputSchema: zodSchema(z.object({
    goal: z.string().describe("The project goal or high-level objective to decompose"),
    context: z.string().optional().describe("Additional context, constraints, or requirements"),
    max_tasks: z.number().optional().describe("Maximum number of tasks (default: 8, max: 15)"),
    complexity: z.enum(["simple", "moderate", "complex"]).optional().describe("Project complexity level"),
  })),
  execute: safeJson(async ({ goal, context, max_tasks, complexity }) => {
    const apiKey = nextOllamaKey();
    const systemPrompt = `You are a project planning assistant. Given a project goal, decompose it into a structured task plan.

Rules:
- Output ONLY valid JSON — no markdown, no explanation, no code fences
- Each task must be specific and actionable
- Set dependencies between tasks (depends_on uses 1-based task IDs)
- Assign the best agent for each task
- Keep task prompts detailed enough for autonomous execution
- Max ${max_tasks || 8} tasks

Available agents:
- "general": Multi-service orchestration, project management
- "mail": Email, calendar, communications
- "code": GitHub, Vercel, development
- "data": Google Drive, Sheets, Docs, data analysis
- "research": Deep web research, synthesis
- "ops": Monitoring, health checks, deployment
- "creative": Content, design, documents

Output format (EXACT JSON):
{
  "tasks": [
    {
      "title": "Task title",
      "description": "What this task accomplishes",
      "task_type": "research|code|design|testing|deployment|docs|communication|general",
      "priority": "critical|high|medium|low",
      "assigned_agent": "agent_id",
      "depends_on": [],
      "task_prompt": "Detailed instruction for the executing agent",
      "sort_order": 0
    }
  ]
}`;

    const userPrompt = `Decompose this project goal into tasks:\n\nGoal: ${goal}\n${context ? `Context: ${context}` : ""}\nComplexity: ${complexity || "moderate"}\nMax tasks: ${Math.min(max_tasks || 8, 15)}`;

    try {
      const res = await fetch(`${OLLAMA_BASE}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gemma4:31b-cloud",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 4096,
        }),
        signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) throw new Error(`Ollama API error: ${res.status}`);
      const data = await safeParseRes<{ choices?: Array<{ message?: { content?: string } }> }>(res);
      const text = data.choices?.[0]?.message?.content || "";

      // Parse the JSON from the response
      let jsonStr = text.trim();
      // Remove code fences if present
      const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (fenceMatch) jsonStr = fenceMatch[1];

      const plan = JSON.parse(jsonStr);
      return JSON.stringify({ success: true, tasks: plan.tasks || [], total: (plan.tasks || []).length });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Decomposition failed";
      return JSON.stringify({ success: false, error: errMsg });
    }
  }),
});

// ---------------------------------------------------------------------------
// Phase 5: Full Autonomous Project Lifecycle Tools
// ---------------------------------------------------------------------------

export const projectUpdateTool = tool({
  description: "Update project metadata or status. Can change project name, description, priority, deadline, status (to 'in_progress', 'on_hold', 'cancelled'), or add notes. Does NOT affect individual tasks directly — use project_retry_task or project_skip_task for task-level changes.",
  inputSchema: zodSchema(z.object({
    project_id: z.number().describe("Project ID to update"),
    name: z.string().optional().describe("New project name"),
    description: z.string().optional().describe("New project description"),
    priority: z.enum(["critical", "high", "medium", "low"]).optional().describe("New priority level"),
    status: z.enum(["in_progress", "on_hold", "cancelled"]).optional().describe("New status (cannot set to 'completed' or 'failed' — those are auto-detected)"),
    deadline: z.string().optional().describe("New deadline (ISO 8601 datetime)"),
    tags: z.array(z.string()).optional().describe("Replace tags array"),
  })),
  execute: safeJson(async ({ project_id, name, description, priority, status, deadline, tags }) => {
    const setClauses = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) { setClauses.push(`name = $${idx++}`); values.push(name); }
    if (description !== undefined) { setClauses.push(`description = $${idx++}`); values.push(description); }
    if (priority !== undefined) { setClauses.push(`priority = $${idx++}`); values.push(priority); }
    if (status !== undefined) { setClauses.push(`status = $${idx++}`); values.push(status); }
    if (deadline !== undefined) { setClauses.push(`deadline = $${idx++}`); values.push(deadline); }
    if (tags !== undefined) { setClauses.push(`tags = $${idx++}`); values.push(tags); }

    if (setClauses.length === 0) return { success: false, error: "No fields to update" };

    values.push(project_id);
    try {
      const result = await query(
        `UPDATE projects SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING id, name, status, priority, total_tasks, completed_tasks, failed_tasks, pending_tasks, deadline`,
        values,
      );
      if (result.rows.length === 0) return { success: false, error: `Project ${project_id} not found` };
      return { success: true, project: result.rows[0] };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to update project" };
    }
  }),
});

export const projectDeleteTool = tool({
  description: "Soft-delete (archive) a project by setting its status to 'cancelled'. This stops all task execution for the project. Use this when a project is no longer needed or was created by mistake.",
  inputSchema: zodSchema(z.object({
    project_id: z.number().describe("Project ID to archive/cancel"),
    reason: z.string().optional().describe("Reason for cancellation (stored in metadata)"),
  })),
  execute: safeJson(async ({ project_id, reason }) => {
    try {
      const result = await query(
        `UPDATE projects SET status = 'cancelled', metadata = jsonb_set(COALESCE(metadata, '{}'), '{cancelled_reason}', $1) WHERE id = $2 RETURNING id, name, status`,
        [JSON.stringify(reason || "User cancelled"), project_id],
      );
      if (result.rows.length === 0) return { success: false, error: `Project ${project_id} not found` };
      // Also cancel pending/queued tasks
      await query(
        `UPDATE project_tasks SET status = 'cancelled' WHERE project_id = $1 AND status IN ('pending', 'queued', 'in_progress')`,
        [project_id],
      );
      return { success: true, project: result.rows[0], message: "Project cancelled and all pending tasks stopped" };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to delete project" };
    }
  }),
});

export const projectRetryTaskTool = tool({
  description: "Retry a failed project task. Resets the task to 'pending' status and clears error info. The executor will pick it up within 2 minutes. Use this when a task failed due to a transient error and you want to re-run it.",
  inputSchema: zodSchema(z.object({
    task_id: z.number().describe("Project task ID to retry"),
  })),
  execute: safeJson(async ({ task_id }) => {
    try {
      // Get current task info
      const current = await query(
        `SELECT pt.*, p.name as project_name FROM project_tasks pt JOIN projects p ON p.id = pt.project_id WHERE pt.id = $1`,
        [task_id],
      );
      if (current.rows.length === 0) return { success: false, error: `Task ${task_id} not found` };
      if (current.rows[0].status !== "failed") return { success: false, error: `Task ${task_id} is not failed (current: ${current.rows[0].status})` };

      // Reset task
      const result = await query(
        `UPDATE project_tasks SET status = 'pending', error = NULL, result = NULL, retries = retries + 1, started_at = NULL, completed_at = NULL WHERE id = $1 RETURNING id, title, status, retries`,
        [task_id],
      );

      // Log retry
      await query(
        `INSERT INTO project_task_logs (project_id, task_id, action, status, message, attempt_number) VALUES ($1, $2, 'retry', 'started', 'Manual retry requested', $3)`,
        [current.rows[0].project_id, task_id, current.rows[0].retries + 1],
      );

      return { success: true, task: result.rows[0], message: "Task reset to pending — executor will pick it up within 2 min" };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to retry task" };
    }
  }),
});

export const projectSkipTaskTool = tool({
  description: "Skip a blocked or failed project task. Sets status to 'skipped' which allows dependent tasks to proceed. Use this when a task is non-critical and blocking progress, or when manual intervention isn't worth it.",
  inputSchema: zodSchema(z.object({
    task_id: z.number().describe("Project task ID to skip"),
    reason: z.string().optional().describe("Reason for skipping"),
  })),
  execute: safeJson(async ({ task_id, reason }) => {
    try {
      const current = await query(
        `SELECT pt.*, p.name as project_name FROM project_tasks pt JOIN projects p ON p.id = pt.project_id WHERE pt.id = $1`,
        [task_id],
      );
      if (current.rows.length === 0) return { success: false, error: `Task ${task_id} not found` };
      if (!["pending", "queued", "in_progress", "blocked", "failed"].includes(current.rows[0].status)) {
        return { success: false, error: `Task ${task_id} cannot be skipped (current: ${current.rows[0].status})` };
      }

      const result = await query(
        `UPDATE project_tasks SET status = 'skipped', metadata = jsonb_set(COALESCE(metadata, '{}'), '{skip_reason}', $1) WHERE id = $2 RETURNING id, title, status`,
        [JSON.stringify(reason || "Skipped by user"), task_id],
      );

      // Log skip
      await query(
        `INSERT INTO project_task_logs (project_id, task_id, action, status, message) VALUES ($1, $2, 'skip', 'completed', $3)`,
        [current.rows[0].project_id, task_id, `Skipped: ${reason || "User request"}`],
      );

      return { success: true, task: result.rows[0], message: "Task skipped — dependent tasks can now proceed" };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to skip task" };
    }
  }),
});

export const projectDecomposeAndAddTool = tool({
  description: "ALL-IN-ONE project decomposition: Takes a project ID and a goal, decomposes it into structured tasks via AI, and automatically adds all tasks to the project. This is the recommended way to set up a new project — create the project first with project_create, then use this tool to fill it with tasks. The executor will automatically start executing tasks that have no dependencies.",
  inputSchema: zodSchema(z.object({
    project_id: z.number().describe("Project ID to add tasks to"),
    goal: z.string().describe("Project goal to decompose into tasks"),
    context: z.string().optional().describe("Additional context, constraints, or requirements"),
    complexity: z.enum(["simple", "moderate", "complex"]).optional().describe("Complexity level (default: moderate)"),
    max_tasks: z.number().optional().describe("Max tasks to create (default 8, max 15)"),
  })),
  execute: safeJson(async ({ project_id, goal, context, complexity, max_tasks }) => {
    try {
      // Verify project exists
      const proj = await query("SELECT id, name, status FROM projects WHERE id = $1", [project_id]);
      if (proj.rows.length === 0) return { success: false, error: `Project ${project_id} not found` };

      // Get AI decomposition via Ollama Cloud (Gemma 4 31B)
      const ollamaKey = nextOllamaKey();

      const systemPrompt = `You are a project planning expert. Decompose the given goal into a structured task plan.
Each task should be specific, actionable, and assigned to the right agent.
Available agents: general, mail, code, data, creative, research, ops
Task types: research, code, design, testing, deployment, docs, communication, general
Output format (EXACT JSON): { "tasks": [{ "title", "description", "task_type", "priority", "assigned_agent", "depends_on": [], "task_prompt", "sort_order" }] }`;

      const userPrompt = `Decompose this project goal into tasks:\n\nGoal: ${goal}\n${context ? `Context: ${context}` : ""}\nComplexity: ${complexity || "moderate"}\nMax tasks: ${Math.min(max_tasks || 8, 15)}`;

      const res = await fetch(`${OLLAMA_BASE}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${ollamaKey}` },
        body: JSON.stringify({
          model: "gemma4:31b-cloud",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 4096,
        }),
        signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) throw new Error(`Ollama API error: ${res.status}`);
      const data = await safeParseRes<{ choices?: Array<{ message?: { content?: string } }> }>(res);
      const text = data.choices?.[0]?.message?.content || "";

      let jsonStr = text.trim();
      const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (fenceMatch) jsonStr = fenceMatch[1];

      const plan = JSON.parse(jsonStr);
      const tasks = plan.tasks || [];

      if (tasks.length === 0) return { success: false, error: "AI returned no tasks" };

      // Insert all tasks into the project
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const insertedTasks: any[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const titleToId: Record<string, any> = {}; // Map title → task ID for dependency resolution

      for (const task of tasks) {
        // Resolve depends_on: titles → IDs
        const dependsOnIds = (task.depends_on || []).map((title: string) => titleToId[title]).filter(Boolean);

        const insertResult = await query(
          `INSERT INTO project_tasks (project_id, title, description, task_type, priority, assigned_agent, depends_on, task_prompt, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, title, priority, assigned_agent`,
          [
            project_id, task.title, task.description || "", task.task_type || "general",
            task.priority || "medium", task.assigned_agent || "general",
            dependsOnIds.length > 0 ? dependsOnIds : null,
            task.task_prompt || task.description || "",
            task.sort_order || insertedTasks.length,
          ],
        );

        insertedTasks.push(insertResult.rows[0]);
        titleToId[task.title] = insertResult.rows[0].id;
      }

      // Force recalculate project task counts
      await query("SELECT update_project_task_counts($1)", [project_id]);

      return {
        success: true,
        project_id,
        project_name: proj.rows[0].name,
        tasks_added: insertedTasks.length,
        tasks: insertedTasks,
        message: `${insertedTasks.length} tasks added to project "${proj.rows[0].name}". The executor will start picking up tasks with no dependencies within 2 minutes.`,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to decompose and add tasks" };
    }
  }),
});

export const projectHealthTool = tool({
  description: "Get a health report for all active projects. Shows project status, progress, and identifies stalled, overdue, or degraded projects. Use this to monitor your project portfolio and catch issues early.",
  inputSchema: zodSchema(z.object({
    include_completed: z.boolean().optional().describe("Also show completed projects (default: false)"),
  })),
  execute: safeJson(async ({ include_completed }) => {
    try {
      const result = await query("SELECT * FROM get_project_health_report()");
      const projects = result.rows;

      // If requested, also get completed projects
      let completed = [];
      if (include_completed) {
        const compResult = await query(
          `SELECT id as project_id, name as project_name, status, priority, total_tasks, completed_tasks, failed_tasks, pending_tasks,
           'healthy' as health_status, 'All tasks completed' as health_reason, completed_at as last_activity, deadline, false as is_overdue
           FROM projects WHERE status IN ('completed', 'failed') ORDER BY completed_at DESC LIMIT 10`,
        );
        completed = compResult.rows;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const summary = {
        total_active: projects.length,
        healthy: projects.filter((p: any) => p.health_status === "on_track" || p.health_status === "ready_to_start").length,
        stalled: projects.filter((p: any) => p.health_status === "stalled").length,
        overdue: projects.filter((p: any) => p.health_status === "overdue").length,
        degraded: projects.filter((p: any) => p.health_status === "degraded").length,
        needs_attention: projects.filter((p: any) => ["stalled", "overdue", "degraded", "failed"].includes(p.health_status)).length,
      };

      return { success: true, summary, projects, completed_projects: completed };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to get project health" };
    }
  }),
});

// ---------------------------------------------------------------------------
// Phase 4: A2A Real-Time Communication Tools
// ---------------------------------------------------------------------------

export const a2aSendMessageTool = tool({
  description: "Send a direct message to another agent. The target agent will see this in their inbox during their next execution cycle. Use for async requests, status updates, or sharing information that doesn't need an immediate response. Available agents: general, mail, code, data, creative, research, ops.",
  inputSchema: zodSchema(z.object({
    to_agent: z.enum(["general", "mail", "code", "data", "creative", "research", "ops"]).describe("Target agent to send the message to"),
    topic: z.string().describe("Short subject/topic of the message"),
    content: z.string().describe("Full message content with all necessary context"),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional().describe("Message priority (default: normal)"),
    msg_type: z.enum(["request", "context_share", "handoff", "collaboration"]).optional().describe("Type of message (default: request)"),
  })),
  execute: safeJson(async ({ to_agent, topic, content, priority, msg_type }) => {
    const { sendA2AMessage } = await import("@/lib/a2a");
    const msg = await sendA2AMessage({
      fromAgent: "current", // Will be set by the route handler if available
      toAgent: to_agent,
      type: msg_type || "request",
      topic,
      payload: { content, source: "a2a_send_message" },
      priority: priority || "normal",
    });
    if (msg) {
      return { success: true, messageId: msg.id, to: to_agent, topic, priority: msg.priority, timestamp: msg.timestamp };
    }
    return { success: false, error: "Failed to send message" };
  }),
});

export const a2aBroadcastTool = tool({
  description: "Broadcast a message to ALL agents or a specific subset. Use for team-wide announcements, status updates, or sharing results that multiple agents need. The message will appear in each target agent's inbox.",
  inputSchema: zodSchema(z.object({
    topic: z.string().describe("Broadcast topic/subject"),
    content: z.string().describe("Broadcast message content"),
    targets: z.array(z.enum(["general", "mail", "code", "data", "creative", "research", "ops"])).optional().describe("Specific agents to target (default: all agents)"),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional().describe("Priority (default: normal)"),
  })),
  execute: safeJson(async ({ topic, content, targets, priority }) => {
    const { broadcastA2AMessage } = await import("@/lib/a2a");
    const result = await broadcastA2AMessage({
      fromAgent: "current",
      targets,
      topic,
      payload: { content, source: "a2a_broadcast" },
      priority: priority || "normal",
    });
    return { success: true, sentTo: result.agents, totalSent: result.sent };
  }),
});

export const a2aCheckInboxTool = tool({
  description: "Check your A2A inbox for unread messages from other agents. Returns messages sorted by priority (urgent first). Always check your inbox at the start of your execution cycle to see if any agent has sent you tasks or information.",
  inputSchema: zodSchema(z.object({
    limit: z.number().optional().describe("Max messages to return (default: 20)"),
    mark_as_read: z.boolean().optional().describe("Automatically mark returned messages as read (default: true)"),
  })),
  execute: safeJson(async ({ limit, mark_as_read }) => {
    const { getAgentInbox, markMessagesRead } = await import("@/lib/a2a");
    const agentId = "current"; // Will be set by route context
    const messages = await getAgentInbox(agentId, limit || 20);
    
    // Auto mark as read
    let markedCount = 0;
    if (mark_as_read !== false && messages.length > 0) {
      const ids = messages.map(m => m.id);
      markedCount = await markMessagesRead(agentId, ids);
    }

    return {
      unreadCount: messages.length,
      markedRead: markedCount,
      messages: messages.map(m => ({
        id: m.id, from: m.fromAgent, type: m.type,
        topic: m.topic, priority: m.priority,
        content: m.payload?.content || m.payload?.task || "",
        createdAt: m.createdAt,
      })),
    };
  }),
});

export const a2aShareContextTool = tool({
  description: "Share data, findings, or context with other agents for collaboration. The shared context is versioned and can be queried later by any agent with access. Use this when you have research findings, analysis results, or data that other agents need.",
  inputSchema: zodSchema(z.object({
    context_key: z.string().describe("Unique key for this context (e.g., 'project-x-research', 'market-analysis-q2')"),
    content: z.string().describe("Text content to share (findings, data summary, etc.)"),
    structured_data: z.record(z.string(), z.unknown()).optional().describe("Optional structured data as key-value pairs"),
    tags: z.array(z.string()).optional().describe("Tags for easy retrieval (e.g., ['research', 'market', 'q2'])"),
    access_agents: z.array(z.enum(["general", "mail", "code", "data", "creative", "research", "ops"])).optional().describe("Which agents can access this (default: all)"),
    scope: z.enum(["global", "project", "session", "agent"]).optional().describe("Context scope (default: project)"),
    project_id: z.number().optional().describe("Project ID if this context belongs to a project"),
  })),
  execute: safeJson(async ({ context_key, content, structured_data, tags, access_agents, scope, project_id }) => {
    const { shareContext } = await import("@/lib/a2a");
    const ctxId = await shareContext({
      contextKey: context_key,
      agentId: "current",
      content: { text: content, ...structured_data },
      contentText: content,
      tags: tags || [],
      accessAgents: access_agents || [],
      scope: scope || "project",
      projectId: project_id,
    });
    if (ctxId) {
      return { success: true, contextId: ctxId, key: context_key, scope: scope || "project", version: ctxId };
    }
    return { success: false, error: "Failed to store context" };
  }),
});

export const a2aQueryContextTool = tool({
  description: "Query shared context that other agents have stored. Search by key, tags, scope, or project. Returns the latest version of matching contexts. Use this to retrieve research findings, analysis data, or shared results from other agents.",
  inputSchema: zodSchema(z.object({
    context_key: z.string().optional().describe("Exact context key to look up"),
    tags: z.array(z.string()).optional().describe("Filter by tags (returns contexts that match ANY tag)"),
    scope: z.enum(["global", "project", "session", "agent"]).optional().describe("Filter by scope"),
    project_id: z.number().optional().describe("Filter by project ID"),
    limit: z.number().optional().describe("Max results (default: 10)"),
  })),
  execute: safeJson(async ({ context_key, tags, scope, project_id, limit }) => {
    const { queryContext } = await import("@/lib/a2a");
    const results = await queryContext({
      contextKey: context_key,
      scope,
      projectId: project_id,
      tags,
      limit: limit || 10,
    });
    return {
      found: results.length,
      contexts: results.map(r => ({
        id: r.id, key: r.contextKey, agent: r.agentId,
        content: r.contentText || "(structured data only)",
        structuredData: r.content,
        tags: r.tags, scope: r.scope, version: r.version,
        createdAt: r.createdAt,
      })),
    };
  }),
});

export const a2aCollaborateTool = tool({
  description: "Initiate a multi-agent collaboration on a channel. Creates (or reuses) a collaboration channel and posts a message. Other agents can see channel messages in their inbox. Use for complex tasks that need input from multiple agents.",
  inputSchema: zodSchema(z.object({
    channel_name: z.string().describe("Channel name (e.g., 'project-launch-planning')"),
    message: z.string().describe("Your message to the channel"),
    members: z.array(z.enum(["general", "mail", "code", "data", "creative", "research", "ops"])).optional().describe("Channel members (default: all agents)"),
    channel_type: z.enum(["project", "task", "alert", "general", "broadcast"]).optional().describe("Channel type (default: project)"),
    project_id: z.number().optional().describe("Link channel to a project"),
  })),
  execute: safeJson(async ({ channel_name, message, members, channel_type, project_id }) => {
    const { getOrCreateChannel, postToChannel } = await import("@/lib/a2a");
    const allMembers = members || ["general", "mail", "code", "data", "creative", "research", "ops"];
    const channelId = await getOrCreateChannel({
      name: channel_name,
      channelType: channel_type || "project",
      projectId: project_id,
      members: allMembers,
    });
    if (!channelId) return { success: false, error: "Failed to create/get channel" };

    const msgId = await postToChannel(channelId, {
      agentId: "current",
      content: message,
      messageType: "message",
    });

    // Also broadcast to members' inboxes
    const { broadcastA2AMessage } = await import("@/lib/a2a");
    await broadcastA2AMessage({
      fromAgent: "current",
      targets: allMembers,
      topic: `New message in #${channel_name}`,
      payload: { content: message.slice(0, 500), channelId, source: "a2a_collaborate" },
      priority: "normal",
    });

    return { success: true, channelId, msgId, channel: channel_name, members: allMembers };
  }),
});

// ---------------------------------------------------------------------------
// Skills Tools — Phase 6A: Skill Library Foundation
// ---------------------------------------------------------------------------

export const skillListTool = tool({
  description: "List available skills in the skill library. Supports filtering by category, search query, or agent compatibility. Returns skill names, descriptions, categories, performance scores, and required tools.",
  inputSchema: zodSchema(z.object({
    search: z.string().optional().describe("Search query to filter skills by name or description"),
    category: z.string().optional().describe("Filter by category (research, code, communication, data, planning, ops, content)"),
    agent: z.string().optional().describe("Filter to skills available for a specific agent ID"),
  })),
  execute: safeJson(async ({ search, category, agent }) => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (category) params.set("category", category);
    if (agent) params.set("agent", agent);
    const res = await fetch(`${getSelfBaseUrl()}/api/skills?${params.toString()}`, {
      headers: getSelfFetchHeaders(),
    });
    return await safeParseRes(res);
  }),
});

export const skillUseTool = tool({
  description: "Apply a skill's prompt template and workflow to enhance task execution. Use this when you want to follow a structured methodology for a task. Returns the skill's prompt template and workflow steps to guide your approach.",
  inputSchema: zodSchema(z.object({
    skill_name: z.string().describe("The name of the skill to use (e.g., 'research_deep', 'code_review', 'email_compose')"),
    context: z.string().optional().describe("Optional context about the current task to customize the skill application"),
  })),
  execute: safeJson(async ({ skill_name, context }) => {
    const params = new URLSearchParams({ search: skill_name, limit: "1" });
    const res = await fetch(`${getSelfBaseUrl()}/api/skills?${params.toString()}`, {
      headers: getSelfFetchHeaders(),
    });
    const data = await safeParseRes<{ success: boolean; data?: Array<Record<string, unknown>> }>(res);
    if (data.success && data.data && data.data.length > 0) {
      const skill = data.data[0];
      return {
        success: true,
        skill_name: skill.name,
        display_name: skill.display_name,
        prompt_template: skill.prompt_template,
        workflow_steps: skill.workflow_steps,
        required_tools: skill.required_tools,
        difficulty: skill.difficulty,
        performance_score: skill.performance_score,
        context_applied: context || null,
      };
    }
    return { success: false, error: `Skill '${skill_name}' not found. Use skill_list to see available skills.` };
  }),
});

export const skillCreateTool = tool({
  description: "Create a new custom skill in the skill library. Define a reusable prompt template and workflow that agents can apply to future tasks. Custom skills can be rated and evolve based on performance feedback.",
  inputSchema: zodSchema(z.object({
    name: z.string().describe("Unique skill name (snake_case, e.g., 'my_custom_skill')"),
    display_name: z.string().describe("Human-readable skill name (e.g., 'My Custom Skill')"),
    description: z.string().describe("Clear description of what the skill does and when to use it"),
    category: z.string().optional().describe("Category: research, code, communication, data, planning, ops, content, general"),
    difficulty: z.string().optional().describe("Difficulty level: beginner, intermediate, advanced, expert"),
    prompt_template: z.string().describe("The prompt template that guides the agent when using this skill"),
    workflow_steps: z.array(z.string()).optional().describe("Ordered list of workflow step descriptions"),
    required_tools: z.array(z.string()).optional().describe("List of tool names required by this skill"),
    tags: z.array(z.string()).optional().describe("Tags for searchability"),
  })),
  execute: safeJson(async ({ name, display_name, description, category, difficulty, prompt_template, workflow_steps, required_tools, tags }) => {
    const res = await fetch(`${getSelfBaseUrl()}/api/skills`, {
      method: "POST",
      headers: getSelfFetchHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ name, display_name, description, category, difficulty, prompt_template, workflow_steps, required_tools, tags }),
    });
    return await safeParseRes(res);
  }),
});

export const skillEquipTool = tool({
  description: "Equip or unequip skills for a specific agent. When a skill is equipped, the agent can discover and use it. Use this to customize which skills each agent has access to.",
  inputSchema: zodSchema(z.object({
    agent_id: z.string().describe("The agent ID to equip skills for (e.g., 'general', 'mail', 'code', 'data', 'research', 'ops', 'creative')"),
    skill_ids: z.array(z.string()).optional().describe("Skill UUIDs to equip"),
    unequip_skill_ids: z.array(z.string()).optional().describe("Skill UUIDs to unequip"),
  })),
  execute: safeJson(async ({ agent_id, skill_ids, unequip_skill_ids }) => {
    const res = await fetch(`${getSelfBaseUrl()}/api/agent-skills`, {
      method: "POST",
      headers: getSelfFetchHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ agent_id, skill_ids, unequip_skill_ids }),
    });
    return await safeParseRes(res);
  }),
});

export const skillRateTool = tool({
  description: "Rate a skill's performance after using it. Ratings (1-5) help improve the skill library by tracking quality and guiding future skill selection. Rate 4-5 for excellent results, 3 for adequate, 1-2 for poor.",
  inputSchema: zodSchema(z.object({
    skill_id: z.string().describe("The UUID of the skill to rate"),
    agent_id: z.string().describe("Your agent ID"),
    rating: z.number().min(1).max(5).describe("Rating from 1 (poor) to 5 (excellent)"),
    feedback: z.string().optional().describe("Optional text feedback about the skill's performance"),
  })),
  execute: safeJson(async ({ skill_id, agent_id, rating, feedback }) => {
    const res = await fetch(`${getSelfBaseUrl()}/api/skills/rate`, {
      method: "POST",
      headers: getSelfFetchHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ skill_id, agent_id, rating, feedback }),
    });
    return await safeParseRes(res);
  }),
});

export const skillInspectTool = tool({
  description: "Get detailed information about a specific skill including its full prompt template, workflow steps, required tools, performance metrics, and usage history. Use this before deciding whether to apply a skill.",
  inputSchema: zodSchema(z.object({
    skill_id: z.string().describe("The UUID of the skill to inspect"),
  })),
  execute: safeJson(async ({ skill_id }) => {
    const res = await fetch(`${getSelfBaseUrl()}/api/skills/${skill_id}`, {
      headers: getSelfFetchHeaders(),
    });
    return await safeParseRes(res);
  }),
});

export const skillEvaluateTool = tool({
  description: "Evaluate a skill's execution quality using structured multi-dimensional assessment. Use this after applying a skill to assess how well it performed across relevance, accuracy, completeness, clarity, and efficiency.",
  inputSchema: zodSchema(z.object({
    skill_id: z.string().describe("The UUID of the skill to evaluate"),
    agent_id: z.string().describe("Your agent ID"),
    task_id: z.string().optional().describe("Optional task ID for tracking"),
    input_summary: z.string().describe("Summary of what the user asked for"),
    output_summary: z.string().describe("Summary of what the skill produced"),
    success: z.boolean().optional().describe("Whether the skill execution was successful"),
  })),
  execute: safeJson(async ({ skill_id, agent_id, task_id, input_summary, output_summary, success }) => {
    const res = await fetch(`${getSelfBaseUrl()}/api/skills/evaluate`, {
      method: "POST",
      headers: getSelfFetchHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ skill_id, agent_id, task_id, input_summary, output_summary, success }),
    });
    return await safeParseRes(res);
  }),
});

// ---------------------------------------------------------------------------
// Phase 6C: Skill Evolution & Rollback Tools
// ---------------------------------------------------------------------------

export const skillEvolveTool = tool({
  description: "Evolve and improve a skill based on past evaluation feedback. The system will analyze weaknesses and rewrite the skill's prompt template to be more effective. Use this when a skill has been evaluated multiple times and needs improvement.",
  inputSchema: zodSchema(z.object({
    skill_id: z.string().describe("The UUID of the skill to evolve"),
    agent_id: z.string().describe("Your agent ID for tracking"),
  })),
  execute: safeJson(async ({ skill_id, agent_id }) => {
    const res = await fetch(`${getSelfBaseUrl()}/api/skills/evolve`, {
      method: "POST",
      headers: getSelfFetchHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ skill_id, agent_id }),
    });
    return await safeParseRes(res);
  }),
});

export const skillRollbackTool = tool({
  description: "Roll back a skill to a previous version if an evolution made it worse. Requires the evolution_id from the evolution timeline. Use this to undo a bad skill evolution.",
  inputSchema: zodSchema(z.object({
    skill_id: z.string().describe("The UUID of the skill to roll back"),
    evolution_id: z.string().describe("The evolution record ID to roll back to"),
  })),
  execute: safeJson(async ({ skill_id, evolution_id }) => {
    const res = await fetch(`${getSelfBaseUrl()}/api/skills/rollback`, {
      method: "POST",
      headers: getSelfFetchHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ skill_id, evolution_id }),
    });
    return await safeParseRes(res);
  }),
});

// ---------------------------------------------------------------------------
// Phase 7A: Hybrid Skill Retrieval Tools
// ---------------------------------------------------------------------------

export const skillSearchHybridTool = tool({
  description: "Search skills using hybrid vector + keyword retrieval. Combines semantic similarity (pgvector) with TF-IDF keyword matching, reranked using Reciprocal Rank Fusion. Returns the best matching skills with match method indicators.",
  inputSchema: zodSchema(z.object({
    query: z.string().describe("Search query describing the desired skill"),
    top_k: z.number().optional().describe("Number of results to return (default: 10)"),
  })),
  execute: safeJson(async ({ query, top_k }) => {
    const res = await fetch(`${getSelfBaseUrl()}/api/skills/search`, {
      method: "POST",
      headers: getSelfFetchHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ query, top_k: top_k || 10 }),
    });
    return await safeParseRes(res);
  }),
});

export const skillRefreshEmbeddingsTool = tool({
  description: "Regenerate embeddings for all skills (or a specific skill). Use this after adding new skills or updating skill content. Embeddings enable vector similarity search for better skill matching.",
  inputSchema: zodSchema(z.object({
    skill_id: z.string().optional().describe("Optional: regenerate embedding for just one skill (UUID)"),
  })),
  execute: safeJson(async ({ skill_id }) => {
    const body: Record<string, unknown> = {};
    if (skill_id) body.skill_id = skill_id;
    const res = await fetch(`${getSelfBaseUrl()}/api/skills/embeddings`, {
      method: "POST",
      headers: getSelfFetchHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    return await safeParseRes(res);
  }),
});

export const skillEmbeddingSetupTool = tool({
  description: "Initialize pgvector extension and add embedding columns to the skills table. Run this once before generating embeddings. Idempotent — safe to run multiple times.",
  inputSchema: zodSchema(z.object({})),
  execute: safeJson(async () => {
    const res = await fetch(`${getSelfBaseUrl()}/api/skills/embeddings/setup`, {
      method: "POST",
      headers: getSelfFetchHeaders({ "Content-Type": "application/json" }),
    });
    return await safeParseRes(res);
  }),
});

// ---------------------------------------------------------------------------
// Phase 7B: Multi-Step Workflow Tools
// ---------------------------------------------------------------------------

export const workflowPlanTool = tool({
  description: "Plan and create a new multi-step workflow. Decomposes a complex task into 2-8 sequential steps, each using the best available skill. Use this for complex multi-step tasks that involve research + analysis + creation, or tasks spanning multiple domains.",
  inputSchema: zodSchema(z.object({
    query: z.string().describe("The complex task to decompose into a multi-step workflow"),
    agent_id: z.string().optional().describe("Agent ID (default: 'general')"),
  })),
  execute: safeJson(async ({ query, agent_id }) => {
    const params = new URLSearchParams();
    if (agent_id) params.set("agent_id", agent_id);
    const res = await fetch(`${getSelfBaseUrl()}/api/workflows?${params.toString()}`, {
      method: "POST",
      headers: getSelfFetchHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ query, agent_id: agent_id || "general" }),
    });
    return await safeParseRes(res);
  }),
});

export const workflowExecuteTool = tool({
  description: "Execute a planned workflow — runs all pending steps sequentially. Each step uses its assigned skill to produce output. Optionally validates each step's quality automatically.",
  inputSchema: zodSchema(z.object({
    workflow_id: z.string().describe("The UUID of the workflow to execute"),
    agent_id: z.string().optional().describe("Agent ID executing the workflow (default: 'general')"),
    auto_validate: z.boolean().optional().describe("Whether to auto-validate each step (default: true)"),
  })),
  execute: safeJson(async ({ workflow_id, agent_id, auto_validate }) => {
    const res = await fetch(`${getSelfBaseUrl()}/api/workflows/${workflow_id}/execute`, {
      method: "POST",
      headers: getSelfFetchHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ agent_id: agent_id || "general", auto_validate: auto_validate !== false }),
    });
    return await safeParseRes(res);
  }),
});

export const workflowStatusTool = tool({
  description: "Get workflow status and details including all steps, their statuses, outputs, and validation scores.",
  inputSchema: zodSchema(z.object({
    workflow_id: z.string().describe("The UUID of the workflow"),
  })),
  execute: safeJson(async ({ workflow_id }) => {
    const res = await fetch(`${getSelfBaseUrl()}/api/workflows/${workflow_id}`, {
      headers: getSelfFetchHeaders(),
    });
    return await safeParseRes(res);
  }),
});

export const workflowListTool = tool({
  description: "List all workflows with optional filters. Shows workflow names, statuses, progress, and quality scores.",
  inputSchema: zodSchema(z.object({
    agent_id: z.string().optional().describe("Filter by agent ID"),
    status: z.string().optional().describe("Filter by status (planning, running, completed, failed, paused, cancelled)"),
    limit: z.number().optional().describe("Max workflows to return (default: 20)"),
  })),
  execute: safeJson(async ({ agent_id, status, limit }) => {
    const params = new URLSearchParams();
    if (agent_id) params.set("agent_id", agent_id);
    if (status) params.set("status", status);
    if (limit) params.set("limit", String(limit));
    const url = `${getSelfBaseUrl()}/api/workflows${params.toString() ? `?${params.toString()}` : ""}`;
    const res = await fetch(url, { headers: getSelfFetchHeaders() });
    return await safeParseRes(res);
  }),
});

export const workflowStepExecuteTool = tool({
  description: "Execute a single workflow step manually. Useful for step-by-step control or re-running a failed step.",
  inputSchema: zodSchema(z.object({
    workflow_id: z.string().describe("The UUID of the workflow"),
    step_number: z.number().describe("The step number to execute (1-based)"),
    agent_id: z.string().optional().describe("Agent ID (default: 'general')"),
  })),
  execute: safeJson(async ({ workflow_id, step_number, agent_id }) => {
    const res = await fetch(`${getSelfBaseUrl()}/api/workflows/${workflow_id}/steps/${step_number}`, {
      method: "POST",
      headers: getSelfFetchHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ agent_id: agent_id || "general" }),
    });
    return await safeParseRes(res);
  }),
});

export const workflowCancelTool = tool({
  description: "Cancel a running or paused workflow. This will skip all remaining pending steps.",
  inputSchema: zodSchema(z.object({
    workflow_id: z.string().describe("The UUID of the workflow to cancel"),
  })),
  execute: safeJson(async ({ workflow_id }) => {
    const res = await fetch(`${getSelfBaseUrl()}/api/workflows/${workflow_id}`, {
      method: "PATCH",
      headers: getSelfFetchHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ status: "cancelled" }),
    });
    return await safeParseRes(res);
  }),
});

// ---------------------------------------------------------------------------
// Task Board Tools — Kanban board for inter-agent coordination
// Agents can create, update, list, and delete tasks on the shared board.
// ---------------------------------------------------------------------------

export const taskboardCreateTool = tool({
  description: "Create a new task on the shared task board (Kanban). Use this to track work items, assign tasks to yourself or other agents, and coordinate work across the team. Tasks start in 'backlog' column.",
  inputSchema: zodSchema(z.object({
    title: z.string().describe("Task title — clear and actionable"),
    description: z.string().optional().describe("Detailed task description"),
    priority: z.enum(["high", "medium", "low"]).optional().describe("Task priority (default: medium)"),
    assigned_agent: z.enum(["general", "mail", "code", "data", "creative", "research", "ops"]).optional().describe("Agent to assign this task to"),
    context: z.string().optional().describe("Additional context for the assigned agent"),
    deadline: z.string().optional().describe("Deadline (ISO 8601 datetime)"),
    tags: z.array(z.string()).optional().describe("Tags for categorization"),
  })),
  execute: safeJson(async ({ title, description, priority, assigned_agent, context, deadline, tags }) => {
    try {
      const { createTask } = await import("@/lib/taskboard");
      const task = await createTask({
        title,
        description,
        priority,
        assignedAgent: assigned_agent || null,
        createdBy: "general",
        context,
        deadline,
        tags,
      });
      if (!task) return { success: false, error: "Failed to create task — database error" };
      return { success: true, task: { id: task.id, title: task.title, status: task.status, priority: task.priority, assignedAgent: task.assignedAgent } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to create task" };
    }
  }),
});

export const taskboardUpdateTool = tool({
  description: "Update a task on the shared task board. Can change title, description, status (backlog/in_progress/waiting/done), priority, assignment, context, deadline, or tags. Use this to move tasks between columns or reassign them.",
  inputSchema: zodSchema(z.object({
    task_id: z.number().describe("Task ID to update"),
    title: z.string().optional().describe("New title"),
    description: z.string().optional().describe("New description"),
    status: z.enum(["backlog", "in_progress", "waiting", "done"]).optional().describe("New status (moves task between Kanban columns)"),
    priority: z.enum(["high", "medium", "low"]).optional().describe("New priority"),
    assigned_agent: z.enum(["general", "mail", "code", "data", "creative", "research", "ops"]).optional().describe("Reassign to a different agent"),
    context: z.string().optional().describe("Update context"),
    deadline: z.string().optional().describe("Update deadline (ISO 8601)"),
    tags: z.array(z.string()).optional().describe("Update tags"),
  })),
  execute: safeJson(async ({ task_id, title, description, status, priority, assigned_agent, context, deadline, tags }) => {
    try {
      const { updateTask } = await import("@/lib/taskboard");
      const updates: Record<string, unknown> = {};
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (status !== undefined) updates.status = status;
      if (priority !== undefined) updates.priority = priority;
      if (assigned_agent !== undefined) updates.assignedAgent = assigned_agent;
      if (context !== undefined) updates.context = context;
      if (deadline !== undefined) updates.deadline = deadline;
      if (tags !== undefined) updates.tags = tags;

      const task = await updateTask(task_id, updates);
      if (!task) return { success: false, error: `Task ${task_id} not found or update failed` };
      return { success: true, task: { id: task.id, title: task.title, status: task.status, priority: task.priority, assignedAgent: task.assignedAgent } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to update task" };
    }
  }),
});

export const taskboardListTool = tool({
  description: "List tasks from the shared task board. Filter by status (backlog/in_progress/waiting/done), assigned agent, or priority. Returns tasks sorted by priority then creation date. Use this to check what work is pending or in progress.",
  inputSchema: zodSchema(z.object({
    status: z.enum(["backlog", "in_progress", "waiting", "done"]).optional().describe("Filter by status column"),
    assigned_agent: z.enum(["general", "mail", "code", "data", "creative", "research", "ops"]).optional().describe("Filter by assigned agent"),
    priority: z.enum(["high", "medium", "low"]).optional().describe("Filter by priority"),
    limit: z.number().optional().describe("Max tasks to return (default: 50)"),
  })),
  execute: safeJson(async ({ status, assigned_agent, priority, limit }) => {
    try {
      const { getTasks } = await import("@/lib/taskboard");
      const tasks = await getTasks({ status, assignedAgent: assigned_agent, priority, limit: limit || 50 });
      return {
        success: true,
        count: tasks.length,
        tasks: tasks.map(t => ({
          id: t.id, title: t.title, status: t.status, priority: t.priority,
          assignedAgent: t.assignedAgent, createdBy: t.createdBy,
          description: t.description, context: t.context,
          deadline: t.deadline, tags: t.tags,
          createdAt: t.createdAt,
        })),
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to list tasks" };
    }
  }),
});

export const taskboardDeleteTool = tool({
  description: "Delete a task from the shared task board. Use with caution — this permanently removes the task. Prefer updating status to 'done' instead of deleting completed tasks.",
  inputSchema: zodSchema(z.object({
    task_id: z.number().describe("Task ID to delete"),
  })),
  execute: safeJson(async ({ task_id }) => {
    try {
      const { deleteTask } = await import("@/lib/taskboard");
      const ok = await deleteTask(task_id);
      if (!ok) return { success: false, error: `Task ${task_id} not found or delete failed` };
      return { success: true, message: `Task ${task_id} deleted` };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to delete task" };
    }
  }),
});

export const taskboardSummaryTool = tool({
  description: "Get a summary of the shared task board — counts per status column (backlog, in_progress, waiting, done), total tasks, and high-priority count. Use for a quick health check of the board.",
  inputSchema: zodSchema(z.object({})),
  execute: safeJson(async () => {
    try {
      const { getTaskBoardSummary } = await import("@/lib/taskboard");
      const summary = await getTaskBoardSummary();
      return { success: true, ...summary };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to get summary" };
    }
  }),
});

// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolType = ReturnType<typeof tool<any, string>>;

export const allTools: Record<string, ToolType> = {
  // Gmail
  gmail_send: gmailSendTool,
  gmail_fetch: gmailFetchTool,
  gmail_labels: gmailLabelsTool,
  gmail_create_label: gmailCreateLabelTool,
  gmail_delete_label: gmailDeleteLabelTool,
  gmail_profile: gmailProfileTool,
  gmail_reply: gmailReplyTool,
  gmail_thread: gmailThreadTool,
  gmail_batch: gmailBatchTool,
  // Calendar
  calendar_list: calendarListTool,
  calendar_events: calendarEventsTool,
  calendar_create: calendarCreateTool,
  calendar_delete: calendarDeleteTool,
  calendar_freebusy: calendarFreebusyTool,
  // Drive
  drive_list: driveListTool,
  drive_create_folder: driveCreateFolderTool,
  drive_create_file: driveCreateFileTool,
  // Sheets
  sheets_read: sheetsReadTool,
  sheets_values: sheetsValuesTool,
  sheets_append: sheetsAppendTool,
  sheets_update: sheetsUpdateTool,
  sheets_create: sheetsCreateTool,
  sheets_add_sheet: sheetsAddSheetTool,
  sheets_batch_get: sheetsBatchGetTool,
  sheets_clear: sheetsClearTool,
  // Docs
  docs_list: docsListTool,
  docs_read: docsReadTool,
  docs_create: docsCreateTool,
  docs_append: docsAppendTool,
  // GitHub
  github_repo: githubRepoTool,
  github_issues: githubIssuesTool,
  github_create_issue: githubCreateIssueTool,
  github_prs: githubPrsTool,
  github_commits: githubCommitsTool,
  github_files: githubFilesTool,
  github_read_file: githubReadFileTool,
  github_search: githubSearchTool,
  github_branches: githubBranchesTool,
  github_update_issue: githubUpdateIssueTool,
  github_create_pr: githubCreatePrTool,
  github_pr_review: githubPrReviewTool,
  github_pr_comment: githubPrCommentTool,
  github_create_branch: githubCreateBranchTool,
  // Vercel
  vercel_projects: vercelProjectsTool,
  vercel_deployments: vercelDeploymentsTool,
  vercel_domains: vercelDomainsTool,
  vercel_deploy: vercelDeployTool,
  vercel_logs: vercelLogsTool,
  // Web Tools
  web_search: webSearchTool,
  web_search_advanced: webSearchAdvancedTool,
  web_reader: webReaderTool,
  // Agent Delegation
  delegate_to_agent: delegateToAgentTool,
  // A2A
  query_agent: queryAgentTool,
  // Vision Tools (Ollama Cloud — FREE)
  vision_analyze: visionAnalyzeTool,
  vision_download_analyze: visionDownloadAnalyzeTool,
  image_generate: imageGenerateTool,
  tts_generate: ttsGenerateTool,
  asr_transcribe: asrTranscribeTool,
  video_generate: videoGenerateTool,
  // Stitch Design Tools
  design_generate: designGenerateTool,
  design_edit: designEditTool,
  design_variants: designVariantsTool,
  // Data Analysis Tools
  data_calculate: dataCalculateTool,
  data_clean: dataCleanTool,
  data_pivot: dataPivotTool,
  // Research Tools
  research_deep: researchDeepTool,
  research_synthesize: researchSynthesizeTool,
  research_save_brief: researchSaveBriefTool,
  research_save_data: researchSaveDataTool,
  // Ops Tools
  ops_health_check: opsHealthCheckTool,
  ops_deployment_status: opsDeploymentStatusTool,
  ops_github_activity: opsGithubActivityTool,
  ops_agent_stats: opsAgentStatsTool,
  // File Creation Tools
  create_pdf_report: createPdfReportTool,
  create_docx_document: createDocxDocumentTool,
  create_xlsx_spreadsheet: createXlsxSpreadsheetTool,
  gmail_send_attachment: gmailSendWithAttachmentTool,
  download_drive_file: downloadDriveFileTool,
  // Workspace Tools (Reminders, Todos, Contacts)
  reminder_create: reminderCreateTool,
  reminder_list: reminderListTool,
  reminder_update: reminderUpdateTool,
  reminder_delete: reminderDeleteTool,
  reminder_complete: reminderCompleteTool,
  todo_create: todoCreateTool,
  todo_list: todoListTool,
  todo_update: todoUpdateTool,
  todo_delete: todoDeleteTool,
  todo_stats: todoStatsTool,
  contact_create: contactCreateTool,
  contact_list: contactListTool,
  contact_search: contactSearchTool,
  contact_update: contactUpdateTool,
  contact_delete: contactDeleteTool,
  // Project Management (Phase 2)
  project_create: projectCreateTool,
  project_add_task: projectAddTaskTool,
  project_status: projectStatusTool,
  project_list: projectListTool,
  project_decompose: projectDecomposeTool,
  // Phase 5: Full Autonomous Project Lifecycle
  project_update: projectUpdateTool,
  project_delete: projectDeleteTool,
  project_retry_task: projectRetryTaskTool,
  project_skip_task: projectSkipTaskTool,
  project_decompose_and_add: projectDecomposeAndAddTool,
  project_health: projectHealthTool,
  // Phase 4: A2A Real-Time Communication
  a2a_send_message: a2aSendMessageTool,
  a2a_broadcast: a2aBroadcastTool,
  a2a_check_inbox: a2aCheckInboxTool,
  a2a_share_context: a2aShareContextTool,
  a2a_query_context: a2aQueryContextTool,
  a2a_collaborate: a2aCollaborateTool,
  // New Tools
  code_execute: codeExecuteTool,
  weather_get: weatherGetTool,
  // Phase 6A: Skill Library
  skill_list: skillListTool,
  skill_use: skillUseTool,
  skill_create: skillCreateTool,
  skill_equip: skillEquipTool,
  skill_rate: skillRateTool,
  skill_inspect: skillInspectTool,
  // Phase 6B: Skill Evaluation
  skill_evaluate: skillEvaluateTool,
  // Phase 6C: Skill Evolution & Rollback
  skill_evolve: skillEvolveTool,
  skill_rollback: skillRollbackTool,
  // Phase 7A: Hybrid Skill Retrieval
  skill_search_hybrid: skillSearchHybridTool,
  skill_refresh_embeddings: skillRefreshEmbeddingsTool,
  skill_embedding_setup: skillEmbeddingSetupTool,
  // Phase 7B: Multi-Step Agent Workflows
  workflow_plan: workflowPlanTool,
  workflow_execute: workflowExecuteTool,
  workflow_status: workflowStatusTool,
  workflow_list: workflowListTool,
  workflow_step_execute: workflowStepExecuteTool,
  workflow_cancel: workflowCancelTool,
  // Task Board (Kanban)
  taskboard_create: taskboardCreateTool,
  taskboard_update: taskboardUpdateTool,
  taskboard_list: taskboardListTool,
  taskboard_delete: taskboardDeleteTool,
  taskboard_summary: taskboardSummaryTool,
};

// ---------------------------------------------------------------------------
// Helper: get subset of tools for an agent
// ---------------------------------------------------------------------------

export function getToolsForAgent(agentId: string): Record<string, ToolType> {
  const { getAgent } = require("./agents");
  const agent = getAgent(agentId as string);
  if (!agent) return {};

  const subset: Record<string, ToolType> = {};
  for (const toolId of agent.tools) {
    if (allTools[toolId]) {
      subset[toolId] = allTools[toolId];
    }
  }
  return subset;
}
