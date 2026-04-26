"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ChevronLeftIcon,
  FolderIcon,
  FileIcon,
  Spinner,
} from "@/components/icons";
import {
  labelColor,
  timeAgo,
  formatFileSize,
} from "@/lib/helpers";
import type {
  Issue,
  PullRequest,
  TreeItem,
  CommitItem,
  GitHubTab,
} from "@/lib/types";

const ghTabs: { key: GitHubTab; label: string }[] = [
  { key: "issues", label: "Issues" },
  { key: "pulls", label: "Pull Requests" },
  { key: "files", label: "Files" },
  { key: "commits", label: "Commits" },
];

export function GitHubView() {
  const [ghTab, setGhTab] = useState<GitHubTab>("issues");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [pulls, setPulls] = useState<PullRequest[]>([]);
  const [tree, setTree] = useState<TreeItem[]>([]);
  const [commits, setCommits] = useState<CommitItem[]>([]);
  const [currentPath, setCurrentPath] = useState<string>("");
  const [fileContent, setFileContent] = useState<{ path: string; content: string } | null>(null);
  const [issueTitle, setIssueTitle] = useState("");
  const [issueBody, setIssueBody] = useState("");
  const [issueLabels, setIssueLabels] = useState("");
  const [submittingIssue, setSubmittingIssue] = useState(false);
  const [issueSuccess, setIssueSuccess] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchIssues = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/github?action=issues&state=open&perPage=50");
      const json = await res.json();
      if (json.success) setIssues(json.data);
    } catch {
      /* silent */
    }
    setLoading(false);
  }, []);

  const fetchPulls = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/github?action=pulls&state=open&perPage=50");
      const json = await res.json();
      if (json.success) setPulls(json.data);
    } catch {
      /* silent */
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
        if (path) {
          const prefix = path + "/";
          const filtered = items.filter(
            (item) => item.path.startsWith(prefix) && item.path.slice(prefix.length).indexOf("/") === -1,
          );
          setTree(filtered.map((item) => ({ ...item, path: item.path.slice(prefix.length) })));
        } else {
          const filtered = items.filter((item) => item.path.indexOf("/") === -1);
          setTree(filtered);
        }
      }
    } catch {
      /* silent */
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
      }
    } catch {
      /* silent */
    }
    setLoading(false);
  }, []);

  const fetchCommits = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/github?action=commits&perPage=50");
      const json = await res.json();
      if (json.success) setCommits(json.data);
    } catch {
      /* silent */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      switch (ghTab) {
        case "issues": await fetchIssues(); break;
        case "pulls": await fetchPulls(); break;
        case "files": await fetchTree(currentPath); break;
        case "commits": await fetchCommits(); break;
      }
    })();
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghTab, currentPath]);

  const handleCreateIssue = async () => {
    if (!issueTitle.trim()) return;
    setSubmittingIssue(true);
    setIssueSuccess(false);
    setIssueError(null);
    try {
      const lbls = issueLabels.split(",").map((l) => l.trim()).filter(Boolean);
      const res = await fetch("/api/github?action=createIssue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: issueTitle, body: issueBody, labels: lbls }),
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

  return (
    <motion.div
      key="github"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* GitHub Tab Navigation */}
      <nav className="border-b border-border mb-6">
        <div className="flex gap-0 overflow-x-auto">
          {ghTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setGhTab(tab.key); setCurrentPath(""); setFileContent(null); }}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                ghTab === tab.key
                  ? "border-emerald-500 text-emerald-600"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {loading && ghTab !== "files" && <Spinner />}

      {/* Issues Tab */}
      {ghTab === "issues" && !loading && (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-lg font-semibold text-foreground mb-4">Create New Issue</h2>
            {issueSuccess && (
              <div className="mb-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 px-4 py-3 rounded-lg text-sm">
                Issue created successfully!
                <button onClick={() => setIssueSuccess(false)} className="ml-3 underline hover:text-emerald-600">Dismiss</button>
              </div>
            )}
            {issueError && (
              <div className="mb-4 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
                {issueError}
                <button onClick={() => setIssueError(null)} className="ml-3 underline hover:text-red-300">Dismiss</button>
              </div>
            )}
            <div className="space-y-3">
              <input type="text" placeholder="Issue title" value={issueTitle} onChange={(e) => setIssueTitle(e.target.value)}
                className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500" />
              <textarea placeholder="Write a description..." rows={3} value={issueBody} onChange={(e) => setIssueBody(e.target.value)}
                className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 resize-y" />
              <input type="text" placeholder="Labels (comma-separated)" value={issueLabels} onChange={(e) => setIssueLabels(e.target.value)}
                className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500" />
              <button onClick={handleCreateIssue} disabled={submittingIssue || !issueTitle.trim()}
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-muted disabled:text-muted-foreground text-foreground px-5 py-2.5 rounded-lg text-sm font-medium transition-colors">
                {submittingIssue && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {submittingIssue ? "Creating..." : "Create Issue"}
              </button>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              Open Issues <span className="ml-2 text-sm font-normal text-muted-foreground">({issues.length})</span>
            </h2>
            {issues.length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">No open issues found</div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto custom-scrollbar">
                {issues.map((issue) => (
                  <a key={issue.number} href={issue.html_url} target="_blank" rel="noopener noreferrer"
                    className="block bg-card border border-border rounded-lg px-5 py-4 hover:border-border hover:bg-[#1e293b] transition-colors group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <span className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${issue.state === "open" ? "border-emerald-500 text-emerald-500" : "border-purple-500 text-purple-500"}`}>
                          {issue.state === "open" ? (
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                          ) : (
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                          )}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-foreground font-medium group-hover:text-emerald-600 transition-colors truncate">{issue.title}</span>
                            <span className="text-muted-foreground text-sm">#{issue.number}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {issue.labels.map((label) => (
                              <span key={label.id} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${labelColor(label.color)}`} style={{ backgroundColor: `#${label.color}` }}>{label.name}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">{timeAgo(issue.created_at)}</span>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pull Requests Tab */}
      {ghTab === "pulls" && !loading && (
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3">
            Open Pull Requests <span className="ml-2 text-sm font-normal text-muted-foreground">({pulls.length})</span>
          </h2>
          {pulls.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">No open pull requests found</div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto custom-scrollbar">
              {pulls.map((pr) => (
                <a key={pr.number} href={pr.html_url} target="_blank" rel="noopener noreferrer"
                  className="block bg-card border border-border rounded-lg px-5 py-4 hover:border-border hover:bg-[#1e293b] transition-colors group">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${pr.draft ? "bg-muted text-foreground" : pr.merged ? "bg-purple-500/20 text-purple-600" : pr.state === "open" ? "bg-emerald-500/20 text-emerald-600" : "bg-red-500/20 text-red-400"}`}>
                          {pr.draft ? "Draft" : pr.state === "open" ? "Open" : "Closed"}
                        </span>
                        <span className="text-foreground font-medium group-hover:text-emerald-600 transition-colors truncate">{pr.title}</span>
                        <span className="text-muted-foreground text-sm">#{pr.number}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={pr.user.avatar_url} alt={pr.user.login} className="w-4 h-4 rounded-full" />
                        {pr.user.login}
                        <span><span className="text-cyan-600">{pr.head.ref}</span> <span className="mx-1.5 text-muted-foreground">into</span> <span className="text-orange-600">{pr.base.ref}</span></span>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">{timeAgo(pr.created_at)}</span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Files Tab */}
      {ghTab === "files" && (
        <div>
          {currentPath && (
            <div className="flex items-center gap-2 mb-4 text-sm">
              <button onClick={handleBackToRoot} className="flex items-center gap-1 text-emerald-600 hover:text-emerald-600"><ChevronLeftIcon /> Root</button>
              <span className="text-muted-foreground">/</span>
              {currentPath.split("/").map((part, i, arr) => (
                <span key={i} className="flex items-center gap-2">
                  {i < arr.length - 1 ? (
                    <button onClick={() => handleBreadcrumbClick(i + 1)} className="text-emerald-600 hover:text-emerald-600">{part}</button>
                  ) : (
                    <span className="text-foreground">{part}</span>
                  )}
                  {i < arr.length - 1 && <span className="text-muted-foreground">/</span>}
                </span>
              ))}
            </div>
          )}
          {fileContent && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground font-mono">{fileContent.path}</span>
                <button onClick={() => { setFileContent(null); fetchTree(currentPath); }} className="text-sm text-emerald-600 hover:text-emerald-600">Back to tree</button>
              </div>
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="bg-card px-4 py-2 border-b border-border"><span className="text-xs text-muted-foreground font-mono">{fileContent.path}</span></div>
                <pre className="code-block p-4 overflow-x-auto max-h-[500px] overflow-y-auto custom-scrollbar text-foreground"><code>{fileContent.content}</code></pre>
              </div>
            </div>
          )}
          {!fileContent && (
            loading ? <Spinner /> : (
              <div>
                <h2 className="text-lg font-semibold text-foreground mb-3">{currentPath || "Root"}</h2>
                {tree.length === 0 ? (
                  <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">This directory is empty</div>
                ) : (
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="grid grid-cols-[1fr_auto] px-5 py-2.5 bg-card border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      <span>Name</span><span className="text-right">Size</span>
                    </div>
                    {tree.sort((a, b) => { if (a.type === b.type) return a.path.localeCompare(b.path); return a.type === "tree" ? -1 : 1; })
                      .map((item) => (
                        <button key={item.path} onClick={() => item.type === "tree" ? handleFolderClick(item.path) : handleFileClick(item.path)}
                          className="w-full grid grid-cols-[1fr_auto] px-5 py-2.5 hover:bg-[#1e293b] transition-colors text-left border-b border-slate-700/30 last:border-b-0">
                          <span className="flex items-center gap-2.5 text-sm">
                            {item.type === "tree" ? <FolderIcon className="text-amber-600" /> : <FileIcon className="text-muted-foreground" />}
                            <span className={item.type === "tree" ? "text-foreground font-medium" : "text-foreground font-mono"}>{item.path}{item.type === "tree" ? "/" : ""}</span>
                          </span>
                          <span className="text-xs text-muted-foreground text-right">{item.size != null ? formatFileSize(item.size) : ""}</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}

      {/* Commits Tab */}
      {ghTab === "commits" && !loading && (
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3">
            Recent Commits <span className="ml-2 text-sm font-normal text-muted-foreground">({commits.length})</span>
          </h2>
          {commits.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">No commits found</div>
          ) : (
            <div className="space-y-1 max-h-[600px] overflow-y-auto custom-scrollbar">
              {commits.map((commit) => (
                <a key={commit.sha} href={commit.html_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-start gap-3 bg-card border border-border rounded-lg px-5 py-3 hover:border-border hover:bg-[#1e293b] transition-colors group">
                  <div className="mt-0.5 flex-shrink-0">
                    {commit.author ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={commit.author.avatar_url} alt={commit.author.login} className="w-8 h-8 rounded-full" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground">{commit.commit.author.name.charAt(0)}</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground font-medium truncate group-hover:text-emerald-600 transition-colors">{commit.commit.message.split("\n")[0]}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      <span>{commit.commit.author.name}</span>
                      <span>{timeAgo(commit.commit.author.date)}</span>
                      <span className="font-mono text-muted-foreground">{commit.sha.slice(0, 7)}</span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
