import { NextRequest, NextResponse } from "next/server";
import {
  getRepo,
  listIssues,
  createIssue,
  listPullRequests,
  getRepoTree,
  getFileContent,
  createOrUpdateFile,
  listBranches,
  listCommits,
  searchCode,
} from "@/lib/integrations/github";

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

  try {
    switch (action) {
      case "repo":
        return ok(await getRepo());

      case "issues": {
        const state = (searchParams.get("state") as "open" | "closed" | "all") || "open";
        const page = Number(searchParams.get("page")) || 1;
        const perPage = Number(searchParams.get("perPage")) || 30;
        return ok(await listIssues(state, page, perPage));
      }

      case "pulls": {
        const state = (searchParams.get("state") as "open" | "closed" | "all") || "open";
        const page = Number(searchParams.get("page")) || 1;
        const perPage = Number(searchParams.get("perPage")) || 30;
        return ok(await listPullRequests(state, page, perPage));
      }

      case "tree": {
        const path = searchParams.get("path") || undefined;
        const recursive = searchParams.get("recursive") === "true";
        return ok(await getRepoTree(path, recursive));
      }

      case "file": {
        const path = searchParams.get("path");
        if (!path) return err("Missing 'path' query parameter", 400);
        return ok(await getFileContent(path));
      }

      case "branches":
        return ok(await listBranches());

      case "commits": {
        const page = Number(searchParams.get("page")) || 1;
        const perPage = Number(searchParams.get("perPage")) || 30;
        return ok(await listCommits(page, perPage));
      }

      case "search": {
        const query = searchParams.get("query");
        if (!query) return err("Missing 'query' query parameter", 400);
        return ok(await searchCode(query));
      }

      default:
        return err(`Unknown action: ${action}`, 400);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return err(message);
  }
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const action = searchParams.get("action");

  try {
    const body = await req.json();

    switch (action) {
      case "createIssue": {
        const { title, body: issueBody, labels } = body as {
          title: string;
          body: string;
          labels?: string[];
        };
        if (!title) return err("Missing 'title' in request body", 400);
        return ok(await createIssue(title, issueBody || "", labels));
      }

      case "updateFile": {
        const { path, content, message, sha } = body as {
          path: string;
          content: string;
          message: string;
          sha?: string;
        };
        if (!path || content === undefined || !message) {
          return err("Missing 'path', 'content', or 'message' in request body", 400);
        }
        return ok(await createOrUpdateFile(path, content, message, sha));
      }

      default:
        return err(`Unknown action: ${action}`, 400);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return err(message);
  }
}
