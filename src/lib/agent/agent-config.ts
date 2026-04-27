// ---------------------------------------------------------------------------
// Klawhub Agent System — Shared Agent Configuration (Pure Data + Functions)
// ---------------------------------------------------------------------------
// This file is self-contained: no Next.js deps, no external library imports.
// Both the Next.js app and standalone scripts can import from this module.
//
// Prompt content has been extracted to the prompts/ subdirectory.
// All exports from prompts/* are re-exported here for backward compatibility.
// ---------------------------------------------------------------------------

import { getTieredTools } from "@/lib/tools/tiers";

// ---------------------------------------------------------------------------
// Re-export all prompt content for backward compatibility
// ---------------------------------------------------------------------------

export {
  AGENT_TEAM_DIRECTORY,
  AUTONOMOUS_ROUTING_RULES,
  INITIATION_PROTOCOL,
  SELF_IMPROVEMENT_PROTOCOL,
} from "./prompts/shared-protocols";

export {
  AGENT_SKILL_LIST,
  DOCUMENT_TOOL_REFERENCE,
  DOCUMENT_QUALITY_STANDARDS,
  PARAMETER_BEST_PRACTICES,
  SKILLS_ROUTING_MATRIX,
  getSkillsAwareness,
} from "./prompts/skills-content";

export {
  GENERAL_SYSTEM_PROMPT,
  MAIL_SYSTEM_PROMPT,
  CODE_SYSTEM_PROMPT,
  DATA_SYSTEM_PROMPT,
  CREATIVE_SYSTEM_PROMPT,
  RESEARCH_SYSTEM_PROMPT,
  OPS_SYSTEM_PROMPT,
} from "./prompts/system-prompts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentDefinition {
  id: string;
  name: string;
  role: string;
  emoji: string;
  description: string;
  provider: "aihubmix" | "openrouter" | "ollama";
  model: string;
  color: string;
  /** Optional: specific env var keys to use instead of the default pool */
  keyEnvVars?: string[];
}

// ---------------------------------------------------------------------------
// Agent Definitions — metadata for all 7 agents
// ---------------------------------------------------------------------------

export const AGENT_DEFINITIONS: Record<string, AgentDefinition> = {
  general: {
    id: "general",
    name: "Klawhub General",
    role: "Chief Orchestrator",
    emoji: "🤵",
    description: "The most capable agent — powered by Gemma 4 31B. Orchestrates all tasks, delegates to specialists, and handles complex multi-step requests.",
    provider: "ollama",
    model: "gemma4:31b-cloud",
    color: "emerald",
  },
  mail: {
    id: "mail",
    name: "Mail Agent",
    role: "Executive Assistant — Email & Calendar",
    emoji: "✉️",
    description: "Executive-grade email management, calendar scheduling, meeting preparation, Google Meet creation, and communications research. Proactively researches contacts and context.",
    provider: "ollama",
    model: "gemma4:31b-cloud",
    color: "blue",
  },
  code: {
    id: "code",
    name: "Code Agent",
    role: "Senior Software Engineer — Code & DevOps",
    emoji: "💻",
    description: "Staff-level code review, repository management, CI/CD monitoring, and technical architecture with real-time documentation research.",
    provider: "ollama",
    model: "gemma4:31b-cloud",
    color: "purple",
  },
  data: {
    id: "data",
    name: "Data Agent",
    role: "Senior Data Analyst — Data & Research",
    emoji: "📊",
    description: "Veteran data analyst with statistical computation, spreadsheet mastery, web research, and data-driven insight generation.",
    provider: "ollama",
    model: "gemma4:31b-cloud",
    color: "amber",
  },
  creative: {
    id: "creative",
    name: "Creative Agent",
    role: "Content Strategist — Content & Creative",
    emoji: "🧠",
    description: "VP-level content strategy, campaign planning, audience research, and creative direction backed by competitive intelligence.",
    provider: "ollama",
    model: "gemma4:31b-cloud",
    color: "rose",
  },
  research: {
    id: "research",
    name: "Research Agent",
    role: "Research Analyst — Deep Research & Synthesis",
    emoji: "🔍",
    description: "Senior research analyst with multi-query parallel search, cross-reference synthesis, and automated research brief generation to Google Docs and Sheets.",
    provider: "ollama",
    model: "gemma4:31b-cloud",
    color: "teal",
  },
  ops: {
    id: "ops",
    name: "Ops Agent",
    role: "Operations Engineer — Monitoring & Deployment",
    emoji: "⚡",
    description: "Operations engineer for system health monitoring, deployment tracking, GitHub activity analysis, and agent performance statistics.",
    provider: "ollama",
    model: "gemma4:31b-cloud",
    keyEnvVars: ["OLLAMA_CLOUD_KEY_6", "OLLAMA_CLOUD_KEY_1", "OLLAMA_CLOUD_KEY_2"],
    color: "orange",
  },
};

// ---------------------------------------------------------------------------
// Per-Agent Tool Lists
// ---------------------------------------------------------------------------

export const AGENT_TOOL_LISTS: Record<string, string[]> = {
  // General agent keeps its full tool list (all tools including Tier 2 power tools)
  general: [
    "gmail_send", "gmail_fetch", "gmail_labels",
    "gmail_create_label", "gmail_delete_label", "gmail_profile",
    "gmail_reply", "gmail_thread", "gmail_batch",
    "calendar_list", "calendar_events", "calendar_create",
    "calendar_update", "calendar_delete", "calendar_freebusy",
    "drive_list", "drive_create_folder", "drive_create_file",
    "download_drive_file",
    "sheets_read", "sheets_values", "sheets_append", "sheets_update",
    "sheets_create", "sheets_add_sheet",
    "sheets_batch_get", "sheets_clear",
    "docs_list", "docs_read", "docs_create", "docs_append",
    "github_repo", "github_issues", "github_create_issue",
    "github_prs", "github_commits", "github_files",
    "github_read_file", "github_search", "github_branches",
    "github_update_issue", "github_create_pr",
    "github_pr_review", "github_pr_comment", "github_create_branch",
    "vercel_projects", "vercel_deployments", "vercel_domains",
    "vercel_deploy", "vercel_logs",
    "web_search", "web_search_advanced", "web_reader",
    "vision_analyze", "vision_download_analyze",
    "code_execute", "python_data_process", "weather_get",
    "design_generate", "design_edit", "design_variants",
    "data_calculate", "data_clean", "data_pivot",
    "research_deep", "research_synthesize",
    "research_save_brief", "research_save_data",
    "ops_health_check", "ops_deployment_status",
    "ops_github_activity", "ops_agent_stats",
    "create_pdf_report", "create_docx_document", "create_xlsx_spreadsheet",
    "create_pptx_presentation", "generate_chart", "llm_chat",
    "finance_query", "academic_search", "content_analyze",
    "gmail_send_attachment",
    // Workspace Tools
    "reminder_create", "reminder_list", "reminder_update", "reminder_delete", "reminder_complete",
    "todo_create", "todo_list", "todo_update", "todo_delete", "todo_stats",
    "contact_create", "contact_list", "contact_search", "contact_update", "contact_delete",
    // Project Management (Phase 2)
    "project_create", "project_add_task", "project_status", "project_list",
    // Phase 5: Full Autonomous Project Lifecycle
    "project_update", "project_delete", "project_retry_task", "project_skip_task",
    "project_decompose_and_add", "project_health",
    // A2A Delegation — synchronous agent routing
    "query_agent",
    "delegate_to_agent",
    // Phase 4: A2A Real-Time Communication
    "a2a_send_message", "a2a_broadcast", "a2a_check_inbox",
    "a2a_share_context", "a2a_query_context", "a2a_collaborate",
    // Autonomous Task Creation & Team Coordination
    "schedule_agent_task", "get_team_status", "share_progress", "get_team_progress",
    // Skills
    "skill_list", "skill_use", "skill_create", "skill_equip", "skill_rate", "skill_inspect", "skill_evaluate",
    // Phase 6C: Skill Evolution & Rollback
    "skill_evolve", "skill_rollback",
    // Phase 6D: Skill Search & Embedding Management
    "skill_search_hybrid", "skill_refresh_embeddings", "skill_embedding_setup",
    // Phase 7B: Multi-Step Agent Workflows
    "workflow_plan", "workflow_execute", "workflow_status",
    "workflow_list", "workflow_step_execute", "workflow_cancel",
    "workflow_schedule", "workflow_update_schedule",
    // Agent Routines
    "routine_create", "routine_list", "routine_update", "routine_delete", "routine_toggle", "cron_sync",
    // Task Board (Kanban)
    "taskboard_create", "taskboard_update", "taskboard_list", "taskboard_delete", "taskboard_summary",
    // Persistent Memory (Phase 4)
    "memory_save", "memory_search", "memory_recall", "memory_forget", "memory_list", "memory_summary",
    // Phase 5: Inter-Agent Initiation
    "initiate_contact", "request_help", "offer_assistance", "observe_agent", "escalate_to_chief",
    "respond_to_initiation", "check_initiation_inbox",
    // Phase 6: Self-Improvement
    "reflect_on_performance", "benchmark_self", "learn_from_mistakes", "share_knowledge", "improve_strategy",
  ],
  // Specialist agents use the tier system: Tier 0 (universal) + Tier 1 (domain-specific)
  mail: getTieredTools("mail"),
  code: getTieredTools("code"),
  data: getTieredTools("data"),
  creative: getTieredTools("creative"),
  research: getTieredTools("research"),
  ops: getTieredTools("ops"),
};

// ---------------------------------------------------------------------------
// Suggested Actions — per-agent quick-start prompts
// ---------------------------------------------------------------------------

export const AGENT_SUGGESTED_ACTIONS: Record<string, { label: string; prompt: string }[]> = {
  general: [
    { label: "Check my inbox", prompt: "Show me my latest unread emails" },
    { label: "GitHub status", prompt: "Give me a status update on my GitHub repo" },
    { label: "Upcoming events", prompt: "What's on my calendar this week?" },
    { label: "Drive files", prompt: "Show me my recent Google Drive files" },
  ],
  mail: [
    { label: "Check inbox", prompt: "Show me my latest unread emails" },
    { label: "Compose email", prompt: "Help me draft a professional email" },
    { label: "Search emails", prompt: "Search my emails from the last week" },
    { label: "My schedule", prompt: "What events do I have coming up?" },
    { label: "Research contact", prompt: "Research a company before my meeting tomorrow" },
  ],
  code: [
    { label: "Open issues", prompt: "List all open GitHub issues" },
    { label: "PR status", prompt: "Show me the latest pull requests" },
    { label: "Recent commits", prompt: "What are the recent commits?" },
    { label: "Deployments", prompt: "Check my latest Vercel deployments" },
    { label: "Look up docs", prompt: "Search for the latest Next.js Server Actions documentation" },
  ],
  data: [
    { label: "My files", prompt: "Show me all my Google Drive files and folders" },
    { label: "Read sheet", prompt: "Show me what spreadsheets I have" },
    { label: "Analyze data", prompt: "Read my spreadsheet and calculate key metrics" },
    { label: "Market research", prompt: "Research current market data on my industry" },
    { label: "Create report", prompt: "Create a data report in Google Docs" },
  ],
  creative: [
    { label: "Draft document", prompt: "Help me draft a new document" },
    { label: "Content plan", prompt: "Create a content calendar for this month" },
    { label: "Trend research", prompt: "What's trending in my industry right now?" },
    { label: "Competitor analysis", prompt: "Analyze what my competitors are publishing" },
    { label: "Brainstorm", prompt: "Help me brainstorm ideas for a project" },
  ],
  research: [
    { label: "Deep research", prompt: "Do deep research on a topic with multiple angles" },
    { label: "Cross-reference", prompt: "Compare and synthesize findings from multiple sources" },
    { label: "Save brief", prompt: "Create a research brief document with my findings" },
    { label: "Analyze image", prompt: "Analyze this image or document for research insights" },
  ],
  ops: [
    { label: "System health", prompt: "Check the health status of all services" },
    { label: "Deployment", prompt: "What's the latest deployment status?" },
    { label: "GitHub activity", prompt: "Show recent GitHub activity and any anomalies" },
    { label: "Agent stats", prompt: "Show performance stats for all agents" },
  ],
};

// ---------------------------------------------------------------------------
// Agent System Prompts Map — lookup by agent id
// ---------------------------------------------------------------------------

import {
  GENERAL_SYSTEM_PROMPT as GENERAL,
  MAIL_SYSTEM_PROMPT as MAIL,
  CODE_SYSTEM_PROMPT as CODE,
  DATA_SYSTEM_PROMPT as DATA,
  CREATIVE_SYSTEM_PROMPT as CREATIVE,
  RESEARCH_SYSTEM_PROMPT as RESEARCH,
  OPS_SYSTEM_PROMPT as OPS,
} from "./prompts/system-prompts";

export const AGENT_SYSTEM_PROMPTS: Record<string, string> = {
  general: GENERAL,
  mail: MAIL,
  code: CODE,
  data: DATA,
  creative: CREATIVE,
  research: RESEARCH,
  ops: OPS,
};

// ---------------------------------------------------------------------------
// getAgentSystemPrompt — builder function for constructing prompts
// ---------------------------------------------------------------------------

/**
 * Get the full system prompt for a given agent.
 * @param agentId  The agent identifier (e.g. "general", "mail", "code", …)
 * @returns The complete system prompt string, or a generic fallback if the id is unknown.
 */
export function getAgentSystemPrompt(agentId: string): string {
  return AGENT_SYSTEM_PROMPTS[agentId] ?? GENERAL;
}

// ---------------------------------------------------------------------------
// Convenience: list of all agent IDs
// ---------------------------------------------------------------------------

export const ALL_AGENT_IDS = Object.keys(AGENT_DEFINITIONS) as Array<
  keyof typeof AGENT_DEFINITIONS
>;
