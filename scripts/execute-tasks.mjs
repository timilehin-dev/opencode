#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Claw Task Executor — Standalone script for GitHub Actions
//
// Pulls pending tasks from Supabase (agent_tasks table),
// executes them via Vercel AI SDK generateText() with the assigned agent's
// model + tools, and writes results back to Supabase.
//
// This runs OUTSIDE Vercel — no 60-second timeout limit.
// GitHub Actions gives us up to 6 hours per job.
//
// Usage: SUPABASE_DB_URL="..." node scripts/execute-tasks.mjs
//   --tasks N     Max tasks per run (default: 5)
//   --timeout N   Per-task timeout in seconds (default: 300 = 5 min)
//   --max-steps N Max LLM steps per task (default: 25)
//   --dry-run     Don't execute, just show what would run
//
// Environment variables required:
//   SUPABASE_DB_URL          — PostgreSQL connection string
//   AIHUBMIX_API_KEY_1+      — At least one AIHubMix key (for "general" agent)
//   OLLAMA_CLOUD_KEY_1+      — At least one Ollama key (for specialist agents)
//   GOOGLE_CLIENT_ID          — Google OAuth client ID (for Gmail/Calendar tools)
//   GOOGLE_CLIENT_SECRET      — Google OAuth client secret
//   GOOGLE_REFRESH_TOKEN      — Google OAuth refresh token
//   TAVILY_API_KEY_1          — Tavily search API key (optional, for web_search)
//   OPENROUTER_API_KEY        — OpenRouter key (optional)
// ---------------------------------------------------------------------------

import pg from "pg";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, stepCountIs } from "ai";
import { z } from "zod";
import { tool, zodSchema } from "ai";

const { Pool } = pg;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MAX_TASKS_DEFAULT = parseInt(process.env.MAX_TASKS || "5", 10);
const DEFAULT_TIMEOUT_S = parseInt(process.env.DEFAULT_TIMEOUT || "300", 10);
const DEFAULT_MAX_STEPS = parseInt(process.env.DEFAULT_MAX_STEPS || "25", 10);

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let maxTasks = MAX_TASKS_DEFAULT;
let timeoutS = DEFAULT_TIMEOUT_S;
let maxSteps = DEFAULT_MAX_STEPS;
let dryRun = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--tasks" && args[i + 1]) { maxTasks = parseInt(args[i + 1], 10); i++; }
  if (args[i] === "--timeout" && args[i + 1]) { timeoutS = parseInt(args[i + 1], 10); i++; }
  if (args[i] === "--max-steps" && args[i + 1]) { maxSteps = parseInt(args[i + 1], 10); i++; }
  if (args[i] === "--dry-run") dryRun = true;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

if (!process.env.SUPABASE_DB_URL) {
  console.error("ERROR: SUPABASE_DB_URL environment variable is required.");
  process.exit(1);
}

console.log(`[Executor] Starting at ${new Date().toISOString()}`);
console.log(`[Executor] Config: maxTasks=${maxTasks}, timeout=${timeoutS}s, maxSteps=${maxSteps}, dryRun=${dryRun}`);

// ---------------------------------------------------------------------------
// Agent Definitions (inline — no Next.js dependency)
// ---------------------------------------------------------------------------

const AGENTS = {
  general: {
    id: "general",
    name: "Claw General",
    provider: "aihubmix",
    model: "coding-glm-5.1-free",
    tools: [
      "gmail_send", "gmail_fetch", "gmail_search", "gmail_labels",
      "gmail_create_label", "gmail_delete_label", "gmail_profile",
      "gmail_reply", "gmail_thread", "gmail_batch",
      "calendar_list", "calendar_events", "calendar_create",
      "calendar_delete", "calendar_freebusy",
      "drive_list", "drive_create_folder", "drive_create_file",
      "sheets_read", "sheets_values", "sheets_append", "sheets_update",
      "sheets_create", "sheets_add_sheet", "sheets_batch_get", "sheets_clear",
      "docs_list", "docs_read", "docs_create", "docs_append",
      "github_repo", "github_issues", "github_create_issue",
      "github_prs", "github_commits", "github_files",
      "github_read_file", "github_search", "github_branches",
      "github_update_issue", "github_create_pr",
      "github_pr_review", "github_pr_comment", "github_create_branch",
      "vercel_projects", "vercel_deployments", "vercel_domains",
      "vercel_deploy", "vercel_logs",
      "web_search", "web_reader",
      "vision_analyze", "vision_download_analyze", "image_generate",
      "tts_generate", "asr_transcribe", "video_generate",
      "code_execute", "weather_get",
      "design_generate", "design_edit", "design_variants",
      "data_calculate", "data_clean", "data_pivot",
      "research_deep", "research_synthesize",
      "research_save_brief", "research_save_data",
      "ops_health_check", "ops_deployment_status",
      "ops_github_activity", "ops_agent_stats",
      "create_pdf_report", "create_docx_document", "create_xlsx_spreadsheet",
      "gmail_send_attachment",
      "reminder_create", "reminder_list", "reminder_update", "reminder_delete", "reminder_complete",
      "todo_create", "todo_list", "todo_update", "todo_delete", "todo_stats",
      "contact_create", "contact_list", "contact_search", "contact_update", "contact_delete",
    ],
  },
  mail: {
    id: "mail",
    name: "Mail Agent",
    provider: "ollama",
    model: "gemma4:31b-cloud",
    tools: [
      "gmail_send", "gmail_fetch", "gmail_search", "gmail_labels",
      "gmail_create_label", "gmail_delete_label",
      "gmail_reply", "gmail_thread", "gmail_batch",
      "calendar_list", "calendar_events", "calendar_create", "calendar_freebusy",
      "web_search", "web_reader",
      "create_pdf_report", "create_docx_document", "create_xlsx_spreadsheet",
      "gmail_send_attachment",
      "reminder_create", "reminder_list", "reminder_update", "reminder_delete", "reminder_complete",
      "contact_create", "contact_list", "contact_search", "contact_update", "contact_delete",
      "todo_create", "todo_list", "todo_update",
      "weather_get", "code_execute",
      "query_agent",
    ],
  },
  code: {
    id: "code",
    name: "Code Agent",
    provider: "ollama",
    model: "gemma4:31b-cloud",
    tools: [
      "github_repo", "github_issues", "github_create_issue",
      "github_prs", "github_commits", "github_files",
      "github_read_file", "github_search", "github_branches",
      "github_update_issue", "github_create_pr",
      "github_pr_review", "github_pr_comment", "github_create_branch",
      "vercel_projects", "vercel_deployments", "vercel_domains",
      "vercel_deploy", "vercel_logs",
      "web_search", "web_reader",
      "create_pdf_report", "code_execute", "weather_get",
      "todo_create", "todo_list", "todo_update", "todo_delete", "todo_stats",
      "query_agent",
    ],
  },
  data: {
    id: "data",
    name: "Data Agent",
    provider: "ollama",
    model: "gemma4:31b-cloud",
    tools: [
      "drive_list", "drive_create_folder", "drive_create_file",
      "sheets_read", "sheets_values", "sheets_append", "sheets_update",
      "sheets_create", "sheets_add_sheet", "sheets_batch_get", "sheets_clear",
      "docs_list", "docs_read", "docs_create", "docs_append",
      "web_search", "web_reader",
      "data_calculate", "data_clean", "data_pivot",
      "vision_analyze", "vision_download_analyze", "image_generate",
      "create_pdf_report", "create_docx_document", "create_xlsx_spreadsheet",
      "code_execute", "weather_get",
      "todo_create", "todo_list", "todo_update", "todo_delete", "todo_stats",
      "contact_list", "contact_search",
      "query_agent",
    ],
  },
  creative: {
    id: "creative",
    name: "Creative Agent",
    provider: "ollama",
    model: "gemma4:31b-cloud",
    tools: [
      "docs_list", "docs_read", "docs_create", "docs_append",
      "drive_list", "drive_create_file",
      "sheets_read", "sheets_values", "sheets_append",
      "web_search", "web_reader",
      "image_generate", "design_generate", "design_edit", "design_variants",
      "vision_analyze", "vision_download_analyze",
      "create_pdf_report", "create_docx_document", "create_xlsx_spreadsheet",
      "todo_create", "todo_list", "todo_update",
      "reminder_create", "reminder_list",
      "weather_get", "code_execute",
      "query_agent",
    ],
  },
  research: {
    id: "research",
    name: "Research Agent",
    provider: "ollama",
    model: "gemma4:31b-cloud",
    tools: [
      "web_search", "web_reader",
      "research_deep", "research_synthesize",
      "research_save_brief", "research_save_data",
      "vision_analyze", "vision_download_analyze",
      "create_pdf_report", "create_docx_document", "create_xlsx_spreadsheet",
      "contact_list", "contact_search", "todo_list",
      "weather_get", "code_execute",
      "query_agent",
    ],
  },
  ops: {
    id: "ops",
    name: "Ops Agent",
    provider: "ollama",
    model: "gemma4:31b-cloud",
    tools: [
      "web_search", "web_reader",
      "ops_health_check", "ops_deployment_status",
      "ops_github_activity", "ops_agent_stats",
      "create_pdf_report", "code_execute", "weather_get",
      "query_agent",
    ],
  },
};

// ---------------------------------------------------------------------------
// Provider Setup
// ---------------------------------------------------------------------------

function getAIHubMixKeys() {
  return [
    process.env.AIHUBMIX_API_KEY_1,
    process.env.AIHUBMIX_API_KEY_2,
    process.env.AIHUBMIX_API_KEY_3,
    process.env.AIHUBMIX_API_KEY_4,
    process.env.AIHUBMIX_API_KEY_5,
  ].filter(Boolean);
}

function getOllamaKeys() {
  return [
    process.env.OLLAMA_CLOUD_KEY_1,
    process.env.OLLAMA_CLOUD_KEY_2,
    process.env.OLLAMA_CLOUD_KEY_3,
    process.env.OLLAMA_CLOUD_KEY_4,
    process.env.OLLAMA_CLOUD_KEY_5,
    process.env.OLLAMA_CLOUD_KEY_6,
  ].filter(Boolean);
}

let _aiKeyIdx = 0;
let _ollamaKeyIdx = 0;

function nextAIHubMixKey() {
  const keys = getAIHubMixKeys();
  if (keys.length === 0) throw new Error("No AIHUBMIX_API_KEY configured.");
  return keys[_aiKeyIdx++ % keys.length];
}

function nextOllamaKey() {
  const keys = getOllamaKeys();
  if (keys.length === 0) throw new Error("No OLLAMA_CLOUD_KEY configured.");
  return keys[_ollamaKeyIdx++ % keys.length];
}

function getProvider(agent) {
  if (agent.provider === "aihubmix") {
    const provider = createOpenAI({
      apiKey: nextAIHubMixKey(),
      baseURL: process.env.AIHUBMIX_BASE_URL || "https://aihubmix.com/v1",
    });
    return provider.chat(agent.model);
  } else if (agent.provider === "ollama") {
    const provider = createOpenAI({
      apiKey: nextOllamaKey(),
      baseURL: process.env.OLLAMA_BASE_URL || "https://ollama.com/v1",
    });
    return provider.chat(agent.model);
  } else if (agent.provider === "openrouter" && process.env.OPENROUTER_API_KEY) {
    const provider = createOpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    });
    return provider.chat(agent.model);
  }
  throw new Error(`Unknown provider: ${agent.provider}`);
}

// ---------------------------------------------------------------------------
// Google OAuth Token Helper
// ---------------------------------------------------------------------------

let _cachedGoogleToken = null;
let _tokenExpiresAt = 0;

async function getGoogleAccessToken() {
  if (_cachedGoogleToken && Date.now() < _tokenExpiresAt) {
    return _cachedGoogleToken;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google OAuth credentials not configured (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN).");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `client_id=${clientId}&client_secret=${clientSecret}&refresh_token=${refreshToken}&grant_type=refresh_token`,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google OAuth refresh failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  _cachedGoogleToken = data.access_token;
  _tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000; // 60s buffer
  return _cachedGoogleToken;
}

// ---------------------------------------------------------------------------
// Helper: safe JSON parse
// ---------------------------------------------------------------------------

async function safeParseRes(res) {
  const text = await res.text().catch(() => "");
  if (!text || text.trim().length === 0) {
    throw new Error(`Empty response body (status ${res.status})`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON response (${res.status}): ${text.slice(0, 200)}${text.length > 200 ? "..." : ""}`);
  }
}

const MAX_TOOL_RESULT = 8000;

function safeJsonWrap(fn) {
  return async (input) => {
    try {
      const result = await fn(input);
      const jsonFull = JSON.stringify({ success: true, data: result });

      if (jsonFull.length <= MAX_TOOL_RESULT) return jsonFull;

      return JSON.stringify({
        success: true,
        data: JSON.stringify(result).slice(0, MAX_TOOL_RESULT),
        _note: `[Result truncated — original was ${jsonFull.length} chars]`,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      console.error(`[Tool Error] ${errMsg}`);
      return JSON.stringify({ success: false, error: errMsg });
    }
  };
}

// ---------------------------------------------------------------------------
// Tool Definitions (inline — minimal set needed for automation tasks)
//
// Only tools that automation tasks commonly use are included here.
// Full tool set lives in src/lib/tools.ts (used by the Vercel chat route).
// ---------------------------------------------------------------------------

// --- Tavily Search ---
function getTavilyKeys() {
  return [process.env.TAVILY_API_KEY_1, process.env.TAVILY_API_KEY_2, process.env.TAVILY_API_KEY_3].filter(Boolean);
}

let _tavilyIdx = 0;
function nextTavilyKey() {
  const keys = getTavilyKeys();
  if (keys.length === 0) throw new Error("No TAVILY_API_KEY configured.");
  return keys[_tavilyIdx++ % keys.length];
}

async function tavilySearch(query, numResults) {
  const apiKey = nextTavilyKey();
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, query, max_results: numResults, include_answer: false }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Tavily API error: ${res.status}`);
  const data = await safeParseRes(res);
  return (data.results || []).map((r, i) => ({ title: r.title, url: r.url, snippet: r.content, rank: i + 1 }));
}

async function webSearchFallback(query, numResults = 10) {
  if (getTavilyKeys().length > 0) {
    try {
      const results = await tavilySearch(query, numResults);
      if (results.length > 0) return results;
    } catch { /* Tavily failed */ }
  }
  // DuckDuckGo fallback
  try {
    const res = await fetch("https://html.duckduckgo.com/html/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0" },
      body: `q=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const html = await res.text();
      const results = [];
      const regex = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
      let match;
      while ((match = regex.exec(html)) !== null && results.length < numResults) {
        results.push({
          title: match[2].replace(/<[^>]*>/g, "").trim(),
          url: match[1],
          snippet: match[3].replace(/<[^>]*>/g, "").trim(),
          rank: results.length + 1,
        });
      }
      if (results.length > 0) return results;
    }
  } catch { /* DDG failed */ }
  return [];
}

// --- Web Reader ---
async function readWebPage(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ClawBot/1.0)" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Failed to fetch URL (${res.status})`);
  const html = await res.text();
  // Extract text content (simple approach)
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 15000);
  return {
    url,
    title: (html.match(/<title[^>]*>(.*?)<\/title>/i) || [])[1] || url,
    content: text,
    contentLength: text.length,
  };
}

// --- Gmail Tools ---
async function gmailFetch({ query, maxResults }) {
  const token = await getGoogleAccessToken();
  const params = new URLSearchParams({ maxResults: String(maxResults || 10) });
  if (query) params.set("q", query);
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Gmail API error: ${res.status}`);
  const data = await safeParseRes(res);
  const messages = [];
  for (const msg of (data.messages || []).slice(0, maxResults || 10)) {
    try {
      const detail = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From,Subject,Date`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await safeParseRes(detail);
      const headers = {};
      for (const h of (d.payload?.headers || [])) headers[h.name] = h.value;
      messages.push({
        id: msg.id,
        threadId: msg.threadId,
        from: headers.From || "",
        subject: headers.Subject || "(No subject)",
        date: headers.Date || "",
        snippet: d.snippet || "",
        labelIds: d.labelIds || [],
      });
    } catch { /* skip individual message errors */ }
  }
  return { messages, count: messages.length };
}

/**
 * Sanitize and wrap HTML content in a professional email template.
 * Fixes common LLM HTML mistakes (double brackets, broken tags, etc.)
 * and wraps everything in a styled container that renders well in all email clients.
 */
function wrapHtmlEmail(body, subject) {
  // Fix common LLM-generated HTML mistakes
  let html = body
    // Fix double brackets: <<pp> -> <p>, <<hh3> -> <h3>, etc.
    .replace(/<<([a-zA-Z][a-zA-Z0-9]*)/g, "<$1")
    .replace(/<\/([a-zA-Z][a-zA-Z0-9]*)>>/g, "</$1>")
    // Fix <<div, <<span, <<table, <<tr, <<td, <<ul, <<ol, <<li, <<a, <<strong, <<em, <<br
    .replace(/<([a-zA-Z][a-zA-Z0-9]*)([^>]*)><([a-zA-Z])/g, "<$1$2><$3")
    // Strip any remaining truly broken tags that start with <<
    .replace(/<</g, "<");

  // If the body doesn't look like HTML, convert simple text to HTML
  const htmlTagCount = (html.match(/<[a-zA-Z][a-zA-Z0-9]*[^>]*>/g) || []).length;
  if (htmlTagCount < 2) {
    // Treat as plain text and convert to HTML paragraphs
    const paragraphs = html.split("\n").filter(l => l.trim()).map(p => `<p style="margin:8px 0;">${p.trim()}</p>`);
    html = paragraphs.join("");
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);overflow:hidden;max-width:600px;width:100%;">
          ${subject ? `
          <tr>
            <td style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:28px 32px;color:#ffffff;">
              <h1 style="margin:0;font-size:20px;font-weight:700;color:#ffffff;line-height:1.3;">${subject.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</h1>
            </td>
          </tr>` : ""}
          <tr>
            <td style="padding:28px 32px;color:#333333;font-size:15px;line-height:1.65;">
              ${html}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #e8e8ee;text-align:center;">
              <p style="margin:0;font-size:12px;color:#999999;">This email was sent by your OpenClaw Mail Agent.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function gmailSend({ to, subject, body, isHtml }) {
  const token = await getGoogleAccessToken();
  const sanitize = (s) => s.replace(/[\r\n]/g, "");

  // Determine if body is HTML: explicit flag or detect HTML tags
  const hasHtml = isHtml || /<[a-zA-Z][a-zA-Z0-9]*(\s[^>]*)?>/i.test(body);
  const emailBody = hasHtml ? wrapHtmlEmail(body, subject) : body;
  const contentType = hasHtml ? "text/html; charset=utf-8" : "text/plain; charset=utf-8";

  let message = `To: ${sanitize(to)}\r\n`;
  if (subject) message += `Subject: ${sanitize(subject)}\r\n`;
  message += `Content-Type: ${contentType}\r\n`;
  message += "MIME-Version: 1.0\r\n";
  message += "\r\n";
  message += emailBody;

  const raw = Buffer.from(message).toString("base64url");
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) throw new Error(`Gmail send error: ${res.status}`);
  return await safeParseRes(res);
}

async function gmailSearch({ query, maxResults }) {
  return gmailFetch({ query, maxResults: maxResults || 20 });
}

async function gmailLabels() {
  const token = await getGoogleAccessToken();
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail labels error: ${res.status}`);
  return await safeParseRes(res);
}

async function gmailProfile() {
  const token = await getGoogleAccessToken();
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail profile error: ${res.status}`);
  return await safeParseRes(res);
}

// --- Calendar Tools ---
async function calendarList() {
  const token = await getGoogleAccessToken();
  const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Calendar list error: ${res.status}`);
  return await safeParseRes(res);
}

async function calendarEvents(calendarId, timeMin, timeMax, maxResults) {
  const token = await getGoogleAccessToken();
  const params = new URLSearchParams({
    maxResults: String(maxResults || 25),
    singleEvents: "true",
    orderBy: "startTime",
  });
  if (timeMin) params.set("timeMin", timeMin);
  if (timeMax) params.set("timeMax", timeMax);
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId || "primary"}/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Calendar events error: ${res.status}`);
  return await safeParseRes(res);
}

async function calendarCreate(calendarId, event) {
  const token = await getGoogleAccessToken();
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId || "primary"}/events`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(event),
    },
  );
  if (!res.ok) throw new Error(`Calendar create error: ${res.status}`);
  return await safeParseRes(res);
}

// --- Drive Tools ---
async function driveList({ query, pageSize }) {
  const token = await getGoogleAccessToken();
  const params = new URLSearchParams({ pageSize: String(pageSize || 50), fields: "files(id,name,mimeType,modifiedTime,size)" });
  if (query) params.set("q", query);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive list error: ${res.status}`);
  return await safeParseRes(res);
}

// --- GitHub Tools ---
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const GITHUB_REPO = process.env.GITHUB_REPO || "";

async function githubFetch(path) {
  const headers = { "Accept": "application/vnd.github.v3+json" };
  if (GITHUB_TOKEN) headers["Authorization"] = `token ${GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`GitHub API error (${res.status}): ${path}`);
  return safeParseRes(res);
}

// --- Vercel Tools ---
const VERCEL_TOKEN = process.env.VERCEL_TOKEN || "";

async function vercelFetch(path) {
  const headers = { "Authorization": `Bearer ${VERCEL_TOKEN}` };
  const res = await fetch(`https://api.vercel.com${path}`, { headers });
  if (!res.ok) throw new Error(`Vercel API error (${res.status}): ${path}`);
  return safeParseRes(res);
}

// --- Build tool map ---
function buildToolMap() {
  return {
    // Gmail
    gmail_send: tool({
      description: "Send an email via Gmail. Supports both plain text and HTML bodies. When isHtml is true or the body contains HTML tags, it will be wrapped in a professional styled email template. You can use standard HTML tags like <h3>, <p>, <ul>, <li>, <strong>, <em>, <span style=...> etc.",
      inputSchema: zodSchema(z.object({
        to: z.string(), subject: z.string().optional(), body: z.string(), isHtml: z.boolean().optional(),
      })),
      execute: safeJsonWrap(({ to, subject, body, isHtml }) => gmailSend({ to, subject, body, isHtml })),
    }),
    gmail_fetch: tool({
      description: "Fetch emails from Gmail inbox.",
      inputSchema: zodSchema(z.object({
        query: z.string().optional(), maxResults: z.number().optional(), labelIds: z.array(z.string()).optional(),
      })),
      execute: safeJsonWrap(({ query, maxResults, labelIds }) => gmailFetch({ query, maxResults, labelIds })),
    }),
    gmail_search: tool({
      description: "Search Gmail messages.",
      inputSchema: zodSchema(z.object({ query: z.string(), maxResults: z.number().optional() })),
      execute: safeJsonWrap(({ query, maxResults }) => gmailSearch({ query, maxResults })),
    }),
    gmail_labels: tool({
      description: "List all Gmail labels.",
      inputSchema: zodSchema(z.object({})),
      execute: safeJsonWrap(() => gmailLabels()),
    }),
    gmail_profile: tool({
      description: "Get Gmail profile.",
      inputSchema: zodSchema(z.object({})),
      execute: safeJsonWrap(() => gmailProfile()),
    }),
    gmail_reply: tool({
      description: "Reply to an email thread.",
      inputSchema: zodSchema(z.object({ threadId: z.string(), body: z.string() })),
      execute: safeJsonWrap(async ({ threadId, body }) => {
        const token = await getGoogleAccessToken();
        const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${threadId}/reply`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ raw: Buffer.from(`\n${body}`).toString("base64") }),
        });
        return safeParseRes(res);
      }),
    }),
    gmail_thread: tool({
      description: "Get a full email thread by thread ID.",
      inputSchema: zodSchema(z.object({ threadId: z.string() })),
      execute: safeJsonWrap(async ({ threadId }) => {
        const token = await getGoogleAccessToken();
        const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return safeParseRes(res);
      }),
    }),
    gmail_batch: tool({
      description: "Batch fetch multiple emails by IDs.",
      inputSchema: zodSchema(z.object({ messageIds: z.array(z.string()) })),
      execute: safeJsonWrap(async ({ messageIds }) => {
        const token = await getGoogleAccessToken();
        const results = [];
        for (const id of messageIds.slice(0, 10)) {
          try {
            const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From,Subject,Date`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            results.push(await safeParseRes(res));
          } catch (e) { results.push({ error: e.message }); }
        }
        return results;
      }),
    }),
    gmail_create_label: tool({
      description: "Create a Gmail label.",
      inputSchema: zodSchema(z.object({ name: z.string() })),
      execute: safeJsonWrap(async ({ name }) => {
        const token = await getGoogleAccessToken();
        const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ name, labelListVisibility: "labelShow", messageListVisibility: "show" }),
        });
        return safeParseRes(res);
      }),
    }),
    gmail_delete_label: tool({
      description: "Delete a Gmail label.",
      inputSchema: zodSchema(z.object({ labelId: z.string() })),
      execute: safeJsonWrap(async ({ labelId }) => {
        const token = await getGoogleAccessToken();
        await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/labels/${labelId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        return { deleted: true, labelId };
      }),
    }),
    gmail_send_attachment: tool({
      description: "Send an email with a file attachment. Supports both plain text and HTML bodies.",
      inputSchema: zodSchema(z.object({
        to: z.string(), subject: z.string(), body: z.string(),
        fileName: z.string(), fileBase64: z.string(), mimeType: z.string(),
        isHtml: z.boolean().optional(),
      })),
      execute: safeJsonWrap(async ({ to, subject, body, fileName, fileBase64, mimeType, isHtml }) => {
        const boundary = "boundary_" + Date.now();
        const sanitize = (s) => s.replace(/[\r\n]/g, "");
        const hasHtml = isHtml || /<[a-zA-Z][a-zA-Z0-9]*(\s[^>]*)?>/i.test(body);
        const emailBody = hasHtml ? wrapHtmlEmail(body, subject) : (body || "");
        const bodyContentType = hasHtml ? "text/html; charset=utf-8" : "text/plain; charset=utf-8";
        const email = [
          `To: ${sanitize(to)}`,
          `Subject: ${sanitize(subject || "")}`,
          `Content-Type: multipart/mixed; boundary="${boundary}"`,
          "MIME-Version: 1.0",
          "",
          `--${boundary}`,
          `Content-Type: ${bodyContentType}`,
          "",
          emailBody,
          `--${boundary}`,
          `Content-Type: ${mimeType}; name="${fileName}"`,
          "Content-Transfer-Encoding: base64",
          `Content-Disposition: attachment; filename="${fileName}"`,
          "",
          fileBase64,
          `--${boundary}--`,
        ].join("\r\n");
        const token = await getGoogleAccessToken();
        const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ raw: Buffer.from(email).toString("base64url") }),
        });
        return safeParseRes(res);
      }),
    }),

    // Calendar
    calendar_list: tool({
      description: "List all Google Calendars.",
      inputSchema: zodSchema(z.object({})),
      execute: safeJsonWrap(() => calendarList()),
    }),
    calendar_events: tool({
      description: "List events from a Google Calendar.",
      inputSchema: zodSchema(z.object({
        calendarId: z.string().optional(), timeMin: z.string().optional(),
        timeMax: z.string().optional(), maxResults: z.number().optional(),
      })),
      execute: safeJsonWrap(({ calendarId, timeMin, timeMax, maxResults }) =>
        calendarEvents(calendarId, timeMin, timeMax, maxResults)),
    }),
    calendar_create: tool({
      description: "Create a Google Calendar event.",
      inputSchema: zodSchema(z.object({
        summary: z.string().optional(), calendarId: z.string().optional(),
        start: z.string(), end: z.string(), location: z.string().optional(),
        description: z.string().optional(), attendees: z.array(z.object({ email: z.string() })).optional(),
        addMeetLink: z.boolean().optional(),
      })),
      execute: safeJsonWrap(({ summary, calendarId, start, end, location, description, attendees, addMeetLink }) => {
        const isDateTime = start.includes("T");
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return calendarCreate(calendarId || "primary", {
          summary,
          start: isDateTime ? { dateTime: start, timeZone: tz } : { date: start },
          end: isDateTime ? { dateTime: end, timeZone: tz } : { date: end },
          location, description, attendees,
          conferenceData: addMeetLink ? { createRequest: { requestId: `claw-meet-${Date.now()}` } } : undefined,
        });
      }),
    }),
    calendar_delete: tool({
      description: "Delete a Google Calendar event.",
      inputSchema: zodSchema(z.object({ calendarId: z.string().optional(), eventId: z.string() })),
      execute: safeJsonWrap(async ({ calendarId, eventId }) => {
        const token = await getGoogleAccessToken();
        await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId || "primary"}/events/${eventId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        return { deleted: true, eventId };
      }),
    }),
    calendar_freebusy: tool({
      description: "Check calendar availability.",
      inputSchema: zodSchema(z.object({
        timeMin: z.string(), timeMax: z.string(),
        items: z.array(z.object({ id: z.string() })).optional(),
      })),
      execute: safeJsonWrap(async ({ timeMin, timeMax, items }) => {
        const token = await getGoogleAccessToken();
        const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ timeMin, timeMax, items: items || [{ id: "primary" }] }),
        });
        return safeParseRes(res);
      }),
    }),

    // Drive
    drive_list: tool({
      description: "List Google Drive files.",
      inputSchema: zodSchema(z.object({ query: z.string().optional(), pageSize: z.number().optional() })),
      execute: safeJsonWrap(({ query, pageSize }) => driveList({ query, pageSize })),
    }),
    drive_create_folder: tool({
      description: "Create a folder in Google Drive.",
      inputSchema: zodSchema(z.object({ name: z.string(), parents: z.array(z.string()).optional() })),
      execute: safeJsonWrap(async ({ name, parents }) => {
        const token = await getGoogleAccessToken();
        const res = await fetch("https://www.googleapis.com/drive/v3/files", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents }),
        });
        return safeParseRes(res);
      }),
    }),
    drive_create_file: tool({
      description: "Create a file in Google Drive.",
      inputSchema: zodSchema(z.object({ name: z.string(), mimeType: z.string().optional(), parents: z.array(z.string()).optional() })),
      execute: safeJsonWrap(async ({ name, mimeType, parents }) => {
        const token = await getGoogleAccessToken();
        const res = await fetch("https://www.googleapis.com/drive/v3/files", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ name, mimeType: mimeType || "application/vnd.google-apps.document", parents }),
        });
        return safeParseRes(res);
      }),
    }),

    // Web
    web_search: tool({
      description: "Search the web for real-time information.",
      inputSchema: zodSchema(z.object({ query: z.string(), numResults: z.number().optional() })),
      execute: safeJsonWrap(({ query, numResults }) => webSearchFallback(query, numResults)),
    }),
    web_reader: tool({
      description: "Read and extract content from a web page URL.",
      inputSchema: zodSchema(z.object({ url: z.string() })),
      execute: safeJsonWrap(({ url }) => readWebPage(url)),
    }),

    // GitHub (only if repo/token configured)
    ...(GITHUB_REPO ? {
      github_repo: tool({
        description: "Get GitHub repository info.",
        inputSchema: zodSchema(z.object({})),
        execute: safeJsonWrap(() => githubFetch(`/repos/${GITHUB_REPO}`)),
      }),
      github_issues: tool({
        description: "List GitHub issues.",
        inputSchema: zodSchema(z.object({ state: z.enum(["open", "closed", "all"]).optional(), page: z.number().optional() })),
        execute: safeJsonWrap(({ state, page }) => githubFetch(`/repos/${GITHUB_REPO}/issues?state=${state || "open"}&page=${page || 1}`)),
      }),
      github_commits: tool({
        description: "List recent GitHub commits.",
        inputSchema: zodSchema(z.object({ page: z.number().optional() })),
        execute: safeJsonWrap(({ page }) => githubFetch(`/repos/${GITHUB_REPO}/commits?page=${page || 1}`)),
      }),
      github_prs: tool({
        description: "List GitHub pull requests.",
        inputSchema: zodSchema(z.object({ state: z.enum(["open", "closed", "all"]).optional() })),
        execute: safeJsonWrap(({ state }) => githubFetch(`/repos/${GITHUB_REPO}/pulls?state=${state || "open"}`)),
      }),
      github_files: tool({
        description: "Get repository file tree.",
        inputSchema: zodSchema(z.object({ path: z.string().optional() })),
        execute: safeJsonWrap(({ path }) => githubFetch(`/repos/${GITHUB_REPO}/git/trees/${path || "main"}?recursive=1`)),
      }),
      github_search: tool({
        description: "Search code in the repository.",
        inputSchema: zodSchema(z.object({ query: z.string() })),
        execute: safeJsonWrap(({ query }) => githubFetch(`/search/code?q=${encodeURIComponent(query)}+repo:${GITHUB_REPO}`)),
      }),
      github_branches: tool({
        description: "List repository branches.",
        inputSchema: zodSchema(z.object({})),
        execute: safeJsonWrap(() => githubFetch(`/repos/${GITHUB_REPO}/branches`)),
      }),
    } : {}),

    // Vercel (only if token configured)
    ...(VERCEL_TOKEN ? {
      vercel_projects: tool({
        description: "List Vercel projects.",
        inputSchema: zodSchema(z.object({ limit: z.number().optional() })),
        execute: safeJsonWrap(({ limit }) => vercelFetch(`/v2/projects?limit=${limit || 20}`)),
      }),
      vercel_deployments: tool({
        description: "List Vercel deployments.",
        inputSchema: zodSchema(z.object({ projectIdOrName: z.string(), limit: z.number().optional() })),
        execute: safeJsonWrap(({ projectIdOrName, limit }) => vercelFetch(`/v2/projects/${projectIdOrName}/deployments?limit=${limit || 20}`)),
      }),
    } : {}),

    // Code execution (simple eval — no sandbox available in GH Actions)
    code_execute: tool({
      description: "Execute a code snippet and return the result. Supports JavaScript only in this environment.",
      inputSchema: zodSchema(z.object({ code: z.string(), language: z.string().optional() })),
      execute: safeJsonWrap(({ code, language }) => {
        if (language && language !== "javascript" && language !== "js") {
          return { error: `Language '${language}' not supported. Only JavaScript is available in this environment.` };
        }
        try {
          // Very limited eval — no fs, no network, just math/logic
          const result = new Function("return " + code)();
          return { output: String(result) };
        } catch (e) {
          return { error: e.message };
        }
      }),
    }),

    // Weather
    weather_get: tool({
      description: "Get weather for a city.",
      inputSchema: zodSchema(z.object({ city: z.string() })),
      execute: safeJsonWrap(async ({ city }) => {
        const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) throw new Error(`Weather API error: ${res.status}`);
        const data = await safeParseRes(res);
        return {
          location: data.nearest_area?.[0]?.areaName?.[0]?.value || city,
          temperature: data.current_condition?.[0]?.temp_C + "C",
          condition: data.current_condition?.[0]?.weatherDesc?.[0]?.value,
          humidity: data.current_condition?.[0]?.humidity,
          wind: data.current_condition?.[0]?.windspeedKmph + " km/h",
        };
      }),
    }),

    // Placeholder stubs for tools that need full implementations
    // These return "not available in this environment" messages gracefully
    create_pdf_report: tool({
      description: "Create a PDF report (stub — not available in GitHub Actions environment).",
      inputSchema: zodSchema(z.object({ title: z.string(), content: z.string() })),
      execute: () => JSON.stringify({ success: false, error: "PDF generation not available in GitHub Actions. Use Vercel chat for this." }),
    }),
    create_docx_document: tool({
      description: "Create a DOCX document (stub).",
      inputSchema: zodSchema(z.object({ title: z.string(), content: z.string() })),
      execute: () => JSON.stringify({ success: false, error: "DOCX generation not available in GitHub Actions." }),
    }),
    create_xlsx_spreadsheet: tool({
      description: "Create an XLSX spreadsheet (stub).",
      inputSchema: zodSchema(z.object({ title: z.string(), data: z.any() })),
      execute: () => JSON.stringify({ success: false, error: "XLSX generation not available in GitHub Actions." }),
    }),
    query_agent: tool({
      description: "Route a task to another agent. Note: cross-agent delegation is not available in background task execution. Handle the task with your own tools.",
      inputSchema: zodSchema(z.object({ agent_id: z.string(), task: z.string() })),
      execute: () => JSON.stringify({ success: false, error: "Cross-agent delegation is not available in background execution mode. Use your own tools directly." }),
    }),
  };
}

// ---------------------------------------------------------------------------
// Database Helpers
// ---------------------------------------------------------------------------

const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL, max: 3, idleTimeoutMillis: 30000 });

async function getAnyPendingTask() {
  const result = await pool.query(
    `SELECT * FROM agent_tasks WHERE status = 'pending'
     ORDER BY CASE priority
       WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 2
     END, created_at ASC LIMIT 1`,
  );
  return result.rows[0] || null;
}

async function startTask(taskId) {
  await pool.query(`UPDATE agent_tasks SET status = 'running', started_at = NOW() WHERE id = $1`, [taskId]);
}

async function completeTask(taskId, result, toolCalls) {
  await pool.query(
    `UPDATE agent_tasks SET status = 'completed', result = $1, tool_calls = $2, completed_at = NOW() WHERE id = $3`,
    [result.slice(0, 10000), JSON.stringify(toolCalls || []), taskId],
  );
}

async function failTask(taskId, error) {
  await pool.query(
    `UPDATE agent_tasks SET status = 'failed', error = $1, completed_at = NOW() WHERE id = $2`,
    [error.slice(0, 5000), taskId],
  );
}

async function writeAutomationLog(automationId, status, resultData, durationMs, errorMsg) {
  if (!automationId) return;
  try {
    await pool.query(
      `INSERT INTO automation_logs (automation_id, status, result, duration_ms, error_message)
       VALUES ($1, $2, $3, $4, $5)`,
      [automationId, status, JSON.stringify(resultData), durationMs, errorMsg || null],
    );
  } catch (e) {
    console.error(`[Log] Failed to write automation log:`, e.message);
  }
}

async function logActivity(agentId, agentName, action, detail, metadata) {
  try {
    await pool.query(
      `INSERT INTO agent_activity (agent_id, agent_name, action, detail, tool_name, metadata)
       VALUES ($1, $2, $3, $4, NULL, $5)`,
      [agentId, agentName || null, action, detail, JSON.stringify(metadata || {})],
    );
  } catch { /* non-critical */ }
}

async function persistAgentStatus(agentId, update) {
  try {
    await pool.query(
      `INSERT INTO agent_status (agent_id, status, current_task, last_activity, tasks_completed, messages_processed, updated_at)
       VALUES ($1, $2, $3, $4, $5, 0, NOW())
       ON CONFLICT (agent_id) DO UPDATE SET
         status = EXCLUDED.status, current_task = EXCLUDED.current_task,
         last_activity = EXCLUDED.last_activity,
         tasks_completed = agent_status.tasks_completed + EXCLUDED.tasks_completed,
         updated_at = NOW()`,
      [agentId, update.status || "idle", update.currentTask || null, update.lastActivity || null, update.tasksCompleted || 0],
    );
  } catch { /* non-critical */ }
}

// ---------------------------------------------------------------------------
// Evaluate Automations (inline — same logic as automation-engine.ts)
// ---------------------------------------------------------------------------

async function evaluateAutomations() {
  const result = { triggered: 0, tasksCreated: 0, errors: [] };

  try {
    const autoResult = await pool.query(
      `SELECT id, name, description, trigger_type, trigger_config, action_type, action_config, agent_id, enabled, last_run_at
       FROM automations WHERE enabled = true`,
    );

    for (const automation of autoResult.rows) {
      try {
        if (automation.trigger_type !== "schedule") continue;

        const config = automation.trigger_config || {};
        const cronExpr = config.cron || config.schedule;
        if (!cronExpr) continue;

        // Check cooldown (55s)
        if (automation.last_run_at) {
          const diff = Date.now() - new Date(automation.last_run_at).getTime();
          if (diff < 55_000) continue;
        }

        // Simple cron matching (minute, hour, day, month, weekday)
        const now = new Date();
        const parts = cronExpr.trim().split(/\s+/);
        if (parts.length < 5) continue;

        const fields = [
          { value: now.getMinutes(), expr: parts[0] },
          { value: now.getHours(), expr: parts[1] },
          { value: now.getDate(), expr: parts[2] },
          { value: now.getMonth() + 1, expr: parts[3] },
          { value: now.getDay(), expr: parts[4] },
        ];

        const shouldFire = fields.every(({ value, expr }) => {
          if (expr === "*") return true;
          for (const part of expr.split(",")) {
            const trimmed = part.trim();
            if (!isNaN(parseInt(trimmed)) && value === parseInt(trimmed)) return true;
            const stepMatch = trimmed.match(/^\*\/(\d+)$/);
            if (stepMatch && value % parseInt(stepMatch[1]) === 0) return true;
          }
          return false;
        });

        if (!shouldFire) continue;

        // Trigger — create task
        const actionConfig = automation.action_config || {};
        const agentId = actionConfig.agent_id || automation.agent_id || "general";
        const taskDesc = actionConfig.task || automation.description || automation.name;

        const taskResult = await pool.query(
          `INSERT INTO agent_tasks (agent_id, task, context, trigger_type, trigger_source, priority)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [agentId, taskDesc, `Triggered by automation: ${automation.name}`, "automation", `automation:${automation.id}`, "medium"],
        );

        if (taskResult.rows[0]?.id) {
          await pool.query(
            `UPDATE automations SET last_run_at = NOW(), last_status = 'success', run_count = run_count + 1 WHERE id = $1`,
            [automation.id],
          );
          result.triggered++;
          result.tasksCreated++;
          console.log(`[Automation] Triggered "${automation.name}" (#${automation.id}) -> task #${taskResult.rows[0].id}`);
        }
      } catch (e) {
        result.errors.push(`Automation #${automation.id}: ${e.message}`);
      }
    }
  } catch (e) {
    result.errors.push(`Failed to evaluate automations: ${e.message}`);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Task Execution
// ---------------------------------------------------------------------------

async function executeTask(task) {
  const startTime = Date.now();
  const agentDef = AGENTS[task.agent_id];

  if (!agentDef) {
    return { success: false, text: "", error: `Unknown agent: ${task.agent_id}`, durationMs: Date.now() - startTime };
  }

  console.log(`[Task #${task.id}] Agent: ${agentDef.name} | Task: ${task.task.slice(0, 100)}...`);

  try {
    const model = getProvider(agentDef);

    // Build tool subset for this agent
    const allTools = buildToolMap();
    const agentTools = {};
    for (const toolId of agentDef.tools) {
      if (allTools[toolId]) agentTools[toolId] = allTools[toolId];
    }

    // Build datetime context in Africa/Lagos timezone
    const now = new Date();
    const lagosTime = now.toLocaleString("en-US", { timeZone: "Africa/Lagos", weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
    const lagosDate = now.toLocaleDateString("en-US", { timeZone: "Africa/Lagos", weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const lagosTimeShort = now.toLocaleTimeString("en-US", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", hour12: true });
    const lagosDayName = now.toLocaleDateString("en-US", { timeZone: "Africa/Lagos", weekday: "long" });

    const dateTimeBlock = `[CURRENT DATE/TIME — ALWAYS use this as "now" for ALL time references]
- Lagos (WAT, UTC+1): ${lagosTime}
- Date: ${lagosDate}
- Time: ${lagosTimeShort}
- Day: ${lagosDayName}
- UTC: ${now.toISOString()}
- Unix timestamp: ${Math.floor(now.getTime() / 1000)}

CRITICAL: You are in Nigeria, timezone Africa/Lagos (WAT, UTC+1). When you reference "today", "yesterday", "tomorrow", or any date in email subject lines, headers, or content, you MUST use the date from above. NEVER guess or hallucinate dates — always derive them from this current time. For example, if today is April 20, 2026, a "Daily Inbox Summary" should say "April 20, 2026", NOT any other date.`;

    const systemPrompt = `${dateTimeBlock}\n\nYou are ${agentDef.name}, an AI agent executing a background automation task. Complete the task fully and provide a concise summary of what you did and the results. You are running autonomously — no user interaction is possible.`;

    console.log(`[Task #${task.id}] Executing with ${Object.keys(agentTools).length} tools, timeout=${timeoutS}s, maxSteps=${maxSteps}`);

    const result = await generateText({
      model,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `${task.task}\n\n${task.context ? `Context: ${task.context}` : ""}`,
        },
      ],
      tools: agentTools,
      maxOutputTokens: 8192,
      stopWhen: stepCountIs(maxSteps),
      abortSignal: AbortSignal.timeout(timeoutS * 1000),
    });

    const durationMs = Date.now() - startTime;
    const toolCalls = result.steps
      .flatMap((step) => step.toolCalls || [])
      .map((tc) => ({ name: tc.toolName, args: tc.args }));

    console.log(`[Task #${task.id}] SUCCESS in ${durationMs}ms | ${toolCalls.length} tool calls | Output: ${(result.text || "").slice(0, 100)}...`);

    return {
      success: true,
      text: result.text || "(Task completed with no text output)",
      toolCalls,
      durationMs,
      stepsUsed: result.steps.length,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : "Unknown execution error";
    const enriched = errorMsg.includes("abort") || errorMsg.includes("timeout")
      ? `${errorMsg} — Task exceeded ${timeoutS}s timeout.`
      : errorMsg;

    console.error(`[Task #${task.id}] FAILED in ${durationMs}ms: ${enriched}`);

    return { success: false, text: "", error: enriched, durationMs };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const summary = { tasksProcessed: 0, succeeded: 0, failed: 0, automationsTriggered: 0, skipped: 0 };

  try {
    // Phase 1: Evaluate automations
    console.log("\n[Phase 1] Evaluating automations...");
    const autoResult = await evaluateAutomations();
    summary.automationsTriggered = autoResult.triggered;
    if (autoResult.errors.length > 0) {
      console.warn(`[Phase 1] Automation errors:`, autoResult.errors);
    }
    console.log(`[Phase 1] Done: ${autoResult.triggered} automations triggered`);

    // Phase 2: Process pending tasks
    console.log(`\n[Phase 2] Processing up to ${maxTasks} pending tasks...`);

    for (let i = 0; i < maxTasks; i++) {
      const task = await getAnyPendingTask();
      if (!task) {
        console.log(`[Phase 2] No more pending tasks.`);
        break;
      }

      summary.tasksProcessed++;

      if (dryRun) {
        console.log(`[DRY RUN] Would execute task #${task.id}: ${task.task.slice(0, 100)} (agent: ${task.agent_id})`);
        summary.skipped++;
        continue;
      }

      // Mark as running
      await startTask(task.id);

      // Extract automation_id for logging
      const autoMatch = (task.trigger_source || "").match(/automation:(\d+)/);
      const automationId = autoMatch ? parseInt(autoMatch[1], 10) : null;

      // Log running
      await writeAutomationLog(automationId, "running", {
        type: "github_actions_execution",
        task_id: task.id,
        agent_id: task.agent_id,
        task: task.task.slice(0, 200),
        trigger: task.trigger_type,
        executor: "github_actions",
      }, 0);

      await logActivity(task.agent_id, AGENTS[task.agent_id]?.name, "task_started", `Background task started: ${task.task.slice(0, 80)}`, { taskId: task.id, trigger_type: task.trigger_type });
      await persistAgentStatus(task.agent_id, { status: "busy", currentTask: task.task.slice(0, 100), lastActivity: new Date().toISOString() });

      // Execute
      const result = await executeTask(task);

      // Log result
      if (result.success) {
        await completeTask(task.id, result.text, result.toolCalls);
        summary.succeeded++;

        await writeAutomationLog(automationId, "success", {
          type: "github_actions_execution",
          task_id: task.id,
          agent_id: task.agent_id,
          status: "completed",
          output: result.text.slice(0, 2000),
          tool_calls: (result.toolCalls || []).map((tc) => tc.name),
          steps_used: result.stepsUsed,
          executor: "github_actions",
        }, result.durationMs);

        await logActivity(task.agent_id, AGENTS[task.agent_id]?.name, "task_completed", `Background task completed: ${task.task.slice(0, 60)}`, { taskId: task.id, resultLength: result.text.length });
        await persistAgentStatus(task.agent_id, { status: "idle", currentTask: null, lastActivity: new Date().toISOString(), tasksCompleted: 1 });
      } else {
        await failTask(task.id, result.error);
        summary.failed++;

        await writeAutomationLog(automationId, "error", {
          type: "github_actions_execution",
          task_id: task.id,
          agent_id: task.agent_id,
          status: "failed",
          error: result.error.slice(0, 1000),
          executor: "github_actions",
        }, result.durationMs, result.error);

        await logActivity(task.agent_id, AGENTS[task.agent_id]?.name, "task_failed", `Background task failed: ${result.error?.slice(0, 80)}`, { taskId: task.id });
        await persistAgentStatus(task.agent_id, { status: "error", currentTask: null, lastActivity: new Date().toISOString() });
      }
    }

    console.log(`\n[Phase 2] Done: ${summary.succeeded} succeeded, ${summary.failed} failed, ${summary.skipped} skipped (dry run)`);
  } catch (error) {
    console.error("[Fatal Error]", error);
  } finally {
    await pool.end();
  }

  console.log(`\n[Summary] ${JSON.stringify(summary, null, 2)}`);
  console.log(`[Executor] Finished at ${new Date().toISOString()}`);

  // Exit with error code if any tasks failed
  process.exit(summary.failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("[Fatal]", e);
  process.exit(1);
});
