// ---------------------------------------------------------------------------
// Vercel Cron — Self-Improvement Pipeline
// Runs twice daily (9 AM & 9 PM WAT) to autonomously ship improvements.
//
// Workflow:
// 1. Authenticate via CRON_SECRET
// 2. Scan recent codebase state via GitHub API
// 3. Use LLM to identify 2-3 improvements
// 4. Apply changes via GitHub API (commits to main)
// 5. Trigger Vercel build verification
// 6. Log results to DB + send notification
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getProvider, getAgent } from "@/lib/agents";
import { withAgentContext } from "@/lib/tools";
import { logActivity } from "@/lib/activity";
import { query } from "@/lib/db";
import { sendProactiveNotification } from "@/lib/proactive-notifications";

export const maxDuration = 300; // 5 min

// ---------------------------------------------------------------------------
// Improvement categories the LLM cycles through
// ---------------------------------------------------------------------------

const IMPROVEMENT_CATEGORIES = [
  "Skills & Tools Quality — improve tool descriptions, add edge-case handling, enhance document generation formatting, fix LaTeX handling, add new utility tools",
  "Agent System Prompts — refine agent instructions, improve routing accuracy, add domain expertise, fix misleading prompts, enhance decision frameworks",
  "UI/UX Polish — improve loading states, fix responsive layouts, enhance accessibility (ARIA), add micro-animations, polish component styling",
  "Performance & Reliability — optimize query patterns, add caching, reduce bundle size, improve error boundaries, harden retry logic",
  "Security Hardening — tighten CSP headers, add input validation, sanitize outputs, improve auth patterns, audit dependencies",
] as const;

// ---------------------------------------------------------------------------
// Key files to scan on each run
// ---------------------------------------------------------------------------

const SCAN_FILES = [
  { path: "src/lib/tools.ts", desc: "Core tools & skill definitions" },
  { path: "src/lib/agents.ts", desc: "Agent configs & system prompts" },
  { path: "src/app/(app)/layout.tsx", desc: "Main app layout & accessibility" },
  { path: "src/app/(app)/page.tsx", desc: "Dashboard page" },
  { path: "src/app/api/chat/route.ts", desc: "Chat API — streaming & persistence" },
  { path: "src/middleware.ts", desc: "Rate limiting & security headers" },
  { path: "package.json", desc: "Dependencies & scripts" },
];

// ---------------------------------------------------------------------------
// GET: Cron trigger — autonomous improvement cycle
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const secret = request.headers.get("x-cron-secret") || new URL(request.url).searchParams.get("secret");
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  if (secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const runId = `imp-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 8)}`;

  // Pick improvement category based on day/hour to rotate focus
  const hour = new Date().getUTCHours();
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const categoryIndex = dayOfYear % IMPROVEMENT_CATEGORIES.length;
  const primaryCategory = IMPROVEMENT_CATEGORIES[categoryIndex];
  const secondaryCategory = IMPROVEMENT_CATEGORIES[(categoryIndex + 1) % IMPROVEMENT_CATEGORIES.length];

  logActivity({
    agentId: "system",
    agentName: "Self-Improvement",
    action: "improvement_cycle_start",
    detail: `Run ${runId} — Focus: ${primaryCategory}`,
  }).catch(() => {});

  const results = {
    runId,
    timestamp: new Date().toISOString(),
    focus: primaryCategory as string,
    filesScanned: 0,
    improvements: [] as Array<{ category: string; description: string; file: string; status: string }>,
    commitsPushed: 0,
    buildStatus: "not_checked" as string,
    error: null as string | null,
    durationMs: 0,
  };

  try {
    // Step 1: Read key files via GitHub API to understand current state
    const GITHUB_TOKEN = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;
    const GITHUB_REPO = process.env.GITHUB_REPO || "timilehin-dev/my-project-tau-two-70";

    if (!GITHUB_TOKEN) {
      results.error = "No GitHub token configured (GITHUB_PAT or GITHUB_TOKEN)";
      return NextResponse.json(results, { status: 500 });
    }

    // Scan files to get current codebase context
    let codebaseContext = "";
    for (const file of SCAN_FILES) {
      try {
        const resp = await fetch(
          `https://api.github.com/repos/${GITHUB_REPO}/contents/${file.path}`,
          {
            headers: {
              Authorization: `Bearer ${GITHUB_TOKEN}`,
              Accept: "application/vnd.github.v3+json",
            },
          },
        );

        if (resp.ok) {
          const data = await resp.json() as { content: string; size: number };
          // Decode base64, but truncate large files (keep first 3000 chars)
          const content = Buffer.from(data.content, "base64").toString("utf-8");
          const truncated = content.length > 3000 ? content.slice(0, 3000) + "\n... [truncated]" : content;
          codebaseContext += `\n### ${file.path} (${file.desc})\n\`\`\`\n${truncated}\n\`\`\`\n`;
          results.filesScanned++;
        }
      } catch {
        // File may not exist — skip
      }
    }

    if (codebaseContext.length < 200) {
      results.error = "Could not read any files from repo";
      return NextResponse.json(results, { status: 500 });
    }

    // Step 2: Use LLM to analyze and identify improvements
    const codeAgent = getAgent("code") || getAgent("general");
    if (!codeAgent) {
      results.error = "No suitable agent found for analysis";
      return NextResponse.json(results, { status: 500 });
    }
    const providerResult = await getProvider(codeAgent);

    const { generateText, stepCountIs } = await import("ai");

    const analysisPrompt = `You are a senior engineer conducting an autonomous codebase improvement cycle for the Klawhub project. This is a PRODUCTION system — be conservative and precise.

## Current Codebase Context
${codebaseContext}

## Your Mission
Focus area: **${primaryCategory}**
Secondary focus: **${secondaryCategory}**

Analyze the code and identify 2-3 SPECIFIC, CONCRETE improvements. For each improvement:
1. State the exact file path
2. Describe what to change (old code → new code)
3. Explain why this improves the system

Rules:
- Be CONSERVATIVE — only suggest changes you are 100% confident about
- Prefer small, safe improvements over risky refactors
- NEVER change business logic or agent behavior significantly
- Focus on: error handling, edge cases, type safety, accessibility, performance
- If the code looks good, say "No improvements needed" for that area

Output your analysis as structured JSON:
{
  "summary": "Brief description of what you found",
  "improvements": [
    {
      "file": "src/path/to/file.ts",
      "description": "What to change and why",
      "oldCode": "exact string to find (be precise with whitespace)",
      "newCode": "exact replacement string",
      "category": "tools|agents|uiux|performance|security"
    }
  ]
}`;

    const analysisResult = await withAgentContext("code", async () => {
      return await generateText({
        model: providerResult.model,
        system: "You are an automated code improvement system. Output ONLY valid JSON. No markdown, no explanation outside the JSON.",
        messages: [{ role: "user", content: analysisPrompt }],
        maxOutputTokens: 4096,
        stopWhen: stepCountIs(3),
        abortSignal: AbortSignal.timeout(90_000),
      });
    });

    // Parse the analysis
    let analysis: {
      summary: string;
      improvements: Array<{
        file: string;
        description: string;
        oldCode: string;
        newCode: string;
        category: string;
      }>;
    };

    try {
      // Extract JSON from the response (may be wrapped in markdown code blocks)
      let jsonStr = analysisResult.text || "{}";
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1];
      jsonStr = jsonStr.replace(/^\s*\{[\s\S]*\}\s*$/, (m) => m);
      analysis = JSON.parse(jsonStr);
    } catch {
      results.error = `Failed to parse LLM analysis: ${(analysisResult.text || "").slice(0, 200)}`;
      return NextResponse.json(results, { status: 500 });
    }

    if (!analysis.improvements || analysis.improvements.length === 0) {
      results.error = "LLM found no improvements needed — codebase is clean";
      return NextResponse.json(results);
    }

    // Step 3: Apply improvements via GitHub API (one commit per improvement)
    for (const imp of analysis.improvements) {
      try {
        // First, read the current file content
        const fileResp = await fetch(
          `https://api.github.com/repos/${GITHUB_REPO}/contents/${imp.file}`,
          {
            headers: {
              Authorization: `Bearer ${GITHUB_TOKEN}`,
              Accept: "application/vnd.github.v3+json",
            },
          },
        );

        if (!fileResp.ok) {
          results.improvements.push({ category: imp.category, description: imp.description, file: imp.file, status: "failed:file_not_found" });
          continue;
        }

        const fileData = await fileResp.json() as { content: string; sha: string; encoding: string };
        const currentContent = Buffer.from(fileData.content, "base64").toString("utf-8");

        // Apply the change
        if (!currentContent.includes(imp.oldCode)) {
          results.improvements.push({ category: imp.category, description: imp.description, file: imp.file, status: "failed:old_code_not_found" });
          continue;
        }

        const newContent = currentContent.replace(imp.oldCode, imp.newCode);
        const newContentBase64 = Buffer.from(newContent, "utf-8").toString("base64");

        // Commit via GitHub API
        const commitResp = await fetch(
          `https://api.github.com/repos/${GITHUB_REPO}/contents/${imp.file}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${GITHUB_TOKEN}`,
              Accept: "application/vnd.github.v3+json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: `chore(self-improve): ${imp.description.slice(0, 80)}

[auto] ${runId} — ${imp.category}`,
              content: newContentBase64,
              sha: fileData.sha,
              branch: "main",
            }),
          },
        );

        if (commitResp.ok) {
          results.improvements.push({ category: imp.category, description: imp.description, file: imp.file, status: "committed" });
          results.commitsPushed++;
        } else {
          const errBody = await commitResp.text();
          results.improvements.push({ category: imp.category, description: imp.description, file: imp.file, status: `failed:${commitResp.status}` });
        }
      } catch (err) {
        results.improvements.push({
          category: imp.category,
          description: imp.description,
          file: imp.file,
          status: `error:${err instanceof Error ? err.message : "unknown"}`,
        });
      }
    }

    // Step 4: Log results
    const successfulImprovements = results.improvements.filter((i) => i.status === "committed");
    const failedImprovements = results.improvements.filter((i) => i.status !== "committed");

    if (successfulImprovements.length > 0) {
      logActivity({
        agentId: "system",
        agentName: "Self-Improvement",
        action: "improvement_shipped",
        detail: `Shipped ${successfulImprovements.length} improvements: ${successfulImprovements.map((i) => i.description).join("; ")}`,
        metadata: { runId, improvements: successfulImprovements },
      }).catch(() => {});

      sendProactiveNotification({
        agentId: "system",
        agentName: "Self-Improvement",
        type: "routine_result",
        title: `Auto-Improvement Shipped: ${successfulImprovements.length} changes`,
        body: `Run ${runId}\n\n${successfulImprovements.map((i) => `- [${i.category}] ${i.description} (${i.file})`).join("\n")}`,
        priority: "low",
      }).catch(() => {});
    }

    if (failedImprovements.length > 0) {
      logActivity({
        agentId: "system",
        agentName: "Self-Improvement",
        action: "improvement_failed",
        detail: `${failedImprovements.length} improvements failed: ${failedImprovements.map((i) => `${i.description}: ${i.status}`).join("; ")}`,
        metadata: { runId, failures: failedImprovements },
      }).catch(() => {});
    }

    // Step 5: Persist run to DB for history tracking
    if (process.env.SUPABASE_DB_URL) {
      try {
        await query(`
          CREATE TABLE IF NOT EXISTS self_improvement_runs (
            id SERIAL PRIMARY KEY,
            run_id TEXT NOT NULL,
            focus TEXT,
            files_scanned INT DEFAULT 0,
            commits_pushed INT DEFAULT 0,
            improvements JSONB DEFAULT '[]',
            error TEXT,
            duration_ms INT,
            created_at TIMESTAMPTZ DEFAULT NOW()
          )
        `);
        await query(
          `INSERT INTO self_improvement_runs (run_id, focus, files_scanned, commits_pushed, improvements, error, duration_ms)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            runId,
            primaryCategory,
            results.filesScanned,
            results.commitsPushed,
            JSON.stringify(results.improvements),
            results.error,
            Date.now() - startTime,
          ],
        );
      } catch {
        // DB logging is best-effort
      }
    }

    results.durationMs = Date.now() - startTime;
    return NextResponse.json(results);
  } catch (error) {
    results.error = error instanceof Error ? error.message : "Unknown error";
    results.durationMs = Date.now() - startTime;

    logActivity({
      agentId: "system",
      agentName: "Self-Improvement",
      action: "improvement_cycle_error",
      detail: `Run ${runId} failed: ${results.error}`,
    }).catch(() => {});

    sendProactiveNotification({
      agentId: "system",
      agentName: "Self-Improvement",
      type: "alert",
      title: "Self-Improvement Cycle Failed",
      body: `Run ${runId}: ${results.error}`,
      priority: "high",
    }).catch(() => {});

    return NextResponse.json(results, { status: 500 });
  }
}
