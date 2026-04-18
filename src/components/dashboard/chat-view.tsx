"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { motion, AnimatePresence } from "framer-motion";
import {
  SendIcon,
  Loader2,
  WrenchIcon,
  SparklesIcon,
  ChevronDown,
  ChevronUp,
  PlusIcon,
  HistoryIcon,
  XIcon,
  MessageSquareIcon,
  PaperclipIcon,
  FileDownIcon,
  DriveIcon,
  SearchIcon,
  UploadIcon,
} from "@/components/icons";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { trackChatMessage, trackToolCall, trackAgentSwitch } from "@/lib/analytics-store";
import { getSessionMessages, getAgentSessions, getAllRecentSessions, saveMessage, purgeAllConversations } from "@/lib/memory";

// ---------------------------------------------------------------------------
// Chat History Version — bump this to trigger a fresh purge on next visit
// ---------------------------------------------------------------------------
const CHAT_HISTORY_VERSION = 2;
const CHAT_VERSION_KEY = "claw-chat-history-version";

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

const colorMap: Record<string, { bg: string; text: string; border: string; badge: string; dot: string; leftBorder: string }> = {
  emerald: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    border: "border-emerald-500/30",
    badge: "bg-emerald-500/20 text-emerald-400",
    dot: "bg-emerald-400",
    leftBorder: "border-l-emerald-500",
  },
  blue: {
    bg: "bg-blue-500/10",
    text: "text-blue-400",
    border: "border-blue-500/30",
    badge: "bg-blue-500/20 text-blue-400",
    dot: "bg-blue-400",
    leftBorder: "border-l-blue-500",
  },
  purple: {
    bg: "bg-purple-500/10",
    text: "text-purple-400",
    border: "border-purple-500/30",
    badge: "bg-purple-500/20 text-purple-400",
    dot: "bg-purple-400",
    leftBorder: "border-l-purple-500",
  },
  amber: {
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    border: "border-amber-500/30",
    badge: "bg-amber-500/20 text-amber-400",
    dot: "bg-amber-400",
    leftBorder: "border-l-amber-500",
  },
  rose: {
    bg: "bg-rose-500/10",
    text: "text-rose-400",
    border: "border-rose-500/30",
    badge: "bg-rose-500/20 text-rose-400",
    dot: "bg-rose-400",
    leftBorder: "border-l-rose-500",
  },
  teal: {
    bg: "bg-teal-500/10",
    text: "text-teal-400",
    border: "border-teal-500/30",
    badge: "bg-teal-500/20 text-teal-400",
    dot: "bg-teal-400",
    leftBorder: "border-l-teal-500",
  },
  orange: {
    bg: "bg-orange-500/10",
    text: "text-orange-400",
    border: "border-orange-500/30",
    badge: "bg-orange-500/20 text-orange-400",
    dot: "bg-orange-400",
    leftBorder: "border-l-orange-500",
  },
};

// Agent metadata for display in conversation list
const agentMeta: Record<string, { emoji: string; name: string; color: string }> = {
  general: { emoji: "\uD83E\uDDD4", name: "Claw General", color: "emerald" },
  mail: { emoji: "\u2709\uFE0F", name: "Mail Agent", color: "blue" },
  code: { emoji: "\uD83D\uDCBB", name: "Code Agent", color: "purple" },
  data: { emoji: "\uD83D\uDCCA", name: "Data Agent", color: "amber" },
  creative: { emoji: "\uD83E\uDDE0", name: "Creative Agent", color: "rose" },
  research: { emoji: "\uD83D\uDD0D", name: "Research Agent", color: "teal" },
  ops: { emoji: "\u26A1", name: "Ops Agent", color: "orange" },
};

// ---------------------------------------------------------------------------
// localStorage helpers for session tracking
// ---------------------------------------------------------------------------

const SESSION_MAP_KEY = "claw-agent-sessions";
const LAST_AGENT_KEY = "claw-last-active-agent";

function loadSessionMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(SESSION_MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSessionMap(map: Record<string, string>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SESSION_MAP_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function getLastActiveAgent(): string {
  if (typeof window === "undefined") return "general";
  try {
    return localStorage.getItem(LAST_AGENT_KEY) || "general";
  } catch {
    return "general";
  }
}

function saveLastActiveAgent(agentId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAST_AGENT_KEY, agentId);
  } catch {
    /* ignore */
  }
}

function generateSessionId(): string {
  return `session-${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Tool Call Card Component — redesigned as sleek pill-style indicator
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
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-200 cursor-pointer",
          isSuccess
            ? "bg-secondary text-muted-foreground hover:bg-accent border border-border"
            : "bg-red-500/10 text-red-400 hover:bg-red-500/15 border border-red-500/20"
        )}
      >
        <WrenchIcon className="w-3 h-3 flex-shrink-0 opacity-60" />
        <span className="max-w-[180px] truncate">{toolLabel}</span>
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full flex-shrink-0",
            isSuccess ? "bg-emerald-400" : "bg-red-400"
          )}
        />
        {expanded ? (
          <ChevronUp className="w-2.5 h-2.5 opacity-50" />
        ) : (
          <ChevronDown className="w-2.5 h-2.5 opacity-50" />
        )}
      </button>
      {expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="mt-1.5 max-h-48 overflow-y-auto custom-scrollbar"
        >
          <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap break-all font-mono bg-secondary rounded-lg px-3 py-2 border border-border">
            {result.slice(0, 500)}
            {result.length > 500 && "..."}
          </pre>
        </motion.div>
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
// Conversation Session Item
// ---------------------------------------------------------------------------

interface SessionItem {
  sessionId: string;
  agentId: string;
  lastMessage: string;
  lastActivity: string;
  messageCount: number;
}

function ConversationsPanel({
  agents,
  currentSessionId,
  currentAgentId,
  onSelectSession,
  onClose,
}: {
  agents: AgentInfo[];
  currentSessionId: string;
  currentAgentId: string;
  onSelectSession: (sessionId: string, agentId: string) => void;
  onClose: () => void;
}) {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getAllRecentSessions(30)
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [currentSessionId]);

  const formatTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    } catch {
      return "";
    }
  };

  const getAgentInfo = (agentId: string) => {
    const fromList = agents.find((a) => a.id === agentId);
    if (fromList) return fromList;
    const meta = agentMeta[agentId];
    if (meta) {
      return { id: agentId, name: meta.name, role: "", emoji: meta.emoji, color: meta.color, provider: "", model: "" };
    }
    return { id: agentId, name: agentId, role: "", emoji: "\uD83E\uDD16", color: "emerald", provider: "", model: "" };
  };

  return (
    <div className="absolute inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <HistoryIcon className="w-4 h-4" />
          All Conversations
        </h3>
        <button
          onClick={onClose}
          className="p-1 rounded-md hover:bg-accent transition-colors"
        >
          <XIcon className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <MessageSquareIcon className="w-8 h-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">No conversations yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Start chatting to see your history</p>
          </div>
        ) : (
          <div className="py-2">
            {sessions.map((session) => {
              const agent = getAgentInfo(session.agentId);
              const isActive = session.sessionId === currentSessionId && session.agentId === currentAgentId;
              const colors = colorMap[agent.color] || colorMap.emerald;

              return (
                <button
                  key={session.sessionId}
                  onClick={() => onSelectSession(session.sessionId, session.agentId)}
                  className={cn(
                    "w-full text-left px-4 py-3 transition-colors hover:bg-accent/50 border-b border-border/30",
                    isActive && "bg-accent"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs">{agent.emoji}</span>
                      <span className={cn("text-[11px] font-medium", colors.text)}>{agent.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        {formatTime(session.lastActivity)}
                      </span>
                      <span className="text-[10px] text-muted-foreground/70">
                        {session.messageCount} msgs
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-foreground truncate">
                    {session.lastMessage || "Empty conversation"}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Typing Indicator Component — 3 bouncing dots
// ---------------------------------------------------------------------------

function TypingIndicator({ emoji }: { emoji: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center gap-3 py-2"
    >
      <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center flex-shrink-0">
        <span className="text-xs">{emoji}</span>
      </div>
      <div className="flex items-center gap-1 px-3 py-2 rounded-xl bg-secondary border border-border">
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground bounce-dot-1" />
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground bounce-dot-2" />
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground bounce-dot-3" />
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// AgentChatSession — ISOLATED useChat session per sessionId
// ---------------------------------------------------------------------------

function AgentChatSession({
  agentId,
  agentInfo,
  sessionId,
}: {
  agentId: string;
  agentInfo: AgentInfo;
  sessionId: string;
}) {
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [attachments, setAttachments] = useState<Array<{
    name: string;
    content: string;
    type: string;
    mimeType: string;
  }>>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const [driveSearch, setDriveSearch] = useState("");
  const [driveFiles, setDriveFiles] = useState<Array<{
    id: string;
    name: string;
    mimeType: string;
    size: number | null;
    category: string;
    isGoogleApp: boolean;
    modifiedTime: string | null;
  }>>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const driveSearchTimer = useRef<NodeJS.Timeout | null>(null);

  const colors = colorMap[agentInfo.color] || colorMap.emerald;

  const transport = new DefaultChatTransport({
    api: "/api/chat",
    body: { agentId, sessionId },
  });

  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport,
    onError: (err) => console.error(`[Chat ${agentId}] Error:`, err),
  });

  // Load previous messages on mount and inject them
  useEffect(() => {
    let cancelled = false;
    getSessionMessages(sessionId, agentId).then((msgs) => {
      if (!cancelled && msgs.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const uiMsgs = msgs.map((m: any, i: number) => ({
          id: `hist-${sessionId}-${i}`,
          role: m.role,
          parts: [{ type: 'text' as const, text: m.content }],
          createdAt: new Date().toISOString(),
        }));
        setMessages(uiMsgs);
      }
      setHistoryLoaded(true);
    }).catch(() => {
      setHistoryLoaded(true);
    });
    return () => { cancelled = true; };
  }, [sessionId, agentId, setMessages]);

  const isLoading = status === "submitted" || status === "streaming";

  // Auto-scroll to bottom + track tool calls for analytics
  const prevMessageCountRef = useRef(0);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

    if (messages.length > prevMessageCountRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (let i = prevMessageCountRef.current; i < messages.length; i++) {
        const msg = messages[i];
        if (msg.role === "assistant") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const parts = (msg as any).parts || [];
          for (const part of parts) {
            if ((part.type && part.type.startsWith("tool-")) || part.type === "dynamic-tool") {
              const toolName = part.type === "dynamic-tool"
                ? (part.toolName || "unknown")
                : part.type.replace(/^tool-/, "");
              if (part.state === "output-available") {
                trackToolCall(agentId, agentInfo.name, toolName);
              }
            }
          }
        }
      }
    }
    prevMessageCountRef.current = messages.length;
  }, [messages, agentId, agentInfo.name]);

  // NOTE: Message persistence is handled SERVER-SIDE only (route.ts onFinish callback).
  // This avoids a race condition where the client-side effect fires before the
  // streaming text is fully populated, causing empty assistant messages to be saved.
  // The server-side onFinish has the complete text after streaming completes.

  // --- File Upload Handler ---
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setUploading(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 10 * 1024 * 1024) {
        console.error(`[Upload] File too large: ${file.name}`);
        continue;
      }

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json();
          console.error(`[Upload] Failed: ${err.error}`);
          continue;
        }

        const data = await res.json();
        if (data.success) {
          setAttachments((prev) => [
            ...prev,
            {
              name: data.data.name,
              content: data.data.content,
              type: data.data.type,
              mimeType: data.data.mimeType,
            },
          ]);
        }
      } catch (err) {
        console.error("[Upload] Error:", err);
      }
    }
    setUploading(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  // --- Google Drive Search & File Loading ---
  const loadDriveFiles = useCallback(async (query?: string) => {
    setDriveLoading(true);
    try {
      const url = query
        ? `/api/drive/search?q=${encodeURIComponent(query)}&pageSize=15`
        : `/api/drive/search?pageSize=15`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setDriveFiles(data.data);
        }
      }
    } catch {
      /* ignore */
    }
    setDriveLoading(false);
  }, []);

  const handleDriveSearch = useCallback((query: string) => {
    setDriveSearch(query);
    if (driveSearchTimer.current) clearTimeout(driveSearchTimer.current);
    if (query.length < 1) {
      loadDriveFiles();
      return;
    }
    driveSearchTimer.current = setTimeout(() => {
      loadDriveFiles(query);
    }, 300);
  }, [loadDriveFiles]);

  const handleDriveFileSelect = useCallback(async (file: { id: string; name: string; mimeType: string; isGoogleApp?: boolean }) => {
    setDriveLoading(true);
    try {
      const res = await fetch(`/api/drive/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: file.id,
          fileName: file.name,
          mimeType: file.mimeType,
          isGoogleApp: file.isGoogleApp,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          setAttachments((prev) => [
            ...prev,
            {
              name: file.name,
              content: data.data.isBase64
                ? `[Binary file: ${file.name} (${(data.data.size / 1024).toFixed(1)}KB) — ID: ${file.id}]`
                : data.data.content,
              type: data.data.isBase64 ? "file-ref" : "text",
              mimeType: data.data.mimeType || file.mimeType,
            },
          ]);
        }
      }
    } catch {
      /* ignore */
    }
    setDriveLoading(false);
    setShowDrivePicker(false);
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Handle send
  const handleSend = () => {
    if ((!inputText.trim() && attachments.length === 0) || isLoading) return;

    trackChatMessage(agentId, agentInfo.name, inputText.length);

    let messageText = inputText;
    if (attachments.length > 0) {
      const attText = attachments
        .map((a) => `[Attached file: ${a.name}]\n${a.content}`)
        .join("\n\n---\n\n");
      messageText = attText + "\n\n---\n\n" + messageText;
    }
    sendMessage({ text: messageText });

    setInputText("");
    setAttachments([]);
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

  // Detect file download URLs in tool results
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extractDownloadUrl = (result: string): { url: string; filename: string } | null => {
    try {
      const data = JSON.parse(result);
      if (data.success && data.data?.downloadUrl) {
        return {
          url: data.data.downloadUrl,
          filename: data.data.filename || data.data.title || "Download",
        };
      }
    } catch {
      /* not JSON */
    }
    const match = result.match(/(\/api\/files\/[a-zA-Z0-9._-]+\.(?:pdf|docx|txt|csv))["'\s]/);
    if (match) {
      const filename = match[1].split("/").pop() || "Download";
      return { url: match[1], filename };
    }
    return null;
  };

  const visibleMessages = messages.filter((m) => m.role !== "system");

  return (
    <>
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 lg:px-6 py-4">
        {visibleMessages.length === 0 ? (
          /* Empty State — redesigned with larger visual cards */
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-md">
              {(SUGGESTED_ACTIONS[agentId] || DEFAULT_SUGGESTED).map((action, i) => (
                <motion.button
                  key={action.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.05, duration: 0.3 }}
                  onClick={() => sendMessage({ text: action.prompt })}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3.5 rounded-xl border text-sm font-medium transition-all duration-200 text-left cursor-pointer",
                    "bg-secondary border-border hover:bg-accent hover:border-border",
                    "border-l-[3px]", colors.leftBorder
                  )}
                >
                  <SparklesIcon className={cn("w-4 h-4 flex-shrink-0", colors.text)} />
                  <span className="text-foreground text-xs">{action.label}</span>
                </motion.button>
              ))}
            </div>
          </div>
        ) : (
          /* Messages List — Agent Workspace style */
          <div className="space-y-5 max-w-3xl mx-auto">
            {visibleMessages.map((message) => {
              const isUser = message.role === "user";
              const textContent = getMessageText(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (message.parts as any[]) || [],
              );

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const toolParts = ((message.parts || []) as any[]).filter(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
                  className={cn(
                    "flex gap-3",
                    isUser ? "justify-end" : "justify-start"
                  )}
                >
                  {/* Agent Avatar — small circle with emoji */}
                  {!isUser && (
                    <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs">{agentInfo.emoji}</span>
                    </div>
                  )}

                  {/* Message Content */}
                  <div className={cn("min-w-0 max-w-[85%] lg:max-w-[75%]", isUser ? "order-1" : "")}>
                    {/* Agent name label */}
                    {!isUser && (
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className={cn("text-[11px] font-semibold", colors.text)}>{agentInfo.name}</span>
                      </div>
                    )}

                    {textContent && (
                      <div
                        className={cn(
                          "text-sm leading-relaxed break-words",
                          isUser
                            ? "bg-secondary border-l-[3px] border-l-primary rounded-r-xl rounded-tr-sm px-4 py-3 text-foreground"
                            : "bg-card border border-border rounded-xl px-4 py-3 text-foreground"
                        )}
                      >
                        {isUser ? (
                          <span className="whitespace-pre-wrap font-normal">{textContent}</span>
                        ) : (
                          <MarkdownRenderer content={textContent} />
                        )}
                      </div>
                    )}

                    {/* Tool Call Results — pill-style inline indicators */}
                    {toolParts.length > 0 && !isUser && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {toolParts.map((tool: Record<string, unknown>, idx: number) => {
                          const toolType = tool.type as string;
                          const toolName = toolType === "dynamic-tool"
                            ? (tool.toolName as string) || "unknown"
                            : toolType.replace(/^tool-/, "");
                          const state = tool.state as string;
                          const hasOutput = state === "output-available" && tool.output != null;
                          const resultStr = hasOutput
                            ? typeof tool.output === "string"
                              ? tool.output
                              : JSON.stringify(tool.output)
                            : "";

                          const downloadInfo = hasOutput ? extractDownloadUrl(resultStr) : null;

                          if (hasOutput) {
                            return (
                              <div key={`${message.id}-tool-${idx}`} className="flex flex-col">
                                <ToolCallCard
                                  key={`${message.id}-tool-card-${idx}`}
                                  toolName={toolName}
                                  result={resultStr}
                                />
                                {downloadInfo && (
                                  <motion.a
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    href={downloadInfo.url}
                                    download={downloadInfo.filename}
                                    className={cn(
                                      "flex items-center gap-2 mt-1.5 px-3 py-2 rounded-lg border transition-all duration-200",
                                      "border-primary/30 bg-primary/5 hover:bg-primary/10"
                                    )}
                                  >
                                    <FileDownIcon className={cn("w-4 h-4 flex-shrink-0", colors.text)} />
                                    <span className="text-xs font-medium text-foreground">{downloadInfo.filename}</span>
                                    <span className="text-[10px] text-muted-foreground ml-auto">Download</span>
                                  </motion.a>
                                )}
                              </div>
                            );
                          }

                          return (
                            <div
                              key={`${message.id}-tool-${idx}`}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary border border-border text-[11px] text-muted-foreground"
                            >
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              <span>{toolName.replace(/_/g, " ")}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}

            {/* Typing Indicator — bouncing dots with agent emoji */}
            {isLoading && visibleMessages.length > 0 && (
              <TypingIndicator emoji={agentInfo.emoji} />
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                <span>Error: {error.message}</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area — fixed to bottom with backdrop blur */}
      <div className="border-t border-border px-3 sm:px-4 py-3 flex-shrink-0 bg-background/80 backdrop-blur-xl lg:pb-safe">
        <div className="max-w-3xl mx-auto">
          {/* Attachment Previews */}
          <AnimatePresence>
            {attachments.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-wrap gap-2 mb-2"
              >
                {attachments.map((att, idx) => (
                  <motion.div
                    key={`${att.name}-${idx}`}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs",
                      "border-border bg-secondary"
                    )}
                  >
                    {att.type === "image" ? (
                      <span className="text-muted-foreground">🖼️</span>
                    ) : (
                      <span className="text-muted-foreground">📄</span>
                    )}
                    <span className="text-foreground font-medium truncate max-w-[120px]">{att.name}</span>
                    <button
                      onClick={() => removeAttachment(idx)}
                      className="ml-0.5 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Google Drive Picker (overlay) */}
          <AnimatePresence>
            {showDrivePicker && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="mb-2 rounded-xl border border-border bg-popover backdrop-blur-xl p-3 shadow-2xl"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <DriveIcon className="w-3.5 h-3.5" />
                    Google Drive
                    {!driveLoading && driveFiles.length > 0 && (
                      <span className="text-[10px] text-muted-foreground font-normal">({driveFiles.length} files)</span>
                    )}
                  </span>
                  <button
                    onClick={() => setShowDrivePicker(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <XIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="relative mb-2">
                  <SearchIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={driveSearch}
                    onChange={(e) => handleDriveSearch(e.target.value)}
                    placeholder="Search all Drive files..."
                    className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-border bg-secondary focus:outline-none focus:ring-1 focus:ring-primary/30 text-foreground placeholder:text-muted-foreground"
                    autoFocus
                  />
                </div>
                <div className="max-h-56 overflow-y-auto custom-scrollbar space-y-0.5">
                  {driveLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : driveFiles.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      {driveSearch ? "No files found" : "No files in Drive"}
                    </p>
                  ) : (
                    driveFiles.map((file) => {
                      const cat = file.category as string;
                      const iconEmoji =
                        cat === "doc" ? "📝" :
                        cat === "sheet" ? "📊" :
                        cat === "slide" ? "📽️" :
                        cat === "pdf" ? "📄" :
                        cat === "image" ? "🖼️" :
                        cat === "video" ? "🎬" :
                        cat === "audio" ? "🎵" : "📁";
                      const typeLabel =
                        cat === "doc" ? "Google Doc" :
                        cat === "sheet" ? "Google Sheet" :
                        cat === "slide" ? "Google Slide" :
                        cat === "pdf" ? "PDF" :
                        cat === "image" ? "Image" :
                        cat === "video" ? "Video" :
                        cat === "audio" ? "Audio" :
                        file.mimeType.split("/").pop()?.toUpperCase() || "File";
                      const modDate = file.modifiedTime
                        ? new Date(file.modifiedTime).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                        : "";
                      return (
                        <button
                          key={file.id}
                          onClick={() => handleDriveFileSelect(file)}
                          className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-accent transition-colors flex items-center gap-2.5 group"
                        >
                          <span className="text-sm flex-shrink-0 w-5 text-center">{iconEmoji}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-foreground truncate group-hover:text-primary transition-colors">{file.name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {typeLabel}{file.size ? ` · ${(file.size / 1024).toFixed(0)}KB` : ""}{modDate ? ` · ${modDate}` : ""}
                            </p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Unified Input Bar */}
          <div className="flex items-end gap-1.5 sm:gap-2">
            {/* File upload button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-200 cursor-pointer"
              title="Upload file"
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="w-[18px] h-[18px] animate-spin" />
              ) : (
                <PaperclipIcon className="w-[18px] h-[18px]" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.docx,.doc,.csv,.xlsx,.xls,.txt,.json,.md,.png,.jpg,.jpeg,.gif,.webp"
              onChange={handleFileSelect}
              multiple
            />

            {/* Google Drive button */}
            <button
              type="button"
              onClick={() => {
                const opening = !showDrivePicker;
                setShowDrivePicker(opening);
                if (opening) {
                  setDriveFiles([]);
                  setDriveSearch("");
                  loadDriveFiles();
                }
              }}
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200 cursor-pointer",
                showDrivePicker
                  ? "text-foreground bg-secondary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
              title="Attach from Google Drive"
            >
              <DriveIcon className="w-[18px] h-[18px]" />
            </button>

            {/* Textarea */}
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={handleTextareaInput}
                onKeyDown={handleKeyDown}
                placeholder={`Message ${agentInfo.name}...`}
                rows={1}
                className={cn(
                  "w-full resize-none rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground",
                  "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30",
                  "transition-all duration-200"
                )}
                style={{ minHeight: "40px", maxHeight: "120px" }}
              />
            </div>

            {/* Send button */}
            <button
              type="button"
              onClick={handleSend}
              disabled={(!inputText.trim() && attachments.length === 0) || isLoading}
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200 cursor-pointer",
                (!inputText.trim() && attachments.length === 0) || isLoading
                  ? "text-muted-foreground/40 bg-secondary cursor-not-allowed"
                  : "text-primary-foreground bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
              )}
            >
              {isLoading ? (
                <Loader2 className="w-[18px] h-[18px] animate-spin" />
              ) : (
                <SendIcon className="w-[18px] h-[18px]" />
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Chat View Component (parent — handles agent selection, header, layout)
// ---------------------------------------------------------------------------

export function ChatView() {
  const [agents, setAgents] = useState<AgentInfo[]>([DEFAULT_AGENT]);
  const [selectedAgent, setSelectedAgent] = useState<string>(() => getLastActiveAgent());
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const [showConversations, setShowConversations] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => generateSessionId());
  const [sessionMap, setSessionMap] = useState<Record<string, string>>({});
  const pickerRef = useRef<HTMLDivElement>(null);

  // Load session map from localStorage on mount + auto-purge stale history
  useEffect(() => {
    // Auto-purge: if chat history version doesn't match, purge everything and start fresh
    try {
      const storedVersion = localStorage.getItem(CHAT_VERSION_KEY);
      if (storedVersion !== String(CHAT_HISTORY_VERSION)) {
        console.log("[Chat] Chat history version mismatch — purging all old history");
        purgeAllConversations().then((result) => {
          console.log("[Chat] Purge result:", result);
          localStorage.setItem(CHAT_VERSION_KEY, String(CHAT_HISTORY_VERSION));
        }).catch(() => {
          localStorage.setItem(CHAT_VERSION_KEY, String(CHAT_HISTORY_VERSION));
        });
        // Reset session state to force fresh start
        setSessionMap({});
        setCurrentSessionId(generateSessionId());
        return;
      }
    } catch {
      // ignore
    }

    const map = loadSessionMap();
    setSessionMap(map);

    const lastAgent = getLastActiveAgent();
    if (map[lastAgent]) {
      setSelectedAgent(lastAgent);
      setCurrentSessionId(map[lastAgent]);
    }
  }, []);

  const updateSessionMap = useCallback((map: Record<string, string>) => {
    setSessionMap(map);
    saveSessionMap(map);
  }, []);

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

  const handleAgentChange = (agentId: string) => {
    const targetAgent = agents.find((a) => a.id === agentId);
    if (targetAgent && agentId !== selectedAgent) {
      trackAgentSwitch(selectedAgent, agentId, targetAgent.name);
    }

    const newMap = { ...sessionMap, [selectedAgent]: currentSessionId };
    updateSessionMap(newMap);

    const targetSession = newMap[agentId] || generateSessionId();
    newMap[agentId] = targetSession;
    updateSessionMap(newMap);

    saveLastActiveAgent(agentId);

    setCurrentSessionId(targetSession);
    setSelectedAgent(agentId);
    setShowAgentPicker(false);
    setShowConversations(false);
  };

  const handleNewChat = () => {
    const newSessionId = generateSessionId();
    const newMap = { ...sessionMap, [selectedAgent]: newSessionId };
    updateSessionMap(newMap);
    setCurrentSessionId(newSessionId);
    setShowConversations(false);
  };

  const handleSelectSession = (sessionId: string, agentId: string) => {
    const newMap = { ...sessionMap, [agentId]: sessionId };

    if (agentId !== selectedAgent) {
      newMap[selectedAgent] = currentSessionId;
      setSelectedAgent(agentId);
      saveLastActiveAgent(agentId);
    }

    updateSessionMap(newMap);
    setCurrentSessionId(sessionId);
    setShowConversations(false);
  };

  return (
    <div className="flex flex-col h-full relative">
      {/* Slim Header — Agent emoji + name + role, model badge, history/new buttons */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b border-border flex-shrink-0">
        <div className="relative" ref={pickerRef}>
          <button
            onClick={() => setShowAgentPicker(!showAgentPicker)}
            className={cn(
              "flex items-center gap-2.5 px-3 py-1.5 rounded-lg border transition-all duration-200 hover:border-border cursor-pointer",
              "border-border bg-secondary"
            )}
          >
            <span className="text-lg">{activeAgent.emoji}</span>
            <div className="text-left">
              <p className="text-sm font-semibold text-foreground leading-tight">{activeAgent.name}</p>
              <p className="text-[10px] text-muted-foreground leading-tight hidden sm:block">{activeAgent.role}</p>
            </div>
            <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", showAgentPicker && "rotate-180")} />
          </button>

          {/* Agent Dropdown */}
          <AnimatePresence>
            {showAgentPicker && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full left-0 mt-1 w-64 bg-popover backdrop-blur-xl border border-border rounded-xl shadow-2xl z-50 overflow-hidden"
              >
                <div className="py-1">
                  {agents.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => handleAgentChange(agent.id)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-accent cursor-pointer",
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

        {/* Header Actions */}
        <div className="flex items-center gap-1">
          <Badge variant="outline" className="text-[10px] gap-1 border-border hidden sm:flex">
            <span className={cn("w-1.5 h-1.5 rounded-full", colors.dot)} />
            {activeAgent.model}
          </Badge>
          <button
            onClick={() => setShowConversations(true)}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
            title="All conversations"
          >
            <HistoryIcon className="w-4 h-4" />
          </button>
          <button
            onClick={handleNewChat}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
            title="New chat"
          >
            <PlusIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Conversations Panel (overlay) */}
      <AnimatePresence>
        {showConversations && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <ConversationsPanel
              agents={agents}
              currentSessionId={currentSessionId}
              currentAgentId={selectedAgent}
              onSelectSession={handleSelectSession}
              onClose={() => setShowConversations(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Session */}
      <AgentChatSession
        key={currentSessionId}
        agentId={selectedAgent}
        agentInfo={activeAgent}
        sessionId={currentSessionId}
      />
    </div>
  );
}
