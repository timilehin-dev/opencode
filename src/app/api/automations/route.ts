// ---------------------------------------------------------------------------
// Automations API — CRUD operations backed by Supabase
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60; // Vercel Hobby plan max

/* eslint-disable @typescript-eslint/no-require-imports */
const { Pool } = require("pg");
/* eslint-enable @typescript-eslint/no-require-imports */

function getPool() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) throw new Error("SUPABASE_DB_URL is not configured.");
  return new Pool({ connectionString, max: 5, idleTimeoutMillis: 10000 });
}

function ok(data: unknown) {
  return NextResponse.json({ success: true, data });
}

function err(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

// ---------------------------------------------------------------------------
// Ensure table exists
// ---------------------------------------------------------------------------

async function ensureTable(pool: ReturnType<typeof getPool>) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS automations (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      trigger_type TEXT NOT NULL DEFAULT 'manual' CHECK (trigger_type IN ('schedule', 'event', 'manual')),
      trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
      action_type TEXT NOT NULL DEFAULT 'agent_task' CHECK (action_type IN ('agent_task', 'notification')),
      action_config JSONB NOT NULL DEFAULT '{}'::jsonb,
      agent_id TEXT DEFAULT '',
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      last_run_at TIMESTAMPTZ,
      last_status TEXT CHECK (last_status IN ('success', 'error')),
      run_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS automation_logs (
      id BIGSERIAL PRIMARY KEY,
      automation_id BIGINT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'error')),
      result JSONB DEFAULT '{}'::jsonb,
      duration_ms INTEGER DEFAULT 0,
      error_message TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

// ---------------------------------------------------------------------------
// GET: List automations + recent logs
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const pool = getPool();
    await ensureTable(pool);

    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action") || "list";

    if (action === "logs") {
      const automationId = searchParams.get("automation_id");
      const limit = parseInt(searchParams.get("limit") || "50", 10);

      let query = `SELECT al.*, a.name as automation_name
                   FROM automation_logs al JOIN automations a ON al.automation_id = a.id`;
      const params: unknown[] = [];

      if (automationId) {
        query += ` WHERE al.automation_id = $1`;
        params.push(parseInt(automationId, 10));
      }
      query += ` ORDER BY al.created_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await pool.query(query, params);
      await pool.end();
      return ok(result.rows);
    }

    // Default: list all automations
    const result = await pool.query(
      `SELECT * FROM automations ORDER BY created_at DESC`,
    );

    // Get recent logs for each automation
    const logsResult = await pool.query(
      `SELECT DISTINCT ON (automation_id) id, automation_id, status, duration_ms, created_at
       FROM automation_logs ORDER BY automation_id, created_at DESC LIMIT 100`,
    );

    const logsMap = new Map<number, (typeof logsResult.rows)[0]>();
    for (const log of logsResult.rows) {
      logsMap.set(log.automation_id, log);
    }

    const automations = result.rows.map((row: Record<string, unknown>) => ({
      ...row,
      lastLog: logsMap.get(Number(row.id)) || null,
    }));

    await pool.end();
    return ok(automations);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return err(message);
  }
}

// ---------------------------------------------------------------------------
// POST: Create, update, delete, toggle
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const pool = getPool();
    await ensureTable(pool);

    const body = await req.json();
    const { action } = body as { action?: string };

    switch (action) {
      case "create": {
        const { name, description, trigger_type, trigger_config, action_type, action_config, agent_id, enabled } = body as {
          name: string;
          description?: string;
          trigger_type: string;
          trigger_config: Record<string, unknown>;
          action_type: string;
          action_config: Record<string, unknown>;
          agent_id?: string;
          enabled?: boolean;
        };

        if (!name || !trigger_type || !action_type) {
          return err("Missing required fields: name, trigger_type, action_type", 400);
        }

        const result = await pool.query(
          `INSERT INTO automations (name, description, trigger_type, trigger_config, action_type, action_config, agent_id, enabled)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            name,
            description || "",
            trigger_type,
            JSON.stringify(trigger_config || {}),
            action_type,
            JSON.stringify(action_config || {}),
            agent_id || "",
            enabled !== false,
          ],
        );

        await pool.end();
        return ok(result.rows[0]);
      }

      case "update": {
        const { id, ...fields } = body as { id: number; [key: string]: unknown };

        if (!id) return err("Missing id", 400);

        // Build dynamic UPDATE
        const allowed = ["name", "description", "trigger_type", "trigger_config", "action_type", "action_config", "agent_id", "enabled"];
        const sets: string[] = [];
        const values: unknown[] = [];
        let paramIdx = 1;

        for (const key of allowed) {
          if (fields[key] !== undefined) {
            sets.push(`${key} = $${paramIdx}`);
            if (typeof fields[key] === "object" && fields[key] !== null) {
              values.push(JSON.stringify(fields[key]));
            } else {
              values.push(fields[key]);
            }
            paramIdx++;
          }
        }

        if (sets.length === 0) return err("No fields to update", 400);

        sets.push(`updated_at = NOW()`);
        values.push(id);

        const result = await pool.query(
          `UPDATE automations SET ${sets.join(", ")} WHERE id = $${paramIdx} RETURNING *`,
          values,
        );

        await pool.end();
        return ok(result.rows[0]);
      }

      case "delete": {
        const { id } = body as { id: number };
        if (!id) return err("Missing id", 400);

        await pool.query(`DELETE FROM automation_logs WHERE automation_id = $1`, [id]);
        await pool.query(`DELETE FROM automations WHERE id = $1`, [id]);
        await pool.end();
        return ok({ deleted: true });
      }

      case "toggle": {
        const { id, enabled } = body as { id: number; enabled: boolean };
        if (!id) return err("Missing id", 400);

        const result = await pool.query(
          `UPDATE automations SET enabled = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
          [enabled, id],
        );

        await pool.end();
        return ok(result.rows[0]);
      }

      case "run": {
        // Manual trigger — execute the task inline (synchronously)
        const { id } = body as { id: number };
        if (!id) return err("Missing id", 400);

        const autoResult = await pool.query(`SELECT * FROM automations WHERE id = $1`, [id]);
        if (autoResult.rows.length === 0) return err("Automation not found", 404);

        const auto = autoResult.rows[0];
        const actionConfig = auto.action_config || {};
        const agentId = actionConfig.agent_id || auto.agent_id || "general";
        const taskDescription = actionConfig.task || auto.description || auto.name;

        const startTime = Date.now();

        // Log the run as "running"
        const logResult = await pool.query(
          `INSERT INTO automation_logs (automation_id, status, result, duration_ms) VALUES ($1, 'running', $2, 0) RETURNING id`,
          [id, JSON.stringify({ type: "manual_trigger", agent_id: agentId, task: taskDescription })],
        );
        const logId = logResult.rows[0]?.id;

        try {
          // Execute the task inline — import task processor logic
          const { getAgent, getProvider } = await import("@/lib/agents");
          const { allTools } = await import("@/lib/tools");
          const { generateText, stepCountIs } = await import("ai");

          const agent = getAgent(agentId);
          if (!agent) {
            throw new Error(`Unknown agent: ${agentId}`);
          }

          const providerResult = await getProvider(agent);

          // Build tool subset for this agent
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const agentTools: Record<string, any> = {};
          for (const toolId of agent.tools) {
            if (allTools[toolId]) agentTools[toolId] = allTools[toolId];
          }

          // Build system prompt
          const systemPrompt = `You are ${agent.name}, ${agent.role}. Execute this task autonomously. Complete the task fully and provide a concise summary of what you did and the results.\n\n${agent.systemPrompt}`;

          const result = await generateText({
            model: providerResult.model,
            system: systemPrompt,
            messages: [
              {
                role: "user",
                content: `${taskDescription}\n\nContext: Manually triggered automation "${auto.name}"`,
              },
            ],
            tools: agentTools,
            maxOutputTokens: 8192,
            stopWhen: stepCountIs(15),
            abortSignal: AbortSignal.timeout(55_000),
          });

          const durationMs = Date.now() - startTime;
          const toolCalls = result.steps
            .flatMap((step: { toolCalls?: unknown[] }) => step.toolCalls || [])
            .map((tc: unknown) => {
              const call = tc as { toolName: string; args: Record<string, unknown> };
              return { name: call.toolName, args: call.args };
            });

          const resultSummary = {
            type: "manual_trigger",
            task_id: null,
            agent_id: agentId,
            status: "completed",
            output: (result.text || "(No text output)").slice(0, 2000),
            toolCalls: toolCalls.map((tc: { name: string }) => tc.name),
            durationMs,
          };

          // Update log to success
          await pool.query(
            `UPDATE automation_logs SET status = 'success', result = $1, duration_ms = $2 WHERE id = $3`,
            [JSON.stringify(resultSummary), durationMs, logId],
          );
          await pool.query(
            `UPDATE automations SET last_run_at = NOW(), last_status = 'success', run_count = run_count + 1 WHERE id = $1`,
            [id],
          );

          await pool.end();
          return ok({
            triggered: true,
            agent_id: agentId,
            status: "completed",
            durationMs,
            output: resultSummary.output,
            toolCalls: resultSummary.toolCalls,
          });
        } catch (execError) {
          const durationMs = Date.now() - startTime;
          const errorMsg = execError instanceof Error ? execError.message : "Unknown execution error";

          // Update log to error
          await pool.query(
            `UPDATE automation_logs SET status = 'error', result = $1, duration_ms = $2, error_message = $3 WHERE id = $4`,
            [JSON.stringify({ type: "manual_trigger", agent_id: agentId, status: "error", error: errorMsg }), durationMs, errorMsg, logId],
          );
          await pool.query(
            `UPDATE automations SET last_run_at = NOW(), last_status = 'error', run_count = run_count + 1 WHERE id = $1`,
            [id],
          );

          await pool.end();
          return ok({
            triggered: true,
            agent_id: agentId,
            status: "error",
            durationMs,
            error: errorMsg,
          });
        }
      }

      default:
        return err(`Unknown action: ${action}`, 400);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return err(message);
  }
}
