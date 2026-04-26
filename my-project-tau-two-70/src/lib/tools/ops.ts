// ---------------------------------------------------------------------------
// Ops Tools
// ---------------------------------------------------------------------------
import { z, tool, zodSchema, safeJson, getSelfBaseUrl, getSelfFetchHeaders,
  listDeployments, listCommits, listIssues } from "./shared";

// ---------------------------------------------------------------------------
// Ops Health Check Tool
// ---------------------------------------------------------------------------

export const opsHealthCheckTool = tool({
  description: "Check the health status of all Klawhub services. Returns a structured health report covering real API routes, external integrations, and infrastructure components.",
  inputSchema: zodSchema(z.object({})),
  execute: safeJson(async () => {
    const baseUrl = getSelfBaseUrl();

    // --- 1) Ping real API routes ---
    const apiEndpoints = [
      { name: "api-status",        path: "/api/status" },
      { name: "api-services",      path: "/api/services?action=status" },
      { name: "api-agents",        path: "/api/agents" },
      { name: "api-analytics",     path: "/api/analytics" },
      { name: "api-memory",        path: "/api/memory?agentId=general" },
      { name: "api-dashboard",     path: "/api/dashboard" },
      { name: "api-health",        path: "/api/health" },
    ];

    const apiResults = await Promise.allSettled(
      apiEndpoints.map(async ({ name, path }) => {
        try {
          const res = await fetch(`${baseUrl}${path}`, {
            method: "GET",
            headers: getSelfFetchHeaders(),
            signal: AbortSignal.timeout(5000),
          });
          return { service: name, path, status: res.ok ? "healthy" : "unhealthy", statusCode: res.status };
        } catch (err: any) {
          return { service: name, path, status: "unreachable", error: err.message || "timeout" };
        }
      }),
    );

    const apiHealth = apiResults.map(r =>
      r.status === "fulfilled" ? r.value : { service: "unknown", path: "", status: "error", statusCode: 500 }
    );

    // --- 2) Check external integration connectivity (env vars) ---
    const googleOauth = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);
    const githubPat = !!process.env.GITHUB_PAT;
    const vercelToken = !!process.env.VERCEL_API_TOKEN;
    const supabaseUrl = !!(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL);
    const supabaseAnonKey = !!(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY);
    const stitchKey = !!process.env.STITCH_API_KEY;
    const aihubmixKeys = (process.env.AIHUBMIX_API_KEY_1 || process.env.AIHUBMIX_API_KEY_2 || "") ? true : false;
    const ollamaKeys = (process.env.OLLAMA_CLOUD_KEY_1 || process.env.OLLAMA_CLOUD_KEY_2 || "") ? true : false;

    const integrations = [
      { service: "google-oauth",      connected: googleOauth,  detail: googleOauth ? "client_id + refresh_token configured" : "missing credentials" },
      { service: "github-pat",        connected: githubPat,    detail: githubPat ? "personal access token configured" : "GITHUB_PAT not set" },
      { service: "vercel-api",        connected: vercelToken,  detail: vercelToken ? "API token configured" : "VERCEL_API_TOKEN not set" },
      { service: "supabase",          connected: supabaseUrl && supabaseAnonKey, detail: supabaseUrl ? "URL + anon key configured" : "SUPABASE_URL not set" },
      { service: "stitch-api",        connected: stitchKey,    detail: stitchKey ? "API key configured" : "STITCH_API_KEY not set" },
      { service: "aihubmix-llm",      connected: aihubmixKeys, detail: aihubmixKeys ? "LLM API key(s) configured" : "AIHUBMIX keys not set" },
      { service: "ollama-llm",        connected: ollamaKeys,   detail: ollamaKeys ? "Ollama cloud key(s) configured" : "OLLAMA keys not set" },
    ];

    // --- 3) Aggregate ---
    const healthyApis = apiHealth.filter(r => r.status === "healthy").length;
    const healthyIntegrations = integrations.filter(i => i.connected).length;
    const totalChecks = apiHealth.length + integrations.length;
    const healthyTotal = healthyApis + healthyIntegrations;

    const overallStatus = healthyTotal === totalChecks
      ? "all_healthy"
      : healthyTotal >= Math.ceil(totalChecks * 0.7)
        ? "degraded"
        : "down";

    return {
      overallStatus,
      healthyServices: healthyTotal,
      totalServices: totalChecks,
      timestamp: new Date().toISOString(),
      apiRoutes: {
        healthy: healthyApis,
        total: apiHealth.length,
        details: apiHealth,
      },
      integrations: {
        healthy: healthyIntegrations,
        total: integrations.length,
        details: integrations,
      },
    };
  }),
});

// ---------------------------------------------------------------------------
// Ops Deployment Status Tool
// ---------------------------------------------------------------------------

export const opsDeploymentStatusTool = tool({
  description: "Get the latest deployment status for the Klawhub HQ project on Vercel.",
  inputSchema: zodSchema(z.object({})),
  execute: safeJson(async () => {
    const deployments = await listDeployments(process.env.VERCEL_PROJECT_NAME || "klawhub-hq", 1);
    if (!deployments.length) {
      return { status: "no_deployments", message: `No deployments found for ${process.env.VERCEL_PROJECT_NAME || "klawhub-hq"}` };
    }

    const latest = deployments[0];
    return {
      id: latest.id,
      state: latest.state,
      url: latest.url,
      createdAt: new Date(latest.createdAt).toISOString(),
      isProduction: latest.isProduction,
      target: latest.target,
      meta: latest.meta,
    };
  }),
});

// ---------------------------------------------------------------------------
// Ops GitHub Activity Tool
// ---------------------------------------------------------------------------

export const opsGithubActivityTool = tool({
  description: "Get recent GitHub activity including commits and issues. Returns activity summary with anomaly flags for unusual patterns.",
  inputSchema: zodSchema(z.object({
    since: z.string().optional().describe("ISO 8601 date string to filter activity from (e.g., '2024-01-01T00:00:00Z')"),
  })),
  execute: safeJson(async ({ since }) => {
    const [commits, issues] = await Promise.all([
      listCommits(1, 10),
      listIssues("all", 1, 10),
    ]);

    // Filter by date if since is provided
    const sinceDate = since ? new Date(since) : null;
    const filteredCommits = sinceDate
      ? commits.filter(c => new Date(c.commit.author.date) >= sinceDate)
      : commits;
    const filteredIssues = sinceDate
      ? issues.filter(i => new Date(i.updated_at) >= sinceDate)
      : issues;

    // Anomaly detection
    const anomalies: string[] = [];
    const openIssues = issues.filter(i => i.state === "open");
    if (openIssues.length > 20) anomalies.push("High number of open issues");
    const recentCommits = filteredCommits.slice(0, 3);
    const committers = new Set(recentCommits.map(c => c.author?.login).filter(Boolean));
    if (committers.size === 1 && recentCommits.length >= 3) anomalies.push("All recent commits from a single author");

    return {
      commitCount: filteredCommits.length,
      issueCount: filteredIssues.length,
      openIssues: openIssues.length,
      recentCommits: filteredCommits.slice(0, 5).map(c => ({
        sha: c.sha.slice(0, 7),
        message: c.commit.message.split("\n")[0],
        author: c.commit.author.name,
        date: c.commit.author.date,
      })),
      recentIssues: filteredIssues.slice(0, 5).map(i => ({
        number: i.number,
        title: i.title,
        state: i.state,
        author: i.user.login,
        updated: i.updated_at,
      })),
      anomalies: anomalies.length > 0 ? anomalies : "No anomalies detected",
      timestamp: new Date().toISOString(),
    };
  }),
});

// ---------------------------------------------------------------------------
// Ops Agent Stats Tool
// ---------------------------------------------------------------------------

export const opsAgentStatsTool = tool({
  description: "Get performance statistics for all Klawhub agents including status, tasks completed, and messages processed.",
  inputSchema: zodSchema(z.object({})),
  execute: safeJson(async () => {
    // Dynamically import to avoid circular dependency
    const { getAllAgentStatuses } = await import("../agents");
    const statuses = getAllAgentStatuses();

    return {
      totalAgents: statuses.length,
      agents: statuses.map(s => ({
        id: s.id,
        status: s.status,
        currentTask: s.currentTask,
        lastActivity: s.lastActivity,
        tasksCompleted: s.tasksCompleted,
        messagesProcessed: s.messagesProcessed,
      })),
      timestamp: new Date().toISOString(),
    };
  }),
});

