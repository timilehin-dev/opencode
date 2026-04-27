"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Wrench,
  MessageSquare,
  Activity,
  Zap,
  Settings,
  Cpu,
  BookOpen,
  Bot,
  Clock,
  Search,
  Check,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Pencil,
  ChevronDown,
  Eye,
  EyeOff,
  X,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/core/utils";

// Agent config data — self-contained, zero network dependency
import {
  AGENT_DEFINITIONS,
  AGENT_TOOL_LISTS,
  AGENT_SUGGESTED_ACTIONS,
} from "@/lib/agent/agent-config";
import type { AgentDefinition } from "@/lib/agent/agent-config";

import {
  loadAgentOverrides,
  resetAgentOverrides,
  updateAgentOverrides,
  getEffectiveTools,
  type AgentOverrides,
} from "@/lib/agent/agent-overrides";

// ---------------------------------------------------------------------------
// Build full agent config from static definitions (no API call needed)
// ---------------------------------------------------------------------------

interface AgentData {
  id: string;
  name: string;
  role: string;
  emoji: string;
  description: string;
  provider: string;
  model: string;
  color: string;
  tools: string[];
  suggestedActions: { label: string; prompt: string }[];
}

function getAgentData(id: string): AgentData | null {
  const def = AGENT_DEFINITIONS[id];
  if (!def) return null;
  return {
    ...def,
    tools: AGENT_TOOL_LISTS[id] ?? [],
    suggestedActions: AGENT_SUGGESTED_ACTIONS[id] ?? [],
  };
}

function getAllAgentIds(): string[] {
  return Object.keys(AGENT_DEFINITIONS);
}

// ---------------------------------------------------------------------------
// Tool metadata
// ---------------------------------------------------------------------------

const TOOL_META: Record<string, { label: string; category: string; description: string; icon: string }> = {
  gmail_send: { label: "Send Email", category: "Gmail", description: "Send an email via Gmail", icon: "\uD83D\uDCE7" },
  gmail_fetch: { label: "Fetch Emails", category: "Gmail", description: "Fetch emails from inbox with optional filters", icon: "\uD83D\uDCE7" },
  gmail_search: { label: "Search Emails", category: "Gmail", description: "Search Gmail messages using a query", icon: "\uD83D\uDCE7" },
  gmail_labels: { label: "List Labels", category: "Gmail", description: "List all Gmail labels", icon: "\uD83D\uDCE7" },
  gmail_create_label: { label: "Create Label", category: "Gmail", description: "Create a new Gmail label", icon: "\uD83D\uDCE7" },
  gmail_delete_label: { label: "Delete Label", category: "Gmail", description: "Delete a Gmail label", icon: "\uD83D\uDCE7" },
  gmail_profile: { label: "Gmail Profile", category: "Gmail", description: "Get current Gmail profile info", icon: "\uD83D\uDCE7" },
  gmail_reply: { label: "Reply Email", category: "Gmail", description: "Reply to an email thread", icon: "\uD83D\uDCE7" },
  gmail_thread: { label: "Read Thread", category: "Gmail", description: "Read full email thread content", icon: "\uD83D\uDCE7" },
  gmail_batch: { label: "Batch Fetch", category: "Gmail", description: "Fetch multiple emails in batch", icon: "\uD83D\uDCE7" },
  gmail_send_attachment: { label: "Send with Attachment", category: "Gmail", description: "Send email with file attachment", icon: "\uD83D\uDCE7" },
  calendar_list: { label: "List Calendars", category: "Calendar", description: "List all Google Calendars", icon: "\uD83D\uDCC5" },
  calendar_events: { label: "List Events", category: "Calendar", description: "List events from a calendar", icon: "\uD83D\uDCC5" },
  calendar_create: { label: "Create Event", category: "Calendar", description: "Create a calendar event with Meet link", icon: "\uD83D\uDCC5" },
  calendar_update: { label: "Update Event", category: "Calendar", description: "Update a calendar event", icon: "\uD83D\uDCC5" },
  calendar_delete: { label: "Delete Event", category: "Calendar", description: "Delete a calendar event", icon: "\uD83D\uDCC5" },
  calendar_freebusy: { label: "Check Availability", category: "Calendar", description: "Check calendar free/busy slots", icon: "\uD83D\uDCC5" },
  drive_list: { label: "List Files", category: "Drive", description: "List files and folders in Google Drive", icon: "\uD83D\uDCC1" },
  drive_create_folder: { label: "Create Folder", category: "Drive", description: "Create a new folder in Drive", icon: "\uD83D\uDCC1" },
  drive_create_file: { label: "Create File", category: "Drive", description: "Create a file (Doc/Sheet/Slides)", icon: "\uD83D\uDCC1" },
  download_drive_file: { label: "Download File", category: "Drive", description: "Download a file from Drive", icon: "\uD83D\uDCC1" },
  sheets_read: { label: "Read Sheet", category: "Sheets", description: "Read spreadsheet metadata", icon: "\uD83D\uDCCA" },
  sheets_values: { label: "Get Values", category: "Sheets", description: "Get cell values from a range", icon: "\uD83D\uDCCA" },
  sheets_append: { label: "Append Rows", category: "Sheets", description: "Append rows to a spreadsheet", icon: "\uD83D\uDCCA" },
  sheets_update: { label: "Update Cells", category: "Sheets", description: "Update cell values in a range", icon: "\uD83D\uDCCA" },
  sheets_create: { label: "Create Sheet", category: "Sheets", description: "Create a new spreadsheet", icon: "\uD83D\uDCCA" },
  sheets_add_sheet: { label: "Add Tab", category: "Sheets", description: "Add a new sheet tab", icon: "\uD83D\uDCCA" },
  sheets_batch_get: { label: "Batch Get", category: "Sheets", description: "Get multiple ranges at once", icon: "\uD83D\uDCCA" },
  sheets_clear: { label: "Clear Range", category: "Sheets", description: "Clear values from a range", icon: "\uD83D\uDCCA" },
  docs_list: { label: "List Docs", category: "Docs", description: "List all Google Docs", icon: "\uD83D\uDCC4" },
  docs_read: { label: "Read Doc", category: "Docs", description: "Read content of a Google Doc", icon: "\uD83D\uDCC4" },
  docs_create: { label: "Create Doc", category: "Docs", description: "Create a new Google Doc", icon: "\uD83D\uDCC4" },
  docs_append: { label: "Append Text", category: "Docs", description: "Append text to a Google Doc", icon: "\uD83D\uDCC4" },
  github_repo: { label: "Repo Info", category: "GitHub", description: "Get repository information", icon: "\uD83D\uDC19" },
  github_issues: { label: "List Issues", category: "GitHub", description: "List GitHub issues", icon: "\uD83D\uDC19" },
  github_create_issue: { label: "Create Issue", category: "GitHub", description: "Create a new issue", icon: "\uD83D\uDC19" },
  github_prs: { label: "List PRs", category: "GitHub", description: "List pull requests", icon: "\uD83D\uDC19" },
  github_commits: { label: "List Commits", category: "GitHub", description: "List recent commits", icon: "\uD83D\uDC19" },
  github_files: { label: "File Tree", category: "GitHub", description: "Get repository file tree", icon: "\uD83D\uDC19" },
  github_read_file: { label: "Read File", category: "GitHub", description: "Read file content from repo", icon: "\uD83D\uDC19" },
  github_search: { label: "Search Code", category: "GitHub", description: "Search code in repository", icon: "\uD83D\uDC19" },
  github_branches: { label: "List Branches", category: "GitHub", description: "List all branches", icon: "\uD83D\uDC19" },
  github_update_issue: { label: "Update Issue", category: "GitHub", description: "Update an existing issue", icon: "\uD83D\uDC19" },
  github_create_pr: { label: "Create PR", category: "GitHub", description: "Create a pull request", icon: "\uD83D\uDC19" },
  github_pr_review: { label: "Review PR", category: "GitHub", description: "Get PR details and review", icon: "\uD83D\uDC19" },
  github_pr_comment: { label: "Comment PR", category: "GitHub", description: "Comment on a pull request", icon: "\uD83D\uDC19" },
  github_create_branch: { label: "Create Branch", category: "GitHub", description: "Create a new branch", icon: "\uD83D\uDC19" },
  vercel_projects: { label: "List Projects", category: "Vercel", description: "List Vercel projects", icon: "\uD83D\uDE80" },
  vercel_deployments: { label: "Deployments", category: "Vercel", description: "List deployments for a project", icon: "\uD83D\uDE80" },
  vercel_domains: { label: "Domains", category: "Vercel", description: "List Vercel domains", icon: "\uD83D\uDE80" },
  vercel_deploy: { label: "Deploy", category: "Vercel", description: "Trigger a new deployment", icon: "\uD83D\uDE80" },
  vercel_logs: { label: "Deploy Logs", category: "Vercel", description: "Get deployment logs", icon: "\uD83D\uDE80" },
  web_search: { label: "Web Search", category: "Web", description: "Search the web for real-time info", icon: "\uD83C\uDF10" },
  web_search_advanced: { label: "Advanced Search", category: "Web", description: "Advanced web search with filters", icon: "\uD83C\uDF10" },
  web_reader: { label: "Read URL", category: "Web", description: "Read and extract content from a URL", icon: "\uD83C\uDF10" },
  delegate_to_agent: { label: "Delegate Task", category: "Agent", description: "Delegate a task to a specialist agent", icon: "\uD83E\uDD1D" },
  query_agent: { label: "Query Agent", category: "Agent", description: "Route tasks to other specialist agents", icon: "\uD83E\uDD1D" },
  vision_analyze: { label: "Analyze Image", category: "Vision", description: "Analyze an image with AI vision", icon: "\uD83D\uDC41" },
  vision_download_analyze: { label: "Download & Analyze", category: "Vision", description: "Download URL image then analyze", icon: "\uD83D\uDC41" },
  image_generate: { label: "Generate Image", category: "Image", description: "Generate images from text prompts", icon: "\uD83C\uDFA8" },
  tts_generate: { label: "Text to Speech", category: "Audio", description: "Convert text to natural speech", icon: "\uD83D\uDD0A" },
  asr_transcribe: { label: "Transcribe Audio", category: "Audio", description: "Transcribe audio to text", icon: "\uD83C\uDFA4" },
  video_generate: { label: "Generate Video", category: "Video", description: "Generate videos from text or images", icon: "\uD83C\uDFAC" },
  design_generate: { label: "Generate Design", category: "Design", description: "Generate UI designs via Stitch", icon: "\uD83C\uDFA8" },
  design_edit: { label: "Edit Design", category: "Design", description: "Edit an existing design", icon: "\uD83C\uDFA8" },
  design_variants: { label: "Design Variants", category: "Design", description: "Generate design variations", icon: "\uD83C\uDFA8" },
  data_calculate: { label: "Calculate", category: "Data", description: "Math, stats, data computations", icon: "\uD83D\uDCC8" },
  data_clean: { label: "Clean Data", category: "Data", description: "Clean and normalize data", icon: "\uD83D\uDCC8" },
  data_pivot: { label: "Pivot Data", category: "Data", description: "Pivot and aggregate data", icon: "\uD83D\uDCC8" },
  research_deep: { label: "Deep Research", category: "Research", description: "Multi-query parallel search", icon: "\uD83D\uDD0D" },
  research_synthesize: { label: "Synthesize", category: "Research", description: "Cross-reference and synthesize sources", icon: "\uD83D\uDD0D" },
  research_save_brief: { label: "Save Brief", category: "Research", description: "Save research as Google Doc brief", icon: "\uD83D\uDD0D" },
  research_save_data: { label: "Save Data", category: "Research", description: "Save research data to Sheets", icon: "\uD83D\uDD0D" },
  ops_health_check: { label: "Health Check", category: "Ops", description: "Check all service health statuses", icon: "\u26A1" },
  ops_deployment_status: { label: "Deploy Status", category: "Ops", description: "Get latest deployment information", icon: "\u26A1" },
  ops_github_activity: { label: "GitHub Activity", category: "Ops", description: "Monitor GitHub with anomaly detection", icon: "\u26A1" },
  ops_agent_stats: { label: "Agent Stats", category: "Ops", description: "Performance metrics for all agents", icon: "\u26A1" },
  code_execute: { label: "Run Code", category: "Code", description: "Execute code in sandbox (JS/Python/etc)", icon: "\uD83D\uDCBB" },
  weather_get: { label: "Weather", category: "Weather", description: "Get weather for any city", icon: "\uD83C\uDF24" },
  create_pdf_report: { label: "Create PDF", category: "Documents", description: "Generate professional PDF reports", icon: "\uD83D\uDCCD" },
  create_docx_document: { label: "Create DOCX", category: "Documents", description: "Create Word documents", icon: "\uD83D\uDCDD" },
  create_xlsx_spreadsheet: { label: "Create XLSX", category: "Documents", description: "Create Excel spreadsheets", icon: "\uD83D\uDCCA" },
  create_pptx_presentation: { label: "Create PPTX", category: "Documents", description: "Create PowerPoint presentations", icon: "\uD83D\uDCDC" },
  generate_chart: { label: "Generate Chart", category: "Documents", description: "Generate charts and diagrams", icon: "\uD83D\uDCC8" },
  llm_chat: { label: "LLM Chat", category: "AI", description: "Chat with an AI language model", icon: "\uD83E\uDD16" },
  finance_query: { label: "Finance Query", category: "Finance", description: "Query financial/market data", icon: "\uD83D\uDCB0" },
  academic_search: { label: "Academic Search", category: "Research", description: "Search academic papers", icon: "\uD83D\uDD0D" },
  content_analyze: { label: "Content Analyze", category: "AI", description: "Analyze content quality and SEO", icon: "\uD83D\uDCA1" },
};

const ALL_TOOL_IDS = Object.keys(TOOL_META);

const CATEGORY_ORDER = [
  "Gmail", "Calendar", "Drive", "Sheets", "Docs",
  "GitHub", "Vercel", "Web", "Agent",
  "Vision", "Image", "Audio", "Video", "Design",
  "Data", "Research", "Ops", "Documents",
  "Finance", "AI", "Code", "Weather",
  "Reminders", "Todos", "Contacts",
];

// ---------------------------------------------------------------------------
// Color map
// ---------------------------------------------------------------------------

const colorMap: Record<string, { bg: string; text: string; border: string; badge: string; ring: string }> = {
  emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600", border: "border-emerald-500/30", badge: "bg-emerald-500/20 text-emerald-600", ring: "ring-emerald-500/20" },
  blue: { bg: "bg-blue-500/10", text: "text-blue-600", border: "border-blue-500/30", badge: "bg-blue-500/20 text-blue-600", ring: "ring-blue-500/20" },
  purple: { bg: "bg-purple-500/10", text: "text-purple-600", border: "border-purple-500/30", badge: "bg-purple-500/20 text-purple-600", ring: "ring-purple-500/20" },
  amber: { bg: "bg-amber-500/10", text: "text-amber-600", border: "border-amber-500/30", badge: "bg-amber-500/20 text-amber-600", ring: "ring-amber-500/20" },
  rose: { bg: "bg-rose-500/10", text: "text-rose-600", border: "border-rose-500/30", badge: "bg-rose-500/20 text-rose-600", ring: "ring-rose-500/20" },
  teal: { bg: "bg-teal-500/10", text: "text-teal-600", border: "border-teal-500/30", badge: "bg-teal-500/20 text-teal-600", ring: "ring-teal-500/20" },
  orange: { bg: "bg-orange-500/10", text: "text-orange-600", border: "border-orange-500/30", badge: "bg-orange-500/20 text-orange-600", ring: "ring-orange-500/20" },
};

// ---------------------------------------------------------------------------
// Tab type
// ---------------------------------------------------------------------------

type Tab = "overview" | "tools" | "parameters";

// ---------------------------------------------------------------------------
// Agent Detail Page
// ---------------------------------------------------------------------------

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;

  // Build agent data locally — zero network dependency
  const agent = getAgentData(agentId);

  const [overrides, setOverrides] = useState<AgentOverrides>({});
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [stats, setStats] = useState({ tasksCompleted: 0, messagesProcessed: 0 });

  // Toast
  const [toast, setToast] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToastVisible(false);
      setTimeout(() => setToast(null), 200);
    }, 2500);
  }, []);

  // Load overrides from localStorage
  useEffect(() => {
    if (agent) setOverrides(loadAgentOverrides(agent.id));
  }, [agent]);

  // Optionally fetch live stats from API (non-blocking, graceful fallback)
  useEffect(() => {
    if (!agent) return;
    fetch("/api/agents")
      .then((r) => r.json())
      .then((json) => {
        if (json?.success && json?.data) {
          const a = json.data.find((d: { id: string; status?: { tasksCompleted?: number; messagesProcessed?: number } }) => d.id === agent.id);
          if (a?.status) {
            setStats({
              tasksCompleted: a.status.tasksCompleted || 0,
              messagesProcessed: a.status.messagesProcessed || 0,
            });
          }
        }
      })
      .catch(() => { /* stats are optional — page still works */ });
  }, [agent]);

  // Effective tools
  const effectiveTools = useMemo(() => {
    if (!agent) return [];
    return getEffectiveTools(agent.tools, overrides);
  }, [agent, overrides]);

  const disabledToolSet = useMemo(() => new Set(overrides.disabledTools || []), [overrides.disabledTools]);

  // Tool toggle
  const toggleTool = useCallback((toolId: string) => {
    if (!agent) return;
    const baseTools = new Set(agent.tools);
    const isBase = baseTools.has(toolId);
    const isDisabled = disabledToolSet.has(toolId);
    const isEnabledExtra = (overrides.enabledTools || []).includes(toolId);
    let newDisabled = [...(overrides.disabledTools || [])];
    let newEnabled = [...(overrides.enabledTools || [])];
    if (isBase && !isDisabled) newDisabled.push(toolId);
    else if (isBase && isDisabled) newDisabled = newDisabled.filter((t) => t !== toolId);
    else if (!isBase && !isEnabledExtra) newEnabled.push(toolId);
    else newEnabled = newEnabled.filter((t) => t !== toolId);
    const updated = updateAgentOverrides(agent.id, {
      ...overrides,
      disabledTools: newDisabled.length ? newDisabled : undefined,
      enabledTools: newEnabled.length ? newEnabled : undefined,
    });
    setOverrides(updated);
    showToast("Tools updated");
  }, [agent, overrides, disabledToolSet, showToast]);

  // Parameter change
  const updateParam = useCallback((key: keyof AgentOverrides, value: string | number | undefined) => {
    if (!agent) return;
    setOverrides(updateAgentOverrides(agent.id, { ...overrides, [key]: value }));
  }, [agent, overrides]);

  const resetAll = useCallback(() => {
    if (!agent) return;
    resetAgentOverrides(agent.id);
    setOverrides({});
    showToast("All overrides reset");
  }, [agent, showToast]);

  // ---- Not Found ----
  if (!agent) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        <div className="text-center py-16">
          <Bot className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-base font-semibold text-foreground mb-1">Agent not found</h3>
          <p className="text-sm text-muted-foreground mb-4">
            No agent with ID &quot;{agentId}&quot; exists. Valid agents: {getAllAgentIds().join(", ")}
          </p>
          <Link href="/agents">
            <Button variant="outline" className="gap-2"><ArrowLeft className="w-4 h-4" />Back to Agents</Button>
          </Link>
        </div>
      </div>
    );
  }

  const colors = colorMap[agent.color] || colorMap.emerald;
  const currentModel = overrides.model || agent.model;
  const currentTemp = overrides.temperature ?? 0.7;
  const currentMaxTokens = overrides.maxTokens ?? 262144;
  const hasAnyOverrides = Object.keys(overrides).some((k) => {
    const v = (overrides as Record<string, unknown>)[k];
    if (v === undefined || v === null) return false;
    if (Array.isArray(v) && v.length === 0) return false;
    if (typeof v === "string" && v === "") return false;
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 animate-fadeIn">
      {/* Toast */}
      <div className={cn("fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1a1a2e] text-white text-sm font-medium shadow-lg transition-all duration-200 pointer-events-none", toastVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5")}>
        <Check className="w-4 h-4 text-emerald-400" />
        {toast}
      </div>

      {/* Back */}
      <Link href="/agents" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Agents
      </Link>

      {/* Header Card */}
      <Card className="mb-6 animate-slideUp">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className={cn("w-16 h-16 rounded-xl flex items-center justify-center ring-2", colors.bg, colors.ring)}>
              <span className="text-3xl">{agent.emoji}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1 flex-wrap">
                <h1 className="text-xl font-bold text-foreground truncate">{overrides.name || agent.name}</h1>
                <Badge variant="outline" className={cn("text-[10px] font-mono flex-shrink-0", colors.badge)}>{agent.provider}</Badge>
                {hasAnyOverrides && <Badge variant="secondary" className="text-[9px] gap-1 flex-shrink-0"><Sparkles className="w-3 h-3" /> Customized</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">{overrides.role || agent.role}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5 font-mono truncate">{currentModel}</span>
                <span className="flex items-center gap-1"><Wrench className="w-3 h-3" />{new Set(effectiveTools).size} tools</span>
                <span className="flex items-center gap-1"><Activity className="w-3 h-3" />{stats.tasksCompleted} tasks</span>
                <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{stats.messagesProcessed} msgs</span>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:ml-auto flex-shrink-0">
              <Link href={`/chat?agent=${agent.id}`}>
                <Button variant="outline" size="sm" className={cn("gap-2 text-xs", colors.border, colors.text)}>
                  <MessageSquare className="w-3.5 h-3.5" /> Chat
                </Button>
              </Link>
              {hasAnyOverrides && (
                <Button variant="ghost" size="sm" className="gap-2 text-xs text-destructive hover:text-destructive" onClick={resetAll}>
                  <RotateCcw className="w-3.5 h-3.5" /> Reset
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1 scrollbar-none">
        {([
          { id: "overview" as Tab, label: "Overview", icon: <BookOpen className="w-3.5 h-3.5" /> },
          { id: "tools" as Tab, label: "Tools", icon: <Wrench className="w-3.5 h-3.5" /> },
          { id: "parameters" as Tab, label: "Parameters", icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap min-h-[40px]",
              activeTab === tab.id ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="transition-opacity duration-200" key={activeTab}>
        {activeTab === "overview" && (
          <OverviewTab agent={agent} colors={colors} effectiveTools={effectiveTools} onChat={() => {
            localStorage.setItem("klaw-selected-agent", agent.id);
            router.push("/chat?agent=" + agent.id);
          }} />
        )}
        {activeTab === "tools" && (
          <ToolsTab agent={agent} disabledToolSet={disabledToolSet} toggleTool={toggleTool} />
        )}
        {activeTab === "parameters" && (
          <ParametersTab agent={agent} currentModel={currentModel} currentTemp={currentTemp} currentMaxTokens={currentMaxTokens} onUpdate={updateParam} />
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// Overview Tab — Who is this agent, what can they do, quick actions
// ===========================================================================

function OverviewTab({ agent, colors, effectiveTools, onChat }: {
  agent: AgentData;
  colors: { bg: string; text: string; border: string; badge: string; ring: string };
  effectiveTools: string[];
  onChat: () => void;
}) {
  const categorized = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const tool of effectiveTools) {
      const meta = TOOL_META[tool];
      const cat = meta?.category || tool.split("_")[0];
      if (!map[cat]) map[cat] = [];
      map[cat].push(tool);
    }
    return map;
  }, [effectiveTools]);

  const categories = useMemo(() =>
    Object.keys(categorized).sort((a, b) => (CATEGORY_ORDER.indexOf(a) ?? 99) - (CATEGORY_ORDER.indexOf(b) ?? 99)),
    [categorized]
  );

  return (
    <div className="space-y-6">
      {/* About */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-muted-foreground" /> About
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-foreground leading-relaxed">{agent.description}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Badge variant="outline" className="text-[10px]">{agent.provider}</Badge>
            <Badge variant="outline" className="text-[10px] font-mono">{agent.model}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Active Tools", value: new Set(effectiveTools).size, icon: <Wrench className="w-4 h-4" /> },
          { label: "Tool Categories", value: categories.length, icon: <Cpu className="w-4 h-4" /> },
          { label: "Quick Actions", value: agent.suggestedActions.length, icon: <Zap className="w-4 h-4" /> },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              {s.icon}
              <span className="text-[10px] font-medium uppercase tracking-wider">{s.label}</span>
            </div>
            <p className={cn("text-lg font-bold", colors.text)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tool Categories */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <Wrench className="w-4 h-4 text-muted-foreground" /> Capabilities
          </CardTitle>
          <CardDescription>{new Set(effectiveTools).size} tools across {categories.length} categories</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {categories.map((cat) => {
            const tools = categorized[cat];
            return (
              <div key={cat}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{TOOL_META[tools[0]]?.icon || "\uD83D\uDD27"}</span>
                    <h4 className="text-sm font-semibold text-foreground">{cat}</h4>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">{tools.length}</Badge>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tools.map((tool) => (
                    <span key={tool} className="inline-flex items-center px-2 py-1 rounded-md bg-secondary border border-border text-[11px] font-mono text-muted-foreground hover:border-primary/30 transition-colors cursor-default" title={TOOL_META[tool]?.description || tool}>
                      {TOOL_META[tool]?.label || tool}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <Zap className="w-4 h-4 text-muted-foreground" /> Quick Actions
          </CardTitle>
          <CardDescription>One-click prompts tailored for {agent.name}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {agent.suggestedActions.map((action) => (
              <button key={action.label} onClick={onChat} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-border bg-card hover:bg-card hover:border-primary/20 text-left transition-all duration-200 group">
                <Settings className="w-3.5 h-3.5 text-muted-foreground group-hover:text-[#3730a3] transition-colors" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground truncate">{action.label}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{action.prompt}</p>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ===========================================================================
// Tools Tab
// ===========================================================================

function ToolsTab({ agent, disabledToolSet, toggleTool }: {
  agent: AgentData;
  disabledToolSet: Set<string>;
  toggleTool: (toolId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const baseToolSet = useMemo(() => new Set(agent.tools), [agent.tools]);

  const groupedTools = useMemo(() => {
    const q = search.toLowerCase();
    const map: Record<string, string[]> = {};
    for (const id of ALL_TOOL_IDS) {
      const m = TOOL_META[id];
      if (!m) continue;
      if (q && !id.toLowerCase().includes(q) && !m.label.toLowerCase().includes(q) && !m.category.toLowerCase().includes(q) && !m.description.toLowerCase().includes(q)) continue;
      if (!map[m.category]) map[m.category] = [];
      map[m.category].push(id);
    }
    return map;
  }, [search]);

  const sortedCategories = useMemo(() =>
    Object.keys(groupedTools).sort((a, b) => (CATEGORY_ORDER.indexOf(a) ?? 99) - (CATEGORY_ORDER.indexOf(b) ?? 99)),
    [groupedTools]
  );

  const toggleCat = (cat: string) => setExpandedCats((prev) => { const n = new Set(prev); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; });

  const activeCount = agent.tools.filter((t) => !disabledToolSet.has(t)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="text-sm font-medium text-foreground">{activeCount} of {agent.tools.length} tools active</div>
          <div className="w-32 h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${(activeCount / agent.tools.length) * 100}%` }} />
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input type="text" placeholder="Search tools..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full sm:w-56 pl-9 pr-8 py-2 rounded-lg border border-border bg-card text-xs focus:outline-none focus:border-ring/40 focus:ring-1 focus:ring-ring/20 transition-all" />
          {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" /></button>}
        </div>
      </div>

      <div className="space-y-2">
        {sortedCategories.map((cat) => {
          const tools = groupedTools[cat];
          const isExpanded = !search || expandedCats.has(cat);
          return (
            <Card key={cat}>
              <button onClick={() => toggleCat(cat)} className="w-full flex items-center justify-between p-4 text-left">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{TOOL_META[tools[0]]?.icon || "\uD83D\uDD27"}</span>
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">{cat}</h4>
                    <p className="text-[10px] text-muted-foreground">{tools.filter((t) => baseToolSet.has(t) && !disabledToolSet.has(t)).length} of {tools.length} active</p>
                  </div>
                </div>
                <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200", isExpanded && "rotate-180")} />
              </button>
              {isExpanded && (
                <div className="px-4 pb-4 space-y-1">
                  {tools.map((toolId) => {
                    const meta = TOOL_META[toolId];
                    const isActive = baseToolSet.has(toolId) && !disabledToolSet.has(toolId);
                    return (
                      <div key={toolId} className={cn("flex items-center justify-between px-3 py-2.5 rounded-lg transition-all duration-150", isActive ? "bg-card border border-border" : "bg-muted/30 border border-transparent opacity-50")}>
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <button onClick={() => toggleTool(toolId)} className={cn("w-8 h-[18px] rounded-full transition-all duration-200 flex-shrink-0 relative", isActive ? "bg-primary" : "bg-[#d1d1d1]")}>
                            <span className={cn("absolute top-[2px] w-[14px] h-[14px] bg-card rounded-full shadow-sm transition-all duration-200", isActive ? "left-[15px]" : "left-[2px]")} />
                          </button>
                          <div className="min-w-0 flex-1">
                            <span className="text-xs font-medium text-foreground">{meta?.label || toolId}</span>
                            <p className="text-[10px] text-muted-foreground truncate">{meta?.description || ""}</p>
                          </div>
                        </div>
                        <span className="text-[9px] font-mono text-muted-foreground/60 flex-shrink-0 ml-2 hidden sm:block">{toolId}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ===========================================================================
// Parameters Tab
// ===========================================================================

function ParametersTab({ agent, currentModel, currentTemp, currentMaxTokens, onUpdate }: {
  agent: AgentData;
  currentModel: string;
  currentTemp: number;
  currentMaxTokens: number;
  onUpdate: (key: keyof AgentOverrides, value: string | number | undefined) => void;
}) {
  const [showModelInput, setShowModelInput] = useState(false);
  const [tempValue, setTempValue] = useState(currentTemp);
  const [tokenValue, setTokenValue] = useState(currentMaxTokens);

  useEffect(() => { setTempValue(currentTemp); setTokenValue(currentMaxTokens); }, [currentTemp, currentMaxTokens]);

  return (
    <div className="space-y-6">
      {/* Model */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2"><Cpu className="w-4 h-4 text-muted-foreground" /> Model</CardTitle>
            <Button variant="ghost" size="sm" className="text-[10px] gap-1" onClick={() => setShowModelInput(!showModelInput)}>
              <Pencil className="w-3 h-3" /> {showModelInput ? "Close" : "Change"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-sm font-mono font-medium text-foreground">{currentModel}</span>
            {currentModel !== agent.model && <Badge variant="secondary" className="text-[8px] px-1 py-0">custom</Badge>}
          </div>
          <p className="text-[10px] text-muted-foreground">Default: {agent.model}</p>
          {showModelInput && (
            <div className="mt-3 flex gap-2">
              <input type="text" defaultValue={currentModel} placeholder="e.g. gpt-4o, claude-3.5-sonnet..."
                className="flex-1 px-3 py-2 rounded-lg border border-border bg-card text-xs font-mono focus:outline-none focus:border-ring/40 focus:ring-1 focus:ring-ring/20"
                onKeyDown={(e) => { if (e.key === "Enter") { const v = (e.target as HTMLInputElement).value.trim(); onUpdate("model", v || undefined); setShowModelInput(false); } }}
              />
              <Button size="sm" className="text-xs" onClick={() => setShowModelInput(false)}>Cancel</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Temperature */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2"><SlidersHorizontal className="w-4 h-4 text-muted-foreground" /> Temperature</CardTitle>
          <CardDescription>Controls randomness. Lower = focused, Higher = creative.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <input type="range" min="0" max="2" step="0.1" value={tempValue} onChange={(e) => { const v = parseFloat(e.target.value); setTempValue(v); onUpdate("temperature", v); }}
              className="flex-1 h-2 bg-muted rounded-full appearance-none cursor-pointer accent-primary" />
            <span className="text-sm font-mono font-medium text-foreground w-8 text-right">{tempValue.toFixed(1)}</span>
          </div>
          <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
            <span>Precise</span><span>Default: 0.7</span><span>Creative</span>
          </div>
          {tempValue !== 0.7 && (
            <button className="mt-2 text-[10px] font-medium text-primary hover:text-primary/80 transition-colors" onClick={() => { setTempValue(0.7); onUpdate("temperature", undefined); }}>Reset to default</button>
          )}
        </CardContent>
      </Card>

      {/* Max Tokens */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground">Max Tokens</CardTitle>
          <CardDescription>Maximum number of tokens in the model response.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <input type="number" value={tokenValue} onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v > 0) { setTokenValue(v); onUpdate("maxTokens", v); } }}
              className="w-32 px-3 py-2 rounded-lg border border-border bg-card text-xs font-mono focus:outline-none focus:border-ring/40 focus:ring-1 focus:ring-ring/20" />
            <span className="text-[10px] text-muted-foreground">tokens</span>
            {tokenValue !== 262144 && (
              <button className="text-[10px] font-medium text-primary hover:text-primary/80 transition-colors" onClick={() => { setTokenValue(262144); onUpdate("maxTokens", undefined); }}>Reset</button>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Default: 262,144</p>
        </CardContent>
      </Card>
    </div>
  );
}
