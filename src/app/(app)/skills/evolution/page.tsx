"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp,
  BarChart3,
  Award,
  Target,
  CheckCircle2,
  Clock,
  ThumbsUp,
  ThumbsDown,
  Lightbulb,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  RefreshCw,
  AlertCircle,
  Sparkles,
  RotateCcw,
  Eye,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PerformanceSummary {
  total_executions: number;
  total_evaluations: number;
  avg_performance_score: number;
  success_rate: number;
  skills_evolved: number;
  period: string;
}

interface EvaluationTrend {
  date: string;
  eval_count: number;
  avg_score: number;
  avg_relevance: number;
  avg_accuracy: number;
  avg_completeness: number;
  avg_clarity: number;
  avg_efficiency: number;
}

interface TopSkill {
  id: string;
  display_name: string;
  name: string;
  category: string;
  difficulty: string;
  performance_score: number;
  total_uses: number;
  avg_rating: number;
  eval_count: number;
}

interface RecentEvaluation {
  id: string;
  skill_id: string;
  agent_id: string;
  overall_score: number;
  strengths: string;
  weaknesses: string;
  created_at: string;
  skill_name: string;
}

interface EvolutionEvent {
  id: string;
  skill_id: string;
  change_type: string;
  change_summary: string;
  triggered_by: string;
  created_at: string;
  skill_name: string;
}

interface EvolutionData {
  period: string;
  performance_summary: PerformanceSummary;
  evaluation_trends: EvaluationTrend[];
  top_skills: TopSkill[];
  recent_evaluations: RecentEvaluation[];
  evolution_timeline: EvolutionEvent[];
}

interface PendingSkill {
  id: string;
  name: string;
  display_name: string;
  category: string;
  performance_score: number;
  version: number;
  eval_count: number;
  avg_score: number;
}

// ---------------------------------------------------------------------------
// Framer Motion variants
// ---------------------------------------------------------------------------

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
} as const;

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
} as const;

const scaleIn = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1 },
} as const;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  research: { bg: "bg-purple-500/10", text: "text-purple-500" },
  code: { bg: "bg-emerald-500/10", text: "text-emerald-500" },
  communication: { bg: "bg-blue-500/10", text: "text-blue-500" },
  data: { bg: "bg-amber-500/10", text: "text-amber-500" },
  planning: { bg: "bg-indigo-500/10", text: "text-indigo-500" },
  ops: { bg: "bg-red-500/10", text: "text-red-500" },
  content: { bg: "bg-pink-500/10", text: "text-pink-500" },
  general: { bg: "bg-gray-500/10", text: "text-gray-500" },
};

// ---------------------------------------------------------------------------
// Helper Components
// ---------------------------------------------------------------------------

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  trend,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  trend?: "up" | "down" | "neutral";
  color: string;
}) {
  return (
    <motion.div variants={scaleIn} transition={{ duration: 0.3 }}>
      <Card className="border-border hover:shadow-md transition-shadow">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground font-medium">{label}</p>
              <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
              {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
            </div>
            <div className={cn("p-2.5 rounded-xl", color)}>
              <Icon className="w-5 h-5 text-foreground" />
            </div>
          </div>
          {trend && (
            <div className="flex items-center gap-1 mt-3">
              {trend === "up" && <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />}
              {trend === "down" && <ArrowDownRight className="w-3.5 h-3.5 text-red-500" />}
              <span className={cn(
                "text-xs font-medium",
                trend === "up" ? "text-emerald-500" : trend === "down" ? "text-red-500" : "text-muted-foreground",
              )}>
                {trend === "up" ? "Improving" : trend === "down" ? "Declining" : "Stable"}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function ScoreBar({ value, max = 100, height = "h-6" }: { value: number; max?: number; height?: string }) {
  const pct = Math.min((value / max) * 100, 100);
  const color =
    pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : pct >= 40 ? "bg-orange-500" : "bg-red-500";

  return (
    <div className={cn("w-full bg-muted rounded-md overflow-hidden", height)}>
      <motion.div
        className={cn(height, color, "rounded-md")}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80 ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
    : score >= 60 ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
    : score >= 40 ? "bg-orange-500/10 text-orange-600 border-orange-500/20"
    : "bg-red-500/10 text-red-600 border-red-500/20";

  return (
    <Badge variant="outline" className={cn("font-semibold tabular-nums", color)}>
      {score}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function SkillEvolutionPage() {
  const [data, setData] = useState<EvolutionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState("30d");
  const [pendingSkills, setPendingSkills] = useState<PendingSkill[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [evolvingSkillId, setEvolvingSkillId] = useState<string | null>(null);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const [reflecting, setReflecting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"success" | "error">("success");

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "";

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToastMessage(message);
    setToastType(type);
    setTimeout(() => setToastMessage(null), 4000);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${baseUrl}/api/skills/evolution?period=${period}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        setError(json.error || "Failed to load evolution data");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [period, baseUrl]);

  const fetchPending = useCallback(async () => {
    setLoadingPending(true);
    try {
      const res = await fetch(`${baseUrl}/api/skills/evolve/pending`);
      const json = await res.json();
      if (json.success) {
        setPendingSkills(json.data.pending_skills || []);
      }
    } catch {
      // Non-critical
    } finally {
      setLoadingPending(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    fetchData();
    fetchPending();
  }, [fetchData, fetchPending]);

  const handleEvolve = useCallback(async (skillId: string) => {
    setEvolvingSkillId(skillId);
    try {
      const res = await fetch(`${baseUrl}/api/skills/evolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill_id: skillId, agent_id: "dashboard" }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(`Skill evolved to version ${json.data.new_version}`);
        fetchData();
        fetchPending();
      } else {
        showToast(json.error || "Evolution failed", "error");
      }
    } catch {
      showToast("Network error during evolution", "error");
    } finally {
      setEvolvingSkillId(null);
    }
  }, [baseUrl, fetchData, fetchPending, showToast]);

  const handleRollback = useCallback(async (skillId: string, evolutionId: string) => {
    setRollingBackId(evolutionId);
    try {
      const res = await fetch(`${baseUrl}/api/skills/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill_id: skillId, evolution_id: evolutionId }),
      });
      const json = await res.json();
      if (json.success) {
        showToast("Skill rolled back successfully");
        fetchData();
      } else {
        showToast(json.error || "Rollback failed", "error");
      }
    } catch {
      showToast("Network error during rollback", "error");
    } finally {
      setRollingBackId(null);
    }
  }, [baseUrl, fetchData, showToast]);

  const handleReflection = useCallback(async () => {
    setReflecting(true);
    try {
      const res = await fetch(`${baseUrl}/api/skills/reflection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (json.success) {
        const { summary, evolution_candidates } = json.data;
        const candidates = (evolution_candidates || []).length;
        showToast(`Reflection complete: ${summary?.needs_evolution || 0} skills need evolution, ${candidates} candidates found`);
      } else {
        showToast(json.error || "Reflection failed", "error");
      }
    } catch {
      showToast("Network error during reflection", "error");
    } finally {
      setReflecting(false);
    }
  }, [baseUrl, showToast]);

  const summary = data?.performance_summary;
  const trends = data?.evaluation_trends || [];
  const topSkills = data?.top_skills || [];
  const recentEvals = data?.recent_evaluations || [];
  const timeline = data?.evolution_timeline || [];

  // Determine overall trend
  const overallTrend: "up" | "down" | "neutral" =
    trends.length >= 2
      ? trends[0].avg_score > trends[trends.length - 1].avg_score ? "up"
        : trends[0].avg_score < trends[trends.length - 1].avg_score ? "down" : "neutral"
      : "neutral";

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={{ duration: 0.4 }}
          className="mb-8"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-500/10">
                  <TrendingUp className="w-6 h-6 text-emerald-500" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-foreground">Skill Evolution</h1>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Monitor skill performance, evaluation trends, and evolution over time
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(["7d", "30d", "90d"] as const).map((p) => (
                <Button
                  key={p}
                  variant={period === p ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPeriod(p)}
                  className={cn(
                    period === p && "bg-foreground text-background hover:bg-foreground/90",
                  )}
                >
                  {p === "7d" ? "7 Days" : p === "30d" ? "30 Days" : "90 Days"}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={handleReflection}
                disabled={reflecting}
                className="gap-1.5"
              >
                {reflecting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
                Run Reflection
              </Button>
              <Button variant="ghost" size="icon" onClick={fetchData} disabled={loading}>
                <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Toast notification */}
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "mb-6 p-3 rounded-lg border text-sm flex items-center gap-2",
              toastType === "error"
                ? "border-red-500/30 bg-red-500/5 text-red-600"
                : "border-emerald-500/30 bg-emerald-500/5 text-emerald-600"
            )}
          >
            {toastType === "error" ? (
              <AlertCircle className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            {toastMessage}
          </motion.div>
        )}

        {error && (
          <motion.div variants={fadeInUp} initial="hidden" animate="visible" className="mb-6">
            <Card className="border-red-500/30 bg-red-500/5">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                <p className="text-sm text-red-600">{error}</p>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {loading && !data ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-5">
                    <Skeleton className="h-4 w-24 mb-2" />
                    <Skeleton className="h-8 w-16 mb-1" />
                    <Skeleton className="h-3 w-32" />
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card>
              <CardContent className="p-6">
                <Skeleton className="h-4 w-40 mb-4" />
                <Skeleton className="h-48 w-full" />
              </CardContent>
            </Card>
          </div>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="space-y-6"
          >
            {/* Pending Evolution Card */}
            {pendingSkills.length > 0 && (
              <motion.div variants={fadeInUp} transition={{ duration: 0.4 }}>
                <Card className="border-amber-500/30 bg-amber-500/5">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="p-2 rounded-xl bg-amber-500/10">
                        <Sparkles className="w-5 h-5 text-amber-500" />
                      </div>
                      <div className="flex-1">
                        <h2 className="text-base font-semibold text-foreground">Pending Evolution</h2>
                        <p className="text-xs text-muted-foreground">
                          {pendingSkills.length} skill{pendingSkills.length > 1 ? "s" : ""} below threshold and ready for improvement
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                      {pendingSkills.map((skill) => (
                        <div key={skill.id} className="flex items-center justify-between p-2.5 rounded-lg bg-background/50 border border-border/50">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{skill.display_name}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{skill.eval_count} evals</span>
                              <span>&middot;</span>
                              <span>avg score {skill.avg_score.toFixed(1)}</span>
                              <span>&middot;</span>
                              <span>v{skill.version}</span>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleEvolve(skill.id)}
                            disabled={evolvingSkillId === skill.id}
                            className="ml-2 gap-1.5 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border border-amber-500/20"
                          >
                            {evolvingSkillId === skill.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5" />
                            )}
                            Evolve
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Summary Cards */}
            {summary && (
              <motion.div variants={staggerContainer} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <SummaryCard
                  icon={Award}
                  label="Total Evaluations"
                  value={summary.total_evaluations}
                  sub={`in ${summary.period}`}
                  trend={overallTrend}
                  color="bg-blue-500/10"
                />
                <SummaryCard
                  icon={BarChart3}
                  label="Avg Performance"
                  value={summary.avg_performance_score.toFixed(1)}
                  sub="across all skills"
                  trend={overallTrend}
                  color="bg-emerald-500/10"
                />
                <SummaryCard
                  icon={Activity}
                  label="Skills Evolved"
                  value={summary.skills_evolved}
                  sub="improvement events"
                  color="bg-purple-500/10"
                />
                <SummaryCard
                  icon={CheckCircle2}
                  label="Success Rate"
                  value={`${summary.success_rate}%`}
                  sub={`${summary.total_executions} executions`}
                  trend={summary.success_rate >= 70 ? "up" : summary.success_rate >= 50 ? "neutral" : "down"}
                  color="bg-amber-500/10"
                />
              </motion.div>
            )}

            {/* Performance Trends Chart */}
            <motion.div variants={fadeInUp} transition={{ duration: 0.4 }}>
              <Card className="border-border">
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <BarChart3 className="w-5 h-5 text-muted-foreground" />
                    <h2 className="text-lg font-semibold text-foreground">Performance Trends</h2>
                    <Badge variant="outline" className="ml-auto text-xs">
                      Last {trends.length} days with data
                    </Badge>
                  </div>

                  {trends.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <BarChart3 className="w-10 h-10 mb-3 opacity-40" />
                      <p className="text-sm">No evaluation data available for this period</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar pr-2">
                      {trends.slice().reverse().map((trend) => (
                        <div key={trend.date} className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-20 shrink-0 tabular-nums">
                            {new Date(trend.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                          <div className="flex-1">
                            <ScoreBar value={trend.avg_score} />
                          </div>
                          <span className="text-sm font-semibold text-foreground w-10 text-right tabular-nums">
                            {trend.avg_score}
                          </span>
                          <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">
                            ({trend.eval_count})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Two-column layout: Top Skills + Recent Evaluations */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Skills Table */}
              <motion.div variants={fadeInUp} transition={{ duration: 0.4 }}>
                <Card className="border-border h-full">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <Target className="w-5 h-5 text-muted-foreground" />
                      <h2 className="text-lg font-semibold text-foreground">Top Skills by Performance</h2>
                    </div>

                    {topSkills.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <Target className="w-10 h-10 mb-3 opacity-40" />
                        <p className="text-sm">No skills with evaluation data</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left py-2 px-2 text-muted-foreground font-medium">Skill</th>
                              <th className="text-left py-2 px-2 text-muted-foreground font-medium hidden sm:table-cell">Category</th>
                              <th className="text-center py-2 px-2 text-muted-foreground font-medium">Evals</th>
                              <th className="text-center py-2 px-2 text-muted-foreground font-medium">Score</th>
                              <th className="text-center py-2 px-2 text-muted-foreground font-medium">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {topSkills.slice(0, 5).map((skill, idx) => {
                              const catColor = CATEGORY_COLORS[skill.category] || CATEGORY_COLORS.general;
                              return (
                                <tr key={skill.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                                  <td className="py-2.5 px-2">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-muted-foreground font-medium w-4">#{idx + 1}</span>
                                      <div>
                                        <p className="font-medium text-foreground text-sm">{skill.display_name}</p>
                                        <p className="text-xs text-muted-foreground">{skill.total_uses} uses</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-2 hidden sm:table-cell">
                                    <Badge variant="outline" className={cn("text-xs", catColor.bg, catColor.text)}>
                                      {skill.category}
                                    </Badge>
                                  </td>
                                  <td className="py-2.5 px-2 text-center text-muted-foreground tabular-nums">
                                    {skill.eval_count}
                                  </td>
                                  <td className="py-2.5 px-2 text-center">
                                    <ScoreBadge score={Math.round(skill.performance_score)} />
                                  </td>
                                  <td className="py-2.5 px-2 text-center">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleEvolve(skill.id)}
                                      disabled={evolvingSkillId === skill.id}
                                      className="h-7 gap-1 text-xs"
                                    >
                                      {evolvingSkillId === skill.id ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <Sparkles className="w-3 h-3" />
                                      )}
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>

              {/* Recent Evaluations */}
              <motion.div variants={fadeInUp} transition={{ duration: 0.4 }}>
                <Card className="border-border h-full">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <Activity className="w-5 h-5 text-muted-foreground" />
                      <h2 className="text-lg font-semibold text-foreground">Recent Evaluations</h2>
                    </div>

                    {recentEvals.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <Activity className="w-10 h-10 mb-3 opacity-40" />
                        <p className="text-sm">No evaluations recorded yet</p>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar pr-1">
                        {recentEvals.map((ev) => {
                          let strengths: string[] = [];
                          let weaknesses: string[] = [];
                          try {
                            strengths = typeof ev.strengths === "string" ? JSON.parse(ev.strengths) : [];
                          } catch { /* ignore */ }
                          try {
                            weaknesses = typeof ev.weaknesses === "string" ? JSON.parse(ev.weaknesses) : [];
                          } catch { /* ignore */ }

                          return (
                            <div
                              key={ev.id}
                              className="p-3 rounded-lg border border-border/50 hover:border-border transition-colors"
                            >
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="font-medium text-sm text-foreground">{ev.skill_name}</span>
                                <ScoreBadge score={ev.overall_score} />
                              </div>
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs text-muted-foreground">{ev.agent_id}</span>
                                <span className="text-xs text-muted-foreground">&middot;</span>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(ev.created_at).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </div>
                              {strengths.length > 0 && (
                                <div className="flex items-start gap-1 mb-1">
                                  <ThumbsUp className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
                                  <span className="text-xs text-muted-foreground line-clamp-1">
                                    {strengths.slice(0, 2).join(", ")}
                                  </span>
                                </div>
                              )}
                              {weaknesses.length > 0 && (
                                <div className="flex items-start gap-1">
                                  <ThumbsDown className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />
                                  <span className="text-xs text-muted-foreground line-clamp-1">
                                    {weaknesses.slice(0, 2).join(", ")}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* Evolution Timeline */}
            <motion.div variants={fadeInUp} transition={{ duration: 0.4 }}>
              <Card className="border-border">
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Lightbulb className="w-5 h-5 text-muted-foreground" />
                    <h2 className="text-lg font-semibold text-foreground">Evolution Timeline</h2>
                    <Badge variant="outline" className="ml-auto text-xs">
                      {timeline.length} events
                    </Badge>
                  </div>

                  {timeline.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <Lightbulb className="w-10 h-10 mb-3 opacity-40" />
                      <p className="text-sm">No evolution events recorded yet</p>
                      <p className="text-xs mt-1">Skill evolution events appear when evaluations identify improvement areas</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar pr-1">
                      {timeline.map((ev) => {
                        const isRevertable = ev.change_type === "auto_improvement" && ev.id;
                        const changeTypeColor =
                          ev.change_type === "evaluation_insight"
                            ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                            : ev.change_type === "auto_improvement"
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                              : ev.change_type === "reverted"
                                ? "bg-red-500/10 text-red-600 border-red-500/20"
                                : "bg-blue-500/10 text-blue-600 border-blue-500/20";

                        return (
                          <div
                            key={ev.id}
                            className="flex gap-3 p-3 rounded-lg border border-border/50 hover:border-border transition-colors"
                          >
                            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="font-medium text-sm text-foreground">{ev.skill_name}</span>
                                <Badge variant="outline" className={cn("text-xs", changeTypeColor)}>
                                  {ev.change_type.replace(/_/g, " ")}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-2">{ev.change_summary}</p>
                              <div className="flex items-center justify-between mt-1.5">
                                <p className="text-xs text-muted-foreground">
                                  {new Date(ev.created_at).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                  {" "}&middot; triggered by {ev.triggered_by}
                                </p>
                                {isRevertable && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleRollback(ev.skill_id, ev.id)}
                                    disabled={rollingBackId === ev.id}
                                    className="h-6 gap-1 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                  >
                                    {rollingBackId === ev.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <RotateCcw className="w-3 h-3" />
                                    )}
                                    Rollback
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
