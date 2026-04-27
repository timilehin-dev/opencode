// ---------------------------------------------------------------------------
// Agent Routine & Cron Tools
// ---------------------------------------------------------------------------
import { z, tool, zodSchema, safeJson, query } from "./shared";

// Agent Routine Tools — Create, list, update, delete, toggle routines
// Routines are recurring tasks managed by the Vercel Cron (agent-routines endpoint)
// and show up on the Routines page in the dashboard.
// ---------------------------------------------------------------------------

export const routineCreateTool = tool({
  description: "Create a recurring routine for an agent. Routines run automatically on a schedule (e.g., every 30 minutes, every hour) via dedicated pg_cron jobs. Each routine gets its own cron schedule. Use this for monitoring tasks, periodic reports, health checks, inbox checks, etc.",
  inputSchema: zodSchema(z.object({
    agent_id: z.enum(["general", "mail", "code", "data", "creative", "research", "ops"]).describe("Which agent should execute this routine"),
    name: z.string().describe("Short descriptive name for the routine"),
    task: z.string().describe("What the agent should do each time the routine runs"),
    context: z.string().optional().describe("Additional context or instructions"),
    interval_minutes: z.number().optional().describe("How often to run in minutes (default: 60). E.g., 30 for every 30 min, 120 for every 2 hours, 1440 for daily"),
    priority: z.enum(["high", "medium", "low"]).optional().describe("Priority level (default: medium)"),
  })),
  execute: safeJson(async ({ agent_id, name, task, context, interval_minutes, priority }) => {
    const interval = interval_minutes || 60;
    const nextRun = new Date(Date.now() + interval * 60 * 1000);
    const result = await query(
      `INSERT INTO agent_routines (agent_id, name, task, context, interval_minutes, priority, is_active, next_run)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7)
       RETURNING id, agent_id, name, task, interval_minutes, priority, is_active, next_run, created_at`,
      [agent_id, name, task, context || "", interval, priority || "medium", nextRun.toISOString()]
    );
    if (result.rows.length > 0) {
      // Auto-register pg_cron job for this routine
      const { registerRoutineCron } = await import("@/lib/workflows/pg-cron-manager");
      const cronResult = await registerRoutineCron(result.rows[0].id, interval);
      return {
        success: true,
        routine: result.rows[0],
        cron: cronResult,
        message: `Routine "${name}" created for ${agent_id}. Runs every ${interval} min via pg_cron (${cronResult.schedule}).${cronResult.success ? "" : ` Cron warning: ${cronResult.error}`}`,
      };
    }
    return { success: false, error: "Failed to create routine" };
  }),
});

export const routineListTool = tool({
  description: "List all agent routines. Optionally filter by a specific agent. Shows name, schedule, status, and last run time.",
  inputSchema: zodSchema(z.object({
    agent_id: z.enum(["general", "mail", "code", "data", "creative", "research", "ops"]).optional().describe("Filter by specific agent"),
  })),
  execute: safeJson(async ({ agent_id }) => {
    let queryString = "SELECT * FROM agent_routines ORDER BY priority DESC, next_run ASC";
    const params: unknown[] = [];
    if (agent_id) {
      queryString = "SELECT * FROM agent_routines WHERE agent_id = $1 ORDER BY priority DESC, next_run ASC";
      params.push(agent_id);
    }
    const result = await query(queryString, params);
    return {
      success: true,
      count: result.rows.length,
      routines: result.rows.map((r: Record<string, unknown>) => ({
        id: r.id, agentId: r.agent_id, name: r.name, task: String(r.task || "").slice(0, 100),
        intervalMinutes: r.interval_minutes, priority: r.priority, isActive: r.is_active,
        lastRun: r.last_run, nextRun: r.next_run, createdAt: r.created_at,
      })),
    };
  }),
});

export const routineUpdateTool = tool({
  description: "Update an existing routine — change name, task, interval, priority, or active status. If interval or active status changes, the pg_cron job is automatically updated.",
  inputSchema: zodSchema(z.object({
    routine_id: z.number().describe("The routine ID to update"),
    name: z.string().optional(),
    task: z.string().optional(),
    context: z.string().optional(),
    interval_minutes: z.number().optional().describe("New interval in minutes"),
    priority: z.enum(["high", "medium", "low"]).optional(),
    is_active: z.boolean().optional().describe("Enable or disable the routine"),
  })),
  execute: safeJson(async ({ routine_id, name, task, context, interval_minutes, priority, is_active }) => {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (name) { setClauses.push(`name = $${idx++}`); values.push(name); }
    if (task) { setClauses.push(`task = $${idx++}`); values.push(task); }
    if (context !== undefined) { setClauses.push(`context = $${idx++}`); values.push(context); }
    if (interval_minutes) {
      setClauses.push(`interval_minutes = $${idx++}, next_run = NOW() + ($${idx++} * INTERVAL '1 minute')`);
      values.push(interval_minutes, interval_minutes);
    }
    if (priority) { setClauses.push(`priority = $${idx++}`); values.push(priority); }
    if (is_active !== undefined) { setClauses.push(`is_active = $${idx++}`); values.push(is_active); }

    if (setClauses.length === 0) return { success: false, error: "No fields to update" };

    values.push(routine_id);
    const queryString = `UPDATE agent_routines SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`;
    const result = await query(queryString, values);

    // Auto-sync pg_cron job if interval or active status changed
    if (interval_minutes || is_active !== undefined) {
      const { registerRoutineCron, unregisterCron } = await import("@/lib/workflows/pg-cron-manager");
      if (is_active === false) {
        await unregisterCron(`routine-${routine_id}`);
      } else {
        const routine = result.rows[0];
        if (routine) await registerRoutineCron(routine_id, Number(routine.interval_minutes));
      }
    }
    if (result.rows.length > 0) {
      return { success: true, routine: result.rows[0] };
    }
    return { success: false, error: "Routine not found" };
  }),
});

export const routineDeleteTool = tool({
  description: "Delete an agent routine permanently. Also removes the pg_cron job.",
  inputSchema: zodSchema(z.object({
    routine_id: z.number().describe("The routine ID to delete"),
  })),
  execute: safeJson(async ({ routine_id }) => {
    // Remove pg_cron job first
    const { unregisterCron } = await import("@/lib/workflows/pg-cron-manager");
    await unregisterCron(`routine-${routine_id}`);
    await query("DELETE FROM agent_routines WHERE id = $1", [routine_id]);
    return { success: true, deleted: true };
  }),
});

export const routineToggleTool = tool({
  description: "Quickly enable or disable a routine without deleting it. Enabling re-registers the pg_cron job; disabling removes it.",
  inputSchema: zodSchema(z.object({
    routine_id: z.number().describe("The routine ID"),
    is_active: z.boolean().describe("true to enable, false to disable/pause"),
  })),
  execute: safeJson(async ({ routine_id, is_active }) => {
    const result = await query(
      `UPDATE agent_routines SET is_active = $1, next_run = CASE WHEN $1 THEN NOW() + (interval_minutes * INTERVAL '1 minute') ELSE next_run END WHERE id = $2 RETURNING *`,
      [is_active, routine_id]
    );
    if (result.rows.length > 0) {
      // Sync pg_cron job
      const { registerRoutineCron, unregisterCron } = await import("@/lib/workflows/pg-cron-manager");
      if (is_active) {
        await registerRoutineCron(routine_id, Number(result.rows[0].interval_minutes));
      } else {
        await unregisterCron(`routine-${routine_id}`);
      }
      return { success: true, routine: result.rows[0], message: is_active ? "Routine enabled (pg_cron job registered)" : "Routine paused (pg_cron job removed)" };
    }
    return { success: false, error: "Routine not found" };
  }),
});

// ---------------------------------------------------------------------------
// Cron Sync Tool — Sync all routines to pg_cron
// ---------------------------------------------------------------------------

export const cronSyncTool = tool({
  description: "Master synchronization tool — syncs ALL pg_cron jobs (routines, task board tasks, workflows) with the database. Ensures every active scheduled item has a pg_cron job registered, and removes jobs for completed/inactive items. Use this after bulk changes or to fix scheduling issues.",
  inputSchema: zodSchema(z.object({})),
  execute: safeJson(async () => {
    const { syncAllCronJobs, listKlawCronJobs } = await import("@/lib/workflows/pg-cron-manager");
    const syncResult = await syncAllCronJobs();
    const jobs = await listKlawCronJobs();
    return {
      success: true,
      totalCronJobs: jobs.length,
      routines: syncResult.routines,
      tasks: syncResult.tasks,
      workflows: syncResult.workflows,
      cronJobs: jobs.map((j) => ({ name: j.jobname, schedule: j.schedule, active: j.active })),
      message: `Synced ${syncResult.routines.registered} routines, ${syncResult.tasks.registered} tasks, ${syncResult.workflows.registered} workflows. Total active pg_cron jobs: ${jobs.length}`,
    };
  }),
});

