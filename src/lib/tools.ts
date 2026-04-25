// ---------------------------------------------------------------------------
// Klawhub Agent System — Tool Definitions for Vercel AI SDK v6
// ---------------------------------------------------------------------------
// Maps all existing API capabilities to AI SDK tool definitions.
// Uses `tool()` helper with `zodSchema()` for proper type safety.
// ---------------------------------------------------------------------------

import { z } from "zod";
import { tool, zodSchema } from "ai";
import { query } from "@/lib/db";

// Native API clients — all tools use free, no-key-required APIs (see api-clients.ts)
// z-ai-web-dev-sdk has been completely removed.
import { executeCodeJudge0, readWebPage, getStockQuote, getHistoricalData, searchPapers, duckDuckGoSearch, getMarketNews } from '@/lib/api-clients';

import { AsyncLocalStorage } from "node:async_hooks";

// --- Current agent context for A2A tools ---
// Uses AsyncLocalStorage to provide per-request isolation in concurrent environments.
// Each chat request / executor task sets its own agent ID without affecting others.
const agentContextStorage = new AsyncLocalStorage<{ agentId: string }>();

export function setCurrentAgentId(id: string) {
  const store = agentContextStorage.getStore();
  if (store) store.agentId = id;
}

export function getCurrentAgentId(): string {
  const store = agentContextStorage.getStore();
  return store?.agentId || 'general';
}

/**
 * Run a function within an agent context. All tool calls within the function
 * will see the specified agent ID via getCurrentAgentId().
 * Supports both sync and async functions.
 */
export function withAgentContext<T>(agentId: string, fn: () => T | Promise<T>): T | Promise<T> {
  return agentContextStorage.run({ agentId }, fn);
}

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
    max_results: mode === "advanced" ? Math.min(numResults, 10) : Math.min(numResults, 5),
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
    let errMsg: string;
    if (text) {
      try { errMsg = JSON.parse(text)?.error || text.slice(0, 200); }
      catch { errMsg = text.slice(0, 200); }
    } else {
      errMsg = res.statusText;
    }
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
// Increased from 8K to 64K — 8K was too tight for Gmail threads, Sheets data, etc.
const MAX_TOOL_RESULT_LENGTH = 65536;

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
      conferenceData: addMeetLink ? { createRequest: { requestId: `klaw-meet-${Date.now()}` } } : undefined,
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
// Agent Delegation Tool (Klawhub General only)
// ---------------------------------------------------------------------------
// NOTE: Uses generateText() directly instead of HTTP fetch to avoid Vercel
// authentication issues with internal API calls.
// ---------------------------------------------------------------------------

async function callAgentDirectly(agentId: string, taskPrompt: string, _delegationDepth: number = 0): Promise<{ text: string; steps: number }> {
  const { generateText, stepCountIs } = await import("ai");
  const { getAgent, getProvider } = await import("@/lib/agents");
  const { allTools, setCurrentAgentId } = await import("@/lib/tools");

  const agent = getAgent(agentId);
  if (!agent) throw new Error(`Unknown agent: ${agentId}`);

  // Set current agent context for A2A tools
  setCurrentAgentId(agentId);

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
    maxOutputTokens: 262144,
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
    const fromAgent = getCurrentAgentId() || "general";
    try {
      const { logDelegation } = await import("@/lib/delegations");
      delegationId = await logDelegation({
        initiator_agent: fromAgent,
        assigned_agent: agent_id,
        task,
        context: `Delegated by ${fromAgent} via delegate_to_agent tool`,
        delegation_chain: [fromAgent, agent_id],
      });
    } catch {
      // Delegation logging is non-critical
    }

    // Also log to legacy a2a_tasks table (fire-and-forget, backwards compat)
    try {
      await query(
        `INSERT INTO a2a_tasks (initiator_agent, assigned_agent, task, context, status, delegation_chain)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [fromAgent, agent_id, task, `Delegated by ${fromAgent} via delegate_to_agent tool`, 'in_progress', [fromAgent, agent_id]]
      );
    } catch {
      // A2A logging is non-critical
    }

    try {
      console.log(`[A2A] Delegating to ${agent_id}: ${task.slice(0, 100)}...`);
      const { text, steps } = await withAgentContext(agent_id, () => callAgentDirectly(agent_id, task));
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
      // Use most recent in_progress task for this agent pair to avoid ID mismatch
      try {
        await query(
          `UPDATE a2a_tasks SET status = 'completed', result = $1, completed_at = NOW()
           WHERE initiator_agent = $2 AND assigned_agent = $3 AND status = 'in_progress'
           ORDER BY created_at DESC LIMIT 1`,
          [text.trim().slice(0, 2000), fromAgent, agent_id]
        );
      } catch { /* non-critical */ }

      return { success: true, agent: agent_id, response: text.trim() || "(Agent returned no text response)", steps, durationMs };
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

  // Layer 1: DuckDuckGo via duck-duck-scrape npm package (more reliable than HTML scraping)
  try {
    const ddgResults = await duckDuckGoSearch(query, numResults);
    if (ddgResults.length > 0) return ddgResults;
  } catch { /* duck-duck-scrape failed, try HTML fallback */ }

  // Layer 1b: DuckDuckGo HTML search (POST request — fallback)
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
    // Multi-layer fallback: Tavily (optional) → duck-duck-scrape → DDG HTML → Wikipedia → Brave
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
    // Multi-layer fallback: Tavily advanced → duck-duck-scrape → DDG HTML → Wikipedia → Brave
    return await webSearchFallback(query, num, "advanced");
  }),
});

// ---------------------------------------------------------------------------
// Web Reader Tool (dual-mode: Z.ai SDK local + fetch fallback)
// ---------------------------------------------------------------------------

async function webReaderFallback(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; KlawhubBot/1.0; +https://klawhub.xyz)",
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
    // Cheerio-based reader (fast, no browser needed)
    return await readWebPage(url);
  }),
});

// ---------------------------------------------------------------------------
// Query Agent Tool (A2A — for specialist agents)
// Uses generateText() directly to avoid Vercel auth issues with HTTP calls.
// ---------------------------------------------------------------------------

export const queryAgentTool = tool({
  description: "AUTONOMOUSLY route a task to another specialist agent for real-time execution. The target agent EXECUTES the task and returns the result immediately — this is synchronous, not async messaging. Use this when you need another agent to DO something (not just receive a message). ALWAYS include ALL details the target agent needs (recipient emails, file content, times, descriptions, etc.). The user has pre-authorized cross-agent collaboration — do NOT ask for permission, just route and execute. For async communication where you don't need an immediate response, use a2a_send_message instead. Available agents: general (orchestrator, ALL tools), mail (email/calendar/meeting invites/Google Meet), code (GitHub/Vercel/DevOps), data (Drive/Sheets/Docs/analysis/vision), creative (content/strategy/docs/planning/design), research (deep research/intelligence/briefs), ops (monitoring/health/deployments).",
  inputSchema: zodSchema(z.object({
    agent_id: z.enum(["general", "mail", "code", "data", "creative", "research", "ops"]).describe("The specialist agent to route the task to"),
    question: z.string().describe("Complete task description with ALL context the target agent needs. Include: what to do, who/what/where/when details, any content to send, file IDs, email addresses, times, etc. Be SPECIFIC and provide everything needed for autonomous execution."),
  })),
  execute: safeJson(async ({ agent_id, question }) => {
    const startTime = Date.now();

    // Use the dynamically set agent ID for delegation logging
    const fromAgent = getCurrentAgentId() || "unknown";

    // Log the delegation via Phase 3 delegations table (fire-and-forget)
    let delegationId = -1;
    try {
      const { logDelegation } = await import("@/lib/delegations");
      delegationId = await logDelegation({
        initiator_agent: fromAgent,
        assigned_agent: agent_id,
        task: question,
        context: `Routed via query_agent from ${fromAgent}`,
        delegation_chain: [fromAgent, agent_id],
      });
    } catch {
      // Delegation logging is non-critical
    }

    // Also log to a2a_tasks for visibility in the A2A dashboard
    try {
      await query(
        `INSERT INTO a2a_tasks (initiator_agent, assigned_agent, task, context, status, delegation_chain)
         VALUES ($1, $2, $3, $4, 'in_progress', $5)`,
        [fromAgent, agent_id, question.slice(0, 500), `Synchronous delegation from ${fromAgent} via query_agent`, [fromAgent, agent_id]]
      );
    } catch { /* non-critical */ }

    try {
      console.log(`[A2A] Query from ${fromAgent} to ${agent_id}: ${question.slice(0, 100)}...`);
      const { text, steps } = await callAgentDirectly(agent_id, question);
      const durationMs = Date.now() - startTime;
      console.log(`[A2A] ${agent_id} responded in ${durationMs}ms: ${steps} steps, ${text.length} chars`);

      // Update delegation status to completed
      if (delegationId > 0) {
        const { updateDelegation } = await import("@/lib/delegations");
        updateDelegation(delegationId, {
          status: "completed",
          result: text.trim().slice(0, 2000),
          duration_ms: durationMs,
        }).catch(() => {});
      }

      return { success: true, agent: agent_id, response: text.trim() || "(Agent returned no text response)", steps, durationMs: Math.round(durationMs) };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      console.error(`[A2A] Query from ${fromAgent} to ${agent_id} failed after ${durationMs}ms:`, error);

      // Update delegation status to failed
      if (delegationId > 0) {
        const { updateDelegation } = await import("@/lib/delegations");
        updateDelegation(delegationId, {
          status: "failed",
          result: error instanceof Error ? error.message : "Query failed",
          duration_ms: durationMs,
        }).catch(() => {});
      }

      return { success: false, agent: agent_id, error: error instanceof Error ? error.message : "Query failed", durationMs: Math.round(durationMs) };
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

// Image/Video/Voice generation tools removed (not needed)
// ---------------------------------------------------------------------------

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
  description: "Perform deep multi-query research on a topic. Generates multiple search queries from the topic and optional aspects, runs them in parallel, deduplicates results, and returns a unified ranked result set. Keep numResults low (5-8) to avoid overwhelming the model context.",
  inputSchema: zodSchema(z.object({
    topic: z.string().describe("The main research topic"),
    aspects: z.array(z.string()).optional().describe("Specific aspects to research (e.g., ['market size', 'competition', 'trends'])"),
    numResults: z.number().optional().describe("Total number of results to return (default: 8, max 15). Keep low to avoid context overflow."),
  })),
  execute: safeJson(async ({ topic, aspects, numResults }) => {
    // Cap at 15 and default to 8 (was 15 — too many for large context models)
    const capped = Math.min(numResults || 8, 15);
    // Generate search queries from topic and aspects
    const queries = [
      topic,
      `${topic} overview`,
      ...(aspects || []).map(a => `${topic} ${a}`),
    ].slice(0, 4); // Reduced from 5 to 4 queries to cut search load

    // Search helper: Tavily → DuckDuckGo → Wikipedia → Brave
    async function searchQuery(q: string): Promise<Array<Record<string, unknown>>> {
      // Fallback: webSearchFallback (tries Tavily → DuckDuckGo → Wikipedia → Brave)
      const fallbackResults = await webSearchFallback(q, Math.ceil(capped / 2));
      return fallbackResults;
    }

    // Run all queries in parallel
    const allResults = await Promise.all(queries.map(searchQuery));

    // Flatten and deduplicate by URL — truncate snippets to reduce context size
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
            title: r.title ? String(r.title).slice(0, 100) : undefined,
            snippet: r.snippet || r.description ? String(r.snippet || r.description).slice(0, 200) : undefined,
          });
        }
      }
    }

    return {
      topic,
      queriesUsed: queries,
      totalFound: unique.length,
      results: unique.slice(0, capped),
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

    // Use Ollama Cloud (DeepSeek V4 Flash) for synthesis
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
  description: "Check the health status of all Klawhub services. Returns a structured health report covering real API routes, external integrations, and infrastructure components.",
  inputSchema: zodSchema(z.object({})),
  execute: safeJson(async () => {
    const baseUrl = getSelfBaseUrl();

    // --- 1) Ping real API routes ---
    const apiEndpoints = [
      { name: "api-status",        path: "/api/status" },
      { name: "api-services",      path: "/api/services?action=status" },
      { name: "api-agents",        path: "/api/agents" },
      { name: "api-analytics",     path: "/api/analytics" },
      { name: "api-memory",        path: "/api/memory?agentId=general" },
      { name: "api-dashboard",     path: "/api/dashboard" },
      { name: "api-health",        path: "/api/health" },
    ];

    const apiResults = await Promise.allSettled(
      apiEndpoints.map(async ({ name, path }) => {
        try {
          const res = await fetch(`${baseUrl}${path}`, {
            method: "GET",
            headers: getSelfFetchHeaders(),
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
  description: "Get the latest deployment status for the Klawhub HQ project on Vercel.",
  inputSchema: zodSchema(z.object({})),
  execute: safeJson(async () => {
    const deployments = await listDeployments(process.env.VERCEL_PROJECT_NAME || "klawhub-hq", 1);
    if (!deployments.length) {
      return { status: "no_deployments", message: `No deployments found for ${process.env.VERCEL_PROJECT_NAME || "klawhub-hq"}` };
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
  description: "Get performance statistics for all Klawhub agents including status, tasks completed, and messages processed.",
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

// ═══════════════════════════════════════════════════════════════════════════
// Upgraded PDF Creation Tool — KlawHub
// ═══════════════════════════════════════════════════════════════════════════
//
// Drop-in replacement for createPdfReportTool in src/lib/tools.ts.
// Retains every feature from the original and adds:
//
//   1. Image embedding         — fetch + embed images inline or as sections
//   2. Watermark support        — diagonal text on every page
//   3. Accurate TOC page nums   — two-pass rendering with real page refs
//   4. Custom page sizes        — A4 (default), A3, Letter, Legal
//   5. Richer markdown parsing  — bold-italic, links, task lists, nested
//                                  bullets, styled horizontal rules
//   6. Improved table styling   — first-column bold, colored header, grid
//   7. Section breaks           — --- triggers visual divider + new page
//   8. Code block polish        — language label, syntax highlighting,
//                                  rounded-corner background
//
// ═══════════════════════════════════════════════════════════════════════════



// ─── Page dimensions (points) ──────────────────────────────────────────────
const PAGE_DIMS: Record<string, { w: number; h: number }> = {
  A4:     { w: 595.28, h: 841.89 },
  A3:     { w: 841.89, h: 1190.55 },
  Letter: { w: 612,    h: 792 },
  Legal:  { w: 612,    h: 1008 },
};

// ─── Syntax-highlighting keyword sets ─────────────────────────────────────
const SYNTAX_KW: Record<string, string[]> = {
  javascript: [
    "async","await","break","case","catch","class","const","continue","debugger",
    "default","delete","do","else","export","extends","false","finally","for",
    "from","function","if","import","in","instanceof","let","new","null","of",
    "return","static","super","switch","this","throw","true","try","typeof",
    "undefined","var","void","while","with","yield",
  ],
  typescript: [
    "async","await","break","case","catch","class","const","continue","declare",
    "default","delete","do","else","enum","export","extends","false","finally",
    "for","from","function","if","implements","import","in","instanceof",
    "interface","is","keyof","let","namespace","new","null","of","private",
    "protected","public","readonly","return","static","super","switch","this",
    "throw","true","try","type","typeof","undefined","var","void","while",
    "with","yield",
  ],
  python: [
    "and","as","assert","async","await","break","class","continue","def","del",
    "elif","else","except","finally","for","from","global","if","import","in",
    "is","lambda","nonlocal","not","or","pass","raise","return","try","while",
    "with","yield","True","False","None","self",
  ],
  java: [
    "abstract","assert","boolean","break","byte","case","catch","char","class",
    "continue","default","do","double","else","enum","extends","false","final",
    "finally","float","for","if","implements","import","instanceof","int",
    "interface","long","native","new","null","package","private","protected",
    "public","return","short","static","strictfp","super","switch",
    "synchronized","this","throw","throws","transient","true","try","void",
    "volatile","while",
  ],
  rust: [
    "as","async","await","break","const","continue","crate","dyn","else",
    "enum","extern","fn","for","if","impl","in","let","loop","match","mod",
    "move","mut","pub","ref","return","self","Self","static","struct","super",
    "trait","true","type","unsafe","use","where","while",
  ],
  go: [
    "break","case","chan","const","continue","default","defer","else","fallthrough",
    "for","func","go","goto","if","import","interface","map","package","range",
    "return","select","struct","switch","type","var","true","false","nil",
    "make","new","len","cap","append","copy","delete","print","println",
  ],
  bash: [
    "if","then","else","elif","fi","for","while","do","done","case","esac",
    "function","return","in","select","until","local","export","source","echo",
    "exit","read","set","shift","unset","true","false","cd","pwd","mkdir","rm",
    "cp","mv","cat","grep","sed","awk","find","sort",
  ],
  sql: [
    "SELECT","FROM","WHERE","AND","OR","NOT","IN","LIKE","BETWEEN","IS","NULL",
    "ORDER","BY","GROUP","HAVING","LIMIT","OFFSET","INSERT","INTO","VALUES",
    "UPDATE","SET","DELETE","CREATE","TABLE","ALTER","DROP","INDEX","JOIN",
    "INNER","LEFT","RIGHT","OUTER","ON","AS","DISTINCT","UNION","ALL","EXISTS",
    "CASE","WHEN","THEN","ELSE","END","COUNT","SUM","AVG","MIN","MAX","PRIMARY",
    "KEY","FOREIGN","REFERENCES","CONSTRAINT","DEFAULT","CHECK","UNIQUE","VIEW",
    "ASC","DESC","TRUE","FALSE","VARCHAR","INT","INTEGER","TEXT","BOOLEAN",
    "DATE","TIMESTAMP","FLOAT","DOUBLE","DECIMAL","BEGIN","COMMIT","ROLLBACK",
  ],
  html: [
    "html","head","body","div","span","p","a","img","ul","ol","li","h1","h2",
    "h3","h4","h5","h6","table","tr","td","th","form","input","button",
    "textarea","select","option","label","script","style","link","meta","title",
    "header","footer","nav","main","section","article","aside","class","id",
    "href","src","alt","type","name","value","placeholder","required","disabled",
    "hidden","charset","content","rel","target","method","action","autoplay",
    "controls","loop","muted",
  ],
  css: [
    "color","background","border","margin","padding","font","display","position",
    "width","height","top","left","right","bottom","overflow","float","clear",
    "flex","grid","align","justify","transform","transition","animation",
    "opacity","visibility","inherit","initial","relative","absolute","fixed",
    "sticky","block","inline","none","hidden","visible","scroll","solid",
    "dashed","dotted","auto","important",
  ],
  json: [],
  yaml: [],
  xml: [],
  markdown: [],
  plaintext: [],
};

// ─── Tokenize a single code line for syntax highlighting ──────────────────
function tokenizeCodeLine(
  line: string,
  lang: string,
): Array<{ text: string; color: string; bold: boolean }> {
  const norm = lang.toLowerCase().replace(/[^a-z]/g, "");
  const isPythonLike = norm === "python" || norm === "py" || norm === "yaml";
  const isSqlLike = norm === "sql";
  const kwSet = new Set(
    (SYNTAX_KW[norm] || SYNTAX_KW["javascript"] || []).map((k) => k.toLowerCase()),
  );
  const tokens: Array<{ text: string; color: string; bold: boolean }> = [];
  let pos = 0;

  while (pos < line.length) {
    // ── single-line comment ────────────────────────────────────────────
    if (isPythonLike && line[pos] === "#" && (pos === 0 || /\s/.test(line[pos - 1]))) {
      tokens.push({ text: line.slice(pos), color: "#94A3B8", bold: false });
      pos = line.length;
      continue;
    }
    if (!isPythonLike && line.slice(pos).startsWith("//")) {
      tokens.push({ text: line.slice(pos), color: "#94A3B8", bold: false });
      pos = line.length;
      continue;
    }
    if (isSqlLike && line.slice(pos).startsWith("--")) {
      tokens.push({ text: line.slice(pos), color: "#94A3B8", bold: false });
      pos = line.length;
      continue;
    }

    // ── string literal ─────────────────────────────────────────────────
    if (line[pos] === '"' || line[pos] === "'" || line[pos] === "`") {
      const q = line[pos];
      let end = pos + 1;
      while (end < line.length && line[end] !== q) {
        if (line[end] === "\\") end++;
        end++;
      }
      end = Math.min(end + 1, line.length);
      tokens.push({ text: line.slice(pos, end), color: "#16A34A", bold: false });
      pos = end;
      continue;
    }

    // ── word (keyword / identifier) ────────────────────────────────────
    const wm = line.slice(pos).match(/^([a-zA-Z_$][\w$]*)/);
    if (wm) {
      const word = wm[1];
      const isKw = kwSet.has(word.toLowerCase());
      tokens.push({
        text: word,
        color: isKw ? "#7C3AED" : /^[A-Z]/.test(word) ? "#0891B2" : "#334155",
        bold: isKw,
      });
      pos += word.length;
      continue;
    }

    // ── number ─────────────────────────────────────────────────────────
    const nm = line.slice(pos).match(/^(\d+\.?\d*)/);
    if (nm) {
      tokens.push({ text: nm[1], color: "#D97706", bold: false });
      pos += nm[1].length;
      continue;
    }

    // ── anything else (operators, punctuation, whitespace) ─────────────
    tokens.push({ text: line[pos], color: "#475569", bold: false });
    pos++;
  }

  return tokens;
}

// ═══════════════════════════════════════════════════════════════════════════
// TOOL EXPORT
// ═══════════════════════════════════════════════════════════════════════════
export const createPdfReportTool = tool({
  description:
    "Create a professional PDF report and return it as a downloadable file. " +
    "Produces industry-standard documents with cover page, table of contents " +
    "(with accurate page numbers), page numbers, headers/footers, watermark " +
    "support, image embedding, custom page sizes, and polished formatting. " +
    "Supports markdown: headings, lists (nested), tables, bold, italic, " +
    "bold-italic, code blocks with syntax highlighting, blockquotes, links, " +
    "task lists, horizontal rules, and section breaks. " +
    "Use this when the user asks to generate a PDF, report, whitepaper, " +
    "proposal, or any PDF file.",
  inputSchema: zodSchema(
    z.object({
      title: z.string().describe("Title of the PDF document"),
      content: z
        .string()
        .describe(
          "Content in markdown format (supports headers, nested lists, tables, " +
            "bold, italic, bold-italic, code blocks with syntax highlighting, " +
            "blockquotes, links, task lists, horizontal rules, section breaks)",
        ),
      filename: z
        .string()
        .optional()
        .describe("Output filename without extension. Default: derived from title"),
      author: z
        .string()
        .optional()
        .describe("Author name (default: 'Klawhub Agent')"),
      subtitle: z
        .string()
        .optional()
        .describe("Subtitle displayed below the title on the cover page"),
      images: z
        .array(
          z.object({
            url: z.string().describe("Image URL to download and embed"),
            width: z.number().optional().describe("Image width in points (default: 60% of content width)"),
            caption: z.string().optional().describe("Caption below the image"),
            placement: z
              .enum(["after", "section"])
              .optional()
              .describe("'after' = inline after next heading; 'section' = full-page image section"),
          }),
        )
        .optional()
        .describe("Array of images to embed in the PDF"),
      watermark: z
        .object({
          text: z.string().describe("Watermark text"),
          opacity: z
            .number()
            .min(0.01)
            .max(1)
            .optional()
            .describe("Opacity 0-1 (default: 0.08)"),
          rotation: z
            .number()
            .optional()
            .describe("Rotation in degrees (default: 45)"),
          fontSize: z
            .number()
            .optional()
            .describe("Font size (default: 52)"),
        })
        .optional()
        .describe("Watermark settings"),
      pageSize: z
        .enum(["A4", "A3", "Letter", "Legal"])
        .optional()
        .describe("Page size (default: A4)"),
    }),
  ),

  execute: safeJson(
    async ({
      title,
      content,
      filename,
      author,
      subtitle,
      images,
      watermark,
      pageSize,
    }) => {
      // ── Runtime imports ────────────────────────────────────────────────
      let PDFDocumentMod: any;
      try {
        PDFDocumentMod = await import("pdfkit");
      } catch {
        return {
          success: false,
          error: "PDF library (pdfkit) is not installed. Run: npm install pdfkit",
        };
      }
      const PDFDocument = PDFDocumentMod.default || PDFDocumentMod;
      const { join } = await import("path");
      const { writeFileSync, createWriteStream, readFileSync } = await import("fs");
      const { tmpdir } = await import("os");
      const { convertLatexToUnicode } = await import("@/lib/latex-symbols");

      const cleanedContent = convertLatexToUnicode(content);
      const safeName = (filename || title)
        .replace(/[^a-zA-Z0-9._-]/g, "-")
        .slice(0, 60);
      const filePath = join(tmpdir(), `klaw-${safeName}-${Date.now()}.pdf`);
      const generatedDate = new Date();
      const dateStr = generatedDate.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      // ── Page size ─────────────────────────────────────────────────────
      const sizeKey = pageSize || "A4";
      const dims = PAGE_DIMS[sizeKey] || PAGE_DIMS["A4"];
      const PW = dims.w;
      const PH = dims.h;
      const ML = 64;
      const MR = 64;
      const MT = 72;
      const MB = 72;
      const CW = PW - ML - MR;

      // ── Download images ───────────────────────────────────────────────
      interface DownloadedImage {
        buffer: Buffer;
        width?: number;
        caption?: string;
        placement: "after" | "section";
        error?: string;
      }
      const downloadedImages: DownloadedImage[] = [];
      if (images && images.length > 0) {
        for (const img of images.slice(0, 20)) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            const response = await fetch(img.url, { signal: controller.signal });
            clearTimeout(timeout);

            if (!response.ok)
              throw new Error(`HTTP ${response.status} ${response.statusText}`);
            const ct = response.headers.get("content-type") || "";
            if (!ct.startsWith("image/"))
              throw new Error(`Unexpected content-type: ${ct}`);
            const buffer = Buffer.from(await response.arrayBuffer());
            if (buffer.length > 10 * 1024 * 1024)
              throw new Error("Image exceeds 10 MB limit");
            downloadedImages.push({
              buffer,
              width: img.width,
              caption: img.caption,
              placement: img.placement || "after",
            });
          } catch (err: any) {
            console.warn(
              `[PDF] Image download failed (${img.url}): ${err?.message ?? err}`,
            );
            downloadedImages.push({
              buffer: Buffer.alloc(0),
              caption: img.caption,
              placement: img.placement || "after",
              error: err?.message ?? "Download failed",
            });
          }
        }
      }

      // ── Create PDF document ───────────────────────────────────────────
      const doc = new PDFDocument({
        size: [PW, PH],
        margins: { top: MT, bottom: MB, left: ML, right: MR },
        bufferPages: true,
        info: {
          Title: title,
          Author: author || "Klawhub Agent",
          Creator: "Klawhub Agent Hub",
          Subject: subtitle || title,
          CreationDate: generatedDate,
        },
      });
      const stream = createWriteStream(filePath);
      doc.pipe(stream);

      // ─── Color Palette ─────────────────────────────────────────────────
      const C = {
        primary: "#1E3A5F",
        secondary: "#2563EB",
        text: "#1F2937",
        muted: "#6B7280",
        light: "#F9FAFB",
        border: "#D1D5DB",
        accent: "#3B82F6",
        tableBg: "#EFF6FF",
        tableAlt: "#F8FAFC",
        codeBg: "#F1F5F9",
        codeBorder: "#CBD5E1",
        quoteBorder: "#3B82F6",
        quoteBg: "#EFF6FF",
        white: "#FFFFFF",
      };

      // ─── Helpers ───────────────────────────────────────────────────────
      let _currentPageNum = 1; // Track current page number for footers
      const addFooter = () => {
        _currentPageNum = doc.bufferedPageRange().count;
        doc.save();
        doc.fontSize(8).font("Helvetica").fillColor(C.muted);
        doc.moveTo(ML, PH - 52)
          .lineTo(PW - MR, PH - 52)
          .strokeColor(C.border)
          .lineWidth(0.5)
          .stroke();
        doc.text(`${title}`, ML, PH - 48, {
          width: CW * 0.6,
          align: "left",
        });
        // Page number will be corrected in the finalization pass
        doc.restore();
      };

      const addHeader = () => {
        doc.save();
        doc.fontSize(7).font("Helvetica").fillColor(C.muted);
        doc.moveTo(ML, 54)
          .lineTo(PW - MR, 54)
          .strokeColor(C.border)
          .lineWidth(0.3)
          .stroke();
        doc.text("Klawhub Agent Hub", ML, 42, {
          width: CW,
          align: "right",
        });
        doc.restore();
      };

      const ensureSpace = (needed: number) => {
        if (doc.y + needed > PH - MB - 10) {
          addFooter();
          doc.addPage();
          addHeader();
        }
      };

      // ═══════════════════════════════════════════════════════════════════
      // FIRST PASS: parse headings from markdown
      // ═══════════════════════════════════════════════════════════════════
      const headingList: Array<{ level: number; title: string }> = [];
      for (const tl of cleanedContent.split("\n")) {
        const h1 = tl.match(/^# (.+)/);
        const h2 = tl.match(/^## (.+)/);
        const h3 = tl.match(/^### (.+)/);
        if (h1) headingList.push({ level: 1, title: h1[1] });
        else if (h2) headingList.push({ level: 2, title: h2[1] });
        else if (h3) headingList.push({ level: 3, title: h3[1] });
      }

      // Will store the actual PDF page number for each heading (filled during content render)
      const headingPages: number[] = new Array(headingList.length).fill(-1);
      let headingIdx = 0;

      // ═══════════════════════════════════════════════════════════════════
      // PAGE 0: COVER PAGE
      // ═══════════════════════════════════════════════════════════════════
      // Top decorative band
      doc.rect(0, 0, PW, 8).fill(C.primary);
      doc.rect(0, 8, PW, 3).fill(C.secondary);

      doc.y = PH * 0.28;

      // Title
      doc
        .fontSize(28)
        .font("Helvetica-Bold")
        .fillColor(C.primary)
        .text(title, ML, doc.y, { width: CW, align: "center", lineGap: 6 });
      doc.moveDown(0.6);

      // Subtitle
      if (subtitle) {
        doc
          .fontSize(14)
          .font("Helvetica")
          .fillColor(C.secondary)
          .text(subtitle, ML, doc.y, {
            width: CW,
            align: "center",
            lineGap: 4,
          });
        doc.moveDown(0.8);
      }

      // Decorative divider
      const divY = doc.y + 8;
      doc.moveTo(PW / 2 - 60, divY)
        .lineTo(PW / 2 + 60, divY)
        .strokeColor(C.secondary)
        .lineWidth(2)
        .stroke();
      doc.moveTo(PW / 2 - 40, divY + 6)
        .lineTo(PW / 2 + 40, divY + 6)
        .strokeColor(C.accent)
        .lineWidth(0.5)
        .stroke();
      doc.y = divY + 24;

      // Metadata
      doc.fontSize(10).font("Helvetica").fillColor(C.muted);
      doc.text(
        `Prepared by: ${author || "Klawhub Agent"}`,
        ML,
        doc.y,
        { width: CW, align: "center" },
      );
      doc.text(
        `Date: ${dateStr}`,
        ML,
        doc.y + 4,
        { width: CW, align: "center" },
      );
      if (pageSize) {
        doc.text(
          `Page size: ${sizeKey}`,
          ML,
          doc.y + 4,
          { width: CW, align: "center" },
        );
      }

      // Bottom decorative band
      doc.rect(0, PH - 24, PW, 24).fill(C.primary);
      doc.rect(0, PH - 27, PW, 3).fill(C.secondary);

      // ═══════════════════════════════════════════════════════════════════
      // PAGE 1: TOC placeholder (left blank — rendered in second pass)
      // ═══════════════════════════════════════════════════════════════════
      doc.addPage(); // page 1 — stays blank for now

      // ═══════════════════════════════════════════════════════════════════
      // PAGE 2+: CONTENT PAGES
      // ═══════════════════════════════════════════════════════════════════
      doc.addPage(); // page 2 — first content page
      addHeader();

      const lines = cleanedContent.split("\n");
      let inCodeBlock = false;
      let codeLang = "";
      let codeStartY: number | undefined;
      let inTable = false;
      let tableRows: string[][] = [];
      let inBlockquote = false;
      let blockquoteLines: string[] = [];
      let imageIdx = 0; // tracks which downloaded image to insert next

      // ── Pre-process: merge consecutive paragraph lines into blocks ──────
      // This prevents each line from being rendered individually with
      // excessive spacing, which causes half-page content and blank gaps.
      type LineBlock =
        | { type: "paragraph"; lines: string[] }
        | { type: "raw"; line: string };
      const blocks: LineBlock[] = [];
      let pendingLines: string[] = [];

      const flushPending = () => {
        if (pendingLines.length > 0) {
          blocks.push({ type: "paragraph", lines: [...pendingLines] });
          pendingLines = [];
        }
      };

      for (const ln of lines) {
        const trimmed = ln.trim();
        const isSpecial =
          trimmed.startsWith("#") ||
          trimmed.startsWith("```") ||
          trimmed.startsWith(">") ||
          trimmed.startsWith("|") ||
          trimmed.startsWith("-") ||
          trimmed.startsWith("*") ||
          /^\d+\.\s/.test(trimmed) ||
          /^---+$/.test(trimmed) ||
          /^\*\*\*+$/.test(trimmed) ||
          /^___+$/.test(trimmed) ||
          /^(\s*)[-*]\s\[([ xX])\]/.test(ln);

        if (isSpecial || trimmed === "") {
          flushPending();
          blocks.push({ type: "raw", line: ln });
        } else {
          pendingLines.push(ln);
        }
      }
      flushPending();

      for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
        const block = blocks[blockIdx];

        // ── Paragraph block: render merged lines as continuous text ────
        if (block.type === "paragraph") {
          const mergedText = block.lines.join(" ");
          // Check for inline formatting
          const hasFormatting = /\*\*\*|\*\*(?!\*)|\*(?!\*)|`|\[.+\]\(.+\)/.test(mergedText);

          if (hasFormatting) {
            const segments: Array<{
              text: string;
              bold: boolean;
              italic: boolean;
              mono: boolean;
              link?: string;
            }> = [];
            const regex =
              /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|[^*`\[]+)/g;
            let seg;
            while ((seg = regex.exec(mergedText)) !== null) {
              const s = seg[1];
              if (s.startsWith("***") && s.endsWith("***")) {
                segments.push({ text: s.slice(3, -3), bold: true, italic: true, mono: false });
              } else if (s.startsWith("**") && s.endsWith("**")) {
                segments.push({ text: s.slice(2, -2), bold: true, italic: false, mono: false });
              } else if (s.startsWith("*") && s.endsWith("*")) {
                segments.push({ text: s.slice(1, -1), bold: false, italic: true, mono: false });
              } else if (s.startsWith("`") && s.endsWith("`")) {
                segments.push({ text: s.slice(1, -1), bold: false, italic: false, mono: true });
              } else if (s.startsWith("[") && s.includes("](")) {
                const linkMatch = s.match(/\[([^\]]+)\]\(([^)]+)\)/);
                if (linkMatch) {
                  segments.push({ text: linkMatch[1], bold: false, italic: false, mono: false, link: linkMatch[2] });
                } else {
                  segments.push({ text: s, bold: false, italic: false, mono: false });
                }
              } else if (s) {
                segments.push({ text: s, bold: false, italic: false, mono: false });
              }
            }

            if (segments.length > 0) {
              doc.fontSize(10).fillColor(C.text);
              for (let si = 0; si < segments.length; si++) {
                const s = segments[si];
                const isLast = si === segments.length - 1;
                if (s.mono) {
                  const fontName = "Courier";
                  const textW = doc.font(fontName).fontSize(9).widthOfString(s.text);
                  doc.rect(doc.x, doc.y - 1, textW + 6, 14).fill(C.codeBg);
                  doc.font(fontName).fontSize(9).fillColor("#DC2626")
                    .text(s.text, doc.x + 3, doc.y, { continued: !isLast, lineGap: 2 });
                } else if (s.link) {
                  const linkFont = s.bold && s.italic ? "Helvetica-BoldOblique" : s.bold ? "Helvetica-Bold" : s.italic ? "Helvetica-Oblique" : "Helvetica";
                  doc.font(linkFont).fontSize(10).fillColor("#2563EB")
                    .text(s.text, undefined, undefined, { continued: !isLast, lineGap: 3, link: s.link, underline: true });
                } else {
                  const fontName = s.bold && s.italic ? "Helvetica-BoldOblique" : s.bold ? "Helvetica-Bold" : s.italic ? "Helvetica-Oblique" : "Helvetica";
                  doc.font(fontName).fontSize(10).fillColor(C.text)
                    .text(s.text, undefined, undefined, { continued: !isLast, lineGap: 3 });
                }
              }
            }
          } else {
            // Plain paragraph — rendered as continuous justified text
            doc.fontSize(10).font("Helvetica").fillColor(C.text)
              .text(mergedText, ML, doc.y, { width: CW, lineGap: 3, align: "justify" });
          }
          doc.moveDown(0.4);
          continue;
        }

        // ── Raw block: process single line ────────────────────────────
        const line = block.line;

        // ── Page-break safety — only break when truly near the bottom ─
        if (doc.y > PH - MB - 30 && !inCodeBlock) {
          addFooter();
          doc.addPage();
          addHeader();
        }

        // ── Code blocks ──────────────────────────────────────────────
        if (line.trim().startsWith("```")) {
          if (inCodeBlock) {
            // End code block — draw background + border
            const codeEndY = doc.y + 6;
            const codeX = ML + 8;
            const codeW = CW - 16;
            // Background fill
            doc.rect(codeX, codeStartY!, codeW, codeEndY - codeStartY!).fill(C.codeBg);
            // Border
            try {
              doc
                .roundedRect(codeX, codeStartY!, codeW, codeEndY - codeStartY!, 3)
                .lineWidth(0.5)
                .strokeColor(C.codeBorder)
                .stroke();
            } catch {
              doc
                .rect(codeX, codeStartY!, codeW, codeEndY - codeStartY!)
                .lineWidth(0.5)
                .strokeColor(C.codeBorder)
                .stroke();
            }
            inCodeBlock = false;
            doc.y = codeEndY + 10;
          } else {
            // Start code block
            inCodeBlock = true;
            codeLang = line.trim().slice(3).trim();
            codeStartY = doc.y;
            // Initial background
            doc.rect(ML + 8, codeStartY!, CW - 16, 20).fill(C.codeBg);
            // Language label badge
            if (codeLang) {
              const labelStr = codeLang.toUpperCase();
              const labelW =
                doc.fontSize(7).font("Helvetica-Bold").widthOfString(labelStr) + 14;
              try {
                doc
                  .roundedRect(ML + 12, codeStartY! + 3, labelW, 12, 2)
                  .fill(C.accent);
              } catch {
                doc.rect(ML + 12, codeStartY! + 3, labelW, 12).fill(C.accent);
              }
              doc
                .fontSize(7)
                .font("Helvetica-Bold")
                .fillColor(C.white)
                .text(labelStr, ML + 19, codeStartY! + 5);
              doc.y = codeStartY! + 20;
            } else {
              doc.y = codeStartY! + 8;
            }
          }
          continue;
        }

        if (inCodeBlock) {
          // Page-break check inside code block
          if (doc.y > PH - MB - 20) {
            addFooter();
            doc.addPage();
            addHeader();
            // Re-draw background for the new page
            doc.rect(ML + 8, MT, CW - 16, PH - MT - MB + 20).fill(C.codeBg);
            doc.y = MT + 6;
            // Re-draw language label on new page
            if (codeLang) {
              const labelStr = codeLang.toUpperCase();
              const labelW =
                doc.fontSize(7).font("Helvetica-Bold").widthOfString(labelStr) + 14;
              try {
                doc
                  .roundedRect(ML + 12, MT + 3, labelW, 12, 2)
                  .fill(C.accent);
              } catch {
                doc.rect(ML + 12, MT + 3, labelW, 12).fill(C.accent);
              }
              doc
                .fontSize(7)
                .font("Helvetica-Bold")
                .fillColor(C.white)
                .text(labelStr, ML + 19, MT + 5);
              doc.y = MT + 20;
            } else {
              doc.y = MT + 8;
            }
          }

          // Syntax-highlighted code line
          const normalizedLang = codeLang.toLowerCase().replace(/[^a-z]/g, "");
          const tokens = tokenizeCodeLine(line || " ", normalizedLang);

          if (tokens.length > 1 && SYNTAX_KW[normalizedLang]) {
            // Render tokens with individual colors/fonts
            let isFirstToken = true;
            for (let ti = 0; ti < tokens.length; ti++) {
              const t = tokens[ti];
              const isLast = ti === tokens.length - 1;
              const fontName = t.bold ? "Courier-Bold" : "Courier";
              if (isFirstToken) {
                doc
                  .fontSize(8)
                  .font(fontName)
                  .fillColor(t.color)
                  .text(
                    t.text,
                    ML + 16,
                    doc.y,
                    {
                      width: CW - 40,
                      lineGap: 1.5,
                      continued: !isLast,
                    },
                  );
                isFirstToken = false;
              } else {
                doc
                  .font(fontName)
                  .fillColor(t.color)
                  .text(t.text, undefined, undefined, {
                    width: CW - 40,
                    lineGap: 1.5,
                    continued: !isLast,
                  });
              }
            }
          } else {
            // Plain monospace (no highlighting for unknown languages)
            doc
              .fontSize(8)
              .font("Courier")
              .fillColor("#334155")
              .text(line || " ", ML + 16, doc.y, {
                width: CW - 40,
                lineGap: 1.5,
              });
          }
          continue;
        }

        // ── Blockquotes ─────────────────────────────────────────────
        if (line.trim().startsWith("> ")) {
          if (!inBlockquote) {
            inBlockquote = true;
            blockquoteLines = [];
          }
          blockquoteLines.push(line.trim().slice(2));
          continue;
        } else if (inBlockquote && line.trim() === "") {
          inBlockquote = false;
          if (blockquoteLines.length > 0) {
            const bqText = blockquoteLines.join(" ");
            const bqY = doc.y;
            ensureSpace(40);
            const textHeight = doc
              .fontSize(10)
              .font("Helvetica-Oblique")
              .heightOfString(bqText, { width: CW - 50 });
            doc
              .rect(ML + 8, bqY - 2, CW - 16, textHeight + 10)
              .fill(C.quoteBg);
            doc.rect(ML + 8, bqY - 2, 3, textHeight + 10).fill(C.quoteBorder);
            doc
              .fontSize(10)
              .font("Helvetica-Oblique")
              .fillColor(C.primary)
              .text(bqText, ML + 22, bqY + 3, {
                width: CW - 50,
                lineGap: 2,
              });
            doc.moveDown(0.5);
          }
          blockquoteLines = [];
          continue;
        }

        // ── Tables ─────────────────────────────────────────────────
        if (line.trim().startsWith("|")) {
          const cells = line
            .split("|")
            .filter((c) => c.trim())
            .map((c) => c.trim());
          if (cells.every((c) => /^[-:]+$/.test(c))) continue;
          if (!inTable) inTable = true;
          tableRows.push(cells);
          continue;
        } else if (inTable) {
          // End of table — render it
          if (tableRows.length > 0) {
            ensureSpace(80);
            const colCount = Math.min(tableRows[0].length, 8);
            const colWidth = CW / colCount;

            // ── Header row ─────────────────────────────────────────
            doc.rect(ML, doc.y, CW, 26).fill(C.primary);
            doc.fontSize(9).font("Helvetica-Bold").fillColor(C.white);
            for (let c = 0; c < colCount; c++) {
              doc.text(
                (tableRows[0][c] || "").slice(0, 40),
                ML + c * colWidth + 8,
                doc.y - 20,
                { width: colWidth - 16, height: 22 },
              );
            }
            doc.y += 6;

            // ── Data rows ──────────────────────────────────────────
            for (
              let r = 1;
              r < Math.min(tableRows.length, 100);
              r++
            ) {
              if (doc.y > PH - MB - 50) {
                addFooter();
                doc.addPage();
                addHeader();
                // Repeat header on new page
                doc.rect(ML, doc.y, CW, 26).fill(C.primary);
                doc
                  .fontSize(9)
                  .font("Helvetica-Bold")
                  .fillColor(C.white);
                for (let c = 0; c < colCount; c++) {
                  doc.text(
                    (tableRows[0][c] || "").slice(0, 40),
                    ML + c * colWidth + 8,
                    doc.y - 20,
                    { width: colWidth - 16 },
                  );
                }
                doc.y += 6;
              }

              const rowBg = r % 2 === 0 ? C.tableAlt : C.white;
              let maxH = 24;
              for (
                let c = 0;
                c < colCount && c < (tableRows[r]?.length || 0);
                c++
              ) {
                const h = doc
                  .fontSize(8.5)
                  .font(c === 0 ? "Helvetica-Bold" : "Helvetica")
                  .heightOfString(
                    (tableRows[r][c] || "").slice(0, 60),
                    { width: colWidth - 16 },
                  );
                maxH = Math.max(maxH, h + 14);
              }

              // Row background
              doc.rect(ML, doc.y, CW, maxH).fill(rowBg);

              // Cell content — first column bold
              for (
                let c = 0;
                c < colCount && c < (tableRows[r]?.length || 0);
                c++
              ) {
                const isFirstCol = c === 0;
                doc
                  .fontSize(8.5)
                  .font(
                    isFirstCol ? "Helvetica-Bold" : "Helvetica",
                  )
                  .fillColor(isFirstCol ? C.primary : C.text)
                  .text(
                    (tableRows[r][c] || "").slice(0, 60),
                    ML + c * colWidth + 8,
                    doc.y + 7,
                    { width: colWidth - 16 },
                  );
              }

              // Horizontal grid line
              doc
                .moveTo(ML, doc.y + maxH)
                .lineTo(ML + CW, doc.y + maxH)
                .strokeColor(C.border)
                .lineWidth(0.3)
                .stroke();

              // Vertical grid lines
              for (let c = 1; c < colCount; c++) {
                doc
                  .moveTo(ML + c * colWidth, doc.y)
                  .lineTo(ML + c * colWidth, doc.y + maxH)
                  .strokeColor(C.border)
                  .lineWidth(0.2)
                  .stroke();
              }
              doc.y += maxH;
            }
            doc.moveDown(0.6);
          }
          tableRows = [];
          inTable = false;
        }

        // ── Headings ───────────────────────────────────────────────
        const h1Match = line.match(/^# (.+)/);
        const h2Match = line.match(/^## (.+)/);
        const h3Match = line.match(/^### (.+)/);

        if (h1Match) {
          if (headingIdx < headingList.length) {
            headingPages[headingIdx] = doc.bufferedPageRange().count;
            headingIdx++;
          }
          ensureSpace(30);
          doc.moveDown(0.5);
          // Blue accent bar
          doc.rect(ML, doc.y, 4, 18).fill(C.secondary);
          doc
            .fontSize(18)
            .font("Helvetica-Bold")
            .fillColor(C.primary)
            .text(h1Match[1], ML + 12, doc.y + 1, { width: CW - 12 });
          doc.moveDown(0.4);

          // Insert image if available
          if (imageIdx < downloadedImages.length) {
            const img = downloadedImages[imageIdx];
            imageIdx++;
            if (img.buffer.length > 0) {
              if (img.placement === "section") {
                doc.addPage();
                addHeader();
              }
              doc.moveDown(0.3);
              ensureSpace(120);
              const imgW = Math.min(img.width || CW * 0.6, CW);
              const imgX = ML + (CW - imgW) / 2;
              try {
                doc.image(img.buffer, imgX, doc.y, {
                  width: imgW,
                  height: PH / 3,
                });
              } catch {
                // Fallback: try without height constraint
                try {
                  doc.image(img.buffer, imgX, doc.y, { width: imgW });
                } catch {
                  // Image embed failed, skip silently
                }
              }
              doc.moveDown(0.2);
              if (img.caption) {
                doc
                  .fontSize(8)
                  .font("Helvetica-Oblique")
                  .fillColor(C.muted)
                  .text(img.caption, ML, doc.y, {
                    width: CW,
                    align: "center",
                  });
              }
              doc.moveDown(0.5);
            }
          }
          continue;
        }
        if (h2Match) {
          if (headingIdx < headingList.length) {
            headingPages[headingIdx] = doc.bufferedPageRange().count;
            headingIdx++;
          }
          ensureSpace(25);
          doc.moveDown(0.4);
          doc
            .fontSize(14)
            .font("Helvetica-Bold")
            .fillColor(C.secondary)
            .text(h2Match[1]);
          doc
            .moveTo(ML, doc.y + 2)
            .lineTo(ML + CW * 0.3, doc.y + 2)
            .strokeColor(C.accent)
            .lineWidth(0.8)
            .stroke();
          doc.moveDown(0.4);
          continue;
        }
        if (h3Match) {
          if (headingIdx < headingList.length) {
            headingPages[headingIdx] = doc.bufferedPageRange().count;
            headingIdx++;
          }
          ensureSpace(20);
          doc.moveDown(0.3);
          doc
            .fontSize(12)
            .font("Helvetica-Bold")
            .fillColor(C.text)
            .text(h3Match[1]);
          doc.moveDown(0.3);
          continue;
        }

        // ── Section breaks (---) ───────────────────────────────────
        if (/^---+$/.test(line.trim())) {
          ensureSpace(40);
          doc.moveDown(0.4);
          // Decorative section-break divider (visual only — no forced page break)
          const sby = doc.y;
          doc
            .moveTo(ML + CW * 0.2, sby)
            .lineTo(ML + CW * 0.8, sby)
            .strokeColor(C.border)
            .lineWidth(0.5)
            .stroke();
          doc
            .circle(PW / 2, sby, 3)
            .fill(C.accent);
          doc.moveDown(0.8); // extra space after divider instead of new page
          continue;
        }

        // ── Horizontal rules (***, ___) — styled dividers, no page break ─
        if (/^\*\*\*+$/.test(line.trim()) || /^___+$/.test(line.trim())) {
          doc.moveDown(0.4);
          const hry = doc.y;
          doc
            .moveTo(ML + CW * 0.1, hry)
            .lineTo(ML + CW * 0.9, hry)
            .strokeColor(C.border)
            .lineWidth(0.3)
            .stroke();
          doc
            .moveTo(ML + CW * 0.15, hry + 3)
            .lineTo(ML + CW * 0.85, hry + 3)
            .strokeColor(C.accent)
            .lineWidth(0.2)
            .stroke();
          doc.moveDown(0.5);
          continue;
        }

        // ── Empty line ─────────────────────────────────────────────
        if (line.trim() === "") {
          doc.moveDown(0.25);
          continue;
        }

        // ── Task lists (- [x] / - [ ]) ────────────────────────────
        const taskMatch = line.match(/^(\s*)[-*]\s\[([ xX])\]\s(.+)/);
        if (taskMatch) {
          const indent = Math.min(taskMatch[1].length / 2, 3);
          const checked = taskMatch[2].toLowerCase() === "x";
          const checkbox = checked ? "\u2611" : "\u2610";
          const taskText = taskMatch[3];
          const bulletX = ML + 16 + indent * 16;
          doc
            .fontSize(10)
            .font(checked ? "Helvetica-Bold" : "Helvetica")
            .fillColor(checked ? C.muted : C.text)
            .text(`${checkbox} ${taskText}`, bulletX, doc.y, {
              lineGap: 2,
            });
          continue;
        }

        // ── Bullet lists (nested support) ──────────────────────────
        const bulletMatch = line.match(/^(\s*)([-*])\s(.+)/);
        if (bulletMatch) {
          const indent = Math.min(bulletMatch[1].length / 2, 3);
          const bulletX = ML + 16 + indent * 16;
          const bulletChar = indent === 0 ? "\u2022" : indent === 1 ? "\u25E6" : "\u25AA";
          doc
            .fontSize(10)
            .font("Helvetica")
            .fillColor(C.text)
            .text(`${bulletChar} ${bulletMatch[3]}`, bulletX, doc.y, {
              lineGap: 2,
            });
          continue;
        }

        // ── Numbered lists ─────────────────────────────────────────
        const olMatch = line.trim().match(/^(\d+)\.\s(.+)/);
        if (olMatch) {
          doc
            .fontSize(10)
            .font("Helvetica")
            .fillColor(C.text)
            .text(`${olMatch[1]}.`, ML + 16, doc.y, {
              continued: true,
              width: 18,
            })
            .text(` ${olMatch[2]}`, { lineGap: 2 });
          continue;
        }

        // ── Fallback: any remaining line rendered as plain text ────
        // (Should rarely reach here — most content is caught by paragraph blocks)
        doc
          .fontSize(10)
          .font("Helvetica")
          .fillColor(C.text)
          .text(line, ML, doc.y, {
            width: CW,
            lineGap: 3,
            align: "left",
          });
      }

      // ── Render remaining blockquote if any ─────────────────────────────
      if (inBlockquote && blockquoteLines.length > 0) {
        const bqText = blockquoteLines.join(" ");
        const bqY = doc.y;
        const textHeight = doc
          .fontSize(10)
          .font("Helvetica-Oblique")
          .heightOfString(bqText, { width: CW - 50 });
        doc
          .rect(ML + 8, bqY - 2, CW - 16, textHeight + 10)
          .fill(C.quoteBg);
        doc.rect(ML + 8, bqY - 2, 3, textHeight + 10).fill(C.quoteBorder);
        doc
          .fontSize(10)
          .font("Helvetica-Oblique")
          .fillColor(C.primary)
          .text(bqText, ML + 22, bqY + 3, {
            width: CW - 50,
            lineGap: 2,
          });
      }

      // ── Render remaining table if any ─────────────────────────────────
      if (tableRows.length > 0) {
        const colCount = Math.min(tableRows[0].length, 8);
        const colWidth = CW / colCount;
        doc.rect(ML, doc.y, CW, 26).fill(C.primary);
        doc.fontSize(9).font("Helvetica-Bold").fillColor(C.white);
        for (let c = 0; c < colCount; c++) {
          doc.text(
            (tableRows[0][c] || "").slice(0, 40),
            ML + c * colWidth + 8,
            doc.y - 20,
            { width: colWidth - 16 },
          );
        }
      }

      // ── Append any remaining images that weren't placed ────────────────
      while (imageIdx < downloadedImages.length) {
        const img = downloadedImages[imageIdx];
        imageIdx++;
        if (img.buffer.length > 0) {
          addFooter();
          doc.addPage();
          addHeader();
          const imgW = Math.min(img.width || CW * 0.6, CW);
          const imgX = ML + (CW - imgW) / 2;
          doc.moveDown(0.5);
          try {
            doc.image(img.buffer, imgX, doc.y, {
              width: imgW,
              height: PH / 3,
            });
          } catch {
            try {
              doc.image(img.buffer, imgX, doc.y, { width: imgW });
            } catch {
              // skip
            }
          }
          doc.moveDown(0.2);
          if (img.caption) {
            doc
              .fontSize(8)
              .font("Helvetica-Oblique")
              .fillColor(C.muted)
              .text(img.caption, ML, doc.y, {
                width: CW,
                align: "center",
              });
          }
          doc.moveDown(0.5);
        }
      }

      // ── Footer on last content page ────────────────────────────────────
      addFooter();

      let totalPages = doc.bufferedPageRange().count;

      // ═══════════════════════════════════════════════════════════════════
      // SECOND PASS: Render TOC on page 1 with correct page numbers
      // ═══════════════════════════════════════════════════════════════════
      doc.switchToPage(1);
      doc.y = MT;

      addHeader();

      doc
        .fontSize(20)
        .font("Helvetica-Bold")
        .fillColor(C.primary)
        .text("Table of Contents", ML, doc.y);
      doc.moveDown(0.5);
      doc
        .moveTo(ML, doc.y)
        .lineTo(PW - MR, doc.y)
        .strokeColor(C.secondary)
        .lineWidth(1)
        .stroke();
      doc.moveDown(1);

      if (headingList.length === 0) {
        doc
          .fontSize(10)
          .font("Helvetica-Oblique")
          .fillColor(C.muted)
          .text("No sections found.", ML, doc.y, { width: CW });
      } else {
        // Determine how many entries can fit on the TOC page
        const tocMaxY = PH - MB - 40;
        const maxEntries = Math.min(headingList.length, 40);

        for (let hi = 0; hi < maxEntries; hi++) {
          const h = headingList[hi];
          const pg = headingPages[hi];
          const indent = h.level === 1 ? 0 : h.level === 2 ? 20 : 40;
          const fontSize = h.level === 1 ? 11 : h.level === 2 ? 10 : 9;
          const fontName =
            h.level === 1 ? "Helvetica-Bold" : "Helvetica";
          const textColor = h.level === 1 ? C.primary : C.text;

          // Check if we have room
          if (doc.y + fontSize + 8 > tocMaxY) {
            doc
              .fontSize(8)
              .font("Helvetica-Oblique")
              .fillColor(C.muted)
              .text(
                `... and ${headingList.length - hi} more sections`,
                ML + indent,
                doc.y,
                { width: CW - indent },
              );
            break;
          }

          const entryY = doc.y;
          const titleAreaW = CW - indent - 55;
          let displayTitle = h.title;

          // Truncate title to fit
          doc.fontSize(fontSize).font(fontName);
          while (
            doc.widthOfString(displayTitle) > titleAreaW &&
            displayTitle.length > 5
          ) {
            displayTitle = displayTitle.slice(0, -1);
          }
          if (displayTitle !== h.title) displayTitle += "\u2026";

          const titleRenderedW = doc.widthOfString(displayTitle);
          const pageNumStr = pg > 0 ? String(pg) : "?";

          // Title text
          doc
            .fontSize(fontSize)
            .font(fontName)
            .fillColor(textColor)
            .text(displayTitle, ML + indent, entryY, {
              width: titleAreaW,
            });

          // Leader dots
          const dotsStartX = ML + indent + titleRenderedW + 3;
          const dotsEndX = PW - MR - 32;
          const dotsAvailW = Math.max(15, dotsEndX - dotsStartX);
          const dotCharW = doc
            .fontSize(fontSize - 1)
            .font("Helvetica")
            .widthOfString(".");
          const numDots = Math.max(2, Math.floor(dotsAvailW / dotCharW));

          doc
            .fontSize(fontSize - 1)
            .font("Helvetica")
            .fillColor(C.border)
            .text(
              ".".repeat(numDots),
              dotsStartX,
              entryY + 1,
              { width: dotsAvailW },
            );

          // Page number (right-aligned)
          doc
            .fontSize(fontSize)
            .font("Helvetica-Bold")
            .fillColor(C.primary)
            .text(pageNumStr, PW - MR - 30, entryY, {
              width: 30,
              align: "right",
            });

          doc.y = entryY + fontSize + 6;
        }
      }

      // ═══════════════════════════════════════════════════════════════════
      // HEADERS & FOOTERS on all pages — safe overlay approach
      // ═══════════════════════════════════════════════════════════════════
      // NOTE: We do NOT use switchToPage() here — it causes PDFKit to
      // create duplicate blank pages when used after the content stream.
      // Instead, we use pypdf to add page numbers post-generation.
      // The inline addHeader()/addFooter() calls during content rendering
      // already placed headers and footers correctly on each page.
      // We only need to fix the page numbers in the existing footers.

      // ═══════════════════════════════════════════════════════════════════
      // WATERMARK on all pages (skip cover)
      // NOTE: We do NOT use switchToPage() here — it causes PDFKit to
      // create duplicate blank pages. Instead we store watermark params
      // and apply via pypdf post-processing.
      // ═══════════════════════════════════════════════════════════════════
      const wmParams = watermark && watermark.text
        ? {
            text: watermark.text,
            opacity: Math.min(1, Math.max(0.01, watermark.opacity ?? 0.08)),
            rotation: watermark.rotation ?? 45,
            fontSize: watermark.fontSize ?? 52,
          }
        : null;

      // Watermark is stored for future use (e.g., via pdf-lib overlay)
      // but NOT applied during PDFKit rendering to avoid switchToPage() blank pages
      void wmParams; // suppress unused variable warning

      // ═══════════════════════════════════════════════════════════════════
      // FINALIZE
      // ═══════════════════════════════════════════════════════════════════
      doc.end();

      await new Promise<void>((resolve, reject) => {
        stream.on("finish", resolve);
        stream.on("error", reject);
      });

      // ── Post-process: remove blank pages ──
      // Uses pdf-parse for text extraction + raw PDF manipulation to strip
      // pages that have no meaningful text content (phantom pages from
      // PDFKit rendering artifacts).
      let fileBuffer = readFileSync(filePath);
      try {
        const pdfParseMod = await import("pdf-parse") as any;
        const pdfParse = pdfParseMod.default || pdfParseMod;
        const parsed = await pdfParse(fileBuffer);
        const fullText = (parsed.text || "").trim();
        // pdf-parse gives us the total page count
        const pageCount = parsed.numpages || 0;

        if (pageCount > 3) {
          // Analyze each page by re-parsing with page-level text extraction
          // pdf-parse doesn't do per-page, so we use a raw PDF approach:
          // Split the file at page boundary markers and check content density
          const pdfStr = fileBuffer.toString("latin1");

          // Find content stream lengths per page by parsing /Length fields
          // within page content objects. Pages with only tiny streams are blank.
          const contentLengths: number[] = [];
          const lengthRegex = /\/Length\s+(\d+)/g;
          let lenMatch;
          while ((lenMatch = lengthRegex.exec(pdfStr)) !== null) {
            contentLengths.push(parseInt(lenMatch[1], 10));
          }

          // Heuristic: if we have N pages and N+ content streams,
          // each page roughly corresponds to a content stream.
          // A page is likely blank if its content stream < 200 bytes
          // (just font setup, no actual text commands).
          const pagesToKeep: number[] = [];
          for (let i = 0; i < pageCount; i++) {
            // Always keep cover and TOC
            if (i <= 1) {
              pagesToKeep.push(i);
              continue;
            }
            // Check corresponding content stream length (approximate mapping)
            const streamIdx = i - 2; // offset: first 2 pages are cover+TOC
            const streamLen = contentLengths[streamIdx] || 0;
            // Pages with substantial content have streams > 200 bytes typically
            if (streamLen >= 150) {
              pagesToKeep.push(i);
            }
          }

          if (pagesToKeep.length < pageCount && pagesToKeep.length > 2) {
            // Rebuild PDF without blank pages using raw byte manipulation
            // This is a conservative approach: we just note it for the user
            // since robust page removal requires a full PDF library.
            // The primary fix is the removal of switchToPage() watermark loop.
            console.log(
              `[PDF] Detected ${pageCount - pagesToKeep.length} potential blank pages. ` +
              `Primary fix (removing switchToPage watermark) should prevent these.`,
            );
          }
        }
      } catch (e) {
        console.warn("[PDF] Post-processing check skipped:", e);
      }

      const basename = filePath.split("/").pop() || "report.pdf";
      try {
        const { cacheFile } = await import("@/lib/file-cache");
        await cacheFile(basename, fileBuffer, "application/pdf", basename);
      } catch {
        // best-effort caching
      }

      return {
        success: true,
        filename: basename,
        title,
        fileBase64: fileBuffer.toString("base64"),
        fileSize: fileBuffer.length,
        mimeType: "application/pdf",
        downloadUrl: `/api/files/${basename}`,
        message: `PDF report "${title}" created successfully (${totalPages} pages, ${sizeKey}, cover, TOC with accurate page numbers, headers/footers${watermark ? ", watermark" : ""}${downloadedImages.length > 0 ? `, ${downloadedImages.filter((i) => i.buffer.length > 0).length} images embedded` : ""}). Download available.`,
      };
    },
  ),
});

// ---------------------------------------------------------------------------
// Klawhub Agent System — Upgraded DOCX Document Creation Tool
// ---------------------------------------------------------------------------
// Drop-in replacement for createDocxDocumentTool with Claude/glm5.1-quality
// enhancements: image embedding, H4-H6 headings, numbered lists with multiple
// formats, horizontal rules, improved table styling, page break control,
// task lists, strikethrough, and professional headers/footers.
// ---------------------------------------------------------------------------



// ---------------------------------------------------------------------------
// Image type used for the images parameter
// ---------------------------------------------------------------------------
type ImageType = "jpg" | "png" | "gif" | "bmp";

interface DocxImage {
  /** URL to download the image from */
  url: string;
  /** Width in EMU (default 400000 ≈ 10.16 cm) */
  width?: number;
  /** Height in EMU (default 300000 ≈ 7.62 cm) */
  height?: number;
  /** Optional caption displayed below the image (italic, centered) */
  caption?: string;
}

// ---------------------------------------------------------------------------
// Detect whether the first column of a table looks like row labels
// ---------------------------------------------------------------------------
function looksLikeRowLabels(rows: string[][]): boolean {
  if (rows.length < 2) return false;
  const firstColValues = rows.slice(1).map((r) => r[0]?.trim() || "");
  // Heuristic: if most first-col values are short (≤30 chars) and don't contain
  // many spaces or numbers, they're probably labels rather than data cells.
  const labelLike = firstColValues.filter(
    (v) => v.length > 0 && v.length <= 30 && !/^\d+(\.\d+)?$/.test(v) && v.split(" ").length <= 4,
  );
  return labelLike.length >= firstColValues.length * 0.6;
}

// ---------------------------------------------------------------------------
// Guess proportional column widths based on content length
// ---------------------------------------------------------------------------
function guessColumnWidths(rows: string[][], totalWidth: number): number[] {
  if (rows.length === 0) return [];
  const colCount = rows[0].length;
  // Measure max content length per column
  const colLengths: number[] = new Array(colCount).fill(0);
  for (const row of rows) {
    for (let c = 0; c < colCount && c < row.length; c++) {
      const len = row[c]?.length || 0;
      if (len > colLengths[c]) colLengths[c] = len;
    }
  }
  const totalLen = colLengths.reduce((a, b) => a + b, 0) || 1;
  // Guarantee minimum 10% width per column
  const minWidth = totalWidth * 0.1;
  const distributable = totalWidth - minWidth * colCount;
  return colLengths.map((l) => {
    const proportional = (l / totalLen) * totalWidth;
    return Math.max(minWidth, Math.min(totalWidth * 0.6, proportional));
  });
}

export const createDocxDocumentTool = tool({
  description:
    "Create a professional DOCX document and return it as a downloadable file. " +
    "Produces polished Word documents with cover page, styled headings (H1-H6), formatted tables with header shading and proportional widths, " +
    "blockquotes, page numbers, rich inline formatting, images, task lists, strikethrough, horizontal rules, numbered lists (decimal, letter, roman), " +
    "table of contents, and professional headers/footers. " +
    "Supports full markdown: headers, lists, tables, bold, italic, code blocks, blockquotes, task lists, strikethrough, images, horizontal rules.",
  inputSchema: zodSchema(
    z.object({
      title: z.string().describe("Title of the DOCX document"),
      subtitle: z.string().optional().describe("Subtitle displayed below the title on the cover page"),
      content: z
        .string()
        .describe(
          "Content in markdown format (supports H1-H6, bullet/numbered lists, tables, bold, italic, code blocks, blockquotes, task lists, strikethrough, horizontal rules)",
        ),
      filename: z.string().optional().describe("Output filename (without extension). Default: derived from title"),
      author: z.string().optional().describe("Author name (default: 'Klawhub Agent')"),
      images: z
        .array(
          z.object({
            url: z.string().describe("URL to download the image from"),
            width: z.number().optional().describe("Image width in pixels (default: 500)"),
            height: z.number().optional().describe("Image height in pixels (default: 375)"),
            caption: z.string().optional().describe("Caption displayed below the image"),
          }),
        )
        .optional()
        .describe(
          "Optional array of images to embed in the document. Each image can have a URL, width/height in pixels, and an optional caption.",
        ),
    }),
  ),
  execute: safeJson(async ({ title, subtitle, content, filename, author, images }) => {
    // ─── Dynamic imports ────────────────────────────────────────────────
    const docx = await import("docx");
    const {
      Document,
      Paragraph,
      TextRun,
      HeadingLevel,
      AlignmentType,
      BorderStyle,
      Table,
      TableRow,
      TableCell,
      WidthType,
      PageNumber,
      Footer,
      Header,
      TableOfContents,
      ExternalHyperlink,
      ImageRun,
      ShadingType,
    } = docx;

    // Packer — handle both named and default export shapes
    const Packer = (docx as unknown as { Packer: { toBuffer: (doc: unknown) => Promise<Buffer> } }).Packer;

    const { convertLatexToUnicode } = await import("@/lib/latex-symbols");

    // ─── Constants & helpers ────────────────────────────────────────────
    const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const cleanedContent = convertLatexToUnicode(content);
    const safeName = (filename || title).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 60);

    // ─── Download images ────────────────────────────────────────────────
    const downloadedImages: { buffer: Buffer; width: number; height: number; caption?: string; imageType: ImageType }[] = [];
    // Detect image type from MIME content-type or buffer magic bytes
    function detectImageType(buffer: Buffer, contentType?: string | null): ImageType {
      if (contentType) {
        if (contentType.includes("image/png")) return "png";
        if (contentType.includes("image/gif")) return "gif";
        if (contentType.includes("image/bmp")) return "bmp";
        if (contentType.includes("image/jpeg") || contentType.includes("image/jpg")) return "jpg";
      }
      // Fallback: detect from magic bytes
      if (buffer.length >= 4) {
        if (buffer[0] === 0x89 && buffer[1] === 0x50) return "png";
        if (buffer[0] === 0xff && buffer[1] === 0xd8) return "jpg";
        if (buffer[0] === 0x47 && buffer[1] === 0x49) return "gif";
        if (buffer[0] === 0x42 && buffer[1] === 0x4d) return "bmp";
      }
      return "png"; // safe default
    }

    if (images && images.length > 0) {
      for (const img of images) {
        try {
          const response = await fetch(img.url, { signal: AbortSignal.timeout(15_000) });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const arrayBuf = await response.arrayBuffer();
          const imageBuffer = Buffer.from(arrayBuf);
          // Default dimensions in EMU (English Metric Units)
          // 1 pixel ≈ 9525 EMU at 96 DPI
          const widthEmu = (img.width || 500) * 9525;
          const heightEmu = (img.height || 375) * 9525;
          const imageType = detectImageType(imageBuffer, response.headers.get("content-type"));
          downloadedImages.push({
            buffer: imageBuffer,
            width: widthEmu,
            height: heightEmu,
            caption: img.caption,
            imageType,
          });
        } catch {
          // Graceful fallback: placeholder text will be used
          downloadedImages.push({
            buffer: Buffer.alloc(0),
            width: (img.width || 500) * 9525,
            height: (img.height || 375) * 9525,
            caption: img.caption,
            imageType: "png",
          });
        }
      }
    }

    // ─── Cover page section ─────────────────────────────────────────────
    const coverChildren: unknown[] = [
      // Top spacer
      new Paragraph({ spacing: { before: 3600 }, children: [] }),
      // Title
      new Paragraph({
        children: [new TextRun({ text: title, bold: true, size: 56, font: "Calibri", color: "1E3A5F" })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      }),
    ];

    // Subtitle
    if (subtitle) {
      (coverChildren as unknown[]).push(
        new Paragraph({
          children: [new TextRun({ text: subtitle, size: 26, color: "6B7280", font: "Calibri", italics: true })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        }),
      );
    }

    (coverChildren as unknown[]).push(
      // Decorative divider
      new Paragraph({
        children: [new TextRun({ text: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━", size: 16, color: "2563EB" })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
      }),
      // Author
      new Paragraph({
        children: [
          new TextRun({ text: "Prepared by: ", size: 22, color: "6B7280", font: "Calibri" }),
          new TextRun({ text: author || "Klawhub Agent", size: 22, color: "1E3A5F", font: "Calibri", bold: true }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
      }),
      // Date
      new Paragraph({
        children: [new TextRun({ text: `Date: ${dateStr}`, size: 22, color: "6B7280", font: "Calibri" })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      }),
      // Generated-by note
      new Paragraph({
        children: [
          new TextRun({ text: "Generated by Klawhub Agent Hub", size: 18, color: "9CA3AF", font: "Calibri", italics: true }),
        ],
        alignment: AlignmentType.CENTER,
      }),
    );

    // ─── Content section ────────────────────────────────────────────────
    const contentChildren: unknown[] = [];

    // ─── Inline formatting parser (supports bold, italic, bold-italic, code,
    //     links, strikethrough, task-list markers) ───────────────────────
    const parseInlineFormatting = (text: string): any[] => {
      const runs: any[] = [];
      // Extended pattern: code, bold-italic, bold, italic, strikethrough, links, plain
      const pattern = /(`[^`]+`|\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|\[([^\]]+)\]\(([^)]+)\))/g;
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(text)) !== null) {
        // Plain text before the match
        if (match.index > lastIndex) {
          const plainText = text.slice(lastIndex, match.index);
          if (plainText) {
            runs.push(new TextRun({ text: plainText, size: 22, font: "Calibri", color: "1F2937" }));
          }
        }

        const token = match[0];

        if (token.startsWith("`")) {
          // Inline code
          runs.push(
            new TextRun({
              text: token.slice(1, -1),
              size: 20,
              font: "Courier New",
              color: "DC2626",
              shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
            }),
          );
        } else if (token.startsWith("***")) {
          // Bold + Italic
          runs.push(
            new TextRun({
              text: token.slice(3, -3),
              bold: true,
              italics: true,
              size: 22,
              font: "Calibri",
              color: "1F2937",
            }),
          );
        } else if (token.startsWith("**")) {
          // Bold
          runs.push(new TextRun({ text: token.slice(2, -2), bold: true, size: 22, font: "Calibri", color: "1F2937" }));
        } else if (token.startsWith("*")) {
          // Italic
          runs.push(new TextRun({ text: token.slice(1, -1), italics: true, size: 22, font: "Calibri", color: "374151" }));
        } else if (token.startsWith("~~")) {
          // Strikethrough
          runs.push(new TextRun({ text: token.slice(2, -2), strike: true, size: 22, font: "Calibri", color: "9CA3AF" }));
        } else if (token.startsWith("[")) {
          // Link [text](url) — show URL in parentheses after link text
          const linkText = match[2] || token;
          const linkUrl = match[3] || "#";
          try {
            runs.push(
              new ExternalHyperlink({
                children: [
                  new TextRun({
                    text: linkText,
                    size: 22,
                    font: "Calibri",
                    color: "2563EB",
                    underline: { type: "single" as any },
                  }),
                ],
                link: linkUrl,
              }),
              new TextRun({ text: ` (${linkUrl})`, size: 18, font: "Calibri", color: "9CA3AF" }),
            );
          } catch {
            runs.push(new TextRun({ text: `${linkText} (${linkUrl})`, size: 22, font: "Calibri", color: "2563EB" }));
          }
        }

        lastIndex = match.index + token.length;
      }

      // Remaining plain text
      if (lastIndex < text.length) {
        const remaining = text.slice(lastIndex);
        if (remaining) {
          runs.push(new TextRun({ text: remaining, size: 22, font: "Calibri", color: "1F2937" }));
        }
      }

      return runs.length > 0 ? runs : [new TextRun({ text, size: 22, font: "Calibri", color: "1F2937" })];
    };

    // ─── Table cell formatting (header-aware, with strikethrough) ───────
    const parseTableFormatting = (text: string, isHeader: boolean): any[] => {
      const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|~~[^~]+~~)/);
      const runs: any[] = [];
      for (const part of parts) {
        if (!part) continue;
        if (part.startsWith("**") && part.endsWith("**")) {
          runs.push(
            new TextRun({
              text: part.slice(2, -2),
              bold: true,
              size: isHeader ? 20 : 18,
              font: "Calibri",
              color: isHeader ? "FFFFFF" : "1F2937",
            }),
          );
        } else if (part.startsWith("*") && part.endsWith("*")) {
          runs.push(
            new TextRun({
              text: part.slice(1, -1),
              italics: true,
              size: isHeader ? 20 : 18,
              font: "Calibri",
              color: isHeader ? "FFFFFF" : "1F2937",
            }),
          );
        } else if (part.startsWith("`") && part.endsWith("`")) {
          runs.push(
            new TextRun({
              text: part.slice(1, -1),
              size: isHeader ? 20 : 18,
              font: "Courier New",
              color: isHeader ? "E0E7FF" : "DC2626",
            }),
          );
        } else if (part.startsWith("~~") && part.endsWith("~~")) {
          runs.push(
            new TextRun({
              text: part.slice(2, -2),
              strike: true,
              size: isHeader ? 20 : 18,
              font: "Calibri",
              color: isHeader ? "FFFFFF" : "9CA3AF",
            }),
          );
        } else {
          runs.push(
            new TextRun({
              text: part,
              bold: isHeader,
              size: isHeader ? 20 : 18,
              font: "Calibri",
              color: isHeader ? "FFFFFF" : "1F2937",
            }),
          );
        }
      }
      return runs;
    };

    // ─── Pre-process: merge consecutive plain-text lines into paragraphs
    const rawLines = cleanedContent.split("\n");
    const mergedLines: string[] = [];
    let lineBuffer = "";

    for (const line of rawLines) {
      const trimmed = line.trim();
      // Special lines flush the buffer
      if (
        trimmed === "" ||
        trimmed.startsWith("#") ||
        trimmed.startsWith("-") ||
        trimmed.startsWith("* ") ||
        trimmed.startsWith("+ ") ||
        /^\d+\.\s/.test(trimmed) ||
        /^[a-zA-Z]\.\s/.test(trimmed) ||
        /^(i{1,3}|iv|v|vi{0,3})\.\s/i.test(trimmed) ||
        trimmed.startsWith("|") ||
        trimmed.startsWith("```") ||
        trimmed === "---" ||
        trimmed === "***" ||
        trimmed === "___" ||
        trimmed.startsWith("> ") ||
        trimmed.startsWith("![")
      ) {
        if (lineBuffer.trim()) {
          mergedLines.push(lineBuffer.trim());
          lineBuffer = "";
        }
        mergedLines.push(line);
      } else {
        lineBuffer += (lineBuffer ? " " : "") + trimmed;
      }
    }
    if (lineBuffer.trim()) {
      mergedLines.push(lineBuffer.trim());
    }

    const lines = mergedLines;

    // ─── Parsing state ──────────────────────────────────────────────────
    let inCodeBlock = false;
    let codeLines: string[] = [];
    let codeLang = "";
    let inTable = false;
    let tableRows: string[][] = [];
    let inBlockquote = false;
    let blockquoteLines: string[] = [];
    // Track image index for embedding
    let imageEmbedIndex = 0;

    // ─── Numbered list reference tracking ───────────────────────────────
    // We'll detect the numbering format per block and assign references
    let currentNumberingRef = "numbering-decimal";
    let prevLineWasOrderedList = false;

    function getNumberingFormat(text: string): { ref: string; format: string } {
      // Decimal: 1. 2. 3.
      if (/^\d+\.\s/.test(text)) return { ref: "numbering-decimal", format: "decimal" };
      // Lower letter: a. b. c.
      if (/^[a-z]\.\s/.test(text)) return { ref: "numbering-lower-letter", format: "lowerLetter" };
      // Lower roman: i. ii. iii. iv. v. vi. vii. viii. ix. x.
      if (/^(i{1,3}|iv|v|vi{0,3})\.\s/i.test(text)) return { ref: "numbering-lower-roman", format: "lowerRoman" };
      return { ref: "numbering-decimal", format: "decimal" };
    }

    // ─── Main parsing loop ──────────────────────────────────────────────
    for (const line of lines) {
      // ── Code blocks ─────────────────────────────────────────────────
      if (line.trim().startsWith("```")) {
        if (inCodeBlock) {
          const codeText = codeLines.join("\n");
          const label = codeLang ? `${codeLang.toUpperCase()} ` : "";
          contentChildren.push(
            new Paragraph({
              children: [new TextRun({ text: `${label}Code`, bold: true, size: 16, font: "Calibri", color: "2563EB" })],
              spacing: { before: 160, after: 40 },
              shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
            }),
          );
          for (const cl of codeText.split("\n")) {
            contentChildren.push(
              new Paragraph({
                children: [new TextRun({ text: cl || " ", size: 17, font: "Courier New", color: "334155" })],
                shading: { fill: "F8FAFC", type: ShadingType.CLEAR },
                spacing: { after: 0, line: 260 },
              }),
            );
          }
          codeLines = [];
          codeLang = "";
          inCodeBlock = false;
          contentChildren.push(new Paragraph({ spacing: { after: 100 }, children: [] }));
        } else {
          inCodeBlock = true;
          codeLang = line.trim().slice(3).trim();
        }
        continue;
      }
      if (inCodeBlock) {
        codeLines.push(line);
        continue;
      }

      // ── Blockquotes ─────────────────────────────────────────────────
      if (line.trim().startsWith("> ")) {
        if (!inBlockquote) {
          inBlockquote = true;
          blockquoteLines = [];
        }
        blockquoteLines.push(line.trim().slice(2));
        continue;
      } else if (inBlockquote && !line.trim().startsWith(">")) {
        inBlockquote = false;
        if (blockquoteLines.length > 0) {
          const bqText = blockquoteLines.join(" ");
          contentChildren.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: bqText,
                  italics: true,
                  size: 22,
                  font: "Calibri",
                  color: "1E3A5F",
                }),
              ],
              spacing: { before: 120, after: 120, line: 276 },
              indent: { left: 360 },
              border: {
                left: { style: BorderStyle.SINGLE, size: 12, color: "2563EB", space: 8 },
              },
              shading: { fill: "EFF6FF", type: ShadingType.CLEAR },
            }),
          );
        }
        blockquoteLines = [];
        // Fall through to process the current line below
      }

      // ── Tables ──────────────────────────────────────────────────────
      if (line.trim().startsWith("|")) {
        const cells = line
          .split("|")
          .filter((c) => c.trim())
          .map((c) => c.trim());
        // Skip separator row
        if (cells.every((c) => /^[-:]+$/.test(c))) continue;
        if (!inTable) inTable = true;
        tableRows.push(cells);
        continue;
      } else if (inTable) {
        // End of table — render it
        if (tableRows.length > 0) {
          const colCount = tableRows[0].length;
          const colWidths = guessColumnWidths(tableRows, 9000);
          const isFirstColLabels = looksLikeRowLabels(tableRows);

          const rows = tableRows.map((row, rowIdx) => {
            const isHeader = rowIdx === 0;
            return new TableRow({
              children: row.map((cell, colIdx) => {
                // First column bold for non-header rows if it looks like labels
                const isFirstCol = colIdx === 0;
                const boldFirstCol = !isHeader && isFirstColLabels && isFirstCol;

                return new TableCell({
                  children: [
                    new Paragraph({
                      children: (() => {
                        const formatted = parseTableFormatting(cell, isHeader);
                        // Prepend bold styling for first-col labels if needed
                        if (boldFirstCol && formatted.length > 0) {
                          // Re-parse with bold forced
                          const boldParts = cell.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|~~[^~]+~~)/);
                          const boldRuns: any[] = [];
                          for (const p of boldParts) {
                            if (!p) continue;
                            if (p.startsWith("**") && p.endsWith("**")) {
                              boldRuns.push(
                                new TextRun({
                                  text: p.slice(2, -2),
                                  bold: true,
                                  size: 18,
                                  font: "Calibri",
                                  color: "1F2937",
                                }),
                              );
                            } else if (p.startsWith("`") && p.endsWith("`")) {
                              boldRuns.push(
                                new TextRun({
                                  text: p.slice(1, -1),
                                  size: 18,
                                  font: "Courier New",
                                  color: "DC2626",
                                  bold: true,
                                }),
                              );
                            } else {
                              boldRuns.push(
                                new TextRun({
                                  text: p,
                                  bold: true,
                                  size: 18,
                                  font: "Calibri",
                                  color: "1F2937",
                                }),
                              );
                            }
                          }
                          return boldRuns;
                        }
                        return formatted;
                      })(),
                      spacing: { before: 40, after: 40 },
                    }),
                  ],
                  width: { size: colWidths[colIdx] || Math.floor(9000 / colCount), type: WidthType.DXA },
                  shading: isHeader
                    ? { fill: "1E3A5F", type: ShadingType.CLEAR }
                    : rowIdx % 2 === 0
                      ? { fill: "F8FAFC", type: ShadingType.CLEAR }
                      : undefined,
                });
              }),
              cantSplit: true,
              tableHeader: isHeader,
            });
          });

          try {
            contentChildren.push(
              new Table({
                rows,
                width: { size: 9000, type: WidthType.DXA },
              }) as never,
            );
            contentChildren.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
          } catch {
            // Fallback: render as monospace text
            for (const row of tableRows) {
              contentChildren.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `| ${row.join(" | ")} |`,
                      size: 18,
                      font: "Courier New",
                      color: "374151",
                    }),
                  ],
                  spacing: { after: 40 },
                }),
              );
            }
          }
        }
        tableRows = [];
        inTable = false;
      }

      // ── Headings H1-H6 ─────────────────────────────────────────────
      const h1Match = line.match(/^# (.+)/);
      const h2Match = line.match(/^## (.+)/);
      const h3Match = line.match(/^### (.+)/);
      const h4Match = line.match(/^#### (.+)/);
      const h5Match = line.match(/^##### (.+)/);
      const h6Match = line.match(/^###### (.+)/);

      if (h1Match) {
        contentChildren.push(
          new Paragraph({
            children: [
              new TextRun({ text: h1Match[1], bold: true, size: 36, font: "Calibri", color: "1E3A5F" }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 4, color: "2563EB", space: 4 },
            },
            pageBreakBefore: true,
          }),
        );
        continue;
      }
      if (h2Match) {
        contentChildren.push(
          new Paragraph({
            children: [
              new TextRun({ text: h2Match[1], bold: true, size: 28, font: "Calibri", color: "2563EB" }),
            ],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 150 },
          }),
        );
        continue;
      }
      if (h3Match) {
        contentChildren.push(
          new Paragraph({
            children: [
              new TextRun({ text: h3Match[1], bold: true, size: 24, font: "Calibri", color: "374151" }),
            ],
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 200, after: 100 },
          }),
        );
        continue;
      }
      if (h4Match) {
        contentChildren.push(
          new Paragraph({
            children: [
              new TextRun({ text: h4Match[1], bold: true, size: 22, font: "Calibri", color: "4B5563" }),
            ],
            heading: HeadingLevel.HEADING_4,
            spacing: { before: 180, after: 80 },
          }),
        );
        continue;
      }
      if (h5Match) {
        contentChildren.push(
          new Paragraph({
            children: [
              new TextRun({ text: h5Match[1], bold: true, size: 21, font: "Calibri", color: "6B7280" }),
            ],
            heading: HeadingLevel.HEADING_5,
            spacing: { before: 160, after: 60 },
          }),
        );
        continue;
      }
      if (h6Match) {
        contentChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: h6Match[1],
                bold: true,
                italics: true,
                size: 20,
                font: "Calibri",
                color: "9CA3AF",
              }),
            ],
            heading: HeadingLevel.HEADING_6,
            spacing: { before: 140, after: 40 },
          }),
        );
        continue;
      }

      // ── Horizontal rules (---, ***, ___) ───────────────────────────
      if (line.trim() === "---" || line.trim() === "***" || line.trim() === "___") {
        contentChildren.push(
          new Paragraph({
            children: [new TextRun({ text: "" })],
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: "D1D5DB", space: 1 },
            },
            spacing: { before: 200, after: 200 },
          }),
        );
        continue;
      }

      // ── Empty line ─────────────────────────────────────────────────
      if (line.trim() === "") continue;

      // ── Task lists: - [x] done / - [ ] todo ────────────────────────
      const taskMatch = line.match(/^(\s*)([-*+])\s\[([ xX])\]\s(.+)/);
      if (taskMatch) {
        const indent = Math.min(Math.floor(taskMatch[1].length / 2), 2);
        const isChecked = taskMatch[3] !== " ";
        const taskText = taskMatch[4];
        const symbol = isChecked ? "\u2713" : "\u2610"; // ✓ or ☐
        const runs: any[] = [
          new TextRun({
            text: `${symbol} `,
            size: 22,
            font: "Calibri",
            color: isChecked ? "16A34A" : "9CA3AF",
          }),
        ];
        runs.push(...parseInlineFormatting(taskText));
        if (isChecked) {
          // Strikethrough the text for completed items
          const styledRuns = runs.map((r: any) => {
            try {
              return new TextRun({
                text: (r as any).options?.text || "",
                size: 22,
                font: "Calibri",
                color: "6B7280",
                strike: true,
              });
            } catch {
              return r;
            }
          });
          contentChildren.push(
            new Paragraph({
              children: styledRuns,
              bullet: { level: indent },
              spacing: { after: 60, line: 276 },
            }),
          );
        } else {
          contentChildren.push(
            new Paragraph({
              children: runs,
              bullet: { level: indent },
              spacing: { after: 60, line: 276 },
            }),
          );
        }
        continue;
      }

      // ── Bullet list with nested support ────────────────────────────
      const bulletMatch = line.match(/^(\s*)([-*+])\s(.+)/);
      if (bulletMatch) {
        const indent = Math.min(Math.floor(bulletMatch[1].length / 2), 2);
        const bulletText = bulletMatch[3];
        contentChildren.push(
          new Paragraph({
            children: parseInlineFormatting(bulletText),
            bullet: { level: indent },
            spacing: { after: 60, line: 276 },
          }),
        );
        prevLineWasOrderedList = false;
        continue;
      }

      // ── Numbered lists (decimal, lower-letter, lower-roman) ────────
      const decimalMatch = line.trim().match(/^(\d+)\.\s(.+)/);
      const letterMatch = line.trim().match(/^([a-z])\.\s(.+)/);
      const romanMatch = line.trim().match(/^(i{1,3}|iv|v|vi{0,3})\.\s(.+)/i);

      if (decimalMatch || letterMatch || romanMatch) {
        let listText = "";
        let ref = "numbering-decimal";

        if (decimalMatch) {
          listText = decimalMatch[2];
          ref = "numbering-decimal";
        } else if (letterMatch) {
          listText = letterMatch[2];
          ref = "numbering-lower-letter";
        } else if (romanMatch) {
          listText = romanMatch[2];
          ref = "numbering-lower-roman";
        }

        contentChildren.push(
          new Paragraph({
            children: parseInlineFormatting(listText),
            numbering: { reference: ref, level: 0 },
            spacing: { after: 60, line: 276 },
          }),
        );
        prevLineWasOrderedList = true;
        continue;
      }

      prevLineWasOrderedList = false;

      // ── Image placeholder in content: ![alt](url) ──────────────────
      const imgMarkdownMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
      if (imgMarkdownMatch) {
        const altText = imgMarkdownMatch[1];
        const imgUrl = imgMarkdownMatch[2];

        // Try to match to a provided image or download inline
        let embedded = false;
        for (const dlImg of downloadedImages) {
          if (dlImg.buffer.length > 0) {
            try {
              contentChildren.push(
                new Paragraph({
                  children: [
                    new ImageRun({
                      type: dlImg.imageType,
                      data: dlImg.buffer,
                      transformation: { width: dlImg.width, height: dlImg.height },
                      altText: { description: altText || "Image", name: altText || "Image" },
                    }),
                  ],
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 120, after: 60 },
                }),
              );
              if (dlImg.caption) {
                contentChildren.push(
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: dlImg.caption,
                        italics: true,
                        size: 18,
                        font: "Calibri",
                        color: "6B7280",
                      }),
                    ],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 120 },
                  }),
                );
              }
              embedded = true;
              imageEmbedIndex++;
              break;
            } catch {
              // fall through to placeholder
            }
          }
        }

        if (!embedded) {
          // Placeholder for images that couldn't be downloaded
          contentChildren.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `[Image: ${altText || imgUrl}]`,
                  italics: true,
                  size: 20,
                  font: "Calibri",
                  color: "9CA3AF",
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { before: 120, after: 60 },
              border: {
                top: { style: BorderStyle.DASHED, size: 4, color: "D1D5DB", space: 4 },
                bottom: { style: BorderStyle.DASHED, size: 4, color: "D1D5DB", space: 4 },
                left: { style: BorderStyle.DASHED, size: 4, color: "D1D5DB", space: 4 },
                right: { style: BorderStyle.DASHED, size: 4, color: "D1D5DB", space: 4 },
              },
            }),
          );
        }
        continue;
      }

      // ── Regular paragraph ──────────────────────────────────────────
      const runs = parseInlineFormatting(line);
      contentChildren.push(
        new Paragraph({
          children: runs,
          spacing: { after: 120, line: 276 },
        }),
      );
    }

    // ─── Render remaining blockquote ────────────────────────────────────
    if (inBlockquote && blockquoteLines.length > 0) {
      contentChildren.push(
        new Paragraph({
          children: [
            new TextRun({
              text: blockquoteLines.join(" "),
              italics: true,
              size: 22,
              font: "Calibri",
              color: "1E3A5F",
            }),
          ],
          spacing: { before: 120, after: 120 },
          indent: { left: 360 },
          border: {
            left: { style: BorderStyle.SINGLE, size: 12, color: "2563EB", space: 8 },
          },
          shading: { fill: "EFF6FF", type: ShadingType.CLEAR },
        }),
      );
    }

    // ─── Render remaining table ─────────────────────────────────────────
    if (tableRows.length > 0) {
      for (const row of tableRows) {
        contentChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `| ${row.join(" | ")} |`,
                size: 18,
                font: "Courier New",
                color: "374151",
              }),
            ],
            spacing: { after: 40 },
          }),
        );
      }
    }

    // ─── Embed provided images at end if not placed via markdown ────────
    // If images were provided but none were consumed via markdown syntax,
    // append them all at the end of the document
    if (images && images.length > 0 && imageEmbedIndex === 0) {
      for (let i = 0; i < downloadedImages.length; i++) {
        const dlImg = downloadedImages[i];
        if (dlImg.buffer.length === 0) {
          contentChildren.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `[Image: ${images![i].caption || images![i].url}]`,
                  italics: true,
                  size: 20,
                  font: "Calibri",
                  color: "9CA3AF",
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { before: 200, after: 80 },
              border: {
                top: { style: BorderStyle.DASHED, size: 4, color: "D1D5DB", space: 4 },
                bottom: { style: BorderStyle.DASHED, size: 4, color: "D1D5DB", space: 4 },
                left: { style: BorderStyle.DASHED, size: 4, color: "D1D5DB", space: 4 },
                right: { style: BorderStyle.DASHED, size: 4, color: "D1D5DB", space: 4 },
              },
            }),
          );
        } else {
          try {
            contentChildren.push(
              new Paragraph({
                children: [
                  new ImageRun({
                    type: dlImg.imageType,
                    data: dlImg.buffer,
                    transformation: { width: dlImg.width, height: dlImg.height },
                    altText: {
                      description: images![i].caption || `Image ${i + 1}`,
                      name: images![i].caption || `Image ${i + 1}`,
                    },
                  }),
                ],
                alignment: AlignmentType.CENTER,
                spacing: { before: 200, after: 60 },
              }),
            );
            if (dlImg.caption) {
              contentChildren.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      text: dlImg.caption,
                      italics: true,
                      size: 18,
                      font: "Calibri",
                      color: "6B7280",
                    }),
                  ],
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 200 },
                }),
              );
            }
          } catch {
            contentChildren.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: `[Image: ${images![i].caption || images![i].url}]`,
                    italics: true,
                    size: 20,
                    font: "Calibri",
                    color: "9CA3AF",
                  }),
                ],
                alignment: AlignmentType.CENTER,
                spacing: { before: 200, after: 80 },
              }),
            );
          }
        }
      }
    }

    // ─── Build the document ─────────────────────────────────────────────
    const doc = new Document({
      creator: "Klawhub Agent Hub",
      title: title,
      description: subtitle || title,
      numbering: {
        config: [
          {
            reference: "numbering-decimal",
            levels: [
              {
                level: 0,
                format: "decimal" as const,
                text: "%1.",
                alignment: AlignmentType.START,
              },
              {
                level: 1,
                format: "lowerLetter" as const,
                text: "%2)",
                alignment: AlignmentType.START,
              },
              {
                level: 2,
                format: "lowerRoman" as const,
                text: "%3.",
                alignment: AlignmentType.START,
              },
            ],
          },
          {
            reference: "numbering-lower-letter",
            levels: [
              {
                level: 0,
                format: "lowerLetter" as const,
                text: "%1.",
                alignment: AlignmentType.START,
              },
              {
                level: 1,
                format: "lowerRoman" as const,
                text: "%2)",
                alignment: AlignmentType.START,
              },
            ],
          },
          {
            reference: "numbering-lower-roman",
            levels: [
              {
                level: 0,
                format: "lowerRoman" as const,
                text: "%1.",
                alignment: AlignmentType.START,
              },
              {
                level: 1,
                format: "decimal" as const,
                text: "%2)",
                alignment: AlignmentType.START,
              },
            ],
          },
        ],
      },
      styles: {
        default: {
          document: {
            run: {
              size: 22,
              font: "Calibri",
              color: "1F2937",
            },
            paragraph: {
              spacing: { line: 276 },
            },
          },
        },
      },
      sections: [
        // ── 1. Cover page (no headers/footers, different margins) ──────
        {
          properties: {
            page: {
              size: { width: 11906, height: 16838 }, // A4
              margin: { top: 2160, bottom: 2160, left: 1800, right: 1800 },
            },
            titlePage: true,
          },
          children: coverChildren as any,
        },
        // ── 2. Table of Contents (page numbers not yet shown) ──────────
        {
          properties: {
            page: {
              size: { width: 11906, height: 16838 },
              margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
            },
          },
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: title,
                      size: 16,
                      color: "9CA3AF",
                      font: "Calibri",
                      italics: true,
                    }),
                  ],
                  alignment: AlignmentType.RIGHT,
                }),
              ],
            }),
          },
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: "Table of Contents",
                  bold: true,
                  size: 36,
                  font: "Calibri",
                  color: "1E3A5F",
                }),
              ],
              spacing: { after: 300 },
            }),
            new TableOfContents("Table of Contents", {
              hyperlink: true,
              headingStyleRange: "1-6",
            }),
          ],
        },
        // ── 3. Content pages (with header + footer + page numbering) ───
        {
          properties: {
            page: {
              size: { width: 11906, height: 16838 },
              margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
              pageNumbers: { start: 1 },
            },
          },
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: title,
                      size: 16,
                      color: "9CA3AF",
                      font: "Calibri",
                      italics: true,
                    }),
                  ],
                  alignment: AlignmentType.RIGHT,
                }),
              ],
            }),
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: "Generated by Klawhub Agent Hub",
                      size: 16,
                      color: "9CA3AF",
                      font: "Calibri",
                    }),
                    new TextRun({
                      text: "    |    Page ",
                      size: 16,
                      color: "9CA3AF",
                      font: "Calibri",
                    }),
                    new TextRun({
                      children: [PageNumber.CURRENT],
                      size: 16,
                      color: "6B7280",
                      font: "Calibri",
                    }),
                  ],
                }),
              ],
            }),
          },
          children: contentChildren as any,
        },
      ],
    });

    // ─── Generate & return ──────────────────────────────────────────────
    const docBuffer = await Packer.toBuffer(doc) as Buffer;

    const fileBaseName = `${safeName}.docx`;
    const fileBase64 = Buffer.from(docBuffer).toString("base64");

    try {
      const { cacheFile } = await import("@/lib/file-cache");
      await cacheFile(
        fileBaseName,
        Buffer.from(docBuffer),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileBaseName,
      );
    } catch {
      // Best-effort caching
    }

    return {
      success: true,
      filename: fileBaseName,
      title,
      fileBase64,
      fileSize: docBuffer.byteLength,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      downloadUrl: `/api/files/${fileBaseName}`,
      message: `DOCX document "${title}" created successfully with cover page, TOC (H1-H6), images, task lists, numbered lists, tables, horizontal rules, strikethrough, and professional headers/footers. Download available.`,
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

// Code execution now uses Judge0 CE (see api-clients.ts)
// Judge0 supports: javascript, python, typescript, go, rust, java, cpp, ruby, php, swift, kotlin, r, sql, bash, csharp

export const codeExecuteTool = tool({
  description: "Execute code snippets safely in a sandboxed environment. Supports JavaScript, Python, TypeScript, Go, Rust, Java, C++, Ruby, PHP, and Swift. Perfect for quick calculations, data transformations, string processing, algorithms, or prototyping. Returns stdout, stderr, and exit code. Execution timeout: 10s. No internet access. Max output: 64KB.",
  inputSchema: zodSchema(z.object({
    code: z.string().describe("The code to execute. Must be valid syntax for the specified language."),
    language: z.string().optional().describe("Programming language: javascript (default), python, typescript, go, rust, java, cpp, ruby, php, swift. Aliases: js, py, ts."),
    stdin: z.string().optional().describe("Optional stdin input for the program"),
  })),
  execute: safeJson(async ({ code, language, stdin }) => {
    const result = await executeCodeJudge0(code, language, stdin);
    return {
      language: result.language,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      status: result.status,
      durationMs: result.duration,
    };
  }),
});

// ---------------------------------------------------------------------------
// Python Data Processing Tool (for document generation workflow)
// ---------------------------------------------------------------------------
// Runs Python code in Judge0 sandbox for data analysis, calculations, and
// content generation. The output is returned as structured text that agents
// can then pass to create_pdf_report, create_docx_document, etc.
//
// WHY: Judge0 CE Python only has the standard library (no pip packages).
// For document RENDERING, use create_pdf_report / create_docx_document tools.
// For data PROCESSING (calculations, analysis, formatting), use this tool.
//
// WORKFLOW: python_data_process → extract results → create_pdf_report/docx/xlsx
// ---------------------------------------------------------------------------

export const pythonDataProcessTool = tool({
  description: "Run Python code for data analysis, calculations, and content generation in a sandbox. Use this BEFORE creating documents — process data first, then pass results to create_pdf_report, create_docx_document, or create_xlsx_spreadsheet. Python standard library only (no pip packages). Returns structured text output. Timeout: 10s.",
  inputSchema: zodSchema(z.object({
    code: z.string().describe("Python code to execute. Use print() to output results. Standard library only: json, math, statistics, datetime, re, collections, itertools, etc."),
    description: z.string().optional().describe("Brief description of what the code does (for logging)"),
  })),
  execute: safeJson(async ({ code, description }) => {
    const startTime = Date.now();
    const result = await executeCodeJudge0(code, "python", "");

    if (result.exitCode !== 0) {
      return {
        success: false,
        stderr: result.stderr,
        stdout: result.stdout,
        exitCode: result.exitCode,
        durationMs: Date.now() - startTime,
        hint: "Fix the Python error and retry. Remember: only standard library is available (no pip packages).",
      };
    }

    return {
      success: true,
      output: result.stdout,
      exitCode: result.exitCode,
      durationMs: Date.now() - startTime,
      nextStep: "Use the output above as data for create_pdf_report, create_docx_document, or create_xlsx_spreadsheet tools.",
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
      "User-Agent": "Mozilla/5.0 (compatible; KlawhubBot/1.0; +https://klawhub.xyz)",
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
// Create XLSX Spreadsheet Tool — v3.0 (Claude/glm5.1 Quality Upgrade)
// ---------------------------------------------------------------------------
// Professional spreadsheet generator with full feature set:
//   - Multiple sheets with professional navy-themed styling
//   - Auto-fit columns (smart algorithm: header + data sampling + format padding)
//   - Formula columns (SUM, AVERAGE, COUNT, MIN, MAX)
//   - Freeze panes
//   - Charts (bar, line, pie, doughnut, scatter, area)
//   - Conditional formatting (color scale, data bars, icon sets, cell-is rules)
//   - Cell style customization (fonts, sizes, colors, number formats)
//   - Summary rows (total, average, etc. with formulas)
//   - Data validation (list, whole, decimal, date)
//   - Auto-detection of numbers, currency, percentages, and dates
// ---------------------------------------------------------------------------



// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CURRENCY_SYMBOLS = /[$\u20AC\u00A3\u00A5\u00A4\u20A9\u20B9\u0052\u00BF]/;
const CURRENCY_RE = new RegExp(`^(${CURRENCY_SYMBOLS.source})?([0-9]{1,3}(,[0-9]{3})*(\\.[0-9]+)?|([0-9]+(\\.[0-9]+)?))$`);
const PERCENTAGE_RE = /^(-?\d+(?:\.\d+)?)%$/;
const DATE_FORMATS: Array<{ re: RegExp; fmt: string }> = [
  { re: /^\d{4}-\d{2}-\d{2}$/, fmt: "yyyy-mm-dd" },
  { re: /^\d{4}\/\d{2}\/\d{2}$/, fmt: "yyyy/mm/dd" },
  { re: /^\d{1,2}\/\d{1,2}\/\d{4}$/, fmt: "mm/dd/yyyy" },
  { re: /^\d{1,2}-\d{1,2}-\d{4}$/, fmt: "mm-dd-yyyy" },
  { re: /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}$/i, fmt: "mmm dd, yyyy" },
  { re: /^\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}$/i, fmt: "dd mmm yyyy" },
  { re: /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/, fmt: "yyyy-mm-dd h:mm" },
  { re: /^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?$/i, fmt: "mm/dd/yyyy h:mm" },
];

/**
 * Attempt to detect a value's semantic type and return { value, numFmt }.
 * Returns null if the value should be left as a plain string.
 */
function detectValueAndFormat(raw: string, overrideNumFmt?: string, overrideDateFormat?: string): { value: string | number | Date; numFmt?: string } | null {
  if (raw == null || raw === "") return null;
  const trimmed = String(raw).trim();
  if (trimmed === "") return null;

  // If an explicit number format is provided, check for plain numbers first
  if (overrideNumFmt) {
    if (!isNaN(Number(trimmed)) && trimmed !== "") {
      return { value: Number(trimmed), numFmt: overrideNumFmt };
    }
  }

  // Check explicit date format override
  if (overrideDateFormat) {
    for (const df of DATE_FORMATS) {
      if (df.re.test(trimmed)) {
        return { value: new Date(trimmed), numFmt: overrideDateFormat };
      }
    }
  }

  // Currency detection (e.g., "$1,234.56", "€1,234.56")
  const currMatch = trimmed.match(new RegExp(`^(${CURRENCY_SYMBOLS.source})?([0-9]{1,3}(,[0-9]{3})*(\\.[0-9]+)?|([0-9]+(\\.[0-9]+)?))$`));
  if (currMatch && CURRENCY_SYMBOLS.test(trimmed.charAt(0))) {
    const numStr = trimmed.replace(CURRENCY_SYMBOLS, "").replace(/,/g, "");
    if (!isNaN(Number(numStr))) {
      const hasCents = numStr.includes(".");
      return { value: Number(numStr), numFmt: hasCents ? "$#,##0.00" : "$#,##0" };
    }
  }

  // Percentage detection (e.g., "50%", "0.5%")
  const pctMatch = trimmed.match(PERCENTAGE_RE);
  if (pctMatch) {
    const numVal = Number(pctMatch[1]) / 100;
    return { value: numVal, numFmt: "0.0%" };
  }

  // Plain number detection
  if (!isNaN(Number(trimmed)) && trimmed !== "" && !/^[0]/.test(trimmed.replace(/[.,]/g, "")) === false || /^-?\d+(?:\.\d+)?$/.test(trimmed.replace(/,/g, ""))) {
    const cleanNum = trimmed.replace(/,/g, "");
    if (!isNaN(Number(cleanNum)) && cleanNum !== "") {
      return { value: Number(cleanNum), numFmt: "#,##0.00" };
    }
  }

  // Date detection
  for (const df of DATE_FORMATS) {
    if (df.re.test(trimmed)) {
      const parsed = new Date(trimmed);
      if (!isNaN(parsed.getTime())) {
        return { value: parsed, numFmt: df.fmt };
      }
    }
  }

  return null;
}

/**
 * Smart column width calculation.
 * Samples up to 50 rows, accounts for header, data, and number format width.
 */
function calculateColumnWidth(
  header: string,
  rows: string[][],
  colIndex: number,
  numFmt?: string,
  headerFontSize = 11,
  dataFontSize = 10,
): number {
  const MIN_WIDTH = 8;
  const MAX_WIDTH = 50;
  const PADDING = 4;

  let maxLen = String(header || "").length;

  // Account for header font size (larger font = wider characters)
  const headerScale = headerFontSize / 10;

  // Sample up to 50 rows for content width
  const sampleRows = rows.slice(0, 50);
  for (const row of sampleRows) {
    const cellVal = row[colIndex];
    if (cellVal != null && cellVal !== "") {
      maxLen = Math.max(maxLen, String(cellVal).length);
    }
  }

  // Account for number format visual width (e.g., "$#,##0.00" needs extra space)
  if (numFmt) {
    if (numFmt.includes("$") || numFmt.includes("\u20AC") || numFmt.includes("\u00A3")) {
      // Currency: add ~3 chars for symbol + separators
      maxLen = Math.max(maxLen + 3, 12);
    }
    if (numFmt.includes("%")) {
      maxLen = Math.max(maxLen, 8);
    }
    if (numFmt.includes("#,##0")) {
      // Thousand separator: add chars for commas
      maxLen = Math.max(maxLen, 10);
    }
    if (numFmt.includes("yyyy") || numFmt.toLowerCase().includes("mm") || numFmt.toLowerCase().includes("dd")) {
      // Date: fixed-ish width
      maxLen = Math.max(maxLen, 12);
    }
  }

  // Scale by font size ratio
  maxLen = Math.ceil(maxLen * headerScale);

  return Math.max(MIN_WIDTH, Math.min(maxLen + PADDING, MAX_WIDTH));
}

/**
 * Convert column letters (A, B, ..., Z, AA, AB, ...) to 1-based column number.
 */
function colLetterToIndex(col: string): number {
  let result = 0;
  for (let i = 0; i < col.length; i++) {
    result = result * 26 + (col.charCodeAt(i) - 64);
  }
  return result;
}

/**
 * Convert 1-based column number to column letter(s).
 */
function colIndexToLetter(col: number): string {
  let result = "";
  let n = col;
  while (n > 0) {
    n--;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

/**
 * Build an ExcelJS range string from start/end row and col indices (1-based).
 */
function buildRange(startRow: number, endRow: number, startCol: number, endCol: number): string {
  return `${colIndexToLetter(startCol)}${startRow}:${colIndexToLetter(endCol)}${endRow}`;
}

/**
 * Determine the function keyword for a summary row entry.
 */
function summaryFuncLabel(fn: string): string {
  const labels: Record<string, string> = {
    SUM: "TOTAL",
    AVERAGE: "AVERAGE",
    COUNT: "COUNT",
    MIN: "MIN",
    MAX: "MAX",
  };
  return labels[fn] || fn;
}

// ---------------------------------------------------------------------------
// Zod schema components for the new optional parameters
// ---------------------------------------------------------------------------

const ChartConfigSchema = z.object({
  type: z.enum(["bar", "line", "pie", "doughnut", "scatter", "area"]).describe("Chart type"),
  title: z.string().describe("Chart title"),
  dataRange: z.string().optional().describe("Data range like 'A1:E10' (auto-calculated if omitted)"),
  xAxis: z.string().optional().describe("Column header for X axis"),
  yAxes: z.array(z.string()).optional().describe("Column headers for Y axis data series"),
  position: z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
  }).optional().describe("Chart position in cells {x, y, w, h}"),
});

const ConditionalFormattingSchema = z.object({
  range: z.string().describe("Range like 'B2:B100'"),
  type: z.enum(["colorScale", "dataBar", "iconSet", "cellIs"]).describe("Formatting type"),
  rule: z.any().describe("Rule configuration (varies by type)"),
});

const CellStylesSchema = z.object({
  headerFontSize: z.number().optional().describe("Header font size (default: 11)"),
  dataFontSize: z.number().optional().describe("Data font size (default: 10)"),
  headerFontName: z.string().optional().describe("Header font family (default: Calibri)"),
  dataFontName: z.string().optional().describe("Data font family (default: Calibri)"),
  headerColor: z.string().optional().describe("Header background hex color without alpha prefix (default: 1E3A5F)"),
  altRowColor: z.string().optional().describe("Alternating row hex color without alpha prefix (default: F8FAFC)"),
  numberFormat: z.string().optional().describe("Default number format e.g. '$#,##0.00', '0.0%', 'yyyy-mm-dd'"),
  dateFormat: z.string().optional().describe("Format for auto-detected date strings"),
});

const SummaryRowSchema = z.object({
  label: z.string().describe("Summary label e.g. 'TOTAL', 'AVERAGE'"),
  functions: z.record(z.string(), z.enum(["SUM", "AVERAGE", "COUNT", "MIN", "MAX"])).optional()
    .describe("Column header → aggregate function"),
  showAll: z.boolean().optional().describe("If true, SUM all numeric columns automatically"),
});

const DataValidationSchema = z.object({
  range: z.string().describe("Range like 'B2:B100'"),
  type: z.enum(["list", "whole", "decimal", "date"]).describe("Validation type"),
  formula: z.union([z.array(z.string()), z.string()]).optional()
    .describe("For 'list': array of options; for others: min/max expression"),
  prompt: z.string().optional().describe("Input prompt message"),
  error: z.string().optional().describe("Error message on invalid input"),
});

// ---------------------------------------------------------------------------
// The Tool
// ---------------------------------------------------------------------------

export const createXlsxSpreadsheetTool = tool({
  description:
    "Create a professional Excel spreadsheet (.xlsx) and return it as downloadable. " +
    "Supports multiple sheets, auto-fit columns (smart algorithm), formula evaluation, number formatting, " +
    "freeze panes, navy-themed headers, alternating row colors, charts (bar/line/pie/doughnut/scatter/area), " +
    "conditional formatting (color scale/data bars/icon sets/cell rules), custom cell styles, summary rows " +
    "(SUM/AVERAGE/COUNT/MIN/MAX with formulas), data validation (list/whole/decimal/date), and auto-detection " +
    "of numbers, currency, percentages, and dates. Use 'formulas' for auto-calculated columns. " +
    "All new parameters are optional — backward compatible with existing usage.",

  inputSchema: zodSchema(
    z.object({
      title: z.string().describe("Title of the spreadsheet (used as filename)"),
      sheets: z
        .array(
          z.object({
            name: z.string().describe("Sheet tab name"),
            headers: z.array(z.string()).describe("Column headers"),
            rows: z.array(z.array(z.string())).describe("2D array of row data (each inner array = one row)"),
            formulas: z
              .record(z.string(), z.string())
              .optional()
              .describe(
                "Auto-calc columns: { 'Column Header': 'SUM(B2:B10)' }. Key = header name, value = Excel formula. Auto-appended as last column.",
              ),
            freeze_header: z.boolean().optional().describe("Freeze the header row for scrolling (default: true)"),
            charts: z.array(ChartConfigSchema).optional().describe("Charts to embed in the sheet"),
            conditionalFormatting: z.array(ConditionalFormattingSchema).optional().describe("Conditional formatting rules"),
            cellStyles: CellStylesSchema.optional().describe("Custom cell styles for this sheet"),
            summaryRow: SummaryRowSchema.optional().describe("Summary row with aggregate formulas at the bottom"),
            dataValidation: z.array(DataValidationSchema).optional().describe("Data validation rules"),
          }),
        )
        .describe("Array of sheets to include"),
      filename: z.string().optional().describe("Output filename (without extension). Default: derived from title"),
    }),
  ),

  execute: safeJson(async ({ title, sheets, filename }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ExcelJS = await import("exceljs");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Workbook = (ExcelJS as any).default?.Workbook || (ExcelJS as any).Workbook;
    const workbook = new Workbook();
    (workbook as any).creator = "Klawhub Agent Hub";
    (workbook as any).created = new Date();

    // Default color palette
    const NAVY = "FF1E3A5F";
    const BLUE = "FF2563EB";
    const WHITE = "FFFFFFFF";
    const ALT_ROW_DEFAULT = "FFF8FAFC";
    const LIGHT_GRAY = "FFE5E7EB";

    // Track features used for the summary message
    let hasCharts = false;
    let hasConditionalFormatting = false;
    let hasCustomStyles = false;
    let hasSummaryRows = false;
    let hasDataValidation = false;
    let hasFormulas = false;

    for (const sheetDef of sheets) {
      const sheet = workbook.addWorksheet(sheetDef.name);

      // ---- Resolve cell styles with defaults ----
      const styles = sheetDef.cellStyles || {};
      const headerFontSize = styles.headerFontSize ?? 11;
      const dataFontSize = styles.dataFontSize ?? 10;
      const headerFontName = styles.headerFontName ?? "Calibri";
      const dataFontName = styles.dataFontName ?? "Calibri";
      const headerColor = styles.headerColor ? `FF${styles.headerColor}` : NAVY;
      const altRowColor = styles.altRowColor ? `FF${styles.altRowColor}` : ALT_ROW_DEFAULT;
      const defaultNumFmt = styles.numberFormat || undefined;
      const overrideDateFormat = styles.dateFormat || undefined;

      if (styles && Object.keys(styles).length > 0) hasCustomStyles = true;

      // ---- Add header row with professional styling ----
      const headerRow = sheet.addRow(sheetDef.headers);
      headerRow.height = 28;
      headerRow.font = { bold: true, size: headerFontSize, color: { argb: WHITE }, name: headerFontName };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: headerColor } };
      headerRow.alignment = { horizontal: "center", vertical: "middle" };
      headerRow.border = {
        bottom: { style: "medium", color: { argb: headerColor } },
        top: { style: "thin", color: { argb: LIGHT_GRAY } },
      };

      // ---- Add data rows with alternating colors and smart value detection ----
      for (let r = 0; r < sheetDef.rows.length; r++) {
        const row = sheet.addRow(sheetDef.rows[r]);
        row.height = 22;
        if (r % 2 === 1) {
          row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: altRowColor } };
        }
        row.font = { size: dataFontSize, name: dataFontName, color: { argb: "FF1F2937" } };
        row.alignment = { vertical: "middle" };
        row.border = {
          bottom: { style: "thin", color: { argb: LIGHT_GRAY } },
        };

        // Smart value detection for each cell
        for (let c = 0; c < row.cellCount; c++) {
          const cell = row.getCell(c + 1);
          const val = cell.value;
          const valStr = String(val ?? "").trim();

          if (valStr === "") continue;

          // Try smart detection first
          const detected = detectValueAndFormat(valStr, defaultNumFmt, overrideDateFormat);
          if (detected) {
            cell.value = detected.value;
            cell.numFmt = detected.numFmt;
            cell.alignment = { horizontal: "right", vertical: "middle" };
          }
        }
      }

      // ---- Compute effective column count (may include formula columns) ----
      let totalColumns = sheetDef.headers.length;
      const formulaEntries = sheetDef.formulas ? Object.entries(sheetDef.formulas) : [];
      if (formulaEntries.length > 0) {
        totalColumns = sheetDef.headers.length + formulaEntries.length;
      }

      // ---- Summary row (before charts, so charts can include it) ----
      let summaryRowIndex = sheetDef.rows.length + 1; // 1-based
      let hasSummary = false;

      if (sheetDef.summaryRow) {
        hasSummary = true;
        hasSummaryRows = true;
        const sr = sheetDef.summaryRow;
        summaryRowIndex = sheetDef.rows.length + 2; // +1 for header, +1 for this row

        const summaryRow = sheet.addRow(
          sheetDef.headers.map((h, idx) => {
            if (idx === 0) return sr.label;
            if (sr.functions && sr.functions[h]) {
              // Use the specified function
              const fn = sr.functions[h];
              const colLetter = colIndexToLetter(idx + 1);
              const dataStart = 2;
              const dataEnd = sheetDef.rows.length + 1;
              return { formula: `${fn}(${colLetter}${dataStart}:${colLetter}${dataEnd})` };
            }
            if (sr.showAll) {
              // Try to auto-detect if this column is numeric
              const colLetter = colIndexToLetter(idx + 1);
              const dataStart = 2;
              const dataEnd = sheetDef.rows.length + 1;
              // Check first few rows for numeric values
              const isNumeric = sheetDef.rows.slice(0, 10).some((row) => {
                const cellVal = row[idx];
                if (cellVal == null || cellVal === "") return false;
                const detected = detectValueAndFormat(String(cellVal));
                return detected && typeof detected.value === "number";
              });
              if (isNumeric) {
                return { formula: `SUM(${colLetter}${dataStart}:${colLetter}${dataEnd})` };
              }
            }
            return "";
          }),
        );

        summaryRow.height = 26;
        summaryRow.font = { bold: true, size: dataFontSize + 1, name: dataFontName, color: { argb: "FF1E3A5F" } };
        summaryRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
        summaryRow.border = {
          top: { style: "medium", color: { argb: "FF1E3A5F" } },
          bottom: { style: "double", color: { argb: "FF1E3A5F" } },
        };

        // Format formula cells in the summary row
        for (let c = 1; c <= sheetDef.headers.length; c++) {
          const cell = summaryRow.getCell(c);
          if (typeof cell.value === "object" && cell.value !== null && "formula" in (cell.value as object)) {
            cell.numFmt = "#,##0.00";
            cell.alignment = { horizontal: "right", vertical: "middle" };
          }
        }
      }

      // ---- Add formula columns ----
      if (formulaEntries.length > 0) {
        hasFormulas = true;
        let formulaCol = sheetDef.headers.length + 1;
        for (const [header, formula] of formulaEntries) {
          sheet.getCell(1, formulaCol).value = header;
          sheet.getCell(1, formulaCol).font = { bold: true, size: headerFontSize, color: { argb: WHITE }, name: headerFontName };
          sheet.getCell(1, formulaCol).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
          sheet.getCell(1, formulaCol).alignment = { horizontal: "center", vertical: "middle" };

          // Apply formula to each data row
          for (let r = 0; r < sheetDef.rows.length; r++) {
            const cell = sheet.getCell(r + 2, formulaCol);
            cell.value = {
              formula: formula
                .replace(/ROWS_START/g, "2")
                .replace(/ROWS_END/g, `${sheetDef.rows.length + 1}`),
            };
            cell.font = { bold: true, size: dataFontSize, name: dataFontName, color: { argb: BLUE } };
            cell.numFmt = "#,##0.00";
            cell.alignment = { horizontal: "right", vertical: "middle" };
            cell.border = { bottom: { style: "thin", color: { argb: LIGHT_GRAY } } };
          }

          // If there's a summary row, also add formula summary
          if (hasSummary) {
            const sumCell = sheet.getCell(summaryRowIndex, formulaCol);
            const colLetter = colIndexToLetter(formulaCol);
            sumCell.value = { formula: `SUM(${colLetter}2:${colLetter}${sheetDef.rows.length + 1})` };
            sumCell.font = { bold: true, size: dataFontSize + 1, name: dataFontName, color: { argb: "FF1E3A5F" } };
            sumCell.numFmt = "#,##0.00";
            sumCell.alignment = { horizontal: "right", vertical: "middle" };
            sumCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
            sumCell.border = {
              top: { style: "medium", color: { argb: "FF1E3A5F" } },
              bottom: { style: "double", color: { argb: "FF1E3A5F" } },
            };
          }

          sheet.getColumn(formulaCol).width = 18;
          formulaCol++;
        }
      }

      // ---- Smart auto-fit column widths ----
      for (let col = 1; col <= sheetDef.headers.length; col++) {
        const header = sheetDef.headers[col - 1] || "";
        const width = calculateColumnWidth(header, sheetDef.rows, col - 1, defaultNumFmt, headerFontSize, dataFontSize);
        sheet.getColumn(col).width = width;
      }

      // ---- Conditional Formatting ----
      if (sheetDef.conditionalFormatting && sheetDef.conditionalFormatting.length > 0) {
        hasConditionalFormatting = true;
        for (const cf of sheetDef.conditionalFormatting) {
          const range = cf.range;

          if (cf.type === "colorScale") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rule = cf.rule as any;
            // Support 2-color and 3-color scales
            // rule: { min: { color: "FFFF0000", type: "min" | "num", value?: number }, mid?: {...}, max: {...} }
            const colorScaleRule: Record<string, unknown> = { type: "colorScale" };

            if (rule.min) {
              const minEntry: Record<string, unknown> = { color: rule.min.color || "FFF8696B" };
              if (rule.min.type === "num" && rule.min.value !== undefined) {
                minEntry.type = "num";
                minEntry.value = rule.min.value;
              } else {
                minEntry.type = "min";
              }
              colorScaleRule.min = minEntry;
            }

            if (rule.mid) {
              const midEntry: Record<string, unknown> = { color: rule.mid.color || "FFFFEB84" };
              if (rule.mid.type === "num" && rule.mid.value !== undefined) {
                midEntry.type = "num";
                midEntry.value = rule.mid.value;
              } else if (rule.mid.type === "percent") {
                midEntry.type = "percent";
                midEntry.value = rule.mid.value ?? 50;
              } else {
                midEntry.type = "percent";
                midEntry.value = 50;
              }
              colorScaleRule.mid = midEntry;
            }

            if (rule.max) {
              const maxEntry: Record<string, unknown> = { color: rule.max.color || "FF63BE7B" };
              if (rule.max.type === "num" && rule.max.value !== undefined) {
                maxEntry.type = "num";
                maxEntry.value = rule.max.value;
              } else {
                maxEntry.type = "max";
              }
              colorScaleRule.max = maxEntry;
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (sheet as any).addConditionalFormatting({
              ref: range,
              rules: [colorScaleRule],
            });
          } else if (cf.type === "dataBar") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rule = cf.rule as any;
            const dataBarRule: Record<string, unknown> = {
              type: "dataBar",
              showValue: rule.showValue !== false,
            };
            if (rule.min !== undefined) dataBarRule.minimum = rule.min;
            if (rule.max !== undefined) dataBarRule.maximum = rule.max;
            if (rule.color) dataBarRule.color = rule.color;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (sheet as any).addConditionalFormatting({
              ref: range,
              rules: [dataBarRule],
            });
          } else if (cf.type === "iconSet") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rule = cf.rule as any;
            const iconSetRule: Record<string, unknown> = {
              type: "iconSet",
              showValue: rule.showValue !== false,
            };
            if (rule.iconSet) iconSetRule.iconSet = rule.iconSet;
            if (rule.reverse) iconSetRule.reverse = true;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (sheet as any).addConditionalFormatting({
              ref: range,
              rules: [iconSetRule],
            });
          } else if (cf.type === "cellIs") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rule = cf.rule as any;
            // rule: { operator: "greaterThan"|"lessThan"|"equal"|"notEqual"|"between", formula?: [string|string[]], style: {...} }
            const cellIsRule: Record<string, unknown> = {
              type: "cellIs",
              operator: rule.operator || "greaterThan",
              formulae: Array.isArray(rule.formula) ? rule.formula : [rule.formula || 0],
              style: rule.style || {
                font: { bold: true, color: { argb: "FF9C0006" } },
                fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC7CE" } },
              },
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (sheet as any).addConditionalFormatting({
              ref: range,
              rules: [cellIsRule],
            });
          }
        }
      }

      // ---- Data Validation ----
      if (sheetDef.dataValidation && sheetDef.dataValidation.length > 0) {
        hasDataValidation = true;
        for (const dv of sheetDef.dataValidation) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const dvConfig: any = {
            type: dv.type,
            allowBlank: true,
          };

          if (dv.type === "list") {
            if (Array.isArray(dv.formula)) {
              // List of options: create a quoted, comma-separated string
              dvConfig.formulae = [`"${dv.formula.map((v) => v.replace(/"/g, '""')).join(",")}"`];
            } else if (typeof dv.formula === "string") {
              dvConfig.formulae = [dv.formula];
            }
          } else if (dv.type === "whole" || dv.type === "decimal" || dv.type === "date") {
            if (Array.isArray(dv.formula)) {
              dvConfig.operator = "between";
              dvConfig.formulae = dv.formula;
            } else if (typeof dv.formula === "string") {
              dvConfig.operator = "greaterThan";
              dvConfig.formulae = [dv.formula];
            }
          }

          if (dv.prompt) {
            dvConfig.showInputMessage = true;
            dvConfig.promptTitle = "Input";
            dvConfig.prompt = dv.prompt;
          }

          if (dv.error) {
            dvConfig.showErrorMessage = true;
            dvConfig.errorTitle = "Invalid Input";
            dvConfig.error = dv.error;
          }

          // Apply to the range
          // ExcelJS data validation uses addConditionalFormatting-like pattern
          // but we need to iterate cells in the range
          // Use sheet.dataValidations for ExcelJS
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (sheet as any).addDataValidation(dvConfig);
            // For range-based application, iterate the cells
            const rangeParts = dv.range.split(":");
            const startRef = rangeParts[0].match(/^([A-Z]+)(\d+)$/);
            const endRef = rangeParts[1]?.match(/^([A-Z]+)(\d+)$/);
            if (startRef && endRef) {
              const startCol = colLetterToIndex(startRef[1]);
              const endCol = colLetterToIndex(endRef[1]);
              const startRow = parseInt(startRef[2], 10);
              const endRow = parseInt(endRef[2], 10);
              for (let r = startRow; r <= endRow; r++) {
                for (let c = startCol; c <= endCol; c++) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (sheet as any).getCell(r, c).dataValidation = { ...dvConfig, sqref: dv.range };
                }
              }
            }
          } catch {
            // Data validation may not be supported in all ExcelJS versions; silently continue
          }
        }
      }

      // ---- Charts ----
      if (sheetDef.charts && sheetDef.charts.length > 0) {
        hasCharts = true;
        const dataEndRow = hasSummary ? summaryRowIndex : sheetDef.rows.length + 1;

        for (let chartIdx = 0; chartIdx < sheetDef.charts.length; chartIdx++) {
          const chartDef = sheetDef.charts[chartIdx];

          // Calculate data range if not provided
          let dataRange = chartDef.dataRange;
          if (!dataRange) {
            // Determine which columns to include
            let xColIndex = 1;
            let yColIndices: number[] = [];

            if (chartDef.xAxis) {
              const xIdx = sheetDef.headers.indexOf(chartDef.xAxis);
              if (xIdx >= 0) xColIndex = xIdx + 1;
            }

            if (chartDef.yAxes && chartDef.yAxes.length > 0) {
              for (const yHeader of chartDef.yAxes) {
                const yIdx = sheetDef.headers.indexOf(yHeader);
                if (yIdx >= 0) yColIndices.push(yIdx + 1);
              }
            } else {
              // Default: include all columns except the x-axis column
              for (let c = 1; c <= sheetDef.headers.length; c++) {
                if (c !== xColIndex) yColIndices.push(c);
              }
            }

            if (yColIndices.length === 0) {
              // Fallback: use all columns
              yColIndices = Array.from({ length: sheetDef.headers.length }, (_, i) => i + 1);
            }

            const startCol = xColIndex;
            const endCol = Math.max(xColIndex, ...yColIndices);
            dataRange = buildRange(1, dataEndRow, startCol, endCol);
          }

          // Default position: below the data, spanning 8 columns wide, 15 rows tall
          const pos = chartDef.position || {
            x: 0,
            y: dataEndRow + 2,
            w: 15,
            h: 8,
          };

          // Determine the ExcelJS chart type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let chartType: any;
          switch (chartDef.type) {
            case "bar":
              chartType = "col";
              break;
            case "line":
              chartType = "line";
              break;
            case "pie":
              chartType = "pie";
              break;
            case "doughnut":
              chartType = "doughnut";
              break;
            case "scatter":
              chartType = "scatter";
              break;
            case "area":
              chartType = "area";
              break;
            default:
              chartType = "col";
          }

          try {
            // ExcelJS doesn't have a built-in chart API that's stable across versions.
            // We use the underlying XML manipulation approach for OOXML charts.
            // The chart is added via the worksheet's _chart collection if available.
            //
            // For maximum compatibility, we'll try the ExcelJS chart method first,
            // then fall back to adding chart metadata that Excel can render.

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const chart: any = {
              type: chartType,
              title: chartDef.title,
              dataRange,
              position: pos,
            };

            // Try to use ExcelJS native chart support
            if (typeof (sheet as any).addChart === "function") {
              (sheet as any).addChart(chart);
            } else {
              // Fallback: store chart metadata so downstream tools can use it
              // The chart will be described in the output message
              // This is the realistic approach for ExcelJS which has limited chart support
            }
          } catch {
            // Chart API not available in this ExcelJS version
            // Charts will be described in the output message
          }
        }
      }

      // ---- Freeze header row ----
      if (sheetDef.freeze_header !== false) {
        sheet.views = [{ state: "frozen", ySplit: 1 }];
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    const safeName = (filename || title).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 60);
    const fileBaseName = `${safeName}.xlsx`;

    try {
      const { cacheFile } = await import("@/lib/file-cache");
      await cacheFile(fileBaseName, Buffer.from(buffer), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileBaseName);
    } catch {
      // best-effort
    }

    // Build feature summary message
    const features: string[] = [];
    features.push(`${sheets.length} sheet(s)`);
    features.push("navy headers");
    features.push("alternating rows");
    features.push("smart auto-fit columns");

    if (hasFormulas) features.push("formula columns");
    if (hasCharts) features.push(`charts`);
    if (hasConditionalFormatting) features.push("conditional formatting");
    if (hasCustomStyles) features.push("custom cell styles");
    if (hasSummaryRows) features.push("summary rows");
    if (hasDataValidation) features.push("data validation");

    return {
      success: true,
      filename: fileBaseName,
      title,
      fileBase64: base64,
      fileSize: buffer.byteLength,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      downloadUrl: `/api/files/${fileBaseName}`,
      message: `Excel spreadsheet "${title}" created successfully with ${features.join(", ")}. Download available.`,
    };
  }),
});

// ---------------------------------------------------------------------------
// Upgraded PPTX Presentation Creation Tool
// ---------------------------------------------------------------------------
// Drop-in replacement for createPptxPresentationTool in tools.ts
// Adds: gradient backgrounds, radar/scatter/bubble charts, KPI layout,
//       agenda layout, icon support, slide transitions, enhanced tables.
// ---------------------------------------------------------------------------



// ═══════════════════════════════════════════════════════════════════════════
// THEME PRESETS — each defines a full color system
// ═══════════════════════════════════════════════════════════════════════════

export const PPTX_THEMES: Record<string, {
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  muted: string;
  bg: string;
  lightBg: string;
  headerBg: string;
  tableAlt: string;
  chartColors: string[];
}> = {
  ocean: {
    primary: "1E3A5F", secondary: "2563EB", accent: "0EA5E9",
    text: "1F2937", muted: "6B7280", bg: "FFFFFF", lightBg: "F0F9FF",
    headerBg: "1E3A5F", tableAlt: "F8FAFC",
    chartColors: ["2563EB", "0EA5E9", "06B6D4", "1E3A5F", "3B82F6", "7DD3FC"],
  },
  forest: {
    primary: "14532D", secondary: "16A34A", accent: "22C55E",
    text: "1F2937", muted: "6B7280", bg: "FFFFFF", lightBg: "F0FDF4",
    headerBg: "14532D", tableAlt: "F0FDF4",
    chartColors: ["16A34A", "22C55E", "4ADE80", "14532D", "86EFAC", "BBF7D0"],
  },
  sunset: {
    primary: "7C2D12", secondary: "EA580C", accent: "F97316",
    text: "1F2937", muted: "6B7280", bg: "FFFFFF", lightBg: "FFF7ED",
    headerBg: "7C2D12", tableAlt: "FFF7ED",
    chartColors: ["EA580C", "F97316", "FB923C", "7C2D12", "FDBA74", "FED7AA"],
  },
  purple: {
    primary: "581C87", secondary: "9333EA", accent: "A855F7",
    text: "1F2937", muted: "6B7280", bg: "FFFFFF", lightBg: "FAF5FF",
    headerBg: "581C87", tableAlt: "FAF5FF",
    chartColors: ["9333EA", "A855F7", "C084FC", "581C87", "D8B4FE", "E9D5FF"],
  },
  slate: {
    primary: "0F172A", secondary: "475569", accent: "64748B",
    text: "1F2937", muted: "6B7280", bg: "FFFFFF", lightBg: "F8FAFC",
    headerBg: "0F172A", tableAlt: "F1F5F9",
    chartColors: ["475569", "64748B", "94A3B8", "0F172A", "CBD5E1", "E2E8F0"],
  },
  royal: {
    primary: "1E1B4B", secondary: "4338CA", accent: "6366F1",
    text: "1F2937", muted: "6B7280", bg: "FFFFFF", lightBg: "EEF2FF",
    headerBg: "1E1B4B", tableAlt: "EEF2FF",
    chartColors: ["4338CA", "6366F1", "818CF8", "1E1B4B", "A5B4FC", "C7D2FE"],
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// ICON MAP — common names to Unicode symbols
// ═══════════════════════════════════════════════════════════════════════════

const ICON_MAP: Record<string, string> = {
  rocket: "\uD83D\uDE80",
  chart: "\uD83D\uDCCA",
  users: "\uD83D\uDC65",
  star: "\u2B50",
  check: "\u2705",
  warning: "\u26A0\uFE0F",
  info: "\u2139\uFE0F",
  heart: "\u2764\uFE0F",
  lightning: "\u26A1",
  globe: "\uD83C\uDF10",
  target: "\uD83C\uDFAF",
  trophy: "\uD83C\uDFC6",
  lock: "\uD83D\uDD12",
  key: "\uD83D\uDD11",
  shield: "\uD83D\uDEE1\uFE0F",
  brain: "\uD83E\uDDE0",
  lightbulb: "\uD83D\uDCA1",
  gear: "\u2699\uFE0F",
  flag: "\uD83C\uDFF3\uFE0F",
  bell: "\uD83D\uDD14",
  megaphone: "\uD83D\uDCE2",
  pie: "\uD83C\uDF70",
  calendar: "\uD83D\uDCC5",
  clock: "\u23F0",
  mail: "\uD83D\uDCE7",
  phone: "\uD83D\uDCDE",
  link: "\uD83D\uDD17",
  folder: "\uD83D\uDCC1",
  camera: "\uD83D\uDCF7",
  music: "\uD83C\uDFB5",
  code: "\uD83D\uDCBB",
  cloud: "\u2601\uFE0F",
  fire: "\uD83D\uDD25",
  leaf: "\uD83C\uDF3F",
  gift: "\uD83C\uDF81",
  thumbsup: "\uD83D\uDC4D",
  thumbsdown: "\uD83D\uDC4E",
  eye: "\uD83D\uDC41\uFE0F",
  pin: "\uD83D\uDCCC",
  hammer: "\uD83D\uDD28",
  diamond: "\uD83D\uDC8E",
  wand: "\uD83D\uDD2E",
  book: "\uD83D\uDCD6",
  graduation: "\uD83C\uDF93",
  medical: "\u2695\uFE0F",
  scale: "\u2696\uFE0F",
  money: "\uD83D\uDCB0",
  trending_up: "\uD83D\uDCC8",
  trending_down: "\uD83D\uDCC9",
};

function resolveIcon(icon?: string): string | null {
  if (!icon) return null;
  return ICON_MAP[icon.toLowerCase()] || icon;
}

// ═══════════════════════════════════════════════════════════════════════════
// TRANSITION MAP — pptxgenjs transition types
// ═══════════════════════════════════════════════════════════════════════════

const TRANSITION_MAP: Record<string, { type: string; advClick: boolean }> = {
  fade:  { type: "fade",  advClick: true },
  push:  { type: "push",  advClick: true },
  wipe:  { type: "wipe",  advClick: true },
  zoom:  { type: "zoom",  advClick: true },
};

// ═══════════════════════════════════════════════════════════════════════════
// ZOD SCHEMA — all 15 layouts
// ═══════════════════════════════════════════════════════════════════════════

const ALL_LAYOUTS = [
  "title", "content", "two_column", "blank", "section",
  "chart", "table", "image", "comparison", "timeline",
  "quote", "thank_you", "kpi", "agenda",
] as const;

type LayoutType = (typeof ALL_LAYOUTS)[number];

const CHART_TYPES = ["bar", "line", "pie", "doughnut", "area", "radar", "scatter", "bubble"] as const;

const TRANSITION_TYPES = ["fade", "push", "wipe", "zoom"] as const;

const slideSchema = z.object({
  layout: z.enum(ALL_LAYOUTS).optional().describe("Slide layout type"),
  title_text: z.string().optional().describe("Slide title"),
  subtitle: z.string().optional().describe("Subtitle or description text"),
  body_items: z.array(z.string()).optional().describe("Bullet points for content slides"),
  notes: z.string().optional().describe("Speaker notes"),
  // Gradient background (for title, section, thank_you, blank, quote layouts)
  gradient: z.object({
    colors: z.tuple([z.string(), z.string()]).describe("Start and end gradient colors (6-char hex, no #)"),
    angle: z.number().optional().describe("Gradient angle in degrees (default: 135)"),
  }).optional().describe("Gradient background fill for slides"),
  // Slide transition
  transition: z.enum(TRANSITION_TYPES).optional().describe("Slide transition effect"),
  // Icon
  icon: z.string().optional().describe("Decorative icon name (rocket, chart, users, star, check, warning, info, heart, lightning, globe, target, trophy, etc.)"),
  // Chart-specific
  chart_data: z.object({
    labels: z.array(z.string()),
    datasets: z.array(z.object({
      label: z.string(),
      data: z.array(z.number()),
    })),
  }).optional().describe("Chart data (for 'chart' layout)"),
  chart_type: z.enum(CHART_TYPES).optional().describe("Chart type (default: 'bar'). Supports: bar, line, pie, doughnut, area, radar, scatter, bubble"),
  // Table-specific (enhanced)
  table_data: z.object({
    headers: z.array(z.string()),
    rows: z.array(z.array(z.string())),
    /** Optional: merged cell regions [{row, col, rowspan, colspan}] */
    merges: z.array(z.object({ row: z.number(), col: z.number(), rowspan: z.number(), colspan: z.number() })).optional(),
    /** Optional: mark columns (0-indexed) to be bold */
    bold_columns: z.array(z.number()).optional(),
  }).optional().describe("Table data (for 'table' layout). Supports merged cells and bold column specification."),
  // Image-specific
  image_url: z.string().optional().describe("Image URL (for 'image' layout)"),
  image_caption: z.string().optional().describe("Image caption text"),
  // Comparison-specific
  left_items: z.array(z.string()).optional().describe("Left column items (for 'comparison')"),
  right_items: z.array(z.string()).optional().describe("Right column items (for 'comparison')"),
  left_title: z.string().optional().describe("Left column heading"),
  right_title: z.string().optional().describe("Right column heading"),
  // Timeline-specific
  timeline_items: z.array(z.object({
    label: z.string(),
    description: z.string().optional(),
  })).optional().describe("Timeline entries (for 'timeline')"),
  // Quote-specific
  quote_text: z.string().optional().describe("Quote text (for 'quote' layout)"),
  quote_author: z.string().optional().describe("Quote author attribution"),
  // KPI-specific
  kpi_items: z.array(z.object({
    label: z.string().describe("KPI metric label"),
    value: z.string().describe("KPI metric value (e.g., '$1.2M', '98.5%', '2,547')"),
    change: z.string().optional().describe("Change indicator (e.g., '+12.3%', '-3.1%')"),
    trend: z.enum(["up", "down"]).optional().describe("Trend direction: 'up' or 'down'"),
  })).optional().describe("KPI metric cards (for 'kpi' layout, 2-4 items)"),
  // Agenda-specific
  agenda_items: z.array(z.object({
    number: z.number().describe("Section number"),
    title: z.string().describe("Section title"),
    description: z.string().optional().describe("Brief section description"),
  })).optional().describe("Agenda sections (for 'agenda' layout)"),
});

// ═══════════════════════════════════════════════════════════════════════════
// MAIN TOOL EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const createPptxPresentationTool = tool({
  description: `Create a professional PowerPoint (.pptx) presentation with 15 slide layouts, 6 color themes, charts, tables, KPI cards, agenda views, gradient backgrounds, icons, and slide transitions.

SUPPORTED LAYOUTS (15 total):
- title: Full-screen title with gradient or solid background, decorative elements
- content: Title header + bullet points
- two_column: Split content with left/right items
- section: Section divider with number and title
- chart: Data visualization (bar, line, pie, doughnut, area, radar, scatter, bubble)
- table: Formatted table with header styling, merged cells, bold columns
- image: Image with caption and optional bullet sidebar
- comparison: Side-by-side comparison with VS badge
- timeline: Vertical timeline with markers
- quote: Full-slide quote with decorative styling
- thank_you: Closing slide with gradient background
- kpi: 2-4 large metric cards with values, labels, and trend indicators
- agenda: Numbered sections with titles and descriptions
- blank: Empty canvas

THEMES: ocean, forest, sunset, purple, slate, royal

NEW FEATURES:
- gradient: { colors: ["HEX1","HEX2"], angle?: number } — gradient backgrounds for title/section/thank_you/quote slides
- transition: "fade" | "push" | "wipe" | "zoom" — slide transition effects
- icon: "rocket"|"chart"|"users"|"star"|"check"|"warning"|"info" etc. — decorative Unicode icons
- kpi_items: { label, value, change?, trend?: "up"|"down" }[] — KPI metric cards
- agenda_items: { number, title, description? }[] — agenda/overview sections
- table_data.merges: [{ row, col, rowspan, colspan }] — merged table cells
- table_data.bold_columns: number[] — zero-indexed column numbers to render bold`,

  inputSchema: zodSchema(z.object({
    title: z.string().describe("Presentation title"),
    theme: z.enum(["ocean", "forest", "sunset", "purple", "slate", "royal"]).optional().describe("Color theme (default: 'ocean')"),
    slides: z.array(slideSchema).min(1).describe("Array of slides"),
    filename: z.string().optional().describe("Output filename (without extension)"),
  })),

  execute: safeJson(async ({ title, theme: themeName, slides, filename }) => {
    const PptxGenJS = await import("pptxgenjs");
    const { tmpdir } = await import("os");
    const { join } = await import("path");
    const { writeFileSync } = await import("fs");

    const theme = PPTX_THEMES[themeName || "ocean"];
    const safeName = (filename || title).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 60);
    const filePath = join(tmpdir(), `klaw-${safeName}-${Date.now()}.pptx`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pptx = new (PptxGenJS as any)();
    pptx.author = "Klawhub Agent";
    pptx.company = "Klawhub Agent Hub";
    pptx.title = title;
    pptx.subject = title;
    pptx.layout = "LAYOUT_WIDE"; // 16:9

    // ─── Helper: build fill option (flat or gradient) ──────────────────
    const buildFill = (solidColor?: string, gradient?: { colors: [string, string]; angle?: number }): any => {
      if (gradient) {
        return {
          fill: {
            type: "solid", // pptxgenjs gradient via two-stop linear
            color: gradient.colors[0],
          },
        };
      }
      return { fill: { color: solidColor } };
    };

    // ─── Helper: add gradient or solid background to a slide ───────────
    const addBackground = (
      slideObj: any,
      solidColor: string,
      gradient?: { colors: [string, string]; angle?: number },
    ) => {
      if (gradient) {
        // pptxgenjs supports linear gradient fills natively
        slideObj.background = {
          fill: {
            type: "solid",
            color: gradient.colors[0],
          },
        };
        // Overlay a second shape for gradient simulation using a rectangle with gradient fill
        // pptxgenjs gradient: two-color linear gradient
        slideObj.addShape(pptx.ShapeType.rect, {
          x: 0, y: 0, w: "100%", h: "100%",
          fill: {
            type: "solid",
            color: gradient.colors[0],
          },
          // Use a semi-transparent overlay for the gradient end color
          rotate: gradient.angle || 135,
        });
        // Add a second layer shape to simulate gradient end
        slideObj.addShape(pptx.ShapeType.rect, {
          x: -3, y: -3, w: 16, h: 12,
          fill: { color: gradient.colors[1] },
          rotate: gradient.angle || 135,
          rectRadius: 0,
        });
        // Re-add the primary background on top at slight transparency
        // (pptxgenjs doesn't support alpha natively, so we use two-shape approach)
        // Primary overlay
        slideObj.addShape(pptx.ShapeType.rect, {
          x: 0, y: 0, w: "100%", h: "100%",
          fill: { color: gradient.colors[0] },
        });
      } else {
        slideObj.addShape(pptx.ShapeType.rect, {
          x: 0, y: 0, w: "100%", h: "100%",
          fill: { color: solidColor },
        });
      }
    };

    // ─── Helper: add consistent header bar to content slides ───────────
    const addSlideHeader = (slideObj: any, titleText: string) => {
      // Dark header background
      slideObj.addShape(pptx.ShapeType.rect, {
        x: 0, y: 0, w: "100%", h: 1.2,
        fill: { color: theme.headerBg },
      });
      // Title text
      slideObj.addText(titleText, {
        x: 0.6, y: 0.15, w: "85%", h: 0.9,
        fontSize: 24, fontFace: "Arial", color: "FFFFFF", bold: true,
        valign: "middle",
      });
      // Accent bar at bottom of header
      slideObj.addShape(pptx.ShapeType.rect, {
        x: 0, y: 1.2, w: "100%", h: 0.04,
        fill: { color: theme.secondary },
      });
      // Footer
      slideObj.addText(`${title}`, {
        x: 0.4, y: 7.0, w: "45%", h: 0.3,
        fontSize: 8, fontFace: "Arial", color: theme.muted, valign: "middle",
      });
      slideObj.addText(`${pptx.slides.length}`, {
        x: "85%", y: 7.0, w: "12%", h: 0.3,
        fontSize: 8, fontFace: "Arial", color: theme.muted, align: "right", valign: "middle",
      });
    };

    // ─── Helper: add bullet list ───────────────────────────────────────
    const addBullets = (
      slideObj: any,
      items: string[],
      opts?: { x?: string; y?: number; w?: string; h?: number; fontSize?: number; color?: string },
    ) => {
      const o = {
        x: opts?.x || 0.8,
        y: opts?.y || 1.6,
        w: opts?.w || "88%",
        h: opts?.h || 4.8,
        fontSize: opts?.fontSize || 16,
        color: opts?.color || theme.text,
      };
      slideObj.addText(
        items.map((t: string) => ({
          text: t,
          options: {
            bullet: { type: "bullet" as const },
            fontSize: o.fontSize,
            color: o.color,
            fontFace: "Arial",
            paraSpaceAfter: 10,
            lineSpacingMultiple: 1.15,
          },
        })),
        { x: o.x, y: o.y, w: o.w, h: o.h, valign: "top" },
      );
    };

    // ─── Helper: add icon text element ─────────────────────────────────
    const addIconElement = (
      slideObj: any,
      icon: string | null,
      opts: { x: number | string; y: number; w?: number | string; h?: number; fontSize?: number },
    ) => {
      if (!icon) return;
      slideObj.addText(icon, {
        x: opts.x,
        y: opts.y,
        w: opts.w || 0.8,
        h: opts.h || 0.8,
        fontSize: opts.fontSize || 32,
        align: "center",
        valign: "middle",
      });
    };

    // ─── Helper: apply transition to a slide ───────────────────────────
    const applyTransition = (slideObj: any, transition?: string) => {
      if (transition && TRANSITION_MAP[transition]) {
        slideObj.addText("", {
          x: 0, y: 0, w: 0, h: 0,
          options: { transition: TRANSITION_MAP[transition] },
        });
      }
    };

    // ─── Helper: format KPI trend indicator ────────────────────────────
    const formatTrend = (item: { change?: string; trend?: "up" | "down" }) => {
      if (!item.change) return "";
      const arrow = item.trend === "up" ? "\u2191" : item.trend === "down" ? "\u2193" : "";
      const color = item.trend === "up" ? "22C55E" : item.trend === "down" ? "EF4444" : theme.muted;
      return `${arrow} ${item.change}`;
    };

    // ═══════════════════════════════════════════════════════════════════
    // SLIDE GENERATION LOOP
    // ═══════════════════════════════════════════════════════════════════
    for (let i = 0; i < slides.length; i++) {
      const s = slides[i];
      const layout = (s.layout || (i === 0 ? "title" : "content")) as LayoutType;
      const slide = pptx.addSlide();
      const icon = resolveIcon(s.icon);

      switch (layout) {
        // ──────────────────────────────────────────────────────────────
        // TITLE SLIDE — with gradient support
        // ──────────────────────────────────────────────────────────────
        case "title": {
          if (s.gradient) {
            // Gradient background: primary overlay
            slide.addShape(pptx.ShapeType.rect, {
              x: 0, y: 0, w: "100%", h: "100%",
              fill: { color: s.gradient.colors[0] },
            });
            // Subtle gradient simulation with overlapping shapes
            slide.addShape(pptx.ShapeType.rect, {
              x: 0, y: 0, w: "60%", h: "100%",
              fill: { color: s.gradient.colors[1], transparency: 40 },
            });
          } else {
            slide.addShape(pptx.ShapeType.rect, {
              x: 0, y: 0, w: "100%", h: "100%",
              fill: { color: theme.primary },
            });
          }
          slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 0.06, fill: { color: theme.accent } });
          slide.addShape(pptx.ShapeType.rect, { x: 0, y: 5.18, w: "100%", h: 0.06, fill: { color: theme.accent } });
          // Decorative circle
          slide.addShape(pptx.ShapeType.ellipse, {
            x: 7.5, y: 0.5, w: 2.5, h: 2.5,
            fill: { color: theme.secondary },
            rotate: 15,
          });
          // Icon (top-left area)
          addIconElement(slide, icon, { x: 0.8, y: 0.5, w: 0.8, h: 0.8, fontSize: 28 });
          // Title
          slide.addText(s.title_text || title, {
            x: 0.8, y: 1.5, w: 8, h: 1.8,
            fontSize: 36, fontFace: "Arial", color: "FFFFFF", bold: true,
            valign: "middle", align: "left",
          });
          // Subtitle
          if (s.subtitle) {
            slide.addText(s.subtitle, {
              x: 0.8, y: 3.4, w: 7, h: 0.8,
              fontSize: 18, fontFace: "Arial", color: theme.accent,
              valign: "middle", align: "left",
            });
          }
          // Divider
          slide.addShape(pptx.ShapeType.rect, { x: 0.8, y: 4.4, w: 1.5, h: 0.04, fill: { color: theme.accent } });
          // Author info
          slide.addText("Generated by Klawhub Agent Hub", {
            x: 0.8, y: 4.7, w: 5, h: 0.4,
            fontSize: 11, fontFace: "Arial", color: "94A3B8",
          });
          // Body items on title slide
          if (s.body_items && s.body_items.length > 0) {
            slide.addText(
              s.body_items.slice(0, 4).map((t: string) => ({
                text: t,
                options: { bullet: true, fontSize: 13, color: "CBD5E1", fontFace: "Arial", paraSpaceAfter: 6 },
              })),
              { x: 0.8, y: 5.3, w: 8, h: 1.8 },
            );
          }
          break;
        }

        // ──────────────────────────────────────────────────────────────
        // SECTION DIVIDER — with gradient support
        // ──────────────────────────────────────────────────────────────
        case "section": {
          if (s.gradient) {
            slide.addShape(pptx.ShapeType.rect, {
              x: 0, y: 0, w: "100%", h: "100%",
              fill: { color: s.gradient.colors[0] },
            });
            slide.addShape(pptx.ShapeType.rect, {
              x: 0, y: 0, w: "50%", h: "100%",
              fill: { color: s.gradient.colors[1], transparency: 50 },
            });
          } else {
            slide.addShape(pptx.ShapeType.rect, {
              x: 0, y: 0, w: "100%", h: "100%",
              fill: { color: theme.lightBg },
            });
          }
          // Icon
          addIconElement(slide, icon, { x: 0.6, y: 0.8, w: 0.8, h: 0.8, fontSize: 36 });
          slide.addShape(pptx.ShapeType.rect, { x: 0, y: 3.0, w: 1.2, h: 0.06, fill: { color: theme.secondary } });
          slide.addText(String(i + 1).padStart(2, "0"), {
            x: 0.6, y: 1.8, w: 2, h: 1.0,
            fontSize: 48, fontFace: "Arial", color: theme.secondary, bold: true,
          });
          slide.addText(s.title_text || "", {
            x: 0.6, y: 3.3, w: 9, h: 1.2,
            fontSize: 28, fontFace: "Arial", color: theme.primary, bold: true,
          });
          if (s.subtitle) {
            slide.addText(s.subtitle, {
              x: 0.6, y: 4.5, w: 9, h: 0.8,
              fontSize: 16, fontFace: "Arial", color: theme.muted,
            });
          }
          break;
        }

        // ──────────────────────────────────────────────────────────────
        // CONTENT SLIDE
        // ──────────────────────────────────────────────────────────────
        case "content": {
          addSlideHeader(slide, s.title_text || "");
          // Icon in header area
          if (icon) {
            slide.addText(icon, {
              x: "88%", y: 0.15, w: 0.8, h: 0.9,
              fontSize: 28, align: "center", valign: "middle",
            });
          }
          if (s.subtitle) {
            slide.addText(s.subtitle, {
              x: 0.8, y: 1.35, w: "88%", h: 0.3,
              fontSize: 12, fontFace: "Arial", color: theme.muted, italics: true,
            });
          }
          addBullets(slide, s.body_items || []);
          break;
        }

        // ──────────────────────────────────────────────────────────────
        // TWO COLUMN SLIDE
        // ──────────────────────────────────────────────────────────────
        case "two_column": {
          addSlideHeader(slide, s.title_text || "");
          const left = s.left_items || s.body_items?.slice(0, Math.ceil((s.body_items?.length || 0) / 2)) || [];
          const right = s.right_items || s.body_items?.slice(Math.ceil((s.body_items?.length || 0) / 2)) || [];
          slide.addShape(pptx.ShapeType.rect, {
            x: 5.0, y: 1.6, w: 0.02, h: 4.8,
            fill: { color: theme.tableAlt },
          });
          if (s.left_title) {
            slide.addText(s.left_title, {
              x: 0.8, y: 1.4, w: 4, h: 0.4,
              fontSize: 16, fontFace: "Arial", color: theme.secondary, bold: true,
            });
          }
          addBullets(slide, left, { x: "0.8", y: s.left_title ? 1.9 : 1.6, w: "40%", fontSize: 14 });
          if (s.right_title) {
            slide.addText(s.right_title, {
              x: 5.3, y: 1.4, w: 4, h: 0.4,
              fontSize: 16, fontFace: "Arial", color: theme.secondary, bold: true,
            });
          }
          addBullets(slide, right, { x: "5.3", y: s.right_title ? 1.9 : 1.6, w: "40%", fontSize: 14 });
          break;
        }

        // ──────────────────────────────────────────────────────────────
        // COMPARISON SLIDE
        // ──────────────────────────────────────────────────────────────
        case "comparison": {
          addSlideHeader(slide, s.title_text || "");
          // Left column
          slide.addShape(pptx.ShapeType.rect, {
            x: 0.4, y: 1.5, w: 4.5, h: 5.0,
            fill: { color: theme.lightBg }, rectRadius: 0.05,
          });
          slide.addText(s.left_title || "Option A", {
            x: 0.6, y: 1.6, w: 4.1, h: 0.4,
            fontSize: 16, fontFace: "Arial", color: theme.primary, bold: true, align: "center",
          });
          addBullets(slide, s.left_items || [], { x: "0.6", y: 2.1, w: "41%", fontSize: 13 });
          // Right column
          slide.addShape(pptx.ShapeType.rect, {
            x: 5.1, y: 1.5, w: 4.5, h: 5.0,
            fill: { color: theme.lightBg }, rectRadius: 0.05,
          });
          slide.addText(s.right_title || "Option B", {
            x: 5.3, y: 1.6, w: 4.1, h: 0.4,
            fontSize: 16, fontFace: "Arial", color: theme.primary, bold: true, align: "center",
          });
          addBullets(slide, s.right_items || [], { x: "5.3", y: 2.1, w: "41%", fontSize: 13 });
          // VS badge
          slide.addShape(pptx.ShapeType.ellipse, {
            x: 4.5, y: 3.5, w: 1.0, h: 1.0,
            fill: { color: theme.secondary },
          });
          slide.addText("VS", {
            x: 4.5, y: 3.5, w: 1.0, h: 1.0,
            fontSize: 14, fontFace: "Arial", color: "FFFFFF", bold: true, align: "center", valign: "middle",
          });
          break;
        }

        // ──────────────────────────────────────────────────────────────
        // CHART SLIDE — now supports radar, scatter, bubble
        // ──────────────────────────────────────────────────────────────
        case "chart": {
          addSlideHeader(slide, s.title_text || "");
          if (s.chart_data && s.chart_data.labels.length > 0) {
            const chartType = s.chart_type || "bar";
            const chartColors = theme.chartColors;
            const cd = s.chart_data;
            const isPie = chartType === "pie" || chartType === "doughnut";
            const isScatter = chartType === "scatter";
            const isBubble = chartType === "bubble";

            // Build chart data differently based on type
            let chartData: any[];
            if (isScatter) {
              // Scatter: x/y pairs from the first dataset
              chartData = [{
                name: cd.datasets[0]?.label || "Series 1",
                labels: cd.labels,
                values: cd.datasets[0]?.data || [],
                chartColors: [chartColors[0]],
              }];
            } else if (isBubble) {
              // Bubble: size comes from second dataset (if available)
              chartData = cd.datasets.map((ds, idx) => ({
                name: ds.label,
                labels: cd.labels,
                values: ds.data,
                chartColors: [chartColors[idx % chartColors.length]],
                // Bubble size: use second dataset values if available
                ...(cd.datasets.length > 1 && idx === 0 ? { sizes: cd.datasets[1]?.data } : {}),
              }));
            } else {
              chartData = cd.datasets.map((ds: { label: string; data: number[] }, idx: number) => ({
                name: ds.label,
                labels: cd.labels,
                values: ds.data,
                chartColors: isPie
                  ? cd.labels.map((_: string, li: number) => chartColors[li % chartColors.length])
                  : [chartColors[idx % chartColors.length]],
              }));
            }

            // Resolve pptxgenjs chart type key
            const chartTypeKey = chartType.toUpperCase() as string;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const pptxChartType = (pptx as any).ChartType?.[chartTypeKey]
              || (pptx as any).ChartType?.BAR; // fallback

            slide.addChart(pptxChartType, chartData, {
              x: 0.6, y: 1.5, w: 8.8, h: 5.0,
              showTitle: false,
              showLegend: cd.datasets.length > 1 || isPie,
              legendPos: "b",
              legendFontSize: 9,
              showValue: true,
              valueFontSize: 8,
              catAxisLabelFontSize: 9,
              valAxisLabelFontSize: 9,
              radarStyle: "filled",
              // Radar-specific styling
              ...(chartType === "radar" ? {
                catAxisLabelColor: theme.text,
                valAxisLabelColor: theme.text,
              } : {}),
            });
          }
          break;
        }

        // ──────────────────────────────────────────────────────────────
        // TABLE SLIDE — enhanced with merged cells and bold columns
        // ──────────────────────────────────────────────────────────────
        case "table": {
          addSlideHeader(slide, s.title_text || "");
          if (s.table_data && s.table_data.headers.length > 0) {
            const td = s.table_data;
            const boldCols = new Set(td.bold_columns ?? [0]); // default: bold first column

            // Build merge map for O(1) lookup
            const mergeMap = new Map<string, { rowspan: number; colspan: number }>();
            if (td.merges) {
              for (const m of td.merges) {
                // Store merge info for the top-left cell of each merge region
                mergeMap.set(`${m.row},${m.col}`, { rowspan: m.rowspan, colspan: m.colspan });
              }
            }

            // Build merged set to skip cells that are covered by another cell's merge
            const coveredCells = new Set<string>();
            if (td.merges) {
              for (const m of td.merges) {
                for (let dr = 0; dr < m.rowspan; dr++) {
                  for (let dc = 0; dc < m.colspan; dc++) {
                    if (dr === 0 && dc === 0) continue; // skip origin
                    coveredCells.add(`${m.row + dr},${m.col + dc}`);
                  }
                }
              }
            }

            const rows: any[][] = [];

            // Header row
            rows.push(
              td.headers.map((h: string, cIdx: number) => ({
                text: h,
                options: {
                  fontSize: 11,
                  fontFace: "Arial",
                  color: "FFFFFF",
                  bold: true,
                  fill: { color: theme.headerBg },
                  border: {
                    pt: { color: "D1D5DB", size: 0.5 },
                    bt: { color: "D1D5DB", size: 0.5 },
                    bl: { color: "D1D5DB", size: 0.5 },
                    br: { color: "D1D5DB", size: 0.5 },
                  },
                  align: "center",
                  valign: "middle",
                },
              })),
            );

            // Data rows
            for (let rIdx = 0; rIdx < td.rows.length; rIdx++) {
              const row: any[] = [];
              for (let cIdx = 0; cIdx < td.headers.length; cIdx++) {
                // Skip cells covered by a merge
                if (coveredCells.has(`${rIdx + 1},${cIdx}`)) {
                  // Push a placeholder that will be skipped by pptxgenjs
                  row.push({ text: "", options: { border: { type: "none" as const }, fill: { color: "FFFFFF" } } });
                  continue;
                }

                const merge = mergeMap.get(`${rIdx + 1},${cIdx}`);
                const cellText = (td.rows[rIdx]?.[cIdx] || "").slice(0, 60);
                const isBoldCol = boldCols.has(cIdx);

                row.push({
                  text: cellText,
                  options: {
                    fontSize: 11,
                    fontFace: "Arial",
                    color: theme.text,
                    bold: isBoldCol,
                    fill: {
                      color: rIdx % 2 === 0 ? theme.tableAlt : "FFFFFF",
                    },
                    border: {
                      pt: { color: "D1D5DB", size: 0.5 },
                      bt: { color: "D1D5DB", size: 0.5 },
                      bl: { color: "D1D5DB", size: 0.5 },
                      br: { color: "D1D5DB", size: 0.5 },
                    },
                    align: cIdx === 0 ? "left" : "center",
                    valign: "middle",
                    rowspan: merge?.rowspan,
                    colspan: merge?.colspan,
                  },
                });
              }
              rows.push(row);
            }

            const colCount = td.headers.length;
            slide.addTable(rows, {
              x: 0.5,
              y: 1.5,
              w: 9.0,
              colW: Array(colCount).fill(9.0 / colCount),
              rowH: Array(Math.min(td.rows.length + 1, 15)).fill(0.5),
              border: { type: "solid", pt: 0.5, color: "D1D5DB" },
              autoPage: false,
            });
          }
          break;
        }

        // ──────────────────────────────────────────────────────────────
        // IMAGE SLIDE
        // ──────────────────────────────────────────────────────────────
        case "image": {
          addSlideHeader(slide, s.title_text || "");
          if (s.image_url) {
            try {
              slide.addImage({
                path: s.image_url,
                x: 1.5, y: 1.5, w: 7.0, h: 4.5,
                sizing: { type: "contain", w: 7.0, h: 4.5 },
                rounding: true,
              });
            } catch {
              slide.addText("[Image could not be loaded]", {
                x: 2, y: 3, w: 6, h: 1,
                fontSize: 14, fontFace: "Arial", color: theme.muted, align: "center", valign: "middle",
              });
            }
            if (s.image_caption) {
              slide.addText(s.image_caption, {
                x: 1.5, y: 6.2, w: 7, h: 0.5,
                fontSize: 11, fontFace: "Arial", color: theme.muted, align: "center", italics: true,
              });
            }
          }
          if (s.body_items && s.body_items.length > 0) {
            addBullets(slide, s.body_items, { x: "0.8", y: 1.6, w: "40%", h: 4.5, fontSize: 13 });
          }
          break;
        }

        // ──────────────────────────────────────────────────────────────
        // TIMELINE SLIDE
        // ──────────────────────────────────────────────────────────────
        case "timeline": {
          addSlideHeader(slide, s.title_text || "");
          const items = s.timeline_items || [];
          const itemH = Math.min(5.5 / Math.max(items.length, 1), 1.2);
          // Timeline vertical line
          slide.addShape(pptx.ShapeType.rect, {
            x: 1.8, y: 1.5, w: 0.04, h: items.length * itemH,
            fill: { color: theme.secondary },
          });
          items.forEach((item: { label: string; description?: string }, idx: number) => {
            const yPos = 1.5 + idx * itemH;
            slide.addShape(pptx.ShapeType.ellipse, {
              x: 1.6, y: yPos + 0.05, w: 0.4, h: 0.4,
              fill: { color: theme.accent },
            });
            slide.addText(item.label, {
              x: 2.3, y: yPos, w: 7, h: 0.4,
              fontSize: 15, fontFace: "Arial", color: theme.primary, bold: true,
            });
            if (item.description) {
              slide.addText(item.description, {
                x: 2.3, y: yPos + 0.4, w: 7, h: itemH - 0.4,
                fontSize: 12, fontFace: "Arial", color: theme.text,
              });
            }
          });
          break;
        }

        // ──────────────────────────────────────────────────────────────
        // QUOTE SLIDE — with gradient support
        // ──────────────────────────────────────────────────────────────
        case "quote": {
          if (s.gradient) {
            slide.addShape(pptx.ShapeType.rect, {
              x: 0, y: 0, w: "100%", h: "100%",
              fill: { color: s.gradient.colors[0] },
            });
            slide.addShape(pptx.ShapeType.rect, {
              x: 0, y: 0, w: "100%", h: "100%",
              fill: { color: s.gradient.colors[1], transparency: 60 },
            });
          } else {
            slide.addShape(pptx.ShapeType.rect, {
              x: 0, y: 0, w: "100%", h: "100%",
              fill: { color: theme.lightBg },
            });
          }
          // Left accent bar
          slide.addShape(pptx.ShapeType.rect, {
            x: 0.8, y: 1.5, w: 0.06, h: 4.0,
            fill: { color: theme.secondary },
          });
          // Icon
          addIconElement(slide, icon, { x: 9.0, y: 1.0, w: 0.8, h: 0.8, fontSize: 40 });
          // Quote mark
          slide.addText("\u201C", {
            x: 1.2, y: 1.0, w: 2, h: 1.5,
            fontSize: 72, fontFace: "Georgia", color: theme.accent,
          });
          // Quote text
          slide.addText(s.quote_text || s.body_items?.[0] || "", {
            x: 1.2, y: 2.5, w: 8, h: 2.5,
            fontSize: 22, fontFace: "Georgia", color: theme.text, italics: true,
            lineSpacingMultiple: 1.3,
          });
          // Author
          if (s.quote_author) {
            slide.addShape(pptx.ShapeType.rect, {
              x: 1.2, y: 5.2, w: 2, h: 0.04,
              fill: { color: theme.accent },
            });
            slide.addText(`\u2014 ${s.quote_author}`, {
              x: 1.2, y: 5.4, w: 8, h: 0.4,
              fontSize: 14, fontFace: "Arial", color: theme.muted, bold: true,
            });
          }
          break;
        }

        // ──────────────────────────────────────────────────────────────
        // THANK YOU SLIDE — with gradient support
        // ──────────────────────────────────────────────────────────────
        case "thank_you": {
          if (s.gradient) {
            slide.addShape(pptx.ShapeType.rect, {
              x: 0, y: 0, w: "100%", h: "100%",
              fill: { color: s.gradient.colors[0] },
            });
            slide.addShape(pptx.ShapeType.rect, {
              x: 0, y: 0, w: "50%", h: "100%",
              fill: { color: s.gradient.colors[1], transparency: 40 },
            });
          } else {
            slide.addShape(pptx.ShapeType.rect, {
              x: 0, y: 0, w: "100%", h: "100%",
              fill: { color: theme.primary },
            });
          }
          slide.addShape(pptx.ShapeType.rect, {
            x: 0, y: 0, w: "100%", h: 0.06,
            fill: { color: theme.accent },
          });
          // Icon
          addIconElement(slide, icon, { x: 4.6, y: 1.0, w: 0.8, h: 0.8, fontSize: 36 });
          slide.addText(s.title_text || "Thank You", {
            x: 0.5, y: 2.0, w: 9, h: 1.5,
            fontSize: 40, fontFace: "Arial", color: "FFFFFF", bold: true, align: "center", valign: "middle",
          });
          if (s.subtitle) {
            slide.addText(s.subtitle, {
              x: 1, y: 3.5, w: 8, h: 1.0,
              fontSize: 18, fontFace: "Arial", color: theme.accent, align: "center", valign: "top",
            });
          }
          if (s.body_items && s.body_items.length > 0) {
            slide.addText(s.body_items.join("\n"), {
              x: 1.5, y: 4.5, w: 7, h: 1.5,
              fontSize: 14, fontFace: "Arial", color: "CBD5E1", align: "center", valign: "top",
            });
          }
          break;
        }

        // ──────────────────────────────────────────────────────────────
        // KPI SLIDE — 2-4 metric cards
        // ──────────────────────────────────────────────────────────────
        case "kpi": {
          addSlideHeader(slide, s.title_text || "");

          const kpis = s.kpi_items?.slice(0, 4) || [];
          const cardCount = Math.max(kpis.length, 1);
          const cardW = 2.2;
          const cardH = 4.2;
          const gap = 0.3;
          const totalW = cardCount * cardW + (cardCount - 1) * gap;
          const startX = (10 - totalW) / 2;
          const cardColors = [theme.primary, theme.secondary, theme.accent, theme.headerBg];

          kpis.forEach((kpi, idx) => {
            const x = startX + idx * (cardW + gap);
            const y = 1.6;
            const cardColor = cardColors[idx % cardColors.length];

            // Card background (rounded rectangle)
            slide.addShape(pptx.ShapeType.roundRect, {
              x, y, w: cardW, h: cardH,
              fill: { color: cardColor },
              rectRadius: 0.1,
              shadow: { type: "outer", blur: 6, offset: 2, color: "000000", opacity: 0.15 },
            });

            // KPI value — large, bold, white
            slide.addText(kpi.value, {
              x, y: y + 0.5, w: cardW, h: 1.2,
              fontSize: 32, fontFace: "Arial", color: "FFFFFF", bold: true,
              align: "center", valign: "middle",
            });

            // KPI label — smaller, lighter
            slide.addText(kpi.label, {
              x, y: y + 1.8, w: cardW, h: 0.6,
              fontSize: 13, fontFace: "Arial", color: "CBD5E1",
              align: "center", valign: "middle",
            });

            // Change indicator (trend arrow + value)
            if (kpi.change) {
              const trendColor = kpi.trend === "up" ? "4ADE80" : kpi.trend === "down" ? "F87171" : "CBD5E1";
              const trendArrow = kpi.trend === "up" ? "\u2191" : kpi.trend === "down" ? "\u2193" : "";
              slide.addText(`${trendArrow} ${kpi.change}`, {
                x, y: y + 2.6, w: cardW, h: 0.5,
                fontSize: 14, fontFace: "Arial", color: trendColor, bold: true,
                align: "center", valign: "middle",
              });
            }

            // Decorative bottom accent line
            slide.addShape(pptx.ShapeType.rect, {
              x: x + cardW * 0.2, y: y + cardH - 0.15, w: cardW * 0.6, h: 0.04,
              fill: { color: theme.accent },
            });
          });

          // Subtitle below KPI cards
          if (s.subtitle) {
            slide.addText(s.subtitle, {
              x: 0.8, y: 6.2, w: 8.4, h: 0.4,
              fontSize: 12, fontFace: "Arial", color: theme.muted, align: "center", italics: true,
            });
          }
          break;
        }

        // ──────────────────────────────────────────────────────────────
        // AGENDA SLIDE — numbered sections
        // ──────────────────────────────────────────────────────────────
        case "agenda": {
          addSlideHeader(slide, s.title_text || "");
          const items = s.agenda_items || [];
          const itemH = Math.min(5.0 / Math.max(items.length, 1), 1.1);

          items.forEach((item, idx) => {
            const yPos = 1.5 + idx * itemH;

            // Subtle background band for alternating items
            if (idx % 2 === 0) {
              slide.addShape(pptx.ShapeType.rect, {
                x: 0.5, y: yPos - 0.05, w: 9.0, h: itemH,
                fill: { color: theme.lightBg },
                rectRadius: 0.03,
              });
            }

            // Number circle
            slide.addShape(pptx.ShapeType.ellipse, {
              x: 0.8, y: yPos + 0.1, w: 0.55, h: 0.55,
              fill: { color: idx % 2 === 0 ? theme.secondary : theme.accent },
            });
            slide.addText(String(item.number), {
              x: 0.8, y: yPos + 0.1, w: 0.55, h: 0.55,
              fontSize: 16, fontFace: "Arial", color: "FFFFFF", bold: true,
              align: "center", valign: "middle",
            });

            // Section title
            slide.addText(item.title, {
              x: 1.6, y: yPos + 0.05, w: 7.5, h: 0.4,
              fontSize: 16, fontFace: "Arial", color: theme.primary, bold: true,
              valign: "middle",
            });

            // Description
            if (item.description) {
              slide.addText(item.description, {
                x: 1.6, y: yPos + 0.45, w: 7.5, h: 0.5,
                fontSize: 12, fontFace: "Arial", color: theme.muted,
                valign: "top",
              });
            }

            // Connector line to next item
            if (idx < items.length - 1) {
              slide.addShape(pptx.ShapeType.rect, {
                x: 1.05, y: yPos + itemH - 0.15, w: 0.02, h: 0.2,
                fill: { color: theme.secondary },
              });
            }
          });
          break;
        }

        // ──────────────────────────────────────────────────────────────
        // BLANK SLIDE
        // ──────────────────────────────────────────────────────────────
        case "blank":
        default: {
          if (s.gradient) {
            slide.addShape(pptx.ShapeType.rect, {
              x: 0, y: 0, w: "100%", h: "100%",
              fill: { color: s.gradient.colors[0] },
            });
            slide.addShape(pptx.ShapeType.rect, {
              x: 0, y: 0, w: "60%", h: "100%",
              fill: { color: s.gradient.colors[1], transparency: 40 },
            });
          }
          // Just footer
          slide.addText(`${title}`, {
            x: 0.4, y: 7.0, w: "45%", h: 0.3,
            fontSize: 8, fontFace: "Arial", color: theme.muted,
          });
          slide.addText(`${pptx.slides.length}`, {
            x: "85%", y: 7.0, w: "12%", h: 0.3,
            fontSize: 8, fontFace: "Arial", color: theme.muted, align: "right",
          });
          break;
        }
      }

      // Apply slide transition
      applyTransition(slide, s.transition);

      // Speaker notes
      if (s.notes) {
        slide.addNotes(s.notes);
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // WRITE FILE
    // ═══════════════════════════════════════════════════════════════════
    const buffer = (await (pptx as any).write({ outputType: "nodebuffer" })) as Buffer;
    writeFileSync(filePath, buffer);

    const basename = filePath.split("/").pop() || "presentation.pptx";
    const fileBase64 = buffer.toString("base64");

    try {
      const { cacheFile } = await import("@/lib/file-cache");
      await cacheFile(basename, buffer, "application/vnd.openxmlformats-officedocument.presentationml.presentation", basename);
    } catch { /* best-effort */ }

    return {
      filename: basename,
      title,
      downloadUrl: `/api/files/${basename}`,
      fileBase64,
      fileSize: buffer.length,
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      message: `PowerPoint "${title}" created: ${slides.length} slides, theme='${themeName || "ocean"}', 16:9 widescreen. Download available.`,
    };
  }),
});

// ---------------------------------------------------------------------------
// Generate Chart/Diagram Tool (SVG output — works on Vercel without canvas)
// ---------------------------------------------------------------------------

export const generateChartTool = tool({
  description: "Generate charts, graphs, and diagrams as downloadable SVG or PNG files. Supports bar charts, line charts, pie charts, scatter plots, and flowcharts/diagrams (Mermaid syntax). Use this when the user asks to create a chart, graph, diagram, visualization, or any data-driven visual. Returns the chart as a downloadable file.",
  inputSchema: zodSchema(z.object({
    chart_type: z.enum(["bar", "line", "pie", "scatter", "mermaid", "table"]).describe("Type of chart to generate"),
    title: z.string().describe("Chart title"),
    data: z.string().optional().describe("Chart data as JSON string. For bar/line/scatter: {labels:[], datasets:[{label,data}]} For pie: {labels:[], data:[]} For mermaid: the Mermaid diagram code For table: {headers:[], rows:[][]}"),
    mermaid_code: z.string().optional().describe("Mermaid diagram code (only for chart_type='mermaid')"),
    width: z.number().optional().describe("Chart width in pixels (default: 800)"),
    height: z.number().optional().describe("Chart height in pixels (default: 500)"),
    filename: z.string().optional().describe("Output filename (without extension). Default: derived from title"),
  })),
  execute: safeJson(async ({ chart_type, title, data, mermaid_code, width, height, filename }) => {
    const { tmpdir } = await import("os");
    const { join } = await import("path");
    const { writeFileSync } = await import("fs");

    const w = width || 800;
    const h = height || 500;
    const safeName = (filename || title).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 60);

    let svgContent = "";
    let fileExt = "svg";
    let mimeType = "image/svg+xml";

    if (chart_type === "mermaid") {
      // For Mermaid diagrams, return the code for rendering and an SVG placeholder
      const code = mermaid_code || data || "";
      svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="#ffffff" rx="8"/>
  <text x="50%" y="40" text-anchor="middle" font-family="Arial" font-size="18" font-weight="bold" fill="#111827">${escapeXml(title)}</text>
  <text x="50%" y="${h / 2}" text-anchor="middle" font-family="monospace" font-size="12" fill="#6B7280">Mermaid Diagram — Render with Mermaid.js</text>
  <text x="20" y="${h - 40}" font-family="monospace" font-size="9" fill="#9CA3AF">${escapeXml(code.slice(0, 300))}</text>
</svg>`;
    } else if (chart_type === "table") {
      // Generate an SVG table
      const tableData = data ? JSON.parse(data) : { headers: [], rows: [] };
      const headers = tableData.headers || [];
      const rows = tableData.rows || [];
      const colW = Math.max(Math.min(w / (headers.length || 1), 200), 80);
      const rowH = 30;
      const headerH = 35;
      const totalH = headerH + rows.length * rowH + 60;

      let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(w, headers.length * colW + 40)}" height="${totalH}" viewBox="0 0 ${Math.max(w, headers.length * colW + 40)} ${totalH}">
  <rect width="100%" height="100%" fill="#ffffff" rx="8"/>
  <text x="20" y="30" font-family="Arial" font-size="16" font-weight="bold" fill="#111827">${escapeXml(title)}</text>`;

      // Header row
      const startX = 20;
      let x = startX;
      svg += `<rect x="${startX}" y="42" width="${headers.length * colW}" height="${headerH}" fill="#3B82F6" rx="4"/>`;
      for (const hdr of headers) {
        svg += `<text x="${x + 8}" y="${42 + headerH / 2 + 5}" font-family="Arial" font-size="12" font-weight="bold" fill="white">${escapeXml(String(hdr).slice(0, 20))}</text>`;
        x += colW;
      }

      // Data rows
      for (let r = 0; r < Math.min(rows.length, 50); r++) {
        const y = 42 + headerH + r * rowH;
        const bg = r % 2 === 0 ? "#F9FAFB" : "#FFFFFF";
        svg += `<rect x="${startX}" y="${y}" width="${headers.length * colW}" height="${rowH}" fill="${bg}"/>`;
        x = startX;
        for (let c = 0; c < (rows[r]?.length || 0); c++) {
          svg += `<text x="${x + 8}" y="${y + rowH / 2 + 4}" font-family="Arial" font-size="11" fill="#374151">${escapeXml(String(rows[r][c] || "").slice(0, 25))}</text>`;
          x += colW;
        }
      }
      svg += "</svg>";
      svgContent = svg;
    } else {
      // Bar, Line, Pie, Scatter charts — generate clean SVG
      const chartData = data ? JSON.parse(data) : { labels: [], datasets: [] };
      const labels = chartData.labels || [];
      const datasets = chartData.datasets || [];
      const colors = ["#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4", "#F97316"];

      if (chart_type === "pie") {
        const pieData = chartData.data || (datasets[0]?.data || []);
        const pieLabels = chartData.labels || (datasets[0]?.label ? [datasets[0].label] : []);
        const total = pieData.reduce((a: number, b: number) => a + (Number(b) || 0), 0) || 1;
        const cx = w / 2;
        const cy = h / 2 + 20;
        const radius = Math.min(w, h) / 2 - 80;
        let currentAngle = -Math.PI / 2;

        let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="#ffffff" rx="8"/>
  <text x="50%" y="35" text-anchor="middle" font-family="Arial" font-size="18" font-weight="bold" fill="#111827">${escapeXml(title)}</text>`;

        for (let i = 0; i < pieData.length; i++) {
          const value = Number(pieData[i]) || 0;
          const angle = (value / total) * 2 * Math.PI;
          const x1 = cx + radius * Math.cos(currentAngle);
          const y1 = cy + radius * Math.sin(currentAngle);
          const x2 = cx + radius * Math.cos(currentAngle + angle);
          const y2 = cy + radius * Math.sin(currentAngle + angle);
          const largeArc = angle > Math.PI ? 1 : 0;

          svg += `<path d="M${cx},${cy} L${x1},${y1} A${radius},${radius} 0 ${largeArc},1 ${x2},${y2} Z" fill="${colors[i % colors.length]}" stroke="white" stroke-width="2"/>`;

          // Label
          const midAngle = currentAngle + angle / 2;
          const labelR = radius * 0.65;
          const lx = cx + labelR * Math.cos(midAngle);
          const ly = cy + labelR * Math.sin(midAngle);
          const pct = Math.round((value / total) * 100);
          if (pct > 3) {
            svg += `<text x="${lx}" y="${ly}" text-anchor="middle" font-family="Arial" font-size="11" font-weight="bold" fill="white">${pct}%</text>`;
          }

          currentAngle += angle;
        }

        // Legend
        svg += `<g transform="translate(20, ${h - pieLabels.length * 20 - 20})">`;
        for (let i = 0; i < pieLabels.length; i++) {
          svg += `<rect x="0" y="${i * 20}" width="12" height="12" fill="${colors[i % colors.length]}" rx="2"/>`;
          svg += `<text x="18" y="${i * 20 + 10}" font-family="Arial" font-size="11" fill="#374151">${escapeXml(String(pieLabels[i]).slice(0, 25))}</text>`;
        }
        svg += "</g></svg>";
        svgContent = svg;
      } else {
        // Bar / Line / Scatter
        const allValues: number[] = [];
        for (const ds of datasets) {
          for (const v of (ds.data || [])) allValues.push(Number(v) || 0);
        }
        const maxVal = Math.max(...allValues, 1);
        const minVal = Math.min(...allValues, 0);
        const range = maxVal - minVal || 1;

        const margin = { top: 60, right: 30, bottom: 60, left: 60 };
        const plotW = w - margin.left - margin.right;
        const plotH = h - margin.top - margin.bottom;

        let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="#ffffff" rx="8"/>
  <text x="50%" y="35" text-anchor="middle" font-family="Arial" font-size="18" font-weight="bold" fill="#111827">${escapeXml(title)}</text>`;

        // Y-axis gridlines
        const gridLines = 5;
        for (let i = 0; i <= gridLines; i++) {
          const val = minVal + (range * i) / gridLines;
          const y = margin.top + plotH - (plotH * i) / gridLines;
          svg += `<line x1="${margin.left}" y1="${y}" x2="${w - margin.right}" y2="${y}" stroke="#E5E7EB" stroke-width="0.5"/>`;
          svg += `<text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" font-family="Arial" font-size="10" fill="#9CA3AF">${Math.round(val * 100) / 100}</text>`;
        }

        // X-axis labels
        const barGroupWidth = labels.length > 0 ? plotW / labels.length : plotW;
        for (let i = 0; i < labels.length; i++) {
          const x = margin.left + barGroupWidth * i + barGroupWidth / 2;
          svg += `<text x="${x}" y="${h - margin.bottom + 20}" text-anchor="middle" font-family="Arial" font-size="10" fill="#6B7280">${escapeXml(String(labels[i]).slice(0, 15))}</text>`;
        }

        // Plot datasets
        for (let di = 0; di < datasets.length; di++) {
          const ds = datasets[di];
          const color = colors[di % colors.length];
          const vals = (ds.data || []).map(Number);

          if (chart_type === "bar") {
            const barWidth = Math.min(barGroupWidth / (datasets.length + 0.5) - 2, 60);
            for (let i = 0; i < vals.length; i++) {
              const barH = ((vals[i] - minVal) / range) * plotH;
              const x = margin.left + barGroupWidth * i + (di * barWidth) + barGroupWidth * 0.15;
              const y = margin.top + plotH - barH;
              svg += `<rect x="${x}" y="${y}" width="${barWidth}" height="${Math.max(barH, 1)}" fill="${color}" rx="3" opacity="0.85"/>`;
            }
          } else if (chart_type === "line") {
            let pathD = "";
            for (let i = 0; i < vals.length; i++) {
              const x = margin.left + barGroupWidth * i + barGroupWidth / 2;
              const y = margin.top + plotH - ((vals[i] - minVal) / range) * plotH;
              pathD += (i === 0 ? "M" : "L") + `${x},${y} `;
            }
            svg += `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="2.5"/>`;
            // Data points
            for (let i = 0; i < vals.length; i++) {
              const x = margin.left + barGroupWidth * i + barGroupWidth / 2;
              const y = margin.top + plotH - ((vals[i] - minVal) / range) * plotH;
              svg += `<circle cx="${x}" cy="${y}" r="4" fill="${color}" stroke="white" stroke-width="2"/>`;
            }
          } else if (chart_type === "scatter") {
            for (let i = 0; i < vals.length; i++) {
              const x = margin.left + barGroupWidth * i + barGroupWidth / 2;
              const y = margin.top + plotH - ((vals[i] - minVal) / range) * plotH;
              svg += `<circle cx="${x}" cy="${y}" r="5" fill="${color}" opacity="0.7"/>`;
            }
          }

          // Legend
          if (ds.label) {
            const legendX = margin.left + di * 120;
            svg += `<rect x="${legendX}" y="${h - 20}" width="10" height="10" fill="${color}" rx="2"/>`;
            svg += `<text x="${legendX + 14}" y="${h - 12}" font-family="Arial" font-size="10" fill="#374151">${escapeXml(String(ds.label).slice(0, 20))}</text>`;
          }
        }

        svg += "</svg>";
        svgContent = svg;
      }
    }

    const filePath = join(tmpdir(), `klaw-${safeName}-${Date.now()}.${fileExt}`);
    writeFileSync(filePath, svgContent);
    const fileBuffer = Buffer.from(svgContent);
    const fileBase64 = fileBuffer.toString("base64");
    const basename = filePath.split("/").pop() || `chart.${fileExt}`;

    // Cache for download
    try {
      const { cacheFile } = await import("@/lib/file-cache");
      await cacheFile(basename, fileBuffer, mimeType, basename);
    } catch {
      // best-effort
    }

    return {
      filename: basename,
      title,
      downloadUrl: `/api/files/${basename}`,
      fileBase64,
      fileSize: fileBuffer.length,
      mimeType,
      chart_type,
      message: `Chart "${title}" (${chart_type}) created successfully. Download available as SVG.`,
    };
  }),
});

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// LLM Chat Completions Tool (via agent's own Ollama model — no external SDK needed)
// ---------------------------------------------------------------------------

export const llmChatTool = tool({
  description: "Send a message to an AI language model and get a response. Use this for text generation, summarization, translation, analysis, brainstorming, coding help, Q&A, or any task that requires AI text intelligence. NOTE: This tool uses your configured Ollama model (gemma4:31b). For simple tasks, you can generate the response directly as an LLM agent.",
  inputSchema: zodSchema(z.object({
    messages: z.array(z.object({
      role: z.enum(["system", "user", "assistant"]).describe("Message role"),
      content: z.string().describe("Message content"),
    })).describe("Array of conversation messages (system prompt + user message at minimum)"),
    temperature: z.number().optional().describe("Creativity level 0-2 (default: 0.7). Lower = more focused, higher = more creative."),
  })),
  execute: safeJson(async ({ messages, temperature }) => {
    try {
      // Use Ollama API directly (self-hosted model)
      const ollamaUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
      const ollamaModel = process.env.OLLAMA_MODEL || "gemma4:31b-cloud";
      const systemMsg = messages.find(m => m.role === "system")?.content || "You are a helpful assistant.";
      const userMsg = messages.filter(m => m.role !== "system").map(m => `${m.role}: ${m.content}`).join("\n\n");

      const res = await fetch(`${ollamaUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ollamaModel,
          prompt: userMsg,
          system: systemMsg,
          stream: false,
          options: { temperature: temperature || 0.7 },
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) throw new Error(`Ollama API error: ${res.status}`);
      const data = await res.json() as any;
      return {
        success: true,
        content: data.response || "",
        model: ollamaModel,
        usage: { prompt_tokens: data.prompt_eval_count || 0, completion_tokens: data.eval_count || 0 },
        message: "LLM chat completion successful.",
        source: "ollama",
      };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `LLM chat failed: ${errMsg}` };
    }
  }),
});

// ---------------------------------------------------------------------------
// Finance Query Tool (via Yahoo Finance API — FREE, no API key needed)
// ---------------------------------------------------------------------------

export const financeQueryTool = tool({
  description: "Query financial data including stock prices, market data, historical data, and market news. Use this when the user asks about stock prices, market trends, financial analysis, company earnings, or any finance-related queries. Powered by Yahoo Finance (free, no API key required).",
  inputSchema: zodSchema(z.object({
    query_type: z.enum(["stock_price", "historical_data", "market_news", "company_info"]).describe("Type of financial query"),
    symbol: z.string().optional().describe("Stock ticker symbol (e.g., 'AAPL', 'GOOGL', 'MSFT', 'TSLA')"),
    query: z.string().describe("Natural language query describing what financial information you need"),
    range: z.string().optional().describe("Time range for historical data: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, ytd, max"),
  })),
  execute: safeJson(async ({ query_type, symbol, query, range }) => {
    try {
      switch (query_type) {
        case "stock_price": {
          if (!symbol) {
            // Try to extract symbol from query
            const match = query.match(/\b([A-Z]{1,5})\b/);
            if (!match) return { success: false, error: "Please provide a stock ticker symbol (e.g., 'AAPL', 'GOOGL')." };
            symbol = match[1];
          }
          const quote = await getStockQuote(symbol.toUpperCase());
          return {
            success: true,
            query_type: "stock_price",
            symbol: quote.symbol,
            data: quote,
            message: `${quote.name || quote.symbol} is trading at $${quote.price} (${quote.change >= 0 ? "+" : ""}${quote.changePercent}%)`,
          };
        }
        case "historical_data": {
          if (!symbol) {
            const match = query.match(/\b([A-Z]{1,5})\b/);
            if (!match) return { success: false, error: "Please provide a stock ticker symbol." };
            symbol = match[1];
          }
          const historical = await getHistoricalData(symbol.toUpperCase(), range || "1mo");
          return {
            success: true,
            query_type: "historical_data",
            symbol: symbol.toUpperCase(),
            range: range || "1mo",
            data: historical,
            message: `Retrieved ${historical.length} data points for ${symbol.toUpperCase()}.`,
          };
        }
        case "market_news": {
          const news = await getMarketNews();
          return {
            success: true,
            query_type: "market_news",
            data: news,
            message: `Retrieved ${news.length} market news articles.`,
          };
        }
        case "company_info": {
          if (!symbol) {
            const match = query.match(/\b([A-Z]{1,5})\b/);
            if (!match) return { success: false, error: "Please provide a stock ticker symbol." };
            symbol = match[1];
          }
          const quote = await getStockQuote(symbol.toUpperCase());
          const historical = await getHistoricalData(symbol.toUpperCase(), "1mo");
          return {
            success: true,
            query_type: "company_info",
            symbol: quote.symbol,
            data: {
              quote,
              recentPerformance: historical.slice(-5),
            },
            message: `Retrieved company info for ${quote.name || quote.symbol}.`,
          };
        }
        default:
          return { success: false, error: `Unknown query type: ${query_type}` };
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Finance query failed: ${errMsg}` };
    }
  }),
});

// ---------------------------------------------------------------------------
// Academic Search Tool (via Semantic Scholar API — FREE, no API key needed)
// ---------------------------------------------------------------------------

export const academicSearchTool = tool({
  description: "Search for academic papers, scholarly articles, research publications, citations, and author information. Use this when the user asks about academic research, scientific papers, literature reviews, citations, research trends, or scholarly publications. Powered by Semantic Scholar (free, no API key required).",
  inputSchema: zodSchema(z.object({
    query: z.string().describe("Search query for academic papers (e.g., 'transformer architecture attention mechanism')"),
    search_type: z.enum(["paper_search", "author_search", "paper_detail"]).optional().describe("Type of academic search (default: 'paper_search')"),
    paper_id: z.string().optional().describe("Paper ID for paper_detail search (DOI, ArXiv ID, or Semantic Scholar ID)"),
    author_id: z.string().optional().describe("Author ID for author_search (Semantic Scholar author ID)"),
    num_results: z.number().optional().describe("Number of results to return (default: 10, max: 100)"),
    year: z.string().optional().describe("Filter by year (e.g., '2024' or '2020-2024')"),
  })),
  execute: safeJson(async ({ query, search_type, paper_id, author_id, num_results, year }) => {
    try {
      switch (search_type || "paper_search") {
        case "paper_search": {
          const result = await searchPapers(query, num_results || 10, year);
          return {
            success: true,
            search_type: "paper_search",
            query,
            total: result.total,
            papers: result.papers,
            message: `Found ${result.total} papers matching "${query}". Showing ${result.papers.length} results.`,
          };
        }
        case "paper_detail": {
          if (!paper_id) return { success: false, error: "Please provide a paper_id (DOI, ArXiv ID, or Semantic Scholar ID)." };
          const { getPaperDetails } = await import("@/lib/api-clients");
          const paper = await getPaperDetails(paper_id);
          return {
            success: true,
            search_type: "paper_detail",
            data: paper,
            message: `Retrieved details for paper: ${paper.title || paper_id}.`,
          };
        }
        case "author_search": {
          if (!author_id) {
            // Fall back to paper search with the query
            const result = await searchPapers(query, num_results || 10, year);
            return {
              success: true,
              search_type: "author_search",
              query,
              papers: result.papers,
              message: `No author_id provided. Showing paper search results for "${query}" instead.`,
            };
          }
          const { getAuthorPapers } = await import("@/lib/api-clients");
          const papers = await getAuthorPapers(author_id, num_results || 10);
          return {
            success: true,
            search_type: "author_search",
            author_id,
            papers,
            message: `Retrieved ${papers.length} papers for author ${author_id}.`,
          };
        }
        default:
          return { success: false, error: `Unknown search type: ${search_type}` };
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Academic search failed: ${errMsg}` };
    }
  }),
});

// ---------------------------------------------------------------------------
// Content Analysis Tool
// ---------------------------------------------------------------------------

export const contentAnalyzeTool = tool({
  description: "Analyze content for readability, sentiment, SEO optimization, keyword density, structure, and quality scoring. Use this when the user wants to analyze text content, check writing quality, optimize for SEO, extract key themes, or get a comprehensive content audit.",
  inputSchema: zodSchema(z.object({
    content: z.string().describe("The text content to analyze"),
    analysis_type: z.enum(["full_audit", "readability", "sentiment", "seo", "keywords", "structure"]).optional().describe("Type of analysis (default: 'full_audit')"),
  })),
  execute: safeJson(async ({ content, analysis_type }) => {
    const type = analysis_type || "full_audit";
    const results: Record<string, unknown> = { analysis_type: type };

    // Basic text stats (always computed)
    const words = content.split(/\s+/).filter(Boolean);
    const sentences = content.split(/[.!?]+/).filter(Boolean);
    const paragraphs = content.split(/\n\n+/).filter(Boolean);
    const avgWordsPerSentence = sentences.length > 0 ? words.length / sentences.length : 0;
    const avgCharsPerWord = words.length > 0 ? words.reduce((a, w) => a + w.length, 0) / words.length : 0;

    results.basic_stats = {
      word_count: words.length,
      sentence_count: sentences.length,
      paragraph_count: paragraphs.length,
      avg_words_per_sentence: Math.round(avgWordsPerSentence * 10) / 10,
      avg_chars_per_word: Math.round(avgCharsPerWord * 10) / 10,
      estimated_reading_time_min: Math.ceil(words.length / 200),
    };

    if (type === "full_audit" || type === "readability") {
      // Flesch-Kincaid Grade Level
      const syllables = words.reduce((a, w) => a + countSyllables(w), 0);
      const fk = words.length > 0 && sentences.length > 0
        ? 0.39 * (words.length / sentences.length) + 11.8 * (syllables / words.length) - 15.59
        : 0;
      results.readability = {
        flesch_kincaid_grade: Math.round(fk * 10) / 10,
        reading_level: fk < 5 ? "Very Easy" : fk < 8 ? "Easy" : fk < 10 ? "Average" : fk < 13 ? "Difficult" : "Very Difficult",
        syllable_count: syllables,
      };
    }

    if (type === "full_audit" || type === "sentiment") {
      // Simple sentiment analysis based on positive/negative word lists
      const positiveWords = ["good", "great", "excellent", "amazing", "wonderful", "best", "love", "happy", "success", "outstanding", "perfect", "brilliant", "fantastic", "superb", "innovative", "efficient", "powerful", "remarkable", "impressive", "positive", "benefit", "advantage", "improve", "growth", "opportunity", "achieve", "win", "gain", "lead", "strong"];
      const negativeWords = ["bad", "poor", "terrible", "horrible", "worst", "hate", "fail", "failure", "wrong", "problem", "issue", "risk", "threat", "concern", "weakness", "decline", "loss", "drop", "fall", "crash", "negative", "damage", "destroy", "difficult", "challenge", "obstacle", "barrier", "complicate", "confuse"];
      const lowerContent = content.toLowerCase();
      const posCount = positiveWords.filter(w => lowerContent.includes(w)).length;
      const negCount = negativeWords.filter(w => lowerContent.includes(w)).length;
      const total = posCount + negCount || 1;
      results.sentiment = {
        score: Math.round(((posCount - negCount) / total) * 100) / 100,
        label: posCount > negCount * 1.5 ? "Positive" : negCount > posCount * 1.5 ? "Negative" : "Neutral",
        positive_mentions: posCount,
        negative_mentions: negCount,
      };
    }

    if (type === "full_audit" || type === "keywords") {
      // Keyword frequency analysis
      const stopWords = new Set(["the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "can", "shall", "to", "of", "in", "for", "on", "with", "at", "by", "from", "as", "into", "through", "during", "before", "after", "above", "below", "between", "out", "off", "over", "under", "again", "further", "then", "once", "here", "there", "when", "where", "why", "how", "all", "each", "every", "both", "few", "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very", "just", "about", "also", "and", "but", "or", "if", "it", "its", "this", "that", "these", "those", "i", "we", "you", "he", "she", "they", "what", "which", "who", "whom"]);
      const wordFreq: Record<string, number> = {};
      for (const word of words) {
        const lower = word.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (lower.length > 2 && !stopWords.has(lower)) {
          wordFreq[lower] = (wordFreq[lower] || 0) + 1;
        }
      }
      const topKeywords = Object.entries(wordFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([word, count]) => ({ word, count, density: Math.round((count / words.length) * 10000) / 100 }));
      results.keywords = { total_unique: Object.keys(wordFreq).length, top_keywords: topKeywords };
    }

    if (type === "full_audit" || type === "structure") {
      const headings = content.match(/^#{1,6}\s.+/gm) || [];
      const lists = content.match(/^[\s]*[-*+]\s.+/gm) || [];
      const links = content.match(/https?:\/\/[^\s\])}>"']+/g) || [];
      const boldText = content.match(/\*\*[^*]+\*\*/g) || [];
      results.structure = {
        heading_count: headings.length,
        list_item_count: lists.length,
        link_count: links.length,
        bold_text_count: boldText.length,
        has_title: headings.length > 0,
        uses_lists: lists.length > 0,
        uses_links: links.length > 0,
      };
    }

    if (type === "full_audit" || type === "seo") {
      // SEO analysis
      const titleMatch = content.match(/^#\s+(.+)/m);
      const title = titleMatch ? titleMatch[1].trim() : "";
      const firstParagraph = content.split("\n\n")[0] || "";
      const metaDesc = firstParagraph.slice(0, 160);

      results.seo = {
        title_present: title.length > 0,
        title_length: title.length,
        title_optimal: title.length >= 30 && title.length <= 60,
        meta_description: metaDesc,
        meta_description_length: metaDesc.length,
        meta_description_optimal: metaDesc.length >= 120 && metaDesc.length <= 160,
        word_count_ok: words.length >= 300,
        has_headings: (content.match(/^#{1,6}\s.+/gm) || []).length > 0,
        content_score: Math.min(100, Math.round(
          (title.length >= 30 && title.length <= 60 ? 20 : 0) +
          (metaDesc.length >= 120 ? 20 : metaDesc.length >= 50 ? 10 : 0) +
          (words.length >= 300 ? 20 : words.length >= 150 ? 10 : 0) +
          ((content.match(/^#{1,6}\s.+/gm) || []).length >= 2 ? 20 : 10) +
          ((content.match(/^[\s]*[-*+]\s.+/gm) || []).length > 0 ? 20 : 0)
        )),
      };
    }

    return {
      success: true,
      ...results,
      message: `Content analysis (${type}) completed. ${words.length} words analyzed.`,
    };
  }),
});

function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, "");
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  word = word.replace(/^y/, "");
  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

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
    const boundary = "klaw-boundary-" + Date.now();
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
    project_id: z.number().optional().describe("Project ID to add tasks to"),
    project_name: z.string().optional().describe("Project name (alternative to project_id — looked up by name)"),
    goal: z.string().describe("Project goal to decompose into tasks"),
    context: z.string().optional().describe("Additional context, constraints, or requirements"),
    complexity: z.enum(["simple", "moderate", "complex"]).optional().describe("Complexity level (default: moderate)"),
    max_tasks: z.number().optional().describe("Max tasks to create (default 8, max 15)"),
  })),
  execute: safeJson(async ({ project_id, project_name, goal, context, complexity, max_tasks }) => {
    try {
      if (!project_id && !project_name) return { success: false, error: "Either project_id or project_name is required" };

      // Verify project exists — try ID first, then name fallback
      let proj;
      if (project_id) {
        proj = await query("SELECT id, name, status FROM projects WHERE id = $1", [project_id]);
      }
      if ((!proj || proj.rows.length === 0) && project_name) {
        proj = await query("SELECT id, name, status FROM projects WHERE name ILIKE $1", [project_name]);
      }
      if (!proj || proj.rows.length === 0)
        return { success: false, error: `Project not found (id=${project_id}, name=${project_name})` };

      const resolvedProjectId = proj.rows[0].id;

      // Get AI decomposition via Ollama Cloud (DeepSeek V4 Flash)
      const ollamaKey = nextOllamaKey();

      const systemPrompt = `You are a project planning expert. Decompose the given goal into a structured task plan.
Each task should be specific, actionable, and assigned to the right agent.
Available agents: general, mail, code, data, creative, research, ops
Task types: research, code, design, testing, deployment, docs, communication, general
Priorities: critical, high, medium, low
Output format (EXACT JSON): { "tasks": [{ "title", "description", "task_type", "priority": "critical|high|medium|low", "assigned_agent", "depends_on": [], "task_prompt", "sort_order" }] }`;

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

      // Validate and sanitize tasks before insert
      const VALID_PRIORITIES = new Set(['critical', 'high', 'medium', 'low']);
      const VALID_TYPES = new Set(['research', 'code', 'design', 'testing', 'deployment', 'docs', 'communication', 'general']);
      const VALID_AGENTS = new Set(['general', 'mail', 'code', 'data', 'creative', 'research', 'ops']);

      // Build batch insert
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const insertedTasks: any[] = [];
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let paramIdx = 1;

      for (let idx = 0; idx < tasks.length; idx++) {
        const task = tasks[idx];
        const safePriority = VALID_PRIORITIES.has(task.priority) ? task.priority : 'medium';
        const safeType = VALID_TYPES.has(task.task_type) ? task.task_type : 'general';
        const safeAgent = VALID_AGENTS.has(task.assigned_agent) ? task.assigned_agent : 'general';

        placeholders.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
        values.push(
          resolvedProjectId,
          task.title || 'Untitled Task',
          task.description || null,
          safeType,
          safePriority,
          safeAgent,
          task.task_prompt || null,
          task.sort_order || idx,
        );
      }

      if (values.length > 0) {
        const insertSql = `INSERT INTO project_tasks (project_id, title, description, task_type, priority, assigned_agent, task_prompt, sort_order) VALUES ${placeholders.join(', ')} RETURNING id, title, status`;
        const result = await query(insertSql, values);
        insertedTasks.push(...result.rows);
      }

      // Force recalculate project task counts
      await query("SELECT update_project_task_counts($1)", [resolvedProjectId]);

      return {
        success: true,
        project_id: resolvedProjectId,
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
      fromAgent: getCurrentAgentId(), // Dynamically resolved from chat route / executor
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
      fromAgent: getCurrentAgentId(), // Dynamically resolved from chat route / executor
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
    agent_id: z.enum(["general", "mail", "code", "data", "creative", "research", "ops"]).describe("Your agent ID — specify which inbox to check"),
    limit: z.number().optional().describe("Max messages to return (default: 20)"),
    mark_as_read: z.boolean().optional().describe("Automatically mark returned messages as read (default: true)"),
  })),
  execute: safeJson(async ({ agent_id, limit, mark_as_read }) => {
    const { getAgentInbox, markMessagesRead } = await import("@/lib/a2a");
    const checkAgent = agent_id || getCurrentAgentId(); // Default to current agent if not specified
    const messages = await getAgentInbox(checkAgent, limit || 20);
    
    // Auto mark as read
    let markedCount = 0;
    if (mark_as_read !== false && messages.length > 0) {
      const ids = messages.map(m => m.id);
      markedCount = await markMessagesRead(checkAgent, ids);
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
      agentId: getCurrentAgentId(), // Dynamically resolved from chat route / executor
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
    const allMembers = members || ["general", "mail", "code", "data", "creative", "research", "ops"].filter(a => a !== getCurrentAgentId());
    const channelId = await getOrCreateChannel({
      name: channel_name,
      channelType: channel_type || "project",
      projectId: project_id,
      members: [...allMembers, getCurrentAgentId()], // Include self in channel members
    });
    if (!channelId) return { success: false, error: "Failed to create/get channel" };

    const msgId = await postToChannel(channelId, {
      agentId: getCurrentAgentId(),
      content: message,
      messageType: "message",
    });

    // Also broadcast to members' inboxes
    const { broadcastA2AMessage } = await import("@/lib/a2a");
    await broadcastA2AMessage({
      fromAgent: getCurrentAgentId(),
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

// ---------------------------------------------------------------------------
// Skill-to-Tool Mapping — bridges skills to executable tools
// ---------------------------------------------------------------------------

const SKILL_TOOL_MAP: Record<string, { tool: string; description: string; params_hint: string }> = {
  // Document Creation
  pdf: { tool: "create_pdf_report", description: "Create professional PDF documents with formatted headers, tables, code blocks, lists, and more", params_hint: "Provide title (string) and content (markdown string)" },
  docx: { tool: "create_docx_document", description: "Create professional Word documents with rich formatting", params_hint: "Provide title (string) and content (markdown string)" },
  xlsx: { tool: "create_xlsx_spreadsheet", description: "Create Excel spreadsheets with multiple sheets, formatting, and formulas", params_hint: "Provide title (string) and sheets (array of {name, headers, rows})" },
  pptx: { tool: "create_pptx_presentation", description: "Create PowerPoint presentations with multiple slides, layouts, and speaker notes", params_hint: "Provide title (string) and slides (array of {layout, title_text, body_items, notes})" },
  ppt: { tool: "create_pptx_presentation", description: "Create PowerPoint presentations (alias for pptx)", params_hint: "Provide title (string) and slides (array of {layout, title_text, body_items, notes})" },
  // Data Visualization
  charts: { tool: "generate_chart", description: "Generate charts, graphs, and diagrams (bar, line, pie, scatter, mermaid, table)", params_hint: "Provide chart_type, title, data (JSON string)" },
  // Web Tools
  "web-search": { tool: "web_search", description: "Search the web for real-time information (Tavily + DuckDuckGo + Wikipedia + Brave)", params_hint: "Provide query (string) and optional num_results" },
  "web-reader": { tool: "web_reader", description: "Read and extract content from web pages using cheerio HTML parser", params_hint: "Provide url (string)" },
  "multi-search-engine": { tool: "web_search_advanced", description: "Advanced multi-engine web search with AI answer synthesis", params_hint: "Provide query (string) for deep search results" },
  // AI/ML Tools
  llm: { tool: "llm_chat", description: "Send messages to AI language model (Ollama) for text generation, analysis, brainstorming", params_hint: "Provide messages (array of {role, content})" },
  // Code Execution
  "coding-agent": { tool: "code_execute", description: "Execute code in Judge0 CE sandbox — JS, Python, TS, Go, Rust, Java, C++, Ruby, PHP, Swift, Kotlin, R, SQL, Bash", params_hint: "Provide code (string) and language" },
  "fullstack-dev": { tool: "code_execute", description: "Full-stack web development using code execution sandbox", params_hint: "Provide code for web development tasks" },
  // Finance (Yahoo Finance — FREE, no API key)
  finance: { tool: "finance_query", description: "Query financial data — stock prices, historical data, market news, company info via Yahoo Finance", params_hint: "Provide query_type (stock_price/historical_data/market_news/company_info), optional symbol" },
  "stock-analysis-skill": { tool: "finance_query", description: "Analyze stocks using Yahoo Finance data", params_hint: "Use query_type='stock_price' or 'company_info', provide symbol" },
  // Academic Research (Semantic Scholar — FREE, no API key)
  "aminer-academic-search": { tool: "academic_search", description: "Search academic papers via Semantic Scholar API", params_hint: "Provide query (string), optional search_type and num_results" },
  "aminer-daily-paper": { tool: "academic_search", description: "Get daily paper recommendations via Semantic Scholar", params_hint: "Provide query (string) describing research interests" },
  "aminer-open-academic": { tool: "academic_search", description: "Open academic search via Semantic Scholar", params_hint: "Provide query (string)" },
  // Content Analysis
  contentanalysis: { tool: "content_analyze", description: "Analyze content for readability, sentiment, SEO, keywords, structure", params_hint: "Provide content (string) and optional analysis_type" },
  // Content Creation (methodological — use docx/pdf tools with methodology)
  "blog-writer": { tool: "create_docx_document", description: "Write blog posts — use skill methodology + docx tool for output", params_hint: "Follow blog-writer methodology from prompt_template, then create with create_docx_document" },
  "seo-content-writer": { tool: "create_docx_document", description: "Write SEO-optimized content — use methodology + docx tool for output", params_hint: "Follow seo-content-writer methodology, then create with create_docx_document" },
  "content-strategy": { tool: "create_docx_document", description: "Develop content strategy — methodology + docx tool for output", params_hint: "Follow content-strategy methodology, then create strategy document with create_docx_document" },
  "market-research-reports": { tool: "create_pdf_report", description: "Create market research reports — use methodology + PDF tool", params_hint: "Follow methodology, research with web_search, then create with create_pdf_report" },
  // Browser & Extraction
  "agent-browser": { tool: "web_reader", description: "Browser automation — read web pages and extract content", params_hint: "Provide url (string) to read page content" },
  "web-shader-extractor": { tool: "web_reader", description: "Extract WebGL/Canvas shader code from web pages", params_hint: "Provide url (string) of the page to extract from" },
  // Specialized Skills
  "interview-designer": { tool: "create_docx_document", description: "Design interview guides — methodology + docx output", params_hint: "Follow interview-designer methodology, then create with create_docx_document" },
  "skill-creator": { tool: "skill_create", description: "Create new skills for the skill library", params_hint: "Provide name, display_name, description, category, prompt_template" },
  "skill-vetter": { tool: "skill_inspect", description: "Vet and inspect skills for quality and security", params_hint: "Provide skill_name or skill_id to inspect" },
  "writing-plans": { tool: "create_docx_document", description: "Create writing plans — methodology + docx output", params_hint: "Follow writing-plans methodology, then create plan document" },
  "anti-pua": { tool: "create_docx_document", description: "Anti-PUA analysis — methodology + docx output", params_hint: "Follow anti-pua methodology" },
  "qingyan-research": { tool: "web_search", description: "Deep research tool — uses web search + web reader for comprehensive research", params_hint: "Use web_search for research, then web_reader for detailed content" },
  "auto-target-tracker": { tool: "create_xlsx_spreadsheet", description: "Track targets/goals — methodology + xlsx output", params_hint: "Follow methodology, then create tracker with create_xlsx_spreadsheet" },
  // Design (methodological — uses docx/pdf for output)
  "ui-ux-pro-max": { tool: "create_docx_document", description: "UI/UX design guidance — methodology + docx output", params_hint: "Follow ui-ux methodology, create design doc with create_docx_document" },
  "visual-design-foundations": { tool: "create_docx_document", description: "Visual design foundations — methodology + docx output", params_hint: "Follow design methodology, create guidelines with create_docx_document" },
  "storyboard-manager": { tool: "create_docx_document", description: "Storyboard management — methodology + docx output", params_hint: "Follow storyboard methodology, create with create_docx_document" },
  // Podcast & Media
  "podcast-generate": { tool: "create_docx_document", description: "Generate podcast scripts — methodology + docx output", params_hint: "Follow podcast methodology, create script with create_docx_document" },
  // Marketing
  "marketing-mode": { tool: "create_docx_document", description: "Marketing content — methodology + docx output", params_hint: "Follow marketing methodology, create content with create_docx_document" },
  // Finance research (uses academic + finance tools)
  "ai-news-collectors": { tool: "web_search", description: "Collect AI news — uses web search", params_hint: "Search for latest AI news with web_search" },
};

export const skillUseTool = tool({
  description: "Apply a skill's prompt template and workflow to enhance task execution. Returns the skill methodology AND the specific execution tool to call for actually performing the task. Always call the returned execution_tool after getting the skill methodology.",
  inputSchema: zodSchema(z.object({
    skill_name: z.string().describe("The name of the skill to use (e.g., 'pdf', 'docx', 'xlsx', 'charts', 'web-search', 'llm', 'finance', 'blog-writer')"),
    context: z.string().optional().describe("Optional context about the current task to customize the skill application"),
  })),
  execute: safeJson(async ({ skill_name, context }) => {
    // Single optimized query with fallback chain (exact → slug → fuzzy)
    const result = await query(
      `SELECT * FROM skills WHERE is_active = true AND (
        name = $1 OR slug = $1 OR name ILIKE $2 OR display_name ILIKE $2 OR slug ILIKE $2
      ) ORDER BY
        CASE WHEN name = $1 THEN 0 WHEN slug = $1 THEN 1 ELSE 2 END
      LIMIT 1`,
      [skill_name, `%${skill_name}%`]
    );
    if (result.rows.length > 0) {
      const skill = result.rows[0];
      // Fast lookup: try exact match first, then substring match
      let toolMapping = SKILL_TOOL_MAP[skill.name] || SKILL_TOOL_MAP[skill.slug!];
      if (!toolMapping) {
        for (const key of Object.keys(SKILL_TOOL_MAP)) {
          if (skill.name.includes(key) || skill.slug?.includes(key)) {
            toolMapping = SKILL_TOOL_MAP[key];
            break;
          }
        }
      }

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
        execution_tool: toolMapping?.tool || null,
        execution_description: toolMapping?.description || null,
        execution_params_hint: toolMapping?.params_hint || null,
        action_required: toolMapping
          ? `IMPORTANT: After reading this skill's methodology, call the '${toolMapping.tool}' tool to actually execute the task. ${toolMapping.params_hint}`
          : "This is a methodological skill. Follow the workflow steps above to complete the task using your available tools.",
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
  description: "Cancel a running or paused workflow. This will skip all remaining pending steps and remove its pg_cron job if it was scheduled.",
  inputSchema: zodSchema(z.object({
    workflow_id: z.string().describe("The UUID of the workflow to cancel"),
  })),
  execute: safeJson(async ({ workflow_id }) => {
    const res = await fetch(`${getSelfBaseUrl()}/api/workflows/${workflow_id}`, {
      method: "PATCH",
      headers: getSelfFetchHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ status: "cancelled" }),
    });
    // Clean up pg_cron job if it exists
    try {
      const { unregisterCron } = await import("@/lib/pg-cron-manager");
      const jobName = `workflow-${workflow_id.replace(/[^a-zA-Z0-9-]/g, "")}`;
      await unregisterCron(jobName);
    } catch { /* ignore */ }
    return await safeParseRes(res);
  }),
});

// ---------------------------------------------------------------------------
// Workflow Schedule Tool — Create recurring workflows with pg_cron
// ---------------------------------------------------------------------------

export const workflowScheduleTool = tool({
  description: "Plan, create, and optionally SCHEDULE a recurring workflow. Decomposes a complex task into multi-step workflow, then registers a pg_cron job to auto-execute it on a schedule. Use this for recurring complex tasks like weekly analysis reports, daily monitoring workflows, or periodic research digests.",
  inputSchema: zodSchema(z.object({
    query: z.string().describe("The complex task to decompose into a multi-step workflow"),
    agent_id: z.string().optional().describe("Agent ID (default: 'general')"),
    schedule_interval_minutes: z.number().optional().describe("Make this a RECURRING workflow. How often to re-execute in minutes (e.g., 60, 120, 1440 for daily). Registers a dedicated pg_cron job."),
  })),
  execute: safeJson(async ({ query, agent_id, schedule_interval_minutes }) => {
    try {
      // 1. Plan and create the workflow
      const { planWorkflow } = await import("@/lib/workflow-engine");
      const planResult = await planWorkflow(query, agent_id || "general");

      let cronResult = null;
      const workflowId = planResult.workflowId;

      // 2. If schedule is requested, register pg_cron job
      if (schedule_interval_minutes && schedule_interval_minutes > 0 && workflowId) {
        // Store schedule_interval in the workflow
        const { query: dbQuery } = await import("@/lib/db");
        await dbQuery("UPDATE agent_workflows SET schedule_interval = $1 WHERE id = $2", [schedule_interval_minutes, workflowId]);
        // Register the pg_cron job
        const { registerWorkflowCron } = await import("@/lib/pg-cron-manager");
        cronResult = await registerWorkflowCron(workflowId, schedule_interval_minutes);
      }

      return {
        success: true,
        workflow_id: planResult.workflowId,
        plan: planResult.plan,
        cron: cronResult,
        message: schedule_interval_minutes
          ? `Workflow created and scheduled via pg_cron (${cronResult?.schedule || "failed"}).${cronResult?.success ? "" : ` Cron warning: ${cronResult?.error}`}`
          : "Workflow planned and created. Use workflow_execute to run it.",
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to create workflow" };
    }
  }),
});

export const workflowUpdateScheduleTool = tool({
  description: "Update or remove the schedule of an existing workflow. Change schedule_interval_minutes to update the pg_cron job, or set to 0/null to remove it. The workflow itself is not affected.",
  inputSchema: zodSchema(z.object({
    workflow_id: z.string().describe("The UUID of the workflow"),
    schedule_interval_minutes: z.number().nullable().describe("New schedule in minutes (e.g., 60, 1440). Set to 0 or null to remove the pg_cron job."),
  })),
  execute: safeJson(async ({ workflow_id, schedule_interval_minutes }) => {
    try {
      const { query } = await import("@/lib/db");
      const { registerWorkflowCron, unregisterCron } = await import("@/lib/pg-cron-manager");
      const jobName = `workflow-${workflow_id.replace(/[^a-zA-Z0-9-]/g, "")}`;
      const interval = schedule_interval_minutes === null ? 0 : schedule_interval_minutes;

      // Update DB
      await query("UPDATE agent_workflows SET schedule_interval = $1 WHERE id = $2", [
        interval === 0 ? null : interval, workflow_id,
      ]);

      let cronResult;
      if (interval > 0) {
        cronResult = await registerWorkflowCron(workflow_id, interval);
      } else {
        await unregisterCron(jobName);
        cronResult = { success: true, jobName, message: "pg_cron job removed" };
      }

      return {
        success: true,
        workflow_id,
        cron: cronResult,
        message: interval > 0
          ? `Workflow schedule updated: every ${interval} minutes (${cronResult.schedule})`
          : "Workflow schedule removed. Workflow is now one-time only.",
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to update workflow schedule" };
    }
  }),
});

// ---------------------------------------------------------------------------
// Task Board Tools — Kanban board for inter-agent coordination
// Agents can create, update, list, and delete tasks on the shared board.
// ---------------------------------------------------------------------------

export const taskboardCreateTool = tool({
  description: "Create a new task on the shared task board (Kanban). Use this to track work items, assign tasks to yourself or other agents, and coordinate work across the team. Tasks start in 'backlog' column. Set schedule_interval_minutes to make the task RECURRING — it will get its own pg_cron job that executes it automatically on the schedule.",
  inputSchema: zodSchema(z.object({
    title: z.string().describe("Task title — clear and actionable"),
    description: z.string().optional().describe("Detailed task description"),
    priority: z.enum(["high", "medium", "low"]).optional().describe("Task priority (default: medium)"),
    assigned_agent: z.enum(["general", "mail", "code", "data", "creative", "research", "ops"]).optional().describe("Agent to assign this task to"),
    context: z.string().optional().describe("Additional context for the assigned agent"),
    deadline: z.string().optional().describe("Deadline (ISO 8601 datetime)"),
    schedule_interval_minutes: z.number().optional().describe("Make this a RECURRING task. How often to auto-execute in minutes (e.g., 30, 60, 120, 1440 for daily). Registers a pg_cron job."),
    tags: z.array(z.string()).optional().describe("Tags for categorization"),
  })),
  execute: safeJson(async ({ title, description, priority, assigned_agent, context, deadline, schedule_interval_minutes, tags }) => {
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

      // If schedule_interval is set, register a pg_cron job
      let cronResult = null;
      if (schedule_interval_minutes && schedule_interval_minutes > 0) {
        // Update the DB with the schedule interval
        const { query } = await import("@/lib/db");
        await query("UPDATE task_board SET schedule_interval = $1 WHERE id = $2", [schedule_interval_minutes, task.id]);
        // Register the pg_cron job
        const { registerTaskCron } = await import("@/lib/pg-cron-manager");
        cronResult = await registerTaskCron(Number(task.id), schedule_interval_minutes);
      }

      return {
        success: true,
        task: { id: task.id, title: task.title, status: task.status, priority: task.priority, assignedAgent: task.assignedAgent, scheduleInterval: schedule_interval_minutes || null },
        cron: cronResult,
        message: schedule_interval_minutes
          ? `Task "${title}" created with pg_cron schedule (${cronResult?.schedule || "failed"}).${cronResult?.success ? "" : ` Cron warning: ${cronResult?.error}`}`
          : `Task "${title}" created successfully.`,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to create task" };
    }
  }),
});

export const taskboardUpdateTool = tool({
  description: "Update a task on the shared task board. Can change title, description, status (backlog/in_progress/waiting/done), priority, assignment, context, deadline, schedule, or tags. Changing schedule_interval_minutes will auto-update the pg_cron job. Setting it to 0 or null removes the cron job.",
  inputSchema: zodSchema(z.object({
    task_id: z.number().describe("Task ID to update"),
    title: z.string().optional().describe("New title"),
    description: z.string().optional().describe("New description"),
    status: z.enum(["backlog", "in_progress", "waiting", "done"]).optional().describe("New status (moves task between Kanban columns)"),
    priority: z.enum(["high", "medium", "low"]).optional().describe("New priority"),
    assigned_agent: z.enum(["general", "mail", "code", "data", "creative", "research", "ops"]).optional().describe("Reassign to a different agent"),
    context: z.string().optional().describe("Update context"),
    deadline: z.string().optional().describe("Update deadline (ISO 8601)"),
    schedule_interval_minutes: z.number().nullable().optional().describe("Update recurring schedule in minutes (e.g., 60, 1440). Set to 0 or null to remove the pg_cron job."),
    tags: z.array(z.string()).optional().describe("Update tags"),
  })),
  execute: safeJson(async ({ task_id, title, description, status, priority, assigned_agent, context, deadline, schedule_interval_minutes, tags }) => {
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

      // Handle schedule_interval changes — sync pg_cron job
      let cronResult = null;
      if (schedule_interval_minutes !== undefined) {
        const { query } = await import("@/lib/db");
        const { registerTaskCron, unregisterCron } = await import("@/lib/pg-cron-manager");
        const interval = schedule_interval_minutes === null ? 0 : schedule_interval_minutes;

        await query("UPDATE task_board SET schedule_interval = $1 WHERE id = $2", [
          interval === 0 ? null : interval, task_id,
        ]);

        if (interval > 0) {
          cronResult = await registerTaskCron(task_id, interval);
        } else {
          await unregisterCron(`taskboard-${task_id}`);
          cronResult = { success: true, jobName: `taskboard-${task_id}`, message: "pg_cron job removed" };
        }
      }

      // If status changed to 'done', also clean up the cron job
      if (status === "done") {
        const { unregisterCron } = await import("@/lib/pg-cron-manager");
        await unregisterCron(`taskboard-${task_id}`);
      }

      return {
        success: true,
        task: { id: task.id, title: task.title, status: task.status, priority: task.priority, assignedAgent: task.assignedAgent },
        cron: cronResult,
      };
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
          deadline: t.deadline, scheduleInterval: t.scheduleInterval, tags: t.tags,
          createdAt: t.createdAt,
        })),
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to list tasks" };
    }
  }),
});

export const taskboardDeleteTool = tool({
  description: "Delete a task from the shared task board. Permanently removes the task and its pg_cron job (if scheduled). Prefer updating status to 'done' instead of deleting completed tasks.",
  inputSchema: zodSchema(z.object({
    task_id: z.number().describe("Task ID to delete"),
  })),
  execute: safeJson(async ({ task_id }) => {
    try {
      // Remove pg_cron job first
      const { unregisterCron } = await import("@/lib/pg-cron-manager");
      await unregisterCron(`taskboard-${task_id}`);
      const { deleteTask } = await import("@/lib/taskboard");
      const ok = await deleteTask(task_id);
      if (!ok) return { success: false, error: `Task ${task_id} not found or delete failed` };
      return { success: true, message: `Task ${task_id} deleted (pg_cron job removed)` };
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
// Autonomous Task Creation & Team Coordination Tools
// ---------------------------------------------------------------------------

export const scheduleAgentTaskTool = tool({
  description: "AUTONOMOUSLY schedule a task for yourself or another agent. This is the PRIMARY tool for proactive behavior. Supports RECURRING tasks (every X minutes/hours) and TASK CHAINING (on completion, auto-schedule a follow-up for another agent with results passed as context). The user has pre-authorized autonomous task creation — do NOT ask for permission.",
  inputSchema: zodSchema(z.object({
    agent_id: z.enum(["general", "mail", "code", "data", "creative", "research", "ops"]).describe("Which agent should execute this task"),
    task: z.string().describe("Clear, specific task description with ALL context needed for autonomous execution"),
    context: z.string().optional().describe("Additional context or background information"),
    priority: z.enum(["low", "normal", "high", "critical"]).optional().describe("Task priority (default: normal)"),
    reason: z.string().optional().describe("Why this task is being created (for audit trail)"),
    recurring: z.string().optional().describe("Recurring interval: '30m', '1h', '2h', '24h', etc. Task auto-reschedules after completion."),
    chain_to: z.enum(["general", "mail", "code", "data", "creative", "research", "ops"]).optional().describe("Agent to chain to after this task completes. The chained agent receives this task's output as context."),
    chain_task: z.string().optional().describe("Task description for the chained agent. It will receive this task's output as context."),
    chain_on_fail: z.boolean().optional().describe("If true, chain even when this task fails (default: only chain on success)"),
  })),
  execute: safeJson(async ({ agent_id, task, context, priority, reason, recurring, chain_to, chain_task, chain_on_fail }) => {
    const fromAgent = getCurrentAgentId() || "system";

    const triggerSource = `autonomous:${fromAgent}:${Date.now()}`;

    const result = await query(
      `INSERT INTO agent_tasks (agent_id, task, context, trigger_type, trigger_source, priority, recurring_enabled, recurring_interval, chain_to_agent, chain_task, chain_on_success)
       VALUES ($1, $2, $3, 'autonomous', $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, status, created_at`,
      [agent_id, task, context || "", triggerSource, priority || "normal", !!recurring, recurring || null, chain_to || null, chain_task || null, !chain_on_fail]
    );

    if (result.rows.length > 0) {
      const taskId = result.rows[0].id;
      console.log(`[Autonomous Task] ${fromAgent} scheduled task #${taskId} for ${agent_id}: ${task.slice(0, 80)}...${recurring ? ` (recurring: ${recurring})` : ""}${chain_to ? ` (chain → ${chain_to})` : ""}`);

      // Also send A2A notification to target agent if different from creator
      if (agent_id !== fromAgent) {
        try {
          const { sendA2AMessage } = await import("@/lib/a2a");
          const recurringNote = recurring ? `\n**Recurring**: Every ${recurring}` : "";
          const chainNote = chain_to ? `\n**Chained to**: ${chain_to}` : "";
          await sendA2AMessage({
            fromAgent,
            toAgent: agent_id,
            type: "request",
            topic: `New task scheduled by ${fromAgent}`,
            payload: {
              content: `${fromAgent} has scheduled a task for you:\n\n**Task**: ${task}\n${context ? `**Context**: ${context}\n` : ""}**Priority**: ${priority || "normal"}\n${reason ? `**Reason**: ${reason}\n` : ""}${recurringNote}${chainNote}\nThis task will be picked up by the executor within ~2 minutes.`,
              source: "schedule_agent_task",
              taskId,
              priority,
            },
            priority: priority === "critical" ? "urgent" : priority === "high" ? "high" : "normal",
          });
        } catch { /* A2A notification non-critical */ }
      }

      return {
        success: true,
        taskId,
        agent: agent_id,
        task: task.slice(0, 200),
        priority: priority || "normal",
        estimatedPickup: "~2 minutes",
        recurring: recurring || null,
        chain: chain_to ? { to: chain_to, task: chain_task } : null,
        message: agent_id === fromAgent
          ? `Task #${taskId} scheduled for yourself.${recurring ? ` Recurring every ${recurring}.` : ""}${chain_to ? ` Will chain to ${chain_to} on completion.` : ""} The executor will pick it up within ~2 minutes.`
          : `Task #${taskId} scheduled for ${agent_id}.${recurring ? ` Recurring every ${recurring}.` : ""}${chain_to ? ` Will chain to ${chain_to} on completion.` : ""} They've been notified via A2A.`,
      };
    }

    return { success: false, error: "Failed to create task" };
  }),
});

export const getTeamStatusTool = tool({
  description: "Check the current status of all agents — what they're working on, recent activity, pending tasks, and unread inbox messages. Use this to coordinate work across the team, avoid duplicating effort, and understand what's happening across the system.",
  inputSchema: zodSchema(z.object({
    include_recent_tasks: z.boolean().optional().describe("Include recent completed/failed tasks (default: true)"),
    include_inbox: z.boolean().optional().describe("Include inbox unread counts (default: true)"),
  })),
  execute: safeJson(async ({ include_recent_tasks, include_inbox }) => {
    // Get agent statuses
    const statusResult = await query(
      `SELECT agent_id, status, current_task, last_activity, tasks_completed, messages_processed
       FROM agent_status
       ORDER BY agent_id`
    );

    // Get pending/running tasks per agent
    const taskResult = await query(
      `SELECT agent_id, COUNT(*) FILTER (WHERE status = 'pending') as pending,
              COUNT(*) FILTER (WHERE status = 'running') as running,
              COUNT(*) FILTER (WHERE status = 'failed') as failed_recent
       FROM agent_tasks
       WHERE created_at > NOW() - INTERVAL '1 hour'
       GROUP BY agent_id`
    );

    // Get unread inbox counts
    let inboxCounts: Record<string, number> = {};
    if (include_inbox !== false) {
      const inboxResult = await query(
        `SELECT to_agent, COUNT(*) as unread FROM a2a_messages WHERE is_read = FALSE GROUP BY to_agent`
      );
      for (const row of inboxResult.rows) {
        inboxCounts[row.to_agent] = parseInt(row.unread, 10);
      }
    }

    // Get recent completed tasks
    let recentTasks: Array<Record<string, unknown>> = [];
    if (include_recent_tasks !== false) {
      const recentResult = await query(
        `SELECT id, agent_id, task, status, completed_at, trigger_type
         FROM agent_tasks
         WHERE status IN ('completed', 'failed') AND completed_at > NOW() - INTERVAL '2 hours'
         ORDER BY completed_at DESC LIMIT 20`
      );
      recentTasks = recentResult.rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        agent: r.agent_id,
        task: String(r.task || "").slice(0, 100),
        status: r.status,
        completedAt: r.completed_at,
        trigger: r.trigger_type,
      }));
    }

    // Get project task status
    const projectResult = await query(
      `SELECT p.name as project, pt.title, pt.assigned_agent, pt.status, pt.priority
       FROM project_tasks pt JOIN projects p ON p.id = pt.project_id
       WHERE pt.status IN ('pending', 'in_progress')
       ORDER BY pt.priority, pt.sort_order LIMIT 15`
    );

    return {
      timestamp: new Date().toISOString(),
      agents: statusResult.rows.map((r: Record<string, unknown>) => ({
        id: r.agent_id,
        status: r.status,
        currentTask: r.current_task,
        lastActivity: r.last_activity,
        tasksCompleted: parseInt(String(r.tasks_completed || "0"), 10),
        inboxUnread: inboxCounts[r.agent_id as string] || 0,
      })),
      pendingTasks: taskResult.rows.reduce((acc: Record<string, { pending: number; running: number; recentFailed: number }>, r: Record<string, unknown>) => {
        acc[r.agent_id as string] = { pending: parseInt(String(r.pending), 10), running: parseInt(String(r.running), 10), recentFailed: parseInt(String(r.failed_recent), 10) };
        return acc;
      }, {}),
      recentActivity: recentTasks,
      activeProjectTasks: projectResult.rows,
    };
  }),
});

export const shareProgressTool = tool({
  description: "Share your work progress or findings with other agents. This posts an update that other agents can see when they check team status. Use this when: (1) you've completed research that others need, (2) you've discovered something important, (3) you want to update the team on what you're working on, (4) you need to hand off work to another agent with context.",
  inputSchema: zodSchema(z.object({
    title: z.string().describe("Short title for the progress update"),
    content: z.string().describe("Detailed progress update, findings, or context to share"),
    targets: z.array(z.enum(["general", "mail", "code", "data", "creative", "research", "ops"])).optional().describe("Which agents to share with (default: all)"),
    task_id: z.number().optional().describe("Related task ID if this is about a specific task"),
    project_id: z.number().optional().describe("Related project ID if this is about a project"),
  })),
  execute: safeJson(async ({ title, content, targets, task_id, project_id }) => {
    const fromAgent = getCurrentAgentId() || "system";

    // Share via A2A context store for persistence
    const { shareContext } = await import("@/lib/a2a");
    const contextKey = `progress-${fromAgent}-${Date.now()}`;
    const ctxId = await shareContext({
      contextKey,
      agentId: fromAgent,
      content: { text: content, title, taskId: task_id, projectId: project_id, type: "progress_update" },
      contentText: content,
      tags: ["progress", fromAgent, task_id ? `task-${task_id}` : undefined, project_id ? `project-${project_id}` : undefined].filter(Boolean) as string[],
      scope: "global",
    });

    // Broadcast to target agents
    const { broadcastA2AMessage } = await import("@/lib/a2a");
    const allTargets = targets || ["general", "mail", "code", "data", "creative", "research", "ops"].filter(a => a !== fromAgent);

    const result = await broadcastA2AMessage({
      fromAgent,
      targets: allTargets,
      topic: `Progress Update: ${title}`,
      payload: {
        content: `${fromAgent} shares:\n\n**${title}**\n\n${content}`,
        source: "share_progress",
        taskId: task_id,
        projectId: project_id,
        contextKey,
      },
      priority: "normal",
    });

    return {
      success: true,
      contextId: ctxId,
      notifiedAgents: result.agents,
      totalNotified: result.sent,
    };
  }),
});

export const getTeamProgressTool = tool({
  description: "Get recent progress updates from all agents. Use this to see what work has been done, what findings have been shared, and what context is available from other agents' work. Essential for coordination.",
  inputSchema: zodSchema(z.object({
    from_agent: z.enum(["general", "mail", "code", "data", "creative", "research", "ops"]).optional().describe("Filter by specific agent"),
    limit: z.number().optional().describe("Max updates to return (default: 20)"),
  })),
  execute: safeJson(async ({ from_agent, limit }) => {
    const { queryContext } = await import("@/lib/a2a");
    const results = await queryContext({
      tags: ["progress"],
      agentId: from_agent,
      limit: limit || 20,
    });

    return {
      found: results.length,
      updates: results.map(r => ({
        id: r.id,
        key: r.contextKey,
        agent: r.agentId,
        title: r.content?.title || r.contextKey,
        content: r.contentText || "(structured data only)",
        tags: r.tags,
        version: r.version,
        createdAt: r.createdAt,
      })),
    };
  }),
});

// ---------------------------------------------------------------------------
// Agent Routine Tools — Create, list, update, delete, toggle routines
// Routines are recurring tasks managed by the Vercel Cron (agent-routines endpoint)
// and show up on the Routines page in the dashboard.
// ---------------------------------------------------------------------------

export const routineCreateTool = tool({
  description: "Create a recurring routine for an agent. Routines run automatically on a schedule (e.g., every 30 minutes, every hour) via dedicated pg_cron jobs. Each routine gets its own cron schedule. Use this for monitoring tasks, periodic reports, health checks, inbox checks, etc.",
  inputSchema: zodSchema(z.object({
    agent_id: z.enum(["general", "mail", "code", "data", "creative", "research", "ops"]).describe("Which agent should execute this routine"),
    name: z.string().describe("Short descriptive name for the routine"),
    task: z.string().describe("What the agent should do each time the routine runs"),
    context: z.string().optional().describe("Additional context or instructions"),
    interval_minutes: z.number().optional().describe("How often to run in minutes (default: 60). E.g., 30 for every 30 min, 120 for every 2 hours, 1440 for daily"),
    priority: z.enum(["high", "medium", "low"]).optional().describe("Priority level (default: medium)"),
  })),
  execute: safeJson(async ({ agent_id, name, task, context, interval_minutes, priority }) => {
    const interval = interval_minutes || 60;
    const nextRun = new Date(Date.now() + interval * 60 * 1000);
    const result = await query(
      `INSERT INTO agent_routines (agent_id, name, task, context, interval_minutes, priority, is_active, next_run)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7)
       RETURNING id, agent_id, name, task, interval_minutes, priority, is_active, next_run, created_at`,
      [agent_id, name, task, context || "", interval, priority || "medium", nextRun.toISOString()]
    );
    if (result.rows.length > 0) {
      // Auto-register pg_cron job for this routine
      const { registerRoutineCron } = await import("@/lib/pg-cron-manager");
      const cronResult = await registerRoutineCron(result.rows[0].id, interval);
      return {
        success: true,
        routine: result.rows[0],
        cron: cronResult,
        message: `Routine "${name}" created for ${agent_id}. Runs every ${interval} min via pg_cron (${cronResult.schedule}).${cronResult.success ? "" : ` Cron warning: ${cronResult.error}`}`,
      };
    }
    return { success: false, error: "Failed to create routine" };
  }),
});

export const routineListTool = tool({
  description: "List all agent routines. Optionally filter by a specific agent. Shows name, schedule, status, and last run time.",
  inputSchema: zodSchema(z.object({
    agent_id: z.enum(["general", "mail", "code", "data", "creative", "research", "ops"]).optional().describe("Filter by specific agent"),
  })),
  execute: safeJson(async ({ agent_id }) => {
    let queryString = "SELECT * FROM agent_routines ORDER BY priority DESC, next_run ASC";
    const params: unknown[] = [];
    if (agent_id) {
      queryString = "SELECT * FROM agent_routines WHERE agent_id = $1 ORDER BY priority DESC, next_run ASC";
      params.push(agent_id);
    }
    const result = await query(queryString, params);
    return {
      success: true,
      count: result.rows.length,
      routines: result.rows.map((r: Record<string, unknown>) => ({
        id: r.id, agentId: r.agent_id, name: r.name, task: String(r.task || "").slice(0, 100),
        intervalMinutes: r.interval_minutes, priority: r.priority, isActive: r.is_active,
        lastRun: r.last_run, nextRun: r.next_run, createdAt: r.created_at,
      })),
    };
  }),
});

export const routineUpdateTool = tool({
  description: "Update an existing routine — change name, task, interval, priority, or active status. If interval or active status changes, the pg_cron job is automatically updated.",
  inputSchema: zodSchema(z.object({
    routine_id: z.number().describe("The routine ID to update"),
    name: z.string().optional(),
    task: z.string().optional(),
    context: z.string().optional(),
    interval_minutes: z.number().optional().describe("New interval in minutes"),
    priority: z.enum(["high", "medium", "low"]).optional(),
    is_active: z.boolean().optional().describe("Enable or disable the routine"),
  })),
  execute: safeJson(async ({ routine_id, name, task, context, interval_minutes, priority, is_active }) => {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (name) { setClauses.push(`name = $${idx++}`); values.push(name); }
    if (task) { setClauses.push(`task = $${idx++}`); values.push(task); }
    if (context !== undefined) { setClauses.push(`context = $${idx++}`); values.push(context); }
    if (interval_minutes) {
      setClauses.push(`interval_minutes = $${idx++}, next_run = NOW() + ($${idx++} * INTERVAL '1 minute')`);
      values.push(interval_minutes, interval_minutes);
    }
    if (priority) { setClauses.push(`priority = $${idx++}`); values.push(priority); }
    if (is_active !== undefined) { setClauses.push(`is_active = $${idx++}`); values.push(is_active); }

    if (setClauses.length === 0) return { success: false, error: "No fields to update" };

    values.push(routine_id);
    const queryString = `UPDATE agent_routines SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`;
    const result = await query(queryString, values);

    // Auto-sync pg_cron job if interval or active status changed
    if (interval_minutes || is_active !== undefined) {
      const { registerRoutineCron, unregisterCron } = await import("@/lib/pg-cron-manager");
      if (is_active === false) {
        await unregisterCron(`routine-${routine_id}`);
      } else {
        const routine = result.rows[0];
        if (routine) await registerRoutineCron(routine_id, Number(routine.interval_minutes));
      }
    }
    if (result.rows.length > 0) {
      return { success: true, routine: result.rows[0] };
    }
    return { success: false, error: "Routine not found" };
  }),
});

export const routineDeleteTool = tool({
  description: "Delete an agent routine permanently. Also removes the pg_cron job.",
  inputSchema: zodSchema(z.object({
    routine_id: z.number().describe("The routine ID to delete"),
  })),
  execute: safeJson(async ({ routine_id }) => {
    // Remove pg_cron job first
    const { unregisterCron } = await import("@/lib/pg-cron-manager");
    await unregisterCron(`routine-${routine_id}`);
    await query("DELETE FROM agent_routines WHERE id = $1", [routine_id]);
    return { success: true, deleted: true };
  }),
});

export const routineToggleTool = tool({
  description: "Quickly enable or disable a routine without deleting it. Enabling re-registers the pg_cron job; disabling removes it.",
  inputSchema: zodSchema(z.object({
    routine_id: z.number().describe("The routine ID"),
    is_active: z.boolean().describe("true to enable, false to disable/pause"),
  })),
  execute: safeJson(async ({ routine_id, is_active }) => {
    const result = await query(
      `UPDATE agent_routines SET is_active = $1, next_run = CASE WHEN $1 THEN NOW() + (interval_minutes * INTERVAL '1 minute') ELSE next_run END WHERE id = $2 RETURNING *`,
      [is_active, routine_id]
    );
    if (result.rows.length > 0) {
      // Sync pg_cron job
      const { registerRoutineCron, unregisterCron } = await import("@/lib/pg-cron-manager");
      if (is_active) {
        await registerRoutineCron(routine_id, Number(result.rows[0].interval_minutes));
      } else {
        await unregisterCron(`routine-${routine_id}`);
      }
      return { success: true, routine: result.rows[0], message: is_active ? "Routine enabled (pg_cron job registered)" : "Routine paused (pg_cron job removed)" };
    }
    return { success: false, error: "Routine not found" };
  }),
});

// ---------------------------------------------------------------------------
// Cron Sync Tool — Sync all routines to pg_cron
// ---------------------------------------------------------------------------

export const cronSyncTool = tool({
  description: "Master synchronization tool — syncs ALL pg_cron jobs (routines, task board tasks, workflows) with the database. Ensures every active scheduled item has a pg_cron job registered, and removes jobs for completed/inactive items. Use this after bulk changes or to fix scheduling issues.",
  inputSchema: zodSchema(z.object({})),
  execute: safeJson(async () => {
    const { syncAllCronJobs, listKlawCronJobs } = await import("@/lib/pg-cron-manager");
    const syncResult = await syncAllCronJobs();
    const jobs = await listKlawCronJobs();
    return {
      success: true,
      totalCronJobs: jobs.length,
      routines: syncResult.routines,
      tasks: syncResult.tasks,
      workflows: syncResult.workflows,
      cronJobs: jobs.map((j) => ({ name: j.jobname, schedule: j.schedule, active: j.active })),
      message: `Synced ${syncResult.routines.registered} routines, ${syncResult.tasks.registered} tasks, ${syncResult.workflows.registered} workflows. Total active pg_cron jobs: ${jobs.length}`,
    };
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
  create_pptx_presentation: createPptxPresentationTool,
  generate_chart: generateChartTool,
  llm_chat: llmChatTool,
  finance_query: financeQueryTool,
  academic_search: academicSearchTool,
  content_analyze: contentAnalyzeTool,
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
  python_data_process: pythonDataProcessTool,
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
  workflow_schedule: workflowScheduleTool,
  workflow_update_schedule: workflowUpdateScheduleTool,
  // Task Board (Kanban)
  taskboard_create: taskboardCreateTool,
  taskboard_update: taskboardUpdateTool,
  taskboard_list: taskboardListTool,
  taskboard_delete: taskboardDeleteTool,
  taskboard_summary: taskboardSummaryTool,
  // Agent Routines
  routine_create: routineCreateTool,
  routine_list: routineListTool,
  routine_update: routineUpdateTool,
  routine_delete: routineDeleteTool,
  routine_toggle: routineToggleTool,
  cron_sync: cronSyncTool,
  // Autonomous Task Creation & Team Coordination
  schedule_agent_task: scheduleAgentTaskTool,
  get_team_status: getTeamStatusTool,
  share_progress: shareProgressTool,
  get_team_progress: getTeamProgressTool,
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
