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
const DEFAULT_MAX_STEPS = parseInt(process.env.DEFAULT_MAX_STEPS || "40", 10);

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
      "gmail_send", "gmail_fetch", "gmail_labels",
      "gmail_create_label", "gmail_delete_label", "gmail_profile",
      "gmail_reply", "gmail_thread", "gmail_batch",
      "calendar_list", "calendar_events", "calendar_create",
      "calendar_delete", "calendar_freebusy",
      "drive_list", "drive_create_folder", "drive_create_file",
      "download_drive_file",
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
      "project_create", "project_add_task", "project_status", "project_list", "project_decompose",
      // Phase 5: Full Autonomous Project Lifecycle
      "project_update", "project_delete", "project_retry_task", "project_skip_task", "project_decompose_and_add", "project_health",
      // Phase 4: A2A
      "a2a_send_message", "a2a_broadcast", "a2a_check_inbox", "a2a_share_context", "a2a_query_context", "a2a_collaborate",
    ],
  },
  mail: {
    id: "mail",
    name: "Mail Agent",
    provider: "ollama",
    model: "gemma4:31b-cloud",
    tools: [
      "gmail_send", "gmail_fetch", "gmail_labels",
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
      // Phase 4: A2A
      "a2a_send_message", "a2a_check_inbox", "a2a_share_context", "a2a_query_context",
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
      "a2a_send_message", "a2a_check_inbox", "a2a_share_context", "a2a_query_context",
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
      "a2a_send_message", "a2a_check_inbox", "a2a_share_context", "a2a_query_context",
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
      "a2a_send_message", "a2a_check_inbox", "a2a_share_context", "a2a_query_context",
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
      "a2a_send_message", "a2a_check_inbox", "a2a_share_context", "a2a_query_context",
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
      // Phase 4: A2A
      "a2a_send_message", "a2a_check_inbox", "a2a_share_context", "a2a_query_context",
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

async function tavilySearch(query, numResults, mode = "basic") {
  const apiKey = nextTavilyKey();
  const body = {
    api_key: apiKey,
    query,
    max_results: Math.min(numResults || 10, 10),
    include_answer: mode === "advanced",
    include_raw_content: false,
  };
  if (mode === "advanced") {
    body.search_depth = "advanced";
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
  const data = await safeParseRes(res);
  const results = (data.results || []).map((r, i) => ({ title: r.title, url: r.url, snippet: r.content, score: r.score, rank: i + 1 }));
  if (mode === "advanced" && data.answer) {
    return [{ title: "AI-Generated Summary", url: "", snippet: data.answer, rank: 0, score: 1 }, ...results];
  }
  return results;
}

async function webSearchFallback(query, numResults = 10, mode = "basic") {
  if (getTavilyKeys().length > 0) {
    try {
      const results = await tavilySearch(query, numResults, mode);
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
      description: "Fetch/search emails from Gmail inbox. Supports full Gmail search syntax (e.g., 'is:unread', 'from:someone@example.com', 'subject:urgent').",
      inputSchema: zodSchema(z.object({
        query: z.string().optional(), maxResults: z.number().optional(), labelIds: z.array(z.string()).optional(),
      })),
      execute: safeJsonWrap(({ query, maxResults, labelIds }) => gmailFetch({ query, maxResults, labelIds })),
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

    download_drive_file: tool({
      description: "Download a file from Google Drive by ID. Returns file content as text (for text-based files) or metadata.",
      inputSchema: zodSchema(z.object({ fileId: z.string(), mimeType: z.string().optional() })),
      execute: safeJsonWrap(async ({ fileId, mimeType }) => {
        const token = await getGoogleAccessToken();
        // First get metadata
        const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,size,mimeType`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const meta = await metaRes.json();
        // Download file content
        const dlRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!dlRes.ok) throw new Error(`Drive download error: ${dlRes.status}`);
        const text = await dlRes.text();
        return {
          fileName: meta.name || "unknown",
          mimeType: meta.mimeType || mimeType || "text/plain",
          size: meta.size || text.length,
          content: text.slice(0, 16000),
          truncated: text.length > 16000,
        };
      }),
    }),

    // =======================================================================
    // Google Sheets API v4
    // =======================================================================
    sheets_read: tool({
      description: "Read spreadsheet metadata and content from Google Sheets.",
      inputSchema: zodSchema(z.object({
        spreadsheetId: z.string().describe("The spreadsheet ID"),
        ranges: z.string().optional().describe("Range(s) to read (e.g., 'Sheet1!A1:B10')"),
      })),
      execute: safeJsonWrap(async ({ spreadsheetId, ranges }) => {
        const token = await getGoogleAccessToken();
        const params = new URLSearchParams({ includeGridData: "true", fields: "spreadsheetId,properties,sheets(data,rowData,values)" });
        if (ranges) params.set("ranges", ranges);
        const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return safeParseRes(res);
      }),
    }),
    sheets_values: tool({
      description: "Get cell values from a Google Sheets range.",
      inputSchema: zodSchema(z.object({
        spreadsheetId: z.string().describe("The spreadsheet ID"),
        range: z.string().describe("Range to read (e.g., 'Sheet1!A1:B10')"),
      })),
      execute: safeJsonWrap(async ({ spreadsheetId, range }) => {
        const token = await getGoogleAccessToken();
        const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return safeParseRes(res);
      }),
    }),
    sheets_append: tool({
      description: "Append rows of data to a Google Sheets spreadsheet.",
      inputSchema: zodSchema(z.object({
        spreadsheetId: z.string().describe("The spreadsheet ID"),
        range: z.string().describe("Target range (e.g., 'Sheet1!A1')"),
        values: z.array(z.array(z.string())).describe("2D array of values to append (each inner array is a row)"),
      })),
      execute: safeJsonWrap(async ({ spreadsheetId, range, values }) => {
        const token = await getGoogleAccessToken();
        const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ values }),
        });
        return safeParseRes(res);
      }),
    }),
    sheets_update: tool({
      description: "Update cell values in a Google Sheets range.",
      inputSchema: zodSchema(z.object({
        spreadsheetId: z.string().describe("The spreadsheet ID"),
        range: z.string().describe("Range to update (e.g., 'Sheet1!A1:B5')"),
        values: z.array(z.array(z.string())).describe("2D array of new values"),
      })),
      execute: safeJsonWrap(async ({ spreadsheetId, range, values }) => {
        const token = await getGoogleAccessToken();
        const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ values }),
        });
        return safeParseRes(res);
      }),
    }),
    sheets_create: tool({
      description: "Create a new Google Spreadsheet.",
      inputSchema: zodSchema(z.object({
        title: z.string().describe("Title for the new spreadsheet"),
      })),
      execute: safeJsonWrap(async ({ title }) => {
        const token = await getGoogleAccessToken();
        const res = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { title } }),
        });
        return safeParseRes(res);
      }),
    }),
    sheets_add_sheet: tool({
      description: "Add a new sheet tab to an existing Google Spreadsheet.",
      inputSchema: zodSchema(z.object({
        spreadsheetId: z.string().describe("The spreadsheet ID"),
        sheetName: z.string().describe("Name for the new sheet tab"),
      })),
      execute: safeJsonWrap(async ({ spreadsheetId, sheetName }) => {
        const token = await getGoogleAccessToken();
        const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ requests: [{ addSheet: { properties: { title: sheetName } } }] }),
        });
        return safeParseRes(res);
      }),
    }),
    sheets_batch_get: tool({
      description: "Batch read values from multiple ranges in a Google Spreadsheet in a single API call.",
      inputSchema: zodSchema(z.object({
        spreadsheetId: z.string().describe("The spreadsheet ID"),
        ranges: z.array(z.string()).describe("Array of ranges to read (e.g., ['Sheet1!A1:B10', 'Sheet2!A1:A5'])"),
      })),
      execute: safeJsonWrap(async ({ spreadsheetId, ranges }) => {
        const token = await getGoogleAccessToken();
        const params = new URLSearchParams({ ranges: ranges.join(",") });
        const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return safeParseRes(res);
      }),
    }),
    sheets_clear: tool({
      description: "Clear all values from a range in a Google Spreadsheet.",
      inputSchema: zodSchema(z.object({
        spreadsheetId: z.string().describe("The spreadsheet ID"),
        range: z.string().describe("Range to clear (e.g., 'Sheet1!A1:B10')"),
      })),
      execute: safeJsonWrap(async ({ spreadsheetId, range }) => {
        const token = await getGoogleAccessToken();
        const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        return safeParseRes(res);
      }),
    }),

    // =======================================================================
    // Google Docs API v1
    // =======================================================================
    docs_list: tool({
      description: "List all Google Docs in the user's Drive.",
      inputSchema: zodSchema(z.object({})),
      execute: safeJsonWrap(async () => {
        const token = await getGoogleAccessToken();
        const params = new URLSearchParams({
          q: "mimeType='application/vnd.google-apps.document'",
          pageSize: "50",
          fields: "files(id,name,modifiedTime)",
        });
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return safeParseRes(res);
      }),
    }),
    docs_read: tool({
      description: "Read the content of a Google Doc.",
      inputSchema: zodSchema(z.object({
        documentId: z.string().describe("The document ID"),
      })),
      execute: safeJsonWrap(async ({ documentId }) => {
        const token = await getGoogleAccessToken();
        const res = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Docs read error: ${res.status}`);
        const data = await safeParseRes(res);
        // Extract text content from the document structure
        const paragraphs = [];
        const walk = (node) => {
          if (node.paragraph) {
            const elements = node.paragraph.elements || [];
            const text = elements.map(e => e.textRun?.content || "").join("");
            if (text.trim()) paragraphs.push(text.trim());
          }
          if (node.table) {
            for (const row of node.table.tableRows || []) {
              const cells = (row.tableCells || []).map(c => {
                const parts = [];
                const walkCell = (n) => {
                  if (n.paragraph) {
                    parts.push((n.paragraph.elements || []).map(e => e.textRun?.content || "").join(""));
                  }
                  for (const child of n.tableCell?.content || []) walkCell(child);
                };
                walkCell(c);
                return parts.join(" ").trim();
              });
              paragraphs.push(cells.join(" | "));
            }
          }
          for (const child of (node.body?.content || [])) walk(child);
        };
        walk(data);
        return { documentId, title: data.title, content: paragraphs.join("\n\n"), paragraphCount: paragraphs.length };
      }),
    }),
    docs_create: tool({
      description: "Create a new Google Doc.",
      inputSchema: zodSchema(z.object({
        title: z.string().describe("Title for the new document"),
      })),
      execute: safeJsonWrap(async ({ title }) => {
        const token = await getGoogleAccessToken();
        const res = await fetch("https://www.googleapis.com/drive/v3/files", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ name: title, mimeType: "application/vnd.google-apps.document" }),
        });
        const data = await safeParseRes(res);
        return { id: data.id, name: data.name, webViewLink: `https://docs.google.com/document/d/${data.id}/edit` };
      }),
    }),
    docs_append: tool({
      description: "Append text to an existing Google Doc.",
      inputSchema: zodSchema(z.object({
        documentId: z.string().describe("The document ID"),
        text: z.string().describe("Text to append"),
      })),
      execute: safeJsonWrap(async ({ documentId, text }) => {
        const token = await getGoogleAccessToken();
        const lines = text.split("\n").filter(l => l.trim());
        const requests = [];
        for (const line of lines) {
          requests.push({
            insertText: {
              location: { index: 1 },
              text: line + "\n",
            },
          });
        }
        const res = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ requests }),
        });
        return safeParseRes(res);
      }),
    }),

    // =======================================================================
    // GitHub Extended (only if repo/token configured)
    // =======================================================================
    ...(GITHUB_REPO ? {
      github_create_issue: tool({
        description: "Create a new GitHub issue.",
        inputSchema: zodSchema(z.object({
          title: z.string().describe("Issue title"),
          body: z.string().describe("Issue body/description (supports Markdown)"),
          labels: z.array(z.string()).optional().describe("Label names to apply"),
        })),
        execute: safeJsonWrap(async ({ title, body, labels }) => {
          const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues`, {
            method: "POST",
            headers: { "Accept": "application/vnd.github.v3+json", ...(GITHUB_TOKEN ? { "Authorization": `token ${GITHUB_TOKEN}` } : {}), "Content-Type": "application/json" },
            body: JSON.stringify({ title, body, labels }),
          });
          return safeParseRes(res);
        }),
      }),
      github_read_file: tool({
        description: "Read the content of a file from the GitHub repository.",
        inputSchema: zodSchema(z.object({
          path: z.string().describe("File path in the repository"),
        })),
        execute: safeJsonWrap(async ({ path }) => {
          return githubFetch(`/repos/${GITHUB_REPO}/contents/${path}`);
        }),
      }),
      github_update_issue: tool({
        description: "Update an existing GitHub issue — change state, title, body, or labels.",
        inputSchema: zodSchema(z.object({
          issueNumber: z.number().describe("The issue number to update"),
          state: z.enum(["open", "closed"]).optional().describe("New state for the issue"),
          title: z.string().optional().describe("New title for the issue"),
          body: z.string().optional().describe("New body/description (supports Markdown)"),
          labels: z.array(z.string()).optional().describe("New set of label names to apply"),
        })),
        execute: safeJsonWrap(async ({ issueNumber, state, title, body, labels }) => {
          const patch = {};
          if (state !== undefined) patch.state = state;
          if (title !== undefined) patch.title = title;
          if (body !== undefined) patch.body = body;
          if (labels !== undefined) patch.labels = labels;
          const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues/${issueNumber}`, {
            method: "PATCH",
            headers: { "Accept": "application/vnd.github.v3+json", ...(GITHUB_TOKEN ? { "Authorization": `token ${GITHUB_TOKEN}` } : {}), "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          });
          return safeParseRes(res);
        }),
      }),
      github_create_pr: tool({
        description: "Create a new pull request. Specify the head branch, base branch, title, and description.",
        inputSchema: zodSchema(z.object({
          title: z.string().describe("PR title"),
          body: z.string().describe("PR description (supports Markdown)"),
          head: z.string().describe("The name of the branch containing your changes"),
          base: z.string().describe("The name of the branch you want to merge into (e.g., 'main')"),
        })),
        execute: safeJsonWrap(async ({ title, body, head, base }) => {
          const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/pulls`, {
            method: "POST",
            headers: { "Accept": "application/vnd.github.v3+json", ...(GITHUB_TOKEN ? { "Authorization": `token ${GITHUB_TOKEN}` } : {}), "Content-Type": "application/json" },
            body: JSON.stringify({ title, body, head, base }),
          });
          return safeParseRes(res);
        }),
      }),
      github_pr_review: tool({
        description: "Get detailed pull request review information including PR details and all changed files with their diffs.",
        inputSchema: zodSchema(z.object({
          pullNumber: z.number().describe("The pull request number"),
        })),
        execute: safeJsonWrap(async ({ pullNumber }) => {
          const [pr, files] = await Promise.all([
            githubFetch(`/repos/${GITHUB_REPO}/pulls/${pullNumber}`),
            githubFetch(`/repos/${GITHUB_REPO}/pulls/${pullNumber}/files`),
          ]);
          return { pullRequest: pr, changedFiles: files, fileCount: Array.isArray(files) ? files.length : 0 };
        }),
      }),
      github_pr_comment: tool({
        description: "Create a comment on a GitHub pull request (or issue).",
        inputSchema: zodSchema(z.object({
          pullNumber: z.number().describe("The pull request or issue number"),
          body: z.string().describe("Comment body (supports Markdown)"),
        })),
        execute: safeJsonWrap(async ({ pullNumber, body }) => {
          const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues/${pullNumber}/comments`, {
            method: "POST",
            headers: { "Accept": "application/vnd.github.v3+json", ...(GITHUB_TOKEN ? { "Authorization": `token ${GITHUB_TOKEN}` } : {}), "Content-Type": "application/json" },
            body: JSON.stringify({ body }),
          });
          return safeParseRes(res);
        }),
      }),
      github_create_branch: tool({
        description: "Create a new branch in the GitHub repository from an existing branch (defaults to 'main').",
        inputSchema: zodSchema(z.object({
          branchName: z.string().describe("Name for the new branch"),
          fromBranch: z.string().optional().describe("Source branch to create from (default: 'main')"),
        })),
        execute: safeJsonWrap(async ({ branchName, fromBranch }) => {
          // Get the SHA of the source branch
          const ref = await githubFetch(`/repos/${GITHUB_REPO}/git/ref/heads/${fromBranch || "main"}`);
          const sha = ref.object.sha;
          // Create the new branch
          const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/refs`, {
            method: "POST",
            headers: { "Accept": "application/vnd.github.v3+json", ...(GITHUB_TOKEN ? { "Authorization": `token ${GITHUB_TOKEN}` } : {}), "Content-Type": "application/json" },
            body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha }),
          });
          return safeParseRes(res);
        }),
      }),
    } : {}),

    // =======================================================================
    // Vercel Extended (only if token configured)
    // =======================================================================
    ...(VERCEL_TOKEN ? {
      vercel_domains: tool({
        description: "List all Vercel domains.",
        inputSchema: zodSchema(z.object({
          projectId: z.string().optional().describe("Filter by project ID"),
        })),
        execute: safeJsonWrap(async ({ projectId }) => {
          const params = projectId ? `?projectId=${projectId}` : "";
          return vercelFetch(`/v2/domains${params}`);
        }),
      }),
      vercel_deploy: tool({
        description: "Trigger a redeployment on Vercel for a project using the latest production commit.",
        inputSchema: zodSchema(z.object({
          projectIdOrName: z.string().describe("Vercel project ID or name"),
        })),
        execute: safeJsonWrap(async ({ projectIdOrName }) => {
          // Step 1: Get project details
          const project = await vercelFetch(`/v9/projects/${encodeURIComponent(projectIdOrName)}`);
          // Step 2: Get latest deployment
          const deployments = await vercelFetch(`/v6/deployments?projectId=${project.id}&limit=1`);
          const latest = (deployments.deployments || [])[0];
          if (!latest) throw new Error("No previous deployments found to redeploy from");
          // Step 3: Trigger redeployment
          const deployBody = { name: project.name, projectId: project.id, target: latest.target || "production" };
          if (latest.meta?.githubCommitSha) deployBody.githubCommitSha = latest.meta.githubCommitSha;
          const res = await fetch("https://api.vercel.com/v13/deployments", {
            method: "POST",
            headers: { "Authorization": `Bearer ${VERCEL_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify(deployBody),
          });
          return safeParseRes(res);
        }),
      }),
      vercel_logs: tool({
        description: "Get build logs for the most recent deployment of a Vercel project.",
        inputSchema: zodSchema(z.object({
          projectIdOrName: z.string().describe("Vercel project ID or name"),
          limit: z.number().optional().describe("Max log entries to return (default: 100)"),
        })),
        execute: safeJsonWrap(async ({ projectIdOrName, limit }) => {
          const deployments = await vercelFetch(`/v2/projects/${projectIdOrName}/deployments?limit=1`);
          const latest = (deployments.deployments || [])[0];
          if (!latest) throw new Error("No deployments found");
          const events = await vercelFetch(`/v2/deployments/${latest.id}/events`);
          return {
            deploymentId: latest.id,
            state: latest.state,
            url: latest.url,
            events: (events.events || []).slice(0, limit || 100).map(e => ({
              type: e.type,
              text: e.text,
              timestamp: e.created ? new Date(e.created).toISOString() : null,
            })),
          };
        }),
      }),
    } : {}),

    // =======================================================================
    // Vision Tools (OCR — OCR.space API, FREE, no LLM tokens)
    // =======================================================================
    vision_analyze: tool({
      description: "Extract text from images using OCR. Accepts an image URL or base64-encoded data. This is a FREE service — no LLM tokens consumed.",
      inputSchema: zodSchema(z.object({
        prompt: z.string().optional().describe("Optional question about the image content"),
        imageUrl: z.string().optional().describe("URL of the image to analyze"),
        imageBase64: z.string().optional().describe("Base64-encoded image data"),
      })),
      execute: safeJsonWrap(async ({ prompt, imageUrl, imageBase64 }) => {
        if (!imageUrl && !imageBase64) return { analysis: "No image provided. Please provide an imageUrl or imageBase64." };
        const formData = new FormData();
        formData.append("language", "eng");
        formData.append("isOverlayRequired", "false");
        formData.append("scale", "true");
        formData.append("OCREngine", "2");
        if (imageBase64) {
          const clean = imageBase64.startsWith("data:") ? imageBase64.split(",")[1] : imageBase64;
          formData.append("base64Image", `data:image/png;base64,${clean}`);
        } else if (imageUrl) {
          formData.append("url", imageUrl);
        }
        const headers = {};
        if (process.env.OCR_SPACE_API_KEY) headers["apikey"] = process.env.OCR_SPACE_API_KEY;
        const res = await fetch("https://api.ocr.space/parse/image", {
          method: "POST", headers, body: formData, signal: AbortSignal.timeout(30000),
        });
        if (!res.ok) throw new Error(`OCR API error: ${res.status}`);
        const data = await safeParseRes(res);
        const fullText = (data.ParsedResults || []).map(r => r.ParsedText || "").join("\n").trim();
        if (!fullText) return { analysis: "No text could be extracted from this image.", prompt };
        const analysis = prompt
          ? `**Your question:** ${prompt}\n\n**Extracted text:**\n\n${fullText}`
          : `**Extracted text:**\n\n${fullText}`;
        return { analysis };
      }),
    }),
    vision_download_analyze: tool({
      description: "Download a file from Google Drive AND analyze it. For images: uses OCR to extract text. For text files: returns content directly.",
      inputSchema: zodSchema(z.object({
        fileId: z.string().describe("The Google Drive file ID to download and analyze"),
        prompt: z.string().optional().describe("Optional question about the file content"),
      })),
      execute: safeJsonWrap(async ({ fileId, prompt }) => {
        const token = await getGoogleAccessToken();
        // Step 1: Get file metadata
        const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const meta = await metaRes.json();
        const isImage = (meta.mimeType || "").startsWith("image/");
        const isGoogleApp = (meta.mimeType || "").startsWith("application/vnd.google-apps");
        // Step 2: Download/export
        let fileContent;
        let actualMime = meta.mimeType;
        if (isGoogleApp) {
          const exportMime = meta.mimeType.includes("document") ? "text/plain" : "text/csv";
          const exportRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          fileContent = await exportRes.text();
          actualMime = exportMime;
        } else {
          const dlRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (isImage) {
            const buf = Buffer.from(await dlRes.arrayBuffer());
            fileContent = buf.toString("base64");
          } else {
            fileContent = await dlRes.text();
          }
        }
        // Step 3: Process
        if (isImage && fileContent) {
          const formData = new FormData();
          formData.append("language", "eng");
          formData.append("isOverlayRequired", "false");
          formData.append("scale", "true");
          formData.append("OCREngine", "2");
          formData.append("base64Image", `data:image/png;base64,${fileContent.slice(0, 1000000)}`);
          const headers = {};
          if (process.env.OCR_SPACE_API_KEY) headers["apikey"] = process.env.OCR_SPACE_API_KEY;
          const ocrRes = await fetch("https://api.ocr.space/parse/image", {
            method: "POST", headers, body: formData, signal: AbortSignal.timeout(30000),
          });
          const ocrData = await safeParseRes(ocrRes);
          const ocrText = (ocrData.ParsedResults || []).map(r => r.ParsedText || "").join("\n").trim();
          if (!ocrText) return { fileName: meta.name, mimeType: actualMime, analysis: "No readable text found in this image." };
          const analysis = prompt
            ? `**Your question:** ${prompt}\n\n**Extracted text:**\n\n${ocrText}`
            : `**Extracted text:**\n\n${ocrText}`;
          return { fileName: meta.name, mimeType: actualMime, size: meta.size, analysis };
        }
        return { fileName: meta.name, mimeType: actualMime, size: meta.size, content: (fileContent || "").slice(0, 50000), contentTruncated: (fileContent || "").length > 50000 };
      }),
    }),

    // =======================================================================
    // Media Generation (AIHubMix API)
    // =======================================================================
    image_generate: tool({
      description: "Generate images from text prompts using AI (DALL-E via AIHubMix). Returns base64-encoded image data or a URL.",
      inputSchema: zodSchema(z.object({
        prompt: z.string().describe("Text description of the image to generate"),
        size: z.enum(["1024x1024", "768x1344", "864x1152", "1344x768", "1152x864", "1440x720", "720x1440"]).optional().describe("Image size (default: '1024x1024')"),
      })),
      execute: safeJsonWrap(async ({ prompt, size }) => {
        try {
          const apiKey = nextAIHubMixKey();
          const res = await fetch("https://aihubmix.com/v1/images/generations", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ model: "dall-e-3", prompt, size: size || "1024x1024", n: 1 }),
            signal: AbortSignal.timeout(60000),
          });
          if (!res.ok) throw new Error(`Image generation error: ${res.status}`);
          const data = await safeParseRes(res);
          const img = (data.data || [])[0];
          return img?.b64_json ? { imageBase64: img.b64_json } : img?.url ? { imageUrl: img.url } : { imageBase64: JSON.stringify(data) };
        } catch (err) {
          return { error: `Image generation failed: ${err.message}`, note: "Ensure AIHUBMIX_API_KEY is configured." };
        }
      }),
    }),
    tts_generate: tool({
      description: "Convert text to speech audio using AI (OpenAI TTS via AIHubMix). Returns base64-encoded MP3 audio data.",
      inputSchema: zodSchema(z.object({
        text: z.string().describe("Text to convert to speech"),
        voice: z.string().optional().describe("Voice name (default: 'alloy')"),
        speed: z.number().optional().describe("Speech speed multiplier (default: 1.0)"),
      })),
      execute: safeJsonWrap(async ({ text, voice, speed }) => {
        try {
          const apiKey = nextAIHubMixKey();
          const res = await fetch("https://aihubmix.com/v1/audio/speech", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ model: "tts-1", input: text, voice: voice || "alloy", speed: speed || 1.0, response_format: "mp3" }),
            signal: AbortSignal.timeout(30000),
          });
          if (!res.ok) throw new Error(`TTS error: ${res.status}`);
          const buf = Buffer.from(await res.arrayBuffer());
          return { audioBase64: buf.toString("base64"), format: "mp3" };
        } catch (err) {
          return { error: `TTS generation failed: ${err.message}` };
        }
      }),
    }),
    asr_transcribe: tool({
      description: "Transcribe audio to text using AI speech recognition (Whisper via AIHubMix). Accepts base64-encoded audio data.",
      inputSchema: zodSchema(z.object({
        audioBase64: z.string().describe("Base64-encoded audio data to transcribe"),
      })),
      execute: safeJsonWrap(async ({ audioBase64 }) => {
        try {
          const apiKey = nextAIHubMixKey();
          const audioBuffer = Buffer.from(audioBase64, "base64");
          const formData = new FormData();
          formData.append("file", new Blob([audioBuffer]), "audio.mp3");
          formData.append("model", "whisper-1");
          const res = await fetch("https://aihubmix.com/v1/audio/transcriptions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
            body: formData,
            signal: AbortSignal.timeout(30000),
          });
          if (!res.ok) throw new Error(`ASR error: ${res.status}`);
          const data = await safeParseRes(res);
          return { transcription: data.text || JSON.stringify(data) };
        } catch (err) {
          return { error: `Transcription failed: ${err.message}` };
        }
      }),
    }),
    video_generate: tool({
      description: "Generate video using AI from text prompt or image. Note: Video generation requires specific API support and may not be available in all environments.",
      inputSchema: zodSchema(z.object({
        prompt: z.string().optional().describe("Text description of the video to generate"),
        imageUrl: z.string().optional().describe("URL of a source image for image-to-video generation"),
        quality: z.enum(["speed", "quality"]).optional().describe("Generation quality (default: 'speed')"),
      })),
      execute: () => JSON.stringify({ success: false, error: "Video generation is not available in the GitHub Actions executor environment." }),
    }),

    // =======================================================================
    // Design Tools (Stitch API)
    // =======================================================================
    design_generate: tool({
      description: "Generate a high-fidelity UI design from a text prompt using the Stitch design platform.",
      inputSchema: zodSchema(z.object({
        title: z.string().describe("Title for the design project"),
        prompt: z.string().describe("Description of the UI design to generate"),
        deviceType: z.enum(["MOBILE", "DESKTOP", "TABLET"]).optional().describe("Target device type (default: 'DESKTOP')"),
      })),
      execute: safeJsonWrap(async ({ title, prompt, deviceType }) => {
        if (!process.env.STITCH_API_KEY) return { success: false, error: "STITCH_API_KEY not configured." };
        const res = await fetch("https://api.stitchdesign.ai/v1/designs", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": process.env.STITCH_API_KEY },
          body: JSON.stringify({ title, prompt, deviceType: deviceType || "DESKTOP" }),
          signal: AbortSignal.timeout(60000),
        });
        return safeParseRes(res);
      }),
    }),
    design_edit: tool({
      description: "Edit an existing Stitch design screen using a text prompt.",
      inputSchema: zodSchema(z.object({
        projectId: z.string().describe("The Stitch project ID"),
        screenId: z.string().describe("The screen ID to edit"),
        prompt: z.string().describe("Instructions for what to change in the design"),
      })),
      execute: safeJsonWrap(async ({ projectId, screenId, prompt }) => {
        if (!process.env.STITCH_API_KEY) return { success: false, error: "STITCH_API_KEY not configured." };
        const res = await fetch(`https://api.stitchdesign.ai/v1/designs/${projectId}/screens/${screenId}/edit`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": process.env.STITCH_API_KEY },
          body: JSON.stringify({ prompt }),
          signal: AbortSignal.timeout(60000),
        });
        return safeParseRes(res);
      }),
    }),
    design_variants: tool({
      description: "Generate design variants of an existing Stitch screen.",
      inputSchema: zodSchema(z.object({
        projectId: z.string().describe("The Stitch project ID"),
        screenId: z.string().describe("The screen ID to generate variants for"),
        prompt: z.string().describe("Description of what variations to explore"),
        count: z.number().optional().describe("Number of variants to generate (default: 3)"),
      })),
      execute: safeJsonWrap(async ({ projectId, screenId, prompt, count }) => {
        if (!process.env.STITCH_API_KEY) return { success: false, error: "STITCH_API_KEY not configured." };
        const res = await fetch(`https://api.stitchdesign.ai/v1/designs/${projectId}/screens/${screenId}/variants`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": process.env.STITCH_API_KEY },
          body: JSON.stringify({ prompt, count: count || 3 }),
          signal: AbortSignal.timeout(60000),
        });
        return safeParseRes(res);
      }),
    }),

    // =======================================================================
    // Data Analysis Tools
    // =======================================================================
    data_calculate: tool({
      description: "Perform mathematical and statistical calculations. Supports basic math and statistics (mean, median, mode, stddev, sum, min, max, count).",
      inputSchema: zodSchema(z.object({
        expression: z.string().describe("Math expression to evaluate (e.g., '2 + 3 * 4')"),
        data: z.array(z.number()).optional().describe("Array of numbers for statistical operations"),
      })),
      execute: safeJsonWrap(({ expression, data }) => {
        const result = { expression, dataType: data ? "statistical" : "math" };
        if (data && data.length > 0) {
          const sorted = [...data].sort((a, b) => a - b);
          const sum = data.reduce((a, b) => a + b, 0);
          const count = data.length;
          const mean = sum / count;
          const median = count % 2 === 0 ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2 : sorted[Math.floor(count / 2)];
          const freq = {};
          data.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
          const maxFreq = Math.max(...Object.values(freq));
          const mode = Object.entries(freq).filter(([, f]) => f === maxFreq).map(([v]) => Number(v));
          const variance = data.reduce((acc, v) => acc + (v - mean) ** 2, 0) / count;
          result.statistics = { sum, count, mean: Math.round(mean * 1000) / 1000, median, mode, min: sorted[0], max: sorted[count - 1], range: sorted[count - 1] - sorted[0], stddev: Math.round(Math.sqrt(variance) * 1000) / 1000 };
          result.result = `Stats for ${count} values: mean=${Math.round(mean * 100) / 100}, median=${median}, stddev=${Math.round(Math.sqrt(variance) * 100) / 100}`;
        } else {
          try {
            const sanitized = expression.replace(/[^0-9+\-*/().%, \t]/g, "");
            if (!sanitized) { result.result = "Could not evaluate expression"; result.evaluated = false; return result; }
            result.result = Function(`"use strict"; return (${sanitized})`)();
            result.evaluated = true;
          } catch { result.result = `Could not evaluate expression: ${expression}`; result.evaluated = false; }
        }
        return result;
      }),
    }),
    data_clean: tool({
      description: "Clean and normalize tabular data. Apply operations like trimming, case conversion, removing duplicates, empty rows, number/date formatting.",
      inputSchema: zodSchema(z.object({
        data: z.array(z.array(z.string())).describe("2D array of string data to clean (first row may be headers)"),
        operations: z.array(z.enum(["trim", "uppercase", "lowercase", "removeDuplicates", "removeEmpty", "numberFormat", "dateFormat"])).describe("Sequence of cleaning operations"),
      })),
      execute: safeJsonWrap(({ data, operations }) => {
        let cleaned = data.map(row => [...row]);
        for (const op of operations) {
          switch (op) {
            case "trim": cleaned = cleaned.map(row => row.map(cell => cell.trim())); break;
            case "uppercase": cleaned = cleaned.map(row => row.map(cell => cell.toUpperCase())); break;
            case "lowercase": cleaned = cleaned.map(row => row.map(cell => cell.toLowerCase())); break;
            case "removeDuplicates": { const seen = new Set(); cleaned = cleaned.filter(row => { const k = row.join("|||"); if (seen.has(k)) return false; seen.add(k); return true; }); break; }
            case "removeEmpty": cleaned = cleaned.filter(row => row.some(cell => cell.trim() !== "")); break;
            case "numberFormat": cleaned = cleaned.map(row => row.map(cell => { const n = parseFloat(cell.replace(/[^0-9.\-]/g, "")); return isNaN(n) ? cell : n.toLocaleString(); })); break;
            case "dateFormat": cleaned = cleaned.map(row => row.map(cell => { const d = new Date(cell); return isNaN(d.getTime()) ? cell : d.toISOString().split("T")[0]; })); break;
          }
        }
        return { originalRows: data.length, cleanedRows: cleaned.length, operationsApplied: operations, data: cleaned };
      }),
    }),
    data_pivot: tool({
      description: "Pivot, group, and aggregate tabular data. Group rows by a column and apply an aggregate function to another column.",
      inputSchema: zodSchema(z.object({
        data: z.array(z.array(z.string())).describe("2D array of data (first row should be headers)"),
        groupByColumn: z.number().describe("Zero-based column index to group by"),
        aggregateColumn: z.number().describe("Zero-based column index to aggregate"),
        aggregateFunction: z.enum(["sum", "average", "count", "min", "max"]).describe("Aggregate function to apply"),
      })),
      execute: safeJsonWrap(({ data, groupByColumn, aggregateColumn, aggregateFunction }) => {
        if (data.length < 2) throw new Error("Data must have at least a header row and one data row");
        const headers = data[0];
        const rows = data.slice(1);
        const groups = {};
        for (const row of rows) {
          const key = row[groupByColumn] || "(empty)";
          if (!groups[key]) groups[key] = [];
          const val = parseFloat(row[aggregateColumn]);
          if (!isNaN(val)) groups[key].push(val);
        }
        const pivoted = [];
        for (const [group, values] of Object.entries(groups)) {
          let value = 0;
          switch (aggregateFunction) {
            case "sum": value = values.reduce((a, b) => a + b, 0); break;
            case "average": value = values.reduce((a, b) => a + b, 0) / values.length; break;
            case "count": value = values.length; break;
            case "min": value = Math.min(...values); break;
            case "max": value = Math.max(...values); break;
          }
          pivoted.push({ group, value: Math.round(value * 1000) / 1000 });
        }
        return { groupBy: headers[groupByColumn], aggregateOn: headers[aggregateColumn], aggregateFunction, groups: pivoted, totalGroups: pivoted.length };
      }),
    }),

    // =======================================================================
    // Research Extended (save brief/data to Google Docs/Sheets)
    // =======================================================================
    research_save_brief: tool({
      description: "Save a research brief to a new Google Doc with formatted sections.",
      inputSchema: zodSchema(z.object({
        title: z.string().describe("Title for the research brief document"),
        objective: z.string().describe("Research objective"),
        methodology: z.string().describe("Research methodology used"),
        findings: z.string().describe("Key findings summary"),
        sources: z.array(z.string()).describe("List of source URLs or citations"),
        recommendations: z.string().describe("Recommendations based on findings"),
      })),
      execute: safeJsonWrap(async ({ title, objective, methodology, findings, sources, recommendations }) => {
        const token = await getGoogleAccessToken();
        // Create the doc
        const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ name: title, mimeType: "application/vnd.google-apps.document" }),
        });
        const doc = await safeParseRes(createRes);
        // Append content
        const content = `RESEARCH BRIEF: ${title}\n\n========================================\n\nOBJECTIVE\n${objective}\n\nMETHODOLOGY\n${methodology}\n\nKEY FINDINGS\n${findings}\n\nSOURCES\n${sources.map(s => `- ${s}`).join("\n")}\n\nRECOMMENDATIONS\n${recommendations}\n`;
        const lines = content.split("\n").filter(l => l.trim());
        const requests = lines.map(line => ({ insertText: { location: { index: 1 }, text: line + "\n" } }));
        await fetch(`https://docs.googleapis.com/v1/documents/${doc.id}:batchUpdate`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ requests }),
        });
        return { success: true, documentId: doc.id, documentUrl: `https://docs.google.com/document/d/${doc.id}/edit`, title };
      }),
    }),
    research_save_data: tool({
      description: "Save research data to a Google Sheet. Creates a new spreadsheet if no ID is provided.",
      inputSchema: zodSchema(z.object({
        spreadsheetId: z.string().optional().describe("Existing spreadsheet ID (creates new if omitted)"),
        title: z.string().optional().describe("Title for new spreadsheet"),
        data: z.array(z.array(z.string())).describe("2D array of data to save (first row = headers)"),
      })),
      execute: safeJsonWrap(async ({ spreadsheetId, title, data }) => {
        const token = await getGoogleAccessToken();
        let sheetId = spreadsheetId;
        if (!sheetId) {
          const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ properties: { title: title || "Research Data" } }),
          });
          const created = await safeParseRes(createRes);
          sheetId = created.spreadsheetId;
        }
        const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Sheet1!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ values: data }),
        });
        const result = await safeParseRes(res);
        return { success: true, spreadsheetId: sheetId, updatedRange: result.updates?.updatedRange, rowsAppended: result.updates?.updatedRows || data.length };
      }),
    }),

    // =======================================================================
    // Ops / Monitoring Tools
    // =======================================================================
    ops_health_check: tool({
      description: "Check the health status of all connected services (GitHub API, Vercel API, Google API). Returns a structured health report.",
      inputSchema: zodSchema(z.object({})),
      execute: safeJsonWrap(async () => {
        const checks = [];
        // GitHub
        try {
          const ghRes = await fetch("https://api.github.com", { signal: AbortSignal.timeout(5000) });
          checks.push({ service: "github-api", status: ghRes.ok ? "healthy" : "unhealthy", statusCode: ghRes.status });
        } catch (err) { checks.push({ service: "github-api", status: "unreachable", error: err.message }); }
        // Vercel
        try {
          const headers = { Authorization: `Bearer ${VERCEL_TOKEN}` };
          const vRes = await fetch("https://api.vercel.com/v2/user", { headers, signal: AbortSignal.timeout(5000) });
          checks.push({ service: "vercel-api", status: vRes.ok ? "healthy" : "unhealthy", statusCode: vRes.status });
        } catch (err) { checks.push({ service: "vercel-api", status: "unreachable", error: err.message }); }
        // Google
        try {
          const token = await getGoogleAccessToken();
          const gRes = await fetch("https://www.googleapis.com/drive/v3/files?pageSize=1", {
            headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000),
          });
          checks.push({ service: "google-api", status: gRes.ok ? "healthy" : "unhealthy", statusCode: gRes.status });
        } catch (err) { checks.push({ service: "google-api", status: "unreachable", error: err.message }); }
        // Supabase (pool)
        try {
          await pool.query("SELECT 1");
          checks.push({ service: "supabase-db", status: "healthy" });
        } catch (err) { checks.push({ service: "supabase-db", status: "unreachable", error: err.message }); }
        const healthy = checks.filter(c => c.status === "healthy").length;
        return { overallStatus: healthy === checks.length ? "all_healthy" : healthy >= Math.ceil(checks.length * 0.5) ? "degraded" : "down", healthyServices: healthy, totalServices: checks.length, timestamp: new Date().toISOString(), checks };
      }),
    }),
    ops_deployment_status: tool({
      description: "Get the latest deployment status from Vercel.",
      inputSchema: zodSchema(z.object({})),
      execute: safeJsonWrap(async () => {
        const projectName = process.env.VERCEL_PROJECT_NAME || process.env.GITHUB_REPO?.split("/")[1] || "unknown";
        const deployments = await vercelFetch(`/v2/projects/${projectName}/deployments?limit=1`);
        const latest = (deployments.deployments || [])[0];
        if (!latest) return { status: "no_deployments", project: projectName };
        return { id: latest.id, state: latest.state, url: latest.url, createdAt: latest.created, project: projectName };
      }),
    }),
    ops_github_activity: tool({
      description: "Get recent GitHub activity including commits and issues with anomaly flags.",
      inputSchema: zodSchema(z.object({
        since: z.string().optional().describe("ISO 8601 date to filter activity from"),
      })),
      execute: safeJsonWrap(async ({ since }) => {
        const [commits, issues] = await Promise.all([
          githubFetch(`/repos/${GITHUB_REPO}/commits?per_page=10`),
          githubFetch(`/repos/${GITHUB_REPO}/issues?state=all&per_page=10`),
        ]);
        const sinceDate = since ? new Date(since) : null;
        const filteredCommits = sinceDate ? (Array.isArray(commits) ? commits : []).filter(c => new Date(c.commit?.author?.date) >= sinceDate) : (Array.isArray(commits) ? commits : []);
        const filteredIssues = sinceDate ? (Array.isArray(issues) ? issues : []).filter(i => new Date(i.updated_at) >= sinceDate) : (Array.isArray(issues) ? issues : []);
        const openIssues = (Array.isArray(issues) ? issues : []).filter(i => i.state === "open");
        const anomalies = [];
        if (openIssues.length > 20) anomalies.push("High number of open issues");
        return {
          commitCount: filteredCommits.length,
          issueCount: filteredIssues.length,
          openIssues: openIssues.length,
          recentCommits: filteredCommits.slice(0, 5).map(c => ({ sha: (c.sha || "").slice(0, 7), message: (c.commit?.message || "").split("\n")[0], author: c.commit?.author?.name, date: c.commit?.author?.date })),
          recentIssues: filteredIssues.slice(0, 5).map(i => ({ number: i.number, title: i.title, state: i.state, author: i.user?.login, updated: i.updated_at })),
          anomalies: anomalies.length > 0 ? anomalies : "No anomalies detected",
          timestamp: new Date().toISOString(),
        };
      }),
    }),
    ops_agent_stats: tool({
      description: "Get performance statistics for all Claw agents from the database.",
      inputSchema: zodSchema(z.object({})),
      execute: safeJsonWrap(async () => {
        try {
          const statusResult = await pool.query(`
            SELECT agent_id, COUNT(*) as total_tasks,
              COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
              COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
              COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
              COUNT(CASE WHEN status = 'running' THEN 1 END) as running
            FROM agent_tasks GROUP BY agent_id ORDER BY agent_id
          `);
          return { agents: statusResult.rows, timestamp: new Date().toISOString() };
        } catch (err) {
          return { error: `Failed to query agent stats: ${err.message}`, agents: [] };
        }
      }),
    }),

    // =======================================================================
    // Reminders (workspace — database)
    // =======================================================================
    reminder_create: tool({
      description: "Create a reminder. Supports priority levels, recurring schedules, and agent assignment.",
      inputSchema: zodSchema(z.object({
        title: z.string().describe("Reminder title — what to be reminded about"),
        description: z.string().optional().describe("Additional context or details"),
        reminder_time: z.string().describe("When to fire (ISO 8601 datetime, e.g., '2025-01-15T09:00:00Z')"),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional().describe("Priority (default: 'normal')"),
        repeat_config: z.object({ type: z.enum(["daily", "weekly", "monthly"]) }).optional().describe("Recurring config"),
        assigned_agent: z.string().optional().describe("Which agent should handle this reminder"),
      })),
      execute: safeJsonWrap(async ({ title, description, reminder_time, priority, repeat_config, assigned_agent }) => {
        const result = await pool.query(
          `INSERT INTO reminders (title, description, reminder_time, priority, repeat_config, assigned_agent, context)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [title, description || "", reminder_time, priority || "normal", JSON.stringify(repeat_config || {}), assigned_agent || null, "{}"],
        );
        return result.rows[0];
      }),
    }),
    reminder_list: tool({
      description: "List reminders with optional filters. Returns reminders ordered by time.",
      inputSchema: zodSchema(z.object({
        status: z.enum(["pending", "fired", "dismissed", "snoozed"]).optional().describe("Filter by status"),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional().describe("Filter by priority"),
        limit: z.number().optional().describe("Max results (default: 50)"),
      })),
      execute: safeJsonWrap(async ({ status, priority, limit }) => {
        const conditions = [];
        const params = [];
        let idx = 1;
        if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
        if (priority) { conditions.push(`priority = $${idx++}`); params.push(priority); }
        const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        const result = await pool.query(`SELECT * FROM reminders ${where} ORDER BY reminder_time ASC LIMIT $${idx}`, [...params, limit || 50]);
        return result.rows;
      }),
    }),
    reminder_update: tool({
      description: "Update an existing reminder — change time, title, description, priority, or status.",
      inputSchema: zodSchema(z.object({
        id: z.number().describe("Reminder ID to update"),
        title: z.string().optional().describe("New title"),
        description: z.string().optional().describe("New description"),
        reminder_time: z.string().optional().describe("New reminder time (ISO 8601)"),
        status: z.enum(["pending", "fired", "dismissed", "snoozed"]).optional().describe("New status"),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional().describe("New priority"),
      })),
      execute: safeJsonWrap(async ({ id, title, description, reminder_time, status, priority }) => {
        const fields = [];
        const params = [];
        let idx = 1;
        if (title !== undefined) { fields.push(`title = $${idx++}`); params.push(title); }
        if (description !== undefined) { fields.push(`description = $${idx++}`); params.push(description); }
        if (reminder_time !== undefined) { fields.push(`reminder_time = $${idx++}`); params.push(reminder_time); }
        if (status !== undefined) { fields.push(`status = $${idx++}`); params.push(status); }
        if (priority !== undefined) { fields.push(`priority = $${idx++}`); params.push(priority); }
        if (fields.length === 0) throw new Error("No fields to update");
        fields.push(`updated_at = NOW()`);
        const result = await pool.query(`UPDATE reminders SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`, [...params, id]);
        return result.rows[0] || null;
      }),
    }),
    reminder_delete: tool({
      description: "Delete a reminder permanently.",
      inputSchema: zodSchema(z.object({ id: z.number().describe("Reminder ID to delete") })),
      execute: safeJsonWrap(async ({ id }) => {
        await pool.query(`DELETE FROM reminders WHERE id = $1`, [id]);
        return { deleted: true, id };
      }),
    }),
    reminder_complete: tool({
      description: "Mark a reminder as completed — dismiss it or snooze it (push time forward).",
      inputSchema: zodSchema(z.object({
        id: z.number().describe("Reminder ID to complete"),
        action: z.enum(["dismiss", "snooze"]).describe("'dismiss' marks as dismissed, 'snooze' pushes time forward"),
        snooze_minutes: z.number().optional().describe("If snoozing, minutes to push forward (default: 30)"),
      })),
      execute: safeJsonWrap(async ({ id, action, snooze_minutes }) => {
        const existing = await pool.query(`SELECT * FROM reminders WHERE id = $1`, [id]);
        const reminder = existing.rows[0];
        if (!reminder) throw new Error(`Reminder ${id} not found`);
        if (action === "dismiss") {
          const result = await pool.query(`UPDATE reminders SET status = 'dismissed', updated_at = NOW() WHERE id = $1 RETURNING *`, [id]);
          return result.rows[0];
        }
        const minutes = snooze_minutes || 30;
        const newTime = new Date(new Date(reminder.reminder_time).getTime() + minutes * 60 * 1000).toISOString();
        const result = await pool.query(`UPDATE reminders SET status = 'pending', reminder_time = $1, updated_at = NOW() WHERE id = $2 RETURNING *`, [newTime, id]);
        return result.rows[0];
      }),
    }),

    // =======================================================================
    // Todos (workspace — database)
    // =======================================================================
    todo_create: tool({
      description: "Create a task/todo item. Supports categories, tags, due dates, priority, and agent assignment.",
      inputSchema: zodSchema(z.object({
        title: z.string().describe("Task title"),
        description: z.string().optional().describe("Detailed description"),
        priority: z.enum(["low", "medium", "high", "critical"]).optional().describe("Priority (default: 'medium')"),
        due_date: z.string().optional().describe("Due date (ISO date, e.g., '2025-01-15')"),
        category: z.string().optional().describe("Category label (default: 'general')"),
        tags: z.array(z.string()).optional().describe("Tags for categorization"),
        assigned_agent: z.string().optional().describe("Which agent owns this task"),
      })),
      execute: safeJsonWrap(async ({ title, description, priority, due_date, category, tags, assigned_agent }) => {
        const result = await pool.query(
          `INSERT INTO todos (title, description, priority, due_date, category, tags, assigned_agent, context)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [title, description || "", priority || "medium", due_date || null, category || "general", tags || [], assigned_agent || null, "{}"],
        );
        return result.rows[0];
      }),
    }),
    todo_list: tool({
      description: "List tasks/todos with optional filters. Returns tasks ordered by creation date (newest first).",
      inputSchema: zodSchema(z.object({
        status: z.enum(["open", "in_progress", "done", "archived"]).optional().describe("Filter by status"),
        priority: z.enum(["low", "medium", "high", "critical"]).optional().describe("Filter by priority"),
        category: z.string().optional().describe("Filter by category"),
        tag: z.string().optional().describe("Filter by a specific tag"),
        limit: z.number().optional().describe("Max results (default: 50)"),
      })),
      execute: safeJsonWrap(async ({ status, priority, category, tag, limit }) => {
        const conditions = [];
        const params = [];
        let idx = 1;
        if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
        if (priority) { conditions.push(`priority = $${idx++}`); params.push(priority); }
        if (category) { conditions.push(`category = $${idx++}`); params.push(category); }
        if (tag) { conditions.push(`$${idx} = ANY(tags)`); params.push(tag); idx++; }
        const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        const result = await pool.query(`SELECT * FROM todos ${where} ORDER BY created_at DESC LIMIT $${idx}`, [...params, limit || 50]);
        return result.rows;
      }),
    }),
    todo_update: tool({
      description: "Update a task/todo. Change status, title, description, priority, due date, or tags.",
      inputSchema: zodSchema(z.object({
        id: z.number().describe("Task ID to update"),
        title: z.string().optional().describe("New title"),
        description: z.string().optional().describe("New description"),
        status: z.enum(["open", "in_progress", "done", "archived"]).optional().describe("New status"),
        priority: z.enum(["low", "medium", "high", "critical"]).optional().describe("New priority"),
        due_date: z.string().optional().describe("New due date (ISO date)"),
        category: z.string().optional().describe("New category"),
        tags: z.array(z.string()).optional().describe("New tags (replaces existing)"),
      })),
      execute: safeJsonWrap(async ({ id, title, description, status, priority, due_date, category, tags }) => {
        const fields = [];
        const params = [];
        let idx = 1;
        if (title !== undefined) { fields.push(`title = $${idx++}`); params.push(title); }
        if (description !== undefined) { fields.push(`description = $${idx++}`); params.push(description); }
        if (status !== undefined) { fields.push(`status = $${idx++}`); params.push(status); }
        if (priority !== undefined) { fields.push(`priority = $${idx++}`); params.push(priority); }
        if (due_date !== undefined) { fields.push(`due_date = $${idx++}`); params.push(due_date); }
        if (category !== undefined) { fields.push(`category = $${idx++}`); params.push(category); }
        if (tags !== undefined) { fields.push(`tags = $${idx++}`); params.push(tags); }
        if (status === "done") fields.push(`completed_at = NOW()`);
        if (fields.length === 0) throw new Error("No fields to update");
        fields.push(`updated_at = NOW()`);
        const result = await pool.query(`UPDATE todos SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`, [...params, id]);
        return result.rows[0] || null;
      }),
    }),
    todo_delete: tool({
      description: "Delete a task/todo permanently.",
      inputSchema: zodSchema(z.object({ id: z.number().describe("Task ID to delete") })),
      execute: safeJsonWrap(async ({ id }) => {
        await pool.query(`DELETE FROM todos WHERE id = $1`, [id]);
        return { deleted: true, id };
      }),
    }),
    todo_stats: tool({
      description: "Get task statistics — counts by status, priority breakdown, and overdue count.",
      inputSchema: zodSchema(z.object({})),
      execute: safeJsonWrap(async () => {
        const [statusResult, priorityResult, overdueResult, totalResult] = await Promise.all([
          pool.query(`SELECT status, COUNT(*) as count FROM todos GROUP BY status ORDER BY status`),
          pool.query(`SELECT priority, COUNT(*) as count FROM todos GROUP BY priority ORDER BY priority`),
          pool.query(`SELECT COUNT(*) as count FROM todos WHERE status NOT IN ('done', 'archived') AND due_date IS NOT NULL AND due_date < CURRENT_DATE`),
          pool.query(`SELECT COUNT(*) as count FROM todos`),
        ]);
        const byStatus = {};
        for (const row of statusResult.rows) byStatus[row.status] = parseInt(row.count, 10);
        const byPriority = {};
        for (const row of priorityResult.rows) byPriority[row.priority] = parseInt(row.count, 10);
        return { total: parseInt(totalResult.rows[0].count, 10), by_status: byStatus, by_priority: byPriority, overdue: parseInt(overdueResult.rows[0].count, 10) };
      }),
    }),

    // =======================================================================
    // Contacts (workspace — database)
    // =======================================================================
    contact_create: tool({
      description: "Create a contact in the workspace address book. Supports company, role, notes, tags, VIP flag.",
      inputSchema: zodSchema(z.object({
        first_name: z.string().optional().describe("Contact first name"),
        last_name: z.string().optional().describe("Contact last name"),
        email: z.string().optional().describe("Email address (must be unique)"),
        phone: z.string().optional().describe("Phone number"),
        company: z.string().optional().describe("Company/organization name"),
        role: z.string().optional().describe("Job title or role"),
        notes: z.string().optional().describe("Notes about this contact"),
        tags: z.array(z.string()).optional().describe("Tags for categorization"),
        is_vip: z.boolean().optional().describe("Mark as VIP (default: false)"),
      })),
      execute: safeJsonWrap(async ({ first_name, last_name, email, phone, company, role, notes, tags, is_vip }) => {
        const result = await pool.query(
          `INSERT INTO contacts (first_name, last_name, email, phone, company, role, notes, tags, context, is_vip, frequency)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
          [first_name || null, last_name || null, email || null, phone || null, company || null, role || null, notes || "", tags || [], "{}", is_vip || false, "occasional"],
        );
        return result.rows[0];
      }),
    }),
    contact_list: tool({
      description: "List contacts with optional filters. Returns contacts ordered by last interaction.",
      inputSchema: zodSchema(z.object({
        tag: z.string().optional().describe("Filter by tag"),
        company: z.string().optional().describe("Filter by company (partial match)"),
        is_vip: z.boolean().optional().describe("Filter VIP contacts"),
        search: z.string().optional().describe("Search across name, email, and company"),
        limit: z.number().optional().describe("Max results (default: 50)"),
      })),
      execute: safeJsonWrap(async ({ tag, company, is_vip, search, limit }) => {
        const conditions = [];
        const params = [];
        let idx = 1;
        if (tag) { conditions.push(`$${idx} = ANY(tags)`); params.push(tag); idx++; }
        if (company) { conditions.push(`company ILIKE $${idx}`); params.push(`%${company}%`); idx++; }
        if (is_vip !== undefined) { conditions.push(`is_vip = $${idx}`); params.push(is_vip); idx++; }
        if (search) { conditions.push(`(first_name ILIKE $${idx} OR last_name ILIKE $${idx} OR email ILIKE $${idx} OR company ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
        const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        const result = await pool.query(`SELECT * FROM contacts ${where} ORDER BY last_interaction DESC NULLS LAST, created_at DESC LIMIT $${idx}`, [...params, limit || 50]);
        return result.rows;
      }),
    }),
    contact_search: tool({
      description: "Search contacts across all fields — name, email, company, notes. Returns ranked results.",
      inputSchema: zodSchema(z.object({
        query: z.string().describe("Search query — searches across name, email, company, and notes"),
      })),
      execute: safeJsonWrap(async ({ query }) => {
        const pattern = `%${query}%`;
        const result = await pool.query(
          `SELECT * FROM contacts
           WHERE first_name ILIKE $1 OR last_name ILIKE $1 OR email ILIKE $1 OR company ILIKE $1 OR notes ILIKE $1
           ORDER BY CASE WHEN email ILIKE $1 THEN 1 WHEN first_name ILIKE $1 OR last_name ILIKE $1 THEN 2 WHEN company ILIKE $1 THEN 3 ELSE 4 END,
             last_interaction DESC NULLS LAST
           LIMIT 20`,
          [pattern],
        );
        return result.rows;
      }),
    }),
    contact_update: tool({
      description: "Update a contact's information — edit details, notes, tags, company/role, VIP status.",
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
      })),
      execute: safeJsonWrap(async ({ id, first_name, last_name, email, phone, company, role, notes, tags, is_vip }) => {
        const fields = [];
        const params = [];
        let idx = 1;
        const map = { first_name, last_name, email, phone, company, role, notes, is_vip };
        for (const [key, val] of Object.entries(map)) {
          if (val !== undefined) { fields.push(`${key} = $${idx++}`); params.push(val); }
        }
        if (tags !== undefined) { fields.push(`tags = $${idx++}`); params.push(tags); }
        if (fields.length === 0) throw new Error("No fields to update");
        fields.push(`updated_at = NOW()`);
        const result = await pool.query(`UPDATE contacts SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`, [...params, id]);
        return result.rows[0] || null;
      }),
    }),
    contact_delete: tool({
      description: "Delete a contact permanently from the address book.",
      inputSchema: zodSchema(z.object({ id: z.number().describe("Contact ID to delete") })),
      execute: safeJsonWrap(async ({ id }) => {
        await pool.query(`DELETE FROM contacts WHERE id = $1`, [id]);
        return { deleted: true, id };
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

    // Code execution — Piston API (sandboxed, multi-language, FREE)
    // Uses https://emkc.org/api/v2/piston/execute — no key needed
    code_execute: tool({
      description: "Execute code snippets safely in a sandboxed environment. Supports JavaScript, Python, TypeScript, Go, Rust, Java, C++, Ruby, PHP, and Swift. Returns stdout, stderr, and exit code. Execution timeout: 10s.",
      inputSchema: zodSchema(z.object({ code: z.string(), language: z.string().optional(), stdin: z.string().optional() })),
      execute: safeJsonWrap(async ({ code, language, stdin }) => {
        const PISTON_LANGUAGES = {
          javascript: { language: "javascript", version: "18.15.0", aliases: ["js", "node"] },
          python:     { language: "python",     version: "3.10.0",  aliases: ["py"] },
          typescript: { language: "typescript", version: "5.0.3",   aliases: ["ts"] },
          go:         { language: "go",         version: "1.20.0",  aliases: [] },
          rust:       { language: "rust",       version: "1.68.0",  aliases: [] },
          java:       { language: "java",       version: "15.0.2",  aliases: [] },
          cpp:        { language: "c++",        version: "10.2.0",  aliases: ["c"] },
          ruby:       { language: "ruby",       version: "3.2.0",  aliases: [] },
          php:        { language: "php",        version: "8.2.3",  aliases: [] },
          swift:      { language: "swift",      version: "5.5.3",  aliases: [] },
        };
        const langKey = (language || "javascript").toLowerCase().trim();
        let langConfig = PISTON_LANGUAGES[langKey];
        if (!langConfig) {
          for (const cfg of Object.values(PISTON_LANGUAGES)) {
            if (cfg.aliases.includes(langKey)) { langConfig = cfg; break; }
          }
        }
        if (!langConfig) {
          return { error: `Unsupported language: "${langKey}". Supported: ${Object.keys(PISTON_LANGUAGES).join(", ")}` };
        }
        try {
          const res = await fetch("https://emkc.org/api/v2/piston/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              language: langConfig.language,
              version: langConfig.version,
              files: [{ name: `main.${langConfig.language === "c++" ? "cpp" : langConfig.language}`, content: code }],
              stdin: stdin || "",
              compile_timeout: 10000,
              run_timeout: 10000,
            }),
            signal: AbortSignal.timeout(15000),
          });
          if (!res.ok) throw new Error(`Piston API error: ${res.status}`);
          const data = await safeParseRes(res);
          const run = data.run || data.compile;
          return {
            language: data.language,
            version: data.version,
            exitCode: run?.exit_code ?? -1,
            stdout: (run?.stdout || "").trim(),
            stderr: (run?.stderr || "").trim(),
          };
        } catch (err) {
          return { error: err instanceof Error ? err.message : "Code execution failed" };
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

    // Research Tools (real implementations — Tavily-powered)
    research_deep: tool({
      description: "Perform deep multi-query research on a topic. Generates multiple search queries, runs them in parallel, deduplicates results, and returns a unified ranked result set.",
      inputSchema: zodSchema(z.object({
        topic: z.string().describe("The main research topic"),
        aspects: z.array(z.string()).optional().describe("Specific aspects to research"),
        numResults: z.number().optional().describe("Total results to return (default: 15)"),
      })),
      execute: safeJsonWrap(async ({ topic, aspects, numResults }) => {
        const queries = [
          topic,
          `${topic} overview`,
          ...(aspects || []).map(a => `${topic} ${a}`),
        ].slice(0, 5);
        const allResults = await Promise.all(queries.map(q => webSearchFallback(q, numResults || 10, "advanced")));
        const seen = new Set();
        const unique = [];
        for (const results of allResults) {
          for (const item of results) {
            const url = item.url || "";
            if (url && !seen.has(url)) {
              seen.add(url);
              unique.push({ url, title: item.title, snippet: item.snippet });
            }
          }
        }
        return { topic, queriesUsed: queries, totalFound: unique.length, results: unique.slice(0, numResults || 15) };
      }),
    }),
    research_synthesize: tool({
      description: "Cross-reference and synthesize research findings from multiple sources. Analyzes agreements, disagreements, and credibility.",
      inputSchema: zodSchema(z.object({
        findings: z.array(z.object({ source: z.string(), claim: z.string() })).describe("Findings from different sources"),
        question: z.string().describe("The research question to answer"),
      })),
      execute: safeJsonWrap(({ findings, question }) => {
        // In GH Actions we can't call another LLM easily, so provide structured analysis
        const sources = findings.map((f, i) => `${i + 1}. [${f.source}] ${f.claim}`).join("\n");
        return {
          question,
          sourcesAnalyzed: findings.length,
          keyThemes: [...new Set(findings.map(f => f.claim.split(" ").slice(0, 5).join(" ")))].slice(0, 5),
          findings,
          note: "Full AI synthesis requires chat mode. Use research_deep for comprehensive multi-query search results.",
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
      description: "Route a task to another agent. Creates a new background task for the target agent. Available agents: mail (email/calendar), code (GitHub/Vercel), data (Drive/Sheets/Docs), creative (content/planning/docs), research (deep research), ops (monitoring). Returns a confirmation that the task was queued. IMPORTANT: The target agent will execute this task in the next executor cycle (~2 minutes). Do NOT expect an immediate result.",
      inputSchema: zodSchema(z.object({ agent_id: z.string(), task: z.string() })),
      execute: safeJsonWrap(async ({ agent_id, task }) => {
        // Validate target agent exists
        const validAgents = Object.keys(AGENTS);
        if (!validAgents.includes(agent_id)) {
          return { success: false, error: `Unknown agent: ${agent_id}. Valid agents: ${validAgents.join(", ")}` };
        }
        // Queue a new task for the target agent
        const result = await pool.query(
          `INSERT INTO agent_tasks (agent_id, task, context, trigger_type, trigger_source, priority)
           VALUES ($1, $2, $3, 'agent_delegation', $4, 'high') RETURNING id`,
          [agent_id, task, `Delegated from background task at ${new Date().toISOString()}`, `delegation:bg-${Date.now()}`],
        );
        const newTaskId = result.rows[0]?.id;
        return {
          success: true,
          message: `Task queued for ${AGENTS[agent_id]?.name || agent_id} (task #${newTaskId}). It will execute in the next cycle (~2 minutes).`,
          taskId: newTaskId,
          targetAgent: agent_id,
        };
      }),
    }),

    // Project Management
    project_create: tool({
      description: "Create a new project with a name, description, and optional priority/deadline.",
      inputSchema: zodSchema(z.object({
        name: z.string().describe("Project name"),
        description: z.string().optional().describe("Project description"),
        priority: z.enum(["critical", "high", "medium", "low"]).optional().describe("Project priority"),
        deadline: z.string().optional().describe("Deadline in ISO format"),
        tags: z.array(z.string()).optional().describe("Tags"),
      })),
      execute: safeJsonWrap(async ({ name, description, priority, deadline, tags }) => {
        const result = await pool.query(
          `INSERT INTO projects (name, description, priority, deadline, tags) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [name, description || null, priority || "medium", deadline || null, tags || []],
        );
        return result.rows[0];
      }),
    }),
    project_add_task: tool({
      description: "Add a task to an existing project. Supports dependencies via depends_on (array of task IDs).",
      inputSchema: zodSchema(z.object({
        project_id: z.number().describe("Project ID"),
        title: z.string().describe("Task title"),
        description: z.string().optional().describe("Task description"),
        task_type: z.enum(["research", "code", "design", "testing", "deployment", "docs", "communication", "general"]).optional().describe("Task type"),
        priority: z.enum(["critical", "high", "medium", "low"]).optional().describe("Task priority"),
        assigned_agent: z.string().optional().describe("Agent ID to assign (general/mail/code/data/creative/research/ops)"),
        depends_on: z.array(z.number()).optional().describe("Array of task IDs this task depends on"),
        task_prompt: z.string().optional().describe("The prompt/instruction the agent should execute for this task"),
        sort_order: z.number().optional().describe("Sort order for execution sequence"),
      })),
      execute: safeJsonWrap(async ({ project_id, title, description, task_type, priority, assigned_agent, depends_on, task_prompt, sort_order }) => {
        const result = await pool.query(
          `INSERT INTO project_tasks (project_id, title, description, task_type, priority, assigned_agent, depends_on, task_prompt, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
          [project_id, title, description || null, task_type || "general", priority || "medium", assigned_agent || "general", depends_on || [], task_prompt || null, sort_order || 0],
        );
        return result.rows[0];
      }),
    }),
    project_status: tool({
      description: "Get the status of a project including all tasks and the next executable tasks (those whose dependencies are met).",
      inputSchema: zodSchema(z.object({
        project_id: z.number().describe("Project ID"),
      })),
      execute: safeJsonWrap(async ({ project_id }) => {
        // Get project
        const projResult = await pool.query(`SELECT * FROM projects WHERE id = $1`, [project_id]);
        if (projResult.rows.length === 0) return { error: "Project not found" };
        // Get all tasks
        const tasksResult = await pool.query(
          `SELECT id, title, status, priority, assigned_agent, depends_on, started_at, completed_at, retries, sort_order
           FROM project_tasks WHERE project_id = $1 ORDER BY sort_order ASC, created_at ASC`,
          [project_id],
        );
        // Get next executable tasks using DB function
        let nextTasks = [];
        try {
          const nextResult = await pool.query(`SELECT * FROM get_next_executable_tasks($1, 10)`, [project_id]);
          nextTasks = nextResult.rows;
        } catch { /* function may not exist yet */ }
        return {
          project: projResult.rows[0],
          tasks: tasksResult.rows,
          nextExecutableTasks: nextTasks,
        };
      }),
    }),
    project_list: tool({
      description: "List all projects, optionally filtered by status.",
      inputSchema: zodSchema(z.object({
        status: z.string().optional().describe("Filter by status (planning/in_progress/completed/failed/cancelled)"),
        limit: z.number().optional().describe("Max projects to return"),
      })),
      execute: safeJsonWrap(async ({ status, limit }) => {
        let query = `SELECT * FROM projects`;
        const params = [];
        if (status) {
          params.push(status);
          query += ` WHERE status = $1`;
        }
        query += ` ORDER BY created_at DESC`;
        if (limit) {
          params.push(limit);
          query += ` LIMIT $${params.length}`;
        }
        const result = await pool.query(query, params);
        return result.rows;
      }),
    }),
    project_decompose: tool({
      description: "Decompose a project goal into structured tasks with dependencies. Returns a task plan that can be added to a project using project_add_task.",
      inputSchema: zodSchema(z.object({
        goal: z.string().describe("Project goal to decompose"),
        context: z.string().optional().describe("Additional context or constraints"),
        max_tasks: z.number().optional().describe("Max tasks (default 8, max 15)"),
        complexity: z.enum(["simple", "moderate", "complex"]).optional().describe("Complexity level"),
      })),
      execute: safeJsonWrap(async ({ goal, context, max_tasks, complexity }) => {
        // Use the general agent's model for decomposition
        const agent = AGENTS.general;
        const model = getProvider(agent);
        const { generateText } = await import("ai");

        const result = await generateText({
          model,
          system: `You are a project planner. Decompose goals into tasks. Output ONLY valid JSON with format: {"tasks":[{"title":"...","description":"...","task_type":"research|code|design|testing|deployment|docs|communication|general","priority":"critical|high|medium|low","assigned_agent":"general|mail|code|data|research|ops|creative","depends_on":[],"task_prompt":"...","sort_order":0}]}`,
          messages: [{ role: "user", content: `Decompose: ${goal}\n${context ? "Context: " + context : ""}\nComplexity: ${complexity || "moderate"}, Max: ${Math.min(max_tasks || 8, 15)} tasks` }],
          maxOutputTokens: 8192,
          abortSignal: AbortSignal.timeout(60000),
        });

        let jsonStr = result.text.trim();
        const fenceMatch = jsonStr.match(/\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`/);
        if (fenceMatch) jsonStr = fenceMatch[1];
        try {
          const plan = JSON.parse(jsonStr);
          return { success: true, tasks: plan.tasks || [], total: (plan.tasks || []).length };
        } catch {
          return { success: false, error: "Failed to parse decomposition result", raw: result.text.slice(0, 500) };
        }
      }),
    }),

    // Phase 5: Full Autonomous Project Lifecycle
    project_update: tool({
      description: "Update project metadata or status. Can change name, description, priority, deadline, status (in_progress, on_hold, cancelled).",
      inputSchema: zodSchema(z.object({
        project_id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        priority: z.enum(["critical", "high", "medium", "low"]).optional(),
        status: z.enum(["in_progress", "on_hold", "cancelled"]).optional(),
        deadline: z.string().optional(),
      })),
      execute: safeJsonWrap(async ({ project_id, name, description, priority, status, deadline }) => {
        const setClauses = [];
        const values = [];
        let idx = 1;
        if (name) { setClauses.push(`name = $${idx++}`); values.push(name); }
        if (description !== undefined) { setClauses.push(`description = $${idx++}`); values.push(description); }
        if (priority) { setClauses.push(`priority = $${idx++}`); values.push(priority); }
        if (status) { setClauses.push(`status = $${idx++}`); values.push(status); }
        if (deadline) { setClauses.push(`deadline = $${idx++}`); values.push(deadline); }
        if (setClauses.length === 0) return { success: false, error: "No fields to update" };
        values.push(project_id);
        const result = await pool.query(`UPDATE projects SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING id, name, status, priority, total_tasks, completed_tasks, failed_tasks`, values);
        if (result.rows.length === 0) return { success: false, error: `Project ${project_id} not found` };
        return { success: true, project: result.rows[0] };
      }),
    }),
    project_delete: tool({
      description: "Cancel/archive a project and stop all its pending tasks.",
      inputSchema: zodSchema(z.object({
        project_id: z.number(),
        reason: z.string().optional(),
      })),
      execute: safeJsonWrap(async ({ project_id, reason }) => {
        const result = await pool.query(
          `UPDATE projects SET status = 'cancelled', metadata = jsonb_set(COALESCE(metadata, '{}'), '{cancelled_reason}', $1) WHERE id = $2 RETURNING id, name, status`,
          [JSON.stringify(reason || "User cancelled"), project_id],
        );
        if (result.rows.length === 0) return { success: false, error: `Project ${project_id} not found` };
        await pool.query(`UPDATE project_tasks SET status = 'cancelled' WHERE project_id = $1 AND status IN ('pending', 'queued', 'in_progress')`, [project_id]);
        return { success: true, project: result.rows[0], message: "Project cancelled, pending tasks stopped" };
      }),
    }),
    project_retry_task: tool({
      description: "Retry a failed project task. Resets it to 'pending' so the executor picks it up.",
      inputSchema: zodSchema(z.object({ task_id: z.number() })),
      execute: safeJsonWrap(async ({ task_id }) => {
        const current = await pool.query(`SELECT * FROM project_tasks WHERE id = $1`, [task_id]);
        if (current.rows.length === 0) return { success: false, error: `Task ${task_id} not found` };
        if (current.rows[0].status !== "failed") return { success: false, error: `Task ${task_id} is not failed (current: ${current.rows[0].status})` };
        await pool.query(`UPDATE project_tasks SET status = 'pending', error = NULL, result = NULL, retries = retries + 1, started_at = NULL, completed_at = NULL WHERE id = $1`, [task_id]);
        await pool.query(`INSERT INTO project_task_logs (project_id, task_id, action, status, message) VALUES ($1, $2, 'retry', 'started', 'Manual retry')`, [current.rows[0].project_id, task_id]);
        return { success: true, task_id, retries: current.rows[0].retries + 1, message: "Task reset to pending" };
      }),
    }),
    project_skip_task: tool({
      description: "Skip a blocked or failed task. Unblocks dependent tasks.",
      inputSchema: zodSchema(z.object({ task_id: z.number(), reason: z.string().optional() })),
      execute: safeJsonWrap(async ({ task_id, reason }) => {
        const current = await pool.query(`SELECT * FROM project_tasks WHERE id = $1`, [task_id]);
        if (current.rows.length === 0) return { success: false, error: `Task ${task_id} not found` };
        await pool.query(`UPDATE project_tasks SET status = 'skipped' WHERE id = $1`, [task_id]);
        await pool.query(`INSERT INTO project_task_logs (project_id, task_id, action, status, message) VALUES ($1, $2, 'skip', 'completed', $3)`, [current.rows[0].project_id, task_id, `Skipped: ${reason || "User request"}`]);
        return { success: true, task_id, message: "Task skipped — dependents unblocked" };
      }),
    }),
    project_decompose_and_add: tool({
      description: "ALL-IN-ONE: Decompose a goal into tasks AND add them to a project. Use this for fast project setup.",
      inputSchema: zodSchema(z.object({
        project_id: z.number(),
        goal: z.string(),
        context: z.string().optional(),
        complexity: z.enum(["simple", "moderate", "complex"]).optional(),
        max_tasks: z.number().optional(),
      })),
      execute: safeJsonWrap(async ({ project_id, goal, context, complexity, max_tasks }) => {
        const proj = await pool.query("SELECT id, name, status FROM projects WHERE id = $1", [project_id]);
        if (proj.rows.length === 0) return { success: false, error: `Project ${project_id} not found` };

        const model = getProvider(AGENTS.general);
        const { generateText } = await import("ai");
        const result = await generateText({
          model,
          system: `Decompose goals into JSON: {"tasks":[{"title","description","task_type":"research|code|design|testing|deployment|docs|communication|general","priority":"critical|high|medium|low","assigned_agent":"general|mail|code|data|research|ops|creative","depends_on":[],"task_prompt":"...","sort_order":0}]}`,
          messages: [{ role: "user", content: `Decompose: ${goal}\n${context ? "Context: " + context : ""}\nComplexity: ${complexity || "moderate"}, Max: ${Math.min(max_tasks || 8, 15)}` }],
          maxOutputTokens: 8192,
          abortSignal: AbortSignal.timeout(60000),
        });

        let jsonStr = result.text.trim();
        const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (fenceMatch) jsonStr = fenceMatch[1];
        const plan = JSON.parse(jsonStr);
        const tasks = plan.tasks || [];
        if (tasks.length === 0) return { success: false, error: "AI returned no tasks" };

        const inserted = [];
        const titleToId = {};
        for (const t of tasks) {
          const depIds = (t.depends_on || []).map(title => titleToId[title]).filter(Boolean);
          const r = await pool.query(
            `INSERT INTO project_tasks (project_id, title, description, task_type, priority, assigned_agent, depends_on, task_prompt, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, title, priority, assigned_agent`,
            [project_id, t.title, t.description || "", t.task_type || "general", t.priority || "medium", t.assigned_agent || "general", depIds.length > 0 ? depIds : null, t.task_prompt || t.description || "", t.sort_order || inserted.length],
          );
          inserted.push(r.rows[0]);
          titleToId[t.title] = r.rows[0].id;
        }
        await pool.query("SELECT update_project_task_counts($1)", [project_id]);
        return { success: true, project_id, project_name: proj.rows[0].name, tasks_added: inserted.length, tasks: inserted };
      }),
    }),
    project_health: tool({
      description: "Get health report for all active projects. Identifies stalled, overdue, and degraded projects.",
      inputSchema: zodSchema(z.object({ include_completed: z.boolean().optional() })),
      execute: safeJsonWrap(async ({ include_completed }) => {
        const result = await pool.query("SELECT * FROM get_project_health_report()");
        let completed = [];
        if (include_completed) {
          const comp = await pool.query(`SELECT id as project_id, name as project_name, status, total_tasks, completed_tasks, failed_tasks, 'healthy' as health_status, 'All tasks completed' as health_reason FROM projects WHERE status IN ('completed', 'failed') ORDER BY completed_at DESC LIMIT 10`);
          completed = comp.rows;
        }
        return {
          summary: {
            total_active: result.rows.length,
            healthy: result.rows.filter(p => ["on_track", "ready_to_start"].includes(p.health_status)).length,
            stalled: result.rows.filter(p => p.health_status === "stalled").length,
            overdue: result.rows.filter(p => p.health_status === "overdue").length,
            needs_attention: result.rows.filter(p => ["stalled", "overdue", "degraded", "failed"].includes(p.health_status)).length,
          },
          projects: result.rows,
          completed_projects: completed,
        };
      }),
    }),

    // Phase 4: A2A Real-Time Communication
    a2a_send_message: tool({
      description: "Send a direct message to another agent. Available agents: general, mail, code, data, creative, research, ops.",
      inputSchema: zodSchema(z.object({
        to_agent: z.string().describe("Target agent ID"),
        topic: z.string().describe("Message topic"),
        content: z.string().describe("Message content"),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional().describe("Priority"),
      })),
      execute: safeJsonWrap(async ({ to_agent, topic, content, priority }) => {
        const result = await pool.query(
          `INSERT INTO a2a_messages (from_agent, to_agent, type, topic, payload, priority)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [currentAgentId || "general", to_agent, "request", topic, JSON.stringify({ content }), priority || "normal"],
        );
        return { success: true, messageId: result.rows[0]?.id, to: to_agent, topic };
      }),
    }),
    a2a_broadcast: tool({
      description: "Broadcast a message to all agents or a subset.",
      inputSchema: zodSchema(z.object({
        topic: z.string().describe("Broadcast topic"),
        content: z.string().describe("Broadcast content"),
        targets: z.array(z.string()).optional().describe("Target agents (default: all)"),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional().describe("Priority"),
      })),
      execute: safeJsonWrap(async ({ topic, content, targets, priority }) => {
        const allAgents = targets || ["general", "mail", "code", "data", "creative", "research", "ops"].filter(a => a !== (currentAgentId || "general"));
        const results = await Promise.all(allAgents.map(agent =>
          pool.query(
            `INSERT INTO a2a_messages (from_agent, to_agent, type, topic, payload, priority) VALUES ($1, $2, 'broadcast', $3, $4, $5)`,
            [currentAgentId || "general", agent, topic, JSON.stringify({ content }), priority || "normal"],
          )
        ));
        return { success: true, sentTo: allAgents, totalSent: results.length };
      }),
    }),
    a2a_check_inbox: tool({
      description: "Check your A2A inbox for unread messages.",
      inputSchema: zodSchema(z.object({ limit: z.number().optional().describe("Max messages (default: 20)") })),
      execute: safeJsonWrap(async ({ limit }) => {
        const result = await pool.query(`SELECT * FROM get_agent_inbox($1, $2)`, [currentAgentId || "general", limit || 20]);
        const msgs = result.rows;
        if (msgs.length > 0) {
          await pool.query(`SELECT mark_messages_read($1, $2::bigint[])`, [currentAgentId || "general", msgs.map(m => m.id)]);
        }
        return { unreadCount: msgs.length, messages: msgs.map(m => ({ id: m.id, from: m.from_agent, type: m.type, topic: m.topic, priority: m.priority, content: m.payload?.content || "" })) };
      }),
    }),
    a2a_share_context: tool({
      description: "Share data/findings with other agents.",
      inputSchema: zodSchema(z.object({
        context_key: z.string().describe("Unique key"),
        content: z.string().describe("Content to share"),
        tags: z.array(z.string()).optional().describe("Tags"),
        scope: z.enum(["global", "project", "session", "agent"]).optional().describe("Scope"),
      })),
      execute: safeJsonWrap(async ({ context_key, content, tags, scope }) => {
        const result = await pool.query(
          `SELECT upsert_shared_context($1, $2, $3, $4, $5, '{}', $6, NULL, NULL)`,
          [context_key, currentAgentId || "general", JSON.stringify({ text: content }), content, JSON.stringify(tags || []), scope || "project"],
        );
        return { success: true, contextId: result.rows[0]?.upsert_shared_context, key: context_key };
      }),
    }),
    a2a_query_context: tool({
      description: "Query shared context from other agents.",
      inputSchema: zodSchema(z.object({
        context_key: z.string().optional().describe("Key to look up"),
        tags: z.array(z.string()).optional().describe("Filter by tags"),
        limit: z.number().optional().describe("Max results"),
      })),
      execute: safeJsonWrap(async ({ context_key, tags, limit }) => {
        let query = `SELECT id, context_key, agent_id, content_text, tags, scope, version FROM a2a_shared_context WHERE is_latest = TRUE`;
        const params = [];
        if (context_key) { params.push(context_key); query += ` AND context_key = $${params.length}`; }
        if (tags && tags.length > 0) { params.push(tags); query += ` AND tags ?| $${params.length}`; }
        query += ` ORDER BY updated_at DESC LIMIT $${params.length + 1}`;
        params.push(limit || 10);
        const result = await pool.query(query, params);
        return { found: result.rows.length, contexts: result.rows };
      }),
    }),
    a2a_collaborate: tool({
      description: "Post to a multi-agent collaboration channel.",
      inputSchema: zodSchema(z.object({
        channel_name: z.string().describe("Channel name"),
        message: z.string().describe("Message content"),
        members: z.array(z.string()).optional().describe("Channel members"),
      })),
      execute: safeJsonWrap(async ({ channel_name, message, members }) => {
        const allMembers = members || ["general", "mail", "code", "data", "creative", "research", "ops"];
        let ch = await pool.query(`SELECT id FROM a2a_channels WHERE name = $1 AND is_active = TRUE LIMIT 1`, [channel_name]);
        let channelId = ch.rows[0]?.id;
        if (!channelId) {
          ch = await pool.query(`INSERT INTO a2a_channels (name, channel_type, members, created_by) VALUES ($1, 'project', $2, $3) RETURNING id`, [channel_name, allMembers, currentAgentId || "general"]);
          channelId = ch.rows[0]?.id;
        }
        if (!channelId) return { success: false, error: "Failed to create channel" };
        await pool.query(`INSERT INTO a2a_channel_messages (channel_id, agent_id, content, message_type) VALUES ($1, $2, $3, 'message')`, [channelId, currentAgentId || "general", message]);
        await pool.query(`UPDATE a2a_channels SET last_message_at = NOW(), message_count = message_count + 1 WHERE id = $1`, [channelId]);
        return { success: true, channelId, channel: channel_name };
      }),
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
      maxOutputTokens: 32768,
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

// Detect stale running tasks (from crashed previous executions)
async function recoverStaleTasks() {
  const result = await pool.query(
    `UPDATE agent_tasks SET status = 'pending', error = '[Auto-recovered] Previous execution may have crashed'
     WHERE status = 'running' AND started_at < NOW() - INTERVAL '10 minutes'
     RETURNING id, task`
  );
  if (result.rows.length > 0) {
    console.log(`[Recovery] Reset ${result.rows.length} stale tasks to pending`);
    for (const row of result.rows) {
      console.log(`  - Task #${row.id}: ${row.task.slice(0, 60)}`);
    }
  }
  // Also recover stale project tasks
  const ptResult = await pool.query(
    `UPDATE project_tasks SET status = 'pending', error = '[Auto-recovered] Previous execution may have crashed'
     WHERE status = 'in_progress' AND started_at < NOW() - INTERVAL '10 minutes'
     RETURNING id, title`
  );
  if (ptResult.rows.length > 0) {
    console.log(`[Recovery] Reset ${ptResult.rows.length} stale project tasks to pending`);
  }
}

async function main() {
  const summary = { tasksProcessed: 0, succeeded: 0, failed: 0, automationsTriggered: 0, skipped: 0 };

  try {
    // Recover stale tasks from crashed previous executions
    await recoverStaleTasks();

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

      // Rate limit: wait between tasks to avoid API throttling
      if (i < maxTasks - 1) {
        console.log(`[Rate Limit] Waiting 3s before next task...`);
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    // Phase 3: Process project tasks (task graph execution)
    console.log(`\n[Phase 3] Processing project tasks...`);
    try {
      const projectTasksResult = await pool.query(
        `SELECT pt.*, p.name as project_name
         FROM project_tasks pt
         JOIN projects p ON p.id = pt.project_id
         WHERE pt.status IN ('pending', 'queued')
         AND (array_length(pt.depends_on, 1) IS NULL OR NOT EXISTS (
           SELECT 1 FROM project_tasks dep WHERE dep.id = ANY(pt.depends_on) AND dep.status NOT IN ('completed', 'skipped')
         ))
         AND NOT EXISTS (
           SELECT 1 FROM project_tasks dep WHERE dep.id = ANY(pt.depends_on) AND dep.status = 'failed'
         )
         ORDER BY CASE pt.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 2 END, pt.sort_order ASC
         LIMIT 3`
      );

      for (const pt of projectTasksResult.rows) {
        if (summary.tasksProcessed >= maxTasks) break;
        summary.tasksProcessed++;

        const agentId = pt.assigned_agent || "general";
        const agentDef = AGENTS[agentId];
        if (!agentDef) {
          console.log(`[Phase 3] Skipping project task #${pt.id}: unknown agent ${agentId}`);
          continue;
        }

        console.log(`[Phase 3] Project "${pt.project_name}" task #${pt.id}: "${pt.title}" (agent: ${agentId})`);

        // Mark as in_progress
        await pool.query(`UPDATE project_tasks SET status = 'in_progress', started_at = NOW() WHERE id = $1`, [pt.id]);

        // Log execution start
        await pool.query(
          `INSERT INTO project_task_logs (project_id, task_id, action, status, agent_id, agent_name) VALUES ($1, $2, 'execute', 'started', $3, $4)`,
          [pt.project_id, pt.id, agentId, agentDef.name],
        );

        // Build task prompt from project task
        const taskPrompt = pt.task_prompt || pt.title;

        // Collect project context for richer system prompt
        let projectContext = "";
        try {
          const projResult = await pool.query(`SELECT name, description, tags FROM projects WHERE id = $1`, [pt.project_id]);
          if (projResult.rows.length > 0) {
            const proj = projResult.rows[0];
            projectContext = `\n\n[PROJECT CONTEXT]\nProject: ${proj.name}\nDescription: ${proj.description || "N/A"}\nYour task: ${pt.title}\n${pt.description ? "Task Details: " + pt.description + "\n" : ""}`;
            // Collect completed dependency results for context
            if (pt.depends_on && pt.depends_on.length > 0) {
              const depResults = await pool.query(
                `SELECT title, result FROM project_tasks WHERE id = ANY($1::bigint[]) AND status = 'completed'`,
                [pt.depends_on]
              );
              if (depResults.rows.length > 0) {
                projectContext += "\n[COMPLETED DEPENDENCY RESULTS]\n";
                for (const dep of depResults.rows) {
                  projectContext += `- ${dep.title}: ${(dep.result || "(no output)").slice(0, 1000)}\n`;
                }
              }
            }
          }
        } catch { /* non-critical */ }

        const taskContext = `${projectContext || ""}\nProject: ${pt.project_name}`;

        // Execute using the existing executeTask function, wrapped as a virtual task
        const virtualTask = {
          id: `pt-${pt.id}`,
          agent_id: agentId,
          task: taskPrompt,
          context: taskContext,
          trigger_type: "project",
          trigger_source: `project:${pt.project_id}:task:${pt.id}`,
        };

        const result = await executeTask(virtualTask);
        const durationMs = result.durationMs || 0;

        // Log execution result
        await pool.query(
          `INSERT INTO project_task_logs (project_id, task_id, action, status, agent_id, agent_name, message, tool_calls, steps_used, duration_ms) VALUES ($1, $2, 'execute', $3, $4, $5, $6, $7, $8, $9)`,
          [pt.project_id, pt.id, result.success ? "completed" : "failed", agentId, agentDef.name,
           (result.text || result.error || "").slice(0, 2000),
           JSON.stringify(result.toolCalls || []),
           result.stepsUsed || 0, durationMs],
        );

        if (result.success) {
          await pool.query(
            `UPDATE project_tasks SET status = 'completed', result = $1, completed_at = NOW(), steps_used = $2, duration_ms = $3 WHERE id = $4`,
            [result.text.slice(0, 10000), result.stepsUsed || 0, durationMs, pt.id],
          );
          summary.succeeded++;
          console.log(`[Phase 3] Task #${pt.id} completed in ${durationMs}ms`);
        } else {
          const newRetries = (pt.retries || 0) + 1;
          if (newRetries < (pt.max_retries || 2)) {
            await pool.query(
              `UPDATE project_tasks SET status = 'pending', retries = $1, error = $2, completed_at = NOW() WHERE id = $3`,
              [newRetries, result.error?.slice(0, 5000), pt.id],
            );
            console.log(`[Phase 3] Task #${pt.id} failed (retry ${newRetries}/${pt.max_retries || 2}): ${result.error?.slice(0, 100)}`);
          } else {
            await pool.query(
              `UPDATE project_tasks SET status = 'failed', error = $1, completed_at = NOW() WHERE id = $2`,
              [result.error?.slice(0, 5000), pt.id],
            );
            summary.failed++;
            console.log(`[Phase 3] Task #${pt.id} permanently failed: ${result.error?.slice(0, 100)}`);
          }
        }

        // Rate limit: wait between project tasks to avoid API throttling
        if (projectTasksResult.rows.indexOf(pt) < projectTasksResult.rows.length - 1 && summary.tasksProcessed < maxTasks) {
          console.log(`[Rate Limit] Waiting 3s before next project task...`);
          await new Promise(r => setTimeout(r, 3000));
        }
      }

      console.log(`[Phase 3] Processed ${projectTasksResult.rows.length} project tasks`);
    } catch (e) {
      console.error(`[Phase 3] Error:`, e.message);
    }

    console.log(`\n[Done] ${summary.succeeded} succeeded, ${summary.failed} failed, ${summary.skipped} skipped (dry run) | ${summary.automationsTriggered} automations triggered`);
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
