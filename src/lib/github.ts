// GitHub API Client — typed wrapper around fetch

const BASE_URL = "https://api.github.com";
const OWNER = process.env.GITHUB_REPO_OWNER || "timilehin-dev";
const REPO = process.env.GITHUB_REPO_NAME || "opencode";
const PAT = process.env.GITHUB_PAT || "";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RepoInfo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  default_branch: string;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  size: number;
  license: { key: string; name: string; spdx_id: string } | null;
  topics: string[];
  watchers_count: number;
}

export interface Issue {
  id: number;
  number: number;
  title: string;
  state: "open" | "closed";
  body: string | null;
  html_url: string;
  user: { login: string; avatar_url: string };
  labels: { id: number; name: string; color: string }[];
  created_at: string;
  updated_at: string;
  comments: number;
}

export interface PullRequest {
  id: number;
  number: number;
  title: string;
  state: "open" | "closed";
  body: string | null;
  html_url: string;
  user: { login: string; avatar_url: string };
  created_at: string;
  updated_at: string;
  head: { ref: string; label: string };
  base: { ref: string; label: string };
  merged: boolean;
  draft: boolean;
  mergeable_state: string;
}

export interface TreeItem {
  path: string;
  mode: string;
  type: "tree" | "blob" | "commit";
  sha: string;
  size?: number;
  url: string;
}

export interface FileContent {
  name: string;
  path: string;
  sha: string;
  size: number;
  content: string;
  encoding: string;
}

export interface Branch {
  name: string;
  commit: { sha: string; url: string };
  protected: boolean;
}

export interface Commit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; email: string; date: string };
    committer: { name: string; email: string; date: string };
  };
  html_url: string;
  author: { login: string; avatar_url: string } | null;
}

export interface SearchResult {
  total_count: number;
  incomplete_results: boolean;
  items: {
    name: string;
    path: string;
    sha: string;
    html_url: string;
    repository: { full_name: string };
    score: number;
  }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function headers(): HeadersInit {
  return {
    Authorization: `Bearer ${PAT}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "OpenCode-Dashboard",
  };
}

async function githubFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...headers(), ...(init?.headers as Record<string, string>) } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

function repoUrl(path = "") {
  return `${BASE_URL}/repos/${OWNER}/${REPO}${path}`;
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

/** Get repo details */
export async function getRepo(): Promise<RepoInfo> {
  return githubFetch<RepoInfo>(repoUrl());
}

/** List issues (open / closed / all) */
export async function listIssues(
  state: "open" | "closed" | "all" = "open",
  page = 1,
  perPage = 30,
): Promise<Issue[]> {
  const params = new URLSearchParams({ state, page: String(page), per_page: String(perPage) });
  return githubFetch<Issue[]>(repoUrl(`/issues?${params}`));
}

/** Create a new issue */
export async function createIssue(
  title: string,
  body: string,
  labels?: string[],
): Promise<Issue> {
  return githubFetch<Issue>(repoUrl("/issues"), {
    method: "POST",
    body: JSON.stringify({ title, body, labels: labels ?? [] }),
  });
}

/** List pull requests */
export async function listPullRequests(
  state: "open" | "closed" | "all" = "open",
  page = 1,
  perPage = 30,
): Promise<PullRequest[]> {
  const params = new URLSearchParams({ state, page: String(page), per_page: String(perPage) });
  return githubFetch<PullRequest[]>(repoUrl(`/pulls?${params}`));
}

/** Get repo file tree */
export async function getRepoTree(
  path?: string,
  recursive = false,
): Promise<TreeItem[]> {
  const params = new URLSearchParams({ recursive: String(recursive) });
  if (path) params.set("path", path);
  const data = await githubFetch<{ tree: TreeItem[]; truncated: boolean }>(
    repoUrl(`/git/trees/HEAD?${params}`),
  );
  return data.tree;
}

/** Get file content (decoded from base64) */
export async function getFileContent(path: string): Promise<FileContent & { decoded: string }> {
  const data = await githubFetch<FileContent>(repoUrl(`/contents/${path}`));
  const decoded = Buffer.from(data.content, "base64").toString("utf-8");
  return { ...data, decoded };
}

/** Create or update a file */
export async function createOrUpdateFile(
  path: string,
  content: string,
  message: string,
  sha?: string,
): Promise<{ commit: { sha: string }; content: FileContent }> {
  const payload: Record<string, string> = {
    message,
    content: Buffer.from(content).toString("base64"),
  };
  if (sha) payload.sha = sha;
  return githubFetch<{ commit: { sha: string }; content: FileContent }>(
    repoUrl(`/contents/${path}`),
    { method: "PUT", body: JSON.stringify(payload) },
  );
}

/** List branches */
export async function listBranches(): Promise<Branch[]> {
  return githubFetch<Branch[]>(repoUrl("/branches"));
}

/** List recent commits */
export async function listCommits(
  page = 1,
  perPage = 30,
): Promise<Commit[]> {
  const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  return githubFetch<Commit[]>(repoUrl(`/commits?${params}`));
}

/** Search code in repo */
export async function searchCode(query: string): Promise<SearchResult> {
  const q = `${query} repo:${OWNER}/${REPO}`;
  return githubFetch<SearchResult>(`${BASE_URL}/search/code?q=${encodeURIComponent(q)}`);
}

/** Update an issue (state, title, body, labels) */
export async function updateIssue(
  issueNumber: number,
  updates: { state?: string; title?: string; body?: string; labels?: string[] },
): Promise<Issue> {
  return githubFetch<Issue>(repoUrl(`/issues/${issueNumber}`), {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

/** Create a pull request */
export async function createPullRequest(
  title: string,
  body: string,
  head: string,
  base: string,
): Promise<PullRequest> {
  return githubFetch<PullRequest>(repoUrl("/pulls"), {
    method: "POST",
    body: JSON.stringify({ title, body, head, base }),
  });
}

/** Get a single pull request */
export async function getPullRequest(pullNumber: number): Promise<PullRequest> {
  return githubFetch<PullRequest>(repoUrl(`/pulls/${pullNumber}`));
}

/** Get files changed in a pull request */
export interface PRFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch: string;
}

export async function getPullRequestFiles(pullNumber: number): Promise<PRFile[]> {
  return githubFetch<PRFile[]>(repoUrl(`/pulls/${pullNumber}/files`));
}

/** Create a comment on an issue or PR */
export async function createPRComment(
  issueNumber: number,
  body: string,
): Promise<{ id: number; body: string; html_url: string }> {
  return githubFetch(repoUrl(`/issues/${issueNumber}/comments`), {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

/** Create a new branch from an existing branch */
export async function createBranch(
  branchName: string,
  fromBranch?: string,
): Promise<{ ref: string; object: { sha: string; type: string; url: string } }> {
  const sourceBranch = fromBranch || "main";
  const sourceData = await githubFetch<{ object: { sha: string } }>(
    repoUrl(`/git/ref/heads/${encodeURIComponent(sourceBranch)}`),
  );
  const sha = sourceData.object.sha;

  return githubFetch(repoUrl("/git/refs"), {
    method: "POST",
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha,
    }),
  });
}
