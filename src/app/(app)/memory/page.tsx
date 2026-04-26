"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  Plus,
  Trash2,
  X,
  Search,
  Star,
  Tag,
  Bot,
  Filter,
  Download,
  ChevronDown,
  AlertCircle,
  CheckCircle,
  ArrowUpDown,
  BarChart3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MemoryItem {
  id: string;
  agentId: string;
  category: string;
  content: string;
  importance: number;
  createdAt: string;
  updatedAt: string;
}

const KNOWN_AGENTS = [
  { id: "general", name: "Klawhub General", emoji: "🤵" },
  { id: "mail", name: "Mail Agent", emoji: "✉️" },
  { id: "code", name: "Code Agent", emoji: "💻" },
  { id: "data", name: "Data Agent", emoji: "📊" },
  { id: "creative", name: "Creative Agent", emoji: "🧠" },
  { id: "research", name: "Research Agent", emoji: "🔍" },
  { id: "ops", name: "Ops Agent", emoji: "⚡" },
];

const CATEGORIES = [
  { id: "general", label: "General", color: "bg-slate-500/20 text-slate-600 border-slate-500/30" },
  { id: "preference", label: "Preference", color: "bg-blue-500/20 text-blue-600 border-blue-500/30" },
  { id: "context", label: "Context", color: "bg-purple-500/20 text-purple-600 border-purple-500/30" },
  { id: "instruction", label: "Instruction", color: "bg-amber-500/20 text-amber-600 border-amber-500/30" },
] as const;

type SortKey = "importance" | "recent" | "category";

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

export default function MemoryPage() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterAgent, setFilterAgent] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("importance");
  const [panelOpen, setPanelOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Form state
  const [formContent, setFormContent] = useState("");
  const [formCategory, setFormCategory] = useState("general");
  const [formAgent, setFormAgent] = useState("general");
  const [formImportance, setFormImportance] = useState(5);
  const [saving, setSaving] = useState(false);

  // ---------------------------------------------------------------------------
  // Data fetch
  // ---------------------------------------------------------------------------

  const fetchMemories = useCallback(async () => {
    try {
      const params = new URLSearchParams({ all: "true" });
      if (search) params.set("q", search);
      const res = await fetch(`/api/memory?${params}`);
      const json = await res.json();
      if (json.success) setMemories(json.data || []);
    } catch {
      // silent
    }
  }, [search]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchMemories();
      setLoading(false);
    };
    init();
  }, [fetchMemories]);

  // ---------------------------------------------------------------------------
  // Filtered & sorted data
  // ---------------------------------------------------------------------------

  const filteredMemories = useMemo(() => {
    let items = [...memories];

    // Agent filter
    if (filterAgent !== "all") {
      items = items.filter((m) => m.agentId === filterAgent);
    }

    // Category filter
    if (filterCategory !== "all") {
      items = items.filter((m) => m.category === filterCategory);
    }

    // Client-side search refinement (API also searches, but this covers filter changes)
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (m) =>
          m.content.toLowerCase().includes(q) ||
          m.category.toLowerCase().includes(q) ||
          m.agentId.toLowerCase().includes(q)
      );
    }

    // Sort
    switch (sortBy) {
      case "importance":
        items.sort((a, b) => b.importance - a.importance);
        break;
      case "recent":
        items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        break;
      case "category":
        items.sort((a, b) => a.category.localeCompare(b.category) || b.importance - a.importance);
        break;
    }

    return items;
  }, [memories, filterAgent, filterCategory, search, sortBy]);

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  const stats = useMemo(() => {
    const categoryCounts: Record<string, number> = {};
    const agentCounts: Record<string, number> = {};
    let totalImportance = 0;
    let avgImportance = 0;

    for (const m of memories) {
      categoryCounts[m.category] = (categoryCounts[m.category] || 0) + 1;
      agentCounts[m.agentId] = (agentCounts[m.agentId] || 0) + 1;
      totalImportance += m.importance;
    }
    if (memories.length > 0) avgImportance = totalImportance / memories.length;

    return { total: memories.length, categoryCounts, agentCounts, avgImportance };
  }, [memories]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleAdd = async () => {
    if (!formContent.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: formAgent,
          category: formCategory,
          content: formContent.trim(),
          importance: formImportance,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setPanelOpen(false);
        setFormContent("");
        setFormCategory("general");
        setFormImportance(5);
        await fetchMemories();
        showToast("Memory added");
      }
    } catch {
      // silent
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/memory?id=${id}`, { method: "DELETE" });
      setDeleteConfirm(null);
      await fetchMemories();
      showToast("Memory deleted");
    } catch {
      // silent
    }
  };

  const handleExport = () => {
    const data = filteredMemories.map((m) => ({
      agent: KNOWN_AGENTS.find((a) => a.id === m.agentId)?.name || m.agentId,
      category: m.category,
      importance: m.importance,
      content: m.content,
      created: m.createdAt,
      updated: m.updatedAt,
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `klaw-memories-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${data.length} memories`);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const getAgentInfo = (agentId: string) => KNOWN_AGENTS.find((a) => a.id === agentId) || { id: agentId, name: agentId, emoji: "🤖" };
  const getCategoryStyle = (cat: string) => CATEGORIES.find((c) => c.id === cat)?.color || CATEGORIES[0].color;
  const getCategoryLabel = (cat: string) => CATEGORIES.find((c) => c.id === cat)?.label || cat;

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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8"
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
            <Brain className="w-5 h-5 text-[#3730a3]" />
            <h1 className="text-xl font-bold text-foreground">Memory Management</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-8">
            Persistent context that agents remember across sessions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={handleExport} disabled={memories.length === 0}>
            <Download className="w-3.5 h-3.5" />
            Export
          </Button>
          <Button size="sm" className="gap-2 text-xs bg-primary hover:bg-primary/90" onClick={() => setPanelOpen(true)}>
            <Plus className="w-3.5 h-3.5" />
            Add Memory
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total Memories", value: stats.total, icon: <Brain className="w-4 h-4" /> },
          { label: "Avg Importance", value: stats.avgImportance.toFixed(1), icon: <Star className="w-4 h-4" /> },
          { label: "Categories", value: Object.keys(stats.categoryCounts).length, icon: <Tag className="w-4 h-4" /> },
          { label: "Active Agents", value: Object.keys(stats.agentCounts).length, icon: <Bot className="w-4 h-4" /> },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              {s.icon}
              <span className="text-[10px] font-medium uppercase tracking-wider">{s.label}</span>
            </div>
            <p className="text-lg font-bold text-[#3730a3]">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search + Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search memories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-8 py-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:border-ring/40 focus:ring-1 focus:ring-ring/20 transition-all min-h-[44px]"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>

          {/* Filters row */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              <Filter className="w-3 h-3" />
              Filters:
            </div>

            {/* Agent filter */}
            <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
              <button
                onClick={() => setFilterAgent("all")}
                className={cn(
                  "px-2 py-1 text-[10px] rounded-md transition-colors",
                  filterAgent === "all" ? "bg-card text-foreground shadow-sm font-medium" : "text-muted-foreground"
                )}
              >
                All Agents
              </button>
              {KNOWN_AGENTS.filter((a) => stats.agentCounts[a.id]).map((a) => (
                <button
                  key={a.id}
                  onClick={() => setFilterAgent(a.id)}
                  className={cn(
                    "px-2 py-1 text-[10px] rounded-md transition-colors flex items-center gap-1",
                    filterAgent === a.id ? "bg-card text-foreground shadow-sm font-medium" : "text-muted-foreground"
                  )}
                >
                  {a.emoji} {a.name.split(" ")[0]}
                  <span className="text-[8px] opacity-50">{stats.agentCounts[a.id] || 0}</span>
                </button>
              ))}
            </div>

            {/* Category filter */}
            <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
              <button
                onClick={() => setFilterCategory("all")}
                className={cn(
                  "px-2 py-1 text-[10px] rounded-md transition-colors",
                  filterCategory === "all" ? "bg-card text-foreground shadow-sm font-medium" : "text-muted-foreground"
                )}
              >
                All
              </button>
              {CATEGORIES.filter((c) => stats.categoryCounts[c.id]).map((c) => (
                <button
                  key={c.id}
                  onClick={() => setFilterCategory(c.id)}
                  className={cn(
                    "px-2 py-1 text-[10px] rounded-md transition-colors",
                    filterCategory === c.id ? "bg-card text-foreground shadow-sm font-medium" : "text-muted-foreground"
                  )}
                >
                  {c.label}
                  <span className="text-[8px] opacity-50 ml-0.5">{stats.categoryCounts[c.id] || 0}</span>
                </button>
              ))}
            </div>

            {/* Sort */}
            <div className="flex items-center gap-1 ml-auto">
              <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="text-[10px] bg-transparent border-none focus:outline-none text-foreground font-medium cursor-pointer"
              >
                <option value="importance">Importance</option>
                <option value="recent">Most Recent</option>
                <option value="category">Category</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results count */}
      <div className="flex items-center justify-between mb-3 px-1">
        <span className="text-xs text-muted-foreground">
          {filteredMemories.length} {filteredMemories.length === 1 ? "memory" : "memories"}
          {search && <> matching &quot;{search}&quot;</>}
        </span>
      </div>

      {/* Memory list */}
      {filteredMemories.length === 0 ? (
        <Card>
          <CardContent className="py-16">
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
                <Brain className="w-7 h-7 text-muted-foreground" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1">
                {memories.length === 0 ? "No memories yet" : "No matching memories"}
              </h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
                {memories.length === 0
                  ? "Add memories to give agents persistent context across conversations."
                  : "Try adjusting your search or filters."}
              </p>
              {memories.length === 0 && (
                <Button variant="outline" onClick={() => setPanelOpen(true)} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Add First Memory
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {filteredMemories.map((mem) => {
              const agent = getAgentInfo(mem.agentId);
              return (
                <motion.div key={mem.id} variants={itemVariants} initial="hidden" animate="show" exit={{ opacity: 0, height: 0 }}>
                  <Card className="hover:border-primary/20 transition-all duration-200 active:bg-card">
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          {/* Meta row */}
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="text-sm">{agent.emoji}</span>
                            <Badge variant="outline" className="text-[9px] font-medium">{agent.name}</Badge>
                            <Badge
                              variant="outline"
                              className={cn("text-[9px]", getCategoryStyle(mem.category))}
                            >
                              {getCategoryLabel(mem.category)}
                            </Badge>
                            {/* Importance stars */}
                            <div className="flex items-center gap-0.5">
                              {Array.from({ length: 5 }, (_, i) => (
                                <Star
                                  key={i}
                                  className={cn(
                                    "w-3 h-3",
                                    i < Math.round(mem.importance / 2) ? "text-amber-500 fill-amber-400" : "text-[#e0ddd7]"
                                  )}
                                />
                              ))}
                              <span className="text-[9px] text-muted-foreground ml-1 font-mono">{mem.importance}/10</span>
                            </div>
                          </div>
                          {/* Content */}
                          <p className="text-sm text-foreground leading-relaxed">{mem.content}</p>
                          {/* Timestamp */}
                          <p className="text-[10px] text-muted-foreground mt-2">
                            {timeAgo(mem.updatedAt)}
                            {mem.updatedAt !== mem.createdAt && ` · edited ${timeAgo(mem.createdAt)}`}
                          </p>
                        </div>
                        {/* Delete */}
                        <div className="flex-shrink-0">
                          {deleteConfirm === mem.id ? (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDelete(mem.id)}
                                className="text-[10px] h-7 px-2"
                              >
                                Delete
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
                              onClick={() => setDeleteConfirm(mem.id)}
                              className="text-xs text-muted-foreground hover:text-red-500"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Add Memory Slide Panel */}
      <AnimatePresence>
        {panelOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPanelOpen(false)}
            />
            <motion.div
              className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-card border-l border-border shadow-2xl flex flex-col"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 250 }}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <h2 className="text-base font-semibold text-foreground">Add Memory</h2>
                <button onClick={() => setPanelOpen(false)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 custom-scrollbar">
                {/* Agent */}
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5">Agent</label>
                  <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
                    {KNOWN_AGENTS.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => setFormAgent(a.id)}
                        className={cn(
                          "px-2.5 py-1.5 text-[11px] rounded-md transition-colors flex items-center gap-1",
                          formAgent === a.id
                            ? "bg-card text-foreground shadow-sm font-medium"
                            : "text-muted-foreground"
                        )}
                      >
                        {a.emoji} {a.name.split(" ")[0]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Content */}
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5">
                    Content <span className="text-red-500">*</span>
                  </label>
                  <Textarea
                    value={formContent}
                    onChange={(e) => setFormContent(e.target.value)}
                    placeholder="e.g., User prefers dark mode, works with TypeScript, uses VS Code..."
                    rows={5}
                    className="resize-y"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    This will be injected into the agent&apos;s system prompt as persistent context.
                  </p>
                </div>

                {/* Category */}
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5">Category</label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setFormCategory(c.id)}
                        className={cn(
                          "text-xs px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5",
                          formCategory === c.id
                            ? "border-primary bg-primary/10 text-[#3730a3] font-medium"
                            : "border-border text-muted-foreground hover:border-primary/30"
                        )}
                      >
                        <Tag className="w-3 h-3" />
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Importance */}
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5">
                    Importance: <span className="text-[#3730a3] font-bold">{formImportance}</span>/10
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={formImportance}
                      onChange={(e) => setFormImportance(parseInt(e.target.value, 10))}
                      className="flex-1 accent-[#3730a3]"
                      style={{
                        background: `linear-gradient(to right, #3730a3 0%, #3730a3 ${((formImportance - 1) / 9) * 100}%, hsl(var(--muted)) ${((formImportance - 1) / 9) * 100}%, hsl(var(--muted)) 100%)`,
                      }}
                    />
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }, (_, i) => (
                        <Star
                          key={i}
                          className={cn(
                            "w-4 h-4",
                            i < Math.round(formImportance / 2) ? "text-amber-500 fill-amber-400" : "text-[#e0ddd7]"
                          )}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    Higher importance = shown first in agent&apos;s memory context. Use 8-10 for critical facts.
                  </p>
                </div>

                {/* Importance presets */}
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: "Low (3)", value: 3, desc: "Nice to know" },
                    { label: "Medium (5)", value: 5, desc: "Generally useful" },
                    { label: "High (8)", value: 8, desc: "Important fact" },
                    { label: "Critical (10)", value: 10, desc: "Must remember" },
                  ].map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setFormImportance(p.value)}
                      className={cn(
                        "px-2.5 py-1.5 rounded-md border text-[10px] transition-all",
                        formImportance === p.value
                          ? "border-primary bg-primary/10 text-[#3730a3] font-medium"
                          : "border-border text-muted-foreground hover:border-primary/30"
                      )}
                    >
                      {p.label}
                      <span className="opacity-60 ml-0.5">— {p.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
                <Button variant="outline" onClick={() => setPanelOpen(false)} disabled={saving} className="text-xs">
                  Cancel
                </Button>
                <Button
                  onClick={handleAdd}
                  disabled={!formContent.trim() || saving}
                  className="gap-2 text-xs bg-primary hover:bg-primary/90"
                >
                  {saving ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  Add Memory
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
