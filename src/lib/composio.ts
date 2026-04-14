// Composio HTTP API Client — typed wrapper around fetch
// Uses the v2 REST API: POST /api/v2/actions/{slug}/execute

const BASE_URL = "https://backend.composio.dev/api/v2";
const API_KEY = process.env.COMPOSIO_API_KEY || "";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComposioResponse<T = unknown> {
  data: T;
  error: string | null;
  successful: boolean;
  logId: string;
}

// Gmail types
export interface GmailProfile {
  emailAddress: string;
  historyId: string;
  messagesTotal: number;
  threadsTotal: number;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  historyId: string;
  internalDate: string;
  payload?: {
    headers?: { name: string; value: string }[];
    parts?: GmailPart[];
    body?: {
      data: string;
      size: number;
      attachmentId?: string;
    };
  };
  // Populated by fetch_emails
  messageId?: string;
  messageText?: string;
  attachmentList?: unknown[];
  from?: string;
  to?: string;
  subject?: string;
  date?: string;
}

export interface GmailPart {
  partId: string;
  mimeType: string;
  filename: string;
  headers?: { name: string; value: string }[];
  body?: {
    data: string;
    size: number;
    attachmentId?: string;
  };
  parts?: GmailPart[];
}

export interface GmailLabel {
  id: string;
  name: string;
  type: "system" | "user";
  messageListVisibility?: string;
  labelListVisibility?: string;
  color?: {
    textColor: string;
    backgroundColor: string;
  };
}

export interface GmailDraft {
  id: string;
  message: GmailMessage;
}

export interface FetchEmailsResponse {
  messages: GmailMessage[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

export interface SendEmailResponse {
  id: string;
  threadId: string;
  labelIds: string[];
}

export interface ListLabelsResponse {
  labels: GmailLabel[];
}

export interface ListDraftsResponse {
  drafts: GmailDraft[];
  nextPageToken?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function headers(): HeadersInit {
  return {
    "x-api-key": API_KEY,
    "Content-Type": "application/json",
  };
}

const GMAIL_ACCOUNT_ID = process.env.COMPOSIO_GMAIL_ACCOUNT_ID || "";

/**
 * Execute a Composio action
 * The key is using "input" (not "inputParams") for the parameters field
 */
export async function executeAction<T = unknown>(
  toolSlug: string,
  input: Record<string, unknown>,
  connectedAccountId = GMAIL_ACCOUNT_ID,
): Promise<ComposioResponse<T>> {
  const url = `${BASE_URL}/actions/${toolSlug}/execute`;

  const res = await fetch(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      connectedAccountId,
      input,
    }),
  });

  const json = (await res.json()) as ComposioResponse<T>;

  if (!json.successful) {
    throw new Error(json.error || `Composio API error: ${res.status}`);
  }

  return json;
}

// ---------------------------------------------------------------------------
// Gmail API Functions (via Composio)
// ---------------------------------------------------------------------------

/** Get Gmail profile info */
export async function getGmailProfile(): Promise<GmailProfile> {
  const res = await executeAction<GmailProfile>("gmail_get_profile", {});
  return res.data;
}

/** Fetch emails from inbox or with custom query */
export async function fetchEmails(options?: {
  max_results?: number;
  query?: string;
  label_ids?: string[];
  page_token?: string;
  include_spam_trash?: boolean;
}): Promise<FetchEmailsResponse> {
  const input: Record<string, unknown> = {
    max_results: options?.max_results ?? 15,
    user_id: "me",
    verbose: true,
  };

  if (options?.query) input.query = options.query;
  if (options?.label_ids?.length) input.label_ids = options.label_ids;
  if (options?.page_token) input.page_token = options.page_token;
  if (options?.include_spam_trash) input.include_spam_trash = options.include_spam_trash;

  const res = await executeAction<FetchEmailsResponse>("gmail_fetch_emails", input);
  return res.data;
}

/** Send an email */
export async function sendEmail(options: {
  to: string;
  subject?: string;
  body: string;
  is_html?: boolean;
  cc?: string[];
  bcc?: string[];
}): Promise<SendEmailResponse> {
  const input: Record<string, unknown> = {
    recipient_email: options.to,
    body: options.body,
    user_id: "me",
  };

  if (options.subject) input.subject = options.subject;
  if (options.is_html) input.is_html = options.is_html;
  if (options.cc?.length) input.cc = options.cc;
  if (options.bcc?.length) input.bcc = options.bcc;

  const res = await executeAction<SendEmailResponse>("gmail_send_email", input);
  return res.data;
}

/** List all Gmail labels */
export async function listLabels(): Promise<GmailLabel[]> {
  const res = await executeAction<ListLabelsResponse>("gmail_list_labels", {
    user_id: "me",
  });
  return res.data.labels;
}

/** Create a new label */
export async function createLabel(name: string): Promise<GmailLabel> {
  const res = await executeAction<GmailLabel>("gmail_create_label", {
    label_name: name,
    user_id: "me",
  });
  return res.data;
}

/** Delete a user-created label */
export async function deleteLabel(labelId: string): Promise<void> {
  await executeAction("gmail_remove_label", {
    label_id: labelId,
    user_id: "me",
  });
}

/** List drafts */
export async function listDrafts(options?: {
  max_results?: number;
  page_token?: string;
}): Promise<ListDraftsResponse> {
  const input: Record<string, unknown> = {
    user_id: "me",
    verbose: true,
    max_results: options?.max_results ?? 20,
  };

  if (options?.page_token) input.page_token = options.page_token;

  const res = await executeAction<ListDraftsResponse>("gmail_list_drafts", input);
  return res.data;
}

/** Send a draft */
export async function sendDraft(draftId: string): Promise<SendEmailResponse> {
  const res = await executeAction<SendEmailResponse>("gmail_send_draft", {
    draft_id: draftId,
    user_id: "me",
  });
  return res.data;
}

/** Delete a message (move to trash) */
export async function deleteMessage(messageId: string): Promise<void> {
  await executeAction("gmail_delete_message", {
    message_id: messageId,
    user_id: "me",
  });
}

// ---------------------------------------------------------------------------
// Calendar Types
// ---------------------------------------------------------------------------

export interface CalendarEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  location?: string;
  description?: string;
  attendees?: { email: string }[];
  htmlLink?: string;
}

export interface CalendarInfo {
  id: string;
  summary: string;
  primary?: boolean;
}

// ---------------------------------------------------------------------------
// Drive Types
// ---------------------------------------------------------------------------

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  createdTime?: string;
  webViewLink?: string;
  kind: string;
}

// ---------------------------------------------------------------------------
// Multi-Service Account ID Helper
// ---------------------------------------------------------------------------

type ServiceKey = "gmail" | "googlecalendar" | "googledrive" | "googlesheets";

/** Get the Composio connected account ID for a given service */
export function getAccountId(service: ServiceKey): string {
  switch (service) {
    case "gmail":
      return process.env.COMPOSIO_GMAIL_ACCOUNT_ID || "";
    case "googlecalendar":
      return process.env.COMPOSIO_GOOGLECALENDAR_ACCOUNT_ID || "";
    case "googledrive":
      return process.env.COMPOSIO_GOOGLEDRIVE_ACCOUNT_ID || "";
    case "googlesheets":
      return process.env.COMPOSIO_GOOGLESHEETS_ACCOUNT_ID || "";
  }
}

/** Check if a Composio connection is valid by trying a lightweight action */
export async function checkConnection(accountId: string): Promise<boolean> {
  if (!accountId) return false;
  try {
    // Use gmail_get_profile as a lightweight connectivity check
    await executeAction("gmail_get_profile", {}, accountId);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Calendar API Functions (via Composio)
// ---------------------------------------------------------------------------

/** List all calendars for the connected Google account */
export async function listCalendars(
  accountId?: string,
): Promise<CalendarInfo[]> {
  const acct = accountId || getAccountId("googlecalendar");
  const res = await executeAction<{ items?: CalendarInfo[] }>(
    "googlecalendar_list_calendars",
    {},
    acct,
  );
  return res.data.items || [];
}

/** Create a calendar event */
export async function createEvent(
  params: {
    summary?: string;
    start_datetime: string;
    event_duration_hour?: number;
    event_duration_minutes?: number;
    location?: string;
    description?: string;
    attendees?: string[];
    calendar_id?: string;
    create_meeting_room?: boolean;
    timezone?: string;
  },
  accountId?: string,
): Promise<CalendarEvent> {
  const acct = accountId || getAccountId("googlecalendar");
  const input: Record<string, unknown> = {
    start_datetime: params.start_datetime,
  };
  if (params.summary) input.summary = params.summary;
  if (params.event_duration_hour) input.event_duration_hour = params.event_duration_hour;
  if (params.event_duration_minutes) input.event_duration_minutes = params.event_duration_minutes;
  if (params.location) input.location = params.location;
  if (params.description) input.description = params.description;
  if (params.attendees?.length) input.attendees_emails = params.attendees;
  if (params.calendar_id) input.calendar_id = params.calendar_id;
  if (params.create_meeting_room) input.create_meeting_room = params.create_meeting_room;
  if (params.timezone) input.timezone = params.timezone;

  const res = await executeAction<CalendarEvent>(
    "googlecalendar_create_event",
    input,
    acct,
  );
  return res.data;
}

/** Delete a calendar event */
export async function deleteEvent(
  eventId: string,
  calendarId?: string,
  accountId?: string,
): Promise<void> {
  const acct = accountId || getAccountId("googlecalendar");
  const input: Record<string, unknown> = { event_id: eventId };
  if (calendarId) input.calendar_id = calendarId;
  await executeAction("googlecalendar_delete_event", input, acct);
}

// ---------------------------------------------------------------------------
// Drive API Functions (via Composio)
// ---------------------------------------------------------------------------

/** List files and folders in Google Drive */
export async function listDriveFiles(
  params?: { q?: string; pageSize?: number; orderBy?: string },
  accountId?: string,
): Promise<DriveFile[]> {
  const acct = accountId || getAccountId("googledrive");
  const input: Record<string, unknown> = {};
  if (params?.q) input.query = params.q;
  if (params?.pageSize) input.page_size = params.pageSize;
  if (params?.orderBy) input.order_by = params.orderBy;

  const res = await executeAction<{ files?: DriveFile[] }>(
    "googledrive_list_files",
    input,
    acct,
  );
  return res.data.files || [];
}

/** Create a folder in Google Drive */
export async function createDriveFolder(
  folderName: string,
  parentId?: string,
  accountId?: string,
): Promise<DriveFile> {
  const acct = accountId || getAccountId("googledrive");
  const input: Record<string, unknown> = { folder_name: folderName };
  if (parentId) input.parent_id = parentId;

  const res = await executeAction<DriveFile>(
    "googledrive_create_folder",
    input,
    acct,
  );
  return res.data;
}

/** Create a file or folder in Google Drive */
export async function createDriveFile(
  name: string,
  mimeType?: string,
  parents?: string[],
  accountId?: string,
): Promise<DriveFile> {
  const acct = accountId || getAccountId("googledrive");
  const input: Record<string, unknown> = { name };
  if (mimeType) input.mime_type = mimeType;
  if (parents?.length) input.parents = parents;

  const res = await executeAction<DriveFile>(
    "googledrive_create_file",
    input,
    acct,
  );
  return res.data;
}

// ---------------------------------------------------------------------------
// Sheets API Functions (via Composio)
// ---------------------------------------------------------------------------

/** Add a new sheet to a Google Spreadsheet */
export async function addSheet(
  spreadsheetId: string,
  properties?: Record<string, unknown>,
  accountId?: string,
): Promise<unknown> {
  const acct = accountId || getAccountId("googlesheets");
  const input: Record<string, unknown> = { spreadsheetId };
  if (properties) input.properties = properties;

  const res = await executeAction("googlesheets_add_sheet", input, acct);
  return res.data;
}
