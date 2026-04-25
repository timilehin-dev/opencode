// Direct Google API Client — bypasses Composio for full scope control
// Uses OAuth2 refresh tokens stored in env vars
// Token exchange: POST https://oauth2.googleapis.com/token

const TOKEN_URL = "https://oauth2.googleapis.com/token";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number; // Unix ms
}

// ---------------------------------------------------------------------------
// Token Cache (in-memory, per-process)
// ---------------------------------------------------------------------------

const tokenCache = new Map<string, CachedToken>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getClientId(): string {
  return process.env.GOOGLE_CLIENT_ID || "";
}

function getClientSecret(): string {
  return process.env.GOOGLE_CLIENT_SECRET || "";
}

function getRefreshToken(): string {
  return process.env.GOOGLE_REFRESH_TOKEN || "";
}

/**
 * Exchange a refresh token for a fresh access token.
 * Results are cached until expiry.
 */
export async function getAccessToken(): Promise<string> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new Error(
      "Google OAuth not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in .env.local",
    );
  }

  // Check cache first
  const cacheKey = refreshToken;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken;
  }

  // Fetch new token
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getClientId(),
      client_secret: getClientSecret(),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} — ${err}`);
  }

  const data = (await res.json()) as TokenResponse;

  // Cache the token
  tokenCache.set(cacheKey, {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });

  return data.access_token;
}

/** Safely parse JSON from a fetch Response — returns null on empty/truncated body */
export async function safeJsonParse(res: Response): Promise<any> {
  const text = await res.text().catch(() => "");
  if (!text || text.trim().length === 0) {
    throw new Error(`Empty response body (status ${res.status})`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON response (${res.status}): ${text.slice(0, 200)}${text.length > 200 ? '...' : ''}`);
  }
}

/** Make an authenticated request to a Google API */
export async function googleFetch(url: string, options?: RequestInit, retryCount = 0): Promise<Response> {
  const token = await getAccessToken();
  const isGet = !(options?.method && options.method !== 'GET');
  const res = await fetch(url, {
    ...options,
    headers: {
      ...options?.headers,
      Authorization: `Bearer ${token}`,
      ...(isGet ? {} : { "Content-Type": "application/json" }),
    },
  });
  // Retry on 401 (auth), 429 (rate limit), 503 (service unavailable) with exponential backoff + jitter
  if ((res.status === 401 || res.status === 429 || res.status === 503) && retryCount < 3) {
    if (res.status === 401) {
      // Clear all cached tokens to force re-authentication
      tokenCache.clear();
    }
    const backoffMs = res.status === 429 ? 2000 : 1000;
    const waitMs = backoffMs * Math.pow(2, retryCount) + Math.random() * 500;
    await new Promise(r => setTimeout(r, waitMs));
    return googleFetch(url, options, retryCount + 1);
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => "(could not read error body)");
    throw new Error(`Google API error ${res.status} on ${url.split('?')[0]}: ${errText.slice(0, 300)}`);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Calendar API (direct)
// ---------------------------------------------------------------------------

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  location?: string;
  description?: string;
  attendees?: { email: string; responseStatus?: string }[];
  htmlLink?: string;
  status?: string;
}

export interface GoogleCalendarList {
  id: string;
  summary: string;
  primary?: boolean;
  backgroundColor?: string;
  description?: string;
}

/** List all calendars */
export async function gCalListCalendars(): Promise<GoogleCalendarList[]> {
  const res = await googleFetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=20");
  const data = (await safeJsonParse(res)) as { items?: GoogleCalendarList[] };
  return data.items || [];
}

/** List events from primary calendar */
export async function gCalListEvents(
  calendarId = "primary",
  timeMin?: string,
  timeMax?: string,
  maxResults = 25,
): Promise<GoogleCalendarEvent[]> {
  const params = new URLSearchParams({ maxResults: String(maxResults), singleEvents: "true", orderBy: "startTime" });
  if (timeMin) params.set("timeMin", timeMin);
  if (timeMax) params.set("timeMax", timeMax);
  const res = await googleFetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${params}`);
  const data = (await safeJsonParse(res)) as { items?: GoogleCalendarEvent[] };
  return data.items || [];
}

/** Create a calendar event */
export async function gCalCreateEvent(
  calendarId: string,
  event: {
    summary?: string;
    start: { dateTime?: string; date?: string; timeZone?: string };
    end: { dateTime?: string; date?: string; timeZone?: string };
    location?: string;
    description?: string;
    attendees?: { email: string }[];
    conferenceData?: { createRequest: { requestId: string } };
  },
): Promise<GoogleCalendarEvent> {
  const params = new URLSearchParams({ conferenceDataVersion: "1", sendUpdates: "none" });
  const res = await googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${params}`,
    {
      method: "POST",
      body: JSON.stringify(event),
    },
  );
  return (await safeJsonParse(res)) as GoogleCalendarEvent;
}

/** Update a calendar event */
export async function gCalUpdateEvent(
  calendarId: string,
  eventId: string,
  event: {
    summary?: string;
    start?: { dateTime?: string; date?: string; timeZone?: string };
    end?: { dateTime?: string; date?: string; timeZone?: string };
    location?: string;
    description?: string;
    attendees?: { email: string }[];
    colorId?: string;
  },
): Promise<GoogleCalendarEvent> {
  const params = new URLSearchParams({ conferenceDataVersion: "1", sendUpdates: "none" });
  const res = await googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}?${params}`,
    {
      method: "PATCH",
      body: JSON.stringify(event),
    },
  );
  return (await safeJsonParse(res)) as GoogleCalendarEvent;
}

/** Delete a calendar event */
export async function gCalDeleteEvent(calendarId: string, eventId: string): Promise<void> {
  const res = await googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`,
    { method: "DELETE" },
  );
  // googleFetch handles non-OK errors
  return;
}

// ---------------------------------------------------------------------------
// Drive API (direct)
// ---------------------------------------------------------------------------

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  createdTime?: string;
  webViewLink?: string;
  parents?: string[];
  trashed?: boolean;
  ownedByMe?: boolean;
}

/** List Drive files */
export async function gDriveListFiles(
  params?: { q?: string; pageSize?: number; orderBy?: string; fields?: string },
): Promise<GoogleDriveFile[]> {
  const sp = new URLSearchParams();
  sp.set("pageSize", String(params?.pageSize || 50));
  sp.set("fields", params?.fields || "files(id,name,mimeType,size,modifiedTime,createdTime,webViewLink,parents,trashed,ownedByMe)");
  if (params?.q) sp.set("q", params.q);
  if (params?.orderBy) sp.set("orderBy", params.orderBy);

  const res = await googleFetch(`https://www.googleapis.com/drive/v3/files?${sp}`);
  const data = (await safeJsonParse(res)) as { files?: GoogleDriveFile[] };
  return data.files || [];
}

/** Create a folder in Drive */
export async function gDriveCreateFolder(name: string, parents?: string[]): Promise<GoogleDriveFile> {
  const metadata: Record<string, unknown> = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parents?.length) metadata.parents = parents;

  const res = await googleFetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    body: JSON.stringify(metadata),
  });
  return (await safeJsonParse(res)) as GoogleDriveFile;
}

/** Create a file (including Google Docs/Sheets) in Drive */
export async function gDriveCreateFile(
  name: string,
  mimeType: string,
  parents?: string[],
): Promise<GoogleDriveFile> {
  const metadata: Record<string, unknown> = { name, mimeType };
  if (parents?.length) metadata.parents = parents;

  const res = await googleFetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    body: JSON.stringify(metadata),
  });
  return (await safeJsonParse(res)) as GoogleDriveFile;
}

// ---------------------------------------------------------------------------
// Sheets API (direct)
// ---------------------------------------------------------------------------

/** Get spreadsheet data */
export async function gSheetsGet(
  spreadsheetId: string,
  ranges?: string,
): Promise<unknown> {
  const params = new URLSearchParams({
    fields: "spreadsheetId,properties.title,sheets.properties",
    includeGridData: "true",
  });
  if (ranges) params.set("ranges", ranges);

  const res = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?${params}`,
  );
  return safeJsonParse(res);
}

/** Get values from a range */
export async function gSheetsGetValues(
  spreadsheetId: string,
  range: string,
): Promise<{ values: string[][] }> {
  const res = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
  );
  return safeJsonParse(res) as Promise<{ values: string[][] }>;
}

/** Batch get values from multiple ranges */
export async function gSheetsBatchGetValues(
  spreadsheetId: string,
  ranges: string[],
): Promise<{ valueRanges: { range: string; values: string[][] }[] }> {
  const res = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?ranges=${ranges.map(encodeURIComponent).join("&ranges=")}`,
  );
  return safeJsonParse(res) as Promise<{ valueRanges: { range: string; values: string[][] }[] }>;
}

/** Append values to a sheet */
export async function gSheetsAppendValues(
  spreadsheetId: string,
  range: string,
  values: string[][],
): Promise<{ updates: { updatedRange: string; updatedRows: number } }> {
  const res = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      body: JSON.stringify({ values }),
    },
  );
  return safeJsonParse(res) as Promise<{ updates: { updatedRange: string; updatedRows: number } }>;
}

/** Update values in a range */
export async function gSheetsUpdateValues(
  spreadsheetId: string,
  range: string,
  values: string[][],
): Promise<{ updatedRange: string; updatedRows: number }> {
  const res = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method: "PUT",
      body: JSON.stringify({ values }),
    },
  );
  return safeJsonParse(res) as Promise<{ updatedRange: string; updatedRows: number }>;
}

/** Add a new sheet tab */
export async function gSheetsAddSheet(
  spreadsheetId: string,
  sheetName: string,
): Promise<unknown> {
  const res = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: sheetName } } }],
      }),
    },
  );
  return safeJsonParse(res);
}

/** Create a new spreadsheet */
export async function gSheetsCreate(title: string): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const res = await googleFetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    body: JSON.stringify({ properties: { title } }),
  });
  return safeJsonParse(res) as Promise<{ spreadsheetId: string; spreadsheetUrl: string }>;
}

// ---------------------------------------------------------------------------
// Docs API (direct)
// ---------------------------------------------------------------------------

export interface GoogleDoc {
  id: string;
  name: string;
  mimeType: string;
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
}

/** List Google Docs */
export async function gDocsList(): Promise<GoogleDoc[]> {
  // Use Drive API to list docs (Docs API doesn't have a list endpoint)
  return gDriveListFiles({
    q: "mimeType='application/vnd.google-apps.document' and trashed=false",
    orderBy: "modifiedTime desc",
    pageSize: 30,
    fields: "files(id,name,mimeType,modifiedTime,createdTime,webViewLink)",
  });
}

/** Read a Google Doc's content */
export async function gDocsGet(documentId: string): Promise<unknown> {
  const res = await googleFetch(
    `https://docs.googleapis.com/v1/documents/${documentId}`,
  );
  return safeJsonParse(res);
}

/** Create a new Google Doc */
export async function gDocsCreate(title: string): Promise<GoogleDoc> {
  return gDriveCreateFile(title, "application/vnd.google-apps.document");
}

/** Append text to a Google Doc */
export async function gDocsAppendText(
  documentId: string,
  text: string,
): Promise<unknown> {
  const res = await googleFetch(
    `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({
        requests: [
          {
            insertText: {
              location: { index: -1 },
              text: text + "\n",
            },
          },
        ],
      }),
    },
  );
  return safeJsonParse(res);
}

// ---------------------------------------------------------------------------
// Gmail API (direct)
// ---------------------------------------------------------------------------

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  historyId: string;
  internalDate: string;
  payload?: {
    headers?: { name: string; value: string }[];
    mimeType?: string;
    parts?: GmailPart[];
    body?: { data: string; size: number };
  };
  sizeEstimate?: number;
}

export interface GmailPart {
  partId: string;
  mimeType: string;
  filename: string;
  headers?: { name: string; value: string }[];
  body?: { data: string; size: number };
  parts?: GmailPart[];
}

export interface GmailLabel {
  id: string;
  name: string;
  type: "system" | "user";
  messageListVisibility?: string;
  labelListVisibility?: string;
  color?: { textColor: string; backgroundColor: string };
}

export interface GmailDraft {
  id: string;
  message: GmailMessage;
}

export interface GmailListResponse {
  messages?: { id: string; threadId: string }[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

/** Get Gmail profile */
export async function gGmailProfile(): Promise<{ emailAddress: string; messagesTotal: number; threadsTotal: number }> {
  const res = await googleFetch("https://www.googleapis.com/gmail/v1/users/me/profile");
  return safeJsonParse(res) as Promise<{ emailAddress: string; messagesTotal: number; threadsTotal: number }>;
}

/** List labels */
export async function gGmailListLabels(): Promise<GmailLabel[]> {
  const res = await googleFetch("https://www.googleapis.com/gmail/v1/users/me/labels");
  const data = (await safeJsonParse(res)) as { labels?: GmailLabel[] };
  return data.labels || [];
}

/** Create a label */
export async function gGmailCreateLabel(name: string): Promise<GmailLabel> {
  const res = await googleFetch("https://www.googleapis.com/gmail/v1/users/me/labels", {
    method: "POST",
    body: JSON.stringify({ name, labelListVisibility: "labelShow", messageListVisibility: "show" }),
  });
  return safeJsonParse(res) as Promise<GmailLabel>;
}

/** Delete a label */
export async function gGmailDeleteLabel(labelId: string): Promise<void> {
  const res = await googleFetch(`https://www.googleapis.com/gmail/v1/users/me/labels/${labelId}`, {
    method: "DELETE",
  });
  // googleFetch handles non-OK errors
  return;
}

/** List message IDs matching a query */
export async function gGmailListMessages(
  query?: string,
  labelIds?: string[],
  maxResults = 15,
  pageToken?: string,
): Promise<GmailListResponse> {
  const sp = new URLSearchParams({ maxResults: String(maxResults) });
  if (query) sp.set("q", query);
  if (labelIds?.length) sp.set("labelIds", labelIds.join(","));
  if (pageToken) sp.set("pageToken", pageToken);

  const res = await googleFetch(`https://www.googleapis.com/gmail/v1/users/me/messages?${sp}`);
  return safeJsonParse(res) as Promise<GmailListResponse>;
}

/** Get a full message by ID */
export async function gGmailGetMessage(messageId: string, format: "full" | "metadata" | "minimal" | "raw" = "full"): Promise<GmailMessage> {
  const res = await googleFetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=${format}`,
  );
  return safeJsonParse(res) as Promise<GmailMessage>;
}

interface GmailEmailSummary {
  id: string;
  threadId: string;
  snippet: string;
  labelIds: string[];
  from: string;
  to: string;
  subject: string;
  date: string;
}

/** Fetch emails (list + get full details) */
export async function gGmailFetchEmails(options?: {
  maxResults?: number;
  query?: string;
  labelIds?: string[];
  pageToken?: string;
}): Promise<{ messages: GmailEmailSummary[]; nextPageToken?: string }> {
  const list = await gGmailListMessages(options?.query, options?.labelIds, options?.maxResults, options?.pageToken);

  if (!list.messages?.length) {
    return { messages: [] };
  }

  // Fetch full details for each message (batch up to 5 concurrent)
  const chunks: typeof list.messages[] = [];
  for (let i = 0; i < list.messages.length; i += 5) {
    chunks.push(list.messages.slice(i, i + 5));
  }

  const allMessages: GmailMessage[] = [];
  for (const chunk of chunks) {
    const results = await Promise.allSettled(
      chunk.map((m) => gGmailGetMessage(m.id, "metadata")),
    );
    for (const r of results) {
      if (r.status === "fulfilled") allMessages.push(r.value);
    }
  }

  // Extract only the fields the LLM needs — do NOT spread the raw msg
  // (it includes the full payload with all headers, parts, body data, etc.)
  const messages = allMessages.map((msg) => {
    const headers = msg.payload?.headers || [];
    const get = (name: string) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
    return {
      id: msg.id,
      threadId: msg.threadId,
      snippet: msg.snippet?.slice(0, 300),
      labelIds: msg.labelIds,
      from: get("From"),
      to: get("To"),
      subject: get("Subject") || "(No subject)",
      date: get("Date"),
    };
  });

  return { messages, nextPageToken: list.nextPageToken };
}

/** Send an email via Gmail API — auto-formats to professional HTML */
export async function gGmailSendEmail(options: {
  to: string;
  subject?: string;
  body: string;
  isHtml?: boolean;
  cc?: string[];
  bcc?: string[];
}): Promise<{ id: string; threadId: string; labelIds: string[] }> {
  // Auto-convert plain text to professional HTML if not already HTML
  let htmlBody = options.body;
  if (!options.isHtml) {
    htmlBody = plainTextToHtml(options.body);
  }

  // Sanitize header values to prevent injection
  const sanitize = (s: string) => s.replace(/[\r\n]/g, "");
  // Build RFC 2822 message
  let message = "";
  message += `To: ${sanitize(options.to)}\r\n`;
  if (options.cc?.length) message += `Cc: ${options.cc.map(sanitize).join(", ")}\r\n`;
  if (options.bcc?.length) message += `Bcc: ${options.bcc.map(sanitize).join(", ")}\r\n`;
  if (options.subject) message += `Subject: ${sanitize(options.subject)}\r\n`;
  message += "Content-Type: text/html; charset=utf-8\r\n";
  message += "MIME-Version: 1.0\r\n";
  message += "\r\n";
  message += htmlBody;

  // Base64url encode
  const encoded = Buffer.from(message).toString("base64url");

  const res = await googleFetch("https://www.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    body: JSON.stringify({ raw: encoded }),
  });
  return safeJsonParse(res) as Promise<{ id: string; threadId: string; labelIds: string[] }>;
}

/**
 * Convert plain text to professional HTML email.
 * Handles: line breaks, bullet lists, numbered lists, bold, italic,
 * headers (# through ######, with or without space), horizontal rules (---),
 * code blocks, inline code, and tables.
 */
export function plainTextToHtml(text: string): string {
  const lines = text.split("\n");
  const htmlLines: string[] = [];
  let inList = false;
  let inOrderedList = false;
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Code blocks
    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        htmlLines.push("</code></pre>");
        inCodeBlock = false;
      } else {
        htmlLines.push('<pre style="background:#f5f5f5;padding:12px;border-radius:6px;font-size:13px;overflow-x:auto;margin:8px 0;"><code style="font-family:monospace;">');
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      htmlLines.push(escapeHtml(line));
      continue;
    }

    // Close lists if we're done with them
    if (inList && !trimmed.startsWith("- ") && !trimmed.startsWith("* ") && trimmed !== "") {
      htmlLines.push("</ul>");
      inList = false;
    }
    if (inOrderedList && !/^\d+\.\s/.test(trimmed) && trimmed !== "") {
      htmlLines.push("</ol>");
      inOrderedList = false;
    }

    // Headers (# through ###### with or without space after hashes)
    const headingMatch = trimmed.match(/^(#{1,6})\s*(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];
      const fontSize = Math.max(14, 24 - (level - 1) * 2);
      const marginTop = Math.max(10, 22 - (level - 1) * 2);
      htmlLines.push(`<h${level} style="font-size:${fontSize}px;font-weight:700;margin:${marginTop}px 0 8px 0;color:#1a1a1a;">${formatInline(headingText)}</h${level}>`);
      continue;
    }

    // Horizontal rule
    if (trimmed === "---" || trimmed === "***") {
      htmlLines.push('<hr style="border:none;border-top:1px solid #e0e0e0;margin:16px 0;">');
      continue;
    }

    // Bullet lists
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (!inList) { htmlLines.push('<ul style="margin:8px 0;padding-left:20px;color:#333;">'); inList = true; }
      htmlLines.push(`<li style="margin:4px 0;font-size:14px;line-height:1.6;">${formatInline(trimmed.slice(2))}</li>`);
      continue;
    }

    // Numbered lists
    const olMatch = trimmed.match(/^(\d+)\.\s(.+)/);
    if (olMatch) {
      if (!inOrderedList) { htmlLines.push('<ol style="margin:8px 0;padding-left:20px;color:#333;">'); inOrderedList = true; }
      htmlLines.push(`<li style="margin:4px 0;font-size:14px;line-height:1.6;">${formatInline(olMatch[2])}</li>`);
      continue;
    }

    // Empty line = paragraph break
    if (trimmed === "") {
      htmlLines.push('<br>');
      continue;
    }

    // Table rows (simple | col | col | format)
    if (trimmed.includes("|") && trimmed.startsWith("|")) {
      const cells = trimmed.split("|").filter(c => c.trim() !== "").map(c => c.trim());
      const isSeparator = cells.every(c => /^[-:]+$/.test(c));
      if (isSeparator) continue;
      const tag = "td";
      htmlLines.push(`<tr>${cells.map(c => `<${tag} style="border:1px solid #e0e0e0;padding:8px 12px;font-size:13px;">${formatInline(c)}</${tag}>`).join("")}</tr>`);
      continue;
    }

    // Regular paragraph
    htmlLines.push(`<p style="margin:4px 0;font-size:14px;line-height:1.7;color:#333;">${formatInline(trimmed)}</p>`);
  }

  // Close any open lists
  if (inList) htmlLines.push("</ul>");
  if (inOrderedList) htmlLines.push("</ol>");

  // Wrap in a professional email container
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;padding:20px 24px;color:#333;line-height:1.6;">
${htmlLines.join("\n")}
</body></html>`;
}

/** Format inline markdown: **bold**, *italic*, `code`, [link](url) */
function formatInline(text: string): string {
  let result = escapeHtml(text);
  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  // Inline code
  result = result.replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;padding:2px 6px;border-radius:3px;font-size:13px;font-family:monospace;">$1</code>');
  return result;
}

/** Escape HTML special characters */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** List drafts */
export async function gGmailListDrafts(maxResults = 20, pageToken?: string): Promise<{ drafts: GmailDraft[]; nextPageToken?: string }> {
  const sp = new URLSearchParams({ maxResults: String(maxResults) });
  if (pageToken) sp.set("pageToken", pageToken);
  const res = await googleFetch(`https://www.googleapis.com/gmail/v1/users/me/drafts?${sp}`);
  return safeJsonParse(res) as Promise<{ drafts: GmailDraft[]; nextPageToken?: string }>;
}

/** Send a draft */
export async function gGmailSendDraft(draftId: string): Promise<{ id: string; threadId: string; labelIds: string[] }> {
  const res = await googleFetch(`https://www.googleapis.com/gmail/v1/users/me/drafts/${draftId}/send`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  return safeJsonParse(res) as Promise<{ id: string; threadId: string; labelIds: string[] }>;
}

/** Delete (trash) a message */
export async function gGmailDeleteMessage(messageId: string): Promise<void> {
  const res = await googleFetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}`, {
    method: "DELETE",
  });
  // googleFetch handles non-OK errors
  return;
}
