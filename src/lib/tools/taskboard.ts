// ---------------------------------------------------------------------------
// Task Board (Kanban) Tools
// ---------------------------------------------------------------------------
import { z, tool, zodSchema, safeJson, query } from "./shared";

// Task Board Tools — Kanban board for inter-agent coordination
// Agents can create, update, list, and delete tasks on the shared board.
// ---------------------------------------------------------------------------

export const taskboardCreateTool = tool({
  description: "Create a new task on the shared task board (Kanban). Use this to track work items, assign tasks to yourself or other agents, and coordinate work across the team. Tasks start in 'backlog' column. Set schedule_interval_minutes to make the task RECURRING — it will get its own pg_cron job that executes it automatically on the schedule.",
  inputSchema: zodSchema(z.object({
    title: z.string().describe("Task title — clear and actionable"),
    description: z.string().optional().describe("Detailed task description"),
    priority: z.enum(["high", "medium", "low"]).optional().describe("Task priority (default: medium)"),
    assigned_agent: z.enum(["general", "mail", "code", "data", "creative", "research", "ops"]).optional().describe("Agent to assign this task to"),
    context: z.string().optional().describe("Additional context for the assigned agent"),
    deadline: z.string().optional().describe("Deadline (ISO 8601 datetime)"),
    schedule_interval_minutes: z.number().optional().describe("Make this a RECURRING task. How often to auto-execute in minutes (e.g., 30, 60, 120, 1440 for daily). Registers a pg_cron job."),
    tags: z.array(z.string()).optional().describe("Tags for categorization"),
  })),
  execute: safeJson(async ({ title, description, priority, assigned_agent, context, deadline, schedule_interval_minutes, tags }) => {
    try {
      const { createTask } = await import("@/lib/taskboard");
      const task = await createTask({
        title,
        description,
        priority,
        assignedAgent: assigned_agent || null,
        createdBy: "general",
        context,
        deadline,
        tags,
      });
      if (!task) return { success: false, error: "Failed to create task — database error" };

      // If schedule_interval is set, register a pg_cron job
      let cronResult = null;
      if (schedule_interval_minutes && schedule_interval_minutes > 0) {
        // Update the DB with the schedule interval
        const { query } = await import("@/lib/db");
        await query("UPDATE task_board SET schedule_interval = $1 WHERE id = $2", [schedule_interval_minutes, task.id]);
        // Register the pg_cron job
        const { registerTaskCron } = await import("@/lib/pg-cron-manager");
        cronResult = await registerTaskCron(Number(task.id), schedule_interval_minutes);
      }

      return {
        success: true,
        task: { id: task.id, title: task.title, status: task.status, priority: task.priority, assignedAgent: task.assignedAgent, scheduleInterval: schedule_interval_minutes || null },
        cron: cronResult,
        message: schedule_interval_minutes
          ? `Task "${title}" created with pg_cron schedule (${cronResult?.schedule || "failed"}).${cronResult?.success ? "" : ` Cron warning: ${cronResult?.error}`}`
          : `Task "${title}" created successfully.`,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to create task" };
    }
  }),
});

export const taskboardUpdateTool = tool({
  description: "Update a task on the shared task board. Can change title, description, status (backlog/in_progress/waiting/done), priority, assignment, context, deadline, schedule, or tags. Changing schedule_interval_minutes will auto-update the pg_cron job. Setting it to 0 or null removes the cron job.",
  inputSchema: zodSchema(z.object({
    task_id: z.number().describe("Task ID to update"),
    title: z.string().optional().describe("New title"),
    description: z.string().optional().describe("New description"),
    status: z.enum(["backlog", "in_progress", "waiting", "done"]).optional().describe("New status (moves task between Kanban columns)"),
    priority: z.enum(["high", "medium", "low"]).optional().describe("New priority"),
    assigned_agent: z.enum(["general", "mail", "code", "data", "creative", "research", "ops"]).optional().describe("Reassign to a different agent"),
    context: z.string().optional().describe("Update context"),
    deadline: z.string().optional().describe("Update deadline (ISO 8601)"),
    schedule_interval_minutes: z.number().nullable().optional().describe("Update recurring schedule in minutes (e.g., 60, 1440). Set to 0 or null to remove the pg_cron job."),
    tags: z.array(z.string()).optional().describe("Update tags"),
  })),
  execute: safeJson(async ({ task_id, title, description, status, priority, assigned_agent, context, deadline, schedule_interval_minutes, tags }) => {
    try {
      const { updateTask } = await import("@/lib/taskboard");
      const updates: Record<string, unknown> = {};
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (status !== undefined) updates.status = status;
      if (priority !== undefined) updates.priority = priority;
      if (assigned_agent !== undefined) updates.assignedAgent = assigned_agent;
      if (context !== undefined) updates.context = context;
      if (deadline !== undefined) updates.deadline = deadline;
      if (tags !== undefined) updates.tags = tags;

      const task = await updateTask(task_id, updates);
      if (!task) return { success: false, error: `Task ${task_id} not found or update failed` };

      // Handle schedule_interval changes — sync pg_cron job
      let cronResult = null;
      if (schedule_interval_minutes !== undefined) {
        const { query } = await import("@/lib/db");
        const { registerTaskCron, unregisterCron } = await import("@/lib/pg-cron-manager");
        const interval = schedule_interval_minutes === null ? 0 : schedule_interval_minutes;

        await query("UPDATE task_board SET schedule_interval = $1 WHERE id = $2", [
          interval === 0 ? null : interval, task_id,
        ]);

        if (interval > 0) {
          cronResult = await registerTaskCron(task_id, interval);
        } else {
          await unregisterCron(`taskboard-${task_id}`);
          cronResult = { success: true, jobName: `taskboard-${task_id}`, message: "pg_cron job removed" };
        }
      }

      // If status changed to 'done', also clean up the cron job
      if (status === "done") {
        const { unregisterCron } = await import("@/lib/pg-cron-manager");
        await unregisterCron(`taskboard-${task_id}`);
      }

      return {
        success: true,
        task: { id: task.id, title: task.title, status: task.status, priority: task.priority, assignedAgent: task.assignedAgent },
        cron: cronResult,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to update task" };
    }
  }),
});

export const taskboardListTool = tool({
  description: "List tasks from the shared task board. Filter by status (backlog/in_progress/waiting/done), assigned agent, or priority. Returns tasks sorted by priority then creation date. Use this to check what work is pending or in progress.",
  inputSchema: zodSchema(z.object({
    status: z.enum(["backlog", "in_progress", "waiting", "done"]).optional().describe("Filter by status column"),
    assigned_agent: z.enum(["general", "mail", "code", "data", "creative", "research", "ops"]).optional().describe("Filter by assigned agent"),
    priority: z.enum(["high", "medium", "low"]).optional().describe("Filter by priority"),
    limit: z.number().optional().describe("Max tasks to return (default: 50)"),
  })),
  execute: safeJson(async ({ status, assigned_agent, priority, limit }) => {
    try {
      const { getTasks } = await import("@/lib/taskboard");
      const tasks = await getTasks({ status, assignedAgent: assigned_agent, priority, limit: limit || 50 });
      return {
        success: true,
        count: tasks.length,
        tasks: tasks.map(t => ({
          id: t.id, title: t.title, status: t.status, priority: t.priority,
          assignedAgent: t.assignedAgent, createdBy: t.createdBy,
          description: t.description, context: t.context,
          deadline: t.deadline, scheduleInterval: t.scheduleInterval, tags: t.tags,
          createdAt: t.createdAt,
        })),
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to list tasks" };
    }
  }),
});

export const taskboardDeleteTool = tool({
  description: "Delete a task from the shared task board. Permanently removes the task and its pg_cron job (if scheduled). Prefer updating status to 'done' instead of deleting completed tasks.",
  inputSchema: zodSchema(z.object({
    task_id: z.number().describe("Task ID to delete"),
  })),
  execute: safeJson(async ({ task_id }) => {
    try {
      // Remove pg_cron job first
      const { unregisterCron } = await import("@/lib/pg-cron-manager");
      await unregisterCron(`taskboard-${task_id}`);
      const { deleteTask } = await import("@/lib/taskboard");
      const ok = await deleteTask(task_id);
      if (!ok) return { success: false, error: `Task ${task_id} not found or delete failed` };
      return { success: true, message: `Task ${task_id} deleted (pg_cron job removed)` };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to delete task" };
    }
  }),
});

export const taskboardSummaryTool = tool({
  description: "Get a summary of the shared task board — counts per status column (backlog, in_progress, waiting, done), total tasks, and high-priority count. Use for a quick health check of the board.",
  inputSchema: zodSchema(z.object({})),
  execute: safeJson(async () => {
    try {
      const { getTaskBoardSummary } = await import("@/lib/taskboard");
      const summary = await getTaskBoardSummary();
      return { success: true, ...summary };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to get summary" };
    }
  }),
});

// ---------------------------------------------------------------------------

