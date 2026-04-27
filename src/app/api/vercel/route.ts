import { NextRequest, NextResponse } from "next/server";
import {
  listProjects,
  getProject,
  listDeployments,
  listDomains,
  listEnvVars,
} from "@/lib/integrations/vercel";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function ok(data: unknown) {
  return NextResponse.json({ success: true, data });
}

function err(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const action = searchParams.get("action");

  const token = process.env.VERCEL_API_TOKEN;
  if (!token) {
    return err("Vercel not connected. Set VERCEL_API_TOKEN in environment variables.", 400);
  }

  try {
    switch (action) {
      case "projects": {
        const limit = Number(searchParams.get("limit")) || 20;
        const projects = await listProjects(limit);
        return ok(projects);
      }

      case "project": {
        const projectId = searchParams.get("id");
        if (!projectId) return err("Missing 'id' parameter", 400);
        const project = await getProject(projectId);
        return ok(project);
      }

      case "deployments": {
        const projectId = searchParams.get("projectId");
        if (!projectId) return err("Missing 'projectId' parameter", 400);
        const limit = Number(searchParams.get("limit")) || 20;
        const deployments = await listDeployments(projectId, limit);
        return ok(deployments);
      }

      case "domains": {
        const projectId = searchParams.get("projectId") || undefined;
        const domains = await listDomains(projectId);
        return ok(domains);
      }

      case "env": {
        const projectId = searchParams.get("projectId");
        if (!projectId) return err("Missing 'projectId' parameter", 400);
        const envVars = await listEnvVars(projectId);
        return ok(envVars);
      }

      default:
        return err(`Unknown action: ${action}`, 400);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return err(message);
  }
}
