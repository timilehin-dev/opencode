"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  RefreshCw,
  RotateCcw,
  CheckCircle,
  XCircle,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EvolutionRecord {
  id: string;
  skill_id: string;
  skill_name?: string;
  agent_id: string;
  previous_version: number;
  new_version?: number;
  previous_prompt?: string;
  new_prompt?: string;
  trigger_summary: string;
  evaluations_context: unknown;
  status: string;
  improvement_summary?: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  pending: { label: "Pending", color: "bg-gray-100 text-gray-700", icon: Clock },
  completed: { label: "Completed", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle },
  failed: { label: "Failed", color: "bg-red-100 text-red-700", icon: XCircle },
  rolled_back: { label: "Rolled Back", color: "bg-amber-100 text-amber-700", icon: RotateCcw },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SkillEvolutionPage() {
  const [evolutions, setEvolutions] = useState<EvolutionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [evolving, setEvolving] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const fetchEvolutions = useCallback(async () => {
    try {
      const res = await fetch("/api/skills/evolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list" }),
      });
      const json = await res.json();
      // If the evolve endpoint doesn't support list, try direct DB query
      if (json.success && json.data?.length > 0) {
        setEvolutions(json.data);
      } else {
        // Fallback: fetch all skills and their evolution history via skills list
        const skillsRes = await fetch("/api/skills?limit=100");
        const skillsJson = await skillsRes.json();
        if (skillsJson.success) {
          // We'll show skills as potential evolution candidates instead
          setEvolutions([]);
        }
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchEvolutions().finally(() => setLoading(false));
  }, [fetchEvolutions]);

  // Fetch evolution records directly
  const fetchEvolutionHistory = useCallback(async () => {
    try {
      // Use a simpler approach - get skills that could be evolved
      const res = await fetch("/api/skills?limit=100");
      const json = await res.json();
      if (json.success) {
        const skills = json.data || [];
        // Show skills as evolution candidates
        setEvolutions(
          skills.map((s: { id: string; name: string; display_name: string | null; version: number; performance_score: number | null; total_uses: number | null; avg_rating: number | null; created_at: string; updated_at: string; category: string }) => ({
            id: s.id,
            skill_id: s.id,
            skill_name: s.display_name || s.name,
            agent_id: "system",
            previous_version: s.version,
            trigger_summary: `Skill candidate for evolution — score: ${s.performance_score || 0}, uses: ${s.total_uses || 0}`,
            evaluations_context: [],
            status: "pending",
            created_at: s.updated_at || s.created_at,
            updated_at: s.updated_at || s.created_at,
          }))
        );
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchEvolutionHistory().finally(() => setLoading(false));
  }, [fetchEvolutionHistory]);

  const handleEvolve = async (skillId: string) => {
    setEvolving(skillId);
    try {
      const res = await fetch("/api/skills/evolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill_id: skillId, agent_id: "system" }),
      });
      const json = await res.json();
      if (json.success) {
        showToast("Evolution initiated");
        fetchEvolutionHistory();
      } else {
        showToast(json.error || "Evolution failed");
      }
    } catch {
      showToast("Failed to evolve");
    } finally {
      setEvolving(null);
    }
  };

  // Stats
  const stats = useMemo(() => {
    const completed = evolutions.filter((e) => e.status === "completed").length;
    const pending = evolutions.filter((e) => e.status === "pending").length;
    const failed = evolutions.filter((e) => e.status === "failed").length;
    return { total: evolutions.length, completed, pending, failed };
  }, [evolutions]);

  const filteredEvolutions = useMemo(() => {
    if (filterStatus === "all") return evolutions;
    return evolutions.filter((e) => e.status === filterStatus);
  }, [evolutions, filterStatus]);

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
            <TrendingUp className="w-5 h-5 text-[#3730a3]" />
            <h1 className="text-xl font-bold text-foreground">Skill Evolution</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-8">
            Track and trigger skill improvements based on performance feedback
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={() => { fetchEvolutionHistory(); fetchEvolutions(); }}>
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total", value: stats.total, icon: Sparkles, color: "text-[#3730a3]" },
          { label: "Pending", value: stats.pending, icon: Clock, color: "text-amber-600" },
          { label: "Completed", value: stats.completed, icon: CheckCircle, color: "text-emerald-600" },
          { label: "Failed", value: stats.failed, icon: XCircle, color: "text-red-600" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <stat.icon className="w-4 h-4" />
              <span className="text-[10px] font-medium uppercase tracking-wider">{stat.label}</span>
            </div>
            <p className={cn("text-lg font-bold", stat.color)}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5 mb-6 w-fit">
        {["all", "pending", "completed", "failed"].map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={cn(
              "px-3 py-1.5 text-[10px] rounded-md transition-colors font-medium capitalize",
              filterStatus === status
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {status}
          </button>
        ))}
      </div>

      {/* Evolution List */}
      {filteredEvolutions.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
              <TrendingUp className="w-7 h-7 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-1">No evolution records</h3>
            <p className="text-sm text-muted-foreground">
              Skills can be evolved when they have enough evaluation feedback.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredEvolutions.map((evo) => {
            const statusCfg = STATUS_CONFIG[evo.status] || STATUS_CONFIG.pending;
            const StatusIcon = statusCfg.icon;
            return (
              <motion.div
                key={evo.id}
                variants={itemVariants}
                initial="hidden"
                animate="show"
                layout
              >
                <Card className="border border-border bg-card rounded-xl overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-semibold text-foreground truncate">
                            {evo.skill_name || evo.skill_id}
                          </h3>
                          <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 border", statusCfg.color)}>
                            <StatusIcon className="w-2.5 h-2.5 mr-0.5" />
                            {statusCfg.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1">{evo.trigger_summary}</p>
                        <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                          <span>v{evo.previous_version}</span>
                          <span className="flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {new Date(evo.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 text-xs gap-1"
                        disabled={evolving === evo.skill_id}
                        onClick={() => handleEvolve(evo.skill_id)}
                      >
                        {evolving === evo.skill_id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <ArrowUpRight className="w-3 h-3" />
                        )}
                        Evolve
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
