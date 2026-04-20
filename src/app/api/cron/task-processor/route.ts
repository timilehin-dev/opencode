// ---------------------------------------------------------------------------
// Vercel Cron — Process Agent Tasks (LIGHTWEIGHT — evaluates automations only)
//
// NOTE: Actual task execution now happens in GitHub Actions
// (scripts/execute-tasks.mjs) which has no timeout limits.
//
// This Vercel endpoint only evaluates automation triggers and creates
// pending tasks in the queue. GitHub Actions picks them up within 2 minutes.
//
// Kept as a fallback for environments without GitHub Actions configured.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { evaluateAutomations } from "@/lib/automation-engine";

export const maxDuration = 10; // Lightweight — just evaluates triggers, doesn't execute

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  const expectedSecret = process.env.CRON_SECRET || "claw-cron-2025";

  if (secret !== expectedSecret) {
    return NextResponse.json(
      { error: "Unauthorized — missing or invalid secret" },
      { status: 401 },
    );
  }

  const startTime = Date.now();

  // Only evaluate automations — don't execute tasks (that's GitHub Actions' job now)
  let autoResult;
  try {
    autoResult = await evaluateAutomations();
  } catch (error) {
    return NextResponse.json({
      phase: "evaluate_automations_only",
      status: "error",
      error: error instanceof Error ? error.message : "Unknown",
      duration_ms: Date.now() - startTime,
      note: "Task execution moved to GitHub Actions (.github/workflows/task-executor.yml)",
    });
  }

  return NextResponse.json({
    phase: "evaluate_automations_only",
    status: "ok",
    automationsTriggered: autoResult.triggered,
    tasksCreated: autoResult.tasksCreated,
    errors: autoResult.errors.length > 0 ? autoResult.errors : undefined,
    duration_ms: Date.now() - startTime,
    note: "Task execution moved to GitHub Actions (.github/workflows/task-executor.yml)",
  });
}
