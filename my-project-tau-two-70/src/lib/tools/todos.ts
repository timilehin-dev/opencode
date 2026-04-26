// ---------------------------------------------------------------------------
// Todo Tools
// ---------------------------------------------------------------------------
import { z, tool, zodSchema, safeJson,
  createTodo, listTodos, getTodo, updateTodo, deleteTodo, getTodoStats } from "./shared";

// Workspace Tools — Todos (task management)
// ---------------------------------------------------------------------------

export const todoCreateTool = tool({
  description: "Create a task/todo item. Use this when the user wants to track a task, create a to-do list item, or when an agent needs to log work for later. Supports categories, tags, due dates, priority, and agent assignment for autonomous execution.",
  inputSchema: zodSchema(z.object({
    title: z.string().describe("Task title — what needs to be done"),
    description: z.string().optional().describe("Detailed description of the task"),
    priority: z.enum(["low", "medium", "high", "critical"]).optional().describe("Priority level (default: 'medium')"),
    due_date: z.string().optional().describe("Due date (ISO date string, e.g., '2025-01-15')"),
    category: z.string().optional().describe("Category label (e.g., 'work', 'personal', 'project-x'). Default: 'general'"),
    tags: z.array(z.string()).optional().describe("Tags for categorization and filtering"),
    assigned_agent: z.string().optional().describe("Which agent owns this task (for autonomous coworker routing)"),
    context: z.record(z.string(), z.any()).optional().describe("Extra context for the agent (arbitrary JSON — notes, links, substeps)"),
  })),
  execute: safeJson(async ({ title, description, priority, due_date, category, tags, assigned_agent, context }) => {
    return await createTodo({ title, description, priority, due_date, category, tags, assigned_agent, context });
  }),
});

export const todoListTool = tool({
  description: "List tasks/todos with optional filters. Use this to show the user their task list, check what's open, find overdue tasks, or review work across agents. Returns tasks ordered by creation date (newest first).",
  inputSchema: zodSchema(z.object({
    status: z.enum(["open", "in_progress", "done", "archived"]).optional().describe("Filter by status"),
    priority: z.enum(["low", "medium", "high", "critical"]).optional().describe("Filter by priority"),
    category: z.string().optional().describe("Filter by category"),
    tag: z.string().optional().describe("Filter by a specific tag"),
    limit: z.number().optional().describe("Max results to return (default: 50)"),
  })),
  execute: safeJson(async ({ status, priority, category, tag, limit }) => {
    return await listTodos({ status, priority, category, tag, limit });
  }),
});

export const todoUpdateTool = tool({
  description: "Update a task/todo. Use this to change status (e.g., mark as in_progress or done), edit title/description, change priority, update due date, or modify tags. Automatically sets completed_at when status changes to 'done'.",
  inputSchema: zodSchema(z.object({
    id: z.number().describe("Task ID to update"),
    title: z.string().optional().describe("New title"),
    description: z.string().optional().describe("New description"),
    status: z.enum(["open", "in_progress", "done", "archived"]).optional().describe("New status"),
    priority: z.enum(["low", "medium", "high", "critical"]).optional().describe("New priority"),
    due_date: z.string().optional().describe("New due date (ISO date string)"),
    category: z.string().optional().describe("New category"),
    tags: z.array(z.string()).optional().describe("New tags (replaces existing tags)"),
  })),
  execute: safeJson(async ({ id, title, description, status, priority, due_date, category, tags }) => {
    const todo = await getTodo(id);
    if (!todo) throw new Error(`Todo ${id} not found`);
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (status !== undefined) updates.status = status;
    if (priority !== undefined) updates.priority = priority;
    if (due_date !== undefined) updates.due_date = due_date;
    if (category !== undefined) updates.category = category;
    if (tags !== undefined) updates.tags = tags;
    return await updateTodo(id, updates);
  }),
});

export const todoDeleteTool = tool({
  description: "Delete a task/todo permanently. Use this when the user no longer needs a tracked task.",
  inputSchema: zodSchema(z.object({
    id: z.number().describe("Task ID to delete"),
  })),
  execute: safeJson(async ({ id }) => {
    return await deleteTodo(id);
  }),
});

export const todoStatsTool = tool({
  description: "Get task statistics — counts by status, priority breakdown, and overdue count. Use this for dashboards, status reports, or when the user asks for a summary of their tasks.",
  inputSchema: zodSchema(z.object({})),
  execute: safeJson(async () => {
    return await getTodoStats();
  }),
});

// ---------------------------------------------------------------------------

