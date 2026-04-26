// ---------------------------------------------------------------------------
// Vercel Tools
// ---------------------------------------------------------------------------
import { z, tool, zodSchema, safeJson, safeParseRes,
  listProjects, listDeployments, listDomains, getDeployment } from "./shared";

// ---------------------------------------------------------------------------
// Vercel Tools
// ---------------------------------------------------------------------------

export const vercelProjectsTool = tool({
  description: "List all Vercel projects.",
  inputSchema: zodSchema(z.object({
    limit: z.number().optional().describe("Number of projects to return (default: 20)"),
  })),
  execute: safeJson(async ({ limit }) => {
    return await listProjects(limit);
  }),
});

export const vercelDeploymentsTool = tool({
  description: "List deployments for a Vercel project.",
  inputSchema: zodSchema(z.object({
    projectIdOrName: z.string().describe("Vercel project ID or name"),
    limit: z.number().optional().describe("Number of deployments (default: 20)"),
  })),
  execute: safeJson(async ({ projectIdOrName, limit }) => {
    return await listDeployments(projectIdOrName, limit);
  }),
});

export const vercelDomainsTool = tool({
  description: "List all Vercel domains.",
  inputSchema: zodSchema(z.object({
    projectId: z.string().optional().describe("Filter by project ID"),
  })),
  execute: safeJson(async ({ projectId }) => {
    return await listDomains(projectId);
  }),
});

// ---------------------------------------------------------------------------
// Vercel Deploy Tool
// ---------------------------------------------------------------------------

export const vercelDeployTool = tool({
  description: "Trigger a redeployment on Vercel for a project. Uses the Vercel API to create a new deployment from the latest production commit.",
  inputSchema: zodSchema(z.object({
    projectIdOrName: z.string().describe("Vercel project ID or name"),
  })),
  execute: safeJson(async ({ projectIdOrName }) => {
    const token = process.env.VERCEL_API_TOKEN || "";
    if (!token) throw new Error("VERCEL_API_TOKEN not configured");

    // Step 1: Get project details to find the deployment target
    const teamId = process.env.VERCEL_TEAM_ID || "";
    let projectsUrl = `https://api.vercel.com/v9/projects/${encodeURIComponent(projectIdOrName)}`;
    if (teamId) projectsUrl += `?teamId=${teamId}`;

    const projectRes = await fetch(projectsUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!projectRes.ok) throw new Error(`Failed to find project: ${projectRes.status}`);
    const project = await safeParseRes<{ id: string; name: string; targets?: Array<{ id: string; ref: string }> }>(projectRes);

    // Step 2: Get the latest deployment to find the commit SHA
    let deploymentsUrl = `https://api.vercel.com/v6/deployments?projectId=${project.id}&limit=1`;
    if (teamId) deploymentsUrl += `&teamId=${teamId}`;

    const deploymentsRes = await fetch(deploymentsUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!deploymentsRes.ok) throw new Error(`Failed to get deployments: ${deploymentsRes.status}`);
    const deploymentsData = await safeParseRes<{ deployments?: Array<{ meta?: { githubCommitSha?: string }; target?: string }> }>(deploymentsRes);
    const latestDeployment = deploymentsData.deployments?.[0];

    if (!latestDeployment) throw new Error("No previous deployments found to redeploy from");

    // Step 3: Trigger redeployment using the Vercel API
    const deployUrl = `https://api.vercel.com/v13/deployments`;
    const deployBody: Record<string, unknown> = {
      name: project.name,
      projectId: project.id,
      target: latestDeployment.target || "production",
    };
    if (latestDeployment.meta?.githubCommitSha) {
      deployBody.githubCommitSha = latestDeployment.meta.githubCommitSha;
    }
    if (teamId) deployBody.teamId = teamId;

    const deployRes = await fetch(deployUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(deployBody),
    });
    if (!deployRes.ok) {
      const errText = await deployRes.text().catch(() => "Unknown error");
      throw new Error(`Redeployment failed (${deployRes.status}): ${errText}`);
    }
    const deployData = await safeParseRes<{ id: string; state: string; url: string }>(deployRes);

    return {
      success: true,
      deploymentId: deployData.id,
      state: deployData.state,
      url: deployData.url,
      project: project.name,
      message: `Redeployment triggered for ${project.name}`,
    };
  }),
});

// ---------------------------------------------------------------------------
// Vercel Logs Tool
// ---------------------------------------------------------------------------

export const vercelLogsTool = tool({
  description: "Get build logs for the most recent deployment of a Vercel project.",
  inputSchema: zodSchema(z.object({
    projectIdOrName: z.string().describe("Vercel project ID or name"),
    limit: z.number().optional().describe("Max log entries to return (default: 100)"),
  })),
  execute: safeJson(async ({ projectIdOrName, limit }) => {
    // Get latest deployment
    const deployments = await listDeployments(projectIdOrName, 1);
    if (!deployments.length) throw new Error("No deployments found");
    const latest = deployments[0];

    // Fetch build events
    const token = process.env.VERCEL_API_TOKEN || "";
    const teamId = process.env.VERCEL_TEAM_ID || "";
    let eventsUrl = `https://api.vercel.com/v2/deployments/${latest.id}/events`;
    if (teamId) eventsUrl += `?teamId=${teamId}`;

    const res = await fetch(eventsUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) throw new Error(`Vercel logs error: ${res.status}`);
    const data = await safeParseRes<{ events: Array<{ type: string; text: string; created: number; payload?: string }> }>(res);

    const events = (data.events || []).slice(0, limit || 100).map(e => ({
      type: e.type,
      text: e.text,
      timestamp: new Date(e.created).toISOString(),
    }));

    return { deploymentId: latest.id, state: latest.state, url: latest.url, events };
  }),
});

