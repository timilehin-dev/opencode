// ---------------------------------------------------------------------------
// GitHub Tools
// ---------------------------------------------------------------------------
import { z, tool, zodSchema, safeJson,
  getRepo, listIssues, createIssue, updateIssue, listPullRequests, listCommits,
  getRepoTree, getFileContent, searchCode, listBranches, createPullRequest,
  getPullRequest, getPullRequestFiles, createPRComment, createBranch } from "./shared";

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

