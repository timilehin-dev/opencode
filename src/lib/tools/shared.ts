// ---------------------------------------------------------------------------
// Klawhub Agent System — Shared Tool Utilities
// ---------------------------------------------------------------------------
// Shared types, imports, utility functions used by all tool modules.
// ---------------------------------------------------------------------------

import { z } from "zod";
import { tool, zodSchema } from "ai";
import { query } from "@/lib/db";

// Native API clients — all tools use free, no-key-required APIs (see api-clients.ts)
import { executeCodeJudge0, readWebPage, getStockQuote, getHistoricalData, searchPapers, duckDuckGoSearch, getMarketNews } from '@/lib/api-clients';

import { AsyncLocalStorage } from "node:async_hooks";

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
  gCalUpdateEvent,
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
} from "../google";

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
} from "../github";

// Vercel API imports
import { listProjects, listDeployments, listDomains, getDeployment } from "../vercel";

// Stitch design platform imports
import { generateDesign, editScreen, generateVariants } from "../stitch";

// Workspace imports (Reminders, Todos, Contacts)
import {
  createReminder, listReminders, getReminder, updateReminder, deleteReminder,
  createTodo, listTodos, getTodo, updateTodo, deleteTodo, getTodoStats,
  createContact, listContacts, getContact, updateContact, deleteContact,
  searchContacts,
} from "../workspace";

// Re-export everything for easy access from module files
export { z, tool, zodSchema, query, executeCodeJudge0, readWebPage, getStockQuote, getHistoricalData, searchPapers, duckDuckGoSearch, getMarketNews,
  gGmailSendEmail, gGmailFetchEmails, gGmailListLabels, gGmailCreateLabel, gGmailDeleteLabel, gGmailProfile, gGmailGetMessage,
  gCalListCalendars, gCalListEvents, gCalCreateEvent, gCalDeleteEvent, gCalUpdateEvent,
  gDriveListFiles, gDriveCreateFolder, gDriveCreateFile,
  gSheetsGet, gSheetsGetValues, gSheetsBatchGetValues, gSheetsAppendValues, gSheetsUpdateValues, gSheetsCreate, gSheetsAddSheet,
  gDocsList, gDocsGet, gDocsCreate, gDocsAppendText,
  googleFetch, plainTextToHtml, safeJsonParse,
  getRepo, listIssues, createIssue, updateIssue, listPullRequests, listCommits, getRepoTree, getFileContent, searchCode, listBranches, createPullRequest, getPullRequest, getPullRequestFiles, createPRComment, createBranch,
  listProjects, listDeployments, listDomains, getDeployment,
  generateDesign, editScreen, generateVariants,
  createReminder, listReminders, getReminder, updateReminder, deleteReminder,
  createTodo, listTodos, getTodo, updateTodo, deleteTodo, getTodoStats,
  createContact, listContacts, getContact, updateContact, deleteContact, searchContacts,
};

// --- Current agent context for A2A tools ---
const agentContextStorage = new AsyncLocalStorage<{ agentId: string }>();

export function setCurrentAgentId(id: string) {
  const store = agentContextStorage.getStore();
  if (store) store.agentId = id;
}

export function getCurrentAgentId(): string {
  const store = agentContextStorage.getStore();
  return store?.agentId || 'general';
}

export function withAgentContext<T>(agentId: string, fn: () => T | Promise<T>): T | Promise<T> {
  return agentContextStorage.run({ agentId }, fn);
}

// --- Self-referencing base URL helper (for server-side fetch to own API routes) ---
export function getSelfBaseUrl(): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
}

export function getSelfFetchHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  if (process.env.VERCEL_PROTECTION_BYPASS) {
    h["x-vercel-protection-bypass"] = process.env.VERCEL_PROTECTION_BYPASS;
  }
  return h;
}

// --- AIHubMix direct API helper ---
export const AIHUBMIX_BASE = process.env.AIHUBMIX_BASE_URL || "https://aihubmix.com/v1";
export const AIHUBMIX_KEYS = [
  process.env.AIHUBMIX_API_KEY_1 || "",
  process.env.AIHUBMIX_API_KEY_2 || "",
  process.env.AIHUBMIX_API_KEY_3 || "",
  process.env.AIHUBMIX_API_KEY_4 || "",
  process.env.AIHUBMIX_API_KEY_5 || "",
].filter(Boolean);
let _aiKeyIdx = 0;
export function nextAIHubMixKey(): string {
  if (AIHUBMIX_KEYS.length === 0) throw new Error("No AIHubMix API keys configured.");
  const key = AIHUBMIX_KEYS[_aiKeyIdx % AIHUBMIX_KEYS.length];
  _aiKeyIdx++;
  return key;
}

// --- Ollama Cloud direct API helper ---
export const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || "https://ollama.com/v1";
export const OLLAMA_KEYS = [
  process.env.OLLAMA_CLOUD_KEY_1 || "",
  process.env.OLLAMA_CLOUD_KEY_2 || "",
  process.env.OLLAMA_CLOUD_KEY_3 || "",
  process.env.OLLAMA_CLOUD_KEY_4 || "",
  process.env.OLLAMA_CLOUD_KEY_5 || "",
  process.env.OLLAMA_CLOUD_KEY_6 || "",
].filter(Boolean);
let _ollamaKeyIdx = 0;
export function nextOllamaKey(): string {
  if (OLLAMA_KEYS.length === 0) throw new Error("No Ollama Cloud API keys configured.");
  const key = OLLAMA_KEYS[_ollamaKeyIdx % OLLAMA_KEYS.length];
  _ollamaKeyIdx++;
  return key;
}

// --- Tavily Search API helper ---
export const TAVILY_KEYS = [
  process.env.TAVILY_API_KEY_1 || "",
  process.env.TAVILY_API_KEY_2 || "",
  process.env.TAVILY_API_KEY_3 || "",
].filter(Boolean);
let _tavilyKeyIdx = 0;
export function nextTavilyKey(): string {
  if (TAVILY_KEYS.length === 0) throw new Error("No Tavily API keys configured.");
  const key = TAVILY_KEYS[_tavilyKeyIdx % TAVILY_KEYS.length];
  _tavilyKeyIdx++;
  return key;
}

// --- OCR.space API helper ---
const OCR_SPACE_KEY = process.env.OCR_SPACE_API_KEY || "";
const OCR_SPACE_URL = "https://api.ocr.space/parse/image";

export async function ocrSpaceExtract(options: { base64?: string; url?: string; language?: string }): Promise<{
  text: string;
  wordCount: number;
  lineCount: number;
}> {
  const formData = new FormData();
  formData.append("language", options.language || "eng");
  formData.append("isOverlayRequired", "false");
  formData.append("scale", "true");
  formData.append("OCREngine", "2");

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

// ---------------------------------------------------------------------------
// Local safe response parser
// ---------------------------------------------------------------------------
export async function safeParseRes<T = unknown>(res: Response): Promise<T> {
  if (!res.ok) {
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

// ---------------------------------------------------------------------------
// Helper: wrap async fn in try/catch returning JSON string
// ---------------------------------------------------------------------------
export const MAX_TOOL_RESULT_LENGTH = 65536;

const RETRYABLE_ERROR_PATTERNS = [
  /timeout/i, /timed? out/i, /econnrefused/i, /econnreset/i,
  /429/, /503/, /502/, /500/, /socket hang up/i, /network error/i,
  /abort error/i, /reset by peer/i,
];

function isRetryableError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return RETRYABLE_ERROR_PATTERNS.some(pattern => pattern.test(msg));
}

export function safeJsonWithRetry<T>(fn: (input: T) => Promise<unknown>, maxRetries = 2) {
  return async (input: T) => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await fn(input);
        const jsonFull = JSON.stringify({ success: true, data: result });
        const resultObj = result as Record<string, unknown> | null;
        if (resultObj && typeof resultObj === "object" && resultObj.fileBase64 && typeof resultObj.fileBase64 === "string") {
          const maxFileSize = 10 * 1024 * 1024;
          if (jsonFull.length > maxFileSize) {
            return JSON.stringify({ success: false, error: `Generated file is too large (${(jsonFull.length / 1024 / 1024).toFixed(1)}MB). Try generating a shorter/simpler document.` });
          }
          return jsonFull;
        }
        if (jsonFull.length <= MAX_TOOL_RESULT_LENGTH) return jsonFull;
        const note = `[Result truncated — original was ${jsonFull.length} chars. Use a more specific query.]`;
        const truncated = truncateToFit(result, MAX_TOOL_RESULT_LENGTH - 120);
        return JSON.stringify({ success: true, data: truncated, _note: note });
      } catch (error) {
        lastError = error;
        const isRetryable = isRetryableError(error);
        const isLastAttempt = attempt === maxRetries;
        if (!isRetryable || isLastAttempt) {
          const errMsg = error instanceof Error ? error.message : "Unknown error";
          const retryInfo = attempt > 0 ? ` (failed after ${attempt + 1} attempt${attempt > 0 ? "s" : ""})` : "";
          console.error(`[Tool] Error${retryInfo}: ${errMsg}`);
          return JSON.stringify({ success: false, error: `${errMsg}${retryInfo}` });
        }
        const delayMs = Math.min(1000 * Math.pow(2, attempt), 4000);
        console.warn(`[Tool] Retryable error (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delayMs}ms: ${error instanceof Error ? error.message : "Unknown"}`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    return JSON.stringify({ success: false, error: lastError instanceof Error ? lastError.message : "Unknown error after retries" });
  };
}

export function safeJson<T>(fn: (input: T) => Promise<unknown>) {
  return safeJsonWithRetry(fn, 2);
}

export function truncateToFit(value: unknown, maxLen: number, depth = 0): unknown {
  if (depth > 5) return `[Nested structure too deep to truncate]`;
  const json = JSON.stringify(value);
  if (json === undefined) return value;
  if (json.length <= maxLen) return value;
  if (Array.isArray(value)) {
    let arr = value;
    for (let i = 0; i < 20 && arr.length > 1; i++) {
      arr = arr.slice(0, Math.max(1, Math.ceil(arr.length / 2)));
      if (JSON.stringify(arr).length <= maxLen) return arr;
    }
    return `[Array of ${value.length} items — each item too large. Narrow your query.]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const shrunk: Record<string, unknown> = {};
    for (const [k, v] of entries) {
      shrunk[k] = Array.isArray(v) && v.length > 1 ? truncateToFit(v, maxLen, depth + 1) : v;
    }
    if (JSON.stringify(shrunk).length <= maxLen) return shrunk;
    for (let drop = entries.length - 1; drop >= 1; drop--) {
      const partial: Record<string, unknown> = {};
      for (let i = 0; i <= drop; i++) {
        const [k, v] = entries[i];
        partial[k] = shrunk[k] ?? v;
      }
      if (JSON.stringify(partial).length <= maxLen) return partial;
    }
    const [firstKey, firstVal] = entries[0];
    const singleKey: Record<string, unknown> = {};
    singleKey[firstKey] = truncateToFit(firstVal, maxLen - firstKey.length - 6, depth + 1);
    return singleKey;
  }
  const s = String(value);
  return s.length > maxLen ? s.slice(0, maxLen - 3) + "..." : s;
}

// ---------------------------------------------------------------------------
// Tool type
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolType = ReturnType<typeof tool<any, string>>;

// ---------------------------------------------------------------------------
// Tavily Search (configurable depth — basic vs advanced)
// ---------------------------------------------------------------------------
async function tavilySearch(query: string, numResults: number, mode: "basic" | "advanced" = "basic"): Promise<Array<Record<string, unknown>>> {
  const apiKey = nextTavilyKey();
  const body: Record<string, unknown> = {
    api_key: apiKey,
    query,
    max_results: mode === "advanced" ? Math.min(numResults, 10) : Math.min(numResults, 5),
    include_answer: mode === "advanced",
    include_raw_content: false,
  };
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
  if (mode === "advanced" && data.answer) {
    return [{ title: "AI-Generated Summary", url: "", snippet: data.answer, rank: 0, score: 1 }, ...results];
  }
  return results;
}

export { tavilySearch };
