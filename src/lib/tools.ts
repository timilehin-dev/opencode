// ---------------------------------------------------------------------------
// Claw AI Agent System — Tool Definitions for Vercel AI SDK v6
// ---------------------------------------------------------------------------
// Maps all existing API capabilities to AI SDK tool definitions.
// Uses `tool()` helper with `zodSchema()` for proper type safety.
// ---------------------------------------------------------------------------

import { z } from "zod";
import { tool, zodSchema } from "ai";

// z-ai-web-dev-sdk for web tools
import ZAI from 'z-ai-web-dev-sdk';

// Google API imports
import {
  gGmailSendEmail,
  gGmailFetchEmails,
  gGmailListLabels,
  gGmailCreateLabel,
  gGmailDeleteLabel,
  gGmailProfile,
  gCalListCalendars,
  gCalListEvents,
  gCalCreateEvent,
  gCalDeleteEvent,
  gDriveListFiles,
  gDriveCreateFolder,
  gDriveCreateFile,
  gSheetsGet,
  gSheetsGetValues,
  gSheetsAppendValues,
  gSheetsUpdateValues,
  gSheetsCreate,
  gSheetsAddSheet,
  gDocsList,
  gDocsGet,
  gDocsCreate,
  gDocsAppendText,
} from "./google";

// GitHub API imports
import {
  getRepo,
  listIssues,
  createIssue,
  listPullRequests,
  listCommits,
  getRepoTree,
  getFileContent,
  searchCode,
  listBranches,
} from "./github";

// Vercel API imports
import { listProjects, listDeployments, listDomains } from "./vercel";

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
  description: "Delegate a task to a specialist agent. Only use when the task is clearly within one specialist's domain and doesn't require cross-domain reasoning. Available agents: mail (email/calendar), code (GitHub/Vercel), data (Drive/Sheets/Docs), creative (content/planning/docs). Returns the specialist agent's response.",
  inputSchema: zodSchema(z.object({
    agent_id: z.enum(["mail", "code", "data", "creative"]).describe("The specialist agent to delegate to"),
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
  description: "Query another specialist agent for information or collaboration. Use this to get input from another agent's domain expertise. Available agents: general (orchestrator), mail (email/calendar), code (GitHub/Vercel), data (Drive/Sheets/Docs), creative (content/planning).",
  inputSchema: zodSchema(z.object({
    agent_id: z.enum(["general", "mail", "code", "data", "creative"]).describe("The agent to query"),
    question: z.string().describe("Clear question or request for the other agent"),
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
  // Calendar
  calendar_list: calendarListTool,
  calendar_events: calendarEventsTool,
  calendar_create: calendarCreateTool,
  calendar_delete: calendarDeleteTool,
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
  // Vercel
  vercel_projects: vercelProjectsTool,
  vercel_deployments: vercelDeploymentsTool,
  vercel_domains: vercelDomainsTool,
  // Web Tools
  web_search: webSearchTool,
  web_reader: webReaderTool,
  // Agent Delegation
  delegate_to_agent: delegateToAgentTool,
  // A2A
  query_agent: queryAgentTool,
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
