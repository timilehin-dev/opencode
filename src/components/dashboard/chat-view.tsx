"use client";

import { useState, useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { motion, AnimatePresence } from "framer-motion";
import { SendIcon, Loader2, WrenchIcon, SparklesIcon, ChevronDown, ChevronUp } from "@/components/icons";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Minimal agent data (fetched from API on mount)
// ---------------------------------------------------------------------------

interface AgentInfo {
  id: string;
  name: string;
  role: string;
  emoji: string;
  color: string;
  provider: string;
  model: string;
}

const DEFAULT_AGENT: AgentInfo = {
  id: "general",
  name: "Claw General",
  role: "Chief AI Orchestrator & General Manager",
  emoji: "\uD83E\uDDD4",
  color: "emerald",
  provider: "aihubmix",
  model: "coding-glm-5-turbo-free",
};

const SUGGESTED_ACTIONS: Record<string, { label: string; prompt: string }[]> = {
  general: [
    { label: "Check my inbox", prompt: "Show me my latest unread emails" },
    { label: "GitHub status", prompt: "Give me a status update on my GitHub repo" },
    { label: "Upcoming events", prompt: "What's on my calendar this week?" },
    { label: "Drive files", prompt: "Show me my recent Google Drive files" },
  ],
  mail: [
    { label: "Check inbox", prompt: "Show me my latest unread emails" },
    { label: "Compose email", prompt: "Help me draft a professional email" },
    { label: "Search emails", prompt: "Search my emails from the last week" },
    { label: "My schedule", prompt: "What events do I have coming up?" },
  ],
  code: [
    { label: "Open issues", prompt: "List all open GitHub issues" },
    { label: "PR status", prompt: "Show me the latest pull requests" },
    { label: "Recent commits", prompt: "What are the recent commits?" },
    { label: "Deployments", prompt: "Check my latest Vercel deployments" },
  ],
  data: [
    { label: "My files", prompt: "Show me all my Google Drive files and folders" },
    { label: "Read sheet", prompt: "Show me what spreadsheets I have" },
    { label: "My docs", prompt: "List all my Google Documents" },
    { label: "Create folder", prompt: "Create a new folder in my Drive" },
  ],
  creative: [
    { label: "Draft document", prompt: "Help me draft a new document" },
    { label: "Content plan", prompt: "Create a content calendar for this month" },
    { label: "My docs", prompt: "Show me my Google Documents" },
    { label: "Brainstorm", prompt: "Help me brainstorm ideas for a project" },
  ],
};

const DEFAULT_SUGGESTED = SUGGESTED_ACTIONS.general;

// ---------------------------------------------------------------------------
// Color map for agent themes
// ---------------------------------------------------------------------------

const colorMap: Record<string, { bg: string; text: string; border: string; badge: string; dot: string }> = {
  emerald: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    border: "border-emerald-500/30",
    badge: "bg-emerald-500/20 text-emerald-400",
    dot: "bg-emerald-400",
  },
  blue: {
    bg: "bg-blue-500/10",
    text: "text-blue-400",
    border: "border-blue-500/30",
    badge: "bg-blue-500/20 text-blue-400",
    dot: "bg-blue-400",
  },
  purple: {
    bg: "bg-purple-500/10",
    text: "text-purple-400",
    border: "border-purple-500/30",
    badge: "bg-purple-500/20 text-purple-400",
    dot: "bg-purple-400",
  },
  amber: {
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    border: "border-amber-500/30",
    badge: "bg-amber-500/20 text-amber-400",
    dot: "bg-amber-400",
  },
  rose: {
    bg: "bg-rose-500/10",
    text: "text-rose-400",
    border: "border-rose-500/30",
    badge: "bg-rose-500/20 text-rose-400",
    dot: "bg-rose-400",
  },
};

// ---------------------------------------------------------------------------
// Tool Call Card Component
// ---------------------------------------------------------------------------

function ToolCallCard({
  toolName,
  result,
}: {
  toolName: string;
  result: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const isSuccess = !result.includes('"success":false') && !result.includes('"success": false');
  const toolLabel = toolName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className={cn("rounded-lg border mt-2 overflow-hidden", isSuccess ? "border-border" : "border-red-500/30")}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors hover:bg-accent/50"
      >
        <WrenchIcon className="w-3 h-3 text-muted-foreground flex-shrink-0" />
        <span className="text-muted-foreground">{toolLabel}</span>
        <Badge
          variant={isSuccess ? "success" : "destructive"}
          className="text-[10px] px-1.5 py-0 ml-auto"
        >
          {isSuccess ? "OK" : "Error"}
        </Badge>
        {expanded ? (
          <ChevronUp className="w-3 h-3 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        )}
      </button>
      {expanded && (
        <div className="px-3 pb-2 max-h-48 overflow-y-auto custom-scrollbar">
          <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap break-all font-mono">
            {result.slice(0, 500)}
            {result.length > 500 && "..."}
          </pre>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Extract text from message parts
// ---------------------------------------------------------------------------

function getMessageText(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text!)
    .join("");
}

// ---------------------------------------------------------------------------
// AgentChatSession — ISOLATED useChat session per agent
// ---------------------------------------------------------------------------
//
// CRITICAL FIX: This component is rendered with `key={agentId}` in the parent.
// When the user switches agents, React COMPLETELY UNMOUNTS the old session
// and MOUNTS A FRESH ONE. This guarantees:
//   1. A brand-new DefaultChatTransport with the correct agentId in body
//   2. A fresh useChat hook with no residual state from the previous agent
//   3. No identity bleed — the API always receives the correct agentId
//
// Previous approach (useMemo transport + setMessages([])) failed because
// useChat stores the transport in a ref on first render and ignores prop
// changes, so it kept sending agentId="general" even after switching.
// ---------------------------------------------------------------------------

function AgentChatSession({
  agentId,
  agentInfo,
}: {
  agentId: string;
  agentInfo: AgentInfo;
}) {
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const colors = colorMap[agentInfo.color] || colorMap.emerald;

  // Each mount creates a fresh transport locked to this specific agent.
  // This is the definitive fix for the identity bleed bug.
  const transport = new DefaultChatTransport({
    api: "/api/chat",
    body: { agentId },
  });

  const { messages, sendMessage, status, error } = useChat({
    transport,
    onError: (err) => console.error(`[Chat ${agentId}] Error:`, err),
  });

  const isLoading = status === "submitted" || status === "streaming";

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle send
  const handleSend = () => {
    if (!inputText.trim() || isLoading) return;
    sendMessage({ text: inputText });
    setInputText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    const textarea = e.target;
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
  };

  // Filter visible messages (exclude system)
  const visibleMessages = messages.filter((m) => m.role !== "system");

  // Expose sendMessage for suggested actions from parent (via ref callback or direct prop)
  // We handle it internally since suggested actions are part of this session.

  return (
    <>
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4">
        {visibleMessages.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center h-full max-w-lg mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
            >
              <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center mb-4", colors.bg)}>
                <span className="text-3xl">{agentInfo.emoji}</span>
              </div>
              <h2 className="text-xl font-bold text-foreground mb-1">
                Chat with {agentInfo.name}
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                {agentInfo.role}. Connected to your services and ready to help.
              </p>
            </motion.div>

            <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
              {(SUGGESTED_ACTIONS[agentId] || DEFAULT_SUGGESTED).map((action, i) => (
                <motion.button
                  key={action.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.05, duration: 0.3 }}
                  onClick={() => sendMessage({ text: action.prompt })}
                  className={cn(
                    "flex items-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium transition-all duration-200",
                    "border-border bg-card hover:border-primary/30 hover:bg-accent text-left"
                  )}
                >
                  <SparklesIcon className={cn("w-4 h-4 flex-shrink-0", colors.text)} />
                  <span className="text-foreground text-xs">{action.label}</span>
                </motion.button>
              ))}
            </div>
          </div>
        ) : (
          /* Messages List */
          <div className="space-y-4 max-w-3xl mx-auto">
            {visibleMessages.map((message) => {
              const isUser = message.role === "user";
              const textContent = getMessageText(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (message.parts as any[]) || [],
              );

              // Extract tool invocations from parts.
              // AI SDK v6 tool parts:
              //   Static tools: type = "tool-{toolName}" (e.g. "tool-gmail_fetch")
              //   Dynamic tools: type = "dynamic-tool"
              //   States: input-streaming | input-available | output-available
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const toolParts = ((message.parts || []) as any[]).filter(
                (p: any) =>
                  (p.type && p.type.startsWith("tool-")) ||
                  p.type === "dynamic-tool",
              );

              if (!textContent && toolParts.length === 0) return null;

              return (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}
                >
                  {/* Agent Avatar */}
                  {!isUser && (
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", colors.bg)}>
                      <span className="text-sm">{agentInfo.emoji}</span>
                    </div>
                  )}

                  {/* Message Content */}
                  <div className={cn("max-w-[80%] min-w-0", isUser ? "order-1" : "")}>
                    {textContent && (
                      <div
                        className={cn(
                          "px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words",
                          isUser
                            ? "bg-primary text-primary-foreground rounded-br-md whitespace-pre-wrap"
                            : "bg-card border border-border rounded-bl-md text-foreground"
                        )}
                      >
                        {isUser ? (
                          textContent
                        ) : (
                          <MarkdownRenderer content={textContent} />
                        )}
                      </div>
                    )}

                    {/* Tool Call Results */}
                    {toolParts.length > 0 && !isUser && (
                      <div className="mt-1 space-y-1">
                        {toolParts.map((tool: Record<string, unknown>, idx: number) => {
                          const toolType = tool.type as string;
                          // Extract tool name: "tool-gmail_fetch" → "gmail_fetch", "dynamic-tool" → tool.toolName
                          const toolName = toolType === "dynamic-tool"
                            ? (tool.toolName as string) || "unknown"
                            : toolType.replace(/^tool-/, "");
                          // AI SDK v6 states: input-streaming, input-available, output-available
                          const state = tool.state as string;
                          const hasOutput = state === "output-available" && tool.output != null;
                          const resultStr = hasOutput
                            ? typeof tool.output === "string"
                              ? tool.output
                              : JSON.stringify(tool.output)
                            : "";

                          if (hasOutput) {
                            return (
                              <ToolCallCard
                                key={`${message.id}-tool-${idx}`}
                                toolName={toolName}
                                result={resultStr}
                              />
                            );
                          }

                          // Show loading spinner while tool is executing
                          return (
                            <div
                              key={`${message.id}-tool-${idx}`}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-accent/30"
                            >
                              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                              <span className="text-[11px] text-muted-foreground">
                                {toolName.replace(/_/g, " ")}...
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* User Avatar */}
                  {isUser && (
                    <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0 order-2">
                      <span className="text-xs font-bold text-primary-foreground">You</span>
                    </div>
                  )}
                </motion.div>
              );
            })}

            {/* Loading indicator */}
            {isLoading && visibleMessages.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 text-muted-foreground text-xs"
              >
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Generating response...</span>
              </motion.div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                <span>Error: {error.message}</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-border/50 px-4 py-3 flex-shrink-0 bg-background">
        <div className="max-w-3xl mx-auto flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${agentInfo.name}...`}
              rows={1}
              className={cn(
                "w-full resize-none rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground",
                "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30",
                "transition-all duration-200"
              )}
              style={{ minHeight: "44px", maxHeight: "120px" }}
            />
          </div>
          <Button
            type="button"
            onClick={handleSend}
            disabled={!inputText.trim() || isLoading}
            className={cn(
              "rounded-xl h-11 w-11 p-0 flex items-center justify-center flex-shrink-0 transition-all duration-200",
              colors.bg,
              colors.text
            )}
            size="icon"
            variant="ghost"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <SendIcon className="w-5 h-5" />
            )}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground/50 text-center mt-2">
          AI responses may be inaccurate. Tools provide real data from connected services.
        </p>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Chat View Component (parent — handles agent selection, header, layout)
// ---------------------------------------------------------------------------

export function ChatView() {
  const [agents, setAgents] = useState<AgentInfo[]>([DEFAULT_AGENT]);
  const [selectedAgent, setSelectedAgent] = useState("general");
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Fetch agents on mount
  useEffect(() => {
    async function fetchAgents() {
      try {
        const res = await fetch("/api/agents");
        const json = await res.json();
        if (json.success && json.data) {
          const agentList: AgentInfo[] = json.data.map((a: Record<string, unknown>) => ({
            id: a.id as string,
            name: a.name as string,
            role: a.role as string,
            emoji: a.emoji as string,
            color: a.color as string,
            provider: a.provider as string,
            model: a.model as string,
          }));
          setAgents(agentList);
        }
      } catch {
        /* use defaults */
      }
    }

    // Check localStorage for pre-selected agent
    const stored = localStorage.getItem("claw-selected-agent");
    if (stored) {
      setSelectedAgent(stored);
      localStorage.removeItem("claw-selected-agent");
    }

    fetchAgents();
  }, []);

  // Close agent picker on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowAgentPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const activeAgent = agents.find((a) => a.id === selectedAgent) || DEFAULT_AGENT;
  const colors = colorMap[activeAgent.color] || colorMap.emerald;

  // Handle agent change — just update state, the `key` prop on AgentChatSession
  // handles the complete session reset (unmount old, mount fresh).
  const handleAgentChange = (agentId: string) => {
    setSelectedAgent(agentId);
    setShowAgentPicker(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] lg:h-[calc(100vh-3rem)]">
      {/* Header with Agent Selector */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 flex-shrink-0">
        <div className="relative" ref={pickerRef}>
          <button
            onClick={() => setShowAgentPicker(!showAgentPicker)}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all duration-200 hover:border-primary/30",
              "border-border bg-card"
            )}
          >
            <span className="text-xl">{activeAgent.emoji}</span>
            <div className="text-left">
              <p className="text-sm font-semibold text-foreground">{activeAgent.name}</p>
              <p className="text-[11px] text-muted-foreground">{activeAgent.role}</p>
            </div>
            <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", showAgentPicker && "rotate-180")} />
          </button>

          {/* Agent Dropdown */}
          <AnimatePresence>
            {showAgentPicker && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full left-0 mt-1 w-64 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden"
              >
                <div className="py-1">
                  {agents.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => handleAgentChange(agent.id)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-accent",
                        agent.id === selectedAgent && "bg-accent"
                      )}
                    >
                      <span className="text-lg">{agent.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{agent.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{agent.role}</p>
                      </div>
                      {agent.id === selectedAgent && (
                        <div className={cn("w-2 h-2 rounded-full", colorMap[agent.color]?.dot || "bg-emerald-400")} />
                      )}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] gap-1">
            <span className={cn("w-1.5 h-1.5 rounded-full", colors.dot)} />
            {activeAgent.model}
          </Badge>
        </div>
      </div>

      {/* ================================================================ */}
      {/* KEY FIX: `key={selectedAgent}` forces React to completely        */}
      {/* unmount and remount the chat session when the agent changes.     */}
      {/* This guarantees a fresh useChat hook with the correct agentId.   */}
      {/* ================================================================ */}
      <AgentChatSession
        key={selectedAgent}
        agentId={selectedAgent}
        agentInfo={activeAgent}
      />
    </div>
  );
}
