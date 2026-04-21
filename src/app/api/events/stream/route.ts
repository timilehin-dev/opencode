// ---------------------------------------------------------------------------
// SSE Endpoint — Real-time dashboard events stream
// GET /api/events/stream
//
// Sends a snapshot on connect, then polls every 3s for new activity & status
// changes. Uses ReadableStream with TextEncoder.
// Phase 3: Also streams task and delegation events.
// ---------------------------------------------------------------------------

import { getAllAgentStatuses } from "@/lib/agents";
import { getRecentActivity, getAllPersistedStatuses, getDashboardMetrics } from "@/lib/activity";
import { listTodos } from "@/lib/workspace";
import { getRecentTasks } from "@/lib/task-queue";
import { getRecentDelegations } from "@/lib/delegations";
import type { ActivityEvent, AgentStatusDB, DashboardMetrics } from "@/lib/activity";
import type { AgentTask } from "@/lib/task-queue";
import type { Delegation } from "@/lib/delegations";

export const maxDuration = 300; // SSE streams need long-lived connections on Vercel Pro

const POLL_INTERVAL_MS = 3000;

// Map agent IDs to their names/emojis/colors for the frontend
const AGENT_MAP: Record<string, { name: string; emoji: string; color: string }> = {
  general: { name: "Claw General", emoji: "🤵", color: "emerald" },
  mail: { name: "Mail Agent", emoji: "✉️", color: "blue" },
  code: { name: "Code Agent", emoji: "💻", color: "purple" },
  data: { name: "Data Agent", emoji: "📊", color: "amber" },
  creative: { name: "Creative Agent", emoji: "🧠", color: "rose" },
  research: { name: "Research Agent", emoji: "🔍", color: "teal" },
  ops: { name: "Ops Agent", emoji: "⚡", color: "orange" },
};

function formatSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(req: Request) {
  const encoder = new TextEncoder();

  // Build initial snapshot
  const [inMemoryStatuses, dbStatuses, recentActivity, metrics, todos, recentTasks, recentDelegations] = await Promise.all([
    Promise.resolve(getAllAgentStatuses()),
    getAllPersistedStatuses().catch(() => ({} as Record<string, AgentStatusDB>)),
    getRecentActivity(50).catch(() => [] as ActivityEvent[]),
    getDashboardMetrics().catch(() => ({ messagesToday: 0, toolCallsToday: 0, tasksDone: 0, activeDelegations: 0 }) as DashboardMetrics),
    listTodos({ status: "open", limit: 20 }).catch(() => []),
    getRecentTasks(20).catch(() => [] as AgentTask[]),
    getRecentDelegations(20).catch(() => [] as Delegation[]),
  ]);

  // Merge: prefer in-memory for current real-time status, use DB for persistent fields
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

  const snapshot = {
    type: "snapshot",
    agentStatuses: mergedStatuses,
    recentActivity,
    metrics,
    todos,
    tasks: recentTasks,
    delegations: recentDelegations,
  };

  const lastActivityIds = new Set(recentActivity.map((a) => a.id));
  const lastTaskIds = new Set(recentTasks.map((t) => t.id));
  const lastDelegationIds = new Set(recentDelegations.map((d) => d.id));

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial snapshot
      controller.enqueue(encoder.encode(formatSSE("snapshot", snapshot)));

      // Polling loop
      const interval = setInterval(async () => {
        try {
          const [newActivity, currentStatuses, currentMetrics, currentTasks, currentDelegations] = await Promise.all([
            getRecentActivity(20).catch(() => [] as ActivityEvent[]),
            Promise.resolve(getAllAgentStatuses()),
            getDashboardMetrics().catch(() => metrics),
            getRecentTasks(10).catch(() => [] as AgentTask[]),
            getRecentDelegations(10).catch(() => [] as Delegation[]),
          ]);

          // Check for new activity
          const newEvents = newActivity.filter((a) => !lastActivityIds.has(a.id));
          if (newEvents.length > 0) {
            // Update our tracking set
            for (const a of newEvents) {
              lastActivityIds.add(a.id);
            }
            controller.enqueue(encoder.encode(formatSSE("activity", newEvents.reverse())));
          }

          // Check for new tasks
          const newTasks = currentTasks.filter((t) => !lastTaskIds.has(t.id));
          if (newTasks.length > 0) {
            for (const t of newTasks) {
              lastTaskIds.add(t.id);
            }
            controller.enqueue(encoder.encode(formatSSE("task", newTasks.reverse())));
          }

          // Check for new delegations
          const newDelegations = currentDelegations.filter((d) => !lastDelegationIds.has(d.id));
          if (newDelegations.length > 0) {
            for (const d of newDelegations) {
              lastDelegationIds.add(d.id);
            }
            controller.enqueue(encoder.encode(formatSSE("delegation", newDelegations.reverse())));
          }

          // Check for status changes
          const currentMerged = currentStatuses.map((s) => ({
            id: s.id,
            status: s.status,
            currentTask: s.currentTask,
            lastActivity: s.lastActivity,
          }));

          const prevMerged = mergedStatuses.map((s) => ({
            id: s.id,
            status: s.status,
            currentTask: s.currentTask,
            lastActivity: s.lastActivity,
          }));

          const hasChanges = JSON.stringify(currentMerged) !== JSON.stringify(prevMerged);
          if (hasChanges) {
            // Update the merged statuses
            for (let i = 0; i < mergedStatuses.length; i++) {
              mergedStatuses[i].status = currentStatuses[i]?.status || mergedStatuses[i].status;
              mergedStatuses[i].currentTask = currentStatuses[i]?.currentTask;
              mergedStatuses[i].lastActivity = currentStatuses[i]?.lastActivity;
            }
            controller.enqueue(encoder.encode(formatSSE("status", mergedStatuses)));
          }

          // Send metrics update periodically (every 3rd poll = ~9s)
          if (JSON.stringify(currentMetrics) !== JSON.stringify(metrics)) {
            controller.enqueue(encoder.encode(formatSSE("metrics", currentMetrics)));
          }
        } catch {
          // Silently ignore polling errors — keep the stream alive
        }
      }, POLL_INTERVAL_MS);

      // Cleanup on abort
      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
}
