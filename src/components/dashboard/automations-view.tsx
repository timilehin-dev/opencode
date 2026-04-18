"use client";

import { useState, useEffect, useCallback } from "react";
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
} from "@/components/icons";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/helpers";
import {
  type AutomationItem,
  getAllAutomations,
  createAutomation,
  updateAutomation,
  deleteAutomation,
} from "@/lib/automations-store";
import type { PageKey } from "@/components/dashboard/sidebar";

// ---------------------------------------------------------------------------
// Agent options (hardcoded from agent definitions)
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
// Animation variants
// ---------------------------------------------------------------------------

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

// ---------------------------------------------------------------------------
// Badge styles
// ---------------------------------------------------------------------------

const triggerBadgeStyles: Record<string, string> = {
  schedule: "bg-blue-500/20 text-blue-600 border-blue-500/30",
  event: "bg-purple-500/20 text-purple-600 border-purple-500/30",
  manual: "bg-slate-500/20 text-[#1a1a1a] border-slate-500/30",
};

// ---------------------------------------------------------------------------
// Schedule presets
// ---------------------------------------------------------------------------

const schedulePresets = [
  { label: "Every 30 minutes", value: "*/30 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Every day at 9am", value: "0 9 * * *" },
  { label: "Every day at midnight", value: "0 0 * * *" },
  { label: "Every Monday at 9am", value: "0 9 * * 1" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AutomationsViewProps {
  onNavigate?: (key: PageKey) => void;
}

export function AutomationsView({ onNavigate: _onNavigate }: AutomationsViewProps) {
  const [automations, setAutomations] = useState<AutomationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<AutomationForm>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // ---------------------------------------------------------------------------
  // Load automations from localStorage
  // ---------------------------------------------------------------------------

  const loadAutomations = useCallback(() => {
    setLoading(true);
    requestAnimationFrame(() => {
      try {
        setAutomations(getAllAutomations());
      } catch {
        // empty
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    loadAutomations();
  }, [loadAutomations]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setPanelOpen(true);
  };

  const openEdit = (auto: AutomationItem) => {
    setEditingId(auto.id);
    setForm({
      name: auto.name,
      description: auto.description,
      triggerType: auto.triggerType,
      triggerConfig: typeof auto.triggerConfig.schedule === "string" ? auto.triggerConfig.schedule : "",
      actionType: auto.actionType as "agent_task" | "notification",
      actionConfig: typeof auto.actionConfig.prompt === "string"
        ? auto.actionConfig.prompt
        : typeof auto.actionConfig.message === "string"
          ? auto.actionConfig.message
          : "",
      agentId: auto.agentId || "",
      enabled: auto.enabled,
    });
    setPanelOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.triggerType || !form.actionType) return;
    setSaving(true);

    try {
      // Build trigger config
      const triggerConfig: Record<string, unknown> = {};
      if (form.triggerType === "schedule") {
        triggerConfig.schedule = form.triggerConfig;
      } else if (form.triggerType === "event") {
        triggerConfig.event = form.triggerConfig;
      }

      // Build action config
      const actionConfig: Record<string, unknown> = {};
      if (form.actionType === "agent_task") {
        actionConfig.prompt = form.actionConfig;
      } else {
        actionConfig.message = form.actionConfig;
      }

      if (editingId) {
        updateAutomation(editingId, {
          name: form.name.trim(),
          description: form.description.trim(),
          triggerType: form.triggerType,
          triggerConfig,
          actionType: form.actionType,
          actionConfig,
          agentId: form.agentId || undefined,
          enabled: form.enabled,
        });
      } else {
        createAutomation({
          name: form.name.trim(),
          description: form.description.trim(),
          triggerType: form.triggerType,
          triggerConfig,
          actionType: form.actionType,
          actionConfig,
          agentId: form.agentId || undefined,
          enabled: form.enabled,
        });
      }

      setPanelOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      loadAutomations();
    } catch {
      // silent
    }
    setSaving(false);
  };

  const handleDelete = (id: number) => {
    try {
      deleteAutomation(id);
      setDeleteConfirm(null);
      loadAutomations();
    } catch {
      // silent
    }
  };

  const handleToggle = (auto: AutomationItem) => {
    try {
      updateAutomation(auto.id, { enabled: !auto.enabled });
      loadAutomations();
    } catch {
      // silent
    }
  };

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <motion.div
      key="automations"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Page Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Zap className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-xl font-bold text-foreground">Automations</h2>
          </div>
          <p className="text-sm text-muted-foreground ml-8">
            Create and manage automated workflows for your agents
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          Create Automation
        </Button>
      </div>

      {/* Automation List */}
      {automations.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardContent className="py-16">
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-accent/50 flex items-center justify-center mx-auto mb-4">
                  <Zap className="w-7 h-7 text-muted-foreground" />
                </div>
                <h3 className="text-base font-semibold text-foreground mb-1">No automations yet</h3>
                <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                  Create your first automation to schedule agent tasks, set up event triggers, or build notification workflows.
                </p>
                <Button variant="outline" onClick={openCreate} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Create Automation
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <motion.div
          className="grid grid-cols-1 gap-4"
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          {automations.map((auto) => (
            <motion.div key={auto.id} variants={itemVariants}>
              <Card className="hover:border-primary/20 transition-all duration-300">
                <CardContent className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    {/* Left: Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-sm font-semibold text-foreground truncate">
                          {auto.name}
                        </h3>
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] flex-shrink-0", triggerBadgeStyles[auto.triggerType])}
                        >
                          {auto.triggerType}
                        </Badge>
                        {auto.enabled ? (
                          <Badge variant="success" className="text-[10px] flex-shrink-0 gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] flex-shrink-0">
                            Paused
                          </Badge>
                        )}
                      </div>

                      {auto.description && (
                        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                          {auto.description}
                        </p>
                      )}

                      {/* Metadata row */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Play className="w-3 h-3" />
                          <span>Action: {auto.actionType === "agent_task" ? "Agent Task" : "Notification"}</span>
                        </div>
                        {auto.agentId && (
                          <div className="flex items-center gap-1.5">
                            <Bot className="w-3 h-3" />
                            <span>{KNOWN_AGENTS.find((a) => a.id === auto.agentId)?.name ?? auto.agentId}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <Play className="w-3 h-3" />
                          <span>{auto.runCount} runs</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3 h-3" />
                          <span>
                            Last:{" "}
                            {auto.lastStatus === "success" ? (
                              <span className="text-emerald-600">Success</span>
                            ) : auto.lastStatus === "error" ? (
                              <span className="text-red-400">Error</span>
                            ) : (
                              <span>Never</span>
                            )}
                            {auto.lastRunAt && (
                              <span className="ml-1">({timeAgo(auto.lastRunAt)})</span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0 sm:ml-4">
                      {/* Enabled toggle */}
                      <button
                        onClick={() => handleToggle(auto)}
                        className={cn(
                          "relative w-10 h-5.5 rounded-full transition-colors duration-200 flex-shrink-0",
                          auto.enabled ? "bg-primary" : "bg-muted"
                        )}
                        style={{ width: "40px", height: "22px" }}
                        aria-label={auto.enabled ? "Disable automation" : "Enable automation"}
                      >
                        <span
                          className={cn(
                            "absolute top-[3px] w-4 h-4 rounded-full bg-slate-300 shadow-sm transition-transform duration-200",
                            auto.enabled ? "translate-x-[21px]" : "translate-x-[3px]"
                          )}
                        />
                      </button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(auto)}
                        className="text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Edit</span>
                      </Button>

                      {deleteConfirm === auto.id ? (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(auto.id)}
                            className="text-[10px] h-7 px-2"
                          >
                            Confirm
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteConfirm(null)}
                            className="text-[10px] h-7 px-2"
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteConfirm(auto.id)}
                          className="text-xs gap-1.5 text-muted-foreground hover:text-red-400"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* ---------------------------------------------------------------------------
          Slide-over Panel — Create / Edit
          --------------------------------------------------------------------------- */}
      <AnimatePresence>
        {panelOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 z-50 bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setPanelOpen(false)}
            />

            {/* Panel */}
            <motion.div
              className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-card border-l border-border shadow-2xl flex flex-col"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 250 }}
            >
              {/* Panel Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
                <h2 className="text-base font-semibold text-foreground">
                  {editingId ? "Edit Automation" : "Create Automation"}
                </h2>
                <button
                  onClick={() => setPanelOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-accent transition-colors"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              {/* Panel Body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 custom-scrollbar">
                {/* Name */}
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5">
                    Name <span className="text-red-400">*</span>
                  </label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="My Automation"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5">
                    Description
                  </label>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Describe what this automation does..."
                    rows={3}
                  />
                </div>

                {/* Trigger Type */}
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5">
                    Trigger Type <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={form.triggerType}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        triggerType: e.target.value as "schedule" | "event" | "manual",
                        triggerConfig: "",
                      }))
                    }
                    className="w-full h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="manual">Manual</option>
                    <option value="schedule">Schedule</option>
                    <option value="event">Event</option>
                  </select>
                </div>

                {/* Trigger Config (dynamic) */}
                {form.triggerType === "schedule" && (
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      Schedule
                    </label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {schedulePresets.map((preset) => (
                        <button
                          key={preset.value}
                          onClick={() => setForm((f) => ({ ...f, triggerConfig: preset.value }))}
                          className={cn(
                            "text-[10px] px-2 py-1 rounded-md border transition-colors",
                            form.triggerConfig === preset.value
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                          )}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <Input
                      value={form.triggerConfig}
                      onChange={(e) => setForm((f) => ({ ...f, triggerConfig: e.target.value }))}
                      placeholder="*/30 * * * *"
                      className="font-mono text-xs"
                    />
                  </div>
                )}

                {form.triggerType === "event" && (
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      Event Trigger
                    </label>
                    <Input
                      value={form.triggerConfig}
                      onChange={(e) => setForm((f) => ({ ...f, triggerConfig: e.target.value }))}
                      placeholder="e.g., github.push, gmail.received"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Enter the event type that should trigger this automation.
                    </p>
                  </div>
                )}

                {/* Action Type */}
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5">
                    Action Type <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={form.actionType}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        actionType: e.target.value as "agent_task" | "notification",
                        actionConfig: "",
                      }))
                    }
                    className="w-full h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="agent_task">Agent Task</option>
                    <option value="notification">Notification</option>
                  </select>
                </div>

                {/* Action Config */}
                {form.actionType === "agent_task" && (
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      Task Prompt
                    </label>
                    <Textarea
                      value={form.actionConfig}
                      onChange={(e) => setForm((f) => ({ ...f, actionConfig: e.target.value }))}
                      placeholder="Describe the task the agent should perform..."
                      rows={3}
                    />
                  </div>
                )}

                {form.actionType === "notification" && (
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      Notification Message
                    </label>
                    <Textarea
                      value={form.actionConfig}
                      onChange={(e) => setForm((f) => ({ ...f, actionConfig: e.target.value }))}
                      placeholder="The notification message to send..."
                      rows={3}
                    />
                  </div>
                )}

                {/* Agent Select */}
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5">
                    Target Agent
                  </label>
                  <select
                    value={form.agentId}
                    onChange={(e) => setForm((f) => ({ ...f, agentId: e.target.value }))}
                    className="w-full h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">No agent assigned</option>
                    {KNOWN_AGENTS.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Enabled Toggle */}
                <div className="flex items-center justify-between py-2">
                  <div>
                    <label className="text-xs font-medium text-foreground">Enabled</label>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {form.enabled ? "Automation will run when triggered" : "Automation is paused"}
                    </p>
                  </div>
                  <button
                    onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
                    className={cn(
                      "relative rounded-full transition-colors duration-200 flex-shrink-0",
                      form.enabled ? "bg-primary" : "bg-muted"
                    )}
                    style={{ width: "40px", height: "22px" }}
                    aria-label={form.enabled ? "Disable" : "Enable"}
                  >
                    <span
                      className={cn(
                        "absolute top-[3px] w-4 h-4 rounded-full bg-slate-300 shadow-sm transition-transform duration-200",
                        form.enabled ? "translate-x-[21px]" : "translate-x-[3px]"
                      )}
                    />
                  </button>
                </div>
              </div>

              {/* Panel Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border/50">
                <Button
                  variant="outline"
                  onClick={() => setPanelOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={!form.name.trim() || saving}
                  className="gap-2"
                >
                  {saving ? (
                    <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <CheckCheck className="w-4 h-4" />
                  )}
                  {editingId ? "Update" : "Create"}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
