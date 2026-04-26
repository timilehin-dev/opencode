"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Search,
  Plus,
  X,
  CheckCircle,
  Star,
  Filter,
  RefreshCw,
  ChevronDown,
  Zap,
  Eye,
  TrendingUp,
  Tag,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Skill {
  id: string;
  name: string;
  slug: string;
  display_name: string | null;
  description: string;
  category: string;
  difficulty: string | null;
  performance_score: number | null;
  avg_rating: number | null;
  total_uses: number | null;
  successful_uses: number | null;
  success_count: number;
  failure_count: number;
  version: number;
  is_active: boolean;
  is_builtin: boolean;
  tags: string[];
  agent_bindings: string[] | null;
  workflow_steps: string[];
  required_tools: string[];
  prompt_template: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  code: { label: "Code", color: "bg-purple-100 text-purple-700 border-purple-200" },
  research: { label: "Research", color: "bg-teal-100 text-teal-700 border-teal-200" },
  communication: { label: "Communication", color: "bg-blue-100 text-blue-700 border-blue-200" },
  data: { label: "Data", color: "bg-amber-100 text-amber-700 border-amber-200" },
  planning: { label: "Planning", color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  ops: { label: "Ops", color: "bg-orange-100 text-orange-700 border-orange-200" },
  content: { label: "Content", color: "bg-rose-100 text-rose-700 border-rose-200" },
  general: { label: "General", color: "bg-gray-100 text-gray-700 border-gray-200" },
};

const DIFFICULTY_CONFIG: Record<string, { label: string; color: string }> = {
  beginner: { label: "Beginner", color: "bg-green-100 text-green-700" },
  intermediate: { label: "Intermediate", color: "bg-blue-100 text-blue-700" },
  advanced: { label: "Advanced", color: "bg-amber-100 text-amber-700" },
  expert: { label: "Expert", color: "bg-red-100 text-red-700" },
};

const CATEGORIES = ["all", "code", "research", "communication", "data", "planning", "ops", "content", "general"];

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const fetchSkills = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (category !== "all") params.set("category", category);
      const res = await fetch(`/api/skills?${params.toString()}`);
      const json = await res.json();
      if (json.success) setSkills(json.data || []);
      else console.error("Skills fetch failed:", json.error);
    } catch (err) {
      console.error("Skills fetch error:", err);
    }
  }, [search, category]);

  useEffect(() => {
    fetchSkills().finally(() => setLoading(false));
  }, [fetchSkills]);

  // Stats
  const stats = useMemo(() => {
    const cats = new Set(skills.map((s) => s.category));
    const avgScore = skills.length > 0
      ? skills.reduce((sum, s) => sum + (s.performance_score || 0), 0) / skills.length
      : 0;
    return { total: skills.length, categories: cats.size, avgScore };
  }, [skills]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
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
            <Sparkles className="w-5 h-5 text-[#3730a3]" />
            <h1 className="text-xl font-bold text-foreground">Skill Library</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-8">
            Reusable skills that enhance agent capabilities
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={fetchSkills}>
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
          <Button
            size="sm"
            className="gap-2 text-xs bg-primary hover:bg-primary/90"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="w-3.5 h-3.5" />
            New Skill
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Sparkles className="w-4 h-4" />
            <span className="text-[10px] font-medium uppercase tracking-wider">Total Skills</span>
          </div>
          <p className="text-lg font-bold text-[#3730a3]">{stats.total}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Filter className="w-4 h-4" />
            <span className="text-[10px] font-medium uppercase tracking-wider">Categories</span>
          </div>
          <p className="text-lg font-bold text-emerald-600">{stats.categories}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <TrendingUp className="w-4 h-4" />
            <span className="text-[10px] font-medium uppercase tracking-wider">Avg Score</span>
          </div>
          <p className="text-lg font-bold text-amber-600">{stats.avgScore.toFixed(1)}</p>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search skills..."
            className="pl-9 text-sm"
          />
        </div>
        <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5 overflow-x-auto">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={cn(
                "px-2.5 py-1.5 text-[10px] rounded-md transition-colors whitespace-nowrap font-medium",
                category === cat
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {cat === "all" ? "All" : (CATEGORY_CONFIG[cat]?.label || cat)}
            </button>
          ))}
        </div>
      </div>

      {/* Skill Grid */}
      {skills.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-7 h-7 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-1">No skills found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create a new skill to enhance your agents' capabilities.
            </p>
            <Button size="sm" className="gap-2 text-xs bg-primary hover:bg-primary/90" onClick={() => setShowCreate(true)}>
              <Plus className="w-3.5 h-3.5" />
              Create Skill
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {skills.map((skill) => (
            <motion.div
              key={skill.id}
              variants={itemVariants}
              initial="hidden"
              animate="show"
              layout
            >
              <Card
                className="border border-border bg-card rounded-xl overflow-hidden cursor-pointer hover:border-primary/20 hover:shadow-sm transition-all group"
                onClick={() => setSelectedSkill(skill)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                        {skill.display_name || skill.name}
                      </h3>
                      <p className="text-[10px] text-muted-foreground font-mono">{skill.name}</p>
                    </div>
                    <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 border flex-shrink-0", CATEGORY_CONFIG[skill.category]?.color || CATEGORY_CONFIG.general.color)}>
                      {CATEGORY_CONFIG[skill.category]?.label || skill.category}
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{skill.description}</p>

                  <div className="flex items-center gap-2 flex-wrap">
                    {skill.difficulty && (
                      <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-medium", DIFFICULTY_CONFIG[skill.difficulty]?.color || "bg-gray-100 text-gray-700")}>
                        {DIFFICULTY_CONFIG[skill.difficulty]?.label || skill.difficulty}
                      </span>
                    )}
                    <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                      <Zap className="w-2.5 h-2.5" />
                      v{skill.version}
                    </span>
                    {(skill.total_uses || 0) > 0 && (
                      <span className="text-[9px] text-muted-foreground">
                        {skill.total_uses} uses
                      </span>
                    )}
                    {skill.performance_score && skill.performance_score > 0 && (
                      <span className="text-[9px] text-amber-600 font-medium">
                        {skill.performance_score.toFixed(1)} score
                      </span>
                    )}
                  </div>

                  {skill.tags && skill.tags.length > 0 && (
                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                      {skill.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="text-[8px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded flex items-center gap-0.5">
                          <Tag className="w-2 h-2" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Detail Panel */}
      <AnimatePresence>
        {selectedSkill && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/30"
              onClick={() => setSelectedSkill(null)}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed top-0 right-0 z-50 h-full w-full max-w-lg bg-card shadow-xl overflow-y-auto"
            >
              <SkillDetail skill={selectedSkill} onClose={() => setSelectedSkill(null)} onRefresh={fetchSkills} showToast={showToast} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreate && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/30"
              onClick={() => setShowCreate(false)}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed top-0 right-0 z-50 h-full w-full max-w-lg bg-card shadow-xl overflow-y-auto"
            >
              <CreateSkillForm
                saving={saving}
                onSave={async (data) => {
                  setSaving(true);
                  try {
                    const res = await fetch("/api/skills", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(data),
                    });
                    const json = await res.json();
                    if (json.success) {
                      showToast("Skill created");
                      setShowCreate(false);
                      fetchSkills();
                    } else {
                      showToast(json.error || "Failed to create skill");
                    }
                  } catch {
                    showToast("Failed to create skill");
                  } finally {
                    setSaving(false);
                  }
                }}
                onCancel={() => setShowCreate(false)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ===========================================================================
// Skill Detail Panel
// ===========================================================================

function SkillDetail({ skill, onClose, onRefresh, showToast }: { skill: Skill; onClose: () => void; onRefresh: () => void; showToast: (msg: string) => void }) {
  const [rating, setRating] = useState(0);

  const handleRate = async () => {
    if (rating === 0) return;
    try {
      await fetch("/api/skills/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill_id: skill.id, agent_id: "system", rating }),
      });
      showToast("Skill rated");
      onRefresh();
    } catch {
      showToast("Failed to rate");
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-foreground">{skill.display_name || skill.name}</h2>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={cn("text-[10px] border", CATEGORY_CONFIG[skill.category]?.color)}>
            {CATEGORY_CONFIG[skill.category]?.label || skill.category}
          </Badge>
          <span className="text-[10px] font-mono text-muted-foreground">{skill.slug}</span>
          <span className="text-[10px] text-muted-foreground">v{skill.version}</span>
        </div>

        <p className="text-sm text-muted-foreground">{skill.description}</p>

        {/* Metrics */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Score", value: skill.performance_score?.toFixed(1) || "N/A", color: "text-amber-600" },
            { label: "Uses", value: skill.total_uses || 0, color: "text-blue-600" },
            { label: "Rating", value: skill.avg_rating?.toFixed(1) || "N/A", color: "text-emerald-600" },
            { label: "Success", value: skill.successful_uses || 0, color: "text-purple-600" },
          ].map((m) => (
            <div key={m.label} className="rounded-lg border border-border bg-secondary/30 p-2 text-center">
              <p className="text-[10px] text-muted-foreground">{m.label}</p>
              <p className={cn("text-sm font-bold", m.color)}>{m.value}</p>
            </div>
          ))}
        </div>

        {/* Prompt Template */}
        <div>
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Prompt Template</span>
          <pre className="text-xs text-foreground mt-1 bg-secondary rounded-lg p-3 overflow-x-auto max-h-60 whitespace-pre-wrap font-mono">
            {skill.prompt_template}
          </pre>
        </div>

        {/* Workflow Steps */}
        {skill.workflow_steps && skill.workflow_steps.length > 0 && (
          <div>
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Workflow Steps</span>
            <ol className="mt-1 space-y-1">
              {skill.workflow_steps.map((step, i) => (
                <li key={i} className="text-xs text-foreground bg-secondary rounded-lg p-2 flex items-start gap-2">
                  <span className="text-[10px] font-bold text-[#3730a3] mt-0.5">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Required Tools */}
        {skill.required_tools && skill.required_tools.length > 0 && (
          <div>
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Required Tools</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {skill.required_tools.map((tool) => (
                <Badge key={tool} variant="secondary" className="text-[9px]">{tool}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Rate Skill */}
        <div className="pt-4 border-t border-border">
          <span className="text-xs font-medium text-foreground">Rate this skill</span>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  className="transition-colors"
                >
                  <Star
                    className={cn(
                      "w-5 h-5",
                      star <= rating ? "fill-amber-400 text-amber-400" : "text-gray-300 hover:text-amber-300"
                    )}
                  />
                </button>
              ))}
            </div>
            <Button size="sm" onClick={handleRate} disabled={rating === 0} className="text-xs gap-1">
              <CheckCircle className="w-3 h-3" />
              Rate
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Create Skill Form
// ===========================================================================

function CreateSkillForm({ saving, onSave, onCancel }: { saving: boolean; onSave: (data: Record<string, unknown>) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [difficulty, setDifficulty] = useState("intermediate");
  const [promptTemplate, setPromptTemplate] = useState("");
  const [tags, setTags] = useState("");

  const handleSubmit = () => {
    if (!name.trim() || !description.trim() || !promptTemplate.trim()) return;
    onSave({
      name: name.trim(),
      display_name: displayName.trim() || undefined,
      description: description.trim(),
      category,
      difficulty,
      prompt_template: promptTemplate.trim(),
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    });
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-foreground">New Skill</h2>
        <button onClick={onCancel} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">Skill Name * (snake_case)</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. custom_research_skill" className="text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">Display Name</label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Custom Research Skill" className="text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">Description *</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this skill do?"
            rows={2}
            className="flex w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:border-ring/40 resize-none"
          />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-foreground mb-1.5">Category</label>
            <div className="relative">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm appearance-none focus:outline-none">
                {CATEGORIES.filter((c) => c !== "all").map((c) => (
                  <option key={c} value={c}>{CATEGORY_CONFIG[c]?.label || c}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-foreground mb-1.5">Difficulty</label>
            <div className="relative">
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm appearance-none focus:outline-none">
                {Object.entries(DIFFICULTY_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">Prompt Template *</label>
          <textarea
            value={promptTemplate}
            onChange={(e) => setPromptTemplate(e.target.value)}
            placeholder="The prompt template that guides agents when using this skill..."
            rows={6}
            className="flex w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:border-ring/40 resize-none font-mono"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">Tags (comma-separated)</label>
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="research, analysis, automation" className="text-sm" />
        </div>
        <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
          <Button variant="ghost" size="sm" className="text-xs" onClick={onCancel}>Cancel</Button>
          <Button
            size="sm"
            className="text-xs gap-1.5 bg-primary hover:bg-primary/90"
            onClick={handleSubmit}
            disabled={!name.trim() || !description.trim() || !promptTemplate.trim() || saving}
          >
            {saving ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <CheckCircle className="w-3.5 h-3.5" />
            )}
            Create Skill
          </Button>
        </div>
      </div>
    </div>
  );
}
