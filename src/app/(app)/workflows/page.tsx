"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap,
  Plus,
  X,
  ChevronRight,
  Check,
  Loader2,
  Play,
  Pause,
  Ban,
  RotateCcw,
  Eye,
  AlertCircle,
  Search,
  Filter,
  ArrowRight,
  Clock,
  Trophy,
  ListChecks,
  Database,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/core/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkflowStep {
  id: string;
  step_number: number;
  title: string;
  description: string;
  skill_id: string | null;
  skill_name: string | null;
  status: string;
  input_context: string | null;
  output_result: string | null;
  output_summary: string | null;
  validation_score: number | null;
  validation_feedback: string | null;
  error_message: string | null;
  attempts: number;
  max_attempts: number;
  duration_ms: number | null;
  started_at: string | null;
  completed_at: string | null;
}

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  agent_id: string;
  query: string;
  status: string;
  strategy: Record<string, unknown> | null;
  total_steps: number;
  completed_steps: number;
  failed_steps: number;
  quality_score: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  steps?: WorkflowStep[];
}

interface ToastMessage {
  id: string;
  type: "success" | "error" | "info";
  message: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  planning: { label: "Planning", bg: "bg-gray-500/10", text: "text-gray-600 dark:text-gray-400", dot: "bg-gray-500" },
  running: { label: "Running", bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", dot: "bg-blue-500 animate-pulse" },
  completed: { label: "Completed", bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  failed: { label: "Failed", bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400", dot: "bg-red-500" },
  paused: { label: "Paused", bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  cancelled: { label: "Cancelled", bg: "bg-gray-500/10", text: "text-gray-500", dot: "bg-gray-400" },
  pending: { label: "Pending", bg: "bg-gray-500/10", text: "text-gray-500", dot: "bg-gray-400" },
};

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "running", label: "Running" },
  { key: "completed", label: "Completed" },
  { key: "failed", label: "Failed" },
  { key: "paused", label: "Paused" },
  { key: "planning", label: "Planning" },
];

// ---------------------------------------------------------------------------
// Animation Variants
// ---------------------------------------------------------------------------

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
} as const;

const modalOverlayVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
} as const;

const modalContentVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 10 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    y: 5,
    transition: { duration: 0.15 },
  },
} as const;

// ---------------------------------------------------------------------------
// Toast Container
// ---------------------------------------------------------------------------

function ToastContainer({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (id: string) => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-[60] space-y-2">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg min-w-[280px] max-w-sm",
              toast.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                : toast.type === "error"
                  ? "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300"
                  : "bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300",
            )}
          >
            {toast.type === "success" ? (
              <Check className="w-4 h-4 shrink-0" />
            ) : toast.type === "error" ? (
              <AlertCircle className="w-4 h-4 shrink-0" />
            ) : (
              <Eye className="w-4 h-4 shrink-0" />
            )}
            <p className="text-sm flex-1">{toast.message}</p>
            <button onClick={() => onDismiss(toast.id)} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New Workflow Modal
// ---------------------------------------------------------------------------

function NewWorkflowModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (wf: Workflow) => void;
}) {
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!query.trim()) {
      setError("Please enter a task description.");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      // First ensure tables exist
      await fetch("/api/workflows/setup", { method: "POST" }).catch(() => {});

      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, agent_id: "general" }),
      });
      const json = await res.json();

      if (json.success && json.data) {
        const wf: Workflow = {
          id: json.data.workflow_id,
          name: json.data.plan?.strategy_summary?.slice(0, 50) || query.slice(0, 50),
          description: json.data.plan?.strategy_summary || null,
          agent_id: "general",
          query,
          status: "running",
          strategy: json.data.plan,
          total_steps: json.data.plan?.steps?.length || 0,
          completed_steps: 0,
          failed_steps: 0,
          quality_score: null,
          error_message: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          completed_at: null,
        };
        onSuccess(wf);
      } else {
        setError(json.error || "Failed to create workflow.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      variants={modalOverlayVariants}
      initial="hidden"
      animate="show"
      exit="exit"
    >
      <motion.div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative w-full max-w-lg max-h-[85vh] overflow-hidden bg-card border border-border rounded-xl shadow-2xl flex flex-col"
        variants={modalContentVariants}
        initial="hidden"
        animate="show"
        exit="exit"
      >
        <div className="flex items-center justify-between p-6 pb-4 border-b border-border">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              New Workflow
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">Describe a complex multi-step task to decompose</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-600 dark:text-red-400"
            >
              {error}
            </motion.div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Task Description <span className="text-red-500">*</span></label>
            <Textarea
              placeholder="e.g. Research market trends for AI startups in 2024, analyze competitive landscape, and create a strategic brief document"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              rows={4}
            />
            <p className="text-[11px] text-muted-foreground">
              The planner will break this into 2-8 sequential steps using available skills
            </p>
          </div>

          <div className="bg-muted/30 rounded-lg p-3 border border-border/50">
            <p className="text-xs font-medium text-foreground mb-2 flex items-center gap-1.5">
              <ArrowRight className="w-3 h-3 text-muted-foreground" />
              How it works
            </p>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              <li><strong className="text-foreground">Planner</strong> decomposes your task into steps</li>
              <li><strong className="text-foreground">Executor</strong> runs each step with its assigned skill</li>
              <li><strong className="text-foreground">Validator</strong> scores output quality (0-100)</li>
            </ol>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-border bg-muted/10">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !query.trim()} className="gap-2">
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Plan Workflow
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Workflow Detail View
// ---------------------------------------------------------------------------

function WorkflowDetailView({
  workflow,
  onClose,
  onRefresh,
}: {
  workflow: Workflow;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [executing, setExecuting] = useState(false);
  const [executingStep, setExecutingStep] = useState<number | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((type: ToastMessage["type"], message: string) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleExecuteAll = async () => {
    setExecuting(true);
    try {
      const res = await fetch(`/api/workflows/${workflow.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: "general", auto_validate: true }),
      });
      const json = await res.json();
      if (json.success) {
        addToast("success", `Workflow completed — status: ${json.data.status}`);
        onRefresh();
      } else {
        addToast("error", json.error || "Execution failed");
      }
    } catch {
      addToast("error", "Network error during execution");
    } finally {
      setExecuting(false);
    }
  };

  const handleExecuteStep = async (stepNumber: number) => {
    setExecutingStep(stepNumber);
    try {
      const res = await fetch(`/api/workflows/${workflow.id}/steps/${stepNumber}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: "general" }),
      });
      const json = await res.json();
      if (json.success) {
        addToast("success", `Step ${stepNumber}: ${json.data.status}`);
        onRefresh();
      } else {
        addToast("error", json.error || `Step ${stepNumber} execution failed`);
      }
    } catch {
      addToast("error", `Network error executing step ${stepNumber}`);
    } finally {
      setExecutingStep(null);
    }
  };

  const handleCancel = async () => {
    try {
      const res = await fetch(`/api/workflows/${workflow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      const json = await res.json();
      if (json.success) {
        addToast("info", "Workflow cancelled");
        onRefresh();
      } else {
        addToast("error", json.error || "Failed to cancel");
      }
    } catch {
      addToast("error", "Network error");
    }
  };

  const statusCfg = STATUS_CONFIG[workflow.status] || STATUS_CONFIG.pending;

  return (
    <>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        variants={modalOverlayVariants}
        initial="hidden"
        animate="show"
        exit="exit"
      >
        <motion.div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          className="relative w-full max-w-3xl max-h-[90vh] overflow-hidden bg-card border border-border rounded-xl shadow-2xl flex flex-col"
          variants={modalContentVariants}
          initial="hidden"
          animate="show"
          exit="exit"
        >
          {/* Header */}
          <div className="flex items-start justify-between p-6 pb-4 border-b border-border">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Badge className={cn("text-[10px] gap-1", statusCfg.bg, statusCfg.text)}>
                  <span className={cn("w-1.5 h-1.5 rounded-full", statusCfg.dot)} />
                  {statusCfg.label}
                </Badge>
                {workflow.quality_score && (
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <Trophy className="w-3 h-3 text-amber-500" />
                    {workflow.quality_score.toFixed(0)}/100
                  </Badge>
                )}
              </div>
              <h2 className="text-lg font-bold text-foreground truncate">{workflow.name}</h2>
              <p className="text-sm text-muted-foreground mt-1 truncate">{workflow.query}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0 ml-4">
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Actions */}
          <div className="px-6 py-3 border-b border-border bg-muted/20 flex items-center gap-2 flex-wrap">
            {(workflow.status === "running" || workflow.status === "planning") && (
              <>
                <Button
                  size="sm"
                  onClick={handleExecuteAll}
                  disabled={executing}
                  className="gap-1.5 text-xs"
                >
                  {executing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  {executing ? "Executing..." : "Execute All"}
                </Button>
                <Button size="sm" variant="outline" onClick={handleCancel} className="gap-1.5 text-xs text-red-600">
                  <Ban className="w-3.5 h-3.5" />
                  Cancel
                </Button>
              </>
            )}
            {workflow.status === "paused" && (
              <>
                <Button size="sm" onClick={handleExecuteAll} disabled={executing} className="gap-1.5 text-xs">
                  {executing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  Resume
                </Button>
                <Button size="sm" variant="outline" onClick={handleCancel} className="gap-1.5 text-xs text-red-600">
                  <Ban className="w-3.5 h-3.5" />
                  Cancel
                </Button>
              </>
            )}
            {workflow.status === "completed" && (
              <Badge variant="outline" className="text-xs gap-1">
                <Check className="w-3 h-3 text-emerald-500" />
                All steps completed
              </Badge>
            )}
            {workflow.status === "failed" && (
              <>
                <Button size="sm" onClick={handleExecuteAll} disabled={executing} className="gap-1.5 text-xs">
                  {executing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  Retry Failed
                </Button>
                <Button size="sm" variant="outline" onClick={handleCancel} className="gap-1.5 text-xs text-red-600">
                  <Ban className="w-3.5 h-3.5" />
                  Cancel
                </Button>
              </>
            )}
          </div>

          {/* Steps */}
          <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
            {workflow.steps && workflow.steps.length > 0 ? (
              workflow.steps.map((step, idx) => {
                const stepStatus = STATUS_CONFIG[step.status] || STATUS_CONFIG.pending;
                return (
                  <motion.div
                    key={step.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className={cn(
                      "rounded-lg border p-4 transition-colors",
                      step.status === "completed"
                        ? "border-emerald-500/20 bg-emerald-500/5"
                        : step.status === "failed"
                          ? "border-red-500/20 bg-red-500/5"
                          : step.status === "running"
                            ? "border-blue-500/20 bg-blue-500/5"
                            : "border-border bg-muted/20",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {/* Step number */}
                      <div className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold",
                        step.status === "completed"
                          ? "bg-emerald-500 text-white"
                          : step.status === "failed"
                            ? "bg-red-500 text-white"
                            : step.status === "running"
                              ? "bg-blue-500 text-white animate-pulse"
                              : "bg-muted text-muted-foreground",
                      )}>
                        {step.status === "completed" ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : step.status === "failed" ? (
                          <X className="w-3.5 h-3.5" />
                        ) : (
                          step.step_number
                        )}
                      </div>

                      {/* Step content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-sm font-semibold text-foreground">{step.title}</h4>
                          {step.skill_name && step.skill_name !== "none" && (
                            <Badge variant="secondary" className="text-[10px]">
                              {step.skill_name}
                            </Badge>
                          )}
                          <Badge className={cn("text-[9px] gap-0.5", stepStatus.bg, stepStatus.text)}>
                            <span className={cn("w-1 h-1 rounded-full", stepStatus.dot)} />
                            {stepStatus.label}
                          </Badge>
                          {step.duration_ms && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <Clock className="w-3 h-3" />
                              {(step.duration_ms / 1000).toFixed(1)}s
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{step.description}</p>

                        {/* Output summary */}
                        {step.output_summary && (
                          <div className="text-xs text-foreground/80 bg-muted/30 rounded p-2 mb-2 border border-border/50">
                            {step.output_summary}
                          </div>
                        )}

                        {/* Validation score */}
                        {step.validation_score && (
                          <div className="flex items-center gap-1.5">
                            <Trophy className="w-3 h-3 text-amber-500" />
                            <span className={cn(
                              "text-xs font-medium",
                              step.validation_score >= 80 ? "text-emerald-600" :
                              step.validation_score >= 60 ? "text-amber-600" : "text-red-600",
                            )}>
                              {step.validation_score.toFixed(0)}/100
                            </span>
                            {step.validation_feedback && (
                              <span className="text-[10px] text-muted-foreground">
                                — {step.validation_feedback.slice(0, 80)}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Error message */}
                        {step.error_message && (
                          <div className="text-xs text-red-600 dark:text-red-400 mt-1 flex items-start gap-1">
                            <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                            {step.error_message}
                          </div>
                        )}
                      </div>

                      {/* Step actions */}
                      {(step.status === "pending" || step.status === "failed") && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 text-xs gap-1"
                          onClick={() => handleExecuteStep(step.step_number)}
                          disabled={executingStep === step.step_number}
                        >
                          {executingStep === step.step_number ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Play className="w-3 h-3" />
                          )}
                          Run
                        </Button>
                      )}
                    </div>
                  </motion.div>
                );
              })
            ) : (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No steps found. The workflow may still be planning.
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-border bg-muted/10 flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">
              Created {new Date(workflow.created_at).toLocaleString()}
              {workflow.completed_at && ` — Completed ${new Date(workflow.completed_at).toLocaleString()}`}
            </p>
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </motion.div>
      </motion.div>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [setupReady, setSetupReady] = useState(true);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const addToast = useCallback((type: ToastMessage["type"], message: string) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Fetch workflows
  const fetchWorkflows = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("limit", "50");

      const res = await fetch(`/api/workflows?${params.toString()}`);
      const json = await res.json();

      if (json.success) {
        setWorkflows(json.data || []);
      } else if (json.error && json.error.includes("does not exist")) {
        // Tables not set up yet
        setSetupReady(false);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  // Initial fetch + setup check
  useEffect(() => {
    // Check if tables exist
    fetch("/api/workflows/setup")
      .then((r) => r.json())
      .then((json) => {
        if (json.success && !json.all_tables_ready) {
          setSetupReady(false);
        }
      })
      .catch(() => {});

    fetchWorkflows();
  }, [fetchWorkflows]);

  // Poll for running workflows
  useEffect(() => {
    const hasRunning = workflows.some((w) => w.status === "running" || w.status === "planning");

    if (hasRunning) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = setInterval(fetchWorkflows, 3000);
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [workflows, fetchWorkflows]);

  const handleSetup = async () => {
    try {
      const res = await fetch("/api/workflows/setup", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        addToast("success", "Workflow tables created successfully");
        setSetupReady(true);
      } else {
        addToast("error", json.error || "Setup failed");
      }
    } catch {
      addToast("error", "Network error during setup");
    }
  };

  const handleNewSuccess = useCallback(
    (wf: Workflow) => {
      setShowNewModal(false);
      setWorkflows((prev) => [wf, ...prev]);
      addToast("success", `"${wf.name}" workflow created with ${wf.total_steps} steps`);
      // Auto-open detail view
      setTimeout(() => {
        fetchWorkflows();
      }, 1000);
    },
    [addToast, fetchWorkflows],
  );

  const handleRefresh = useCallback(() => {
    fetchWorkflows();
    // Also refresh the detail view if open
    if (selectedWorkflow) {
      fetch(`/api/workflows/${selectedWorkflow.id}`)
        .then((r) => r.json())
        .then((json) => {
          if (json.success && json.data) {
            setSelectedWorkflow(json.data);
          }
        })
        .catch(() => {});
    }
  }, [fetchWorkflows, selectedWorkflow]);

  // Stats
  const totalWorkflows = workflows.length;
  const runningCount = workflows.filter((w) => w.status === "running" || w.status === "planning").length;
  const completedCount = workflows.filter((w) => w.status === "completed").length;
  const failedCount = workflows.filter((w) => w.status === "failed").length;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Agent Workflows</h1>
              <p className="text-sm text-muted-foreground">
                Multi-step AI workflows with planning, execution, and validation
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!setupReady && (
              <Button variant="outline" size="sm" onClick={handleSetup} className="gap-2">
                <Database className="w-4 h-4" />
                Setup DB
              </Button>
            )}
            <Button onClick={() => setShowNewModal(true)} className="gap-2" size="default">
              <Plus className="w-4 h-4" />
              New Workflow
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Setup warning */}
      {!setupReady && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30"
        >
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-amber-600" />
            <p className="text-sm text-amber-700 dark:text-amber-300">
              <strong>Setup required:</strong> The workflow database tables haven&apos;t been created yet. Click &quot;Setup DB&quot; to initialize them.
            </p>
          </div>
        </motion.div>
      )}

      {/* Stats Row */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6"
      >
        {[
          { label: "Total", value: totalWorkflows, icon: ListChecks, color: "text-foreground" },
          { label: "Running", value: runningCount, icon: Play, color: "text-blue-500" },
          { label: "Completed", value: completedCount, icon: Check, color: "text-emerald-500" },
          { label: "Failed", value: failedCount, icon: AlertCircle, color: "text-red-500" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <stat.icon className={cn("w-3.5 h-3.5", stat.color)} />
              <span className="text-[11px] text-muted-foreground">{stat.label}</span>
            </div>
            <span className={cn("text-2xl font-bold", stat.color)}>{stat.value}</span>
          </div>
        ))}
      </motion.div>

      {/* Status Filter */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="mb-6"
      >
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.key}
              onClick={() => setStatusFilter(filter.key)}
              className={cn(
                "flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200 shrink-0",
                statusFilter === filter.key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>{filter.label}</span>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Workflow List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-9 h-9 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-64" />
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Skeleton className="h-2 w-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : workflows.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-16"
        >
          <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
            <Zap className="w-7 h-7 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">No workflows yet</h3>
          <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">
            Create a new workflow to break down complex tasks into sequential steps with automatic quality validation.
          </p>
          <Button onClick={() => setShowNewModal(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Create Your First Workflow
          </Button>
        </motion.div>
      ) : (
        <motion.div
          className="space-y-3"
          variants={containerVariants}
          initial="hidden"
          animate="show"
          key={statusFilter}
        >
          {workflows.map((workflow) => {
            const statusCfg = STATUS_CONFIG[workflow.status] || STATUS_CONFIG.pending;
            const progressPercent = workflow.total_steps > 0
              ? (workflow.completed_steps / workflow.total_steps) * 100
              : 0;
            const isRunning = workflow.status === "running" || workflow.status === "planning";

            return (
              <motion.div key={workflow.id} variants={itemVariants} layout>
                <Card
                  className={cn(
                    "group hover:border-primary/20 transition-all duration-300 hover:shadow-md cursor-pointer overflow-hidden",
                    isRunning && "border-blue-500/30",
                    workflow.status === "failed" && "border-red-500/20",
                  )}
                  onClick={() => setSelectedWorkflow(workflow)}
                >
                  <CardContent className="p-5">
                    {/* Top Row */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className={cn(
                          "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                          workflow.status === "completed"
                            ? "bg-emerald-500/10"
                            : workflow.status === "failed"
                              ? "bg-red-500/10"
                              : workflow.status === "running"
                                ? "bg-blue-500/10"
                                : "bg-muted/50",
                        )}>
                          {workflow.status === "completed" ? (
                            <Check className="w-4 h-4 text-emerald-500" />
                          ) : workflow.status === "failed" ? (
                            <AlertCircle className="w-4 h-4 text-red-500" />
                          ) : workflow.status === "running" || workflow.status === "planning" ? (
                            <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                          ) : workflow.status === "paused" ? (
                            <Pause className="w-4 h-4 text-amber-500" />
                          ) : (
                            <Zap className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                            {workflow.name}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {workflow.query}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {workflow.quality_score && (
                          <Badge variant="outline" className="text-[10px] gap-0.5">
                            <Trophy className="w-3 h-3 text-amber-500" />
                            {workflow.quality_score.toFixed(0)}
                          </Badge>
                        )}
                        <Badge className={cn("text-[10px] gap-0.5", statusCfg.bg, statusCfg.text)}>
                          <span className={cn("w-1.5 h-1.5 rounded-full", statusCfg.dot)} />
                          {statusCfg.label}
                        </Badge>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    {workflow.total_steps > 0 && (
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <motion.div
                            className={cn(
                              "h-full rounded-full",
                              workflow.status === "completed"
                                ? "bg-emerald-500"
                                : workflow.status === "failed"
                                  ? "bg-red-500"
                                  : "bg-primary",
                            )}
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.max(progressPercent, 0)}%` }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground font-medium shrink-0">
                          {workflow.completed_steps}/{workflow.total_steps} steps
                          {workflow.failed_steps > 0 && (
                            <span className="text-red-500 ml-1">({workflow.failed_steps} failed)</span>
                          )}
                        </span>
                      </div>
                    )}

                    {/* Bottom meta */}
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-0.5">
                        <Clock className="w-3 h-3" />
                        {new Date(workflow.created_at).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <ListChecks className="w-3 h-3" />
                        {workflow.total_steps} steps
                      </span>
                      {workflow.steps && workflow.steps.length > 0 && (
                        <span className="flex items-center gap-0.5">
                          <ChevronRight className="w-3 h-3" />
                          View details
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {showNewModal && (
          <NewWorkflowModal onClose={() => setShowNewModal(false)} onSuccess={handleNewSuccess} />
        )}
        {selectedWorkflow && (
          <WorkflowDetailView
            workflow={selectedWorkflow}
            onClose={() => setSelectedWorkflow(null)}
            onRefresh={handleRefresh}
          />
        )}
      </AnimatePresence>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
