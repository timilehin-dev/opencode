// ---------------------------------------------------------------------------
// Reminder Tools
// ---------------------------------------------------------------------------
import { z, tool, zodSchema, safeJson,
  createReminder, listReminders, getReminder, updateReminder, deleteReminder } from "./shared";

// Workspace Tools — Reminders (scheduled notifications)
// ---------------------------------------------------------------------------

export const reminderCreateTool = tool({
  description: "Create a reminder. Use this when the user wants to be reminded about something at a specific time, or when you need to schedule a future notification for an agent. Supports priority levels, recurring schedules, and agent assignment for autonomous execution.",
  inputSchema: zodSchema(z.object({
    title: z.string().describe("Reminder title — what to be reminded about"),
    description: z.string().optional().describe("Additional context or details for the reminder"),
    reminder_time: z.string().describe("When to fire the reminder (ISO 8601 datetime string, e.g., '2025-01-15T09:00:00Z')"),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional().describe("Priority level (default: 'normal')"),
    repeat_config: z.object({ type: z.enum(["daily", "weekly", "monthly"]).describe("Repeat interval type") }).optional().describe("Recurring reminder configuration"),
    assigned_agent: z.string().optional().describe("Which agent should handle this reminder (e.g., 'mail', 'code', 'ops') — for autonomous routing"),
    context: z.record(z.string(), z.any()).optional().describe("Extra context for the agent when the reminder fires (arbitrary JSON)"),
  })),
  execute: safeJson(async ({ title, description, reminder_time, priority, repeat_config, assigned_agent, context }) => {
    return await createReminder({ title, description, reminder_time, priority, repeat_config, assigned_agent, context });
  }),
});

export const reminderListTool = tool({
  description: "List reminders with optional filters. Use this to show upcoming reminders, check pending reminders, or review past reminders. Returns reminders ordered by time.",
  inputSchema: zodSchema(z.object({
    status: z.enum(["pending", "fired", "dismissed", "snoozed"]).optional().describe("Filter by status"),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional().describe("Filter by priority"),
    limit: z.number().optional().describe("Max results to return (default: 50)"),
  })),
  execute: safeJson(async ({ status, priority, limit }) => {
    return await listReminders({ status, priority, limit });
  }),
});

export const reminderUpdateTool = tool({
  description: "Update an existing reminder. Use this to change the time, title, description, priority, or status of a reminder. Can also reschedule recurring reminders.",
  inputSchema: zodSchema(z.object({
    id: z.number().describe("Reminder ID to update"),
    title: z.string().optional().describe("New title"),
    description: z.string().optional().describe("New description"),
    reminder_time: z.string().optional().describe("New reminder time (ISO 8601)"),
    status: z.enum(["pending", "fired", "dismissed", "snoozed"]).optional().describe("New status"),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional().describe("New priority"),
  })),
  execute: safeJson(async ({ id, title, description, reminder_time, status, priority }) => {
    const reminder = await getReminder(id);
    if (!reminder) throw new Error(`Reminder ${id} not found`);
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (reminder_time !== undefined) updates.reminder_time = reminder_time;
    if (status !== undefined) updates.status = status;
    if (priority !== undefined) updates.priority = priority;
    return await updateReminder(id, updates);
  }),
});

export const reminderDeleteTool = tool({
  description: "Delete a reminder permanently. Use this when the user no longer needs a scheduled reminder.",
  inputSchema: zodSchema(z.object({
    id: z.number().describe("Reminder ID to delete"),
  })),
  execute: safeJson(async ({ id }) => {
    return await deleteReminder(id);
  }),
});

export const reminderCompleteTool = tool({
  description: "Mark a reminder as completed. Can dismiss it or snooze it (push the reminder_time forward). Use this when the user acknowledges a reminder or wants to postpone it.",
  inputSchema: zodSchema(z.object({
    id: z.number().describe("Reminder ID to complete"),
    action: z.enum(["dismiss", "snooze"]).describe("Action: 'dismiss' marks it as dismissed, 'snooze' pushes the time forward"),
    snooze_minutes: z.number().optional().describe("If snoozing, how many minutes to push the reminder_time forward (default: 30)"),
  })),
  execute: safeJson(async ({ id, action, snooze_minutes }) => {
    const reminder = await getReminder(id);
    if (!reminder) throw new Error(`Reminder ${id} not found`);

    if (action === "dismiss") {
      return await updateReminder(id, { status: "dismissed" });
    }

    // Snooze: push reminder_time forward
    const minutes = snooze_minutes || 30;
    const current = new Date(reminder.reminder_time);
    const newTime = new Date(current.getTime() + minutes * 60 * 1000);
    return await updateReminder(id, {
      status: "pending",
      reminder_time: newTime.toISOString(),
    });
  }),
});

// ---------------------------------------------------------------------------

