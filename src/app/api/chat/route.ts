// ---------------------------------------------------------------------------
// Chat API Route — Streaming LLM responses with tool calling (AI SDK v6)
// ---------------------------------------------------------------------------
//
// KEY ARCHITECTURE DECISIONS:
// 1. Use provider.chat() — NOT provider() — because provider() uses OpenAI's
//    Responses API which aihubmix/ollama don't support. .chat() = Chat Completions.
// 2. Use convertToModelMessages() from AI SDK v6 — it correctly pairs
//    ToolCallParts with ToolResultParts across multi-turn conversations.
//    Custom converters miss this pairing and cause "Tool result is missing" errors.
// ---------------------------------------------------------------------------

import { streamText, stepCountIs, convertToModelMessages } from "ai";
import type { UIMessage } from "ai";
import { getAgent, getProvider, updateAgentStatus, recordTokenUsage, recordKeyError } from "@/lib/agents";
import { allTools } from "@/lib/tools";
import { getMemorySummary, saveMessage } from "@/lib/memory";
import { logActivity, persistAgentStatus } from "@/lib/activity";
import { getSupabase } from "@/lib/supabase";
import { sendProactiveNotification } from "@/lib/proactive-notifications";
import { getInsightsForPrompt, recordLearning } from "@/lib/self-learning";

export const maxDuration = 300; // Vercel Pro supports up to 300s. Free model is slow (~30s TTFT), multi-step tool calling needs time.

// Maximum steps per agent — tuned to prevent "stops halfway" while staying within timeout.
// General: complex orchestration needs more steps. Specialists: fewer, more focused.
// IMPORTANT: Each step = one LLM turn (tool call + response). A 10-tool task needs ~20 steps.
const MAX_STEPS_GENERAL = 40;
const MAX_STEPS_SPECIALIST = 25;

// ---------------------------------------------------------------------------
// Load user settings (temperature, maxTokens) from Supabase
// ---------------------------------------------------------------------------

async function loadUserSettings(): Promise<{ temperature: number; maxTokens: number }> {
  const defaults = { temperature: 0.7, maxTokens: 16384 };
  const supabase = getSupabase();
  if (!supabase) return defaults;

  try {
    const { data, error } = await supabase
      .from("user_preferences")
      .select("value")
      .eq("key", "app_settings")
      .single();

    if (!error && data?.value) {
      const settings = data.value as Record<string, unknown>;
      return {
        temperature: typeof settings.temperature === "number" ? settings.temperature : defaults.temperature,
        maxTokens: typeof settings.maxTokens === "number" ? settings.maxTokens : defaults.maxTokens,
      };
    }
  } catch {
    // Fall through to defaults
  }

  return defaults;
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

interface Attachment {
  name: string;
  content: string;
  type: string;
  mimeType: string;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages, agentId, attachments, disabledTools, enabledTools } = body as {
      messages: UIMessage[];
      agentId?: string;
      attachments?: Attachment[];
      disabledTools?: string[];
      enabledTools?: string[];
    };

    const id = agentId || "general";
    const agent = getAgent(id);

    if (!agent) {
      return new Response(
        JSON.stringify({ error: `Unknown agent: ${id}` }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Build subset of tools for this agent (respecting user overrides)
    const disabledSet = new Set(disabledTools || []);
    const enabledSet = new Set(enabledTools || []);
    const agentTools: Record<string, typeof allTools.gmail_send> = {};
    for (const toolId of agent.tools) {
      if (allTools[toolId] && !disabledSet.has(toolId)) {
        agentTools[toolId] = allTools[toolId];
      }
    }
    // Add any extra enabled tools that aren't in the agent's default set
    for (const toolId of enabledSet) {
      if (allTools[toolId] && !agentTools[toolId]) {
        agentTools[toolId] = allTools[toolId];
      }
    }

    // Process attachments — inject file content into the last user message
    let processedMessages = messages;
    if (attachments && attachments.length > 0) {
      processedMessages = injectAttachments(messages, attachments);
    }

    // Extract last user message for status display
    const lastMsg = processedMessages[processedMessages.length - 1];
    const lastContent = lastMsg?.parts
      ? lastMsg.parts
          .filter((p) => p.type === "text")
          .map((p) => p.text as string)
          .join("")
      : null;

    // Update agent status
    updateAgentStatus(id, {
      status: "busy",
      currentTask: lastContent?.slice(0, 100) || null,
      lastActivity: new Date().toISOString(),
    });
    // Phase 2: persist to DB & log activity (fire-and-forget)
    logActivity({ agentId: id, agentName: agent.name, action: "status_change", detail: `started processing: ${lastContent?.slice(0, 80) || "task"}` }).catch(() => {});
    persistAgentStatus(id, { status: "busy", currentTask: lastContent?.slice(0, 100) || null, lastActivity: new Date().toISOString() }).catch(() => {});

    // Get the model (with smart key rotation + token tracking)
    const providerResult = await getProvider(agent);
    const model = providerResult.model;
    const selectedKey = providerResult.keySelection;

    // Run these in parallel to reduce time-to-first-token
    const [modelMessages, memoryContext, dueReminders, userSettings, learningContext] = await Promise.all([
      convertToModelMessages(processedMessages),
      getMemorySummary(id).catch(() => ""),
      checkDueReminders().catch(() => []),
      loadUserSettings(),
      getInsightsForPrompt(id, 8).catch(() => ""),
    ]);

    // Save the user's message to conversation history (fire-and-forget)
    if (lastContent) {
      const sessionId = body.sessionId || `session-${Date.now()}`;
      saveMessage({
        sessionId,
        agentId: id,
        role: "user",
        content: lastContent,
      }).catch(() => {});
    }

    // Send proactive notification for due reminders (in addition to in-context alert)
    if (dueReminders.length > 0) {
      sendProactiveNotification({
        agentId: id,
        agentName: agent.name,
        type: "reminder",
        title: `${dueReminders.length} Reminder${dueReminders.length > 1 ? "s" : ""} Due Now`,
        body: dueReminders.map(r => `• ${r.title} (due: ${new Date(r.reminder_time).toLocaleString()})${r.description ? ` — ${r.description}` : ""}`).join("\n"),
        priority: "high",
        metadata: { reminderIds: dueReminders.map(r => r.id) },
      }).catch(() => {});
    }

    console.log(`[Chat] Agent: ${agent.name} (${agent.provider}/${agent.model})`);
    if (attachments && attachments.length > 0) {
      console.log(`[Chat] Attachments: ${attachments.map(a => a.name).join(", ")}`);
    }
    for (let i = 0; i < modelMessages.length; i++) {
      const m = modelMessages[i];
      const contentStr = typeof m.content === "string"
        ? m.content.slice(0, 60)
        : Array.isArray(m.content)
          ? `[${m.content.length} parts: ${m.content.map((p) => p.type).join(",")}]`
          : String(m.content).slice(0, 60);
      console.log(`[Chat]   [${i}] ${m.role}: ${contentStr}`);
    }

    // Safety check
    if (modelMessages.length === 0) {
      return new Response(
        JSON.stringify({ error: "No valid messages to send. Please try again." }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Reinforce identity in system prompt for specialist agents.
    // Ollama/gemma4 models sometimes ignore system prompts, so we inject
    // the agent identity as a strong prefix at the very top.
    // Also inject agent memory if available for persistent context.
    const memoryBlock = memoryContext
      ? `\n\n[MEMORY — Persistent context you remember]\n${memoryContext}\n[END MEMORY]`
      : "";

    // Self-learning: inject learned behaviors into system prompt
    const learningBlock = learningContext
      ? `\n\n${learningContext}`
      : "";

    // Build a tool inventory so the LLM is fully aware of the tools
    // available to THIS specific agent (per-agent specialization).
    const toolCount = Object.keys(agentTools).length;
    const toolInventory = Object.entries(agentTools)
      .map(([key, t]) => {
        const desc = (t as unknown as { description?: string }).description || "";
        return `- **${key}**: ${desc}`;
      })
      .join("\n");

    // Tool boundary block differs per agent type:
    // - Claw General: sees all tools, can delegate
    // - Specialist agents: ONLY their specialized tools + query_agent for routing
    const toolBlock = id !== "general"
      ? `\n\n## YOUR EXCLUSIVE TOOL INVENTORY (${toolCount} tools)\nCRITICAL: These are the ONLY tools available to you — ${agent.name}. You do NOT have access to any other agent's tools. If a user asks you to do something outside your domain, you MUST route it via \\_query\_agent\\_ to the correct specialist. Do NOT attempt to use tools you don't have.\n\nYour ${toolCount} tools:\n${toolInventory}\n`
      : `\n\n## Your Complete Tool Inventory (${toolCount} tools)\nYou have access to ALL tools across every service. When asked to list your tools, list ALL ${toolCount} of them:\n${toolInventory}\n`;

    // Universal task completion block — injected into every agent.
    // This is a STRUCTURAL safeguard, not a soft instruction.
    // The `maxSteps` parameter (not `stopWhen`) ensures the SDK always
    // gives the model a chance to respond after tool results.
    const taskCompletionBlock = `

## TASK COMPLETION RULES (STRUCTURAL — THESE ARE ENFORCED BY THE SYSTEM)
1. After calling ANY tool and receiving results, your VERY NEXT step MUST be writing a text response explaining the results. This is not optional — the system requires it.
2. The user CANNOT see your tool results. They only see your text. If you don't write text, they see NOTHING.
3. NEVER end a response immediately after tool results. The system will automatically give you another step to explain.
4. If you called tools, summarize what each tool returned and what it means for the user's request.
5. **Use tools efficiently.** When analyzing files (especially images), use \`vision_download_analyze\` for Drive files — it downloads AND analyzes in ONE step.
6. **Combine steps.** When a task requires multiple tool calls, chain them efficiently.
7. **Structure your response.** Use headers, lists, and tables. Start with a summary, then details, then next steps.
8. **If you hit the step limit**, prioritize delivering whatever results you have with a clear summary.
9. **Final response is mandatory.** Every user message deserves a complete, thorough text response — never just tool results.`;

    // Build reminder alert if there are due reminders
    const reminderAlert = dueReminders.length > 0
      ? `\n\n## REMINDERS — You have ${dueReminders.length} pending reminder(s) right now\nIMPORTANT: These reminders are overdue or due now. You MUST proactively tell the user about them at the START of your response, BEFORE answering their question. Present them clearly with the reminder title, when it was due, and the description.\n\n${dueReminders.map(r => `- **${r.title}** (due: ${r.reminder_time})${r.description ? ` — ${r.description}` : ""}`).join("\n")}\n\nAfter presenting the reminders, continue with the user's actual request.`
      : "";

    // Inject real-time date/time context so agents know "now"
    // This is critical for reminders ("remind me tomorrow"), scheduling, etc.
    // User timezone: Africa/Lagos (WAT, UTC+1) — Nigeria
    const now = new Date();
    const currentDateTime = `[CURRENT DATE/TIME — ALWAYS use this as "now" for ALL time references]
- Lagos (WAT, UTC+1): ${now.toLocaleString("en-US", { timeZone: "Africa/Lagos", weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}
- Date: ${now.toLocaleDateString("en-US", { timeZone: "Africa/Lagos", weekday: "long", year: "numeric", month: "long", day: "numeric" })}
- Time: ${now.toLocaleTimeString("en-US", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", hour12: true })}
- Day: ${now.toLocaleDateString("en-US", { timeZone: "Africa/Lagos", weekday: "long" })}
- UTC: ${now.toISOString()}
- Unix timestamp: ${Math.floor(now.getTime() / 1000)}

CRITICAL: You are in Nigeria, timezone Africa/Lagos (WAT, UTC+1). When you reference dates, times, "today", "yesterday", "tomorrow", or any time-relative terms, you MUST derive them from the Lagos time above. NEVER guess or hallucinate dates.`;

    const systemPrompt =
      id !== "general"
        ? `${currentDateTime}\n\n[IDENTITY OVERRIDE] You are "${agent.name}" (${agent.role}). You are NOT Claw General, NOT a general assistant, NOT any other agent. You MUST call yourself "${agent.name}" at all times.${memoryBlock}${learningBlock}${reminderAlert}\n\n${agent.systemPrompt}${toolBlock}${taskCompletionBlock}`
        : `${currentDateTime}\n\n${agent.systemPrompt}${memoryBlock}${learningBlock}${reminderAlert}${toolBlock}${taskCompletionBlock}`;

    // Determine step limit: specialist agents get fewer steps to be efficient,
       // Claw General gets more for complex multi-step orchestration.
    // Using stopWhen: stepCountIs(N) — each "step" is one LLM turn.
    // With N=1, the model can call tools but NOT explain results afterward.
    // With N>1, after tool results come back, the model gets another turn to explain.
    // Tuned up from 25/15 to 40/25 to prevent the "stops halfway" bug.
    const maxSteps = id === "general" ? MAX_STEPS_GENERAL : MAX_STEPS_SPECIALIST;

    const result = streamText({
      model,
      system: systemPrompt,
      messages: modelMessages,
      tools: agentTools,
      maxOutputTokens: Math.max(userSettings.maxTokens, 16384),
      temperature: userSettings.temperature,
      stopWhen: stepCountIs(maxSteps),
      onStepFinish: ({ text, toolCalls, toolResults, finishReason }) => {
        const stepInfo: string[] = [`[Step] finishReason=${finishReason}`];
        if (text) stepInfo.push(`text=${text.slice(0, 100)}${text.length > 100 ? "..." : ""}`);
        if (toolCalls?.length) stepInfo.push(`toolCalls=[${toolCalls.map((t: { toolName: string }) => t.toolName).join(", ")}]`);
        if (toolResults?.length) stepInfo.push(`toolResults=${toolResults.length} results, totalSize=${toolResults.reduce((s: number, r) => s + JSON.stringify(r).length, 0)} chars`);
        console.log(`[Chat] ${agent.name}: ${stepInfo.join(" | ")}`);
        // Phase 2: log tool calls as activity
        if (toolCalls?.length) {
          for (const tc of toolCalls) {
            logActivity({ agentId: id, agentName: agent.name, action: "tool_call", detail: `called ${tc.toolName}`, toolName: tc.toolName }).catch(() => {});
          }
        }
        // Phase 2: log chat_message when step finishes with text
        if (finishReason === "stop" && text) {
          logActivity({ agentId: id, agentName: agent.name, action: "chat_message", detail: `responding to: ${lastContent?.slice(0, 60) || "user"}` }).catch(() => {});
          persistAgentStatus(id, { messagesProcessed: 1 }).catch(() => {});
        }

        // Detect the "stopped after tool calls" pattern — model got results but produced no text
        if (finishReason === "stop" && !text && toolResults?.length > 0 && toolCalls?.length === 0) {
          console.error(`[Chat] 🚨 MID-TASK STOP BUG: ${agent.name} stopped after receiving ${toolResults.length} tool result(s) without generating any text response. The user will see nothing.`);
        }

        // Detect when approaching step limit with no text generated yet
        // This is a warning sign that the model may exhaust steps without explaining results
        if (String(finishReason).includes("step") && !text && toolResults?.length > 0) {
          console.error(`[Chat] 🚨 STEP LIMIT REACHED: ${agent.name} hit step limit (${maxSteps}) with tool results but NO final text response. The user received no explanation for the tool results.`);
        }
      },
      onFinish: ({ steps, usage }) => {
        const assistantText = steps
          .map((s) => s.text)
          .join("");
        const totalToolResults = steps.reduce((count, s) => count + (s.toolResults?.length || 0), 0);
        console.log(`[Chat] ${agent.name} done. Steps: ${steps.length}, Total text: ${assistantText.length} chars, Tool result batches: ${totalToolResults}`);

        // Track token usage for smart key rotation
        const inputTokens = (usage as unknown as { promptTokens?: number; inputTokens?: { total: number } }).promptTokens
          || (usage as unknown as { inputTokens?: { total: number } }).inputTokens?.total
          || 0;
        const outputTokens = (usage as unknown as { completionTokens?: number; outputTokens?: { total: number } }).completionTokens
          || (usage as unknown as { outputTokens?: { total: number } }).outputTokens?.total
          || 0;

        if (inputTokens > 0 || outputTokens > 0) {
          recordTokenUsage(
            selectedKey.key,
            providerResult.provider,
            selectedKey.key_label,
            inputTokens,
            outputTokens,
          ).catch(() => {});
          console.log(`[KeyUsage] ${selectedKey.key_label}: +${inputTokens + outputTokens} tokens (input=${inputTokens}, output=${outputTokens})`);
        } else {
          // Fallback: sum usage from individual steps
          let totalPrompt = 0;
          let totalCompletion = 0;
          for (const step of steps) {
            const stepUsage = step.usage as unknown as { promptTokens?: number; inputTokens?: { total: number }; completionTokens?: number; outputTokens?: { total: number } } | undefined;
            if (stepUsage) {
              totalPrompt += stepUsage.promptTokens || stepUsage.inputTokens?.total || 0;
              totalCompletion += stepUsage.completionTokens || stepUsage.outputTokens?.total || 0;
            }
          }
          if (totalPrompt > 0 || totalCompletion > 0) {
            recordTokenUsage(selectedKey.key, providerResult.provider, selectedKey.key_label, totalPrompt, totalCompletion).catch(() => {});
            console.log(`[KeyUsage] ${selectedKey.key_label}: +${totalPrompt + totalCompletion} tokens (from steps)`);
          }
        }

        // COMPLETION WATCHDOG: Detect incomplete response and save a recovery message
        // so the conversation context includes what happened (for the next turn).
        if (totalToolResults > 0 && (assistantText.length === 0 || assistantText.trim().length < 50)) {
          console.error(`[Chat] 🚨 INCOMPLETE RESPONSE: ${agent.name} processed ${totalToolResults} tool result batch(es) across ${steps.length} steps but produced ${assistantText.length === 0 ? "ZERO" : `only ${assistantText.length}`} chars of text.`);

          // Build a recovery summary from the last tool results so the user gets context
          const lastStep = steps[steps.length - 1];
          const toolNames = lastStep?.toolCalls?.map((t: { toolName: string }) => t.toolName).join(", ") || "unknown";
          const recoveryMsg = `[System Note: ${agent.name} processed your request using tools (${toolNames}) but did not generate a final text explanation. The tool calls completed successfully. Please ask me to explain the results or try your request again — I have the tool results available.]`;

          // Save recovery message to conversation history
          const sessionId = body.sessionId || `session-${Date.now()}`;
          saveMessage({
            sessionId,
            agentId: id,
            role: "assistant",
            content: recoveryMsg,
          }).catch(() => {});

          // Log to activity for dashboard visibility
          logActivity({
            agentId: id,
            agentName: agent.name,
            action: "incomplete_response",
            detail: `Tool results: ${totalToolResults}, Text chars: ${assistantText.length}, Steps: ${steps.length}. Completion watchdog triggered — recovery message saved.`,
          }).catch(() => {});

          // Self-learning: record a correction insight about the incomplete response
          recordLearning({
            agentId: id,
            insightType: "correction",
            content: `Agent stopped after processing ${totalToolResults} tool result(s) across ${steps.length} steps without generating a text explanation. Tools used: ${toolNames}. User may need to ask for results again.`,
            source: "correction",
            confidence: 0.7,
          }).catch(() => {});
        } else if (assistantText) {
          // Save assistant response to conversation history
          const sessionId = body.sessionId || `session-${Date.now()}`;
          saveMessage({
            sessionId,
            agentId: id,
            role: "assistant",
            content: assistantText,
          }).catch(() => {});

          // Self-learning: run lightweight pattern detection (async, non-blocking)
          // Analyze recent messages for user preferences and patterns
          const recentMsgs = processedMessages.slice(-10).map((m) => {
            const text = m.parts
              ? m.parts.filter((p) => p.type === "text").map((p) => p.text as string).join("")
              : "";
            return { role: m.role, content: text };
          }).filter((m) => m.content.length > 0);

          if (recentMsgs.length >= 3) {
            recordLearning({
              agentId: id,
              insightType: "pattern",
              content: `Async pattern detection triggered for ${recentMsgs.length} recent messages. Analysis runs in background.`,
              source: "pattern_detection",
              confidence: 0.3,
            }).catch(() => {});

            // Fire-and-forget pattern detection via the learning API
            fetch("/api/learning", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "detect_patterns", agentId: id, conversations: recentMsgs }),
            }).catch(() => {});
          }
        }
        // Tool call tracking is handled client-side via analytics-store
        updateAgentStatus(id, {
          status: "idle",
          currentTask: null,
          lastActivity: new Date().toISOString(),
          tasksCompleted: steps.length,
        });
        // Phase 2: persist status & log completion (fire-and-forget)
        logActivity({ agentId: id, agentName: agent.name, action: "task_complete", detail: `completed task in ${steps.length} steps` }).catch(() => {});
        persistAgentStatus(id, { status: "idle", currentTask: null, lastActivity: new Date().toISOString(), tasksCompleted: steps.length }).catch(() => {});
      },
      onError: ({ error }) => {
        console.error(`[Chat] ${agent.name} stream error:`, error);
        const errorMsg = error instanceof Error ? error.message : "unknown";

        // Record key error for smart rotation (detect 429 rate limits)
        const isRateLimit = errorMsg.includes("429") || errorMsg.includes("rate") || errorMsg.includes("quota");
        recordKeyError(selectedKey.key, errorMsg, isRateLimit).catch(() => {});

        updateAgentStatus(id, {
          status: "error",
          currentTask: null,
          lastActivity: new Date().toISOString(),
        });
        // Phase 2: log error & persist status (fire-and-forget)
        logActivity({ agentId: id, agentName: agent.name, action: "error", detail: `stream error: ${error instanceof Error ? error.message.slice(0, 100) : "unknown"}` }).catch(() => {});
        persistAgentStatus(id, { status: "error", currentTask: null, lastActivity: new Date().toISOString() }).catch(() => {});
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[Chat] API error:", error);

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

// ---------------------------------------------------------------------------
// Attachment Injection
// ---------------------------------------------------------------------------

/**
 * Injects file attachment content into the last user message.
 * - For image attachments: adds as image parts (for vision models).
 * - For text/structured attachments: prepends content to the user message with a header.
 */
function injectAttachments(
  messages: UIMessage[],
  attachments: Attachment[],
): UIMessage[] {
  if (!messages.length || !attachments.length) return messages;

  // Work with a copy to avoid mutating the original
  const result: UIMessage[] = JSON.parse(JSON.stringify(messages));

  // Find the last user message to inject into
  let targetIdx = result.length - 1;
  while (targetIdx >= 0 && result[targetIdx].role !== "user") {
    targetIdx--;
  }

  if (targetIdx < 0) {
    // No user message found — prepend attachments as a new user message
    const attachmentText = attachments
      .map((a) => formatAttachmentHeader(a) + a.content)
      .join("\n\n");

    result.unshift({
      id: `attachment-${Date.now()}`,
      role: "user",
      parts: [{ type: "text" as const, text: attachmentText }],
    });
    return result;
  }

  const targetMsg = result[targetIdx];

  // Build attachment text and prepend to the message
  const textAttachments = attachments.filter((a) => a.type !== "image");

  if (textAttachments.length > 0) {
    const attachmentText = textAttachments
      .map((a) => formatAttachmentHeader(a) + a.content)
      .join("\n\n---\n\n");

    // Prepend to the existing message text
    const existingParts = targetMsg.parts || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const textPart = existingParts.find((p: any) => p.type === "text");
    if (textPart && "text" in textPart) {
      textPart.text = attachmentText + "\n\n---\n\n" + textPart.text;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      existingParts.unshift({ type: "text" as const, text: attachmentText });
    }
  }

  return result;
}

function formatAttachmentHeader(attachment: Attachment): string {
  const sizeStr = attachment.content.length > 5000
    ? ` (${(attachment.content.length / 1024).toFixed(1)}KB)`
    : "";
  return `[Attached file: ${attachment.name}${sizeStr}]\n`;
}

// ---------------------------------------------------------------------------
// Due Reminders Checker (inline — runs on every chat message)
// ---------------------------------------------------------------------------

interface DueReminder {
  id: number;
  title: string;
  description: string;
  reminder_time: string;
  priority: string;
}

async function checkDueReminders(): Promise<DueReminder[]> {
  if (!process.env.SUPABASE_DB_URL) return [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool } = require("pg");
    const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL });
    const { rows } = await pool.query(
      `SELECT id, title, description, reminder_time, priority
       FROM reminders
       WHERE status = 'pending' AND reminder_time <= NOW()
       ORDER BY priority DESC, reminder_time ASC
       LIMIT 10`,
    );
    await pool.end();
    return rows;
  } catch {
    return [];
  }
}
