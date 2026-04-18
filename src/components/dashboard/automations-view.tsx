"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap,
  Plus,
  Pencil,
  TrashIcon,
  Clock,
  Bot,
  CheckCheck,
  X,
  Play,
  Calendar,
  Bell,
  FileText,
  ChevronRight,
  AlertCircle,
  Mail,
} from "@/components/icons";
import { Copy, ArrowRight, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/helpers";
import {
  type AutomationItem,
  type AutomationLog,
  getAllAutomations,
  createAutomation,
  updateAutomation,
  deleteAutomation,
  getAutomationLogs,
} from "@/lib/automations-store";
import type { PageKey } from "@/components/dashboard/sidebar";

// ---------------------------------------------------------------------------
// Agent options
// ---------------------------------------------------------------------------

interface AgentOption {
  id: string;
  name: string;
}

const KNOWN_AGENTS: AgentOption[] = [
  { id: "general", name: "Claw General" },
  { id: "mail", name: "Mail Agent" },
  { id: "code", name: "Code Agent" },
  { id: "data", name: "Data Agent" },
  { id: "creative", name: "Creative Agent" },
  { id: "research", name: "Research Agent" },
  { id: "ops", name: "Ops Agent" },
];

// ---------------------------------------------------------------------------
// Form state type
// ---------------------------------------------------------------------------

interface AutomationForm {
  name: string;
  description: string;
  triggerType: "schedule" | "event" | "manual";
  triggerConfig: string;
  actionType: "agent_task" | "notification";
  actionConfig: string;
  agentId: string;
  enabled: boolean;
}

const emptyForm: AutomationForm = {
  name: "",
  description: "",
  triggerType: "manual",
  triggerConfig: "",
  actionType: "agent_task",
  actionConfig: "",
  agentId: "",
  enabled: true,
};

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  icon: "mail" | "code" | "bell" | "git";
  form: AutomationForm;
}

const TEMPLATES: AutomationTemplate[] = [
  {
    id: "daily-inbox",
    name: "Daily Inbox Summary",
    description: "Get a morning summary of your unread emails",
    icon: "mail",
    form: {
      name: "Daily Inbox Summary",
      description: "Summarize my unread emails from today",
      triggerType: "schedule",
      triggerConfig: "0 9 * * *",
      actionType: "agent_task",
      actionConfig: "Summarize my unread emails from today",
      agentId: "mail",
      enabled: true,
    },
  },
  {
    id: "weekly-review",
    name: "Weekly Code Review",
    description: "Automated pull request review every Monday morning",
    icon: "code",
    form: {
      name: "Weekly Code Review",
      description: "Review open pull requests and summarize issues",
      triggerType: "schedule",
      triggerConfig: "0 9 * * 1",
      actionType: "agent_task",
      actionConfig: "Review open pull requests and summarize issues",
      agentId: "code",
      enabled: true,
    },
  },
  {
    id: "email-alert",
    name: "New Email Alert",
    description: "Get notified instantly when a new email arrives",
    icon: "bell",
    form: {
      name: "New Email Alert",
      description: "Receive a notification for every incoming email",
      triggerType: "event",
      triggerConfig: "gmail.received",
      actionType: "notification",
      actionConfig: "",
      agentId: "",
      enabled: true,
    },
  },
  {
    id: "github-digest",
    name: "GitHub Activity Digest",
    description: "Daily evening digest of your GitHub activity",
    icon: "git",
    form: {
      name: "GitHub Activity Digest",
      description: "Summary of GitHub activity today",
      triggerType: "schedule",
      triggerConfig: "0 18 * * *",
      actionType: "agent_task",
      actionConfig: "Give me a summary of GitHub activity today",
      agentId: "code",
      enabled: true,
    },
  },
];

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

// ---------------------------------------------------------------------------
// Badge / style constants
// ---------------------------------------------------------------------------

const triggerBadgeStyles: Record<string, string> = {
  schedule: "bg-blue-500/20 text-blue-600 border-blue-500/30",
  event: "bg-purple-500/20 text-purple-600 border-purple-500/30",
  manual: "bg-slate-500/20 text-[#1a1a1a] border-slate-500/30",
};

const logStatusStyles: Record<string, string> = {
  running: "bg-indigo-500/20 text-indigo-600 border-indigo-500/30",
  success: "bg-emerald-500/20 text-emerald-600 border-emerald-500/30",
  error: "bg-red-500/20 text-red-600 border-red-500/30",
};

const schedulePresets = [
  { label: "Every 30 min", value: "*/30 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Daily 9am", value: "0 9 * * *" },
  { label: "Daily midnight", value: "0 0 * * *" },
  { label: "Mon 9am", value: "0 9 * * 1" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TabKey = "automations" | "templates" | "logs";

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function getTriggerLabel(triggerType: string): string {
  if (triggerType === "schedule") return "Schedule";
  if (triggerType === "event") return "Event";
  return "Manual";
}

function getActionLabel(actionType: string): string {
  return actionType === "agent_task" ? "Agent Task" : "Notification";
}

function resolveTriggerConfig(auto: AutomationItem): string {
  if (auto.triggerType === "schedule") {
    return typeof auto.triggerConfig.schedule === "string" ? auto.triggerConfig.schedule : "";
  }
  if (auto.triggerType === "event") {
    return typeof auto.triggerConfig.event === "string" ? auto.triggerConfig.event : "";
  }
  return "";
}

function resolveActionConfig(auto: AutomationItem): string {
  if (auto.actionType === "agent_task") {
    return typeof auto.actionConfig.prompt === "string" ? auto.actionConfig.prompt : "";
  }
  return typeof auto.actionConfig.message === "string" ? auto.actionConfig.message : "";
}

// ---------------------------------------------------------------------------
// Visual Flow Preview
// ---------------------------------------------------------------------------

function FlowPreview({
  triggerType,
  triggerValue,
  actionType,
  agentLabel,
  compact = false,
}: {
  triggerType: string;
  triggerValue?: string;
  actionType: string;
  agentLabel?: string;
  compact?: boolean;
}) {
  const TriggerIcon = triggerType === "schedule" ? Calendar : triggerType === "event" ? Zap : Play;
  const ActionIcon = actionType === "agent_task" ? Bot : Bell;
  const tLabel = getTriggerLabel(triggerType);
  const aLabel = getActionLabel(actionType);

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#f5f3ef] border border-[#e8e5df]">
          <TriggerIcon className="w-3 h-3 text-[#3730a3]" />
          <span className="text-[10px] font-medium text-foreground">{tLabel}</span>
          {triggerValue && <span className="text-[9px] text-muted-foreground">{triggerValue}</span>}
        </div>
        <ArrowRight className="w-3.5 h-3.5 text-[#e8e5df] flex-shrink-0" />
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#f5f3ef] border border-[#e8e5df]">
          <ActionIcon className="w-3 h-3 text-[#3730a3]" />
          <span className="text-[10px] font-medium text-foreground">{aLabel}</span>
          {agentLabel && <span className="text-[10px] text-muted-foreground">· {agentLabel}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 w-full">
      <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border bg-white flex-1 min-w-0" style={{ borderColor: "#e8e5df" }}>
        <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center flex-shrink-0">
          <TriggerIcon className="w-4 h-4 text-[#3730a3]" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Trigger</div>
          <div className="text-xs font-semibold text-foreground truncate">
            {tLabel}
            {triggerValue && <span className="font-normal text-muted-foreground ml-1">· {triggerValue}</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center flex-shrink-0">
        <div className="w-6 h-px bg-[#e8e5df]" />
        <ArrowRight className="w-4 h-4 text-[#3730a3] -ml-1" />
      </div>
      <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border bg-white flex-1 min-w-0" style={{ borderColor: "#e8e5df" }}>
        <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center flex-shrink-0">
          <ActionIcon className="w-4 h-4 text-[#3730a3]" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Action</div>
          <div className="text-xs font-semibold text-foreground truncate">
            {aLabel}
            {agentLabel && <span className="font-normal text-muted-foreground ml-1">· {agentLabel}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Log Status Badge
// ---------------------------------------------------------------------------

function LogStatusBadge({ status }: { status: string }) {
  const dotColor = status === "success" ? "bg-emerald-500" : status === "error" ? "bg-red-500" : "bg-indigo-500 animate-pulse";
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("w-1.5 h-1.5 rounded-full", dotColor)} />
      <span className={cn("text-[10px] font-medium capitalize", status === "success" ? "text-emerald-600" : status === "error" ? "text-red-500" : "text-indigo-600")}>{status}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface AutomationsViewProps {
  onNavigate?: (key: PageKey) => void;
}

export function AutomationsView({ onNavigate: _onNavigate }: AutomationsViewProps) {
  const [automations, setAutomations] = useState<AutomationItem[]>([]);
  const [allLogs, setAllLogs] = useState<AutomationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<AutomationForm>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [activeTab, setActiveTab] = useState<TabKey>("automations");

  const logsByAutomation = useMemo(() => {
    const map = new Map<number, AutomationLog[]>();
    for (const log of allLogs) {
      const existing = map.get(log.automationId) || [];
      if (existing.length < 3) existing.push(log);
      map.set(log.automationId, existing);
    }
    return map;
  }, [allLogs]);

  const loadAutomations = useCallback(() => {
    setLoading(true);
    requestAnimationFrame(() => {
      try {
        setAutomations(getAllAutomations());
        setAllLogs(getAutomationLogs(undefined, 100));
      } catch { /* empty */ }
      setLoading(false);
    });
  }, []);

  useEffect(() => { loadAutomations(); }, [loadAutomations]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setWizardStep(1);
    setPanelOpen(true);
  };

  const openEdit = (auto: AutomationItem) => {
    setEditingId(auto.id);
    setForm({
      name: auto.name,
      description: auto.description,
      triggerType: auto.triggerType,
      triggerConfig: resolveTriggerConfig(auto),
      actionType: auto.actionType as "agent_task" | "notification",
      actionConfig: resolveActionConfig(auto),
      agentId: auto.agentId || "",
      enabled: auto.enabled,
    });
    setWizardStep(1);
    setPanelOpen(true);
  };

  const applyTemplate = (template: AutomationTemplate) => {
    setEditingId(null);
    setForm({ ...template.form });
    setWizardStep(3);
    setPanelOpen(true);
  };

  const handleClone = (auto: AutomationItem) => {
    try {
      createAutomation({
        name: `${auto.name} (Copy)`,
        description: auto.description,
        triggerType: auto.triggerType,
        triggerConfig: auto.triggerConfig,
        actionType: auto.actionType,
        actionConfig: auto.actionConfig,
        agentId: auto.agentId || undefined,
        enabled: false,
      });
      loadAutomations();
    } catch { /* silent */ }
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.triggerType || !form.actionType) return;
    setSaving(true);
    try {
      const triggerConfig: Record<string, unknown> = {};
      if (form.triggerType === "schedule") triggerConfig.schedule = form.triggerConfig;
      else if (form.triggerType === "event") triggerConfig.event = form.triggerConfig;
      const actionConfig: Record<string, unknown> = {};
      if (form.actionType === "agent_task") actionConfig.prompt = form.actionConfig;
      else actionConfig.message = form.actionConfig;

      if (editingId) {
        updateAutomation(editingId, {
          name: form.name.trim(), description: form.description.trim(),
          triggerType: form.triggerType, triggerConfig, actionType: form.actionType,
          actionConfig, agentId: form.agentId || undefined, enabled: form.enabled,
        });
      } else {
        createAutomation({
          name: form.name.trim(), description: form.description.trim(),
          triggerType: form.triggerType, triggerConfig, actionType: form.actionType,
          actionConfig, agentId: form.agentId || undefined, enabled: form.enabled,
        });
      }
      setPanelOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      loadAutomations();
    } catch { /* silent */ }
    setSaving(false);
  };

  const handleDelete = (id: number) => {
    try { deleteAutomation(id); setDeleteConfirm(null); loadAutomations(); } catch { /* silent */ }
  };

  const handleToggle = (auto: AutomationItem) => {
    try { updateAutomation(auto.id, { enabled: !auto.enabled }); loadAutomations(); } catch { /* silent */ }
  };

  const canProceedStep1 = form.name.trim().length > 0;

  const templateIcon = (iconKey: string) => {
    switch (iconKey) {
      case "mail": return <Mail className="w-5 h-5 text-[#3730a3]" />;
      case "code": return <Bot className="w-5 h-5 text-[#3730a3]" />;
      case "bell": return <Bell className="w-5 h-5 text-[#3730a3]" />;
      case "git": return <Zap className="w-5 h-5 text-[#3730a3]" />;
      default: return <Zap className="w-5 h-5 text-[#3730a3]" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Wizard progress indicator
  const wizardSteps = [
    { num: 1 as const, label: "Trigger" },
    { num: 2 as const, label: "Action" },
    { num: 3 as const, label: "Review & Save" },
  ];

  const renderWizardProgress = () => (
    <div className="flex items-center gap-0 mb-6">
      {wizardSteps.map((step, i) => (
        <div key={step.num} className="flex items-center flex-1 last:flex-none">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
              wizardStep >= step.num ? "bg-[#3730a3] text-white" : "bg-[#f0ede8] text-muted-foreground"
            )}>
              {wizardStep > step.num ? <CheckCircle2 className="w-4 h-4" /> : step.num}
            </div>
            <span className={cn("text-xs font-medium hidden sm:inline", wizardStep >= step.num ? "text-foreground" : "text-muted-foreground")}>
              {step.label}
            </span>
          </div>
          {i < wizardSteps.length - 1 && (
            <div className={cn("flex-1 h-px mx-3 transition-colors", wizardStep > step.num ? "bg-[#3730a3]" : "bg-[#e8e5df]")} />
          )}
        </div>
      ))}
    </div>
  );

  const selectClass = "w-full h-10 rounded-lg border border-[#e8e5df] bg-white px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3730a3]/20 focus-visible:border-[#3730a3] transition-colors";

  const renderStep1 = () => (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-medium text-foreground mb-1.5">Name <span className="text-red-400">*</span></label>
        <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="My Automation" />
      </div>
      <div>
        <label className="block text-xs font-medium text-foreground mb-1.5">Description</label>
        <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Describe what this automation does..." rows={3} />
      </div>
      <div>
        <label className="block text-xs font-medium text-foreground mb-1.5">Trigger Type <span className="text-red-400">*</span></label>
        <select value={form.triggerType} onChange={(e) => setForm((f) => ({ ...f, triggerType: e.target.value as "schedule" | "event" | "manual", triggerConfig: "" }))} className={selectClass}>
          <option value="manual">Manual</option>
          <option value="schedule">Schedule (Cron)</option>
          <option value="event">Event</option>
        </select>
      </div>
      {form.triggerType === "schedule" && (
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">Schedule Expression</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {schedulePresets.map((preset) => (
              <button key={preset.value} onClick={() => setForm((f) => ({ ...f, triggerConfig: preset.value }))} className={cn(
                "text-[10px] px-2 py-1 rounded-md border transition-colors",
                form.triggerConfig === preset.value ? "border-[#3730a3] bg-indigo-50 text-[#3730a3]" : "border-[#e8e5df] text-muted-foreground hover:border-[#3730a3]/30 hover:text-foreground"
              )}>{preset.label}</button>
            ))}
          </div>
          <Input value={form.triggerConfig} onChange={(e) => setForm((f) => ({ ...f, triggerConfig: e.target.value }))} placeholder="*/30 * * * *" className="font-mono text-xs" />
        </div>
      )}
      {form.triggerType === "event" && (
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">Event Trigger</label>
          <Input value={form.triggerConfig} onChange={(e) => setForm((f) => ({ ...f, triggerConfig: e.target.value }))} placeholder="e.g., github.push, gmail.received" />
          <p className="text-[10px] text-muted-foreground mt-1">Enter the event type that should trigger this automation.</p>
        </div>
      )}
      {form.triggerType === "manual" && (
        <div className="rounded-lg border border-[#e8e5df] bg-[#f5f3ef] p-3 text-xs text-muted-foreground">
          This automation will only run when triggered manually.
        </div>
      )}
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-medium text-foreground mb-1.5">Action Type <span className="text-red-400">*</span></label>
        <select value={form.actionType} onChange={(e) => setForm((f) => ({ ...f, actionType: e.target.value as "agent_task" | "notification", actionConfig: "" }))} className={selectClass}>
          <option value="agent_task">Agent Task</option>
          <option value="notification">Notification</option>
        </select>
      </div>
      {form.actionType === "agent_task" && (
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">Target Agent</label>
          <select value={form.agentId} onChange={(e) => setForm((f) => ({ ...f, agentId: e.target.value }))} className={selectClass}>
            <option value="">No agent assigned</option>
            {KNOWN_AGENTS.map((agent) => (<option key={agent.id} value={agent.id}>{agent.name}</option>))}
          </select>
        </div>
      )}
      {form.actionType === "agent_task" && (
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">Task Prompt</label>
          <Textarea value={form.actionConfig} onChange={(e) => setForm((f) => ({ ...f, actionConfig: e.target.value }))} placeholder="Describe the task the agent should perform..." rows={4} />
        </div>
      )}
      {form.actionType === "notification" && (
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">Notification Message</label>
          <Textarea value={form.actionConfig} onChange={(e) => setForm((f) => ({ ...f, actionConfig: e.target.value }))} placeholder="The notification message to send..." rows={4} />
        </div>
      )}
      <div className="flex items-center justify-between py-2">
        <div>
          <label className="text-xs font-medium text-foreground">Enabled</label>
          <p className="text-[10px] text-muted-foreground mt-0.5">{form.enabled ? "Automation will run when triggered" : "Automation is paused"}</p>
        </div>
        <button onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))} className={cn("relative rounded-full transition-colors duration-200 flex-shrink-0", form.enabled ? "bg-[#3730a3]" : "bg-[#e8e5df]")} style={{ width: "40px", height: "22px" }} aria-label={form.enabled ? "Disable" : "Enable"}>
          <span className={cn("absolute top-[3px] w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200", form.enabled ? "translate-x-[21px]" : "translate-x-[3px]")} />
        </button>
      </div>
    </div>
  );

  const renderStep3 = () => {
    const agentLabel = KNOWN_AGENTS.find((a) => a.id === form.agentId)?.name;
    return (
      <div className="space-y-5">
        <div>
          <h4 className="text-xs font-medium text-foreground mb-3">Automation Flow</h4>
          <FlowPreview triggerType={form.triggerType} triggerValue={form.triggerConfig || undefined} actionType={form.actionType} agentLabel={agentLabel} />
        </div>
        <div className="rounded-lg border border-[#e8e5df] bg-[#f5f3ef] divide-y divide-[#e8e5df]">
          {[
            ["Name", form.name],
            ...(form.description ? [["Description", form.description]] : []),
            ["Trigger", `${getTriggerLabel(form.triggerType)}${form.triggerConfig ? ` · ${form.triggerConfig}` : ""}`],
            ["Action", `${getActionLabel(form.actionType)}${agentLabel ? ` · ${agentLabel}` : ""}`],
            ...(form.actionConfig ? [[form.actionType === "agent_task" ? "Prompt" : "Message", form.actionConfig]] : []),
          ].map(([label, value], i) => (
            <div key={i} className="px-3 py-2.5 flex justify-between items-start">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
              <span className="text-xs font-medium text-foreground text-right max-w-[200px] truncate">{value}</span>
            </div>
          ))}
          <div className="px-3 py-2.5 flex justify-between items-center">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Status</span>
            <Badge variant={form.enabled ? "success" : "secondary"} className="text-[10px]">{form.enabled ? "Enabled" : "Disabled"}</Badge>
          </div>
        </div>
      </div>
    );
  };

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "automations", label: "Automations", count: automations.length },
    { key: "templates", label: "Templates" },
    { key: "logs", label: "Logs", count: allLogs.length },
  ];

  return (
    <motion.div key="automations" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      {/* Page Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Zap className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-xl font-bold text-foreground">Automations</h2>
          </div>
          <p className="text-sm text-muted-foreground ml-8">Create and manage automated workflows for your agents</p>
        </div>
        <Button onClick={openCreate} className="gap-2"><Plus className="w-4 h-4" />Create Automation</Button>
      </div>

          {/* Tab Bar */}
      <div className="flex items-center gap-1 border-b mb-6 overflow-x-auto scrollbar-none" style={{ borderColor: "#e8e5df" }}>
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={cn("relative px-4 pb-3 pt-1.5 text-sm font-medium transition-colors whitespace-nowrap min-h-[44px] flex items-center", activeTab === tab.key ? "text-foreground" : "text-muted-foreground hover:text-foreground/70")}>
            {tab.label}
            {tab.count !== undefined && (
              <span className={cn("ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full", activeTab === tab.key ? "bg-[#3730a3] text-white" : "bg-[#f0ede8] text-muted-foreground")}>{tab.count}</span>
            )}
            {activeTab === tab.key && <motion.div layoutId="automation-tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3730a3] rounded-full" transition={{ type: "spring", stiffness: 350, damping: 30 }} />}
          </button>
        ))}
      </div>

      {/* Tab: Automations */}
      <AnimatePresence mode="wait">
        {activeTab === "automations" && (
          <motion.div key="tab-automations" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
            {automations.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
                <Card>
                  <CardContent className="py-16">
                    <div className="text-center">
                      <div className="w-14 h-14 rounded-full bg-[#f5f3ef] flex items-center justify-center mx-auto mb-4"><Zap className="w-7 h-7 text-muted-foreground" /></div>
                      <h3 className="text-base font-semibold text-foreground mb-1">No automations yet</h3>
                      <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">Create your first automation or start from a template to schedule agent tasks and build workflows.</p>
                      <div className="flex items-center justify-center gap-3">
                        <Button variant="outline" onClick={openCreate} className="gap-2"><Plus className="w-4 h-4" />Create from Scratch</Button>
                        <Button variant="outline" onClick={() => setActiveTab("templates")} className="gap-2"><FileText className="w-4 h-4" />Browse Templates</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <motion.div className="grid grid-cols-1 gap-4" variants={containerVariants} initial="hidden" animate="show">
                {automations.map((auto) => {
                  const autoLogs = logsByAutomation.get(auto.id) ?? [];
                  const agentLabel = KNOWN_AGENTS.find((a) => a.id === auto.agentId)?.name;
                  return (
                    <motion.div key={auto.id} variants={itemVariants}>
                      <Card className="hover:border-[#3730a3]/20 transition-all duration-300">
                        <CardContent className="p-5">
                          <div className="flex flex-col gap-4">
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2.5 mb-2 flex-wrap">
                                  <h3 className="text-sm font-semibold text-foreground truncate">{auto.name}</h3>
                                  <Badge variant="outline" className={cn("text-[10px] flex-shrink-0", triggerBadgeStyles[auto.triggerType])}>{auto.triggerType}</Badge>
                                  {auto.enabled ? <Badge variant="success" className="text-[10px] flex-shrink-0 gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Active</Badge> : <Badge variant="secondary" className="text-[10px] flex-shrink-0">Paused</Badge>}
                                </div>
                                {auto.description && <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{auto.description}</p>}
                                <FlowPreview triggerType={auto.triggerType} triggerValue={resolveTriggerConfig(auto) || undefined} actionType={auto.actionType} agentLabel={agentLabel} compact />
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0 sm:ml-4">
                                <button onClick={() => handleToggle(auto)} className={cn("relative rounded-full transition-colors duration-200 flex-shrink-0", auto.enabled ? "bg-[#3730a3]" : "bg-[#e8e5df]")} style={{ width: "40px", height: "22px" }} aria-label={auto.enabled ? "Disable" : "Enable"}>
                                  <span className={cn("absolute top-[3px] w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200", auto.enabled ? "translate-x-[21px]" : "translate-x-[3px]")} />
                                </button>
                                <Button variant="ghost" size="sm" onClick={() => openEdit(auto)} className="text-xs gap-1.5 text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /><span className="hidden sm:inline">Edit</span></Button>
                                <Button variant="ghost" size="sm" onClick={() => handleClone(auto)} className="text-xs gap-1.5 text-muted-foreground hover:text-foreground" title="Clone automation"><Copy className="w-3.5 h-3.5" /></Button>
                                {deleteConfirm === auto.id ? (
                                  <div className="flex items-center gap-1">
                                    <Button variant="destructive" size="sm" onClick={() => handleDelete(auto.id)} className="text-[10px] h-7 px-2">Confirm</Button>
                                    <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(null)} className="text-[10px] h-7 px-2"><X className="w-3 h-3" /></Button>
                                  </div>
                                ) : (
                                  <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(auto.id)} className="text-xs gap-1.5 text-muted-foreground hover:text-red-400"><TrashIcon className="w-3.5 h-3.5" /></Button>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-[#f0ede8]">
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                                <div className="flex items-center gap-1.5"><Play className="w-3 h-3" /><span>{auto.runCount} runs</span></div>
                                {auto.agentId && <div className="flex items-center gap-1.5"><Bot className="w-3 h-3" /><span>{agentLabel ?? auto.agentId}</span></div>}
                                {auto.lastRunAt && <div className="flex items-center gap-1.5"><Clock className="w-3 h-3" /><span>Last: {timeAgo(auto.lastRunAt)}</span></div>}
                              </div>
                              {autoLogs.length > 0 && (
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-muted-foreground mr-1">Recent:</span>
                                  {autoLogs.map((log) => <LogStatusBadge key={log.id} status={log.status} />)}
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Tab: Templates */}
        {activeTab === "templates" && (
          <motion.div key="tab-templates" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-foreground mb-1">Quick Start Templates</h3>
              <p className="text-xs text-muted-foreground">Pre-built automation configs to get you started quickly. Click to review and save.</p>
            </div>
            <motion.div className="grid grid-cols-1 sm:grid-cols-2 gap-4" variants={containerVariants} initial="hidden" animate="show">
              {TEMPLATES.map((tpl) => (
                <motion.div key={tpl.id} variants={itemVariants}>
                  <Card className="hover:border-[#3730a3]/20 transition-all duration-300 h-full">
                    <CardContent className="p-5 flex flex-col h-full">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-9 h-9 rounded-lg bg-[#f5f3ef] border border-[#e8e5df] flex items-center justify-center flex-shrink-0">{templateIcon(tpl.icon)}</div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-semibold text-foreground mb-0.5">{tpl.name}</h4>
                          <p className="text-xs text-muted-foreground line-clamp-2">{tpl.description}</p>
                        </div>
                      </div>
                      <div className="mb-4">
                        <FlowPreview triggerType={tpl.form.triggerType} triggerValue={tpl.form.triggerConfig || undefined} actionType={tpl.form.actionType} agentLabel={KNOWN_AGENTS.find((a) => a.id === tpl.form.agentId)?.name} compact />
                      </div>
                      <div className="mt-auto">
                        <Button variant="outline" size="sm" onClick={() => applyTemplate(tpl)} className="w-full gap-2 text-xs"><CheckCheck className="w-3.5 h-3.5" />Use Template</Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        )}

        {/* Tab: Logs */}
        {activeTab === "logs" && (
          <motion.div key="tab-logs" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
            {allLogs.length === 0 ? (
              <Card>
                <CardContent className="py-16">
                  <div className="text-center">
                    <div className="w-14 h-14 rounded-full bg-[#f5f3ef] flex items-center justify-center mx-auto mb-4"><FileText className="w-7 h-7 text-muted-foreground" /></div>
                    <h3 className="text-base font-semibold text-foreground mb-1">No execution logs yet</h3>
                    <p className="text-sm text-muted-foreground max-w-sm mx-auto">Logs will appear here once your automations start running.</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <motion.div className="space-y-2" variants={containerVariants} initial="hidden" animate="show">
                {allLogs.map((log) => {
                  const automation = automations.find((a) => a.id === log.automationId);
                  return (
                    <motion.div key={log.id} variants={itemVariants}>
                      <Card className="hover:border-[#3730a3]/10 transition-colors duration-200">
                        <CardContent className="px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <Badge variant="outline" className={cn("text-[10px] flex-shrink-0 gap-1", logStatusStyles[log.status])}>
                                {log.status === "success" && <CheckCircle2 className="w-3 h-3" />}
                                {log.status === "error" && <AlertCircle className="w-3 h-3" />}
                                {log.status === "running" && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />}
                                <span className="capitalize">{log.status}</span>
                              </Badge>
                              <span className="text-xs font-medium text-foreground truncate">{automation?.name ?? `Automation #${log.automationId}`}</span>
                              {log.errorMessage && <span className="text-[10px] text-red-500 truncate hidden sm:inline">— {log.errorMessage}</span>}
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDuration(log.durationMs)}</span>
                              <span className="text-[10px]">{timeAgo(log.createdAt)}</span>
                            </div>
                          </div>
                          {log.errorMessage && <p className="text-[10px] text-red-500 mt-1.5 sm:hidden line-clamp-1">{log.errorMessage}</p>}
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Wizard Panel */}
      <AnimatePresence>
        {panelOpen && (
          <>
            <motion.div className="fixed inset-0 z-50 bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={() => setPanelOpen(false)} />
            <motion.div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white border-l shadow-2xl flex flex-col" style={{ borderColor: "#e8e5df" }} initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 250 }}>
              <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "#e8e5df" }}>
                <h2 className="text-base font-semibold text-foreground">{editingId ? "Edit Automation" : "Create Automation"}</h2>
                <button onClick={() => setPanelOpen(false)} className="p-1.5 rounded-lg hover:bg-[#f5f3ef] transition-colors"><X className="w-5 h-5 text-muted-foreground" /></button>
              </div>
              <div className="px-6 pt-5">{renderWizardProgress()}</div>
              <div className="flex-1 overflow-y-auto px-6 pb-5 custom-scrollbar">
                <AnimatePresence mode="wait">
                  {wizardStep === 1 && <motion.div key="step-1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>{renderStep1()}</motion.div>}
                  {wizardStep === 2 && <motion.div key="step-2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>{renderStep2()}</motion.div>}
                  {wizardStep === 3 && <motion.div key="step-3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>{renderStep3()}</motion.div>}
                </AnimatePresence>
              </div>
              <div className="flex items-center justify-between px-6 py-4 border-t" style={{ borderColor: "#e8e5df" }}>
                <div>{wizardStep > 1 && <Button variant="ghost" onClick={() => setWizardStep((s) => (s === 3 ? 2 : 1) as 1 | 2 | 3)} disabled={saving} className="gap-2 text-muted-foreground"><ChevronRight className="w-4 h-4 rotate-180" />Back</Button>}</div>
                <div className="flex items-center gap-3">
                  {wizardStep < 3 ? (
                    <Button onClick={() => setWizardStep((s) => (s === 1 ? 2 : 3) as 1 | 2 | 3)} disabled={wizardStep === 1 && !canProceedStep1} className="gap-2">Next<ChevronRight className="w-4 h-4" /></Button>
                  ) : (
                    <Button onClick={handleSave} disabled={!form.name.trim() || saving} className="gap-2">
                      {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCheck className="w-4 h-4" />}
                      {editingId ? "Update" : "Create"}
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
