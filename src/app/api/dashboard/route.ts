// ---------------------------------------------------------------------------
// Dashboard API — Snapshot of all dashboard data (non-SSE fallback)
// GET /api/dashboard
//
// Returns: agent statuses, recent activity, metrics, todos
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getAllAgentStatuses } from "@/lib/agents";
import {
  getRecentActivity,
  getAllPersistedStatuses,
  getDashboardMetrics,
} from "@/lib/activity";
import { listTodos } from "@/lib/workspace";

const AGENT_MAP: Record<string, { name: string; emoji: string; color: string }> = {
  general: { name: "Claw General", emoji: "🤵", color: "emerald" },
  mail: { name: "Mail Agent", emoji: "✉️", color: "blue" },
  code: { name: "Code Agent", emoji: "💻", color: "purple" },
  data: { name: "Data Agent", emoji: "📊", color: "amber" },
  creative: { name: "Creative Agent", emoji: "🧠", color: "rose" },
  research: { name: "Research Agent", emoji: "🔍", color: "teal" },
  ops: { name: "Ops Agent", emoji: "⚡", color: "orange" },
};

export async function GET() {
  try {
    const [inMemoryStatuses, dbStatuses, recentActivity, metrics, todos] =
      await Promise.all([
        Promise.resolve(getAllAgentStatuses()),
        getAllPersistedStatuses().catch(() => ({} as Record<string, { tasks_completed: number; messages_processed: number }>)),
        getRecentActivity(50).catch(() => []),
        getDashboardMetrics().catch(() => ({
          messagesToday: 0,
          toolCallsToday: 0,
          tasksDone: 0,
          activeDelegations: 0,
        })),
        listTodos({ limit: 20 }).catch(() => []),
      ]);

    // Merge statuses
    const mergedStatuses = inMemoryStatuses.map((s) => {
      const db = dbStatuses[s.id];
      return {
        id: s.id,
        name: AGENT_MAP[s.id]?.name || s.id,
        emoji: AGENT_MAP[s.id]?.emoji || "🤖",
        color: AGENT_MAP[s.id]?.color || "emerald",
        status: s.status,
        currentTask: s.currentTask,
        lastActivity: s.lastActivity,
        tasksCompleted: db?.tasks_completed || s.tasksCompleted,
        messagesProcessed: db?.messages_processed || s.messagesProcessed,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        agentStatuses: mergedStatuses,
        recentActivity,
        metrics,
        todos,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
