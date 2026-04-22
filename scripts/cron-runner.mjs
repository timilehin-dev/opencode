#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Claw Cron Runner — Standalone script for GitHub Actions
//
// Handles 3 cron jobs that were previously on Vercel Cron (Pro-only):
//   1. task-processor    (*/5 * * * *)  — Evaluate automations, queue tasks
//   2. agent-routines    (*/10 * * * *) — Execute due agent routines
//   3. process-reminders (0 9 * * *)    — Fire due reminders
//
// Usage:
//   node scripts/cron-runner.mjs --job task-processor
//   node scripts/cron-runner.mjs --job agent-routines [--max-routines 3]
//   node scripts/cron-runner.mjs --job process-reminders [--max-reminders 20]
//   node scripts/cron-runner.mjs --job all          (runs all 3 sequentially)
//
// Environment: SUPABASE_DB_URL + AI keys (for agent-routines only)
// ---------------------------------------------------------------------------

import pg from "pg";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, stepCountIs } from "ai";

const { Pool } = pg;

// ---------------------------------------------------------------------------
// Parse args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let jobType = "all";
let maxRoutines = 3;
let maxReminders = 20;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--job" && args[i + 1]) { jobType = args[i + 1]; i++; }
  if (args[i] === "--max-routines" && args[i + 1]) { maxRoutines = parseInt(args[i + 1], 10); i++; }
  if (args[i] === "--max-reminders" && args[i + 1]) { maxReminders = parseInt(args[i + 1], 10); i++; }
}

if (!process.env.SUPABASE_DB_URL) {
  console.error("ERROR: SUPABASE_DB_URL environment variable is required.");
  process.exit(1);
}

const validJobs = ["task-processor", "agent-routines", "process-reminders", "all"];
if (!validJobs.includes(jobType)) {
  console.error(`ERROR: Invalid job "${jobType}". Use: ${validJobs.join(", ")}`);
  process.exit(1);
}

console.log(`[CronRunner] ${new Date().toISOString()} | job=${jobType}`);

// ---------------------------------------------------------------------------
// DB Pool
// ---------------------------------------------------------------------------

const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL });

// ---------------------------------------------------------------------------
// Provider Setup (for agent-routines)
// ---------------------------------------------------------------------------

function getAIHubMixKeys() {
  return [
    process.env.AIHUBMIX_API_KEY_1,
    process.env.AIHUBMIX_API_KEY_2,
    process.env.AIHUBMIX_API_KEY_3,
    process.env.AIHUBMIX_API_KEY_4,
    process.env.AIHUBMIX_API_KEY_5,
  ].filter(Boolean);
}

function getOllamaKeys() {
  return [
    process.env.OLLAMA_CLOUD_KEY_1,
    process.env.OLLAMA_CLOUD_KEY_2,
    process.env.OLLAMA_CLOUD_KEY_3,
    process.env.OLLAMA_CLOUD_KEY_4,
    process.env.OLLAMA_CLOUD_KEY_5,
    process.env.OLLAMA_CLOUD_KEY_6,
  ].filter(Boolean);
}

let _aiKeyIdx = 0;
let _ollamaKeyIdx = 0;

function nextAIHubMixKey() {
  const keys = getAIHubMixKeys();
  if (keys.length === 0) throw new Error("No AIHUBMIX_API_KEY configured.");
  return keys[_aiKeyIdx++ % keys.length];
}

function nextOllamaKey() {
  const keys = getOllamaKeys();
  if (keys.length === 0) throw new Error("No OLLAMA_CLOUD_KEY configured.");
  return keys[_ollamaKeyIdx++ % keys.length];
}

const AGENT_MODELS = {
  general: { provider: "ollama", model: "gemma4:31b-cloud", name: "Claw General", role: "the main coordinator agent" },
  mail:    { provider: "ollama", model: "gemma4:31b-cloud", name: "Mail Agent", role: "the email specialist agent" },
  code:    { provider: "ollama", model: "gemma4:31b-cloud", name: "Code Agent", role: "the development agent" },
  data:    { provider: "ollama", model: "gemma4:31b-cloud", name: "Data Agent", role: "the data analysis agent" },
  creative:{ provider: "ollama", model: "gemma4:31b-cloud", name: "Creative Agent", role: "the creative content agent" },
  research:{ provider: "ollama", model: "gemma4:31b-cloud", name: "Research Agent", role: "the research agent" },
  ops:     { provider: "ollama", model: "gemma4:31b-cloud", name: "Ops Agent", role: "the operations agent" },
};

// ===========================================================================
// Push Notification System — Direct DB inserts (no Vercel dependency)
// ===========================================================================

async function sendNotification({ agentId, agentName, type, title, body, priority = "normal", actionUrl, actionLabel, metadata = {} }) {
  try {
    await pool.query(
      `INSERT INTO proactive_notifications (agent_id, agent_name, type, title, body, priority, action_url, action_label, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [agentId, agentName, type, title, body, priority, actionUrl || null, actionLabel || null, JSON.stringify(metadata)],
    );
    console.log(`[Notification] ${type}: ${title}`);
  } catch (err) {
    console.warn("[Notification] Failed:", err.message);
  }
}

async function sendA2ANotification({ toAgent, fromAgent = "system", type = "handoff", topic, content, priority = "normal" }) {
  try {
    await pool.query(
      `INSERT INTO a2a_messages (from_agent, to_agent, type, topic, payload, priority, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'delivered')`,
      [fromAgent, toAgent, type, topic, JSON.stringify({ content }), priority],
    );
    console.log(`[A2A] Message to ${toAgent}: ${topic}`);
  } catch (err) {
    console.warn("[A2A] Failed:", err.message);
  }
}

function getModel(agentId) {
  const def = AGENT_MODELS[agentId] || AGENT_MODELS.general;
  if (def.provider === "aihubmix") {
    return createOpenAI({
      apiKey: nextAIHubMixKey(),
      baseURL: process.env.AIHUBMIX_BASE_URL || "https://aihubmix.com/v1",
    }).chat(def.model);
  }
  return createOpenAI({
    apiKey: nextOllamaKey(),
    baseURL: process.env.OLLAMA_BASE_URL || "https://ollama.com/v1",
  }).chat(def.model);
}

// ===========================================================================
// JOB 1: Task Processor — Evaluate automations & queue tasks
// ===========================================================================

// --- Cron matcher (same logic as automation-engine.ts) ---

function cronShouldFire(expr) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return false;
  const now = new Date();
  const fields = [
    { value: now.getMinutes(), expr: parts[0] },
    { value: now.getHours(), expr: parts[1] },
    { value: now.getDate(), expr: parts[2] },
    { value: now.getMonth() + 1, expr: parts[3] },
    { value: now.getDay(), expr: parts[4] },
  ];
  return fields.every(({ value, expr: e }) => matchesField(value, e));
}

function matchesField(value, expr) {
  if (expr === "*") return true;
  return expr.split(",").some(part => matchesSingle(value, part.trim()));
}

function matchesSingle(value, expr) {
  let m = expr.match(/^\*\/(\d+)$/);
  if (m) return parseInt(m[1], 10) > 0 && value % parseInt(m[1], 10) === 0;
  m = expr.match(/^(\d+)-(\d+)\/(\d+)$/);
  if (m) {
    const min = parseInt(m[1], 10), max = parseInt(m[2], 10), step = parseInt(m[3], 10);
    return value >= min && value <= max && (value - min) % step === 0;
  }
  m = expr.match(/^(\d+)-(\d+)$/);
  if (m) return value >= parseInt(m[1], 10) && value <= parseInt(m[2], 10);
  const num = parseInt(expr, 10);
  return !isNaN(num) && value === num;
}

async function runTaskProcessor() {
  console.log("[TaskProcessor] Evaluating automations...");
  const result = { checked: 0, triggered: 0, tasksCreated: 0, errors: [] };

  try {
    const { rows: automations } = await pool.query(
      `SELECT id, name, description, trigger_type, trigger_config, action_type, action_config, agent_id, enabled, last_run_at, run_count
       FROM automations WHERE enabled = true`
    );

    result.checked = automations.length;

    for (const auto of automations) {
      try {
        const config = auto.trigger_config || {};
        let shouldFire = false;

        if (auto.trigger_type === "schedule") {
          const cronExpr = config.cron || config.schedule;
          if (cronExpr) {
            if (auto.last_run_at) {
              const diff = Date.now() - new Date(auto.last_run_at).getTime();
              if (diff < 55_000) continue; // skip within same minute
            }
            shouldFire = cronShouldFire(cronExpr);
          } else {
            const intervalMin = config.interval_minutes || 60;
            if (!auto.last_run_at) {
              shouldFire = true;
            } else {
              const elapsed = (Date.now() - new Date(auto.last_run_at).getTime()) / 60000;
              shouldFire = elapsed >= intervalMin;
            }
          }
        } else if (auto.trigger_type === "event") {
          const eventType = config.event || config.event_type || "";
          if (eventType) {
            const sinceDate = auto.last_run_at || new Date(Date.now() - 3600000).toISOString();
            const evResult = await pool.query(
              `SELECT COUNT(*) as count FROM agent_activity WHERE action = $1 AND created_at > $2 LIMIT 1`,
              [eventType, sinceDate]
            );
            const count = Number(evResult.rows[0]?.count || 0);
            if (count > 0) {
              const cooldown = config.cooldown_minutes || 5;
              if (auto.last_run_at) {
                const elapsed = (Date.now() - new Date(auto.last_run_at).getTime()) / 60000;
                shouldFire = elapsed >= cooldown;
              } else {
                shouldFire = true;
              }
            }
          }
        }

        if (!shouldFire) continue;

        // Triggered — create task
        const actionConfig = auto.action_config || {};
        const agentId = actionConfig.agent_id || auto.agent_id || "general";
        const taskDesc = actionConfig.task || auto.description || auto.name;
        const priority = actionConfig.priority || "medium";

        const insertResult = await pool.query(
          `INSERT INTO agent_tasks (agent_id, task, context, trigger_type, trigger_source, priority)
           VALUES ($1, $2, $3, 'automation', $4, $5) RETURNING id`,
          [agentId, taskDesc, `Triggered by automation: ${auto.name}`, `automation:${auto.id}`, priority]
        );

        const taskId = insertResult.rows[0]?.id;
        if (taskId) {
          result.triggered++;
          result.tasksCreated++;

          // Log to automation_logs
          await pool.query(
            `INSERT INTO automation_logs (automation_id, status, result, duration_ms) VALUES ($1, 'queued', $2, 0)`,
            [auto.id, JSON.stringify({ type: "automation_queued", task_id: taskId, agent_id: agentId })]
          );

          // Update last_run
          await pool.query(
            `UPDATE automations SET last_run_at = NOW(), last_status = 'queued', run_count = run_count + 1 WHERE id = $1`,
            [auto.id]
          );

          console.log(`[TaskProcessor] Triggered "${auto.name}" (#${auto.id}) -> task #${taskId} for ${agentId}`);
        }
      } catch (err) {
        result.errors.push(`Automation ${auto.id}: ${err.message}`);
      }
    }
  } catch (err) {
    result.errors.push(`Failed to fetch automations: ${err.message}`);
  }

  console.log(`[TaskProcessor] Done: checked=${result.checked}, triggered=${result.triggered}, created=${result.tasksCreated}, errors=${result.errors.length}`);
  return result;
}

// ===========================================================================
// JOB 2: Agent Routines — Execute due routines
// ===========================================================================

async function runAgentRoutines() {
  console.log(`[AgentRoutines] Checking for due routines (max=${maxRoutines})...`);
  const result = { checked: 0, executed: 0, failed: 0, details: [] };

  try {
    const { rows } = await pool.query(
      `SELECT * FROM agent_routines WHERE is_active = true AND next_run <= NOW()
       ORDER BY priority DESC, next_run ASC LIMIT $1`,
      [maxRoutines]
    );

    result.checked = rows.length;

    for (const row of rows) {
      const { id, agent_id, name, task, context, interval_minutes } = row;
      const agentDef = AGENT_MODELS[agent_id];
      const startTime = Date.now();

      try {
        if (!agentDef) {
          result.failed++;
          result.details.push({ agent_id, name, status: "failed", error: `Unknown agent: ${agent_id}` });
          continue;
        }

        const model = getModel(agent_id);
        const systemPrompt = `You are ${agentDef.name}, ${agentDef.role}. You are running a SCHEDULED ROUTINE — a background task that runs automatically. Execute the task fully and provide a concise summary. Be brief.`;

        const routineResult = await generateText({
          model,
          system: systemPrompt,
          messages: [{ role: "user", content: `${task}\n\n${context ? `Context: ${context}` : ""}` }],
          maxOutputTokens: 4096,
          stopWhen: stepCountIs(10),
          abortSignal: AbortSignal.timeout(120_000),
        });

        const text = routineResult.text || "(Routine completed with no output)";
        const nextRun = new Date(Date.now() + interval_minutes * 60 * 1000);

        await pool.query(
          `UPDATE agent_routines SET last_run = NOW(), next_run = $1, last_result = $2 WHERE id = $3`,
          [nextRun.toISOString(), text.slice(0, 2000), id]
        );

        result.executed++;
        result.details.push({ agent_id, name, status: "success", duration_ms: Date.now() - startTime });
        console.log(`[AgentRoutines] "${name}" for ${agent_id} completed in ${Date.now() - startTime}ms`);

        // Push notification: routine completed
        await sendNotification({
          agentId,
          agentName: agentDef.name,
          type: "routine_result",
          title: `Routine completed: ${name}`,
          body: text.slice(0, 500) + (text.length > 500 ? "..." : ""),
          priority: "low",
          metadata: { routineId: id, durationMs: Date.now() - startTime },
        });
      } catch (err) {
        result.failed++;
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        result.details.push({ agent_id, name, status: "failed", error: errMsg, duration_ms: Date.now() - startTime });

        // Update next_run even on failure to avoid retry storms
        const nextRun = new Date(Date.now() + 30 * 60 * 1000); // retry in 30 min
        await pool.query(
          `UPDATE agent_routines SET last_run = NOW(), next_run = $1, last_result = $2 WHERE id = $3`,
          [nextRun.toISOString(), `ERROR: ${errMsg.slice(0, 500)}`, id]
        );
        console.error(`[AgentRoutines] "${name}" failed: ${errMsg}`);

        // Push notification: routine failed
        await sendNotification({
          agentId,
          agentName: agentDef.name,
          type: "alert",
          title: `Routine failed: ${name}`,
          body: `Error: ${errMsg.slice(0, 300)}`,
          priority: "high",
          metadata: { routineId: id, error: errMsg.slice(0, 1000) },
        });
      }
    }
  } catch (err) {
    result.errors = err.message;
    console.error(`[AgentRoutines] Error: ${err.message}`);
  }

  console.log(`[AgentRoutines] Done: checked=${result.checked}, executed=${result.executed}, failed=${result.failed}`);
  return result;
}

// ===========================================================================
// JOB 3: Process Reminders — Fire due reminders
// ===========================================================================

async function runProcessReminders() {
  console.log(`[ProcessReminders] Checking for due reminders (max=${maxReminders})...`);
  const result = { processed: 0, reminders: [] };

  try {
    const { rows: dueReminders } = await pool.query(
      `SELECT * FROM reminders WHERE reminder_time <= NOW() AND status = 'pending'
       ORDER BY priority ASC, reminder_time ASC LIMIT $1`,
      [maxReminders]
    );

    if (dueReminders.length === 0) {
      console.log("[ProcessReminders] No due reminders");
      return result;
    }

    for (const reminder of dueReminders) {
      try {
        // Mark as fired
        const updateResult = await pool.query(
          `UPDATE reminders SET status = 'fired', fired_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
          [reminder.id]
        );

        const fired = updateResult.rows[0];
        result.processed++;
        result.reminders.push({
          id: fired.id,
          title: fired.title,
          priority: fired.priority,
          assigned_agent: fired.assigned_agent,
          reminder_time: fired.reminder_time,
          fired_at: fired.fired_at,
        });

        // Log to automation_logs (non-critical)
        try {
          await pool.query(
            `INSERT INTO automation_logs (automation_id, status, result, created_at) VALUES (0, 'success', $1, NOW())`,
            [JSON.stringify({
              type: "reminder_fired",
              reminder_id: reminder.id,
              title: reminder.title,
              priority: reminder.priority,
              assigned_agent: reminder.assigned_agent,
              fired_at: new Date().toISOString(),
            })]
          );
        } catch { /* non-critical */ }

        console.log(`[ProcessReminders] Fired: "${reminder.title}" (priority: ${reminder.priority}, agent: ${reminder.assigned_agent || "none"})`);

        // Push notification: reminder fired
        await sendNotification({
          agentId: reminder.assigned_agent || "general",
          agentName: AGENT_MODELS[reminder.assigned_agent]?.name || "System",
          type: "reminder",
          title: `Reminder: ${reminder.title}`,
          body: reminder.description || reminder.title,
          priority: reminder.priority === "high" || reminder.priority === "urgent" ? "high" : "normal",
          metadata: { reminderId: reminder.id, assignedAgent: reminder.assigned_agent },
        });
      } catch (err) {
        console.error(`[ProcessReminders] Error firing reminder ${reminder.id}: ${err.message}`);
      }
    }
  } catch (err) {
    console.error(`[ProcessReminders] Error: ${err.message}`);
  }

  console.log(`[ProcessReminders] Done: processed=${result.processed}`);
  return result;
}

// ===========================================================================
// Main
// ===========================================================================

async function main() {
  const allResults = {};

  try {
    if (jobType === "all" || jobType === "task-processor") {
      allResults.taskProcessor = await runTaskProcessor();
    }
    if (jobType === "all" || jobType === "agent-routines") {
      allResults.agentRoutines = await runAgentRoutines();
    }
    if (jobType === "all" || jobType === "process-reminders") {
      allResults.processReminders = await runProcessReminders();
    }
  } finally {
    await pool.end();
  }

  // Summary
  console.log("\n[CronRunner] === SUMMARY ===");
  console.log(JSON.stringify(allResults, null, 2));
  console.log("[CronRunner] Completed.\n");

  return allResults;
}

main().catch(err => {
  console.error("[CronRunner] Fatal:", err);
  process.exit(1);
});
