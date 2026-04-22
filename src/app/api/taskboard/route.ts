// ---------------------------------------------------------------------------
// Task Board API — Shared Kanban board for inter-agent coordination
// POST /api/taskboard — create, update, get, summary, delete tasks
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import {
  createTask,
  updateTask,
  getTasks,
  getTaskBoardSummary,
  deleteTask,
  TASK_BOARD_SCHEMA,
} from "@/lib/taskboard";
import { getAllAgents } from "@/lib/agents";
import { query } from "@/lib/db";

function ok(data: unknown) {
  return NextResponse.json({ success: true, data });
}

function err(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

// ---------------------------------------------------------------------------
// POST: Actions
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body as { action?: string };

    switch (action) {
      // Create a new task
      case "create": {
        const { title, description, priority, assignedAgent, createdBy, context, parentTaskId, deadline, tags } = body as {
          title?: string;
          description?: string;
          priority?: "high" | "medium" | "low";
          assignedAgent?: string | null;
          createdBy?: string;
          context?: string;
          parentTaskId?: number | null;
          deadline?: string | null;
          tags?: string[];
        };

        if (!title || !createdBy) {
          return err("Missing title or createdBy", 400);
        }

        const validAgents = getAllAgents().map((a) => a.id);
        if (assignedAgent && !validAgents.includes(assignedAgent)) {
          return err(`Invalid assignedAgent: ${assignedAgent}`, 400);
        }

        const task = await createTask({
          title,
          description,
          priority,
          assignedAgent,
          createdBy,
          context,
          parentTaskId,
          deadline,
          tags,
        });

        if (!task) return err("Failed to create task — database unavailable", 503);
        return ok({ task });
      }

      // Update a task
      case "update": {
        const { taskId, ...updates } = body as {
          taskId?: number;
          title?: string;
          description?: string;
          status?: "backlog" | "in_progress" | "waiting" | "done";
          priority?: "high" | "medium" | "low";
          assignedAgent?: string | null;
          context?: string;
          deadline?: string | null;
          tags?: string[];
        };

        if (!taskId) return err("Missing taskId", 400);

        const validStatuses = ["backlog", "in_progress", "waiting", "done"];
        if (updates.status && !validStatuses.includes(updates.status)) {
          return err(`Invalid status: ${updates.status}. Must be one of: ${validStatuses.join(", ")}`, 400);
        }

        const validAgents = getAllAgents().map((a) => a.id);
        if (updates.assignedAgent && !validAgents.includes(updates.assignedAgent)) {
          return err(`Invalid assignedAgent: ${updates.assignedAgent}`, 400);
        }

        const updated = await updateTask(taskId, updates);
        if (!updated) return err("Task not found or database unavailable", 404);
        return ok({ task: updated });
      }

      // Get tasks with optional filters
      case "list": {
        const { status, assignedAgent, createdBy, priority, limit } = body as {
          status?: string;
          assignedAgent?: string;
          createdBy?: string;
          priority?: string;
          limit?: number;
        };

        const tasks = await getTasks({
          status: status as "backlog" | "in_progress" | "waiting" | "done" | undefined,
          assignedAgent,
          createdBy,
          priority: priority as "high" | "medium" | "low" | undefined,
          limit,
        });

        return ok({ tasks, count: tasks.length });
      }

      // Get task board summary
      case "summary": {
        const summary = await getTaskBoardSummary();
        return ok(summary);
      }

      // Delete a task
      case "delete": {
        const { taskId } = body as { taskId?: number };
        if (!taskId) return err("Missing taskId", 400);

        const deleted = await deleteTask(taskId);
        if (!deleted) return err("Task not found or database unavailable", 404);
        return ok({ deleted: true });
      }

      // Setup: create the task_board table
      case "setup": {
        await query(TASK_BOARD_SCHEMA);
        return ok({ created: true, message: "task_board table created" });
      }

      default:
        return err(`Unknown action: ${action}. Use create, update, list, summary, delete, or setup.`, 400);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return err(message);
  }
}
