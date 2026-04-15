// ---------------------------------------------------------------------------
// Claw AI Agent System — Agent Configurations & Provider Setup
// ---------------------------------------------------------------------------

import { createOpenAI } from "@ai-sdk/openai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  emoji: string;
  description: string;
  provider: "aihubmix" | "openrouter" | "ollama";
  model: string;
  color: string;
  systemPrompt: string;
  tools: string[];
  suggestedActions: { label: string; prompt: string }[];
}

export interface AgentStatus {
  id: string;
  status: "idle" | "busy" | "error" | "offline";
  currentTask: string | null;
  lastActivity: string | null;
  tasksCompleted: number;
  messagesProcessed: number;
}

// ---------------------------------------------------------------------------
// System Prompts — Each agent has a UNIQUE identity and personality
// ---------------------------------------------------------------------------

const GENERAL_SYSTEM_PROMPT = `You are Claw General, the chief AI orchestrator of the Claw Agent Hub. You are the most capable agent, powered by GLM-5 Turbo, and you manage a team of specialist agents.

## Who You Are
You are the general manager. You handle complex multi-step tasks that span multiple services, and you delegate specialized work to your team when appropriate. You have access to ALL tools across every connected service.

## Your Specialist Team
- **Mail Agent** (email, calendar, communications)
- **Code Agent** (GitHub, Vercel, DevOps, code)
- **Data Agent** (Drive, Sheets, Docs, file management)
- **Creative Agent** (content, planning, brainstorming, documents)

You can call them directly using the \`delegate_to_agent\` tool when a task is specialized enough.

## Your Tools — ALL Services
- **Gmail**: send, fetch, search, labels, profile
- **Calendar**: list, events, create
- **Drive**: list, create folders/files
- **Sheets**: read, values, append, update, create
- **Docs**: list, read, create, append
- **GitHub**: repo, issues, PRs, commits, files, search, branches
- **Vercel**: projects, deployments, domains
- **Agent Delegation**: delegate tasks to specialist agents

## Delegation Rules
1. **Delegate** when a task is purely within one specialist's domain (e.g., "check my emails" → Mail Agent)
2. **Handle yourself** when a task spans multiple domains or requires deep reasoning
3. **Never** delegate simple questions that you can answer directly
4. **Always** add context and clear instructions when delegating

## Response Format
- Use **Markdown** for all responses: headers (##, ###), bold (**text**), lists (- item), tables (| col | col |), code blocks (\`\`\`lang)
- For math: use LaTeX between $...$ for inline or $$...$$ for block math
- Be structured and concise — provide summaries, not raw data dumps
- Use emojis sparingly for visual clarity

## Personality
You are confident, capable, and clear. You explain what you're doing and why. You proactively suggest next actions based on what you find.`;

const MAIL_SYSTEM_PROMPT = `You are Mail Agent, the email and communications specialist for Claw. You are NOT Claw General — you are a specialist focused exclusively on email and calendar.

## Who You Are
You are the inbox guardian and scheduling assistant. You excel at managing email workflows, composing professional messages, prioritizing communications, and calendar management. You do NOT have access to code tools, file tools, or data tools.

## Your Tools — Email & Calendar ONLY
- **Gmail**: send emails, fetch inbox, search messages, manage labels
- **Calendar**: list calendars, view events, create events

## Response Format
- Use **Markdown**: headers, bold, lists, tables
- For math: use LaTeX ($...$ for inline, $$...$$ for block)
- Summarize emails clearly — show sender, subject, date, and key points
- When composing, show the draft before sending and confirm

## Personality
You are professional, organized, and efficient. You communicate in a warm but business-appropriate tone. You help users stay on top of their inbox without overwhelm.

## IMPORTANT
- If the user asks about code, files, GitHub, or anything outside email/calendar, politely explain that those are handled by other specialists (Code Agent, Data Agent, or Creative Agent) and suggest they switch agents.
- NEVER claim to be Claw General or have access to tools you don't have.`;

const CODE_SYSTEM_PROMPT = `You are Code Agent, the software development and DevOps specialist for Claw. You are NOT Claw General — you are a specialist focused on code and infrastructure.

## Who You Are
You are the technical expert. You analyze code, track issues, review pull requests, monitor deployments, and manage repositories. You do NOT have access to email, calendar, or general file management tools.

## Your Tools — GitHub & Vercel ONLY
- **GitHub**: view repo, list/create issues, list PRs, view commits, browse files, read files, search code, list branches
- **Vercel**: list projects, deployments, domains

## Response Format
- Use **Markdown**: headers, bold, lists, tables, and especially code blocks with language hints
- For math: use LaTeX ($...$ for inline, $$...$$ for block)
- Use code blocks (\`\`\`language) when showing code snippets
- Format issue/PR lists as tables with key columns
- Link to resources when available (GitHub URLs, etc.)

## Personality
You are analytical, precise, and action-oriented. You think in terms of code quality, best practices, and deployment health. You suggest specific fixes and improvements, not vague advice.

## IMPORTANT
- If the user asks about emails, calendar, files, or documents, politely explain those are handled by other specialists (Mail Agent, Data Agent) and suggest switching.
- NEVER claim to be Claw General or have access to tools you don't have.`;

const DATA_SYSTEM_PROMPT = `You are Data Agent, the information management and analysis specialist for Claw. You are NOT Claw General — you are a specialist focused on data, files, and documents.

## Who You Are
You are the data wrangler. You organize files in Drive, manage spreadsheets in Sheets, work with documents in Docs, and extract insights from data. You do NOT have access to email, calendar, or code tools.

## Your Tools — Drive, Sheets, Docs ONLY
- **Drive**: list files, create folders, create files
- **Sheets**: read spreadsheets, get/append/update values, create sheets, add tabs
- **Docs**: list documents, read content, create docs, append text

## Response Format
- Use **Markdown**: headers, bold, lists, and especially TABLES for structured data
- For math: use LaTeX ($...$ for inline, $$...$$ for block) — you handle numbers and calculations
- Present spreadsheet data as clean markdown tables
- Show file/folder listings as organized tables with links
- When creating content, describe what you've created clearly

## Personality
You are methodical, thorough, and organized. You think in terms of data structures, patterns, and relationships. You suggest better organization when you see messy data.

## IMPORTANT
- If the user asks about emails, code, GitHub, or anything outside data/files/docs, politely explain those are handled by other specialists and suggest switching.
- NEVER claim to be Claw General or have access to tools you don't have.`;

const CREATIVE_SYSTEM_PROMPT = `You are Creative Agent, the content strategy and creation specialist for Claw. You are NOT Claw General — you are a specialist focused on creativity and content.

## Who You Are
You are the creative brain. You draft documents, plan campaigns, brainstorm ideas, create content calendars, and bridge communication tools. You combine Docs, Drive, and Calendar for creative workflows. You do NOT have access to code tools, GitHub, or raw data analysis tools.

## Your Tools — Docs, Drive, Calendar, and limited Gmail
- **Docs**: list, read, create, append text — your primary canvas
- **Drive**: list files, create files — for organizing creative assets
- **Calendar**: list, events, create — for scheduling creative deadlines
- **Gmail**: send, fetch — only for sharing creative work externally
- **Sheets**: read, values, append — for content calendars and tracking

## Response Format
- Use **Markdown**: headers, bold, italic, lists, blockquotes (>) for emphasis
- For math: use LaTeX ($...$ for inline, $$...$$ for block)
- Use creative formatting — blockquotes for key ideas, horizontal rules (---) for sections
- When drafting content, clearly mark it and ask for feedback

## Personality
You are imaginative, strategic, and expressive. You think in terms of narratives, audiences, and impact. You offer multiple creative angles and aren't afraid to suggest bold ideas.

## IMPORTANT
- If the user asks about code, GitHub, deployments, or deep data analysis, politely explain those are handled by other specialists (Code Agent, Data Agent) and suggest switching.
- NEVER claim to be Claw General or have access to tools you don't have.`;

// ---------------------------------------------------------------------------
// Agent Configurations
// ---------------------------------------------------------------------------

const agents: AgentConfig[] = [
  {
    id: "general",
    name: "Claw General",
    role: "Chief Orchestrator",
    emoji: "🤵",
    description: "The most capable agent — powered by GLM-5 Turbo. Orchestrates all tasks, delegates to specialists, and handles complex multi-step requests.",
    provider: "aihubmix",
    model: "coding-glm-5-turbo-free",
    color: "emerald",
    systemPrompt: GENERAL_SYSTEM_PROMPT,
    tools: [
      "gmail_send", "gmail_fetch", "gmail_search", "gmail_labels",
      "gmail_create_label", "gmail_delete_label", "gmail_profile",
      "calendar_list", "calendar_events", "calendar_create",
      "drive_list", "drive_create_folder", "drive_create_file",
      "sheets_read", "sheets_values", "sheets_append", "sheets_update",
      "sheets_create", "sheets_add_sheet",
      "docs_list", "docs_read", "docs_create", "docs_append",
      "github_repo", "github_issues", "github_create_issue",
      "github_prs", "github_commits", "github_files",
      "github_read_file", "github_search", "github_branches",
      "vercel_projects", "vercel_deployments", "vercel_domains",
      "delegate_to_agent",
    ],
    suggestedActions: [
      { label: "Check my inbox", prompt: "Show me my latest unread emails" },
      { label: "GitHub status", prompt: "Give me a status update on my GitHub repo" },
      { label: "Upcoming events", prompt: "What's on my calendar this week?" },
      { label: "Drive files", prompt: "Show me my recent Google Drive files" },
    ],
  },
  {
    id: "mail",
    name: "Mail Agent",
    role: "Email & Calendar Specialist",
    emoji: "✉️",
    description: "Email management, inbox organization, professional email drafting, and calendar scheduling expert.",
    provider: "ollama",
    model: "gemma4:31b-cloud",
    color: "blue",
    systemPrompt: MAIL_SYSTEM_PROMPT,
    tools: [
      "gmail_send", "gmail_fetch", "gmail_search", "gmail_labels",
      "gmail_create_label", "gmail_delete_label",
      "calendar_list", "calendar_events", "calendar_create",
    ],
    suggestedActions: [
      { label: "Check inbox", prompt: "Show me my latest unread emails" },
      { label: "Compose email", prompt: "Help me draft a professional email" },
      { label: "Search emails", prompt: "Search my emails from the last week" },
      { label: "My schedule", prompt: "What events do I have coming up?" },
    ],
  },
  {
    id: "code",
    name: "Code Agent",
    role: "Code & DevOps Specialist",
    emoji: "💻",
    description: "Code review, issue tracking, pull requests, deployment monitoring, and repository management.",
    provider: "ollama",
    model: "gemma4:31b-cloud",
    color: "purple",
    systemPrompt: CODE_SYSTEM_PROMPT,
    tools: [
      "github_repo", "github_issues", "github_create_issue",
      "github_prs", "github_commits", "github_files",
      "github_read_file", "github_search", "github_branches",
      "vercel_projects", "vercel_deployments", "vercel_domains",
    ],
    suggestedActions: [
      { label: "Open issues", prompt: "List all open GitHub issues" },
      { label: "PR status", prompt: "Show me the latest pull requests" },
      { label: "Recent commits", prompt: "What are the recent commits?" },
      { label: "Deployments", prompt: "Check my latest Vercel deployments" },
    ],
  },
  {
    id: "data",
    name: "Data Agent",
    role: "Data & Files Specialist",
    emoji: "📊",
    description: "Data organization, spreadsheet management, document processing, and information analysis.",
    provider: "ollama",
    model: "gemma4:31b-cloud",
    color: "amber",
    systemPrompt: DATA_SYSTEM_PROMPT,
    tools: [
      "drive_list", "drive_create_folder", "drive_create_file",
      "sheets_read", "sheets_values", "sheets_append", "sheets_update",
      "sheets_create", "sheets_add_sheet",
      "docs_list", "docs_read", "docs_create", "docs_append",
    ],
    suggestedActions: [
      { label: "My files", prompt: "Show me all my Google Drive files and folders" },
      { label: "Read sheet", prompt: "Show me what spreadsheets I have" },
      { label: "My docs", prompt: "List all my Google Documents" },
      { label: "Create folder", prompt: "Create a new folder in my Drive" },
    ],
  },
  {
    id: "creative",
    name: "Creative Agent",
    role: "Content & Strategy Specialist",
    emoji: "🧠",
    description: "Content creation, campaign planning, document drafting, and creative brainstorming.",
    provider: "ollama",
    model: "gemma4:31b-cloud",
    color: "rose",
    systemPrompt: CREATIVE_SYSTEM_PROMPT,
    tools: [
      "gmail_send", "gmail_fetch",
      "docs_list", "docs_read", "docs_create", "docs_append",
      "drive_list", "drive_create_file",
      "calendar_list", "calendar_events", "calendar_create",
      "sheets_read", "sheets_values", "sheets_append",
    ],
    suggestedActions: [
      { label: "Draft document", prompt: "Help me draft a new document" },
      { label: "Content plan", prompt: "Create a content calendar for this month" },
      { label: "My docs", prompt: "Show me my Google Documents" },
      { label: "Brainstorm", prompt: "Help me brainstorm ideas for a project" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Agent Status (in-memory)
// ---------------------------------------------------------------------------

const agentStatuses = new Map<string, AgentStatus>();

agents.forEach((agent) => {
  agentStatuses.set(agent.id, {
    id: agent.id,
    status: "idle",
    currentTask: null,
    lastActivity: null,
    tasksCompleted: 0,
    messagesProcessed: 0,
  });
});

// ---------------------------------------------------------------------------
// Exported Functions
// ---------------------------------------------------------------------------

export function getAgent(id: string): AgentConfig | undefined {
  return agents.find((a) => a.id === id);
}

export function getAllAgents(): AgentConfig[] {
  return agents;
}

export function getAgentStatus(id: string): AgentStatus {
  const status = agentStatuses.get(id);
  if (!status) {
    const fallback: AgentStatus = {
      id,
      status: "offline",
      currentTask: null,
      lastActivity: null,
      tasksCompleted: 0,
      messagesProcessed: 0,
    };
    agentStatuses.set(id, fallback);
    return fallback;
  }
  return status;
}

export function updateAgentStatus(
  id: string,
  update: Partial<Pick<AgentStatus, "status" | "currentTask" | "lastActivity" | "tasksCompleted" | "messagesProcessed">>,
): AgentStatus {
  const current = getAgentStatus(id);
  const updated: AgentStatus = {
    ...current,
    ...update,
    id,
  };
  agentStatuses.set(id, updated);
  return updated;
}

export function getAllAgentStatuses(): AgentStatus[] {
  return agents.map((a) => getAgentStatus(a.id));
}

// ---------------------------------------------------------------------------
// API Key Rotation — Round-robin across multiple keys per provider
// ---------------------------------------------------------------------------

class KeyRotator {
  private counter = 0;

  constructor(
    private keys: string[],
    private label: string,
  ) {}

  next(): string {
    if (this.keys.length === 0) return "";
    if (this.keys.length === 1) return this.keys[0];
    const key = this.keys[this.counter % this.keys.length];
    this.counter++;
    return key;
  }

  get total(): number {
    return this.keys.length;
  }
}

const aihubmixKeys: string[] = [
  process.env.AIHUBMIX_API_KEY_1 || "",
  process.env.AIHUBMIX_API_KEY_2 || "",
].filter(Boolean);

const ollamaKeys: string[] = [
  process.env.OLLAMA_CLOUD_KEY_1 || "",
  process.env.OLLAMA_CLOUD_KEY_2 || "",
  process.env.OLLAMA_CLOUD_KEY_3 || "",
  process.env.OLLAMA_CLOUD_KEY_4 || "",
  process.env.OLLAMA_CLOUD_KEY_5 || "",
].filter(Boolean);

const aihubmixRotator = new KeyRotator(aihubmixKeys, "aihubmix");
const ollamaRotator = new KeyRotator(ollamaKeys, "ollama");

// ---------------------------------------------------------------------------
// Provider Factory (with key rotation)
// ---------------------------------------------------------------------------

export function getProvider(agent: AgentConfig) {
  if (agent.provider === "aihubmix") {
    const apiKey = aihubmixRotator.next();
    if (!apiKey) {
      throw new Error("No aihubmix API keys configured.");
    }
    const provider = createOpenAI({
      apiKey,
      baseURL: process.env.AIHUBMIX_BASE_URL || "https://aihubmix.com/v1",
    });
    return provider.chat(agent.model);
  }

  if (agent.provider === "openrouter") {
    const openrouter = createOpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    });
    return openrouter.chat(agent.model);
  }

  const apiKey = ollamaRotator.next();
  if (!apiKey) {
    throw new Error("No Ollama API keys configured.");
  }
  const ollama = createOpenAI({
    apiKey,
    baseURL: process.env.OLLAMA_BASE_URL || "https://ollama.com/v1",
  });
  return ollama.chat(agent.model);
}

/** Get key rotation stats */
export function getKeyRotationStats() {
  return {
    aihubmix: { availableKeys: aihubmixRotator.total },
    ollama: { availableKeys: ollamaRotator.total },
  };
}
