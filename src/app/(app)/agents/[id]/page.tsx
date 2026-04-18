"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Wrench,
  MessageSquare,
  Activity,
  Zap,
  Settings,
  Cpu,
  Shield,
  BookOpen,
  Bot,
  Clock,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getAllAgents, type AgentConfig } from "@/lib/agents";

// ---------------------------------------------------------------------------
// Color map
// ---------------------------------------------------------------------------

const colorMap: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600", border: "border-emerald-500/30", badge: "bg-emerald-500/20 text-emerald-600" },
  blue: { bg: "bg-blue-500/10", text: "text-blue-600", border: "border-blue-500/30", badge: "bg-blue-500/20 text-blue-600" },
  purple: { bg: "bg-purple-500/10", text: "text-purple-600", border: "border-purple-500/30", badge: "bg-purple-500/20 text-purple-600" },
  amber: { bg: "bg-amber-500/10", text: "text-amber-600", border: "border-amber-500/30", badge: "bg-amber-500/20 text-amber-600" },
  rose: { bg: "bg-rose-500/10", text: "text-rose-600", border: "border-rose-500/30", badge: "bg-rose-500/20 text-rose-600" },
  teal: { bg: "bg-teal-500/10", text: "text-teal-600", border: "border-teal-500/30", badge: "bg-teal-500/20 text-teal-600" },
  orange: { bg: "bg-orange-500/10", text: "text-orange-600", border: "border-orange-500/30", badge: "bg-orange-500/20 text-orange-600" },
};

// ---------------------------------------------------------------------------
// Tool category helpers
// ---------------------------------------------------------------------------

const TOOL_CATEGORIES: Record<string, { label: string; icon: string }> = {
  gmail: { label: "Gmail", icon: "📧" },
  calendar: { label: "Calendar", icon: "📅" },
  drive: { label: "Drive", icon: "📁" },
  sheets: { label: "Sheets", icon: "📊" },
  docs: { label: "Docs", icon: "📄" },
  github: { label: "GitHub", icon: "🐙" },
  vercel: { label: "Vercel", icon: "🚀" },
  web: { label: "Web", icon: "🌐" },
  vision: { label: "Vision", icon: "👁" },
  image: { label: "Image Gen", icon: "🎨" },
  tts: { label: "TTS", icon: "🔊" },
  asr: { label: "ASR", icon: "🎙" },
  code: { label: "Code", icon: "💻" },
  weather: { label: "Weather", icon: "🌤" },
  data: { label: "Data", icon: "📈" },
  design: { label: "Design", icon: "🎨" },
  research: { label: "Research", icon: "🔍" },
  ops: { label: "Ops", icon: "⚡" },
  pdf: { label: "PDF", icon: "📑" },
  docx: { label: "DOCX", icon: "📝" },
  reminder: { label: "Reminders", icon: "⏰" },
  todo: { label: "Todos", icon: "✅" },
  contact: { label: "Contacts", icon: "👤" },
};

function getToolCategory(tool: string): string {
  const prefix = tool.split("_")[0];
  return TOOL_CATEGORIES[prefix]?.label ?? prefix;
}

function getToolIcon(tool: string): string {
  const prefix = tool.split("_")[0];
  return TOOL_CATEGORIES[prefix]?.icon ?? "🔧";
}

function categorizeTools(tools: string[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const tool of tools) {
    const cat = getToolCategory(tool);
    if (!map[cat]) map[cat] = [];
    map[cat].push(tool);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

// ---------------------------------------------------------------------------
// Status info (from localStorage tracking)
// ---------------------------------------------------------------------------

interface AgentStats {
  tasksCompleted: number;
  messagesProcessed: number;
}

// ---------------------------------------------------------------------------
// Agent Detail Page
// ---------------------------------------------------------------------------

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [agent, setAgent] = useState<AgentConfig | null>(null);
  const [stats, setStats] = useState<AgentStats>({ tasksCompleted: 0, messagesProcessed: 0 });
  const [loading, setLoading] = useState(true);

  // Load agent config
  useEffect(() => {
    const found = getAllAgents().find((a) => a.id === params.id);
    if (found) {
      setAgent(found);
      // Try to get stats from the agents API
      fetch("/api/agents")
        .then((r) => r.json())
        .then((json) => {
          if (json.success && json.data) {
            const a = json.data.find((d: { id: string }) => d.id === params.id);
            if (a?.status) {
              setStats({
                tasksCompleted: a.status.tasksCompleted || 0,
                messagesProcessed: a.status.messagesProcessed || 0,
              });
            }
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        <div className="text-center py-16">
          <Bot className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-base font-semibold text-foreground mb-1">Agent not found</h3>
          <p className="text-sm text-muted-foreground mb-4">No agent with ID "{params.id}" exists.</p>
          <Link href="/agents">
            <Button variant="outline" className="gap-2"><ArrowLeft className="w-4 h-4" />Back to Agents</Button>
          </Link>
        </div>
      </div>
    );
  }

  const colors = colorMap[agent.color] || colorMap.emerald;
  const categorizedTools = categorizeTools(agent.tools);
  const totalTools = agent.tools.length;
  const categories = Object.keys(categorizedTools).sort();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8"
    >
      {/* Back button */}
      <Link href="/agents" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to Agents
      </Link>

      {/* Agent Header */}
      <motion.div variants={itemVariants} initial="hidden" animate="show">
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className={cn("w-16 h-16 rounded-xl flex items-center justify-center", colors.bg)}>
                <span className="text-3xl">{agent.emoji}</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-xl font-bold text-foreground">{agent.name}</h1>
                  <Badge variant="outline" className={cn("text-[10px] font-mono", colors.badge)}>
                    {agent.provider}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{agent.role}</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5 font-mono truncate">{agent.model}</span>
                  <span className="flex items-center gap-1"><Wrench className="w-3 h-3" />{totalTools} tools</span>
                  <span className="flex items-center gap-1"><Activity className="w-3 h-3" />{stats.tasksCompleted} tasks</span>
                  <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{stats.messagesProcessed} msgs</span>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:ml-auto">
                <Link href={`/chat?agent=${agent.id}`}>
                  <Button variant="outline" size="sm" className={cn("gap-2 text-xs", colors.border, colors.text)}>
                    <MessageSquare className="w-3.5 h-3.5" />
                    Chat
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Description */}
      <motion.div variants={itemVariants} initial="hidden" animate="show" transition={{ delay: 0.05 }}>
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-muted-foreground" />
              About
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground leading-relaxed">{agent.description}</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Tool Categories */}
      <motion.div variants={itemVariants} initial="hidden" animate="show" transition={{ delay: 0.1 }}>
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <Wrench className="w-4 h-4 text-muted-foreground" />
              Available Tools
            </CardTitle>
            <CardDescription>{totalTools} tools across {categories.length} service categories</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {categories.map((cat) => {
              const tools = categorizedTools[cat];
              return (
                <div key={cat}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{getToolIcon(tools[0])}</span>
                      <h4 className="text-sm font-semibold text-foreground">{cat}</h4>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">{tools.length}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {tools.map((tool) => (
                      <span
                        key={tool}
                        className="inline-flex items-center px-2 py-1 rounded-md bg-[#f5f3ef] border border-[#e8e5df] text-[11px] font-mono text-muted-foreground hover:border-[#3730a3]/30 transition-colors cursor-default"
                        title={tool}
                      >
                        {tool.replace(`${cat.toLowerCase()}_`, "")}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </motion.div>

      {/* System Prompt (read-only preview) */}
      <motion.div variants={itemVariants} initial="hidden" animate="show" transition={{ delay: 0.15 }}>
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <Cpu className="w-4 h-4 text-muted-foreground" />
              System Prompt
            </CardTitle>
            <CardDescription>Agent identity and behavioral instructions (read-only)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <Textarea
                readOnly
                value={agent.systemPrompt}
                rows={12}
                className="w-full resize-none rounded-lg border border-[#e8e5df] bg-[#faf9f7] px-3 py-2 text-xs font-mono text-foreground leading-relaxed custom-scrollbar focus:outline-none"
              />
              <div className="absolute top-3 right-3">
                <Badge variant="secondary" className="text-[9px] gap-1">
                  <Shield className="w-3 h-3" />
                  Read Only
                </Badge>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              To modify the system prompt, edit the agent configuration in <code className="text-[10px] bg-[#f0ede8] px-1 py-0.5 rounded">src/lib/agents.ts</code>
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Suggested Actions */}
      <motion.div variants={itemVariants} initial="hidden" animate="show" transition={{ delay: 0.2 }}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <Zap className="w-4 h-4 text-muted-foreground" />
              Suggested Actions
            </CardTitle>
            <CardDescription>Quick prompts tailored for this agent&apos;s capabilities</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {agent.suggestedActions.map((action) => (
                <button
                  key={action.label}
                  onClick={() => {
                    localStorage.setItem("claw-selected-agent", agent.id);
                    router.push("/chat?agent=" + agent.id);
                  }}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-[#e8e5df] bg-white hover:bg-[#faf9f7] hover:border-[#3730a3]/20 text-left transition-all duration-200 group"
                >
                  <Settings className="w-3.5 h-3.5 text-muted-foreground group-hover:text-[#3730a3] transition-colors" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground truncate">{action.label}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{action.prompt}</p>
                  </div>
                  <Clock className="w-3 h-3 text-[#999999] flex-shrink-0" />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Tech Stack Info */}
      <motion.div variants={itemVariants} initial="hidden" animate="show" transition={{ delay: 0.25 }}>
        <div className="mt-6 flex items-center gap-4 px-4 py-3 rounded-lg bg-[#f5f3ef] border border-[#e8e5df]">
          <Cpu className="w-4 h-4 text-muted-foreground" />
          <div className="text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">{agent.provider}</span> · <span className="font-mono">{agent.model}</span>
            · {agent.id === "general" ? "Key pool: AIHUBMIX (5 keys)" : agent.keyEnvVars ? `Key: ${agent.keyEnvVars[0]}` : "Key pool: Ollama"}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
