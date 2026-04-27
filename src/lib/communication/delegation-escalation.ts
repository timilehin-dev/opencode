// ---------------------------------------------------------------------------
// Phase 4 Advanced: Delegation Timeout & Escalation
// ---------------------------------------------------------------------------
// Wraps delegation calls with a configurable timeout. If the delegate agent
// doesn't respond within the timeout, escalates to the next-best agent in a
// priority chain. Logs all escalation events to agent_activity.
//
// Usage:
//   import { delegateWithTimeout, getEscalationChain } from "@/lib/communication/delegation-escalation"
//   const result = await delegateWithTimeout("mail", "Draft the Q3 report", context);
// ---------------------------------------------------------------------------

import { query } from "@/lib/core/db";
import { logger } from "@/lib/core/logger";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Default timeout for a single delegation attempt (30 seconds). */
export const DELEGATION_TIMEOUT_MS = 30_000;

/** Maximum number of escalation hops before giving up. */
export const MAX_ESCALATION_HOPS = 3;

// ---------------------------------------------------------------------------
// Agent escalation priority map
// ---------------------------------------------------------------------------
// When an agent times out, the system escalates to the next agent in its
// fallback chain. Each agent has a prioritized list of fallback agents.
// The 7 agents: general, mail, code, data, creative, research, ops
// ---------------------------------------------------------------------------

const ESCALATION_MAP: Record<string, string[]> = {
  general:   ["creative", "research", "data"],
  mail:      ["general", "creative", "ops"],
  code:      ["general", "data", "ops"],
  data:      ["code", "research", "general"],
  creative:  ["general", "research", "data"],
  research:  ["data", "general", "creative"],
  ops:       ["code", "general", "data"],
};

const ALL_AGENTS = ["general", "mail", "code", "data", "creative", "research", "ops"] as const;
export type AgentId = (typeof ALL_AGENTS)[number];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface DelegationResult {
  success: boolean;
  text: string;
  agentUsed: string;
  escalated: boolean;
  escalationChain?: string[];
  error?: string;
}

/**
 * Get the ordered escalation chain for a given agent.
 * Returns the list of fallback agents (excluding the original agent).
 */
export function getEscalationChain(agentId: string): string[] {
  const chain = ESCALATION_MAP[agentId];
  if (!chain) {
    // Unknown agent — fall back to general then the rest
    return ALL_AGENTS.filter((a) => a !== agentId);
  }
  // Ensure no duplicates and exclude the original agent
  const seen = new Set<string>([agentId]);
  const result: string[] = [];
  for (const a of chain) {
    if (!seen.has(a)) {
      seen.add(a);
      result.push(a);
    }
  }
  return result;
}

/**
 * Attempt a single delegation to one agent with a timeout.
 * Calls the agent directly using generateText (same as delegation.ts pattern).
 */
async function attemptDelegation(
  agentId: string,
  taskPrompt: string,
  context: string,
  timeoutMs: number,
): Promise<{ text: string; durationMs: number }> {
  const { generateText } = await import("ai");
  const { getAgent, getProvider } = await import("@/lib/agent/agents");
  const { allTools, setCurrentAgentId } = await import("@/lib/tools");

  const agent = getAgent(agentId);
  if (!agent) throw new Error(`Unknown agent: ${agentId}`);

  setCurrentAgentId(agentId);

  // Build tools — strip delegation tools to prevent infinite escalation loops
  const agentTools: Record<string, any> = {};
  for (const toolId of agent.tools) {
    if (allTools[toolId]) {
      if (
        toolId === "query_agent" ||
        toolId === "a2a_send_message" ||
        toolId === "a2a_broadcast" ||
        toolId === "a2a_collaborate" ||
        toolId === "delegate_to_agent"
      ) {
        continue;
      }
      agentTools[toolId] = allTools[toolId];
    }
  }

  const providerResult = await getProvider(agent);
  const startTime = Date.now();

  const result = await generateText({
    model: providerResult.model,
    system: agent.systemPrompt,
    messages: [
      { role: "user", content: `${taskPrompt}\n\n${context ? `## Context\n${context}` : ""}` },
    ],
    tools: agentTools,
    maxOutputTokens: 262144,
    abortSignal: AbortSignal.timeout(timeoutMs),
  });

  const durationMs = Date.now() - startTime;
  let text = result.text;

  // Recovery: if no text was produced but tools were called, summarize
  if (!text || text.trim().length < 50) {
    const toolCalls = result.steps.flatMap(
      (s: { toolCalls?: Array<{ toolName: string }> }) => s.toolCalls || [],
    );
    if (toolCalls.length > 0) {
      const toolSummary = toolCalls.map((tc: { toolName: string }) => tc.toolName).join(", ");
      text = `[${agent.name} completed ${toolCalls.length} tool call(s). Tools used: ${toolSummary}.]`;
    } else {
      text = `[${agent.name} returned no output within ${Math.round(timeoutMs / 1000)}s.]`;
    }
  }

  return { text: text.trim(), durationMs };
}

/**
 * Log an escalation event to the agent_activity table.
 */
async function logEscalationEvent(
  fromAgent: string,
  toAgent: string,
  taskPrompt: string,
  reason: string,
  chain: string[],
): Promise<void> {
  try {
    await query(
      `INSERT INTO agent_activity (agent_id, action, detail, metadata)
       VALUES ($1, $2, $3, $4)`,
      [
        fromAgent,
        "delegation_escalation",
        `Escalated from ${fromAgent} to ${toAgent}: ${reason}`,
        JSON.stringify({
          originalAgent: fromAgent,
          escalatedTo: toAgent,
          reason,
          escalationChain: chain,
          taskPreview: taskPrompt.slice(0, 200),
        }),
      ],
    );
  } catch {
    // Logging is non-critical
  }
}

/**
 * Delegate a task to an agent with a configurable timeout and automatic
 * escalation to fallback agents on timeout.
 *
 * @param agentId    - The primary agent to delegate to
 * @param taskPrompt - The task description
 * @param context    - Additional context string
 * @param timeoutMs  - Timeout per agent attempt (default: DELEGATION_TIMEOUT_MS)
 * @param maxHops    - Max escalation hops (default: MAX_ESCALATION_HOPS)
 */
export async function delegateWithTimeout(
  agentId: string,
  taskPrompt: string,
  context: string,
  timeoutMs: number = DELEGATION_TIMEOUT_MS,
  maxHops: number = MAX_ESCALATION_HOPS,
): Promise<DelegationResult> {
  const escalationChain = getEscalationChain(agentId);
  const attemptedAgents: string[] = [agentId];

  logger.info("delegation-escalation", `Starting delegation to ${agentId}`, {
    taskPreview: taskPrompt.slice(0, 100),
    timeoutMs,
    maxHops,
  });

  // Try primary agent first
  try {
    const { text, durationMs } = await attemptDelegation(agentId, taskPrompt, context, timeoutMs);
    logger.info("delegation-escalation", `Primary agent ${agentId} responded`, {
      durationMs,
      textLength: text.length,
    });
    return {
      success: true,
      text,
      agentUsed: agentId,
      escalated: false,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown error";
    logger.warn("delegation-escalation", `Agent ${agentId} timed out or failed`, {
      reason,
      durationMs: timeoutMs,
    });
  }

  // Escalate through fallback agents
  const maxAttempts = Math.min(maxHops, escalationChain.length);
  for (let hop = 0; hop < maxAttempts; hop++) {
    const fallbackAgent = escalationChain[hop];
    if (!fallbackAgent || attemptedAgents.includes(fallbackAgent)) continue;

    attemptedAgents.push(fallbackAgent);

    logger.info("delegation-escalation", `Escalating to ${fallbackAgent} (hop ${hop + 1}/${maxAttempts})`, {
      originalAgent: agentId,
      chain: attemptedAgents,
    });

    // Log escalation to agent_activity
    await logEscalationEvent(
      agentId,
      fallbackAgent,
      taskPrompt,
      `Timeout after ${timeoutMs}ms on ${attemptedAgents[attemptedAgents.length - 2]}`,
      attemptedAgents,
    );

    try {
      const { text, durationMs } = await attemptDelegation(fallbackAgent, taskPrompt, context, timeoutMs);
      logger.info("delegation-escalation", `Escalation to ${fallbackAgent} succeeded`, {
        durationMs,
        textLength: text.length,
        hops: hop + 1,
      });
      return {
        success: true,
        text,
        agentUsed: fallbackAgent,
        escalated: true,
        escalationChain: attemptedAgents,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";
      logger.warn("delegation-escalation", `Escalation to ${fallbackAgent} failed`, {
        reason,
        hop: hop + 1,
      });
    }
  }

  // All agents failed
  const errorMsg = `Delegation failed after ${attemptedAgents.length} attempts: ${attemptedAgents.join(" → ")}`;
  logger.error("delegation-escalation", errorMsg, {
    originalAgent: agentId,
    chain: attemptedAgents,
  });

  return {
    success: false,
    text: errorMsg,
    agentUsed: attemptedAgents[attemptedAgents.length - 1],
    escalated: true,
    escalationChain: attemptedAgents,
    error: errorMsg,
  };
}
