"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Wrench,
  MessageSquare,
  Activity,
  Zap,
  Settings,
  Cpu,
  Shield,
  BookOpen,
  Bot,
  Clock,
  Search,
  Check,
  RotateCcw,
  Save,
  ToggleLeft,
  ToggleRight,
  SlidersHorizontal,
  Pencil,
  ChevronDown,
  Eye,
  EyeOff,
  X,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { AgentConfig } from "@/lib/agents";
import { AGENT_LIST } from "@/lib/agent-map";

import {
  loadAgentOverrides,
  saveAgentOverrides,
  resetAgentOverrides,
  updateAgentOverrides,
  getEffectiveTools,
  type AgentOverrides,
} from "@/lib/agent-overrides";

// ---------------------------------------------------------------------------
// Tool metadata — all available tools with descriptions
// ---------------------------------------------------------------------------

const TOOL_META: Record<string, { label: string; category: string; description: string; icon: string }> = {
  gmail_send: { label: "Send Email", category: "Gmail", description: "Send an email via Gmail", icon: "📧" },
  gmail_fetch: { label: "Fetch Emails", category: "Gmail", description: "Fetch emails from inbox with optional filters", icon: "📧" },
  gmail_search: { label: "Search Emails", category: "Gmail", description: "Search Gmail messages using a query", icon: "📧" },
  gmail_labels: { label: "List Labels", category: "Gmail", description: "List all Gmail labels", icon: "📧" },
  gmail_create_label: { label: "Create Label", category: "Gmail", description: "Create a new Gmail label", icon: "📧" },
  gmail_delete_label: { label: "Delete Label", category: "Gmail", description: "Delete a Gmail label", icon: "📧" },
  gmail_profile: { label: "Gmail Profile", category: "Gmail", description: "Get current Gmail profile info", icon: "📧" },
  gmail_reply: { label: "Reply Email", category: "Gmail", description: "Reply to an email thread", icon: "📧" },
  gmail_thread: { label: "Read Thread", category: "Gmail", description: "Read full email thread content", icon: "📧" },
  gmail_batch: { label: "Batch Fetch", category: "Gmail", description: "Fetch multiple emails in batch", icon: "📧" },
  calendar_list: { label: "List Calendars", category: "Calendar", description: "List all Google Calendars", icon: "📅" },
  calendar_events: { label: "List Events", category: "Calendar", description: "List events from a calendar", icon: "📅" },
  calendar_create: { label: "Create Event", category: "Calendar", description: "Create a calendar event with Meet link", icon: "📅" },
  calendar_delete: { label: "Delete Event", category: "Calendar", description: "Delete a calendar event", icon: "📅" },
  calendar_freebusy: { label: "Check Availability", category: "Calendar", description: "Check calendar free/busy slots", icon: "📅" },
  drive_list: { label: "List Files", category: "Drive", description: "List files and folders in Google Drive", icon: "📁" },
  drive_create_folder: { label: "Create Folder", category: "Drive", description: "Create a new folder in Drive", icon: "📁" },
  drive_create_file: { label: "Create File", category: "Drive", description: "Create a file (Doc/Sheet/Slides)", icon: "📁" },
  download_drive_file: { label: "Download File", category: "Drive", description: "Download a file from Drive", icon: "📁" },
  sheets_read: { label: "Read Sheet", category: "Sheets", description: "Read spreadsheet metadata", icon: "📊" },
  sheets_values: { label: "Get Values", category: "Sheets", description: "Get cell values from a range", icon: "📊" },
  sheets_append: { label: "Append Rows", category: "Sheets", description: "Append rows to a spreadsheet", icon: "📊" },
  sheets_update: { label: "Update Cells", category: "Sheets", description: "Update cell values in a range", icon: "📊" },
  sheets_create: { label: "Create Sheet", category: "Sheets", description: "Create a new spreadsheet", icon: "📊" },
  sheets_add_sheet: { label: "Add Tab", category: "Sheets", description: "Add a new sheet tab", icon: "📊" },
  sheets_batch_get: { label: "Batch Get", category: "Sheets", description: "Get multiple ranges at once", icon: "📊" },
  sheets_clear: { label: "Clear Range", category: "Sheets", description: "Clear values from a range", icon: "📊" },
  docs_list: { label: "List Docs", category: "Docs", description: "List all Google Docs", icon: "📄" },
  docs_read: { label: "Read Doc", category: "Docs", description: "Read content of a Google Doc", icon: "📄" },
  docs_create: { label: "Create Doc", category: "Docs", description: "Create a new Google Doc", icon: "📄" },
  docs_append: { label: "Append Text", category: "Docs", description: "Append text to a Google Doc", icon: "📄" },
  github_repo: { label: "Repo Info", category: "GitHub", description: "Get repository information", icon: "🐙" },
  github_issues: { label: "List Issues", category: "GitHub", description: "List GitHub issues", icon: "🐙" },
  github_create_issue: { label: "Create Issue", category: "GitHub", description: "Create a new issue", icon: "🐙" },
  github_prs: { label: "List PRs", category: "GitHub", description: "List pull requests", icon: "🐙" },
  github_commits: { label: "List Commits", category: "GitHub", description: "List recent commits", icon: "🐙" },
  github_files: { label: "File Tree", category: "GitHub", description: "Get repository file tree", icon: "🐙" },
  github_read_file: { label: "Read File", category: "GitHub", description: "Read file content from repo", icon: "🐙" },
  github_search: { label: "Search Code", category: "GitHub", description: "Search code in repository", icon: "🐙" },
  github_branches: { label: "List Branches", category: "GitHub", description: "List all branches", icon: "🐙" },
  github_update_issue: { label: "Update Issue", category: "GitHub", description: "Update an existing issue", icon: "🐙" },
  github_create_pr: { label: "Create PR", category: "GitHub", description: "Create a pull request", icon: "🐙" },
  github_pr_review: { label: "Review PR", category: "GitHub", description: "Get PR details and review", icon: "🐙" },
  github_pr_comment: { label: "Comment PR", category: "GitHub", description: "Comment on a pull request", icon: "🐙" },
  github_create_branch: { label: "Create Branch", category: "GitHub", description: "Create a new branch", icon: "🐙" },
  vercel_projects: { label: "List Projects", category: "Vercel", description: "List Vercel projects", icon: "🚀" },
  vercel_deployments: { label: "Deployments", category: "Vercel", description: "List deployments for a project", icon: "🚀" },
  vercel_domains: { label: "Domains", category: "Vercel", description: "List Vercel domains", icon: "🚀" },
  vercel_deploy: { label: "Deploy", category: "Vercel", description: "Trigger a new deployment", icon: "🚀" },
  vercel_logs: { label: "Deploy Logs", category: "Vercel", description: "Get deployment logs", icon: "🚀" },
  web_search: { label: "Web Search", category: "Web", description: "Search the web for real-time info", icon: "🌐" },
  web_reader: { label: "Read URL", category: "Web", description: "Read and extract content from a URL", icon: "🌐" },
  delegate_to_agent: { label: "Delegate Task", category: "Agent", description: "Delegate a task to a specialist agent", icon: "🤝" },
  query_agent: { label: "Query Agent", category: "Agent", description: "Route tasks to other specialist agents", icon: "🤝" },
  vision_analyze: { label: "Analyze Image", category: "Vision", description: "Analyze an image with AI vision", icon: "👁" },
  vision_download_analyze: { label: "Download & Analyze", category: "Vision", description: "Download URL image then analyze", icon: "👁" },
  image_generate: { label: "Generate Image", category: "Image", description: "Generate images from text prompts", icon: "🎨" },
  tts_generate: { label: "Text to Speech", category: "Audio", description: "Convert text to natural speech", icon: "🔊" },
  asr_transcribe: { label: "Transcribe Audio", category: "Audio", description: "Transcribe audio to text", icon: "🎙" },
  video_generate: { label: "Generate Video", category: "Video", description: "Generate videos from text or images", icon: "🎬" },
  design_generate: { label: "Generate Design", category: "Design", description: "Generate UI designs via Stitch", icon: "🎨" },
  design_edit: { label: "Edit Design", category: "Design", description: "Edit an existing design", icon: "🎨" },
  design_variants: { label: "Design Variants", category: "Design", description: "Generate design variations", icon: "🎨" },
  data_calculate: { label: "Calculate", category: "Data", description: "Math, stats, data computations", icon: "📈" },
  data_clean: { label: "Clean Data", category: "Data", description: "Clean and normalize data", icon: "📈" },
  data_pivot: { label: "Pivot Data", category: "Data", description: "Pivot and aggregate data", icon: "📈" },
  research_deep: { label: "Deep Research", category: "Research", description: "Multi-query parallel search", icon: "🔍" },
  research_synthesize: { label: "Synthesize", category: "Research", description: "Cross-reference and synthesize sources", icon: "🔍" },
  research_save_brief: { label: "Save Brief", category: "Research", description: "Save research as Google Doc brief", icon: "🔍" },
  research_save_data: { label: "Save Data", category: "Research", description: "Save research data to Sheets", icon: "🔍" },
  ops_health_check: { label: "Health Check", category: "Ops", description: "Check all service health statuses", icon: "⚡" },
  ops_deployment_status: { label: "Deploy Status", category: "Ops", description: "Get latest deployment information", icon: "⚡" },
  ops_github_activity: { label: "GitHub Activity", category: "Ops", description: "Monitor GitHub with anomaly detection", icon: "⚡" },
  ops_agent_stats: { label: "Agent Stats", category: "Ops", description: "Performance metrics for all agents", icon: "⚡" },
  create_pdf_report: { label: "Create PDF", category: "Files", description: "Generate professional PDF reports", icon: "📑" },
  create_docx_document: { label: "Create DOCX", category: "Files", description: "Create Word documents", icon: "📝" },
  reminder_create: { label: "Create Reminder", category: "Reminders", description: "Create a new reminder", icon: "⏰" },
  reminder_list: { label: "List Reminders", category: "Reminders", description: "List all reminders", icon: "⏰" },
  reminder_update: { label: "Update Reminder", category: "Reminders", description: "Update an existing reminder", icon: "⏰" },
  reminder_delete: { label: "Delete Reminder", category: "Reminders", description: "Delete a reminder", icon: "⏰" },
  reminder_complete: { label: "Complete Reminder", category: "Reminders", description: "Mark a reminder as complete", icon: "⏰" },
  todo_create: { label: "Create Todo", category: "Todos", description: "Create a new todo item", icon: "✅" },
  todo_list: { label: "List Todos", category: "Todos", description: "List all todos", icon: "✅" },
  todo_update: { label: "Update Todo", category: "Todos", description: "Update a todo item", icon: "✅" },
  todo_delete: { label: "Delete Todo", category: "Todos", description: "Delete a todo item", icon: "✅" },
  todo_stats: { label: "Todo Stats", category: "Todos", description: "Get todo statistics", icon: "✅" },
  contact_create: { label: "Create Contact", category: "Contacts", description: "Create a new contact", icon: "👤" },
  contact_list: { label: "List Contacts", category: "Contacts", description: "List all contacts", icon: "👤" },
  contact_search: { label: "Search Contacts", category: "Contacts", description: "Search contacts by name/email", icon: "👤" },
  contact_update: { label: "Update Contact", category: "Contacts", description: "Update a contact", icon: "👤" },
  contact_delete: { label: "Delete Contact", category: "Contacts", description: "Delete a contact", icon: "👤" },
  code_execute: { label: "Run Code", category: "Code", description: "Execute code in sandbox (JS/Python/etc)", icon: "💻" },
  weather_get: { label: "Weather", category: "Weather", description: "Get weather for any city", icon: "🌤" },
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
// Animation
// ---------------------------------------------------------------------------

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

// ---------------------------------------------------------------------------
// Tab type
// ---------------------------------------------------------------------------

type Tab = "overview" | "tools" | "prompt" | "parameters";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <BookOpen className="w-3.5 h-3.5" /> },
  { id: "tools", label: "Tools", icon: <Wrench className="w-3.5 h-3.5" /> },
  { id: "prompt", label: "Prompt", icon: <Cpu className="w-3.5 h-3.5" /> },
  { id: "parameters", label: "Parameters", icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
];

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
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  // Load agent + overrides
  useEffect(() => {
    const found = AGENT_LIST.find((a) => a.id === params.id) as AgentConfig | undefined;
    if (found) {
      setAgent(found);
      const o = loadAgentOverrides(found.id);
      setOverrides(o);
      fetch("/api/agents")
        .then((r) => r.json())
        .then((json) => {
          if (json.success && json.data) {
            const a = json.data.find((d: { id: string }) => d.id === params.id);
            if (a?.status) {
              setStats({
                tasksCompleted: a.status.tasksCompleted || 0,
                messagesProcessed: a.status.messagesProcessed || 0,
              });
            }
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [params.id]);

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
      // Disable a base tool
      newDisabled.push(toolId);
    } else if (isBase && isDisabled) {
      // Re-enable a base tool
      newDisabled = newDisabled.filter((t) => t !== toolId);
    } else if (!isBase && !isEnabledExtra) {
      // Enable an extra tool
      newEnabled.push(toolId);
    } else {
      // Disable an extra tool
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

  // ---- Loading / Not Found ----

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

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
  const currentMaxTokens = overrides.maxTokens ?? 65536;
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
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8"
    >
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1a1a2e] text-white text-sm font-medium shadow-lg"
          >
            <Check className="w-4 h-4 text-emerald-400" />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Back button */}
      <Link href="/agents" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to Agents
      </Link>

      {/* Agent Header */}
      <motion.div variants={itemVariants} initial="hidden" animate="show">
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
      </motion.div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1 scrollbar-none">
        {TABS.map((tab) => (
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
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === "overview" && (
            <OverviewTab agent={agent} colors={colors} stats={stats} effectiveTools={effectiveTools} onChat={() => {
              localStorage.setItem("claw-selected-agent", agent.id);
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
        </motion.div>
      </AnimatePresence>
    </motion.div>
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
                    <span className="text-sm">{TOOL_META[tools[0]]?.icon || "🔧"}</span>
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
            {agent.suggestedActions.map((action) => (
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
        // Disable all
        if (baseToolSet.has(t) && !disabledToolSet.has(t)) toggleTool(t);
      } else {
        // Enable all
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
                onClick={() => search ? toggleCategory(cat) : toggleCategory(cat)}
                className="w-full flex items-center justify-between p-4 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{TOOL_META[tools[0]]?.icon || "🔧"}</span>
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
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
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
                  </motion.div>
                )}
              </AnimatePresence>
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

  const handleReset = () => {
    setDraft(agent.systemPrompt);
    onReset();
    setIsEditing(false);
  };

  const previewText = showFull ? draft : draft.slice(0, 1500) + (draft.length > 1500 ? "\n\n... (show more)" : "");

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isCustom ? (
            <Badge className="text-[10px] gap-1 bg-amber-500/20 text-amber-600 border-amber-500/30 hover:bg-amber-500/20">
              <AlertTriangle className="w-3 h-3" />
              Custom prompt active
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px] gap-1">
              <Shield className="w-3 h-3" />
              Default prompt
            </Badge>
          )}
          <span className="text-[10px] text-muted-foreground">{charCount.toLocaleString()} chars · {lineCount} lines</span>
        </div>
        <div className="flex items-center gap-2">
          {isCustom && (
            <Button variant="ghost" size="sm" className="text-xs gap-1.5 text-muted-foreground" onClick={handleReset}>
              <RotateCcw className="w-3 h-3" />
              Reset
            </Button>
          )}
          {!isEditing ? (
            <Button size="sm" className="text-xs gap-1.5 bg-primary hover:bg-primary/90" onClick={() => setIsEditing(true)}>
              <Pencil className="w-3 h-3" />
              Edit
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setDraft(currentPrompt); setIsEditing(false); }}>
                Cancel
              </Button>
              <Button size="sm" className="text-xs gap-1.5 bg-primary hover:bg-primary/90" onClick={handleSave}>
                <Save className="w-3 h-3" />
                Save
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Prompt editor / viewer */}
      <Card>
        <CardContent className="p-0">
          {isEditing ? (
            <Textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={24}
              className="w-full resize-y rounded-t-none border-0 bg-card px-4 py-3 text-xs font-mono text-foreground leading-relaxed focus:outline-none focus-visible:ring-0 custom-scrollbar"
              placeholder="Enter system prompt..."
            />
          ) : (
            <div
              className="px-4 py-3 min-h-[200px] max-h-[500px] overflow-auto text-xs font-mono text-foreground leading-relaxed whitespace-pre-wrap bg-card custom-scrollbar"
            >
              {previewText}
            </div>
          )}
          {!isEditing && draft.length > 1500 && (
            <div className="px-4 py-2 border-t border-border">
              <button
                onClick={() => setShowFull(!showFull)}
                className="text-[10px] text-[#3730a3] hover:underline flex items-center gap-1"
              >
                {showFull ? <><EyeOff className="w-3 h-3" /> Show less</> : <><Eye className="w-3 h-3" /> Show full prompt ({charCount.toLocaleString()} chars)</>}
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tips */}
      <div className="rounded-lg border border-border bg-secondary p-4">
        <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
          <Settings className="w-3.5 h-3.5" />
          Prompt Tips
        </h4>
        <ul className="text-[11px] text-muted-foreground space-y-1.5 list-disc list-inside">
          <li>The system prompt defines the agent&apos;s identity, behavior, and available tools</li>
          <li>Keep tool references accurate — the agent will only have access to <strong>active tools</strong> (check the Tools tab)</li>
          <li>Use markdown formatting for structure: headers, tables, lists</li>
          <li>Reset to default at any time to restore the original prompt</li>
        </ul>
      </div>
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
  const [temp, setTemp] = useState(currentTemp);
  const [maxTokens, setMaxTokens] = useState(currentMaxTokens);
  const [model, setModel] = useState(currentModel);

  // Sync from props (when reset)
  useEffect(() => { setTemp(currentTemp); }, [currentTemp]);
  useEffect(() => { setMaxTokens(currentMaxTokens); }, [currentMaxTokens]);
  useEffect(() => { setModel(currentModel); }, [currentModel]);

  const isDefaultModel = model === agent.model;
  const isDefaultTemp = temp === 0.7;
  const isDefaultMaxTokens = maxTokens === 65536;

  return (
    <div className="space-y-6">
      {/* Model Selection */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Cpu className="w-4 h-4 text-muted-foreground" />
                Model
              </CardTitle>
              <CardDescription className="mt-1">Choose which LLM powers this agent</CardDescription>
            </div>
            {!isDefaultModel && (
              <Button
                variant="ghost"
                size="sm"
                className="text-[10px] text-muted-foreground"
                onClick={() => { setModel(agent.model); onUpdate("model", undefined); }}
              >
                Reset
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Current */}
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-primary/20 bg-primary/5">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">{model}</p>
              <p className="text-[10px] text-muted-foreground">
                via {agent.provider} {!isDefaultModel && "(custom)"}
              </p>
            </div>
            <Badge variant="outline" className="text-[9px]">Active</Badge>
          </div>

          {/* Model input */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Model ID
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={model}
                onChange={(e) => { setModel(e.target.value); onUpdate("model", e.target.value || undefined); }}
                className="flex-1 px-3 py-2 rounded-lg border border-border bg-card text-xs font-mono focus:outline-none focus:border-ring/40 focus:ring-1 focus:ring-ring/20 transition-all"
                placeholder="e.g. gpt-4o, claude-3.5-sonnet"
              />
              <Button
                variant="outline"
                size="sm"
                className="text-[10px] px-3"
                onClick={() => { setModel(agent.model); onUpdate("model", undefined); }}
              >
                Default
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Default: <code className="bg-muted px-1 py-0.5 rounded text-[10px]">{agent.model}</code>
            </p>
          </div>

          {/* Preset models */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Quick Select
            </label>
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: "coding-glm-5.1-free", label: "GLM-5.1 Free", provider: "aihubmix" },
                { id: "gpt-4o", label: "GPT-4o", provider: "openrouter" },
                { id: "gpt-4o-mini", label: "GPT-4o Mini", provider: "openrouter" },
                { id: "claude-sonnet-4-20250514", label: "Claude 4 Sonnet", provider: "openrouter" },
                { id: "claude-3.5-sonnet", label: "Claude 3.5 Sonnet", provider: "openrouter" },
                { id: "gemma4:31b-cloud", label: "Gemma 4 31B", provider: "ollama" },
                { id: "llama3.1:8b", label: "Llama 3.1 8B", provider: "ollama" },
                { id: "deepseek-r1", label: "DeepSeek R1", provider: "ollama" },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setModel(m.id); onUpdate("model", m.id); }}
                  className={cn(
                    "px-2.5 py-1.5 rounded-md border text-[10px] font-medium transition-all",
                    model === m.id
                      ? "border-primary bg-primary/10 text-[#3730a3]"
                      : "border-border bg-card text-muted-foreground hover:border-primary/30"
                  )}
                >
                  {m.label}
                  <span className="ml-1 opacity-50">{m.provider}</span>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Temperature */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Settings className="w-4 h-4 text-muted-foreground" />
                Temperature
              </CardTitle>
              <CardDescription className="mt-1">Controls randomness — lower = more focused, higher = more creative</CardDescription>
            </div>
            <span className={cn(
              "text-lg font-bold tabular-nums",
              isDefaultTemp ? "text-foreground" : "text-[#3730a3]"
            )}>
              {temp.toFixed(2)}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Slider */}
          <div className="relative">
            <input
              type="range"
              min="0"
              max="2"
              step="0.05"
              value={temp}
              onChange={(e) => { const v = parseFloat(e.target.value); setTemp(v); onUpdate("temperature", v === 0.7 ? undefined : v); }}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #3730a3 0%, #3730a3 ${((temp / 2) * 100)}%, hsl(var(--muted)) ${((temp / 2) * 100)}%, hsl(var(--muted)) 100%)`,
              }}
            />
            {/* Tick marks */}
            <div className="flex justify-between mt-1.5">
              {[0, 0.5, 1.0, 1.5, 2.0].map((v) => (
                <button
                  key={v}
                  onClick={() => { setTemp(v); onUpdate("temperature", v === 0.7 ? undefined : v); }}
                  className={cn(
                    "text-[9px] tabular-nums transition-colors",
                    temp === v ? "text-[#3730a3] font-bold" : "text-muted-foreground"
                  )}
                >
                  {v.toFixed(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Presets */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: "Precise", value: 0, desc: "Factual, code-heavy" },
              { label: "Balanced", value: 0.7, desc: "Default versatility" },
              { label: "Creative", value: 1.2, desc: "Brainstorming, writing" },
              { label: "Wild", value: 1.8, desc: "Maximum creativity" },
            ].map((p) => (
              <button
                key={p.label}
                onClick={() => { setTemp(p.value); onUpdate("temperature", p.value === 0.7 ? undefined : p.value); }}
                className={cn(
                  "px-3 py-2 rounded-lg border text-left transition-all",
                  temp === p.value
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:border-primary/30"
                )}
              >
                <p className={cn("text-[10px] font-semibold", temp === p.value ? "text-[#3730a3]" : "text-foreground")}>{p.label}</p>
                <p className="text-[9px] text-muted-foreground">{p.value.toFixed(1)} — {p.desc}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Max Tokens */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Activity className="w-4 h-4 text-muted-foreground" />
                Max Output Tokens
              </CardTitle>
              <CardDescription className="mt-1">Maximum response length — higher values allow longer responses but cost more</CardDescription>
            </div>
            <span className={cn(
              "text-lg font-bold tabular-nums",
              isDefaultMaxTokens ? "text-foreground" : "text-[#3730a3]"
            )}>
              {maxTokens.toLocaleString()}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            type="range"
            min="1024"
            max="262144"
            step="1024"
            value={maxTokens}
            onChange={(e) => { const v = parseInt(e.target.value); setMaxTokens(v); onUpdate("maxTokens", v === 4096 ? undefined : v); }}
            className="w-full h-2 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #3730a3 0%, #3730a3 ${((maxTokens / 262144) * 100)}%, hsl(var(--muted)) ${((maxTokens / 262144) * 100)}%, hsl(var(--muted)) 100%)`,
            }}
          />
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: "Short", value: 4096 },
              { label: "Default", value: 65536 },
              { label: "Long", value: 98304 },
              { label: "Maximum", value: 262144 },
            ].map((p) => (
              <button
                key={p.label}
                onClick={() => { setMaxTokens(p.value); onUpdate("maxTokens", p.value === 4096 ? undefined : p.value); }}
                className={cn(
                  "px-3 py-1.5 rounded-md border text-[10px] font-medium transition-all",
                  maxTokens === p.value
                    ? "border-primary bg-primary/10 text-[#3730a3]"
                    : "border-border bg-card text-muted-foreground hover:border-primary/30"
                )}
              >
                {p.label} ({p.value.toLocaleString()})
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Info */}
      <div className="rounded-lg border border-border bg-secondary p-4">
        <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5" />
          How Overrides Work
        </h4>
        <ul className="text-[11px] text-muted-foreground space-y-1.5 list-disc list-inside">
          <li>Overrides are stored locally in your browser and merged with the agent&apos;s base configuration</li>
          <li>The agent&apos;s default tools, prompt, and model are defined in the codebase</li>
          <li>Your customizations layer on top — defaults are restored when you reset</li>
          <li>Model changes require a matching API key for the target provider</li>
        </ul>
      </div>
    </div>
  );
}
