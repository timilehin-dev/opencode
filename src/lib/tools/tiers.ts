// ---------------------------------------------------------------------------
// Klawhub Agent System — Tool Tiers
// ---------------------------------------------------------------------------
// 3-tier tool system that reduces each specialist agent's tool count
// while keeping the general agent at full power.
//
// Tier 0 — Universal: truly essential tools EVERY agent needs (~15)
// Tier 1 — Domain: tools specific to an agent's domain (per-agent)
// Tier 2 — Power: advanced tools only the general agent gets
//
// getTieredTools(agentId) returns Tier 0 + Tier 1[agent] for specialists,
// or Tier 0 + all Tier 1 domains + Tier 2 for the general agent.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tier 0 — Universal (always loaded for EVERY agent)
// ---------------------------------------------------------------------------
// ONLY tools that every single agent needs to function as part of the team.
// Domain-specific tools (memory, taskboard, workflows, etc.) go in Tier 1.

export const TOOL_TIER_0: string[] = [
  // Agent routing — the single most important cross-agent capability
  "query_agent",
  // Basic web access
  "web_search",
  "web_reader",
  // Skill system (minimum viable set)
  "skill_list",
  "skill_use",
  // General utilities
  "weather_get",
  "code_execute",
];

// ---------------------------------------------------------------------------
// Tier 1 — Domain (loaded per-agent based on role)
// ---------------------------------------------------------------------------
// These are tools that a specialist agent uses regularly.
// Organized by functional category, then assigned to agents.

export const TOOL_TIER_1: Record<string, string[]> = {
  // Mail Agent — Executive Assistant: Gmail, Calendar, Contacts, Documents
  mail: [
    // Gmail (all)
    "gmail_send", "gmail_fetch", "gmail_labels",
    "gmail_create_label", "gmail_delete_label", "gmail_profile",
    "gmail_reply", "gmail_thread", "gmail_batch",
    "gmail_send_attachment",
    // Calendar (all)
    "calendar_list", "calendar_events", "calendar_create",
    "calendar_update", "calendar_delete", "calendar_freebusy",
    // Contacts (all)
    "contact_create", "contact_list", "contact_search",
    "contact_update", "contact_delete",
    // Content & presentation
    "llm_chat", "content_analyze",
    "create_pptx_presentation", "create_pdf_report",
    "create_docx_document", "create_xlsx_spreadsheet",
    "generate_chart",
    // Docs & Sheets (light access)
    "docs_list", "docs_read", "docs_create", "docs_append",
    "sheets_read", "sheets_values", "sheets_append",
    // Workspace
    "todo_create", "todo_list", "todo_update",
    "reminder_create", "reminder_list", "reminder_update",
    "reminder_delete", "reminder_complete",
    // Persistent memory
    "memory_save", "memory_search", "memory_recall",
    "memory_forget", "memory_list", "memory_summary",
    // Skills
    "skill_inspect", "skill_rate",
    // Inter-agent initiation
    "initiate_contact", "request_help", "offer_assistance",
    "observe_agent", "escalate_to_chief",
    "respond_to_initiation", "check_initiation_inbox",
    // A2A communication
    "a2a_send_message", "a2a_check_inbox",
    "a2a_share_context", "a2a_query_context",
    // Team coordination
    "schedule_agent_task", "get_team_status",
    "share_progress", "get_team_progress",
    // Workflows (read-only)
    "workflow_plan", "workflow_status", "workflow_list",
    // Routine management
    "routine_create", "routine_list", "routine_update", "routine_toggle",
    // Task board
    "taskboard_create", "taskboard_update", "taskboard_list",
    "taskboard_delete", "taskboard_summary",
    // Self-improvement
    "reflect_on_performance", "benchmark_self",
    "learn_from_mistakes", "share_knowledge", "improve_strategy",
  ],

  // Code Agent — Senior Software Engineer: GitHub, Vercel
  code: [
    // GitHub (all)
    "github_repo", "github_issues", "github_create_issue",
    "github_prs", "github_commits", "github_files",
    "github_read_file", "github_search", "github_branches",
    "github_update_issue", "github_create_pr",
    "github_pr_review", "github_pr_comment", "github_create_branch",
    // Vercel (all)
    "vercel_projects", "vercel_deployments", "vercel_domains",
    "vercel_deploy", "vercel_logs",
    // Presentation & docs
    "create_pptx_presentation", "generate_chart",
    "create_pdf_report", "create_docx_document", "create_xlsx_spreadsheet",
    "llm_chat", "calendar_update",
    // Workspace
    "todo_create", "todo_list", "todo_update", "todo_delete", "todo_stats",
    // Persistent memory
    "memory_save", "memory_search", "memory_recall",
    "memory_forget", "memory_list", "memory_summary",
    // Skills
    "skill_inspect", "skill_rate",
    // Inter-agent initiation
    "initiate_contact", "request_help", "offer_assistance",
    "observe_agent", "escalate_to_chief",
    "respond_to_initiation", "check_initiation_inbox",
    // A2A communication
    "a2a_send_message", "a2a_check_inbox",
    "a2a_share_context", "a2a_query_context",
    // Team coordination
    "schedule_agent_task", "get_team_status",
    "share_progress", "get_team_progress",
    // Workflows (read-only)
    "workflow_plan", "workflow_status", "workflow_list",
    // Routine management
    "routine_create", "routine_list", "routine_update", "routine_toggle",
    // Task board
    "taskboard_create", "taskboard_update", "taskboard_list",
    "taskboard_delete", "taskboard_summary",
    // Self-improvement
    "reflect_on_performance", "benchmark_self",
    "learn_from_mistakes", "share_knowledge", "improve_strategy",
  ],

  // Data Agent — Senior Data Analyst: Drive, Sheets, Docs, Data Analysis
  data: [
    // Drive (all)
    "drive_list", "drive_create_folder", "drive_create_file", "download_drive_file",
    // Sheets (all)
    "sheets_read", "sheets_values", "sheets_append", "sheets_update",
    "sheets_create", "sheets_add_sheet", "sheets_batch_get", "sheets_clear",
    // Docs (all)
    "docs_list", "docs_read", "docs_create", "docs_append",
    // Data analysis
    "data_calculate", "data_clean", "data_pivot",
    // Vision (for data from images)
    "vision_analyze", "vision_download_analyze",
    // Charts & finance
    "generate_chart", "finance_query", "content_analyze",
    "create_pdf_report", "create_docx_document", "create_xlsx_spreadsheet",
    // Calendar & contacts
    "calendar_update", "contact_list", "contact_search",
    // Workspace
    "todo_create", "todo_list", "todo_update", "todo_delete", "todo_stats",
    // Persistent memory
    "memory_save", "memory_search", "memory_recall",
    "memory_forget", "memory_list", "memory_summary",
    // Skills
    "skill_inspect", "skill_rate",
    // Inter-agent initiation
    "initiate_contact", "request_help", "offer_assistance",
    "observe_agent", "escalate_to_chief",
    "respond_to_initiation", "check_initiation_inbox",
    // A2A communication
    "a2a_send_message", "a2a_check_inbox",
    "a2a_share_context", "a2a_query_context",
    // Team coordination
    "schedule_agent_task", "get_team_status",
    "share_progress", "get_team_progress",
    // Workflows (read-only)
    "workflow_plan", "workflow_status", "workflow_list",
    // Routine management
    "routine_create", "routine_list", "routine_update", "routine_toggle",
    // Task board
    "taskboard_create", "taskboard_update", "taskboard_list",
    "taskboard_delete", "taskboard_summary",
    // Self-improvement
    "reflect_on_performance", "benchmark_self",
    "learn_from_mistakes", "share_knowledge", "improve_strategy",
  ],

  // Creative Agent — Content Strategist: Docs, Design, Content
  creative: [
    // Docs (all)
    "docs_list", "docs_read", "docs_create", "docs_append",
    // Drive (light access)
    "drive_list", "drive_create_file",
    // Sheets (light access for content calendars)
    "sheets_read", "sheets_values", "sheets_append",
    // Design (all)
    "design_generate", "design_edit", "design_variants",
    // Vision
    "vision_analyze", "vision_download_analyze",
    // Content & presentation
    "create_pptx_presentation", "generate_chart",
    "create_pdf_report", "create_docx_document", "create_xlsx_spreadsheet",
    "llm_chat", "content_analyze",
    // Workspace
    "todo_create", "todo_list", "todo_update",
    "reminder_create", "reminder_list", "reminder_update",
    "reminder_delete", "reminder_complete",
    // Persistent memory
    "memory_save", "memory_search", "memory_recall",
    "memory_forget", "memory_list", "memory_summary",
    // Skills
    "skill_inspect", "skill_rate",
    // Inter-agent initiation
    "initiate_contact", "request_help", "offer_assistance",
    "observe_agent", "escalate_to_chief",
    "respond_to_initiation", "check_initiation_inbox",
    // A2A communication
    "a2a_send_message", "a2a_check_inbox",
    "a2a_share_context", "a2a_query_context",
    // Team coordination
    "schedule_agent_task", "get_team_status",
    "share_progress", "get_team_progress",
    // Workflows (read-only)
    "workflow_plan", "workflow_status", "workflow_list",
    // Routine management
    "routine_create", "routine_list", "routine_update", "routine_toggle",
    // Task board
    "taskboard_create", "taskboard_update", "taskboard_list",
    "taskboard_delete", "taskboard_summary",
    // Self-improvement
    "reflect_on_performance", "benchmark_self",
    "learn_from_mistakes", "share_knowledge", "improve_strategy",
  ],

  // Research Agent — Research Analyst: Deep Research, Web, Academic
  research: [
    // Advanced web
    "web_search_advanced",
    // Research tools (all)
    "research_deep", "research_synthesize",
    "research_save_brief", "research_save_data",
    // Vision (for document analysis)
    "vision_analyze", "vision_download_analyze",
    // Academic & content
    "academic_search", "content_analyze", "llm_chat",
    // Contacts (for research subjects)
    "contact_list", "contact_search",
    // Docs & Sheets (for research data)
    "docs_list", "docs_read", "docs_create", "docs_append",
    "sheets_read", "sheets_values", "sheets_append", "sheets_update",
    "sheets_create", "sheets_add_sheet", "sheets_batch_get", "sheets_clear",
    // Presentation
    "create_pptx_presentation", "create_pdf_report",
    "create_docx_document", "create_xlsx_spreadsheet",
    "generate_chart",
    // Workspace
    "todo_list",
    // Persistent memory
    "memory_save", "memory_search", "memory_recall",
    "memory_forget", "memory_list", "memory_summary",
    // Skills
    "skill_inspect", "skill_rate",
    // Inter-agent initiation
    "initiate_contact", "request_help", "offer_assistance",
    "observe_agent", "escalate_to_chief",
    "respond_to_initiation", "check_initiation_inbox",
    // A2A communication
    "a2a_send_message", "a2a_check_inbox",
    "a2a_share_context", "a2a_query_context",
    // Team coordination
    "schedule_agent_task", "get_team_status",
    "share_progress", "get_team_progress",
    // Workflows (read-only)
    "workflow_plan", "workflow_status", "workflow_list",
    // Routine management
    "routine_create", "routine_list", "routine_update", "routine_toggle",
    // Task board
    "taskboard_create", "taskboard_update", "taskboard_list",
    "taskboard_delete", "taskboard_summary",
    // Self-improvement
    "reflect_on_performance", "benchmark_self",
    "learn_from_mistakes", "share_knowledge", "improve_strategy",
  ],

  // Ops Agent — Operations Engineer: Monitoring, Deployment, GitHub Activity
  ops: [
    // Ops tools (all)
    "ops_health_check", "ops_deployment_status",
    "ops_github_activity", "ops_agent_stats",
    // Broadcasting for alerts
    "a2a_broadcast",
    // Reporting
    "generate_chart", "create_pdf_report", "create_xlsx_spreadsheet",
    // Workspace (light)
    "todo_stats", "reminder_list",
    // GitHub & Vercel (read-only for monitoring)
    "github_repo", "github_issues", "github_prs", "github_commits",
    "vercel_projects", "vercel_deployments", "vercel_logs",
    // Persistent memory
    "memory_save", "memory_search", "memory_recall",
    "memory_forget", "memory_list", "memory_summary",
    // Skills
    "skill_inspect", "skill_rate",
    // Inter-agent initiation
    "initiate_contact", "request_help", "offer_assistance",
    "observe_agent", "escalate_to_chief",
    "respond_to_initiation", "check_initiation_inbox",
    // A2A communication (ops gets broadcast for alerts)
    "a2a_send_message", "a2a_check_inbox",
    "a2a_share_context", "a2a_query_context",
    // Team coordination
    "schedule_agent_task", "get_team_status",
    "share_progress", "get_team_progress",
    // Workflows (read-only)
    "workflow_plan", "workflow_status", "workflow_list",
    // Routine management
    "routine_create", "routine_list", "routine_update", "routine_toggle",
    // Task board
    "taskboard_create", "taskboard_update", "taskboard_list",
    "taskboard_delete", "taskboard_summary",
    // Self-improvement
    "reflect_on_performance", "benchmark_self",
    "learn_from_mistakes", "share_knowledge", "improve_strategy",
  ],
};

// ---------------------------------------------------------------------------
// Tier 2 — Power (loaded ONLY for the general agent)
// ---------------------------------------------------------------------------
// These are advanced tools that only the chief orchestrator should use.
// Specialist agents can access these capabilities via query_agent routing.

export const TOOL_TIER_2: string[] = [
  // Agent delegation (synchronous)
  "delegate_to_agent",
  // A2A advanced
  "a2a_collaborate",
  // Advanced skill management
  "skill_create", "skill_equip", "skill_evaluate",
  "skill_evolve", "skill_rollback",
  "skill_search_hybrid", "skill_refresh_embeddings", "skill_embedding_setup",
  // Workflow execution & management
  "workflow_execute", "workflow_step_execute", "workflow_cancel",
  "workflow_schedule", "workflow_update_schedule",
  // Project management
  "project_create", "project_add_task", "project_status", "project_list",
  "project_update", "project_delete", "project_retry_task", "project_skip_task",
  "project_decompose_and_add", "project_health",
  // Cron sync
  "cron_sync",
  // Additional workspace tools only general uses
  "todo_delete", "todo_stats",
  "contact_create", "contact_update", "contact_delete",
];

// ---------------------------------------------------------------------------
// getTieredTools — returns the tool IDs for a given agent
// ---------------------------------------------------------------------------
// For specialist agents: Tier 0 + Tier 1[agentId] (deduplicated)
// For general agent: Tier 0 + all Tier 1 domain tools + Tier 2
// For unknown agents: Tier 0 only
// ---------------------------------------------------------------------------

export function getTieredTools(agentId: string): string[] {
  const toolSet = new Set<string>(TOOL_TIER_0);

  if (agentId === "general") {
    // General agent gets all domain tools + power tools
    for (const domainTools of Object.values(TOOL_TIER_1)) {
      for (const toolId of domainTools) {
        toolSet.add(toolId);
      }
    }
    for (const toolId of TOOL_TIER_2) {
      toolSet.add(toolId);
    }
  } else {
    // Specialist agents get their domain tools
    const domainTools = TOOL_TIER_1[agentId];
    if (domainTools) {
      for (const toolId of domainTools) {
        toolSet.add(toolId);
      }
    }
  }

  return Array.from(toolSet);
}
