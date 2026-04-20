"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ClipboardList,
  Plus,
  Trash2,
  X,
  CheckCircle,
  ChevronDown,
  Filter,
  Calendar,
  User,
  Tag,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TaskStatus = "backlog" | "in_progress" | "waiting" | "done";
type TaskPriority = "high" | "medium" | "low";

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigned_agent: string | null;
  created_by: string | null;
  context: string | null;
  parent_task_id: string | null;
  deadline: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

interface TaskSummary {
  backlog: number;
  in_progress: number;
  waiting: number;
  done: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLUMNS: { key: TaskStatus; label: string; color: string }[] = [
  { key: "backlog", label: "Backlog", color: "bg-slate-500" },
  { key: "in_progress", label: "In Progress", color: "bg-blue-500" },
  { key: "waiting", label: "Waiting", color: "bg-amber-500" },
  { key: "done", label: "Done", color: "bg-emerald-500" },
];

const PRIORITY_CONFIG: Record<
  TaskPriority,
  { label: string; badgeClass: string; dotClass: string }
> = {
  high: { label: "High", badgeClass: "bg-red-100 text-red-700 border-red-200", dotClass: "bg-red-500" },
  medium: { label: "Medium", badgeClass: "bg-amber-100 text-amber-700 border-amber-200", dotClass: "bg-amber-500" },
  low: { label: "Low", badgeClass: "bg-green-100 text-green-700 border-green-200", dotClass: "bg-green-500" },
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  backlog: "text-slate-600",
  in_progress: "text-blue-600",
  waiting: "text-amber-600",
  done: "text-emerald-600",
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

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isOverdue(deadline: string | null, status: TaskStatus): boolean {
  if (!deadline || status === "done") return false;
  return new Date(deadline) < new Date();
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TaskBoardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<TaskSummary | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [panelTask, setPanelTask] = useState<Task | null>(null);
  const [panelMode, setPanelMode] = useState<"view" | "create">("view");
  const [filterAgent, setFilterAgent] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [saving, setSaving] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/taskboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list" }),
      });
      const json = await res.json();
      if (json.success && json.data?.tasks) {
        setTasks(json.data.tasks);
      }
    } catch {
      // silent
    }
  }, []);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch("/api/taskboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "summary" }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setSummary(json.data);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchTasks(), fetchSummary()]).finally(() => setLoading(false));
  }, [fetchTasks, fetchSummary]);

  // Unique agents from tasks
  const uniqueAgents = useMemo(() => {
    const agents = new Set<string>();
    for (const t of tasks) {
      if (t.assigned_agent) agents.add(t.assigned_agent);
    }
    return Array.from(agents).sort();
  }, [tasks]);

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterAgent !== "all" && t.assigned_agent !== filterAgent) return false;
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      return true;
    });
  }, [tasks, filterAgent, filterPriority]);

  // Tasks by column
  const tasksByColumn = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {
      backlog: [],
      in_progress: [],
      waiting: [],
      done: [],
    };
    for (const t of filteredTasks) {
      map[t.status].push(t);
    }
    return map;
  }, [filteredTasks]);

  // Handlers
  const handleDelete = async (taskId: string) => {
    if (!confirm("Delete this task? This cannot be undone.")) return;
    try {
      const res = await fetch("/api/taskboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", taskId }),
      });
      const json = await res.json();
      if (json.success) {
        showToast("Task deleted");
        setPanelTask(null);
        fetchTasks();
        fetchSummary();
      }
    } catch {
      showToast("Failed to delete task");
    }
  };

  const handleCreate = async (data: Partial<Task>) => {
    setSaving(true);
    try {
      const res = await fetch("/api/taskboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", ...data }),
      });
      const json = await res.json();
      if (json.success) {
        showToast("Task created");
        setPanelTask(null);
        setPanelMode("view");
        fetchTasks();
        fetchSummary();
      } else {
        showToast(json.error || "Failed to create task");
      }
    } catch {
      showToast("Failed to create task");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (taskId: string, data: Partial<Task>) => {
    setSaving(true);
    try {
      const res = await fetch("/api/taskboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", taskId, ...data }),
      });
      const json = await res.json();
      if (json.success) {
        showToast("Task updated");
        setPanelTask(null);
        fetchTasks();
        fetchSummary();
      } else {
        showToast(json.error || "Failed to update task");
      }
    } catch {
      showToast("Failed to update task");
    } finally {
      setSaving(false);
    }
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
      className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8"
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
            <ClipboardList className="w-5 h-5 text-[#3730a3]" />
            <h1 className="text-xl font-bold text-foreground">Task Board</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-8">
            Manage and track tasks across your agent workspace
          </p>
        </div>
        <Button
          size="sm"
          className="gap-2 text-xs bg-[#3730a3] hover:bg-[#3730a3]/90"
          onClick={() => {
            setPanelMode("create");
            setPanelTask(null);
          }}
        >
          <Plus className="w-3.5 h-3.5" />
          New Task
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <div className="rounded-xl border border-[#e8e5df] bg-white p-3">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <ClipboardList className="w-4 h-4" />
            <span className="text-[10px] font-medium uppercase tracking-wider">Total</span>
          </div>
          <p className="text-lg font-bold text-[#3730a3]">{(summary?.backlog ?? 0) + (summary?.in_progress ?? 0) + (summary?.waiting ?? 0) + (summary?.done ?? 0)}</p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.key} className="rounded-xl border border-[#e8e5df] bg-white p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <span className={cn("w-2.5 h-2.5 rounded-full", col.color)} />
              <span className="text-[10px] font-medium uppercase tracking-wider">{col.label}</span>
            </div>
            <p className={cn("text-lg font-bold", STATUS_COLORS[col.key])}>
              {summary?.[col.key] ?? tasksByColumn[col.key].length}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Filters:</span>
        </div>
        <div className="flex items-center gap-1 bg-[#f5f3ef] rounded-lg p-0.5">
          <button
            onClick={() => setFilterAgent("all")}
            className={cn(
              "px-2.5 py-1 text-[10px] rounded-md transition-colors",
              filterAgent === "all" ? "bg-white text-foreground shadow-sm font-medium" : "text-muted-foreground"
            )}
          >
            All Agents
          </button>
          {uniqueAgents.map((agent) => (
            <button
              key={agent}
              onClick={() => setFilterAgent(agent)}
              className={cn(
                "px-2.5 py-1 text-[10px] rounded-md transition-colors",
                filterAgent === agent ? "bg-white text-foreground shadow-sm font-medium" : "text-muted-foreground"
              )}
            >
              {agent}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-[#f5f3ef] rounded-lg p-0.5">
          {(["all", "high", "medium", "low"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setFilterPriority(p)}
              className={cn(
                "px-2.5 py-1 text-[10px] rounded-md transition-colors",
                filterPriority === p ? "bg-white text-foreground shadow-sm font-medium" : "text-muted-foreground"
              )}
            >
              {p === "all" ? "All Priority" : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        {COLUMNS.map((col) => (
          <div key={col.key} className="flex-shrink-0 w-[280px] sm:w-[300px]">
            {/* Column header */}
            <div className="flex items-center gap-2 mb-3 px-1">
              <span className={cn("w-2.5 h-2.5 rounded-full", col.color)} />
              <h2 className="text-sm font-semibold text-foreground">{col.label}</h2>
              <span className="text-[10px] text-muted-foreground bg-[#f5f3ef] px-1.5 py-0.5 rounded-full">
                {tasksByColumn[col.key].length}
              </span>
            </div>

            {/* Column cards */}
            <div className="space-y-2 min-h-[200px]">
              {tasksByColumn[col.key].length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#e8e5df] bg-[#faf9f7] p-8 text-center">
                  <p className="text-xs text-muted-foreground">No tasks</p>
                </div>
              ) : (
                tasksByColumn[col.key].map((task) => (
                  <TaskCard key={task.id} task={task} onClick={() => setPanelTask(task)} />
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Slide Panel */}
      <AnimatePresence>
        {(panelTask || panelMode === "create") && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/30"
              onClick={() => {
                setPanelTask(null);
                setPanelMode("view");
              }}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed top-0 right-0 z-50 h-full w-full max-w-md bg-white shadow-xl overflow-y-auto"
            >
              <TaskPanel
                task={panelTask}
                mode={panelMode}
                onClose={() => {
                  setPanelTask(null);
                  setPanelMode("view");
                }}
                onDelete={handleDelete}
                onUpdate={handleUpdate}
                onCreate={handleCreate}
                saving={saving}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ===========================================================================
// Task Card
// ===========================================================================

function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const priority = PRIORITY_CONFIG[task.priority];
  const overdue = isOverdue(task.deadline, task.status);

  return (
    <motion.div
      variants={itemVariants}
      initial="hidden"
      animate="show"
      layout
      className="rounded-xl border border-[#e8e5df] bg-white p-4 cursor-pointer hover:border-[#3730a3]/20 hover:shadow-sm transition-all group"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold text-foreground leading-tight line-clamp-2 flex-1">
          {task.title}
        </h3>
        <span className={cn("w-2 h-2 rounded-full flex-shrink-0 mt-1.5", priority.dotClass)} />
      </div>

      {task.description && (
        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{task.description}</p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 border", priority.badgeClass)}>
          {priority.label}
        </Badge>

        {task.assigned_agent && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <User className="w-3 h-3" />
            {task.assigned_agent}
          </span>
        )}

        {task.deadline && (
          <span
            className={cn(
              "flex items-center gap-1 text-[10px]",
              overdue ? "text-red-500 font-medium" : "text-muted-foreground"
            )}
          >
            <Calendar className="w-3 h-3" />
            {formatDate(task.deadline)}
          </span>
        )}
      </div>

      {task.tags && task.tags.length > 0 && (
        <div className="flex items-center gap-1 mt-2 flex-wrap">
          {task.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-0.5 text-[9px] text-muted-foreground bg-[#f5f3ef] px-1.5 py-0.5 rounded"
            >
              <Tag className="w-2.5 h-2.5" />
              {tag}
            </span>
          ))}
          {task.tags.length > 3 && (
            <span className="text-[9px] text-muted-foreground">+{task.tags.length - 3}</span>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ===========================================================================
// Task Panel (Create / Edit)
// ===========================================================================

function TaskPanel({
  task,
  mode,
  onClose,
  onDelete,
  onUpdate,
  onCreate,
  saving,
}: {
  task: Task | null;
  mode: "view" | "create";
  onClose: () => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, data: Partial<Task>) => void;
  onCreate: (data: Partial<Task>) => void;
  saving: boolean;
}) {
  const isEditing = task !== null && mode === "view";
  const [title, setTitle] = useState(task?.title || "");
  const [description, setDescription] = useState(task?.description || "");
  const [status, setStatus] = useState<TaskStatus>(task?.status || "backlog");
  const [priority, setPriority] = useState<TaskPriority>(task?.priority || "medium");
  const [assignedAgent, setAssignedAgent] = useState(task?.assigned_agent || "");
  const [deadline, setDeadline] = useState(task?.deadline?.split("T")[0] || "");
  const [tagsInput, setTagsInput] = useState(task?.tags?.join(", ") || "");

  const tags = tagsInput
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const handleSave = () => {
    if (!title.trim()) return;
    const data = {
      title: title.trim(),
      description: description.trim() || undefined,
      status,
      priority,
      assignedAgent: assignedAgent.trim() || undefined,
      deadline: deadline || undefined,
      tags: tags.length > 0 ? tags : undefined,
    };
    if (isEditing && task) {
      onUpdate(task.id, data);
    } else {
      onCreate(data);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-foreground">
          {isEditing ? "Edit Task" : "New Task"}
        </h2>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-[#f5f3ef] text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-4">
        {/* Title */}
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">Title *</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title..."
            className="text-sm"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the task..."
            rows={3}
            className="flex w-full rounded-lg border border-[#e8e5df] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#3730a3]/40 resize-none"
          />
        </div>

        {/* Status (only when editing) */}
        {isEditing && (
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Status</label>
            <div className="relative">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full px-3 py-2 rounded-lg border border-[#e8e5df] bg-white text-sm appearance-none focus:outline-none focus:border-[#3730a3]/40"
              >
                {COLUMNS.map((col) => (
                  <option key={col.key} value={col.key}>
                    {col.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
        )}

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

        {/* Assigned Agent */}
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">Assigned Agent</label>
          <Input
            value={assignedAgent}
            onChange={(e) => setAssignedAgent(e.target.value)}
            placeholder="e.g. general, code, mail..."
            className="text-sm"
          />
        </div>

        {/* Deadline */}
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">Deadline</label>
          <Input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="text-sm"
          />
        </div>

        {/* Tags */}
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">Tags</label>
          <Input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="bug, feature, urgent (comma-separated)"
            className="text-sm"
          />
          {tags.length > 0 && (
            <div className="flex items-center gap-1 mt-2 flex-wrap">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[9px] px-1.5 py-0">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-4 border-t border-[#e8e5df]">
          {isEditing && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-50"
              onClick={() => task && onDelete(task.id)}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="ghost" size="sm" className="text-xs" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="text-xs gap-1.5 bg-[#3730a3] hover:bg-[#3730a3]/90"
            onClick={handleSave}
            disabled={!title.trim() || saving}
          >
            {saving ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <CheckCircle className="w-3.5 h-3.5" />
            )}
            {isEditing ? "Save Changes" : "Create Task"}
          </Button>
        </div>
      </div>
    </div>
  );
}
