"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lightbulb,
  Plus,
  X,
  CheckCircle,
  TrendingUp,
  Brain,
  Sparkles,
  ChevronDown,
  Filter,
  ArrowUpDown,
  RefreshCw,
  BarChart3,
  Target,
  Zap,
  Trash2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/core/utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_AGENTS = [
  { id: "general", name: "Klawhub General", role: "General-purpose AI assistant" },
  { id: "mail", name: "Mail Agent", role: "Email & calendar management" },
  { id: "code", name: "Code Agent", role: "GitHub & Vercel development" },
  { id: "data", name: "Data Agent", role: "Drive, Sheets & Docs" },
  { id: "creative", name: "Creative Agent", role: "Content & design creation" },
  { id: "research", name: "Research Agent", role: "Deep research & intelligence" },
  { id: "ops", name: "Ops Agent", role: "Monitoring & health checks" },
];

// ---------------------------------------------------------------------------
// Types — match the API response from self-learning.ts mapRow()
// ---------------------------------------------------------------------------

type InsightType = "preference" | "correction" | "pattern" | "skill_gain" | "workflow";
type InsightSource = "user_feedback" | "correction" | "pattern_detection" | "routine_result";

interface LearningInsight {
  id: string;
  agentId: string;
  insightType: InsightType;
  content: string;
  source: InsightSource;
  confidence: number;
  applicationCount: number;
  lastAppliedAt: string;
  createdAt: string;
  updatedAt: string;
}

interface InsightStats {
  totalInsights: number;
  byAgent: Record<string, number>;
  byType: Record<string, number>;
  avgConfidence: number;
  topApplied: number;
}

const TYPE_CONFIG: Record<InsightType, { label: string; badgeClass: string; icon: React.ReactNode }> = {
  preference: { label: "Preference", badgeClass: "bg-blue-100 text-blue-700 border-blue-200", icon: <Lightbulb className="w-3 h-3" /> },
  correction: { label: "Correction", badgeClass: "bg-rose-100 text-rose-700 border-rose-200", icon: <Target className="w-3 h-3" /> },
  pattern: { label: "Pattern", badgeClass: "bg-purple-100 text-purple-700 border-purple-200", icon: <Brain className="w-3 h-3" /> },
  skill_gain: { label: "Skill Gain", badgeClass: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: <TrendingUp className="w-3 h-3" /> },
  workflow: { label: "Workflow", badgeClass: "bg-amber-100 text-amber-700 border-amber-200", icon: <Zap className="w-3 h-3" /> },
};

const SOURCE_CONFIG: Record<InsightSource, { label: string }> = {
  user_feedback: { label: "Feedback" },
  correction: { label: "Correction" },
  pattern_detection: { label: "Detection" },
  routine_result: { label: "Routine" },
};

const TYPE_COLORS: Record<InsightType, string> = {
  preference: "bg-blue-500",
  correction: "bg-rose-500",
  pattern: "bg-purple-500",
  skill_gain: "bg-emerald-500",
  workflow: "bg-amber-500",
};

const TYPE_DOT_COLORS: Record<InsightType, string> = {
  preference: "bg-blue-500",
  correction: "bg-rose-500",
  pattern: "bg-purple-500",
  skill_gain: "bg-emerald-500",
  workflow: "bg-amber-500",
};

type SortKey = "confidence" | "recent" | "applied";

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

function formatDate(dateStr: string): string {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(dateStr: string): string {
  if (!dateStr) return "Never";
  return new Date(dateStr).toLocaleString();
}

function confidenceColor(c: number): string {
  return c >= 0.8 ? "bg-emerald-500" : c >= 0.5 ? "bg-amber-500" : "bg-red-400";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function InsightsPage() {
  const [insights, setInsights] = useState<LearningInsight[]>([]);
  const [stats, setStats] = useState<InsightStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [filterAgent, setFilterAgent] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("recent");
  const [showRecord, setShowRecord] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detectAgent, setDetectAgent] = useState<string>("all");
  const [agents] = useState(DEFAULT_AGENTS.map((a) => ({ id: a.id, name: a.name, role: a.role })));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchInsights = useCallback(async () => {
    try {
      setError(null);
      const params = new URLSearchParams();
      params.set("action", "insights");
      if (filterAgent !== "all") params.set("agentId", filterAgent);
      if (filterType !== "all") params.set("type", filterType);
      const res = await fetch(`/api/learning?${params}`);
      const json = await res.json();
      if (json.success) {
        // API returns camelCase from self-learning.ts mapRow()
        setInsights(json.data || []);
      } else {
        setError(json.error || "Failed to fetch insights");
      }
    } catch (e) {
      setError("Network error loading insights");
    }
  }, [filterAgent, filterType]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/learning?action=stats");
      const json = await res.json();
      if (json.success) {
        setStats(json.data);
      }
    } catch {
      // silent — stats are secondary
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchInsights(), fetchStats()]).finally(() => setLoading(false));
  }, [fetchInsights, fetchStats]);

  const sortedInsights = useMemo(() => {
    const sorted = [...insights];
    switch (sortBy) {
      case "confidence":
        sorted.sort((a, b) => b.confidence - a.confidence);
        break;
      case "recent":
        sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case "applied":
        sorted.sort((a, b) => b.applicationCount - a.applicationCount);
        break;
    }
    if (filterSource !== "all") {
      return sorted.filter((i) => i.source === filterSource);
    }
    return sorted;
  }, [insights, sortBy, filterSource]);

  const handleDetectPatterns = async () => {
    setDetecting(true);
    try {
      const res = await fetch("/api/learning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "detect_patterns",
          agentId: detectAgent !== "all" ? detectAgent : undefined,
          conversations: [],
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(`Pattern detection complete — ${json.data?.length || 0} insights found`);
        fetchInsights();
        fetchStats();
      } else {
        showToast(json.error || "Pattern detection failed", "error");
      }
    } catch {
      showToast("Pattern detection failed", "error");
    } finally {
      setDetecting(false);
    }
  };

  const handleRecordInsight = async (data: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch("/api/learning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "record", ...data }),
      });
      const json = await res.json();
      if (json.success) {
        showToast("Insight recorded successfully");
        setShowRecord(false);
        fetchInsights();
        fetchStats();
      } else {
        showToast(json.error || "Failed to record insight", "error");
      }
    } catch {
      showToast("Failed to record insight", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteInsight = async (insightId: string) => {
    if (!confirm("Delete this insight permanently?")) return;
    setDeleting(insightId);
    try {
      const res = await fetch("/api/learning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", insightId }),
      });
      const json = await res.json();
      if (json.success) {
        showToast("Insight deleted");
        setInsights((prev) => prev.filter((i) => i.id !== insightId));
        fetchStats();
      } else {
        showToast(json.error || "Failed to delete", "error");
      }
    } catch {
      showToast("Failed to delete", "error");
    } finally {
      setDeleting(null);
    }
  };

  const handleDecay = async () => {
    try {
      const res = await fetch("/api/learning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "decay" }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(`Decayed ${json.decayed || 0} stale insights`);
        fetchInsights();
        fetchStats();
      }
    } catch {
      showToast("Decay failed", "error");
    }
  };

  const getAgentName = (agentId: string): string => {
    return agents.find((a) => a.id === agentId)?.name || agentId;
  };

  // --- Loading state ---
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={cn(
              "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-medium shadow-lg",
              toast.type === "error" ? "bg-red-600" : "bg-[#1a1a2e]"
            )}
          >
            {toast.type === "success" ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <X className="w-4 h-4" />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Lightbulb className="w-5 h-5 text-[#3730a3]" />
            <h1 className="text-xl font-bold text-foreground">Learning Insights</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-8">
            Track how your agents learn and improve over time
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={() => { fetchInsights(); fetchStats(); }}>
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
          <Button size="sm" className="gap-2 text-xs bg-primary hover:bg-primary/90" onClick={() => setShowRecord(true)}>
            <Plus className="w-3.5 h-3.5" />
            Record Insight
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Stats overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <BarChart3 className="w-4 h-4" />
            <span className="text-[10px] font-medium uppercase tracking-wider">Total</span>
          </div>
          <p className="text-lg font-bold text-[#3730a3]">{stats?.totalInsights ?? 0}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Sparkles className="w-4 h-4" />
            <span className="text-[10px] font-medium uppercase tracking-wider">Avg Confidence</span>
          </div>
          <p className="text-lg font-bold text-[#3730a3]">
            {stats?.avgConfidence != null ? `${Math.round(stats.avgConfidence * 100)}%` : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <TrendingUp className="w-4 h-4" />
            <span className="text-[10px] font-medium uppercase tracking-wider">Times Applied</span>
          </div>
          <p className="text-lg font-bold text-foreground">{stats?.topApplied ?? 0}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Brain className="w-4 h-4" />
            <span className="text-[10px] font-medium uppercase tracking-wider">Top Agent</span>
          </div>
          <p className="text-lg font-bold text-foreground truncate">
            {stats?.byAgent
              ? getAgentName(Object.entries(stats.byAgent).sort((a, b) => b[1] - a[1])[0]?.[0] || "")
              : "—"}
          </p>
        </div>
      </div>

      {/* Type breakdown bar */}
      {stats?.byType && Object.keys(stats.byType).length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">By Type</span>
          </div>
          <div className="flex items-center gap-1 h-3 rounded-full overflow-hidden bg-secondary">
            {(Object.entries(stats.byType) as [InsightType, number][])
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => {
                const total = Object.values(stats.byType).reduce((s, v) => s + v, 0);
                const pct = total > 0 ? (count / total) * 100 : 0;
                return (
                  <motion.div
                    key={type}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className={cn("h-full rounded-full", TYPE_COLORS[type])}
                    title={`${TYPE_CONFIG[type].label}: ${count}`}
                  />
                );
              })}
          </div>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {(Object.entries(stats.byType) as [InsightType, number][])
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => (
                <span key={type} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className={cn("w-2 h-2 rounded-full", TYPE_DOT_COLORS[type])} />
                  {TYPE_CONFIG[type].label} ({count})
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Filters & Sort */}
      <div className="space-y-3 mb-6">
        {/* Agent filter */}
        <div className="flex items-center gap-3 overflow-x-auto pb-1 scrollbar-none">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Agent:</span>
          </div>
          <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
            <button
              onClick={() => setFilterAgent("all")}
              className={cn(
                "px-2.5 py-1 text-[10px] rounded-md transition-colors whitespace-nowrap",
                filterAgent === "all" ? "bg-card text-foreground shadow-sm font-medium" : "text-muted-foreground"
              )}
            >All</button>
            {agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => setFilterAgent(agent.id)}
                className={cn(
                  "px-2.5 py-1 text-[10px] rounded-md transition-colors whitespace-nowrap",
                  filterAgent === agent.id ? "bg-card text-foreground shadow-sm font-medium" : "text-muted-foreground"
                )}
              >{agent.name}</button>
            ))}
          </div>
        </div>

        {/* Type filter */}
        <div className="flex items-center gap-3 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Type:</span>
          <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
            <button
              onClick={() => setFilterType("all")}
              className={cn("px-2.5 py-1 text-[10px] rounded-md transition-colors whitespace-nowrap", filterType === "all" ? "bg-card text-foreground shadow-sm font-medium" : "text-muted-foreground")}
            >All</button>
            {(Object.entries(TYPE_CONFIG) as [InsightType, typeof TYPE_CONFIG[InsightType]][]).map(([key, cfg]) => (
              <button key={key} onClick={() => setFilterType(key)} className={cn("px-2.5 py-1 text-[10px] rounded-md transition-colors whitespace-nowrap flex items-center gap-1", filterType === key ? "bg-card text-foreground shadow-sm font-medium" : "text-muted-foreground")}>
                {cfg.icon} {cfg.label}
              </button>
            ))}
          </div>
        </div>

        {/* Source filter + Sort */}
        <div className="flex items-center gap-3 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Source:</span>
          <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
            <button onClick={() => setFilterSource("all")} className={cn("px-2.5 py-1 text-[10px] rounded-md transition-colors whitespace-nowrap", filterSource === "all" ? "bg-card text-foreground shadow-sm font-medium" : "text-muted-foreground")}>All</button>
            {(Object.entries(SOURCE_CONFIG) as [InsightSource, { label: string }][]).map(([key, cfg]) => (
              <button key={key} onClick={() => setFilterSource(key)} className={cn("px-2.5 py-1 text-[10px] rounded-md transition-colors whitespace-nowrap", filterSource === key ? "bg-card text-foreground shadow-sm font-medium" : "text-muted-foreground")}>{cfg.label}</button>
            ))}
          </div>
          <div className="flex items-center gap-1 ml-auto">
            <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
            <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
              {([{ key: "recent" as SortKey, label: "Recent" }, { key: "confidence" as SortKey, label: "Confidence" }, { key: "applied" as SortKey, label: "Applied" }]).map((s) => (
                <button key={s.key} onClick={() => setSortBy(s.key)} className={cn("px-2.5 py-1 text-[10px] rounded-md transition-colors whitespace-nowrap", sortBy === s.key ? "bg-card text-foreground shadow-sm font-medium" : "text-muted-foreground")}>{s.label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Actions row */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
          <select value={detectAgent} onChange={(e) => setDetectAgent(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-card text-xs appearance-none focus:outline-none focus:border-ring/40 pr-8">
            <option value="all">All Agents</option>
            {agents.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        </div>
        <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={handleDetectPatterns} disabled={detecting}>
          {detecting ? <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          Detect Patterns
        </Button>
        <Button variant="ghost" size="sm" className="gap-2 text-xs text-muted-foreground" onClick={handleDecay}>
          Decay Stale
        </Button>
      </div>

      {/* Record Insight Slide Panel */}
      <AnimatePresence>
        {showRecord && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/30" onClick={() => setShowRecord(false)} />
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }} className="fixed top-0 right-0 z-50 h-full w-full max-w-md bg-card shadow-xl overflow-y-auto">
              <RecordInsightForm agents={agents} saving={saving} onSave={handleRecordInsight} onCancel={() => setShowRecord(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Insights list */}
      {sortedInsights.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
              <Lightbulb className="w-7 h-7 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-1">No insights yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Insights will appear as your agents learn from interactions and detect patterns.
            </p>
            <div className="flex items-center gap-2 justify-center">
              <Button size="sm" className="gap-2 text-xs bg-primary hover:bg-primary/90" onClick={() => setShowRecord(true)}>
                <Plus className="w-3.5 h-3.5" />
                Record Insight
              </Button>
              <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={handleDetectPatterns} disabled={detecting}>
                <Sparkles className="w-3.5 h-3.5" />
                Detect Patterns
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sortedInsights.map((insight) => (
            <motion.div key={insight.id} variants={itemVariants} initial="hidden" animate="show" layout>
              <Card
                className="border border-border bg-card rounded-xl overflow-hidden cursor-pointer hover:border-primary/20 hover:shadow-sm transition-all"
                onClick={() => setExpandedId(expandedId === insight.id ? null : insight.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={cn("w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 mt-0.5", TYPE_CONFIG[insight.insightType]?.badgeClass)}>
                      {TYPE_CONFIG[insight.insightType]?.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 border", TYPE_CONFIG[insight.insightType]?.badgeClass)}>
                          {TYPE_CONFIG[insight.insightType]?.label}
                        </Badge>
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                          {SOURCE_CONFIG[insight.source]?.label}
                        </Badge>
                        <span className="flex items-center gap-1 text-[10px] text-[#3730a3] font-medium bg-primary/8 px-1.5 py-0.5 rounded">
                          {getAgentName(insight.agentId)}
                        </span>
                      </div>

                      <p className="text-sm text-foreground line-clamp-2 mb-2">{insight.content}</p>

                      {/* Confidence bar */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">Confidence</span>
                        <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden max-w-[120px]">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${insight.confidence * 100}%` }}
                            transition={{ duration: 0.5, ease: "easeOut" }}
                            className={cn("h-full rounded-full", confidenceColor(insight.confidence))}
                          />
                        </div>
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {Math.round(insight.confidence * 100)}%
                        </span>
                      </div>

                      {/* Meta */}
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span>Applied {insight.applicationCount}x</span>
                        <span>{formatDate(insight.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Expanded content */}
                  <AnimatePresence>
                    {expandedId === insight.id && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="mt-3 pt-3 border-t border-border">
                          <div className="bg-secondary rounded-lg p-3">
                            <p className="text-xs text-foreground leading-relaxed">{insight.content}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-3 mt-3">
                            <div>
                              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Last Applied</span>
                              <p className="text-xs text-foreground mt-0.5">{formatDateTime(insight.lastAppliedAt)}</p>
                            </div>
                            <div>
                              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Updated</span>
                              <p className="text-xs text-foreground mt-0.5">{formatDateTime(insight.updatedAt)}</p>
                            </div>
                          </div>
                          <div className="flex justify-end mt-3 pt-3 border-t border-border">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1.5 text-xs text-red-500 hover:text-red-600 hover:bg-red-50"
                              onClick={(e) => { e.stopPropagation(); handleDeleteInsight(insight.id); }}
                              disabled={deleting === insight.id}
                            >
                              {deleting === insight.id ? <div className="w-3 h-3 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /> : <Trash2 className="w-3 h-3" />}
                              Delete
                            </Button>
                          </div>
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
    </motion.div>
  );
}

// ===========================================================================
// Record Insight Form
// ===========================================================================

function RecordInsightForm({
  agents,
  saving,
  onSave,
  onCancel,
}: {
  agents: { id: string; name: string; role: string }[];
  saving: boolean;
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [agentId, setAgentId] = useState("");
  const [insightType, setInsightType] = useState<InsightType>("pattern");
  const [content, setContent] = useState("");
  const [source, setSource] = useState<InsightSource>("user_feedback");
  const [confidence, setConfidence] = useState(0.5);

  const handleSubmit = () => {
    if (!agentId || !content.trim()) return;
    onSave({ agentId, insightType, content: content.trim(), source, confidence });
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-foreground">Record Insight</h2>
        <button onClick={onCancel} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-4">
        {/* Agent selector */}
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">Agent *</label>
          <div className="relative">
            <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm appearance-none focus:outline-none focus:border-ring/40">
              <option value="">Select agent...</option>
              {agents.map((a) => (<option key={a.id} value={a.id}>{a.name} — {a.role}</option>))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {/* Type selector */}
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">Insight Type</label>
          <div className="flex flex-wrap gap-1.5">
            {(Object.entries(TYPE_CONFIG) as [InsightType, typeof TYPE_CONFIG[InsightType]][]).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => setInsightType(key)}
                className={cn(
                  "px-2.5 py-1.5 rounded-md border text-[10px] font-medium transition-all flex items-center gap-1",
                  insightType === key ? cn(cfg.badgeClass, "border-current shadow-sm") : "border-border text-muted-foreground hover:border-primary/30"
                )}
              >
                {cfg.icon} {cfg.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">Content *</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Describe the insight..."
            rows={4}
            className="flex w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:border-ring/40 resize-none"
          />
        </div>

        {/* Source */}
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">Source</label>
          <div className="relative">
            <select value={source} onChange={(e) => setSource(e.target.value as InsightSource)} className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm appearance-none focus:outline-none focus:border-ring/40">
              {(Object.entries(SOURCE_CONFIG) as [InsightSource, { label: string }][]).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {/* Confidence slider */}
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">
            Confidence: <span className="text-[#3730a3]">{Math.round(confidence * 100)}%</span>
          </label>
          <input type="range" min="0" max="1" step="0.05" value={confidence} onChange={(e) => setConfidence(parseFloat(e.target.value))} className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-[#3730a3]" />
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-muted-foreground">Low (0%)</span>
            <span className="text-[10px] text-muted-foreground">High (100%)</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
          <Button variant="ghost" size="sm" className="text-xs" onClick={onCancel}>Cancel</Button>
          <Button size="sm" className="text-xs gap-1.5 bg-primary hover:bg-primary/90" onClick={handleSubmit} disabled={!agentId || !content.trim() || saving}>
            {saving ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
            Record Insight
          </Button>
        </div>
      </div>
    </div>
  );
}
