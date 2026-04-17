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
import { getAgent, getProvider, updateAgentStatus } from "@/lib/agents";
import { allTools } from "@/lib/tools";
import { getMemorySummary, saveMessage } from "@/lib/memory";

export const maxDuration = 300; // Vercel Pro supports up to 300s. Free model is slow (~30s TTFT), multi-step tool calling needs time.

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
    const { messages, agentId, attachments } = body as {
      messages: UIMessage[];
      agentId?: string;
      attachments?: Attachment[];
    };

    const id = agentId || "general";
    const agent = getAgent(id);

    if (!agent) {
      return new Response(
        JSON.stringify({ error: `Unknown agent: ${id}` }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Build subset of tools for this agent
    const agentTools: Record<string, typeof allTools.gmail_send> = {};
    for (const toolId of agent.tools) {
      if (allTools[toolId]) {
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

    // Get the model (with key rotation) — uses .chat() for Chat Completions API
    const model = getProvider(agent);

    // Run these in parallel to reduce time-to-first-token
    const [modelMessages, memoryContext, dueReminders] = await Promise.all([
      convertToModelMessages(processedMessages),
      getMemorySummary(id).catch(() => ""),
      checkDueReminders().catch(() => []),
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

    // Universal task completion block — injected into every agent
    const taskCompletionBlock = `

## TASK COMPLETION RULES (CRITICAL — READ EVERY TIME)
1. **NEVER stop mid-task.** Once you start a task, you MUST complete it fully before stopping. Every user request deserves a complete, thorough response.
2. **ALWAYS respond after tool calls.** When you call tools and get results, you MUST then write a clear, complete text response summarizing what you found and answering the user's question. NEVER leave the conversation hanging after tool results — this is the #1 failure mode. The tool results are data for YOU to interpret and explain to the user.
3. **Use tools efficiently.** When analyzing files (especially images), use \`vision_download_analyze\` for Drive files — it downloads AND analyzes in ONE step. Do NOT download then analyze separately for Drive files.
4. **Combine steps.** When a task requires multiple tool calls, chain them efficiently. For example: download a file → analyze it → report findings — all in one flow.
5. **Always deliver the final answer.** After all tool calls complete, you MUST provide a clear, complete response to the user. Never end on just a tool result without explanation.
6. **If you hit limits**, prioritize delivering whatever results you have with a clear summary rather than stopping silently.
7. **Structure your final response.** Use headers, lists, and tables to organize findings. Start with a brief summary, then provide details. End with action items or next steps if relevant.`;

    // Build reminder alert if there are due reminders
    const reminderAlert = dueReminders.length > 0
      ? `\n\n## REMINDERS — You have ${dueReminders.length} pending reminder(s) right now\nIMPORTANT: These reminders are overdue or due now. You MUST proactively tell the user about them at the START of your response, BEFORE answering their question. Present them clearly with the reminder title, when it was due, and the description.\n\n${dueReminders.map(r => `- **${r.title}** (due: ${r.reminder_time})${r.description ? ` — ${r.description}` : ""}`).join("\n")}\n\nAfter presenting the reminders, continue with the user's actual request.`
      : "";

    // Inject real-time date/time context so agents know "now"
    // This is critical for reminders ("remind me tomorrow"), scheduling, etc.
    const now = new Date();
    const currentDateTime = `[CURRENT DATE/TIME — Use this as "now" for all time calculations]
- UTC: ${now.toISOString()}
- Date: ${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
- Time: ${now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" })}
- Unix timestamp: ${Math.floor(now.getTime() / 1000)}
When the user says "tomorrow", "next week", "in 2 hours", etc., calculate from this current time.`;

    const systemPrompt =
      id !== "general"
        ? `${currentDateTime}\n\n[IDENTITY OVERRIDE] You are "${agent.name}" (${agent.role}). You are NOT Claw General, NOT a general assistant, NOT any other agent. You MUST call yourself "${agent.name}" at all times.${memoryBlock}${reminderAlert}\n\n${agent.systemPrompt}${toolBlock}${taskCompletionBlock}`
        : `${currentDateTime}\n\n${agent.systemPrompt}${memoryBlock}${reminderAlert}${toolBlock}${taskCompletionBlock}`;

    const result = streamText({
      model,
      system: systemPrompt,
      messages: modelMessages,
      tools: agentTools,
      maxOutputTokens: 16384,
      stopWhen: stepCountIs(15),
      onStepFinish: ({ text, toolCalls, toolResults, finishReason }) => {
        const stepInfo: string[] = [`[Step] finishReason=${finishReason}`];
        if (text) stepInfo.push(`text=${text.slice(0, 100)}${text.length > 100 ? "..." : ""}`);
        if (toolCalls?.length) stepInfo.push(`toolCalls=[${toolCalls.map((t: { toolName: string }) => t.toolName).join(", ")}]`);
        if (toolResults?.length) stepInfo.push(`toolResults=${toolResults.length} results, totalSize=${toolResults.reduce((s: number, r) => s + JSON.stringify(r).length, 0)} chars`);
        console.log(`[Chat] ${agent.name}: ${stepInfo.join(" | ")}`);

        // Detect the "stopped after tool calls" pattern — model got results but produced no text
        if (finishReason === "stop" && !text && toolResults?.length > 0 && toolCalls?.length === 0) {
          console.warn(`[Chat] ⚠️ ${agent.name} STOPPED AFTER TOOL RESULTS WITHOUT GENERATING TEXT — this is the mid-task stop bug`);
        }
      },
      onFinish: ({ steps }) => {
        console.log(`[Chat] ${agent.name} done. Steps: ${steps.length}, Total text: ${steps.map(s => s.text).join("").length} chars`);
        // Save assistant response to conversation history
        const assistantText = steps
          .map((s) => s.text)
          .join("");
        if (assistantText) {
          const sessionId = body.sessionId || `session-${Date.now()}`;
          saveMessage({
            sessionId,
            agentId: id,
            role: "assistant",
            content: assistantText,
          }).catch(() => {});
        }
        // Tool call tracking is handled client-side via analytics-store
        updateAgentStatus(id, {
          status: "idle",
          currentTask: null,
          lastActivity: new Date().toISOString(),
          tasksCompleted: steps.length,
        });
      },
      onError: ({ error }) => {
        console.error(`[Chat] ${agent.name} stream error:`, error);
        updateAgentStatus(id, {
          status: "error",
          currentTask: null,
          lastActivity: new Date().toISOString(),
        });
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
