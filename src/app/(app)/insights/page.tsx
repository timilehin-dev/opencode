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
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getAllAgents } from "@/lib/agents";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InsightType = "preference" | "correction" | "pattern" | "skill_gain" | "workflow";
type InsightSource = "user_feedback" | "correction" | "pattern_detection" | "routine_result";

interface LearningInsight {
  id: string;
  agent_id: string;
  insight_type: InsightType;
  content: string;
  source: InsightSource;
  confidence: number;
  application_count: number;
  last_applied_at: string | null;
  created_at: string;
  updated_at: string;
}

interface InsightStats {
  totalInsights: number;
  byAgent: Record<string, number>;
  byType: Record<string, number>;
  avgConfidence: number;
  topApplied: LearningInsight[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TYPE_CONFIG: Record<
  InsightType,
  { label: string; badgeClass: string; icon: React.ReactNode }
> = {
  preference: {
    label: "Preference",
    badgeClass: "bg-blue-100 text-blue-700 border-blue-200",
    icon: <Lightbulb className="w-3 h-3" />,
  },
  correction: {
    label: "Correction",
    badgeClass: "bg-rose-100 text-rose-700 border-rose-200",
    icon: <Target className="w-3 h-3" />,
  },
  pattern: {
    label: "Pattern",
    badgeClass: "bg-purple-100 text-purple-700 border-purple-200",
    icon: <Brain className="w-3 h-3" />,
  },
  skill_gain: {
    label: "Skill Gain",
    badgeClass: "bg-emerald-100 text-emerald-700 border-emerald-200",
    icon: <TrendingUp className="w-3 h-3" />,
  },
  workflow: {
    label: "Workflow",
    badgeClass: "bg-amber-100 text-amber-700 border-amber-200",
    icon: <Zap className="w-3 h-3" />,
  },
};

const SOURCE_CONFIG: Record<InsightSource, { label: string }> = {
  user_feedback: { label: "Feedback" },
  correction: { label: "Correction" },
  pattern_detection: { label: "Detection" },
  routine_result: { label: "Routine" },
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
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function InsightsPage() {
  const [insights, setInsights] = useState<LearningInsight[]>([]);
  const [stats, setStats] = useState<InsightStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [filterAgent, setFilterAgent] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("recent");
  const [showRecord, setShowRecord] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detectAgent, setDetectAgent] = useState<string>("all");
  const [agents, setAgents] = useState<{ id: string; name: string; role: string }[]>([]);
  const [saving, setSaving] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const fetchInsights = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set("action", "insights");
      if (filterAgent !== "all") params.set("agentId", filterAgent);
      if (filterType !== "all") params.set("type", filterType);
      const res = await fetch(`/api/learning?${params}`);
      const json = await res.json();
      if (json.success) {
        setInsights(json.data || []);
      }
    } catch {
      // silent
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
      // silent
    }
  }, []);

  useEffect(() => {
    setAgents(getAllAgents().map((a) => ({ id: a.id, name: a.name, role: a.role })));
  }, []);

  useEffect(() => {
    Promise.all([fetchInsights(), fetchStats()]).finally(() => setLoading(false));
  }, [fetchInsights, fetchStats]);

  // Sort insights
  const sortedInsights = useMemo(() => {
    const sorted = [...insights];
    switch (sortBy) {
      case "confidence":
        sorted.sort((a, b) => b.confidence - a.confidence);
        break;
      case "recent":
        sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case "applied":
        sorted.sort((a, b) => b.application_count - a.application_count);
        break;
    }
    // Apply source filter client-side
    if (filterSource !== "all") {
      return sorted.filter((i) => i.source === filterSource);
    }
    return sorted;
  }, [insights, sortBy, filterSource]);

  // Handlers
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
        showToast(json.error || "Pattern detection failed");
      }
    } catch {
      showToast("Pattern detection failed");
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
        showToast("Insight recorded");
        setShowRecord(false);
        fetchInsights();
        fetchStats();
      } else {
        showToast(json.error || "Failed to record insight");
      }
    } catch {
      showToast("Failed to record insight");
    } finally {
      setSaving(false);
    }
  };

  const getAgentName = (agentId: string): string => {
    return agents.find((a) => a.id === agentId)?.name || agentId;
  };

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
            <Lightbulb className="w-5 h-5 text-[#3730a3]" />
            <h1 className="text-xl font-bold text-foreground">Learning Insights</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-8">
            Track how your agents learn and improve over time
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-xs"
            onClick={() => {
              fetchInsights();
              fetchStats();
            }}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
          <Button
            size="sm"
            className="gap-2 text-xs bg-primary hover:bg-primary/90"
            onClick={() => setShowRecord(true)}
          >
            <Plus className="w-3.5 h-3.5" />
            Record Insight
          </Button>
        </div>
      </div>

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
            <span className="text-[10px] font-medium uppercase tracking-wider">Top Agent</span>
          </div>
          <p className="text-lg font-bold text-foreground truncate">
            {stats?.byAgent
              ? getAgentName(
                  Object.entries(stats.byAgent).sort((a, b) => b[1] - a[1])[0]?.[0] || ""
                )
              : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Brain className="w-4 h-4" />
            <span className="text-[10px] font-medium uppercase tracking-wider">Types</span>
          </div>
          <div className="flex items-center gap-1 flex-wrap mt-0.5">
            {stats?.byType
              ? Object.entries(stats.byType)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 3)
                  .map(([type, count]) => (
                    <Badge
                      key={type}
                      variant="outline"
                      className={cn("text-[8px] px-1 py-0 border", TYPE_CONFIG[type as InsightType]?.badgeClass)}
                    >
                      {count}
                    </Badge>
                  ))
              : <span className="text-lg font-bold text-muted-foreground">—</span>}
          </div>
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
                const pct = (count / total) * 100;
                const colorMap: Record<InsightType, string> = {
                  preference: "bg-blue-500",
                  correction: "bg-rose-500",
                  pattern: "bg-purple-500",
                  skill_gain: "bg-emerald-500",
                  workflow: "bg-amber-500",
                };
                return (
                  <motion.div
                    key={type}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className={cn("h-full rounded-full", colorMap[type])}
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
                  <span className={cn("w-2 h-2 rounded-full", {
                    preference: "bg-blue-500",
                    correction: "bg-rose-500",
                    pattern: "bg-purple-500",
                    skill_gain: "bg-emerald-500",
                    workflow: "bg-amber-500",
                  }[type])} />
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
            >
              All
            </button>
            {agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => setFilterAgent(agent.id)}
                className={cn(
                  "px-2.5 py-1 text-[10px] rounded-md transition-colors whitespace-nowrap",
                  filterAgent === agent.id ? "bg-card text-foreground shadow-sm font-medium" : "text-muted-foreground"
                )}
              >
                {agent.name}
              </button>
            ))}
          </div>
        </div>

        {/* Type filter */}
        <div className="flex items-center gap-3 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Type:</span>
          <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
            <button
              onClick={() => setFilterType("all")}
              className={cn(
                "px-2.5 py-1 text-[10px] rounded-md transition-colors whitespace-nowrap",
                filterType === "all" ? "bg-card text-foreground shadow-sm font-medium" : "text-muted-foreground"
              )}
            >
              All
            </button>
            {(Object.entries(TYPE_CONFIG) as [InsightType, typeof TYPE_CONFIG[InsightType]][]).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => setFilterType(key)}
                className={cn(
                  "px-2.5 py-1 text-[10px] rounded-md transition-colors whitespace-nowrap flex items-center gap-1",
                  filterType === key ? "bg-card text-foreground shadow-sm font-medium" : "text-muted-foreground"
                )}
              >
                {cfg.icon}
                {cfg.label}
              </button>
            ))}
          </div>
        </div>

        {/* Source filter + Sort */}
        <div className="flex items-center gap-3 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Source:</span>
          <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
            <button
              onClick={() => setFilterSource("all")}
              className={cn(
                "px-2.5 py-1 text-[10px] rounded-md transition-colors whitespace-nowrap",
                filterSource === "all" ? "bg-card text-foreground shadow-sm font-medium" : "text-muted-foreground"
              )}
            >
              All
            </button>
            {(Object.entries(SOURCE_CONFIG) as [InsightSource, { label: string }][]).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => setFilterSource(key)}
                className={cn(
                  "px-2.5 py-1 text-[10px] rounded-md transition-colors whitespace-nowrap",
                  filterSource === key ? "bg-card text-foreground shadow-sm font-medium" : "text-muted-foreground"
                )}
              >
                {cfg.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
            <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
              {([
                { key: "recent" as SortKey, label: "Recent" },
                { key: "confidence" as SortKey, label: "Confidence" },
                { key: "applied" as SortKey, label: "Applied" },
              ]).map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSortBy(s.key)}
                  className={cn(
                    "px-2.5 py-1 text-[10px] rounded-md transition-colors whitespace-nowrap",
                    sortBy === s.key ? "bg-card text-foreground shadow-sm font-medium" : "text-muted-foreground"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Detect Patterns */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
          <select
            value={detectAgent}
            onChange={(e) => setDetectAgent(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-card text-xs appearance-none focus:outline-none focus:border-ring/40 pr-8"
          >
            <option value="all">All Agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-xs"
          onClick={handleDetectPatterns}
          disabled={detecting}
        >
          {detecting ? (
            <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" />
          )}
          Detect Patterns
        </Button>
      </div>

      {/* Record Insight Slide Panel */}
      <AnimatePresence>
        {showRecord && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/30"
              onClick={() => setShowRecord(false)}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed top-0 right-0 z-50 h-full w-full max-w-md bg-card shadow-xl overflow-y-auto"
            >
              <RecordInsightForm
                agents={agents}
                saving={saving}
                onSave={handleRecordInsight}
                onCancel={() => setShowRecord(false)}
              />
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
              <Button
                size="sm"
                className="gap-2 text-xs bg-primary hover:bg-primary/90"
                onClick={() => setShowRecord(true)}
              >
                <Plus className="w-3.5 h-3.5" />
                Record Insight
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-xs"
                onClick={handleDetectPatterns}
                disabled={detecting}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Detect Patterns
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sortedInsights.map((insight) => (
            <motion.div
              key={insight.id}
              variants={itemVariants}
              initial="hidden"
              animate="show"
              layout
            >
              <Card
                className="border border-border bg-card rounded-xl overflow-hidden cursor-pointer hover:border-primary/20 hover:shadow-sm transition-all"
                onClick={() => setExpandedId(expandedId === insight.id ? null : insight.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Type badge */}
                    <div
                      className={cn(
                        "w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 mt-0.5",
                        TYPE_CONFIG[insight.insight_type]?.badgeClass
                      )}
                    >
                      {TYPE_CONFIG[insight.insight_type]?.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[9px] px-1.5 py-0 border",
                            TYPE_CONFIG[insight.insight_type]?.badgeClass
                          )}
                        >
                          {TYPE_CONFIG[insight.insight_type]?.label}
                        </Badge>
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                          {SOURCE_CONFIG[insight.source]?.label}
                        </Badge>
                        <span className="flex items-center gap-1 text-[10px] text-[#3730a3] font-medium bg-primary/8 px-1.5 py-0.5 rounded">
                          {getAgentName(insight.agent_id)}
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
                            className={cn(
                              "h-full rounded-full",
                              insight.confidence >= 0.8
                                ? "bg-emerald-500"
                                : insight.confidence >= 0.5
                                  ? "bg-amber-500"
                                  : "bg-red-400"
                            )}
                          />
                        </div>
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {Math.round(insight.confidence * 100)}%
                        </span>
                      </div>

                      {/* Meta */}
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span>Applied {insight.application_count}x</span>
                        <span>{formatDate(insight.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Expanded content */}
                  <AnimatePresence>
                    {expandedId === insight.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 pt-3 border-t border-border">
                          <div className="bg-secondary rounded-lg p-3">
                            <p className="text-xs text-foreground leading-relaxed">{insight.content}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-3 mt-3">
                            <div>
                              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                                Last Applied
                              </span>
                              <p className="text-xs text-foreground mt-0.5">
                                {insight.last_applied_at
                                  ? new Date(insight.last_applied_at).toLocaleString()
                                  : "Never"}
                              </p>
                            </div>
                            <div>
                              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                                Updated
                              </span>
                              <p className="text-xs text-foreground mt-0.5">
                                {new Date(insight.updated_at).toLocaleString()}
                              </p>
                            </div>
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
    onSave({
      agentId,
      insightType,
      content: content.trim(),
      source,
      confidence,
    });
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-foreground">Record Insight</h2>
        <button
          onClick={onCancel}
          className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
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
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm appearance-none focus:outline-none focus:border-ring/40"
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
                  insightType === key
                    ? cn(cfg.badgeClass, "border-current shadow-sm")
                    : "border-border text-muted-foreground hover:border-primary/30"
                )}
              >
                {cfg.icon}
                {cfg.label}
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
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as InsightSource)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm appearance-none focus:outline-none focus:border-ring/40"
            >
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
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={confidence}
            onChange={(e) => setConfidence(parseFloat(e.target.value))}
            className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-[#3730a3]"
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-muted-foreground">Low (0%)</span>
            <span className="text-[10px] text-muted-foreground">High (100%)</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
          <Button variant="ghost" size="sm" className="text-xs" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="text-xs gap-1.5 bg-primary hover:bg-primary/90"
            onClick={handleSubmit}
            disabled={!agentId || !content.trim() || saving}
          >
            {saving ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <CheckCircle className="w-3.5 h-3.5" />
            )}
            Record Insight
          </Button>
        </div>
      </div>
    </div>
  );
}
