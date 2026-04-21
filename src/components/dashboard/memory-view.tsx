"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  Plus,
  TrashIcon,
  X,
  MessageSquare,
  Clock,
  Bot,
  Tag,
  Star,
  AlertCircle,
  CheckCheck as CheckCircle,
} from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/helpers";
import type { PageKey } from "@/components/dashboard/sidebar";

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

interface ConversationItem {
  id: string;
  sessionId: string;
  agentId: string;
  role: string;
  content: string;
  createdAt: string;
}

interface BackendStatus {
  status: string;
  supabase: string;
  timestamp: string;
}

const KNOWN_AGENTS = [
  { id: "general", name: "Claw General" },
  { id: "mail", name: "Mail Agent" },
  { id: "code", name: "Code Agent" },
  { id: "data", name: "Data Agent" },
  { id: "creative", name: "Creative Agent" },
];

const CATEGORY_STYLES: Record<string, string> = {
  general: "bg-slate-500/20 text-foreground border-slate-500/30",
  preference: "bg-blue-500/20 text-blue-600 border-blue-500/30",
  context: "bg-purple-500/20 text-purple-600 border-purple-500/30",
  instruction: "bg-amber-500/20 text-amber-600 border-amber-500/30",
};

const CATEGORY_LABELS: Record<string, string> = {
  general: "General",
  preference: "Preference",
  context: "Context",
  instruction: "Instruction",
};

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface MemoryViewProps {
  onNavigate?: (key: PageKey) => void;
}

export function MemoryView({ onNavigate: _onNavigate }: MemoryViewProps) {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [backendStatus, setBackendStatus] = useState<BackendStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState("general");
  const [activeTab, setActiveTab] = useState<"memories" | "history" | "status">("memories");
  const [panelOpen, setPanelOpen] = useState(false);
  const [formContent, setFormContent] = useState("");
  const [formCategory, setFormCategory] = useState("general");
  const [formImportance, setFormImportance] = useState(5);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Fetch data
  // ---------------------------------------------------------------------------

  const fetchMemories = useCallback(async () => {
    try {
      const res = await fetch(`/api/memory?agentId=${selectedAgent}`);
      const json = await res.json();
      if (json.success) setMemories(json.data || []);
    } catch {
      /* silent */
    }
  }, [selectedAgent]);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/memory?type=conversations&limit=30");
      const json = await res.json();
      if (json.success) setConversations(json.data || []);
    } catch {
      /* silent */
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      const json = await res.json();
      if (json.success) setBackendStatus(json.data);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchMemories(), fetchConversations(), fetchStatus()]);
      setLoading(false);
    };
    init();
  }, [fetchMemories, fetchConversations, fetchStatus]);

  // Refetch when agent changes
  useEffect(() => {
    if (activeTab === "memories") fetchMemories();
  }, [selectedAgent, activeTab, fetchMemories]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleAddMemory = async () => {
    if (!formContent.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: selectedAgent,
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
      }
    } catch {
      /* silent */
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/memory?id=${id}`, { method: "DELETE" });
      setDeleteConfirm(null);
      await fetchMemories();
    } catch {
      /* silent */
    }
  };

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

  const agentName = KNOWN_AGENTS.find((a) => a.id === selectedAgent)?.name || selectedAgent;
  const isSupabaseConnected = backendStatus?.supabase === "connected";

  return (
    <motion.div
      key="memory"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Brain className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-xl font-bold text-foreground">Memory</h2>
            {isSupabaseConnected && (
              <Badge variant="success" className="text-[10px] gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Cloud Sync
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground ml-8">
            Persistent context that agents remember across sessions
          </p>
        </div>
        <Button onClick={() => setPanelOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Memory
        </Button>
      </div>

      {/* Agent selector */}
      <div className="flex items-center gap-2 mb-6">
        <span className="text-xs text-muted-foreground">Agent:</span>
        <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-0.5">
          {KNOWN_AGENTS.map((agent) => (
            <button
              key={agent.id}
              onClick={() => setSelectedAgent(agent.id)}
              className={cn(
                "px-3 py-1.5 text-xs rounded-md transition-colors",
                selectedAgent === agent.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {agent.name}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 bg-card border border-border rounded-lg p-0.5 w-fit">
        {(["memories", "history", "status"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 text-sm rounded-md transition-colors font-medium",
              activeTab === tab
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab === "memories" && "Agent Memories"}
            {tab === "history" && "Conversation History"}
            {tab === "status" && "Backend Status"}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === "memories" && (
        <motion.div variants={containerVariants} initial="hidden" animate="show">
          {memories.length === 0 ? (
            <Card>
              <CardContent className="py-16">
                <div className="text-center">
                  <div className="w-14 h-14 rounded-full bg-accent/50 flex items-center justify-center mx-auto mb-4">
                    <Brain className="w-7 h-7 text-muted-foreground" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground mb-1">No memories for {agentName}</h3>
                  <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
                    Add memories to give this agent persistent context. Memories are injected into the agent&apos;s system prompt so it remembers important information across conversations.
                  </p>
                  <Button variant="outline" onClick={() => setPanelOpen(true)} className="gap-2">
                    <Plus className="w-4 h-4" />
                    Add First Memory
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {memories.map((mem) => (
                <motion.div key={mem.id} variants={itemVariants}>
                  <Card className="hover:border-primary/20 transition-all duration-300">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge
                              variant="outline"
                              className={cn("text-[10px]", CATEGORY_STYLES[mem.category] || CATEGORY_STYLES.general)}
                            >
                              {CATEGORY_LABELS[mem.category] || mem.category}
                            </Badge>
                            <div className="flex items-center gap-0.5">
                              {Array.from({ length: 10 }, (_, i) => (
                                <Star
                                  key={i}
                                  className={cn(
                                    "w-3 h-3",
                                    i < mem.importance ? "text-amber-600 fill-amber-400" : "text-muted-foreground/30"
                                  )}
                                />
                              ))}
                            </div>
                          </div>
                          <p className="text-sm text-foreground leading-relaxed">{mem.content}</p>
                          <p className="text-[10px] text-muted-foreground mt-2">{timeAgo(mem.createdAt)}</p>
                        </div>
                        <div className="flex-shrink-0">
                          {deleteConfirm === mem.id ? (
                            <div className="flex items-center gap-1">
                              <Button variant="destructive" size="sm" onClick={() => handleDelete(mem.id)} className="text-[10px] h-7 px-2">
                                Confirm
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(null)} className="text-[10px] h-7 px-2">
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ) : (
                            <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(mem.id)} className="text-xs text-muted-foreground hover:text-red-400">
                              <TrashIcon className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {activeTab === "history" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-muted-foreground" />
                Recent Conversations
              </CardTitle>
            </CardHeader>
            <CardContent>
              {conversations.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No conversation history yet. Start chatting with your agents!
                </div>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto custom-scrollbar">
                  {conversations.map((conv, i) => {
                    const agentLabel = KNOWN_AGENTS.find((a) => a.id === conv.agentId)?.name || conv.agentId;
                    return (
                      <div
                        key={`${conv.id || i}`}
                        className={cn(
                          "flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-colors",
                          conv.role === "user"
                            ? "bg-primary/5 border-primary/10"
                            : "bg-card border-border/30"
                        )}
                      >
                        <div className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-xs",
                          conv.role === "user"
                            ? "bg-primary text-primary-foreground font-bold"
                            : "bg-accent text-muted-foreground"
                        )}>
                          {conv.role === "user" ? "U" : <Bot className="w-3.5 h-3.5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[10px] font-medium text-muted-foreground">
                              {conv.role === "user" ? "You" : agentLabel}
                            </span>
                            <span className="text-[10px] text-muted-foreground/50">{timeAgo(conv.createdAt)}</span>
                          </div>
                          <p className="text-xs text-foreground line-clamp-2 leading-relaxed">
                            {conv.content}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {activeTab === "status" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
          <div className="grid grid-cols-1 gap-4 max-w-lg">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center",
                    isSupabaseConnected ? "bg-emerald-500/10" : "bg-amber-500/10"
                  )}>
                    {isSupabaseConnected
                      ? <CheckCircle className="w-5 h-5 text-emerald-600" />
                      : <AlertCircle className="w-5 h-5 text-amber-600" />}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Supabase</h3>
                    <p className="text-xs text-muted-foreground">
                      {isSupabaseConnected ? "Connected — cloud sync active" : "Not configured — using localStorage"}
                    </p>
                  </div>
                </div>
                {!isSupabaseConnected && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-300 leading-relaxed">
                    <strong>How to enable cloud sync:</strong>
                    <ol className="mt-1.5 ml-3 list-decimal space-y-1">
                      <li>Create a Supabase project at <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-200">supabase.com</a></li>
                      <li>Run the SQL schema from <code className="bg-amber-500/20 px-1 rounded">src/lib/supabase.ts</code> in the SQL Editor</li>
                      <li>Add <code className="bg-amber-500/20 px-1 rounded">NEXT_PUBLIC_SUPABASE_URL</code> and <code className="bg-amber-500/20 px-1 rounded">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to your Vercel env vars</li>
                      <li>Redeploy — data will sync automatically</li>
                    </ol>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3">Storage Info</h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Agent Memories</span>
                    <span className="text-foreground font-medium">{memories.length} items</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Conversation History</span>
                    <span className="text-foreground font-medium">{conversations.length} messages</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Storage Mode</span>
                    <span className={cn("font-medium", isSupabaseConnected ? "text-emerald-600" : "text-amber-600")}>
                      {isSupabaseConnected ? "Cloud + Local" : "Local Only"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>
      )}

      {/* ---------------------------------------------------------------------------
          Add Memory Panel
          --------------------------------------------------------------------------- */}
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
              <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
                <h2 className="text-base font-semibold text-foreground">Add Memory for {agentName}</h2>
                <button onClick={() => setPanelOpen(false)} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 custom-scrollbar">
                {/* Content */}
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5">
                    Memory Content <span className="text-red-400">*</span>
                  </label>
                  <Textarea
                    value={formContent}
                    onChange={(e) => setFormContent(e.target.value)}
                    placeholder="e.g., User prefers dark mode, works with TypeScript, uses VS Code..."
                    rows={4}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    This will be injected into the agent&apos;s system prompt as persistent context.
                  </p>
                </div>

                {/* Category */}
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5">Category</label>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setFormCategory(key)}
                        className={cn(
                          "text-xs px-3 py-1.5 rounded-lg border transition-colors",
                          formCategory === key
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/30"
                        )}
                      >
                        <Tag className="w-3 h-3 inline mr-1" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Importance */}
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5">
                    Importance: {formImportance}/10
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={formImportance}
                      onChange={(e) => setFormImportance(parseInt(e.target.value, 10))}
                      className="flex-1 accent-primary"
                    />
                    <span className="text-sm font-mono text-foreground w-6 text-right">{formImportance}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Higher importance = shown first in the agent&apos;s memory context.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border/50">
                <Button variant="outline" onClick={() => setPanelOpen(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={handleAddMemory} disabled={!formContent.trim() || saving} className="gap-2">
                  {saving ? (
                    <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
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
