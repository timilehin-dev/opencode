"use client";

import { useState, useEffect, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RepoInfo {
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

interface Issue {
  number: number;
  title: string;
  state: "open" | "closed";
  labels: { id: number; name: string; color: string }[];
  user: { login: string; avatar_url: string };
  html_url: string;
  created_at: string;
  comments: number;
}

interface PullRequest {
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

interface TreeItem {
  path: string;
  type: "tree" | "blob" | "commit";
  size?: number;
  sha: string;
}

interface CommitItem {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string };
  };
  html_url: string;
  author: { login: string; avatar_url: string } | null;
}

type Tab = "issues" | "pulls" | "files" | "commits";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function timeAgo(iso: string) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  return formatDate(iso);
}

function labelColor(color: string) {
  // Calculate whether the label needs light or dark text
  const r = parseInt(color.slice(0, 2), 16);
  const g = parseInt(color.slice(2, 4), 16);
  const b = parseInt(color.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "text-gray-900" : "text-white";
}

// ---------------------------------------------------------------------------
// Icons (inline SVG to avoid external deps)
// ---------------------------------------------------------------------------

function StarIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}

function ForkIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 3v6m0 0a3 3 0 103 3H15m-6-3V21m12-12v6m0 0a3 3 0 103 3H21m-3-3V3" />
    </svg>
  );
}

function IssuesIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function GitBranchIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function ChevronLeftIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function Dashboard() {
  // State
  const [activeTab, setActiveTab] = useState<Tab>("issues");
  const [repo, setRepo] = useState<RepoInfo | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [pulls, setPulls] = useState<PullRequest[]>([]);
  const [tree, setTree] = useState<TreeItem[]>([]);
  const [commits, setCommits] = useState<CommitItem[]>([]);
  const [currentPath, setCurrentPath] = useState<string>("");
  const [fileContent, setFileContent] = useState<{ path: string; content: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create issue form state
  const [issueTitle, setIssueTitle] = useState("");
  const [issueBody, setIssueBody] = useState("");
  const [issueLabels, setIssueLabels] = useState("");
  const [submittingIssue, setSubmittingIssue] = useState(false);
  const [issueSuccess, setIssueSuccess] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------

  const fetchRepo = useCallback(async () => {
    try {
      const res = await fetch("/api/github?action=repo");
      const json = await res.json();
      if (json.success) setRepo(json.data);
      else setError(json.error);
    } catch {
      setError("Failed to load repository info");
    }
  }, []);

  const fetchIssues = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/github?action=issues&state=open&perPage=50");
      const json = await res.json();
      if (json.success) setIssues(json.data);
      else setError(json.error);
    } catch {
      setError("Failed to load issues");
    }
    setLoading(false);
  }, []);

  const fetchPulls = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/github?action=pulls&state=open&perPage=50");
      const json = await res.json();
      if (json.success) setPulls(json.data);
      else setError(json.error);
    } catch {
      setError("Failed to load pull requests");
    }
    setLoading(false);
  }, []);

  const fetchTree = useCallback(async (path: string) => {
    setLoading(true);
    setFileContent(null);
    try {
      const param = path ? `&path=${encodeURIComponent(path)}` : "";
      const res = await fetch(`/api/github?action=tree${param}`);
      const json = await res.json();
      if (json.success) {
        const items: TreeItem[] = json.data;
        // Only show items in the current directory (non-recursive first level)
        if (path) {
          const prefix = path + "/";
          const filtered = items.filter(
            (item) =>
              item.path.startsWith(prefix) &&
              item.path.slice(prefix.length).indexOf("/") === -1,
          );
          // Remap paths to be relative
          setTree(filtered.map((item) => ({ ...item, path: item.path.slice(prefix.length) })));
        } else {
          const filtered = items.filter((item) => item.path.indexOf("/") === -1);
          setTree(filtered);
        }
      } else {
        setError(json.error);
      }
    } catch {
      setError("Failed to load file tree");
    }
    setLoading(false);
  }, []);

  const fetchFile = useCallback(async (fullPath: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/github?action=file&path=${encodeURIComponent(fullPath)}`);
      const json = await res.json();
      if (json.success) {
        setFileContent({ path: json.data.path, content: json.data.decoded });
      } else {
        setError(json.error);
      }
    } catch {
      setError("Failed to load file content");
    }
    setLoading(false);
  }, []);

  const fetchCommits = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/github?action=commits&perPage=50");
      const json = await res.json();
      if (json.success) setCommits(json.data);
      else setError(json.error);
    } catch {
      setError("Failed to load commits");
    }
    setLoading(false);
  }, []);

  // Initial load
  useEffect(() => {
    fetchRepo();
  }, [fetchRepo]);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      switch (activeTab) {
        case "issues":
          await fetchIssues();
          break;
        case "pulls":
          await fetchPulls();
          break;
        case "files":
          await fetchTree(currentPath);
          break;
        case "commits":
          await fetchCommits();
          break;
      }
    })();

    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, currentPath]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleCreateIssue = async () => {
    if (!issueTitle.trim()) return;
    setSubmittingIssue(true);
    setIssueSuccess(false);
    setIssueError(null);
    try {
      const labels = issueLabels
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean);
      const res = await fetch("/api/github?action=createIssue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: issueTitle, body: issueBody, labels }),
      });
      const json = await res.json();
      if (json.success) {
        setIssueSuccess(true);
        setIssueTitle("");
        setIssueBody("");
        setIssueLabels("");
        fetchIssues();
      } else {
        setIssueError(json.error);
      }
    } catch {
      setIssueError("Failed to create issue");
    }
    setSubmittingIssue(false);
  };

  const handleFolderClick = (folderPath: string) => {
    const newPath = currentPath ? `${currentPath}/${folderPath}` : folderPath;
    setCurrentPath(newPath);
    setFileContent(null);
  };

  const handleFileClick = (filePath: string) => {
    const fullPath = currentPath ? `${currentPath}/${filePath}` : filePath;
    fetchFile(fullPath);
  };

  const handleBackToRoot = () => {
    setCurrentPath("");
    setFileContent(null);
  };

  const handleBreadcrumbClick = (index: number) => {
    const parts = currentPath.split("/");
    setCurrentPath(parts.slice(0, index).join("/"));
    setFileContent(null);
  };

  // ---------------------------------------------------------------------------
  // Tab definitions
  // ---------------------------------------------------------------------------

  const tabs: { key: Tab; label: string }[] = [
    { key: "issues", label: "Issues" },
    { key: "pulls", label: "Pull Requests" },
    { key: "files", label: "Files" },
    { key: "commits", label: "Commits" },
  ];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-[#0c1322]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                OpenCode
                <span className="text-slate-400 font-normal ml-2 text-lg sm:text-xl">
                  GitHub Dashboard
                </span>
              </h1>
              {repo && (
                <p className="text-slate-400 mt-1 text-sm max-w-2xl truncate">
                  {repo.description || "No description"}
                </p>
              )}
            </div>
            {repo && (
              <div className="flex items-center gap-4 flex-wrap">
                <a
                  href={repo.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
                >
                  View on GitHub <ExternalLinkIcon />
                </a>
              </div>
            )}
          </div>

          {/* Repo Stats */}
          {repo && (
            <div className="flex items-center gap-5 mt-5 flex-wrap">
              <div className="flex items-center gap-1.5 text-sm text-slate-300">
                <span className="text-amber-400"><StarIcon /></span>
                <span className="font-semibold">{repo.stargazers_count.toLocaleString()}</span>
                <span className="text-slate-500 hidden sm:inline">stars</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-slate-300">
                <span className="text-slate-400"><ForkIcon /></span>
                <span className="font-semibold">{repo.forks_count.toLocaleString()}</span>
                <span className="text-slate-500 hidden sm:inline">forks</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-slate-300">
                <span className="text-emerald-400"><IssuesIcon /></span>
                <span className="font-semibold">{repo.open_issues_count}</span>
                <span className="text-slate-500 hidden sm:inline">open issues</span>
              </div>
              {repo.language && (
                <div className="flex items-center gap-1.5 text-sm text-slate-300">
                  <span className="w-3 h-3 rounded-full bg-orange-400 inline-block" />
                  <span>{repo.language}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-sm text-slate-300">
                <span className="text-emerald-400"><GitBranchIcon /></span>
                <span>{repo.default_branch}</span>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        {/* Error Banner */}
        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-3 underline hover:text-red-300"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <nav className="border-b border-slate-800 mb-6">
          <div className="flex gap-0 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  setCurrentPath("");
                  setFileContent(null);
                  setError(null);
                }}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? "border-emerald-500 text-emerald-400"
                    : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </nav>

        {/* Tab Content */}
        {loading && activeTab !== "files" && <Spinner />}

        {/* Issues Tab */}
        {activeTab === "issues" && !loading && (
          <div className="space-y-6">
            {/* Create Issue Form */}
            <div className="bg-[#1a2332] border border-slate-700/50 rounded-xl p-5">
              <h2 className="text-lg font-semibold text-white mb-4">Create New Issue</h2>

              {issueSuccess && (
                <div className="mb-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-3 rounded-lg text-sm">
                  Issue created successfully!
                  <button onClick={() => setIssueSuccess(false)} className="ml-3 underline hover:text-emerald-300">
                    Dismiss
                  </button>
                </div>
              )}
              {issueError && (
                <div className="mb-4 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
                  {issueError}
                  <button onClick={() => setIssueError(null)} className="ml-3 underline hover:text-red-300">
                    Dismiss
                  </button>
                </div>
              )}

              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Issue title"
                  value={issueTitle}
                  onChange={(e) => setIssueTitle(e.target.value)}
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-colors"
                />
                <textarea
                  placeholder="Write a description... (Markdown supported)"
                  rows={4}
                  value={issueBody}
                  onChange={(e) => setIssueBody(e.target.value)}
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-colors resize-y"
                />
                <input
                  type="text"
                  placeholder="Labels (comma-separated, e.g. bug, enhancement)"
                  value={issueLabels}
                  onChange={(e) => setIssueLabels(e.target.value)}
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-colors"
                />
                <button
                  onClick={handleCreateIssue}
                  disabled={submittingIssue || !issueTitle.trim()}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
                >
                  {submittingIssue && (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  {submittingIssue ? "Creating..." : "Create Issue"}
                </button>
              </div>
            </div>

            {/* Issues List */}
            <div>
              <h2 className="text-lg font-semibold text-white mb-3">
                Open Issues
                <span className="ml-2 text-sm font-normal text-slate-400">({issues.length})</span>
              </h2>
              {issues.length === 0 ? (
                <div className="bg-[#1a2332] border border-slate-700/50 rounded-xl p-8 text-center text-slate-400">
                  No open issues found
                </div>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto custom-scrollbar">
                  {issues.map((issue) => (
                    <a
                      key={issue.number}
                      href={issue.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block bg-[#1a2332] border border-slate-700/50 rounded-lg px-5 py-4 hover:border-slate-600 hover:bg-[#1e293b] transition-colors group"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <span
                            className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                              issue.state === "open"
                                ? "border-emerald-500 text-emerald-500"
                                : "border-purple-500 text-purple-500"
                            }`}
                          >
                            {issue.state === "open" ? (
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path
                                  fillRule="evenodd"
                                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            ) : (
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path
                                  fillRule="evenodd"
                                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            )}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-white font-medium group-hover:text-emerald-400 transition-colors truncate">
                                {issue.title}
                              </span>
                              <span className="text-slate-500 text-sm">#{issue.number}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              {issue.labels.map((label) => (
                                <span
                                  key={label.id}
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${labelColor(label.color)}`}
                                  style={{ backgroundColor: `#${label.color}` }}
                                >
                                  {label.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {issue.comments > 0 && (
                            <span className="flex items-center gap-1 text-xs text-slate-400">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                              </svg>
                              {issue.comments}
                            </span>
                          )}
                          <span className="text-xs text-slate-500 whitespace-nowrap">
                            {timeAgo(issue.created_at)}
                          </span>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pull Requests Tab */}
        {activeTab === "pulls" && !loading && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-3">
              Open Pull Requests
              <span className="ml-2 text-sm font-normal text-slate-400">({pulls.length})</span>
            </h2>
            {pulls.length === 0 ? (
              <div className="bg-[#1a2332] border border-slate-700/50 rounded-xl p-8 text-center text-slate-400">
                No open pull requests found
              </div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto custom-scrollbar">
                {pulls.map((pr) => (
                  <a
                    key={pr.number}
                    href={pr.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-[#1a2332] border border-slate-700/50 rounded-lg px-5 py-4 hover:border-slate-600 hover:bg-[#1e293b] transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                              pr.draft
                                ? "bg-slate-700 text-slate-300"
                                : pr.merged
                                ? "bg-purple-500/20 text-purple-400"
                                : pr.state === "open"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : "bg-red-500/20 text-red-400"
                            }`}
                          >
                            {pr.draft ? "Draft" : pr.state === "open" ? "Open" : "Closed"}
                          </span>
                          <span className="text-white font-medium group-hover:text-emerald-400 transition-colors truncate">
                            {pr.title}
                          </span>
                          <span className="text-slate-500 text-sm">#{pr.number}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-2 text-xs text-slate-400 flex-wrap">
                          <span className="flex items-center gap-1.5">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={pr.user.avatar_url}
                              alt={pr.user.login}
                              className="w-4 h-4 rounded-full"
                            />
                            {pr.user.login}
                          </span>
                          <span>
                            <span className="text-cyan-400">{pr.head.ref}</span>
                            <span className="mx-1.5 text-slate-600">into</span>
                            <span className="text-orange-400">{pr.base.ref}</span>
                          </span>
                        </div>
                      </div>
                      <span className="text-xs text-slate-500 whitespace-nowrap flex-shrink-0">
                        {timeAgo(pr.created_at)}
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Files Tab */}
        {activeTab === "files" && (
          <div>
            {/* Breadcrumb */}
            {currentPath && (
              <div className="flex items-center gap-2 mb-4 text-sm">
                <button
                  onClick={handleBackToRoot}
                  className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  <ChevronLeftIcon />
                  Root
                </button>
                <span className="text-slate-600">/</span>
                {currentPath.split("/").map((part, i, arr) => (
                  <span key={i} className="flex items-center gap-2">
                    {i < arr.length - 1 ? (
                      <button
                        onClick={() => handleBreadcrumbClick(i + 1)}
                        className="text-emerald-400 hover:text-emerald-300 transition-colors"
                      >
                        {part}
                      </button>
                    ) : (
                      <span className="text-slate-300">{part}</span>
                    )}
                    {i < arr.length - 1 && <span className="text-slate-600">/</span>}
                  </span>
                ))}
              </div>
            )}

            {/* File Content View */}
            {fileContent && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400 font-mono">{fileContent.path}</span>
                  <button
                    onClick={() => {
                      setFileContent(null);
                      fetchTree(currentPath);
                    }}
                    className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    Back to tree
                  </button>
                </div>
                <div className="bg-[#0d1117] border border-slate-700/50 rounded-xl overflow-hidden">
                  <div className="bg-[#161b22] px-4 py-2 border-b border-slate-700/50">
                    <span className="text-xs text-slate-400 font-mono">{fileContent.path}</span>
                  </div>
                  <pre className="code-block p-4 overflow-x-auto max-h-[500px] overflow-y-auto custom-scrollbar text-slate-300">
                    <code>{fileContent.content}</code>
                  </pre>
                </div>
              </div>
            )}

            {/* Tree View */}
            {!fileContent && (
              <>
                {loading ? (
                  <Spinner />
                ) : (
                  <div>
                    <h2 className="text-lg font-semibold text-white mb-3">
                      {currentPath || "Root"}
                    </h2>
                    {tree.length === 0 ? (
                      <div className="bg-[#1a2332] border border-slate-700/50 rounded-xl p-8 text-center text-slate-400">
                        This directory is empty
                      </div>
                    ) : (
                      <div className="bg-[#1a2332] border border-slate-700/50 rounded-xl overflow-hidden">
                        {/* Table header */}
                        <div className="grid grid-cols-[1fr_auto] px-5 py-2.5 bg-[#151d2e] border-b border-slate-700/50 text-xs font-medium text-slate-400 uppercase tracking-wider">
                          <span>Name</span>
                          <span className="text-right">Size</span>
                        </div>
                        {/* Sort: folders first, then files */}
                        {tree
                          .sort((a, b) => {
                            if (a.type === b.type) return a.path.localeCompare(b.path);
                            return a.type === "tree" ? -1 : 1;
                          })
                          .map((item) => (
                            <button
                              key={item.path}
                              onClick={() =>
                                item.type === "tree"
                                  ? handleFolderClick(item.path)
                                  : handleFileClick(item.path)
                              }
                              className="w-full grid grid-cols-[1fr_auto] px-5 py-2.5 hover:bg-[#1e293b] transition-colors text-left border-b border-slate-700/30 last:border-b-0"
                            >
                              <span className="flex items-center gap-2.5 text-sm">
                                {item.type === "tree" ? <FolderIcon /> : <FileIcon />}
                                <span
                                  className={
                                    item.type === "tree"
                                      ? "text-white font-medium"
                                      : "text-slate-300 font-mono"
                                  }
                                >
                                  {item.path}
                                  {item.type === "tree" ? "/" : ""}
                                </span>
                              </span>
                              <span className="text-xs text-slate-500 text-right">
                                {item.size != null ? formatFileSize(item.size) : ""}
                              </span>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Commits Tab */}
        {activeTab === "commits" && !loading && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-3">
              Recent Commits
              <span className="ml-2 text-sm font-normal text-slate-400">({commits.length})</span>
            </h2>
            {commits.length === 0 ? (
              <div className="bg-[#1a2332] border border-slate-700/50 rounded-xl p-8 text-center text-slate-400">
                No commits found
              </div>
            ) : (
              <div className="space-y-1 max-h-[600px] overflow-y-auto custom-scrollbar">
                {commits.map((commit) => (
                  <a
                    key={commit.sha}
                    href={commit.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 bg-[#1a2332] border border-slate-700/50 rounded-lg px-5 py-3 hover:border-slate-600 hover:bg-[#1e293b] transition-colors group"
                  >
                    <div className="mt-0.5 flex-shrink-0">
                      {commit.author ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={commit.author.avatar_url}
                          alt={commit.author.login}
                          className="w-8 h-8 rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs text-slate-400">
                          {commit.commit.author.name.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white font-medium truncate group-hover:text-emerald-400 transition-colors">
                        {commit.commit.message.split("\n")[0]}
                      </p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
                        <span>{commit.commit.author.name}</span>
                        <span>{timeAgo(commit.commit.author.date)}</span>
                        <span className="font-mono text-slate-500">
                          {commit.sha.slice(0, 7)}
                        </span>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-[#0c1322] mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-xs text-slate-500">
            OpenCode GitHub Dashboard &middot; Data from{" "}
            <a
              href="https://github.com/timilehin-dev/opencode"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-500 hover:text-emerald-400 transition-colors"
            >
              timilehin-dev/opencode
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
