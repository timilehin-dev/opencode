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
import { cn } from "@/lib/utils";

import {
  loadAgentOverrides,
  saveAgentOverrides,
  resetAgentOverrides,
  updateAgentOverrides,
  getEffectiveTools,
  type AgentOverrides,
} from "@/lib/agent-overrides";

// ---------------------------------------------------------------------------
// Types (mirrors AgentConfig from @/lib/agents — avoids importing server deps)
// ---------------------------------------------------------------------------

interface AgentConfig {
  id: string;
  name: string;
  role: string;
  emoji: string;
  description: string;
  provider: string;
  model: string;
  color: string;
  systemPrompt: string;
  tools: string[];
  suggestedActions: { label: string; prompt: string }[];
}

interface AgentStatus {
  id: string;
  status: string;
  currentTask: string | null;
  lastActivity: string | null;
  tasksCompleted: number;
  messagesProcessed: number;
}

// ---------------------------------------------------------------------------
// Tool metadata — all available tools with descriptions
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
  calendar_list: { label: "List Calendars", category: "Calendar", description: "List all Google Calendars", icon: "\uD83D\uDCC5" },
  calendar_events: { label: "List Events", category: "Calendar", description: "List events from a calendar", icon: "\uD83D\uDCC5" },
  calendar_create: { label: "Create Event", category: "Calendar", description: "Create a calendar event with Meet link", icon: "\uD83D\uDCC5" },
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
  create_pdf_report: { label: "Create PDF", category: "Files", description: "Generate professional PDF reports", icon: "\uD83D\uDCCD" },
  create_docx_document: { label: "Create DOCX", category: "Files", description: "Create Word documents", icon: "\uD83D\uDCDD" },
  reminder_create: { label: "Create Reminder", category: "Reminders", description: "Create a new reminder", icon: "\u23F0" },
  reminder_list: { label: "List Reminders", category: "Reminders", description: "List all reminders", icon: "\u23F0" },
  reminder_update: { label: "Update Reminder", category: "Reminders", description: "Update an existing reminder", icon: "\u23F0" },
  reminder_delete: { label: "Delete Reminder", category: "Reminders", description: "Delete a reminder", icon: "\u23F0" },
  reminder_complete: { label: "Complete Reminder", category: "Reminders", description: "Mark a reminder as complete", icon: "\u23F0" },
  todo_create: { label: "Create Todo", category: "Todos", description: "Create a new todo item", icon: "\u2705" },
  todo_list: { label: "List Todos", category: "Todos", description: "List all todos", icon: "\u2705" },
  todo_update: { label: "Update Todo", category: "Todos", description: "Update a todo item", icon: "\u2705" },
  todo_delete: { label: "Delete Todo", category: "Todos", description: "Delete a todo item", icon: "\u2705" },
  todo_stats: { label: "Todo Stats", category: "Todos", description: "Get todo statistics", icon: "\u2705" },
  contact_create: { label: "Create Contact", category: "Contacts", description: "Create a new contact", icon: "\uD83D\uDC64" },
  contact_list: { label: "List Contacts", category: "Contacts", description: "List all contacts", icon: "\uD83D\uDC64" },
  contact_search: { label: "Search Contacts", category: "Contacts", description: "Search contacts by name/email", icon: "\uD83D\uDC64" },
  contact_update: { label: "Update Contact", category: "Contacts", description: "Update a contact", icon: "\uD83D\uDC64" },
  contact_delete: { label: "Delete Contact", category: "Contacts", description: "Delete a contact", icon: "\uD83D\uDC64" },
  code_execute: { label: "Run Code", category: "Code", description: "Execute code in sandbox (JS/Python/etc)", icon: "\uD83D\uDCBB" },
  weather_get: { label: "Weather", category: "Weather", description: "Get weather for any city", icon: "\uD83C\uDF24" },
};

const ALL_TOOL_IDS = Object.keys(TOOL_META);

// ---------------------------------------------------------------------------
// Category sort order
// ---------------------------------------------------------------------------

const CATEGORY_ORDER = [
  "Gmail", "Calendar", "Drive", "Sheets", "Docs",
  "GitHub", "Vercel", "Web", "Agent",
  "Vision", "Image", "Audio", "Video", "Design",
  "Data", "Research", "Ops", "Files",
  "Reminders", "Todos", "Contacts",
  "Code", "Weather",
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

type Tab = "overview" | "tools" | "prompt" | "parameters";

// ---------------------------------------------------------------------------
// Agent Detail Page
// ---------------------------------------------------------------------------

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [agent, setAgent] = useState<AgentConfig | null>(null);
  const [overrides, setOverrides] = useState<AgentOverrides>({});
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [stats, setStats] = useState({ tasksCompleted: 0, messagesProcessed: 0 });
  const [loading, setLoading] = useState(true);

  // Toast state
  const [toast, setToast] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToastVisible(false);
      setTimeout(() => setToast(null), 200); // let CSS transition finish
    }, 2500);
  }, []);

  // Load agent config + overrides from API
  useEffect(() => {
    const id = params.id as string;

    fetch("/api/agents")
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data) {
          const found = json.data.find((d: AgentConfig & { status?: AgentStatus }) => d.id === id);
          if (found) {
            const { status, ...config } = found;
            setAgent(config as AgentConfig);
            if (status) {
              setStats({
                tasksCompleted: status.tasksCompleted || 0,
                messagesProcessed: status.messagesProcessed || 0,
              });
            }
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [params.id]);

  // Load overrides from localStorage after agent is known
  useEffect(() => {
    if (agent) {
      setOverrides(loadAgentOverrides(agent.id));
    }
  }, [agent]);

  // Effective tools calculation
  const effectiveTools = useMemo(() => {
    if (!agent) return [];
    return getEffectiveTools(agent.tools, overrides);
  }, [agent, overrides]);

  const disabledToolSet = useMemo(() => {
    return new Set(overrides.disabledTools || []);
  }, [overrides.disabledTools]);

  // Tool toggle handler
  const toggleTool = useCallback((toolId: string) => {
    if (!agent) return;
    const baseTools = new Set(agent.tools);
    const isBase = baseTools.has(toolId);
    const isDisabled = disabledToolSet.has(toolId);
    const isEnabledExtra = (overrides.enabledTools || []).includes(toolId);

    let newDisabled = [...(overrides.disabledTools || [])];
    let newEnabled = [...(overrides.enabledTools || [])];

    if (isBase && !isDisabled) {
      newDisabled.push(toolId);
    } else if (isBase && isDisabled) {
      newDisabled = newDisabled.filter((t) => t !== toolId);
    } else if (!isBase && !isEnabledExtra) {
      newEnabled.push(toolId);
    } else {
      newEnabled = newEnabled.filter((t) => t !== toolId);
    }

    const updated = updateAgentOverrides(agent.id, {
      ...overrides,
      disabledTools: newDisabled.length ? newDisabled : undefined,
      enabledTools: newEnabled.length ? newEnabled : undefined,
    });
    setOverrides(updated);
    showToast("Tools updated");
  }, [agent, overrides, disabledToolSet, showToast]);

  // Prompt save handler
  const savePrompt = useCallback((value: string) => {
    if (!agent) return;
    const updated = updateAgentOverrides(agent.id, {
      ...overrides,
      customSystemPrompt: value || undefined,
    });
    setOverrides(updated);
    showToast("System prompt saved");
  }, [agent, overrides, showToast]);

  const resetPrompt = useCallback(() => {
    if (!agent) return;
    const updated = updateAgentOverrides(agent.id, {
      ...overrides,
      customSystemPrompt: undefined,
    });
    setOverrides(updated);
    showToast("Prompt reset to default");
  }, [agent, overrides, showToast]);

  // Parameter change handlers
  const updateParam = useCallback((key: keyof AgentOverrides, value: string | number | undefined) => {
    if (!agent) return;
    const updated = updateAgentOverrides(agent.id, { ...overrides, [key]: value });
    setOverrides(updated);
  }, [agent, overrides]);

  const resetAll = useCallback(() => {
    if (!agent) return;
    resetAgentOverrides(agent.id);
    setOverrides({});
    showToast("All overrides reset");
  }, [agent, showToast]);

  // ---- Loading ----

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ---- Not Found ----

  if (!agent) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        <div className="text-center py-16">
          <Bot className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-base font-semibold text-foreground mb-1">Agent not found</h3>
          <p className="text-sm text-muted-foreground mb-4">No agent with ID &quot;{params.id}&quot; exists.</p>
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
  const currentPrompt = overrides.customSystemPrompt || agent.systemPrompt;
  const hasCustomPrompt = !!overrides.customSystemPrompt;
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
      <div
        className={cn(
          "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1a1a2e] text-white text-sm font-medium shadow-lg transition-all duration-200 pointer-events-none",
          toastVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"
        )}
      >
        <Check className="w-4 h-4 text-emerald-400" />
        {toast}
      </div>

      {/* Back button */}
      <Link href="/agents" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to Agents
      </Link>

      {/* Agent Header */}
      <div className="animate-slideUp">
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className={cn("w-16 h-16 rounded-xl flex items-center justify-center ring-2", colors.bg, colors.ring)}>
                <span className="text-3xl">{agent.emoji}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-xl font-bold text-foreground truncate">
                    {overrides.name || agent.name}
                  </h1>
                  <Badge variant="outline" className={cn("text-[10px] font-mono flex-shrink-0", colors.badge)}>
                    {agent.provider}
                  </Badge>
                  {hasAnyOverrides && (
                    <Badge variant="secondary" className="text-[9px] gap-1 flex-shrink-0">
                      <Sparkles className="w-3 h-3" /> Customized
                    </Badge>
                  )}
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
                    <MessageSquare className="w-3.5 h-3.5" />
                    Chat
                  </Button>
                </Link>
                {hasAnyOverrides && (
                  <Button variant="ghost" size="sm" className="gap-2 text-xs text-destructive hover:text-destructive" onClick={resetAll}>
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1 scrollbar-none">
        {([
          { id: "overview" as Tab, label: "Overview", icon: <BookOpen className="w-3.5 h-3.5" /> },
          { id: "tools" as Tab, label: "Tools", icon: <Wrench className="w-3.5 h-3.5" /> },
          { id: "prompt" as Tab, label: "Prompt", icon: <Cpu className="w-3.5 h-3.5" /> },
          { id: "parameters" as Tab, label: "Parameters", icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap min-h-[40px]",
              activeTab === tab.id
                ? "bg-primary text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.id === "tools" && (overrides.disabledTools?.length || overrides.enabledTools?.length) ? (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            ) : null}
            {tab.id === "prompt" && hasCustomPrompt ? (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            ) : null}
            {tab.id === "parameters" && (overrides.model || overrides.temperature !== undefined || overrides.maxTokens !== undefined) ? (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            ) : null}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="transition-opacity duration-200" key={activeTab}>
        {activeTab === "overview" && (
          <OverviewTab agent={agent} colors={colors} stats={stats} effectiveTools={effectiveTools} onChat={() => {
            localStorage.setItem("klaw-selected-agent", agent.id);
            router.push("/chat?agent=" + agent.id);
          }} />
        )}
        {activeTab === "tools" && (
          <ToolsTab
            agent={agent}
            disabledToolSet={disabledToolSet}
            enabledExtraTools={new Set(overrides.enabledTools || [])}
            toggleTool={toggleTool}
          />
        )}
        {activeTab === "prompt" && (
          <PromptTab
            agent={agent}
            currentPrompt={currentPrompt}
            isCustom={hasCustomPrompt}
            onSave={savePrompt}
            onReset={resetPrompt}
          />
        )}
        {activeTab === "parameters" && (
          <ParametersTab
            agent={agent}
            currentModel={currentModel}
            currentTemp={currentTemp}
            currentMaxTokens={currentMaxTokens}
            onUpdate={updateParam}
          />
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// Overview Tab
// ===========================================================================

function OverviewTab({
  agent,
  colors,
  stats,
  effectiveTools,
  onChat,
}: {
  agent: AgentConfig;
  colors: { bg: string; text: string; border: string; badge: string; ring: string };
  stats: { tasksCompleted: number; messagesProcessed: number };
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

  const categories = useMemo(() => {
    return Object.keys(categorized).sort(
      (a, b) => (CATEGORY_ORDER.indexOf(a) ?? 99) - (CATEGORY_ORDER.indexOf(b) ?? 99)
    );
  }, [categorized]);

  return (
    <div className="space-y-6">
      {/* About */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-muted-foreground" />
            About
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-foreground leading-relaxed">{agent.description}</p>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Tasks Completed", value: stats.tasksCompleted, icon: <Activity className="w-4 h-4" /> },
          { label: "Messages", value: stats.messagesProcessed, icon: <MessageSquare className="w-4 h-4" /> },
          { label: "Active Tools", value: new Set(effectiveTools).size, icon: <Wrench className="w-4 h-4" /> },
          { label: "Provider", value: agent.provider, icon: <Cpu className="w-4 h-4" /> },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              {s.icon}
              <span className="text-[10px] font-medium uppercase tracking-wider">{s.label}</span>
            </div>
            <p className={cn("text-lg font-bold", colors.text)}>
              {typeof s.value === "number" ? s.value.toLocaleString() : s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Tool Categories Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <Wrench className="w-4 h-4 text-muted-foreground" />
            Active Tools
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
                    <span
                      key={tool}
                      className="inline-flex items-center px-2 py-1 rounded-md bg-secondary border border-border text-[11px] font-mono text-muted-foreground hover:border-primary/30 transition-colors cursor-default"
                      title={TOOL_META[tool]?.description || tool}
                    >
                      {TOOL_META[tool]?.label || tool}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Suggested Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <Zap className="w-4 h-4 text-muted-foreground" />
            Suggested Actions
          </CardTitle>
          <CardDescription>Quick prompts tailored for this agent</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {agent.suggestedActions?.map((action) => (
              <button
                key={action.label}
                onClick={onChat}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-border bg-card hover:bg-card hover:border-primary/20 text-left transition-all duration-200 group"
              >
                <Settings className="w-3.5 h-3.5 text-muted-foreground group-hover:text-[#3730a3] transition-colors" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground truncate">{action.label}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{action.prompt}</p>
                </div>
                <Clock className="w-3 h-3 text-muted-foreground flex-shrink-0" />
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

function ToolsTab({
  agent,
  disabledToolSet,
  enabledExtraTools,
  toggleTool,
}: {
  agent: AgentConfig;
  disabledToolSet: Set<string>;
  enabledExtraTools: Set<string>;
  toggleTool: (toolId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  const baseToolSet = useMemo(() => new Set(agent.tools), [agent.tools]);

  // Group all tools by category
  const groupedTools = useMemo(() => {
    const searchLower = search.toLowerCase();
    const map: Record<string, typeof ALL_TOOL_IDS> = {};

    for (const toolId of ALL_TOOL_IDS) {
      const meta = TOOL_META[toolId];
      if (!meta) continue;
      if (searchLower) {
        const matchesSearch =
          toolId.toLowerCase().includes(searchLower) ||
          meta.label.toLowerCase().includes(searchLower) ||
          meta.category.toLowerCase().includes(searchLower) ||
          meta.description.toLowerCase().includes(searchLower);
        if (!matchesSearch) continue;
      }
      if (!map[meta.category]) map[meta.category] = [];
      map[meta.category].push(toolId);
    }
    return map;
  }, [search]);

  const sortedCategories = useMemo(() => {
    return Object.keys(groupedTools).sort(
      (a, b) => (CATEGORY_ORDER.indexOf(a) ?? 99) - (CATEGORY_ORDER.indexOf(b) ?? 99)
    );
  }, [groupedTools]);

  const toggleCategory = (cat: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const toggleAllInCategory = (cat: string) => {
    const tools = groupedTools[cat];
    const allEnabled = tools.every((t) => baseToolSet.has(t) && !disabledToolSet.has(t));
    for (const t of tools) {
      if (allEnabled) {
        if (baseToolSet.has(t) && !disabledToolSet.has(t)) toggleTool(t);
      } else {
        if (disabledToolSet.has(t) || !baseToolSet.has(t)) toggleTool(t);
      }
    }
  };

  // Stats
  const totalAvailable = ALL_TOOL_IDS.length;
  const activeCount = ALL_TOOL_IDS.filter(
    (t) => (baseToolSet.has(t) && !disabledToolSet.has(t)) || enabledExtraTools.has(t)
  ).length;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="text-sm font-medium text-foreground">{activeCount} of {totalAvailable} tools active</div>
          <div className="w-32 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${(activeCount / totalAvailable) * 100}%` }}
            />
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search tools..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-56 pl-9 pr-8 py-2 rounded-lg border border-border bg-card text-xs focus:outline-none focus:border-ring/40 focus:ring-1 focus:ring-ring/20 transition-all"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Tool Categories */}
      <div className="space-y-2">
        {sortedCategories.map((cat) => {
          const tools = groupedTools[cat];
          const isExpanded = !search || expandedCats.has(cat);
          const allEnabled = tools.every((t) => baseToolSet.has(t) && !disabledToolSet.has(t));

          return (
            <Card key={cat}>
              <button
                onClick={() => toggleCategory(cat)}
                className="w-full flex items-center justify-between p-4 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{TOOL_META[tools[0]]?.icon || "\uD83D\uDD27"}</span>
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">{cat}</h4>
                    <p className="text-[10px] text-muted-foreground">
                      {tools.filter((t) => (baseToolSet.has(t) && !disabledToolSet.has(t)) || enabledExtraTools.has(t)).length} of {tools.length} active
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleAllInCategory(cat); }}
                    className={cn(
                      "text-[10px] font-medium px-2 py-1 rounded-md transition-colors",
                      allEnabled
                        ? "text-muted-foreground hover:text-destructive"
                        : "text-[#3730a3] hover:bg-primary/10"
                    )}
                  >
                    {allEnabled ? "Disable all" : "Enable all"}
                  </button>
                  <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200", isExpanded && "rotate-180")} />
                </div>
              </button>
              {isExpanded && (
                <div className="overflow-hidden transition-all duration-200">
                  <div className="px-4 pb-4 space-y-1">
                    {tools.map((toolId) => {
                      const meta = TOOL_META[toolId];
                      const isBase = baseToolSet.has(toolId);
                      const isActive = (isBase && !disabledToolSet.has(toolId)) || enabledExtraTools.has(toolId);

                      return (
                        <div
                          key={toolId}
                          className={cn(
                            "flex items-center justify-between px-3 py-2.5 rounded-lg transition-all duration-150",
                            isActive
                              ? "bg-card border border-border"
                              : "bg-[#f9f8f6] border border-transparent opacity-60"
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <button
                              onClick={() => toggleTool(toolId)}
                              className={cn(
                                "w-8 h-[18px] rounded-full transition-all duration-200 flex-shrink-0 relative",
                                isActive ? "bg-primary" : "bg-[#d1d1d1]"
                              )}
                            >
                              <span
                                className={cn(
                                  "absolute top-[2px] w-[14px] h-[14px] bg-card rounded-full shadow-sm transition-all duration-200",
                                  isActive ? "left-[15px]" : "left-[2px]"
                                )}
                              />
                            </button>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-foreground">{meta?.label || toolId}</span>
                                {!isBase && isActive && (
                                  <Badge variant="secondary" className="text-[8px] px-1 py-0">extra</Badge>
                                )}
                              </div>
                              <p className="text-[10px] text-muted-foreground truncate">{meta?.description || ""}</p>
                            </div>
                          </div>
                          <span className="text-[9px] font-mono text-muted-foreground/60 flex-shrink-0 ml-2 hidden sm:block">{toolId}</span>
                        </div>
                      );
                    })}
                  </div>
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
// Prompt Tab
// ===========================================================================

function PromptTab({
  agent,
  currentPrompt,
  isCustom,
  onSave,
  onReset,
}: {
  agent: AgentConfig;
  currentPrompt: string;
  isCustom: boolean;
  onSave: (value: string) => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState(currentPrompt);
  const [isEditing, setIsEditing] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineCount = draft.split("\n").length;
  const charCount = draft.length;

  useEffect(() => {
    setDraft(currentPrompt);
  }, [currentPrompt]);

  const handleSave = () => {
    onSave(draft);
    setIsEditing(false);
  };

  const truncated = currentPrompt.length > 300;

  return (
    <div className="space-y-4">
      {/* Info bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-sm font-medium text-foreground">
            {isCustom ? "Custom system prompt" : "Default system prompt"}
          </div>
          {isCustom && (
            <Badge variant="secondary" className="text-[9px] gap-1">
              <Pencil className="w-3 h-3" /> Modified
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isEditing && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-xs"
              onClick={() => {
                setDraft(currentPrompt);
                setIsEditing(true);
                setTimeout(() => textareaRef.current?.focus(), 100);
              }}
            >
              <Pencil className="w-3.5 h-3.5" />
              {isCustom ? "Edit" : "Customize"}
            </Button>
          )}
          {isCustom && !isEditing && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-xs text-destructive hover:text-destructive"
              onClick={onReset}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Prompt display / editor */}
      <Card>
        <CardContent className="p-4">
          {isEditing ? (
            <div className="space-y-3">
              <Textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="font-mono text-xs min-h-[200px] resize-y"
                placeholder="Enter custom system prompt..."
              />
              <div className="flex items-center justify-between">
                <div className="text-[10px] text-muted-foreground">
                  {lineCount} lines / {charCount.toLocaleString()} chars
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      setDraft(currentPrompt);
                      setIsEditing(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="gap-2 text-xs"
                    onClick={handleSave}
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="relative">
              <pre className="whitespace-pre-wrap text-xs text-foreground leading-relaxed font-mono">
                {showFull ? currentPrompt : currentPrompt.slice(0, 300)}
              </pre>
              {truncated && !showFull && (
                <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-card to-transparent" />
              )}
              {truncated && (
                <button
                  onClick={() => setShowFull(!showFull)}
                  className="mt-2 text-[10px] font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  {showFull ? "Show less" : "Show full prompt"}
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ===========================================================================
// Parameters Tab
// ===========================================================================

function ParametersTab({
  agent,
  currentModel,
  currentTemp,
  currentMaxTokens,
  onUpdate,
}: {
  agent: AgentConfig;
  currentModel: string;
  currentTemp: number;
  currentMaxTokens: number;
  onUpdate: (key: keyof AgentOverrides, value: string | number | undefined) => void;
}) {
  const [showModelInput, setShowModelInput] = useState(false);
  const [tempValue, setTempValue] = useState(currentTemp);
  const [tokenValue, setTokenValue] = useState(currentMaxTokens);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    setTempValue(currentTemp);
    setTokenValue(currentMaxTokens);
  }, [currentTemp, currentMaxTokens]);

  return (
    <div className="space-y-6">
      {/* Model */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <Cpu className="w-4 h-4 text-muted-foreground" />
              Model
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-[10px] gap-1"
              onClick={() => setShowModelInput(!showModelInput)}
            >
              <Pencil className="w-3 h-3" />
              {showModelInput ? "Close" : "Change"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-sm font-mono font-medium text-foreground">{currentModel}</span>
            {currentModel !== agent.model && (
              <Badge variant="secondary" className="text-[8px] px-1 py-0">custom</Badge>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">Default: {agent.model}</p>

          {showModelInput && (
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                defaultValue={currentModel}
                placeholder="e.g. gpt-4o, claude-3.5-sonnet..."
                className="flex-1 px-3 py-2 rounded-lg border border-border bg-card text-xs font-mono focus:outline-none focus:border-ring/40 focus:ring-1 focus:ring-ring/20"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const val = (e.target as HTMLInputElement).value.trim();
                    onUpdate("model", val || undefined);
                    setShowModelInput(false);
                  }
                }}
              />
              <Button
                size="sm"
                className="text-xs"
                onClick={() => setShowModelInput(false)}
              >
                Cancel
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Temperature */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
            Temperature
          </CardTitle>
          <CardDescription>Controls randomness in outputs. Lower = more focused, Higher = more creative.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={tempValue}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setTempValue(val);
                onUpdate("temperature", val);
              }}
              className="flex-1 h-2 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
            />
            <span className="text-sm font-mono font-medium text-foreground w-8 text-right">{tempValue.toFixed(1)}</span>
          </div>
          <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
            <span>Precise</span>
            <span>Default: 0.7</span>
            <span>Creative</span>
          </div>
          {tempValue !== 0.7 && (
            <button
              className="mt-2 text-[10px] font-medium text-primary hover:text-primary/80 transition-colors"
              onClick={() => {
                setTempValue(0.7);
                onUpdate("temperature", undefined);
              }}
            >
              Reset to default
            </button>
          )}
        </CardContent>
      </Card>

      {/* Max Tokens */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            Max Tokens
          </CardTitle>
          <CardDescription>Maximum number of tokens in the model response.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={tokenValue}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val > 0) {
                  setTokenValue(val);
                  onUpdate("maxTokens", val);
                }
              }}
              className="w-32 px-3 py-2 rounded-lg border border-border bg-card text-xs font-mono focus:outline-none focus:border-ring/40 focus:ring-1 focus:ring-ring/20"
            />
            <span className="text-[10px] text-muted-foreground">tokens</span>
            {tokenValue !== 262144 && (
              <button
                className="text-[10px] font-medium text-primary hover:text-primary/80 transition-colors"
                onClick={() => {
                  setTokenValue(262144);
                  onUpdate("maxTokens", undefined);
                }}
              >
                Reset
              </button>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Default: 262,144</p>
        </CardContent>
      </Card>

      {/* Danger Zone: Show API Key (masked) */}
      <Card className="border-destructive/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-destructive flex items-center gap-2">
            Key Info
          </CardTitle>
          <CardDescription>API key configuration is managed server-side via environment variables.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="flex-1 px-3 py-2 rounded-lg bg-muted text-xs font-mono text-muted-foreground">
              {showApiKey
                ? `${agent.provider.toUpperCase()}_*`.padEnd(40, "\u2022")
                : "\u2022".repeat(40)
              }
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-xs"
              onClick={() => setShowApiKey(!showApiKey)}
            >
              {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showApiKey ? "Hide" : "Show"}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Provider: <span className="font-mono">{agent.provider}</span> | Keys are rotated automatically based on usage and health.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
