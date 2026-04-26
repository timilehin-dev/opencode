// ---------------------------------------------------------------------------
// Project Management Tools
// ---------------------------------------------------------------------------
import { z, tool, zodSchema, safeJson, safeParseRes, query, nextOllamaKey, OLLAMA_BASE } from "./shared";

// ---------------------------------------------------------------------------
// All Tools Registry
// ---------------------------------------------------------------------------
// Project Management Tools (Phase 2)
// Enables agents to create projects, break them into tasks, and track progress
// ---------------------------------------------------------------------------

export const projectCreateTool = tool({
  description: "Create a new project for tracking a multi-step initiative. Projects can contain multiple tasks with dependencies. Use this when starting a complex initiative that requires multiple steps (e.g., building an app, conducting research, setting up infrastructure).",
  inputSchema: zodSchema(z.object({
    name: z.string().describe("Project name"),
    description: z.string().optional().describe("Project description"),
    priority: z.enum(["critical", "high", "medium", "low"]).optional().describe("Project priority"),
    deadline: z.string().optional().describe("ISO date string for project deadline"),
    tags: z.array(z.string()).optional().describe("Project tags"),
  })),
  execute: safeJson(async ({ name, description, priority, deadline, tags }) => {
    try {
      const result = await query(
        `INSERT INTO projects (name, description, priority, agent_id, tags, deadline)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, status, created_at`,
        [name, description || null, priority || "medium", "general", tags || [], deadline || null],
      );
      return { success: true, project: result.rows[0] };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to create project" };
    }
  }),
});

export const projectAddTaskTool = tool({
  description: "Add a task to an existing project. Tasks can have dependencies on other tasks (by task ID). Use sort_order to control execution order. The assigned_agent determines which agent will execute the task.",
  inputSchema: zodSchema(z.object({
    project_id: z.number().describe("Project ID"),
    title: z.string().describe("Task title"),
    description: z.string().optional().describe("Task description"),
    task_prompt: z.string().optional().describe("The exact prompt to send to the agent when executing this task"),
    assigned_agent: z.string().optional().describe("Agent ID to assign (general, mail, code, data, creative, research, ops)"),
    depends_on: z.array(z.number()).optional().describe("Array of task IDs that must complete before this task"),
    priority: z.enum(["critical", "high", "medium", "low"]).optional(),
    task_type: z.enum(["research", "code", "design", "testing", "deployment", "docs", "communication", "general"]).optional(),
    sort_order: z.number().optional(),
  })),
  execute: safeJson(async ({ project_id, title, description, task_prompt, assigned_agent, depends_on, priority, task_type, sort_order }) => {
    try {
      const agentId = assigned_agent || "general";
      const result = await query(
        `INSERT INTO project_tasks (project_id, title, description, task_prompt, assigned_agent, depends_on, priority, task_type, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, title, status`,
        [project_id, title, description || null, task_prompt || null, agentId, depends_on || [], priority || "medium", task_type || "general", sort_order || 0],
      );
      return { success: true, task: result.rows[0] };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to add task" };
    }
  }),
});

export const projectStatusTool = tool({
  description: "Get the status of a project including all tasks and their progress. Shows completed/failed/pending counts and which tasks are ready to execute next.",
  inputSchema: zodSchema(z.object({
    project_id: z.number().describe("Project ID"),
  })),
  execute: safeJson(async ({ project_id }) => {
    try {
      const projectResult = await query("SELECT * FROM projects WHERE id = $1", [project_id]);
      if (!projectResult.rows.length) return { success: false, error: "Project not found" };

      const tasksResult = await query(
        "SELECT id, title, status, priority, assigned_agent, depends_on, sort_order, error FROM project_tasks WHERE project_id = $1 ORDER BY sort_order, id",
        [project_id],
      );

      const nextTasks = await query("SELECT * FROM get_next_executable_tasks($1, 5)", [project_id]);

      return {
        success: true,
        project: projectResult.rows[0],
        total_tasks: tasksResult.rows.length,
        tasks: tasksResult.rows,
        next_executable_tasks: nextTasks.rows,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to get project status" };
    }
  }),
});

export const projectListTool = tool({
  description: "List all projects with their status and progress. Optionally filter by status.",
  inputSchema: zodSchema(z.object({
    status: z.string().optional().describe("Filter by status (planning, in_progress, completed, failed)"),
    limit: z.number().optional().describe("Max projects to return (default 10)"),
  })),
  execute: safeJson(async ({ status, limit }) => {
    try {
      let queryStr = "SELECT id, name, description, status, priority, total_tasks, completed_tasks, failed_tasks, pending_tasks, created_at, updated_at FROM projects WHERE 1=1";
      const params: unknown[] = [];

      if (status) {
        queryStr += " AND status = $1";
        params.push(status);
      }

      queryStr += " ORDER BY updated_at DESC LIMIT $" + (params.length + 1);
      params.push(limit || 10);

      const result = await query(queryStr, params);
      return { success: true, projects: result.rows, count: result.rows.length };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to list projects" };
    }
  }),
});

export const projectDecomposeTool = tool({
  description: "Decompose a project into executable tasks using AI. Takes a project goal and returns a structured task plan with dependencies, assigned agents, and task prompts. Use this when you need to break a complex goal into manageable steps. You can then add the tasks to a project using project_add_task.",
  inputSchema: zodSchema(z.object({
    goal: z.string().describe("The project goal or high-level objective to decompose"),
    context: z.string().optional().describe("Additional context, constraints, or requirements"),
    max_tasks: z.number().optional().describe("Maximum number of tasks (default: 8, max: 15)"),
    complexity: z.enum(["simple", "moderate", "complex"]).optional().describe("Project complexity level"),
  })),
  execute: safeJson(async ({ goal, context, max_tasks, complexity }) => {
    const apiKey = nextOllamaKey();
    const systemPrompt = `You are a project planning assistant. Given a project goal, decompose it into a structured task plan.

Rules:
- Output ONLY valid JSON — no markdown, no explanation, no code fences
- Each task must be specific and actionable
- Set dependencies between tasks (depends_on uses 1-based task IDs)
- Assign the best agent for each task
- Keep task prompts detailed enough for autonomous execution
- Max ${max_tasks || 8} tasks

Available agents:
- "general": Multi-service orchestration, project management
- "mail": Email, calendar, communications
- "code": GitHub, Vercel, development
- "data": Google Drive, Sheets, Docs, data analysis
- "research": Deep web research, synthesis
- "ops": Monitoring, health checks, deployment
- "creative": Content, design, documents

Output format (EXACT JSON):
{
  "tasks": [
    {
      "title": "Task title",
      "description": "What this task accomplishes",
      "task_type": "research|code|design|testing|deployment|docs|communication|general",
      "priority": "critical|high|medium|low",
      "assigned_agent": "agent_id",
      "depends_on": [],
      "task_prompt": "Detailed instruction for the executing agent",
      "sort_order": 0
    }
  ]
}`;

    const userPrompt = `Decompose this project goal into tasks:\n\nGoal: ${goal}\n${context ? `Context: ${context}` : ""}\nComplexity: ${complexity || "moderate"}\nMax tasks: ${Math.min(max_tasks || 8, 15)}`;

    try {
      const res = await fetch(`${OLLAMA_BASE}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gemma4:31b-cloud",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 4096,
        }),
        signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) throw new Error(`Ollama API error: ${res.status}`);
      const data = await safeParseRes<{ choices?: Array<{ message?: { content?: string } }> }>(res);
      const text = data.choices?.[0]?.message?.content || "";

      // Parse the JSON from the response
      let jsonStr = text.trim();
      // Remove code fences if present
      const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (fenceMatch) jsonStr = fenceMatch[1];

      const plan = JSON.parse(jsonStr);
      return JSON.stringify({ success: true, tasks: plan.tasks || [], total: (plan.tasks || []).length });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Decomposition failed";
      return JSON.stringify({ success: false, error: errMsg });
    }
  }),
});

// ---------------------------------------------------------------------------
// Phase 5: Full Autonomous Project Lifecycle Tools
// ---------------------------------------------------------------------------

export const projectUpdateTool = tool({
  description: "Update project metadata or status. Can change project name, description, priority, deadline, status (to 'in_progress', 'on_hold', 'cancelled'), or add notes. Does NOT affect individual tasks directly — use project_retry_task or project_skip_task for task-level changes.",
  inputSchema: zodSchema(z.object({
    project_id: z.number().describe("Project ID to update"),
    name: z.string().optional().describe("New project name"),
    description: z.string().optional().describe("New project description"),
    priority: z.enum(["critical", "high", "medium", "low"]).optional().describe("New priority level"),
    status: z.enum(["in_progress", "on_hold", "cancelled"]).optional().describe("New status (cannot set to 'completed' or 'failed' — those are auto-detected)"),
    deadline: z.string().optional().describe("New deadline (ISO 8601 datetime)"),
    tags: z.array(z.string()).optional().describe("Replace tags array"),
  })),
  execute: safeJson(async ({ project_id, name, description, priority, status, deadline, tags }) => {
    const setClauses = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) { setClauses.push(`name = $${idx++}`); values.push(name); }
    if (description !== undefined) { setClauses.push(`description = $${idx++}`); values.push(description); }
    if (priority !== undefined) { setClauses.push(`priority = $${idx++}`); values.push(priority); }
    if (status !== undefined) { setClauses.push(`status = $${idx++}`); values.push(status); }
    if (deadline !== undefined) { setClauses.push(`deadline = $${idx++}`); values.push(deadline); }
    if (tags !== undefined) { setClauses.push(`tags = $${idx++}`); values.push(tags); }

    if (setClauses.length === 0) return { success: false, error: "No fields to update" };

    values.push(project_id);
    try {
      const result = await query(
        `UPDATE projects SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING id, name, status, priority, total_tasks, completed_tasks, failed_tasks, pending_tasks, deadline`,
        values,
      );
      if (result.rows.length === 0) return { success: false, error: `Project ${project_id} not found` };
      return { success: true, project: result.rows[0] };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to update project" };
    }
  }),
});

export const projectDeleteTool = tool({
  description: "Soft-delete (archive) a project by setting its status to 'cancelled'. This stops all task execution for the project. Use this when a project is no longer needed or was created by mistake.",
  inputSchema: zodSchema(z.object({
    project_id: z.number().describe("Project ID to archive/cancel"),
    reason: z.string().optional().describe("Reason for cancellation (stored in metadata)"),
  })),
  execute: safeJson(async ({ project_id, reason }) => {
    try {
      const result = await query(
        `UPDATE projects SET status = 'cancelled', metadata = jsonb_set(COALESCE(metadata, '{}'), '{cancelled_reason}', $1) WHERE id = $2 RETURNING id, name, status`,
        [JSON.stringify(reason || "User cancelled"), project_id],
      );
      if (result.rows.length === 0) return { success: false, error: `Project ${project_id} not found` };
      // Also cancel pending/queued tasks
      await query(
        `UPDATE project_tasks SET status = 'cancelled' WHERE project_id = $1 AND status IN ('pending', 'queued', 'in_progress')`,
        [project_id],
      );
      return { success: true, project: result.rows[0], message: "Project cancelled and all pending tasks stopped" };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to delete project" };
    }
  }),
});

export const projectRetryTaskTool = tool({
  description: "Retry a failed project task. Resets the task to 'pending' status and clears error info. The executor will pick it up within 2 minutes. Use this when a task failed due to a transient error and you want to re-run it.",
  inputSchema: zodSchema(z.object({
    task_id: z.number().describe("Project task ID to retry"),
  })),
  execute: safeJson(async ({ task_id }) => {
    try {
      // Get current task info
      const current = await query(
        `SELECT pt.*, p.name as project_name FROM project_tasks pt JOIN projects p ON p.id = pt.project_id WHERE pt.id = $1`,
        [task_id],
      );
      if (current.rows.length === 0) return { success: false, error: `Task ${task_id} not found` };
      if (current.rows[0].status !== "failed") return { success: false, error: `Task ${task_id} is not failed (current: ${current.rows[0].status})` };

      // Reset task
      const result = await query(
        `UPDATE project_tasks SET status = 'pending', error = NULL, result = NULL, retries = retries + 1, started_at = NULL, completed_at = NULL WHERE id = $1 RETURNING id, title, status, retries`,
        [task_id],
      );

      // Log retry
      await query(
        `INSERT INTO project_task_logs (project_id, task_id, action, status, message, attempt_number) VALUES ($1, $2, 'retry', 'started', 'Manual retry requested', $3)`,
        [current.rows[0].project_id, task_id, current.rows[0].retries + 1],
      );

      return { success: true, task: result.rows[0], message: "Task reset to pending — executor will pick it up within 2 min" };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to retry task" };
    }
  }),
});

export const projectSkipTaskTool = tool({
  description: "Skip a blocked or failed project task. Sets status to 'skipped' which allows dependent tasks to proceed. Use this when a task is non-critical and blocking progress, or when manual intervention isn't worth it.",
  inputSchema: zodSchema(z.object({
    task_id: z.number().describe("Project task ID to skip"),
    reason: z.string().optional().describe("Reason for skipping"),
  })),
  execute: safeJson(async ({ task_id, reason }) => {
    try {
      const current = await query(
        `SELECT pt.*, p.name as project_name FROM project_tasks pt JOIN projects p ON p.id = pt.project_id WHERE pt.id = $1`,
        [task_id],
      );
      if (current.rows.length === 0) return { success: false, error: `Task ${task_id} not found` };
      if (!["pending", "queued", "in_progress", "blocked", "failed"].includes(current.rows[0].status)) {
        return { success: false, error: `Task ${task_id} cannot be skipped (current: ${current.rows[0].status})` };
      }

      const result = await query(
        `UPDATE project_tasks SET status = 'skipped', metadata = jsonb_set(COALESCE(metadata, '{}'), '{skip_reason}', $1) WHERE id = $2 RETURNING id, title, status`,
        [JSON.stringify(reason || "Skipped by user"), task_id],
      );

      // Log skip
      await query(
        `INSERT INTO project_task_logs (project_id, task_id, action, status, message) VALUES ($1, $2, 'skip', 'completed', $3)`,
        [current.rows[0].project_id, task_id, `Skipped: ${reason || "User request"}`],
      );

      return { success: true, task: result.rows[0], message: "Task skipped — dependent tasks can now proceed" };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to skip task" };
    }
  }),
});

export const projectDecomposeAndAddTool = tool({
  description: "ALL-IN-ONE project decomposition: Takes a project ID and a goal, decomposes it into structured tasks via AI, and automatically adds all tasks to the project. This is the recommended way to set up a new project — create the project first with project_create, then use this tool to fill it with tasks. The executor will automatically start executing tasks that have no dependencies.",
  inputSchema: zodSchema(z.object({
    project_id: z.number().optional().describe("Project ID to add tasks to"),
    project_name: z.string().optional().describe("Project name (alternative to project_id — looked up by name)"),
    goal: z.string().describe("Project goal to decompose into tasks"),
    context: z.string().optional().describe("Additional context, constraints, or requirements"),
    complexity: z.enum(["simple", "moderate", "complex"]).optional().describe("Complexity level (default: moderate)"),
    max_tasks: z.number().optional().describe("Max tasks to create (default 8, max 15)"),
  })),
  execute: safeJson(async ({ project_id, project_name, goal, context, complexity, max_tasks }) => {
    try {
      if (!project_id && !project_name) return { success: false, error: "Either project_id or project_name is required" };

      // Verify project exists — try ID first, then name fallback
      let proj;
      if (project_id) {
        proj = await query("SELECT id, name, status FROM projects WHERE id = $1", [project_id]);
      }
      if ((!proj || proj.rows.length === 0) && project_name) {
        proj = await query("SELECT id, name, status FROM projects WHERE name ILIKE $1", [project_name]);
      }
      if (!proj || proj.rows.length === 0)
        return { success: false, error: `Project not found (id=${project_id}, name=${project_name})` };

      const resolvedProjectId = proj.rows[0].id;

      // Get AI decomposition via Ollama Cloud (DeepSeek V4 Flash)
      const ollamaKey = nextOllamaKey();

      const systemPrompt = `You are a project planning expert. Decompose the given goal into a structured task plan.
Each task should be specific, actionable, and assigned to the right agent.
Available agents: general, mail, code, data, creative, research, ops
Task types: research, code, design, testing, deployment, docs, communication, general
Priorities: critical, high, medium, low
Output format (EXACT JSON): { "tasks": [{ "title", "description", "task_type", "priority": "critical|high|medium|low", "assigned_agent", "depends_on": [], "task_prompt", "sort_order" }] }`;

      const userPrompt = `Decompose this project goal into tasks:\n\nGoal: ${goal}\n${context ? `Context: ${context}` : ""}\nComplexity: ${complexity || "moderate"}\nMax tasks: ${Math.min(max_tasks || 8, 15)}`;

      const res = await fetch(`${OLLAMA_BASE}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${ollamaKey}` },
        body: JSON.stringify({
          model: "gemma4:31b-cloud",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 4096,
        }),
        signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) throw new Error(`Ollama API error: ${res.status}`);
      const data = await safeParseRes<{ choices?: Array<{ message?: { content?: string } }> }>(res);
      const text = data.choices?.[0]?.message?.content || "";

      let jsonStr = text.trim();
      const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (fenceMatch) jsonStr = fenceMatch[1];

      const plan = JSON.parse(jsonStr);
      const tasks = plan.tasks || [];

      if (tasks.length === 0) return { success: false, error: "AI returned no tasks" };

      // Validate and sanitize tasks before insert
      const VALID_PRIORITIES = new Set(['critical', 'high', 'medium', 'low']);
      const VALID_TYPES = new Set(['research', 'code', 'design', 'testing', 'deployment', 'docs', 'communication', 'general']);
      const VALID_AGENTS = new Set(['general', 'mail', 'code', 'data', 'creative', 'research', 'ops']);

      // Build batch insert
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const insertedTasks: any[] = [];
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let paramIdx = 1;

      for (let idx = 0; idx < tasks.length; idx++) {
        const task = tasks[idx];
        const safePriority = VALID_PRIORITIES.has(task.priority) ? task.priority : 'medium';
        const safeType = VALID_TYPES.has(task.task_type) ? task.task_type : 'general';
        const safeAgent = VALID_AGENTS.has(task.assigned_agent) ? task.assigned_agent : 'general';

        placeholders.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
        values.push(
          resolvedProjectId,
          task.title || 'Untitled Task',
          task.description || null,
          safeType,
          safePriority,
          safeAgent,
          task.task_prompt || null,
          task.sort_order || idx,
        );
      }

      if (values.length > 0) {
        const insertSql = `INSERT INTO project_tasks (project_id, title, description, task_type, priority, assigned_agent, task_prompt, sort_order) VALUES ${placeholders.join(', ')} RETURNING id, title, status`;
        const result = await query(insertSql, values);
        insertedTasks.push(...result.rows);
      }

      // Force recalculate project task counts
      await query("SELECT update_project_task_counts($1)", [resolvedProjectId]);

      return {
        success: true,
        project_id: resolvedProjectId,
        project_name: proj.rows[0].name,
        tasks_added: insertedTasks.length,
        tasks: insertedTasks,
        message: `${insertedTasks.length} tasks added to project "${proj.rows[0].name}". The executor will start picking up tasks with no dependencies within 2 minutes.`,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to decompose and add tasks" };
    }
  }),
});

export const projectHealthTool = tool({
  description: "Get a health report for all active projects. Shows project status, progress, and identifies stalled, overdue, or degraded projects. Use this to monitor your project portfolio and catch issues early.",
  inputSchema: zodSchema(z.object({
    include_completed: z.boolean().optional().describe("Also show completed projects (default: false)"),
  })),
  execute: safeJson(async ({ include_completed }) => {
    try {
      const result = await query("SELECT * FROM get_project_health_report()");
      const projects = result.rows;

      // If requested, also get completed projects
      let completed = [];
      if (include_completed) {
        const compResult = await query(
          `SELECT id as project_id, name as project_name, status, priority, total_tasks, completed_tasks, failed_tasks, pending_tasks,
           'healthy' as health_status, 'All tasks completed' as health_reason, completed_at as last_activity, deadline, false as is_overdue
           FROM projects WHERE status IN ('completed', 'failed') ORDER BY completed_at DESC LIMIT 10`,
        );
        completed = compResult.rows;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const summary = {
        total_active: projects.length,
        healthy: projects.filter((p: any) => p.health_status === "on_track" || p.health_status === "ready_to_start").length,
        stalled: projects.filter((p: any) => p.health_status === "stalled").length,
        overdue: projects.filter((p: any) => p.health_status === "overdue").length,
        degraded: projects.filter((p: any) => p.health_status === "degraded").length,
        needs_attention: projects.filter((p: any) => ["stalled", "overdue", "degraded", "failed"].includes(p.health_status)).length,
      };

      return { success: true, summary, projects, completed_projects: completed };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to get project health" };
    }
  }),
});

