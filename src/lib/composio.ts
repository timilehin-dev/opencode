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
