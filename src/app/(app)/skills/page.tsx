"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Search,
  Plus,
  X,
  ChevronRight,
  Star,
  Zap,
  Tag,
  BookOpen,
  Shield,
  Code,
  Mail,
  BarChart3,
  Layout,
  Target,
  Eye,
  Check,
  Loader2,
  Wrench,
  Activity,
  Database,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Skill {
  id: string;
  name: string;
  display_name: string;
  slug: string;
  description: string;
  category: string;
  difficulty: string;
  prompt_template: string;
  workflow_steps: WorkflowStep[];
  required_tools: string[];
  tags: string[];
  agent_bindings: string[];
  performance_score: number;
  total_uses: number;
  avg_rating: number;
  is_builtin: boolean;
  is_active: boolean;
  has_embedding: boolean;
  created_at: string;
  updated_at: string;
}

interface WorkflowStep {
  step: number;
  name: string;
  description: string;
}

interface ToastMessage {
  id: string;
  type: "success" | "error";
  message: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { key: "all", label: "All", icon: Layout },
  { key: "research", label: "Research", icon: BookOpen },
  { key: "code", label: "Code", icon: Code },
  { key: "communication", label: "Communication", icon: Mail },
  { key: "data", label: "Data", icon: BarChart3 },
  { key: "planning", label: "Planning", icon: Target },
  { key: "ops", label: "Ops", icon: Shield },
  { key: "content", label: "Content", icon: Sparkles },
];

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  research: { bg: "bg-purple-500/10", text: "text-purple-500", border: "border-purple-500/30" },
  code: { bg: "bg-emerald-500/10", text: "text-emerald-500", border: "border-emerald-500/30" },
  communication: { bg: "bg-blue-500/10", text: "text-blue-500", border: "border-blue-500/30" },
  data: { bg: "bg-amber-500/10", text: "text-amber-500", border: "border-amber-500/30" },
  planning: { bg: "bg-indigo-500/10", text: "text-indigo-500", border: "border-indigo-500/30" },
  ops: { bg: "bg-red-500/10", text: "text-red-500", border: "border-red-500/30" },
  content: { bg: "bg-pink-500/10", text: "text-pink-500", border: "border-pink-500/30" },
  general: { bg: "bg-gray-500/10", text: "text-gray-500", border: "border-gray-500/30" },
};

const DIFFICULTY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  beginner: { bg: "bg-emerald-500/10", text: "text-emerald-600", dot: "bg-emerald-500" },
  intermediate: { bg: "bg-blue-500/10", text: "text-blue-600", dot: "bg-blue-500" },
  advanced: { bg: "bg-orange-500/10", text: "text-orange-600", dot: "bg-orange-500" },
  expert: { bg: "bg-red-500/10", text: "text-red-600", dot: "bg-red-500" },
};

const PERFORMANCE_COLORS: Record<string, string> = {
  high: "bg-emerald-500",
  medium: "bg-amber-500",
  low: "bg-red-500",
};

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
// Helper Functions
// ---------------------------------------------------------------------------

function getPerformanceColor(score: number): string {
  if (score >= 80) return PERFORMANCE_COLORS.high;
  if (score >= 50) return PERFORMANCE_COLORS.medium;
  return PERFORMANCE_COLORS.low;
}

function formatNumber(num: number): string {
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return num.toString();
}

// ---------------------------------------------------------------------------
// Sub-Components
// ---------------------------------------------------------------------------

function SkillCardSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
      <Skeleton className="w-9 h-9 rounded-lg shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-14 rounded-full" />
        </div>
        <Skeleton className="h-3 w-full" />
      </div>
      <Skeleton className="w-5 h-5 shrink-0" />
    </div>
  );
}

function EmptyState({ searchQuery }: { searchQuery: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="col-span-full flex flex-col items-center justify-center py-16"
    >
      <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
        <Search className="w-7 h-7 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1">
        {searchQuery ? "No skills found" : "No skills yet"}
      </h3>
      <p className="text-sm text-muted-foreground text-center max-w-sm">
        {searchQuery
          ? `No skills match "${searchQuery}". Try adjusting your search or filters.`
          : "Get started by creating your first skill or browse the built-in library."}
      </p>
      {!searchQuery && (
        <Button className="mt-4 gap-2" onClick={() => window.dispatchEvent(new CustomEvent("open-create-skill"))}>
          <Plus className="w-4 h-4" />
          Create Skill
        </Button>
      )}
    </motion.div>
  );
}

function PerformanceBar({ score }: { score: number }) {
  const color = getPerformanceColor(score);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">Performance</span>
        <span className="text-[11px] font-medium text-foreground">{score}%</span>
      </div>
      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
        <motion.div
          className={cn("h-full rounded-full", color)}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(score, 2)}%` }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skill Detail Modal
// ---------------------------------------------------------------------------

function SkillDetailModal({
  skill,
  onClose,
}: {
  skill: Skill;
  onClose: () => void;
}) {
  const catColor = CATEGORY_COLORS[skill.category] || CATEGORY_COLORS.general;
  const diffColor = DIFFICULTY_COLORS[skill.difficulty] || DIFFICULTY_COLORS.intermediate;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      variants={modalOverlayVariants}
      initial="hidden"
      animate="show"
      exit="exit"
    >
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content */}
      <motion.div
        className="relative w-full max-w-2xl max-h-[85vh] overflow-hidden bg-card border border-border rounded-xl shadow-2xl flex flex-col"
        variants={modalContentVariants}
        initial="hidden"
        animate="show"
        exit="exit"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4 border-b border-border">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge className={cn("text-[10px] gap-1", catColor.bg, catColor.text, catColor.border)}>
                {skill.category}
              </Badge>
              <Badge className={cn("text-[10px] gap-1", diffColor.bg, diffColor.text)}>
                <span className={cn("w-1.5 h-1.5 rounded-full", diffColor.dot)} />
                {skill.difficulty}
              </Badge>
              {skill.is_builtin && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Zap className="w-3 h-3" />
                  Built-in
                </Badge>
              )}
            </div>
            <h2 className="text-xl font-bold text-foreground">{skill.display_name}</h2>
            <p className="text-sm text-muted-foreground mt-1 font-mono">{skill.slug}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="shrink-0 ml-4"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {/* Description */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-muted-foreground" />
              Description
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{skill.description}</p>
          </div>

          {/* Performance & Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-muted/30 rounded-lg p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">Performance</span>
              </div>
              <span className="text-lg font-bold text-foreground">{skill.performance_score}%</span>
            </div>
            <div className="bg-muted/30 rounded-lg p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Zap className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">Total Uses</span>
              </div>
              <span className="text-lg font-bold text-foreground">{formatNumber(skill.total_uses)}</span>
            </div>
            <div className="bg-muted/30 rounded-lg p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Star className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">Avg Rating</span>
              </div>
              <span className="text-lg font-bold text-foreground">{skill.avg_rating.toFixed(1)}</span>
            </div>
          </div>

          {/* Prompt Template */}
          {skill.prompt_template && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <Code className="w-4 h-4 text-muted-foreground" />
                Prompt Template
              </h3>
              <div className="bg-muted/30 border border-border rounded-lg p-4">
                <pre className="text-xs text-foreground/80 whitespace-pre-wrap break-words font-mono leading-relaxed max-h-48 overflow-y-auto custom-scrollbar">
                  {skill.prompt_template}
                </pre>
              </div>
            </div>
          )}

          {/* Workflow Steps */}
          {skill.workflow_steps && skill.workflow_steps.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Target className="w-4 h-4 text-muted-foreground" />
                Workflow Steps
              </h3>
              <div className="space-y-2">
                {skill.workflow_steps.map((step, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + idx * 0.05 }}
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted/20 border border-border/50"
                  >
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[10px] font-bold text-primary">{step.step || idx + 1}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{step.name}</p>
                      {step.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Agent Bindings */}
          {skill.agent_bindings && skill.agent_bindings.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-muted-foreground" />
                Agent Bindings
              </h3>
              <div className="flex flex-wrap gap-2">
                {skill.agent_bindings.map((agent, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs gap-1.5">
                    <Sparkles className="w-3 h-3" />
                    {agent}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Required Tools */}
          {skill.required_tools && skill.required_tools.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <Wrench className="w-4 h-4 text-muted-foreground" />
                Required Tools
              </h3>
              <div className="flex flex-wrap gap-2">
                {skill.required_tools.map((tool, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs gap-1.5">
                    <Wrench className="w-3 h-3" />
                    {tool}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {skill.tags && skill.tags.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <Tag className="w-4 h-4 text-muted-foreground" />
                Tags
              </h3>
              <div className="flex flex-wrap gap-2">
                {skill.tags.map((tag, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-border bg-muted/10">
          <p className="text-[11px] text-muted-foreground">
            Updated {new Date(skill.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Create Skill Modal
// ---------------------------------------------------------------------------

function CreateSkillModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (skill: Skill) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    display_name: "",
    description: "",
    category: "general",
    difficulty: "intermediate",
    prompt_template: "",
    workflow_steps: "",
    tags: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.display_name.trim() || !form.description.trim() || !form.prompt_template.trim()) {
      setError("Name, Display Name, Description, and Prompt Template are required.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const steps = form.workflow_steps
        .split("\n")
        .filter((line) => line.trim())
        .map((line, idx) => {
          const parts = line.split(":").map((s) => s.trim());
          return {
            step: idx + 1,
            name: parts[0] || "",
            description: parts[1] || "",
          };
        });

      const tags = form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          display_name: form.display_name,
          description: form.description,
          category: form.category,
          difficulty: form.difficulty,
          prompt_template: form.prompt_template,
          workflow_steps: steps,
          tags,
        }),
      });

      const json = await res.json();

      if (json.success && json.data) {
        onSuccess(json.data);
      } else {
        setError(json.error || "Failed to create skill.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "flex h-9 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 transition-colors";

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      variants={modalOverlayVariants}
      initial="hidden"
      animate="show"
      exit="exit"
    >
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content */}
      <motion.div
        className="relative w-full max-w-lg max-h-[85vh] overflow-hidden bg-card border border-border rounded-xl shadow-2xl flex flex-col"
        variants={modalContentVariants}
        initial="hidden"
        animate="show"
        exit="exit"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-border">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Create Skill
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">Define a new reusable skill for your agents</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-600"
            >
              {error}
            </motion.div>
          )}

          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Skill Name <span className="text-red-500">*</span></label>
            <Input
              placeholder="e.g. deep-research"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="font-mono text-sm"
            />
            <p className="text-[11px] text-muted-foreground">Unique identifier, will be slugified automatically</p>
          </div>

          {/* Display Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Display Name <span className="text-red-500">*</span></label>
            <Input
              placeholder="e.g. Deep Research"
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Description <span className="text-red-500">*</span></label>
            <Textarea
              placeholder="What does this skill do?"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
            />
          </div>

          {/* Category & Difficulty Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className={inputClass}
              >
                {CATEGORIES.filter((c) => c.key !== "all").map((cat) => (
                  <option key={cat.key} value={cat.key}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Difficulty</label>
              <select
                value={form.difficulty}
                onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
                className={inputClass}
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
                <option value="expert">Expert</option>
              </select>
            </div>
          </div>

          {/* Prompt Template */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Prompt Template <span className="text-red-500">*</span></label>
            <Textarea
              placeholder="The system prompt template for this skill..."
              value={form.prompt_template}
              onChange={(e) => setForm({ ...form, prompt_template: e.target.value })}
              rows={5}
              className="font-mono text-xs"
            />
          </div>

          {/* Workflow Steps */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-muted-foreground" />
              Workflow Steps
            </label>
            <Textarea
              placeholder={"Step Name: Description\nAnalyze Input: Parse and understand the user's request\nGenerate Output: Create the final response"}
              value={form.workflow_steps}
              onChange={(e) => setForm({ ...form, workflow_steps: e.target.value })}
              rows={3}
              className="text-xs"
            />
            <p className="text-[11px] text-muted-foreground">One step per line in format: Step Name: Description</p>
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-muted-foreground" />
              Tags
            </label>
            <Input
              placeholder="research, analysis, automation"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
            />
            <p className="text-[11px] text-muted-foreground">Comma-separated tags</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-border bg-muted/10">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Create Skill
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

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
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700"
                : "bg-red-500/10 border-red-500/30 text-red-700"
            )}
          >
            {toast.type === "success" ? (
              <Check className="w-4 h-4 shrink-0" />
            ) : (
              <X className="w-4 h-4 shrink-0" />
            )}
            <p className="text-sm flex-1">{toast.message}</p>
            <button
              onClick={() => onDismiss(toast.id)}
              className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [embeddingStatus, setEmbeddingStatus] = useState<{ total: number; withEmbeddings: number } | null>(null);
  const [generatingEmbeddings, setGeneratingEmbeddings] = useState(false);

  // --- Fetch embedding status ---
  useEffect(() => {
    fetch("/api/skills/embeddings")
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data) {
          setEmbeddingStatus({
            total: json.data.total_active,
            withEmbeddings: json.data.with_embeddings,
          });
        }
      })
      .catch(() => {});
  }, []);

  // --- Toast helpers ---
  const addToast = useCallback((type: "success" | "error", message: string) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // --- Fetch skills ---
  const fetchSkills = useCallback(async (search: string, category: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (category && category !== "all") params.set("category", category);

      const url = `/api/skills${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetch(url);
      const json = await res.json();

      if (json.success && json.data) {
        setSkills(json.data);
      }
    } catch {
      addToast("error", "Failed to fetch skills.");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  // Initial fetch
  useEffect(() => {
    fetchSkills("", "all");
  }, [fetchSkills]);

  // Debounced search + category filter
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      fetchSkills(searchQuery, activeCategory);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery, activeCategory, fetchSkills]);

  // Listen for custom event from empty state
  useEffect(() => {
    const handler = () => setShowCreateModal(true);
    window.addEventListener("open-create-skill", handler);
    return () => window.removeEventListener("open-create-skill", handler);
  }, []);

  // --- Generate embeddings handler ---
  const handleGenerateEmbeddings = useCallback(async () => {
    setGeneratingEmbeddings(true);
    try {
      // First, setup pgvector
      const setupRes = await fetch("/api/skills/embeddings/setup", { method: "POST" });
      const setupJson = await setupRes.json();
      if (!setupJson.success) {
        addToast("error", "Failed to setup pgvector: " + (setupJson.error || "Unknown error"));
        return;
      }

      // Then generate embeddings
      const genRes = await fetch("/api/skills/embeddings", { method: "POST" });
      const genJson = await genRes.json();
      if (genJson.success) {
        addToast("success", `Embeddings generated for ${genJson.data?.processed ?? "?"} skill(s)`);
        // Refresh embedding status
        const statusRes = await fetch("/api/skills/embeddings");
        const statusJson = await statusRes.json();
        if (statusJson.success && statusJson.data) {
          setEmbeddingStatus({
            total: statusJson.data.total_active,
            withEmbeddings: statusJson.data.with_embeddings,
          });
        }
        // Refresh skills list to pick up has_embedding field
        fetchSkills(searchQuery, activeCategory);
      } else {
        addToast("error", genJson.error || "Failed to generate embeddings");
      }
    } catch {
      addToast("error", "Network error generating embeddings");
    } finally {
      setGeneratingEmbeddings(false);
    }
  }, [addToast, fetchSkills, searchQuery, activeCategory]);

  // --- Handle create success ---
  const handleCreateSuccess = useCallback(
    (skill: Skill) => {
      setShowCreateModal(false);
      setSkills((prev) => [skill, ...prev]);
      addToast("success", `"${skill.display_name}" created successfully!`);
    },
    [addToast]
  );

  // --- Filtered skills (search is server-side, category is too, but for instant UX we also filter client-side) ---
  const filteredSkills = skills;

  // --- Active category count helper ---
  const getCategoryCount = useCallback(
    (cat: string) => {
      if (cat === "all") return skills.length;
      return skills.filter((s) => s.category === cat).length;
    },
    [skills]
  );

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
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Skills Library</h1>
              <p className="text-sm text-muted-foreground">
                Browse, create, and manage reusable skills for your AI agents
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="default"
              className="gap-2"
              onClick={handleGenerateEmbeddings}
              disabled={generatingEmbeddings}
            >
              {generatingEmbeddings ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Database className="w-4 h-4" />
              )}
              {generatingEmbeddings ? "Generating..." : "Embeddings"}
              {embeddingStatus && embeddingStatus.withEmbeddings > 0 && (
                <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                  {embeddingStatus.withEmbeddings}/{embeddingStatus.total}
                </Badge>
              )}
            </Button>
            <Button
              onClick={() => setShowCreateModal(true)}
              className="gap-2"
              size="default"
            >
              <Plus className="w-4 h-4" />
              Create Skill
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Search Bar */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="mb-4"
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search skills by name, description, or tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-11 bg-card"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </motion.div>

      {/* Category Filter Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="mb-6"
      >
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.key;
            const count = getCategoryCount(cat.key);
            const Icon = cat.icon;
            return (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200 shrink-0",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{cat.label}</span>
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full font-semibold",
                    isActive
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Skills Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkillCardSkeleton key={i} />
          ))}
        </div>
      ) : filteredSkills.length === 0 ? (
        <EmptyState searchQuery={searchQuery} />
      ) : (
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 gap-3"
          variants={containerVariants}
          initial="hidden"
          animate="show"
          key={`${searchQuery}-${activeCategory}`}
        >
          {filteredSkills.map((skill) => {
            const catColor = CATEGORY_COLORS[skill.category] || CATEGORY_COLORS.general;
            const diffColor = DIFFICULTY_COLORS[skill.difficulty] || DIFFICULTY_COLORS.intermediate;
            const perfColor = skill.performance_score >= 80 ? 'text-emerald-500' : skill.performance_score >= 50 ? 'text-amber-500' : 'text-red-500';

            return (
              <motion.div key={skill.id} variants={itemVariants} layout>
                <div
                  onClick={() => setSelectedSkill(skill)}
                  className="group flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:border-primary/20 hover:shadow-sm transition-all duration-200 cursor-pointer"
                >
                    {/* Icon */}
                    <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", catColor.bg)}>
                      {skill.is_builtin ? (
                        <Zap className={cn("w-4 h-4", catColor.text)} />
                      ) : (
                        <Sparkles className={cn("w-4 h-4", catColor.text)} />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <h3 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
                          {skill.display_name}
                        </h3>
                        {skill.is_builtin && (
                          <span className="text-[9px] text-muted-foreground shrink-0">built-in</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {skill.description}
                      </p>
                    </div>

                    {/* Right: chevron + mini stats */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                      <div className="flex items-center gap-1.5">
                        <Badge className={cn("text-[9px] px-1 py-0", catColor.bg, catColor.text)}>
                          {skill.category}
                        </Badge>
                        {skill.performance_score > 0 && (
                          <span className={cn("text-[9px] font-medium", perfColor)}>
                            {skill.performance_score}%
                          </span>
                        )}
                      </div>
                    </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Vector Search Status */}
      {embeddingStatus && embeddingStatus.withEmbeddings > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mb-4 flex items-center gap-2"
        >
          <Badge variant="outline" className="text-[10px] gap-1 text-emerald-600 border-emerald-500/30">
            <Database className="w-3 h-3" />
            Vector Search Active
          </Badge>
          <span className="text-[11px] text-muted-foreground">
            {embeddingStatus.withEmbeddings}/{embeddingStatus.total} skills indexed
          </span>
        </motion.div>
      )}

      {/* Results count */}
      {!loading && filteredSkills.length > 0 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-[11px] text-muted-foreground text-center mt-6"
        >
          Showing {filteredSkills.length} skill{filteredSkills.length !== 1 ? "s" : ""}
          {activeCategory !== "all" && ` in ${activeCategory}`}
          {searchQuery && ` matching "${searchQuery}"`}
        </motion.p>
      )}

      {/* Modals */}
      <AnimatePresence>
        {selectedSkill && (
          <SkillDetailModal skill={selectedSkill} onClose={() => setSelectedSkill(null)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCreateModal && (
          <CreateSkillModal
            onClose={() => setShowCreateModal(false)}
            onSuccess={handleCreateSuccess}
          />
        )}
      </AnimatePresence>

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
