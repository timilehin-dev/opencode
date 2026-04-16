// ---------------------------------------------------------------------------
// Claw AI Agent System — Tool Definitions for Vercel AI SDK v6
// ---------------------------------------------------------------------------
// Maps all existing API capabilities to AI SDK tool definitions.
// Uses `tool()` helper with `zodSchema()` for proper type safety.
// ---------------------------------------------------------------------------

import { z } from "zod";
import { tool, zodSchema } from "ai";

// z-ai-web-dev-sdk for web tools (local Z.ai environment only)
import ZAI from 'z-ai-web-dev-sdk';

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

  const data = await res.json();

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
} from "./google";

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

// ---------------------------------------------------------------------------
// Helper: wrap async fn in try/catch returning JSON string
// ---------------------------------------------------------------------------

function safeJson<T>(fn: (input: T) => Promise<unknown>) {
  return async (input: T) => {
    try {
      const result = await fn(input);
      return JSON.stringify({ success: true, data: result });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };
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
  description: "Fetch emails from Gmail inbox. Use this to read recent emails or get messages with optional filters.",
  inputSchema: zodSchema(z.object({
    query: z.string().optional().describe("Gmail search query (e.g., 'is:unread', 'from:someone@example.com', 'subject:urgent')"),
    maxResults: z.number().optional().describe("Max number of emails to fetch (default: 10)"),
    labelIds: z.array(z.string()).optional().describe("Filter by label IDs (e.g., ['INBOX', 'UNREAD'])"),
  })),
  execute: safeJson(async ({ query, maxResults, labelIds }) => {
    return await gGmailFetchEmails({ query, maxResults: maxResults || 10, labelIds });
  }),
});

export const gmailSearchTool = tool({
  description: "Search Gmail messages using a query string. Returns matching messages with metadata.",
  inputSchema: zodSchema(z.object({
    query: z.string().describe("Search query string"),
    maxResults: z.number().optional().describe("Max results to return (default: 20)"),
  })),
  execute: safeJson(async ({ query, maxResults }) => {
    return await gGmailFetchEmails({ query, maxResults: maxResults || 20 });
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
    return await gCalCreateEvent(calendarId || "primary", {
      summary,
      start: { dateTime: start.includes("T") ? start : undefined, date: start.includes("T") ? undefined : start },
      end: { dateTime: end.includes("T") ? end : undefined, date: end.includes("T") ? undefined : end },
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

export const delegateToAgentTool = tool({
  description: "Delegate a task to a specialist agent. Only use when the task is clearly within one specialist's domain and doesn't require cross-domain reasoning. Available agents: mail (email/calendar), code (GitHub/Vercel), data (Drive/Sheets/Docs), creative (content/planning/docs), research (deep research/intelligence), ops (monitoring/health). Returns the specialist agent's response.",
  inputSchema: zodSchema(z.object({
    agent_id: z.enum(["mail", "code", "data", "creative", "research", "ops"]).describe("The specialist agent to delegate to"),
    task: z.string().describe("Clear, specific task description with all necessary context"),
  })),
  execute: safeJson(async ({ agent_id, task }) => {
    // This tool is executed server-side — we make an internal call to the agent
    // The actual delegation happens via a fetch to /api/chat internally
    const taskId = `a2a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Log the A2A delegation task in Supabase (fire-and-forget)
    try {
      const { Pool } = require('pg');
      const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL });
      await pool.query(
        `INSERT INTO a2a_tasks (initiator_agent, assigned_agent, task, context, status, delegation_chain)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['general', agent_id, task, 'Delegated by Claw General via delegate_to_agent tool', 'in_progress', ['general', agent_id]]
      );
      await pool.end();
    } catch {
      // A2A logging is non-critical
    }

    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000";

      const response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agent_id,
          messages: [{ role: "user", content: `[Delegated from Claw General] ${task}` }],
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        // Update A2A task status to failed
        try {
          const { Pool } = require('pg');
          const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL });
          await pool.query(`UPDATE a2a_tasks SET status = 'failed', result = $1 WHERE id = $2`, [error, taskId]);
          await pool.end();
        } catch { /* non-critical */ }
        return { success: false, error: `Agent ${agent_id} failed: ${error}` };
      }

      // Read the streaming response and collect the text
      const reader = response.body?.getReader();
      if (!reader) return { success: false, error: "No response from agent" };

      const decoder = new TextDecoder();
      let fullText = "";
      let done = false;

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          // Parse SSE-like lines for text content
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("0:")) {
              try {
                const parsed = JSON.parse(line.slice(2));
                if (typeof parsed === "string") fullText += parsed;
              } catch { /* skip malformed chunks */ }
            }
          }
        }
      }

      // Update A2A task status to completed
      try {
        const { Pool } = require('pg');
        const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL });
        await pool.query(
          `UPDATE a2a_tasks SET status = 'completed', result = $1, completed_at = NOW() WHERE id = $2`,
          [fullText.trim().slice(0, 2000), taskId]
        );
        await pool.end();
      } catch { /* non-critical */ }

      return { success: true, agent: agent_id, response: fullText.trim() || "(Agent returned no text response)", taskId };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Delegation failed", taskId };
    }
  }),
});

// ---------------------------------------------------------------------------
// Web Search Tool
// ---------------------------------------------------------------------------

export const webSearchTool = tool({
  description: "Search the web for real-time information, news, documentation, market data, trends, competitor analysis, or any current information. Use this when you need up-to-date facts, research topics, look up company details, find documentation, or gather context that goes beyond your training data.",
  inputSchema: zodSchema(z.object({
    query: z.string().describe("Search query — be specific and use keywords. Examples: 'Next.js 15 Server Actions docs', 'Q4 2024 SaaS market trends', 'OpenAI GPT-5 release date'"),
    num_results: z.number().optional().describe("Number of results to return (default: 10, max: 20)"),
  })),
  execute: safeJson(async ({ query, num_results }) => {
    const zai = await ZAI.create();
    const results = await zai.functions.invoke("web_search", { query, num: num_results || 10 });
    return results;
  }),
});

// ---------------------------------------------------------------------------
// Web Reader Tool
// ---------------------------------------------------------------------------

export const webReaderTool = tool({
  description: "Read and extract content from a web page URL. Returns the page title, main content (HTML), publication time, and URL. Use this to read articles, documentation pages, reports, or any web content for detailed analysis. Always use this after web_search when you need the full content of a result.",
  inputSchema: zodSchema(z.object({
    url: z.string().describe("The full URL of the web page to read. Must include protocol (https://)"),
  })),
  execute: safeJson(async ({ url }) => {
    const zai = await ZAI.create();
    const result = await zai.functions.invoke("page_reader", { url });
    return result;
  }),
});

// ---------------------------------------------------------------------------
// Query Agent Tool (A2A — for specialist agents)
// ---------------------------------------------------------------------------

export const queryAgentTool = tool({
  description: "AUTONOMOUSLY route a task to another specialist agent for execution. Use this whenever you need a capability outside your tool domain — the target agent will EXECUTE the task directly, not just answer questions. ALWAYS include ALL details the target agent needs (recipient emails, file content, times, descriptions, etc.). The user has pre-authorized cross-agent collaboration — do NOT ask for permission, just route and execute. Available agents: general (orchestrator, ALL tools), mail (email/calendar/meeting invites/Google Meet), code (GitHub/Vercel/DevOps), data (Drive/Sheets/Docs/analysis/vision), creative (content/strategy/docs/planning/design), research (deep research/intelligence/briefs), ops (monitoring/health/deployments).",
  inputSchema: zodSchema(z.object({
    agent_id: z.enum(["general", "mail", "code", "data", "creative", "research", "ops"]).describe("The specialist agent to route the task to"),
    question: z.string().describe("Complete task description with ALL context the target agent needs. Include: what to do, who/what/where/when details, any content to send, file IDs, email addresses, times, etc. Be SPECIFIC and provide everything needed for autonomous execution."),
  })),
  execute: safeJson(async ({ agent_id, question }) => {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000";

      const response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agent_id,
          messages: [{ role: "user", content: `[Query from peer agent] ${question}` }],
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Agent ${agent_id} failed: ${error}` };
      }

      const reader = response.body?.getReader();
      if (!reader) return { success: false, error: "No response from agent" };

      const decoder = new TextDecoder();
      let fullText = "";
      let done = false;

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("0:")) {
              try {
                const parsed = JSON.parse(line.slice(2));
                if (typeof parsed === "string") fullText += parsed;
              } catch { /* skip */ }
            }
          }
        }
      }

      return { success: true, agent: agent_id, response: fullText.trim() || "(Agent returned no text response)" };
    } catch (error) {
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
    if (!threadRes.ok) throw new Error(`Failed to fetch thread: ${threadRes.status}`);
    const threadData = (await threadRes.json()) as { messages?: Array<{ payload?: { headers?: Array<{ name: string; value: string }> } }> };
    const lastMsg = threadData.messages?.[threadData.messages.length - 1];
    const headers = lastMsg?.payload?.headers || [];
    const getHeader = (name: string) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || "";
    const originalMessageId = getHeader("Message-Id");
    const originalReferences = getHeader("References");

    // Build RFC 2822 reply message
    let message = "";
    message += `To: ${to}\r\n`;
    if (cc?.length) message += `Cc: ${cc.join(", ")}\r\n`;
    if (bcc?.length) message += `Bcc: ${bcc.join(", ")}\r\n`;
    message += `Subject: ${subject || getHeader("Subject") || ""}\r\n`;
    message += "Content-Type: text/html; charset=utf-8\r\n";
    message += "MIME-Version: 1.0\r\n";
    if (originalMessageId) message += `In-Reply-To: ${originalMessageId}\r\n`;
    if (originalMessageId) message += `References: ${originalReferences ? originalReferences + " " : ""}${originalMessageId}\r\n`;
    message += "\r\n";
    message += isHtml ? body : body;

    const encoded = Buffer.from(message).toString("base64url");
    const res = await googleFetch("https://www.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      body: JSON.stringify({ raw: encoded, threadId }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gmail reply error: ${res.status} — ${err}`);
    }
    return res.json();
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
    if (!res.ok) throw new Error(`Gmail thread error: ${res.status}`);
    const data = (await res.json()) as {
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
        content = Buffer.from(msg.payload.body.data, "base64").toString("utf-8");
      } else if (msg.payload?.parts) {
        for (const part of msg.payload.parts) {
          if (part.mimeType === "text/plain" && part.body?.data) {
            content = Buffer.from(part.body.data, "base64").toString("utf-8");
            break;
          }
          if (part.mimeType === "text/html" && part.body?.data) {
            content = Buffer.from(part.body.data, "base64").toString("utf-8");
          }
        }
      }
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
      case "delete":
        addLabelIds.push("TRASH");
        removeLabelIds.push("INBOX");
        break;
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
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gmail batch modify error: ${res.status} — ${err}`);
    }
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
    if (!res.ok) throw new Error(`Calendar freebusy error: ${res.status}`);
    return res.json();
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
  description: "Trigger a redeployment on Vercel for a project.",
  inputSchema: zodSchema(z.object({
    projectIdOrName: z.string().describe("Vercel project ID or name"),
  })),
  execute: safeJson(async ({ projectIdOrName }) => {
    return { success: true, message: "Redeployment triggered", projectIdOrName };
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
    const data = (await res.json()) as { events: Array<{ type: string; text: string; created: number; payload?: string }> };

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
    if (!res.ok) throw new Error(`Sheets clear error: ${res.status}`);
    return res.json();
  }),
});

// ---------------------------------------------------------------------------
// Vision Analyze Tool (OCR.space — FREE, no LLM token consumption)
// ---------------------------------------------------------------------------

export const visionAnalyzeTool = tool({
  description: "Extract text from images using OCR (Optical Character Recognition). This is a FREE service — no LLM tokens consumed. Supports screenshots, scanned documents, photos with text, receipts, invoices, etc. For Google Drive files, use vision_download_analyze instead (handles download + OCR in one step).",
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
    const data = await res.json();
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
    const data = await res.json();
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
// Data Calculate Tool (BUG FIX — was referenced but never defined)
// ---------------------------------------------------------------------------

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
      // Try to evaluate math expression safely
      try {
        // Sanitize: only allow numbers, operators, parentheses, spaces, dots, and Math functions
        const sanitized = expression.replace(/[^0-9+\-*/().%\s^eEpiMathsincotaglqrtbfceilflorpowminslog]/g, "");
        // Convert ^ to ** and common math functions
        const mathExpr = sanitized
          .replace(/\^/g, "**")
          .replace(/sqrt\(/g, "Math.sqrt(")
          .replace(/abs\(/g, "Math.abs(")
          .replace(/ceil\(/g, "Math.ceil(")
          .replace(/floor\(/g, "Math.floor(")
          .replace(/pow\(/g, "Math.pow(")
          .replace(/min\(/g, "Math.min(")
          .replace(/max\(/g, "Math.max(")
          .replace(/log\(/g, "Math.log(")
          .replace(/sin\(/g, "Math.sin(")
          .replace(/cos\(/g, "Math.cos(")
          .replace(/tan\(/g, "Math.tan(")
          .replace(/pi/gi, "Math.PI");
        // eslint-disable-next-line no-new-func
        const fn = new Function(`"use strict"; return (${mathExpr});`);
        const evalResult = fn();
        result.result = evalResult;
        result.evaluated = true;
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
    const zai = await ZAI.create();

    // Generate search queries from topic and aspects
    const queries = [
      topic,
      `${topic} overview`,
      `${topic} 2024`,
      ...(aspects || []).map(a => `${topic} ${a}`),
    ].slice(0, 5);

    // Run all queries in parallel
    const allResults = await Promise.all(
      queries.map(async (q) => {
        try {
          const results = await zai.functions.invoke("web_search", { query: q, num: numResults || 10 });
          return Array.isArray(results) ? results : (results as Record<string, unknown>)?.results || [];
        } catch {
          return [];
        }
      }),
    );

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
    const zai = await ZAI.create();

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

    const result = await zai.chat.completions.create({
      model: "coding-glm-5-turbo-free",
      messages: [{ role: "user", content: prompt }],
    });

    return {
      question,
      sourcesCount: findings.length,
      synthesis: typeof result === "string" ? result : JSON.stringify(result),
    };
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
  description: "Check the health status of all Claw services. Returns a structured health report for all 7 internal services.",
  inputSchema: zodSchema(z.object({})),
  execute: safeJson(async () => {
    const services = [
      "api-chat",
      "api-auth",
      "api-webhooks",
      "api-services",
      "ws-gateway",
      "agent-general",
      "agent-specialists",
    ];

    const healthReport = await Promise.allSettled(
      services.map(async (service) => {
        try {
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : "http://localhost:3000";

          const res = await fetch(`${baseUrl}/api/services?action=status&service=${service}`, {
            signal: AbortSignal.timeout(5000),
          });
          const status = res.ok ? "healthy" : "unhealthy";
          return { service, status, statusCode: res.status };
        } catch {
          return { service, status: "unreachable" };
        }
      }),
    );

    const results = healthReport.map(r =>
      r.status === "fulfilled" ? r.value : { service: "unknown", status: "error" }
    );

    const healthy = results.filter(r => r.status === "healthy").length;

    return {
      overallStatus: healthy === services.length ? "all_healthy" : healthy > 0 ? "degraded" : "down",
      healthyServices: healthy,
      totalServices: services.length,
      services: results,
      timestamp: new Date().toISOString(),
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
    const deployments = await listDeployments("claw-hq", 1);
    if (!deployments.length) {
      return { status: "no_deployments", message: "No deployments found for claw-hq" };
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
    const { writeFileSync } = await import("fs");
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

    const stream = require("fs").createWriteStream(filePath);
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

      // Regular paragraph — strip markdown formatting
      const cleanText = line
        .replace(/\*\*(.+?)\*\*/g, "$1") // Remove bold markers (PDFKit bold handling is complex)
        .replace(/\*(.+?)\*/g, "$1")
        .replace(/`([^`]+)`/g, "$1");
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
    return {
      filename: basename,
      title,
      downloadUrl: `/api/files/${basename}`,
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
          // Note: Table constructor may vary by docx version; using simple approach
          try {
            children.push(rows[0] as never);
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

      // Bullet list
      if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: line.trim().slice(2), size: 22, font: "Calibri", color: "374151" })],
            bullet: { level: 0 },
            spacing: { after: 60 },
          }),
        );
        continue;
      }

      // Numbered list
      const olMatch = line.trim().match(/^(\d+)\.\s(.+)/);
      if (olMatch) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: olMatch[2], size: 22, font: "Calibri", color: "374151" })],
            numbering: { reference: "default-numbering", level: 0 },
            spacing: { after: 60 },
          }),
        );
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

    const basename = filePath.split("/").pop() || "document.docx";
    return {
      filename: basename,
      title,
      downloadUrl: `/api/files/${basename}`,
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
// All Tools Registry
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolType = ReturnType<typeof tool<any, string>>;

export const allTools: Record<string, ToolType> = {
  // Gmail
  gmail_send: gmailSendTool,
  gmail_fetch: gmailFetchTool,
  gmail_search: gmailSearchTool,
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
  download_drive_file: downloadDriveFileTool,
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
