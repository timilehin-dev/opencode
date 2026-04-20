"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock,
  Plus,
  Trash2,
  X,
  CheckCircle,
  Play,
  Pause,
  ChevronDown,
  Filter,
  RefreshCw,
  Timer,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getAllAgents } from "@/lib/agents";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RoutinePriority = "high" | "medium" | "low";

interface Routine {
  id: string;
  agent_id: string;
  name: string;
  task: string;
  context: string | null;
  interval_minutes: number;
  priority: RoutinePriority;
  is_active: boolean;
  last_run: string | null;
  next_run: string | null;
  last_result: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INTERVAL_PRESETS: { label: string; value: number }[] = [
  { label: "5 min", value: 5 },
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "1 hr", value: 60 },
  { label: "6 hr", value: 360 },
  { label: "12 hr", value: 720 },
  { label: "24 hr", value: 1440 },
  { label: "Weekly", value: 10080 },
];

const PRIORITY_CONFIG: Record<
  RoutinePriority,
  { label: string; badgeClass: string; dotClass: string }
> = {
  high: { label: "High", badgeClass: "bg-red-100 text-red-700 border-red-200", dotClass: "bg-red-500" },
  medium: { label: "Medium", badgeClass: "bg-amber-100 text-amber-700 border-amber-200", dotClass: "bg-amber-500" },
  low: { label: "Low", badgeClass: "bg-green-100 text-green-700 border-green-200", dotClass: "bg-green-500" },
};

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatInterval(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  if (minutes < 10080) return `${Math.floor(minutes / 1440)}d`;
  return `${Math.floor(minutes / 10080)}w`;
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const d = new Date(dateStr);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getNextRunLabel(nextRun: string | null, isActive: boolean): string {
  if (!isActive) return "Paused";
  if (!nextRun) return "Scheduled";
  const diff = new Date(nextRun).getTime() - Date.now();
  if (diff < 0) return "Overdue";
  if (diff < 60000) return "Shortly";
  if (diff < 3600000) return `In ${Math.ceil(diff / 60000)}m`;
  if (diff < 86400000) return `In ${Math.floor(diff / 3600000)}h`;
  return `In ${Math.floor(diff / 86400000)}d`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RoutinesPage() {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [filterAgent, setFilterAgent] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editRoutine, setEditRoutine] = useState<Routine | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [agents, setAgents] = useState<{ id: string; name: string; role: string }[]>([]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const fetchRoutines = useCallback(async () => {
    try {
      const res = await fetch("/api/cron/agent-routines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list" }),
      });
      const json = await res.json();
      if (json.success) {
        setRoutines(json.data || []);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    setAgents(getAllAgents().map((a) => ({ id: a.id, name: a.name, role: a.role })));
  }, []);

  useEffect(() => {
    fetchRoutines().finally(() => setLoading(false));
  }, [fetchRoutines]);

  // Auto-refresh next_run times every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchRoutines, 30000);
    return () => clearInterval(interval);
  }, [fetchRoutines]);

  // Stats
  const stats = useMemo(() => {
    const active = routines.filter((r) => r.is_active).length;
    const byAgent: Record<string, number> = {};
    for (const r of routines) {
      byAgent[r.agent_id] = (byAgent[r.agent_id] || 0) + 1;
    }
    return { total: routines.length, active, byAgent };
  }, [routines]);

  // Filtered routines
  const filteredRoutines = useMemo(() => {
    if (filterAgent === "all") return routines;
    return routines.filter((r) => r.agent_id === filterAgent);
  }, [routines, filterAgent]);

  // Handlers
  const handleDelete = async (routineId: string) => {
    if (!confirm("Delete this routine? This cannot be undone.")) return;
    try {
      const res = await fetch("/api/cron/agent-routines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", routineId }),
      });
      const json = await res.json();
      if (json.success) {
        showToast("Routine deleted");
        setEditRoutine(null);
        fetchRoutines();
      }
    } catch {
      showToast("Failed to delete routine");
    }
  };

  const handleToggleActive = async (routine: Routine) => {
    try {
      const res = await fetch("/api/cron/agent-routines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", routineId: routine.id, isActive: !routine.is_active }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(routine.is_active ? "Routine paused" : "Routine activated");
        fetchRoutines();
      }
    } catch {
      showToast("Failed to toggle routine");
    }
  };

  const getAgentName = (agentId: string): string => {
    return agents.find((a) => a.id === agentId)?.name || agentId;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[#3730a3] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

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
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Clock className="w-5 h-5 text-[#3730a3]" />
            <h1 className="text-xl font-bold text-foreground">Agent Routines</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-8">
            Schedule automated tasks for your agents
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={fetchRoutines}>
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
          <Button
            size="sm"
            className="gap-2 text-xs bg-[#3730a3] hover:bg-[#3730a3]/90"
            onClick={() => {
              setShowCreate(true);
              setEditRoutine(null);
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            New Routine
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <div className="rounded-xl border border-[#e8e5df] bg-white p-3">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Timer className="w-4 h-4" />
            <span className="text-[10px] font-medium uppercase tracking-wider">Total</span>
          </div>
          <p className="text-lg font-bold text-[#3730a3]">{stats.total}</p>
        </div>
        <div className="rounded-xl border border-[#e8e5df] bg-white p-3">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Play className="w-4 h-4" />
            <span className="text-[10px] font-medium uppercase tracking-wider">Active</span>
          </div>
          <p className="text-lg font-bold text-emerald-600">{stats.active}</p>
        </div>
        <div className="rounded-xl border border-[#e8e5df] bg-white p-3">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Pause className="w-4 h-4" />
            <span className="text-[10px] font-medium uppercase tracking-wider">Paused</span>
          </div>
          <p className="text-lg font-bold text-muted-foreground">{stats.total - stats.active}</p>
        </div>
      </div>

      {/* Agent filter */}
      <div className="flex items-center gap-3 mb-6 overflow-x-auto pb-1 scrollbar-none">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Agent:</span>
        </div>
        <div className="flex items-center gap-1 bg-[#f5f3ef] rounded-lg p-0.5">
          <button
            onClick={() => setFilterAgent("all")}
            className={cn(
              "px-2.5 py-1 text-[10px] rounded-md transition-colors whitespace-nowrap",
              filterAgent === "all" ? "bg-white text-foreground shadow-sm font-medium" : "text-muted-foreground"
            )}
          >
            All ({stats.total})
          </button>
          {agents.map((agent) => {
            const count = stats.byAgent[agent.id] || 0;
            if (count === 0) return null;
            return (
              <button
                key={agent.id}
                onClick={() => setFilterAgent(agent.id)}
                className={cn(
                  "px-2.5 py-1 text-[10px] rounded-md transition-colors whitespace-nowrap",
                  filterAgent === agent.id ? "bg-white text-foreground shadow-sm font-medium" : "text-muted-foreground"
                )}
              >
                {agent.name} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Create form (inline expand) */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-6"
          >
            <RoutineForm
              agents={agents}
              saving={saving}
              onSave={async (data) => {
                setSaving(true);
                try {
                  const res = await fetch("/api/cron/agent-routines", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "create", ...data }),
                  });
                  const json = await res.json();
                  if (json.success) {
                    showToast("Routine created");
                    setShowCreate(false);
                    fetchRoutines();
                  } else {
                    showToast(json.error || "Failed to create routine");
                  }
                } catch {
                  showToast("Failed to create routine");
                } finally {
                  setSaving(false);
                }
              }}
              onCancel={() => setShowCreate(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Routine list */}
      {filteredRoutines.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-[#f5f3ef] flex items-center justify-center mx-auto mb-4">
              <Clock className="w-7 h-7 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-1">No routines</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create automated tasks that your agents will run on schedule.
            </p>
            <Button
              size="sm"
              className="gap-2 text-xs bg-[#3730a3] hover:bg-[#3730a3]/90"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="w-3.5 h-3.5" />
              Create Routine
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredRoutines.map((routine) => (
            <motion.div
              key={routine.id}
              variants={itemVariants}
              initial="hidden"
              animate="show"
              layout
            >
              <Card className="border border-[#e8e5df] bg-white rounded-xl overflow-hidden">
                <CardContent className="p-0">
                  <div
                    className="flex items-start gap-3 p-4 cursor-pointer hover:bg-[#faf9f7]/50 transition-colors"
                    onClick={() => setExpandedId(expandedId === routine.id ? null : routine.id)}
                  >
                    {/* Active toggle */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleActive(routine);
                      }}
                      className={cn(
                        "w-10 h-[22px] rounded-full transition-all duration-200 relative flex-shrink-0 mt-0.5",
                        routine.is_active ? "bg-[#3730a3]" : "bg-[#d1d1d1]"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-[3px] w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-200",
                          routine.is_active ? "left-[22px]" : "left-[3px]"
                        )}
                      />
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-foreground truncate">
                          {routine.name}
                        </h3>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[9px] px-1.5 py-0 border flex-shrink-0",
                            PRIORITY_CONFIG[routine.priority].badgeClass
                          )}
                        >
                          {PRIORITY_CONFIG[routine.priority].label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1">{routine.task}</p>
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <span className="flex items-center gap-1 text-[10px] text-[#3730a3] font-medium bg-[#3730a3]/8 px-1.5 py-0.5 rounded">
                          {getAgentName(routine.agent_id)}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Timer className="w-3 h-3" />
                          Every {formatInterval(routine.interval_minutes)}
                        </span>
                        <span
                          className={cn(
                            "flex items-center gap-1 text-[10px]",
                            routine.is_active ? "text-emerald-600" : "text-muted-foreground"
                          )}
                        >
                          {routine.is_active ? (
                            <Play className="w-3 h-3" />
                          ) : (
                            <Pause className="w-3 h-3" />
                          )}
                          {getNextRunLabel(routine.next_run, routine.is_active)}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditRoutine(routine);
                        }}
                        className="p-1.5 rounded-md hover:bg-[#f5f3ef] text-muted-foreground hover:text-[#3730a3] transition-colors"
                        title="Edit"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(routine.id);
                        }}
                        className="p-1.5 rounded-md hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded details */}
                  <AnimatePresence>
                    {expandedId === routine.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 pt-0 border-t border-[#f0ede8]">
                          <div className="grid grid-cols-2 gap-3 mt-3">
                            <div>
                              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Last Run</span>
                              <p className="text-xs text-foreground mt-0.5">{formatTime(routine.last_run)}</p>
                            </div>
                            <div>
                              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Next Run</span>
                              <p className="text-xs text-foreground mt-0.5">{formatTime(routine.next_run)}</p>
                            </div>
                          </div>
                          {routine.context && (
                            <div className="mt-3">
                              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Context</span>
                              <p className="text-xs text-foreground mt-0.5 bg-[#f5f3ef] rounded-lg p-2.5">{routine.context}</p>
                            </div>
                          )}
                          {routine.last_result && (
                            <div className="mt-3">
                              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Last Result</span>
                              <pre className="text-xs text-foreground mt-0.5 bg-[#f5f3ef] rounded-lg p-2.5 overflow-x-auto max-h-40 whitespace-pre-wrap font-mono">
                                {routine.last_result.length > 500
                                  ? routine.last_result.slice(0, 500) + "..."
                                  : routine.last_result}
                              </pre>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Edit panel */}
      <AnimatePresence>
        {editRoutine && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/30"
              onClick={() => setEditRoutine(null)}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed top-0 right-0 z-50 h-full w-full max-w-md bg-white shadow-xl overflow-y-auto"
            >
              <RoutineForm
                agents={agents}
                routine={editRoutine}
                saving={saving}
                onSave={async (data) => {
                  setSaving(true);
                  try {
                    const res = await fetch("/api/cron/agent-routines", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "update", routineId: editRoutine.id, ...data }),
                    });
                    const json = await res.json();
                    if (json.success) {
                      showToast("Routine updated");
                      setEditRoutine(null);
                      fetchRoutines();
                    } else {
                      showToast(json.error || "Failed to update routine");
                    }
                  } catch {
                    showToast("Failed to update routine");
                  } finally {
                    setSaving(false);
                  }
                }}
                onCancel={() => setEditRoutine(null)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ===========================================================================
// Routine Form (Create / Edit)
// ===========================================================================

function RoutineForm({
  agents,
  routine,
  saving,
  onSave,
  onCancel,
}: {
  agents: { id: string; name: string; role: string }[];
  routine?: Routine | null;
  saving: boolean;
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [agentId, setAgentId] = useState(routine?.agent_id || "");
  const [name, setName] = useState(routine?.name || "");
  const [task, setTask] = useState(routine?.task || "");
  const [context, setContext] = useState(routine?.context || "");
  const [intervalMinutes, setIntervalMinutes] = useState(routine?.interval_minutes || 30);
  const [priority, setPriority] = useState<RoutinePriority>(routine?.priority || "medium");
  const [isActive, setIsActive] = useState(routine?.is_active ?? true);

  const isEditing = !!routine;

  const handleSubmit = () => {
    if (!agentId || !name.trim() || !task.trim()) return;
    onSave({
      agentId,
      name: name.trim(),
      task: task.trim(),
      context: context.trim() || undefined,
      intervalMinutes,
      priority,
      isActive,
    });
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-foreground">
          {isEditing ? "Edit Routine" : "New Routine"}
        </h2>
        <button
          onClick={onCancel}
          className="p-2 rounded-lg hover:bg-[#f5f3ef] text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-4">
        {/* Agent selector */}
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">Agent *</label>
          <div className="relative">
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#e8e5df] bg-white text-sm appearance-none focus:outline-none focus:border-[#3730a3]/40"
            >
              <option value="">Select agent...</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} — {a.role}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">Routine Name *</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Daily Email Summary"
            className="text-sm"
          />
        </div>

        {/* Task */}
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">Task *</label>
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Describe what the agent should do..."
            rows={3}
            className="flex w-full rounded-lg border border-[#e8e5df] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#3730a3]/40 resize-none"
          />
        </div>

        {/* Context */}
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">Context</label>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Additional context for the agent..."
            rows={2}
            className="flex w-full rounded-lg border border-[#e8e5df] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#3730a3]/40 resize-none"
          />
        </div>

        {/* Interval */}
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">Schedule Interval</label>
          <div className="flex flex-wrap gap-1.5">
            {INTERVAL_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => setIntervalMinutes(preset.value)}
                className={cn(
                  "px-2.5 py-1.5 rounded-md border text-[10px] font-medium transition-all",
                  intervalMinutes === preset.value
                    ? "border-[#3730a3] bg-[#3730a3]/10 text-[#3730a3]"
                    : "border-[#e8e5df] text-muted-foreground hover:border-[#3730a3]/30"
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Priority */}
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">Priority</label>
          <div className="flex items-center gap-2">
            {(["low", "medium", "high"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPriority(p)}
                className={cn(
                  "px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
                  priority === p
                    ? cn(PRIORITY_CONFIG[p].badgeClass, "border-current shadow-sm")
                    : "border-[#e8e5df] text-muted-foreground hover:border-[#3730a3]/30"
                )}
              >
                {PRIORITY_CONFIG[p].label}
              </button>
            ))}
          </div>
        </div>

        {/* Active toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Active</p>
            <p className="text-[10px] text-muted-foreground">
              {isActive ? "Routine will run on schedule" : "Routine is paused"}
            </p>
          </div>
          <button
            onClick={() => setIsActive(!isActive)}
            className={cn(
              "w-11 h-[26px] rounded-full transition-all duration-200 relative flex-shrink-0",
              isActive ? "bg-[#3730a3]" : "bg-[#d1d1d1]"
            )}
          >
            <span
              className={cn(
                "absolute top-[3px] w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-200",
                isActive ? "left-[22px]" : "left-[3px]"
              )}
            />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#e8e5df]">
          <Button variant="ghost" size="sm" className="text-xs" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="text-xs gap-1.5 bg-[#3730a3] hover:bg-[#3730a3]/90"
            onClick={handleSubmit}
            disabled={!agentId || !name.trim() || !task.trim() || saving}
          >
            {saving ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <CheckCircle className="w-3.5 h-3.5" />
            )}
            {isEditing ? "Save Changes" : "Create Routine"}
          </Button>
        </div>
      </div>
    </div>
  );
}
