// ---------------------------------------------------------------------------
// Service Key
// ---------------------------------------------------------------------------

export type ServiceKey = "github" | "gmail" | "calendar" | "drive" | "sheets" | "docs" | "vercel";

// ---------------------------------------------------------------------------
// GitHub Types
// ---------------------------------------------------------------------------

export interface RepoInfo {
  name: string;
  full_name: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  default_branch: string;
  updated_at: string;
  html_url: string;
  topics: string[];
  watchers_count: number;
}

export interface Issue {
  number: number;
  title: string;
  state: "open" | "closed";
  labels: { id: number; name: string; color: string }[];
  user: { login: string; avatar_url: string };
  html_url: string;
  created_at: string;
  comments: number;
}

export interface PullRequest {
  number: number;
  title: string;
  state: "open" | "closed";
  user: { login: string; avatar_url: string };
  created_at: string;
  head: { ref: string };
  base: { ref: string };
  merged: boolean;
  draft: boolean;
  html_url: string;
}

export interface TreeItem {
  path: string;
  type: "tree" | "blob" | "commit";
  size?: number;
  sha: string;
}

export interface CommitItem {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string };
  };
  html_url: string;
  author: { login: string; avatar_url: string } | null;
}

export type GitHubTab = "issues" | "pulls" | "files" | "commits";

// ---------------------------------------------------------------------------
// Gmail Types
// ---------------------------------------------------------------------------

export interface GmailProfile {
  emailAddress: string;
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
  messageId?: string;
  messageText?: string;
  attachmentList?: unknown[];
  from?: string;
  to?: string;
  subject?: string;
  date?: string;
}

export interface GmailLabel {
  id: string;
  name: string;
  type: "system" | "user";
  color?: { textColor: string; backgroundColor: string };
}

export type GmailTab = "inbox" | "compose" | "labels" | "search";

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

export type CalendarTab = "upcoming" | "create" | "calendars";

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
}

export type DriveTab = "files" | "create";

// ---------------------------------------------------------------------------
// Services Status Type
// ---------------------------------------------------------------------------

export interface ServiceStatus {
  gmail: { connected: boolean; accountId: string | null };
  googlecalendar: { connected: boolean; accountId: string | null };
  googledrive: { connected: boolean; accountId: string | null };
  googlesheets: { connected: boolean; accountId: string | null };
  googledocs: { connected: boolean; accountId: string | null };
  github: { connected: boolean; accountId: string | null };
  vercel: { connected: boolean; accountId: string | null };
}
