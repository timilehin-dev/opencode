// Vercel REST API Client — direct API integration
// Uses Vercel API tokens: https://vercel.com/docs/rest-api/introduction

const BASE_URL = "https://api.vercel.com";

function headers(): HeadersInit {
  const token = process.env.VERCEL_API_TOKEN || "";
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VercelProject {
  id: string;
  name: string;
  framework: string | null;
  createdAt: number;
  updatedAt: number;
  targets: { production?: { id: string } };
  link: { type: string; origin: string };
  rootDirectory: string | null;
  accountSlug: string;
  region: string | null;
  builder: string;
  alias: string[];
  domains: string[];
}

export interface VercelDeployment {
  id: string;
  state: string;
  name: string;
  url: string;
  createdAt: number;
  updatedAt: number;
  project: string;
  target: string;
  isProduction: boolean;
  source?: string;
  meta?: {
    githubCommitRef?: string;
    githubCommitMessage?: string;
    githubCommitAuthorLogin?: string;
    githubOrg?: string;
    githubRepo?: string;
    githubPullRequestId?: number;
  };
  alias?: string[];
}

export interface VercelDomain {
  id: string;
  name: string;
  createdAt: number;
  verified: boolean;
  projectId?: string;
}

export interface VercelEnvVar {
  id: string;
  key: string;
  value: string;
  type: "encrypted" | "plain" | "sensitive";
  target: string[];
  gitBranch?: string;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function listProjects(limit = 20): Promise<VercelProject[]> {
  const res = await fetch(`${BASE_URL}/v9/projects?limit=${limit}`, {
    headers: headers(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vercel API error: ${res.status} — ${err}`);
  }
  const json = (await res.json()) as { projects: VercelProject[] };
  return json.projects || [];
}

export async function getProject(projectIdOrName: string): Promise<VercelProject> {
  const res = await fetch(`${BASE_URL}/v9/projects/${projectIdOrName}`, {
    headers: headers(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vercel API error: ${res.status} — ${err}`);
  }
  return (await res.json()) as VercelProject;
}

// ---------------------------------------------------------------------------
// Deployments
// ---------------------------------------------------------------------------

export async function listDeployments(
  projectIdOrName: string,
  limit = 20,
): Promise<VercelDeployment[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  const res = await fetch(
    `${BASE_URL}/v6/deployments?projectId=${projectIdOrName}&${params}`,
    { headers: headers() },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vercel API error: ${res.status} — ${err}`);
  }
  const json = (await res.json()) as { deployments: VercelDeployment[] };
  return json.deployments || [];
}

export async function getDeployment(deploymentId: string): Promise<VercelDeployment> {
  const res = await fetch(`${BASE_URL}/v13/deployments/${deploymentId}`, {
    headers: headers(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vercel API error: ${res.status} — ${err}`);
  }
  return (await res.json()) as VercelDeployment;
}

// ---------------------------------------------------------------------------
// Domains
// ---------------------------------------------------------------------------

export async function listDomains(projectId?: string): Promise<VercelDomain[]> {
  const params = projectId ? `?projectId=${projectId}` : "";
  const res = await fetch(`${BASE_URL}/v9/domains${params}`, {
    headers: headers(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vercel API error: ${res.status} — ${err}`);
  }
  const json = (await res.json()) as { domains: VercelDomain[] };
  return json.domains || [];
}

// ---------------------------------------------------------------------------
// Environment Variables
// ---------------------------------------------------------------------------

export async function listEnvVars(
  projectIdOrName: string,
): Promise<VercelEnvVar[]> {
  const res = await fetch(
    `${BASE_URL}/v9/projects/${projectIdOrName}/env`,
    { headers: headers() },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vercel API error: ${res.status} — ${err}`);
  }
  const json = (await res.json()) as { envs: VercelEnvVar[] };
  return json.envs || [];
}
