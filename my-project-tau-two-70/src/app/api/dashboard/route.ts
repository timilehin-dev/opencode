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
import { getRecentTasks } from "@/lib/task-queue";
import { getRecentDelegations } from "@/lib/delegations";
import { AGENT_MAP, getAgentMeta } from "@/lib/agent-map";

export async function GET() {
  try {
    const [inMemoryStatuses, dbStatuses, recentActivity, metrics, todos, recentTasks, recentDelegations] =
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
        getRecentTasks(20).catch(() => []),
        getRecentDelegations(20).catch(() => []),
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
        tasks: recentTasks,
        delegations: recentDelegations,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
