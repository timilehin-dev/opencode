"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/core/utils";
import {
  Brain,
  Zap,
  MessageSquare,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  Loader2,
  Activity,
  Bot,
  ChevronRight,
  Radio,
  Lightbulb,
  Play,
  Check,
  X,
  ListTodo,
  ExternalLink,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProactiveHeartbeat {
  success: boolean;
  data: {
    systemState: {
      timestamp: string;
      agentStatuses: Array<{
        id: string;
        status: string;
        currentTask: string | null;
        lastActivity: string | null;
        tasksCompleted: number;
      }>;
      pendingTasks: number;
      dueRoutines: number;
      unreadA2AMessages: number;
      activeProjects: number;
      failedTasksNeedingEscalation: number;
      scheduledWorkflows: number;
    };
    proactivePlan: {
      summary: string;
      urgency: "idle" | "low" | "medium" | "high" | "critical";
      actions: Array<{
        type: string;
        agent: string;
        action: string;
        reasoning: string;
        priority: string;
      }>;
      recommendations: string[];
    };
    meta: {
      generatedAt: string;
      latencyMs: number;
      usedLLM: boolean;
    };
  };
}

const URGENCY_CONFIG: Record<string, { color: string; bg: string; border: string; label: string; icon: typeof Brain }> = {
  critical: { color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/30", label: "Critical", icon: AlertTriangle },
  high: { color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/30", label: "High", icon: Zap },
  medium: { color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/30", label: "Medium", icon: Clock },
  low: { color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/30", label: "Low", icon: Activity },
  idle: { color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/30", label: "Idle", icon: CheckCircle2 },
};

const ACTION_TYPE_ICONS: Record<string, typeof MessageSquare> = {
  execute_task: MessageSquare,
  process_a2a: MessageSquare,
  escalate_failure: AlertTriangle,
  run_routine: Clock,
  delegate: ArrowRight,
  coordinate: Bot,
};

const AGENT_EMOJI: Record<string, string> = {
  general: "\uD83E\uDDD4",
  mail: "\u2709\uFE0F",
  code: "\uD83D\uDCBB",
  data: "\uD83D\uDCCA",
  creative: "\uD83E\uDDE0",
  research: "\uD83D\uDD0D",
  ops: "\u26A1",
  system: "\uD83D\uDEE1\uFE0F",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SystemIntelligenceCard() {
  const [heartbeat, setHeartbeat] = useState<ProactiveHeartbeat | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [processingAction, setProcessingAction] = useState<number | null>(null);
  const [processedActions, setProcessedActions] = useState<Set<number>>(new Set());
  const [processingRec, setProcessingRec] = useState<number | null>(null);
  const [processedRecs, setProcessedRecs] = useState<Map<number, "run" | "dismiss">>(new Map());
  const [actionResults, setActionResults] = useState<Map<string, string>>(new Map());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchHeartbeat = useCallback(async () => {
    try {
      const res = await fetch("/api/proactive/heartbeat");
      const data = await res.json();
      setHeartbeat(data);
    } catch {
      // Silent fail — will retry on next interval
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHeartbeat();
    intervalRef.current = setInterval(fetchHeartbeat, 120_000); // Refresh every 2 min
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchHeartbeat]);

  if (loading) {
    return (
      <div className="bento-card flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!heartbeat?.data) return null;

  const { systemState, proactivePlan, meta } = heartbeat.data;
  const urgencyConfig = URGENCY_CONFIG[proactivePlan.urgency] || URGENCY_CONFIG.idle;
  const UrgencyIcon = urgencyConfig.icon;
  const totalWorkItems =
    systemState.pendingTasks +
    systemState.dueRoutines +
    systemState.unreadA2AMessages +
    systemState.failedTasksNeedingEscalation +
    systemState.scheduledWorkflows;
  const activeAgents = systemState.agentStatuses.filter((s) => s.status === "busy").length;

  // ── Run action: Creates task + taskboard item + records for dedup ──
  const handleRunAction = async (actionIndex: number, agent: string, action: string, priority: string) => {
    if (processingAction === actionIndex) return;
    setProcessingAction(actionIndex);
    try {
      const res = await fetch("/api/proactive/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run", suggestion: action, agent, priority }),
      });
      const json = await res.json();
      if (json.success) {
        setProcessedActions((prev) => new Set(prev).add(actionIndex));
        const msg = json.data?.message || "Dispatched";
        setActionResults((prev) => new Map(prev).set(String(actionIndex), msg));
      }
    } catch {
      // Silent fail
    } finally {
      setProcessingAction(null);
    }
  };

  // ── Run recommendation: Creates task + taskboard item + records for dedup ──
  const handleRunRecommendation = async (recIndex: number, rec: string) => {
    if (processingRec === recIndex) return;
    setProcessingRec(recIndex);
    try {
      const res = await fetch("/api/proactive/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run", suggestion: rec, priority: "low" }),
      });
      const json = await res.json();
      if (json.success) {
        setProcessedRecs((prev) => new Map(prev).set(recIndex, "run"));
        const msg = json.data?.message || "Executed";
        setActionResults((prev) => new Map(prev).set(String(recIndex), msg));
      }
    } catch {
      // Silent fail
    } finally {
      setProcessingRec(null);
    }
  };

  // ── Dismiss recommendation: Records for dedup so it won't reappear ──
  const handleDismissRecommendation = async (recIndex: number, rec: string) => {
    if (processingRec === recIndex) return;
    setProcessingRec(recIndex);
    try {
      const res = await fetch("/api/proactive/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss", suggestion: rec }),
      });
      const json = await res.json();
      if (json.success) {
        setProcessedRecs((prev) => new Map(prev).set(recIndex, "dismiss"));
      }
    } catch {
      // Silent fail
    } finally {
      setProcessingRec(null);
    }
  };

  const urgencyGlowClass =
    proactivePlan.urgency === "critical"
      ? "shadow-[0_0_12px_rgba(239,68,68,0.25)] animate-[glow-red_2s_ease-in-out_infinite]"
      : proactivePlan.urgency === "high"
        ? "shadow-[0_0_12px_rgba(249,115,22,0.2)] animate-[glow-orange_2s_ease-in-out_infinite]"
        : proactivePlan.urgency === "idle"
          ? "shadow-[0_0_12px_rgba(16,185,129,0.15)] animate-[glow-green_2s_ease-in-out_infinite]"
          : "";

  return (
    <div className={cn("bento-card flex flex-col", urgencyGlowClass)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", urgencyConfig.bg)}>
            <Brain className={cn("w-4 h-4", urgencyConfig.color)} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">System Intelligence</h3>
            <p className="text-[10px] text-muted-foreground">
              {meta.usedLLM ? "AI-driven" : "Auto"} · {meta.latencyMs}ms
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold",
              urgencyConfig.bg,
              urgencyConfig.color,
              urgencyConfig.border,
              "border",
            )}
          >
            <UrgencyIcon className="w-3 h-3" />
            {urgencyConfig.label}
          </span>
          <button
            onClick={() => fetchHeartbeat()}
            className="p-1 rounded-md hover:bg-muted transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-3 h-3 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Summary */}
      <p className="text-[11px] text-foreground leading-relaxed mb-3">
        {proactivePlan.summary}
      </p>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        <div className="text-center py-1.5 rounded-lg bg-card/60">
          <div className="text-sm font-bold text-foreground">{activeAgents}/{systemState.agentStatuses.length}</div>
          <div className="text-[9px] text-muted-foreground">Agents Active</div>
        </div>
        <div className="text-center py-1.5 rounded-lg bg-card/60">
          <div className="text-sm font-bold text-foreground">{totalWorkItems}</div>
          <div className="text-[9px] text-muted-foreground">Work Items</div>
        </div>
        <div className="text-center py-1.5 rounded-lg bg-card/60">
          <div className="text-sm font-bold text-foreground">{proactivePlan.actions.length}</div>
          <div className="text-[9px] text-muted-foreground">Planned</div>
        </div>
      </div>

      {/* Work Queue Breakdown */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        {systemState.pendingTasks > 0 && (
          <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
            {systemState.pendingTasks} tasks
          </span>
        )}
        {systemState.unreadA2AMessages > 0 && (
          <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20">
            {systemState.unreadA2AMessages} A2A msgs
          </span>
        )}
        {systemState.dueRoutines > 0 && (
          <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 border border-purple-500/20">
            {systemState.dueRoutines} routines
          </span>
        )}
        {systemState.failedTasksNeedingEscalation > 0 && (
          <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 border border-red-500/20">
            {systemState.failedTasksNeedingEscalation} failed
          </span>
        )}
        {systemState.activeProjects > 0 && (
          <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
            {systemState.activeProjects} projects
          </span>
        )}
        {totalWorkItems === 0 && (
          <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
            All clear
          </span>
        )}
      </div>

      {/* Proactive Actions (expandable) */}
      {proactivePlan.actions.length > 0 && (
        <div className="space-y-1.5">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors w-full"
          >
            <Radio className="w-3 h-3" />
            Proactive Actions
            <ChevronRight
              className={cn(
                "w-3 h-3 ml-auto transition-transform",
                expanded && "rotate-90",
              )}
            />
          </button>

          {expanded && (
            <div className="space-y-1 overflow-y-auto custom-scrollbar max-h-40">
              {proactivePlan.actions.map((action, i) => {
                const ActionIcon = ACTION_TYPE_ICONS[action.type] || Activity;
                const isProcessed = processedActions.has(i);
                const isProcessing = processingAction === i;
                const resultMsg = actionResults.get(String(i));
                const priorityColors: Record<string, string> = {
                  critical: "bg-red-500/10 text-red-500",
                  high: "bg-orange-500/10 text-orange-500",
                  medium: "bg-amber-500/10 text-amber-500",
                  low: "bg-blue-500/10 text-blue-500",
                };

                return (
                  <div
                    key={i}
                    className={cn(
                      "flex items-start gap-2 px-2 py-1.5 rounded-lg bg-card/60 border transition-colors",
                      isProcessed
                        ? "border-emerald-500/20 bg-emerald-500/5"
                        : "border-border/30 hover:border-border/50",
                    )}
                  >
                    <span className="text-xs mt-0.5">
                      {AGENT_EMOJI[action.agent] || "\uD83E\uDD16"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <ActionIcon className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        <span className="text-[10px] font-medium text-foreground truncate">
                          {action.action}
                        </span>
                      </div>
                      <p className="text-[9px] text-muted-foreground/70 mt-0.5 truncate">
                        {action.reasoning}
                      </p>
                      {resultMsg && isProcessed && (
                        <p className="text-[9px] text-emerald-600 mt-0.5 flex items-center gap-1">
                          <ListTodo className="w-2.5 h-2.5" />
                          {resultMsg}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                      {isProcessed && (
                        <span className="text-[8px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center gap-0.5">
                          <Check className="w-2.5 h-2.5" />
                          Done
                        </span>
                      )}
                      {!isProcessed && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRunAction(i, action.agent, action.action, action.priority);
                          }}
                          disabled={isProcessing}
                          className={cn(
                            "flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[8px] font-semibold transition-all",
                            "bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40",
                          )}
                          title="Run this action — creates task + adds to Task Board"
                        >
                          {isProcessing ? (
                            <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          ) : (
                            <Play className="w-2.5 h-2.5" />
                          )}
                          Run
                        </button>
                      )}
                      <span
                        className={cn(
                          "text-[8px] font-semibold px-1.5 py-0.5 rounded-full",
                          priorityColors[action.priority] || priorityColors.medium,
                        )}
                      >
                        {action.priority}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Recommendations — with Run + Dismiss buttons */}
      {proactivePlan.recommendations.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            <Lightbulb className="w-3 h-3 text-amber-400" />
            Recommendations
          </div>
          <div className="space-y-1">
            {proactivePlan.recommendations.map((rec, i) => {
              const recState = processedRecs.get(i);
              const isProcessing = processingRec === i;
              const resultMsg = actionResults.get(String(i));

              // Don't show already-processed recommendations
              if (recState === "dismiss") return null;

              return (
                <div
                  key={i}
                  className={cn(
                    "flex items-start gap-2 px-2 py-1.5 rounded-lg border transition-colors",
                    recState === "run"
                      ? "bg-emerald-500/5 border-emerald-500/20"
                      : "bg-amber-500/5 border-amber-500/10",
                  )}
                >
                  <Lightbulb className="w-3 h-3 text-amber-400/60 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-[10px] leading-relaxed",
                      recState === "run" ? "text-emerald-700/80 dark:text-emerald-400/80" : "text-foreground/80",
                    )}>
                      {rec}
                    </p>
                    {resultMsg && recState === "run" && (
                      <p className="text-[9px] text-emerald-600 mt-0.5 flex items-center gap-1">
                        <Check className="w-2.5 h-2.5" />
                        {resultMsg}
                      </p>
                    )}
                  </div>
                  {!recState && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleRunRecommendation(i, rec)}
                        disabled={isProcessing}
                        className={cn(
                          "flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[8px] font-semibold transition-all",
                          "bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40",
                        )}
                        title="Execute — creates task + adds to Task Board + won't reappear"
                      >
                        {isProcessing ? (
                          <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        ) : (
                          <Play className="w-2.5 h-2.5" />
                        )}
                        Run
                      </button>
                      <button
                        onClick={() => handleDismissRecommendation(i, rec)}
                        disabled={isProcessing}
                        className="flex items-center gap-0.5 px-1 py-0.5 rounded-md text-[8px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
                        title="Dismiss — won't appear again"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  )}
                  {recState === "run" && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <a
                        href="/taskboard"
                        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[8px] font-semibold text-primary hover:bg-primary/10 transition-colors"
                        title="View on Task Board"
                      >
                        <ExternalLink className="w-2.5 h-2.5" />
                        Board
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {proactivePlan.recommendations.length === 0 && (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
          <CheckCircle2 className="w-3 h-3 text-emerald-500/60 flex-shrink-0" />
          <p className="text-[10px] text-muted-foreground">
            No recommendations — system is running optimally
          </p>
        </div>
      )}

      {/* Last Updated */}
      <div className="mt-auto pt-2 border-t border-border/30">
        <p className="text-[9px] text-muted-foreground/60">
          Updated {new Date(meta.generatedAt).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}
