// ---------------------------------------------------------------------------
// Proactive Suggestions API
//
// Tracks which system intelligence suggestions have been executed or dismissed
// so they don't reappear in future heartbeat cycles.
//
// POST /api/proactive/suggestions
//   body: { action: "run" | "dismiss", suggestion: string, agent?: string, priority?: string }
//   - "run": Creates an agent_task + task_board item, then records the suggestion
//   - "dismiss": Just records the suggestion so it won't reappear
//
// GET /api/proactive/suggestions
//   Returns recent suggestions for the UI to know what's been acted on
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/core/db";
import { createTask } from "@/lib/tasks/task-queue";
import { logActivity } from "@/lib/tasks/activity";
import { getAllAgentStatuses, updateAgentStatus } from "@/lib/agent/agents";

// Schema: proactive_suggestions table
const ENSURE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS proactive_suggestions (
  id BIGSERIAL PRIMARY KEY,
  suggestion_hash VARCHAR(64) NOT NULL,
  suggestion_text TEXT NOT NULL,
  action_taken TEXT NOT NULL CHECK (action_taken IN ('run', 'dismiss')),
  agent_id TEXT,
  task_id BIGINT,
  board_item_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_proactive_suggestions_hash ON proactive_suggestions(suggestion_hash);
CREATE INDEX IF NOT EXISTS idx_proactive_suggestions_created ON proactive_suggestions(created_at DESC);
`;

// Simple hash function for suggestion dedup (SHA-256 first 16 chars)
function hashSuggestion(text: string): string {
  let hash = 0;
  const normalized = text.toLowerCase().trim().replace(/\s+/g, " ");
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  // Add a secondary hash for better distribution
  let hash2 = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash2 = ((hash2 << 5) + hash2) + normalized.charCodeAt(i);
    hash2 |= 0;
  }
  return `${Math.abs(hash).toString(16)}${Math.abs(hash2).toString(16)}`.padStart(16, "0").slice(0, 16);
}

// Ensure table exists on first call
let tableEnsured = false;
async function ensureTable() {
  if (tableEnsured) return;
  try {
    await query(ENSURE_TABLE_SQL);
    tableEnsured = true;
  } catch (err) {
    console.error("[Proactive Suggestions] Failed to ensure table:", err);
    throw err;
  }
}

function ok(data: unknown) {
  return NextResponse.json({ success: true, data });
}

function err(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

// ---------------------------------------------------------------------------
// GET: Return recently acted-on suggestion hashes
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    await ensureTable();
    const result = await query(`
      SELECT suggestion_hash, suggestion_text, action_taken, agent_id, task_id, board_item_id, created_at
      FROM proactive_suggestions
      WHERE created_at > NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC
      LIMIT 100
    `);
    return ok(result.rows);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to fetch suggestions");
  }
}

// ---------------------------------------------------------------------------
// POST: Execute or dismiss a suggestion
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    await ensureTable();
    const body = await req.json();
    const { action, suggestion, agent, priority } = body as {
      action?: string;
      suggestion?: string;
      agent?: string;
      priority?: string;
    };

    if (!action || !suggestion) {
      return err("Missing action or suggestion", 400);
    }

    if (!["run", "dismiss"].includes(action)) {
      return err("Invalid action. Use 'run' or 'dismiss'", 400);
    }

    const suggestionHash = hashSuggestion(suggestion);

    // Check if already acted on
    const existing = await query(
      `SELECT id, action_taken FROM proactive_suggestions WHERE suggestion_hash = $1`,
      [suggestionHash]
    );

    if (existing.rows.length > 0) {
      return ok({
        already_processed: true,
        previous_action: existing.rows[0].action_taken,
        message: "This suggestion has already been acted on",
      });
    }

    let taskId: number | null = null;
    let boardItemId: number | null = null;

    if (action === "run") {
      // 1. Create an agent_task
      const agentId = agent || "general";
      const taskPriority = priority || "medium";

      try {
        taskId = await createTask({
          agent_id: agentId,
          task: suggestion,
          context: "Executed from System Intelligence recommendation on dashboard",
          trigger_type: "manual",
          trigger_source: "dashboard_intelligence",
          priority: taskPriority,
        });
      } catch (taskErr) {
        console.error("[Suggestions API] Failed to create task:", taskErr);
        // Continue — we'll still record the suggestion
      }

      // 2. Add to task_board so it's visible on the Task Board page
      try {
        const boardResult = await query(
          `INSERT INTO task_board (title, description, status, priority, assigned_agent, created_by, context, tags)
           VALUES ($1, $2, 'backlog', $3, $4, 'system_intelligence', $5, '["proactive", "dashboard"]')
           RETURNING id`,
          [
            suggestion.length > 200 ? suggestion.slice(0, 197) + "..." : suggestion,
            `System Intelligence recommendation executed at ${new Date().toISOString()}${taskId ? `. Task #${taskId}` : ""}`,
            taskPriority,
            agentId,
            `Proactive suggestion: ${suggestion}`,
          ]
        );
        boardItemId = Number(boardResult.rows[0]?.id);
      } catch (boardErr) {
        console.error("[Suggestions API] Failed to add to task board:", boardErr);
        // Non-critical — task was still created
      }

      // 3. Update agent status
      try {
        updateAgentStatus(agentId, {
          status: "busy",
          currentTask: suggestion,
          lastActivity: new Date().toISOString(),
        });
      } catch {
        // Non-critical
      }

      // 4. Log activity
      try {
        logActivity({
          agentId,
          agentName: agentId,
          action: "intelligence_suggestion_run",
          detail: `Executed suggestion: ${suggestion.slice(0, 80)}${taskId ? ` (Task #${taskId})` : ""}`,
        });
      } catch {
        // Non-critical
      }
    } else {
      // Dismiss — just log the activity
      try {
        logActivity({
          agentId: "system",
          agentName: "System",
          action: "intelligence_suggestion_dismissed",
          detail: `Dismissed suggestion: ${suggestion.slice(0, 80)}`,
        });
      } catch {
        // Non-critical
      }
    }

    // Record the suggestion as processed
    await query(
      `INSERT INTO proactive_suggestions (suggestion_hash, suggestion_text, action_taken, agent_id, task_id, board_item_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [suggestionHash, suggestion, action, agent || null, taskId, boardItemId]
    );

    return ok({
      processed: true,
      action,
      suggestion,
      taskId,
      boardItemId,
      message:
        action === "run"
          ? `Suggestion executed${taskId ? ` — Task #${taskId} created` : ""}${boardItemId ? `, added to Task Board` : ""}`
          : "Suggestion dismissed — won't appear again",
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Internal server error");
  }
}
