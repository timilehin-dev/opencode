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

/** Make an authenticated request to a Google API */
export async function googleFetch(url: string, options?: RequestInit): Promise<Response> {
  const token = await getAccessToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      ...options?.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
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
  if (!res.ok) throw new Error(`Calendar API error: ${res.status}`);
  const data = (await res.json()) as { items?: GoogleCalendarList[] };
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
  if (!res.ok) throw new Error(`Calendar events API error: ${res.status}`);
  const data = (await res.json()) as { items?: GoogleCalendarEvent[] };
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
  const res = await googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?conferenceDataVersion=1`,
    {
      method: "POST",
      body: JSON.stringify(event),
    },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Calendar create event error: ${res.status} — ${err}`);
  }
  return (await res.json()) as GoogleCalendarEvent;
}

/** Delete a calendar event */
export async function gCalDeleteEvent(calendarId: string, eventId: string): Promise<void> {
  const res = await googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`,
    { method: "DELETE" },
  );
  if (!res.ok && res.status !== 204) {
    throw new Error(`Calendar delete event error: ${res.status}`);
  }
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
  if (!res.ok) throw new Error(`Drive API error: ${res.status}`);
  const data = (await res.json()) as { files?: GoogleDriveFile[] };
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
  if (!res.ok) throw new Error(`Drive create folder error: ${res.status}`);
  return (await res.json()) as GoogleDriveFile;
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
  if (!res.ok) throw new Error(`Drive create file error: ${res.status}`);
  return (await res.json()) as GoogleDriveFile;
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
  if (!res.ok) throw new Error(`Sheets API error: ${res.status}`);
  return res.json();
}

/** Get values from a range */
export async function gSheetsGetValues(
  spreadsheetId: string,
  range: string,
): Promise<{ values: string[][] }> {
  const res = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
  );
  if (!res.ok) throw new Error(`Sheets get values error: ${res.status}`);
  return res.json() as Promise<{ values: string[][] }>;
}

/** Batch get values from multiple ranges */
export async function gSheetsBatchGetValues(
  spreadsheetId: string,
  ranges: string[],
): Promise<{ valueRanges: { range: string; values: string[][] }[] }> {
  const res = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?ranges=${ranges.map(encodeURIComponent).join("&ranges=")}`,
  );
  if (!res.ok) throw new Error(`Sheets batch get error: ${res.status}`);
  return res.json() as Promise<{ valueRanges: { range: string; values: string[][] }[] }>;
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
  if (!res.ok) throw new Error(`Sheets append error: ${res.status}`);
  return res.json() as Promise<{ updates: { updatedRange: string; updatedRows: number } }>;
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
  if (!res.ok) throw new Error(`Sheets update error: ${res.status}`);
  return res.json() as Promise<{ updatedRange: string; updatedRows: number }>;
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
  if (!res.ok) throw new Error(`Sheets add sheet error: ${res.status}`);
  return res.json();
}

/** Create a new spreadsheet */
export async function gSheetsCreate(title: string): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const res = await googleFetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    body: JSON.stringify({ properties: { title } }),
  });
  if (!res.ok) throw new Error(`Sheets create error: ${res.status}`);
  return res.json() as Promise<{ spreadsheetId: string; spreadsheetUrl: string }>;
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
  if (!res.ok) throw new Error(`Docs get error: ${res.status}`);
  return res.json();
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
              location: { index: 1 },
              text: text + "\n",
            },
          },
        ],
      }),
    },
  );
  if (!res.ok) throw new Error(`Docs append error: ${res.status}`);
  return res.json();
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
  if (!res.ok) throw new Error(`Gmail profile error: ${res.status}`);
  return res.json() as Promise<{ emailAddress: string; messagesTotal: number; threadsTotal: number }>;
}

/** List labels */
export async function gGmailListLabels(): Promise<GmailLabel[]> {
  const res = await googleFetch("https://www.googleapis.com/gmail/v1/users/me/labels");
  if (!res.ok) throw new Error(`Gmail list labels error: ${res.status}`);
  const data = (await res.json()) as { labels?: GmailLabel[] };
  return data.labels || [];
}

/** Create a label */
export async function gGmailCreateLabel(name: string): Promise<GmailLabel> {
  const res = await googleFetch("https://www.googleapis.com/gmail/v1/users/me/labels", {
    method: "POST",
    body: JSON.stringify({ name, labelListVisibility: "labelShow", messageListVisibility: "show" }),
  });
  if (!res.ok) throw new Error(`Gmail create label error: ${res.status}`);
  return res.json() as Promise<GmailLabel>;
}

/** Delete a label */
export async function gGmailDeleteLabel(labelId: string): Promise<void> {
  const res = await googleFetch(`https://www.googleapis.com/gmail/v1/users/me/labels/${labelId}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) throw new Error(`Gmail delete label error: ${res.status}`);
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
  if (!res.ok) throw new Error(`Gmail list messages error: ${res.status}`);
  return res.json() as Promise<GmailListResponse>;
}

/** Get a full message by ID */
export async function gGmailGetMessage(messageId: string, format: "full" | "metadata" | "minimal" | "raw" = "full"): Promise<GmailMessage> {
  const res = await googleFetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=${format}`,
  );
  if (!res.ok) throw new Error(`Gmail get message error: ${res.status}`);
  return res.json() as Promise<GmailMessage>;
}

/** Fetch emails (list + get full details) */
export async function gGmailFetchEmails(options?: {
  maxResults?: number;
  query?: string;
  labelIds?: string[];
  pageToken?: string;
}): Promise<{ messages: (GmailMessage & { from: string; to: string; subject: string; date: string })[]; nextPageToken?: string }> {
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

  // Extract common headers
  const messages = allMessages.map((msg) => {
    const headers = msg.payload?.headers || [];
    const get = (name: string) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
    return {
      ...msg,
      from: get("From"),
      to: get("To"),
      subject: get("Subject") || "(No subject)",
      date: get("Date"),
    };
  });

  return { messages, nextPageToken: list.nextPageToken };
}

/** Send an email via Gmail API */
export async function gGmailSendEmail(options: {
  to: string;
  subject?: string;
  body: string;
  isHtml?: boolean;
  cc?: string[];
  bcc?: string[];
}): Promise<{ id: string; threadId: string; labelIds: string[] }> {
  // Build RFC 2822 message
  let message = "";
  message += `To: ${options.to}\r\n`;
  if (options.cc?.length) message += `Cc: ${options.cc.join(", ")}\r\n`;
  if (options.bcc?.length) message += `Bcc: ${options.bcc.join(", ")}\r\n`;
  if (options.subject) message += `Subject: ${options.subject}\r\n`;
  message += "Content-Type: text/html; charset=utf-8\r\n";
  message += "MIME-Version: 1.0\r\n";
  message += "\r\n";
  message += options.body;

  // Base64url encode
  const encoded = Buffer.from(message).toString("base64url");

  const res = await googleFetch("https://www.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    body: JSON.stringify({ raw: encoded }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail send error: ${res.status} — ${err}`);
  }
  return res.json() as Promise<{ id: string; threadId: string; labelIds: string[] }>;
}

/** List drafts */
export async function gGmailListDrafts(maxResults = 20, pageToken?: string): Promise<{ drafts: GmailDraft[]; nextPageToken?: string }> {
  const sp = new URLSearchParams({ maxResults: String(maxResults) });
  if (pageToken) sp.set("pageToken", pageToken);
  const res = await googleFetch(`https://www.googleapis.com/gmail/v1/users/me/drafts?${sp}`);
  if (!res.ok) throw new Error(`Gmail list drafts error: ${res.status}`);
  return res.json() as Promise<{ drafts: GmailDraft[]; nextPageToken?: string }>;
}

/** Send a draft */
export async function gGmailSendDraft(draftId: string): Promise<{ id: string; threadId: string; labelIds: string[] }> {
  const res = await googleFetch(`https://www.googleapis.com/gmail/v1/users/me/drafts/${draftId}/send`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Gmail send draft error: ${res.status}`);
  return res.json() as Promise<{ id: string; threadId: string; labelIds: string[] }>;
}

/** Delete (trash) a message */
export async function gGmailDeleteMessage(messageId: string): Promise<void> {
  const res = await googleFetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) throw new Error(`Gmail delete message error: ${res.status}`);
}
