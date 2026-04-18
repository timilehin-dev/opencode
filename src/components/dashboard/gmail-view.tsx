"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ChevronLeftIcon,
  SearchIcon,
  TagIcon,
  Spinner,
  SendIcon,
  TrashIcon,
  MailIcon,
  X,
} from "@/components/icons";
import {
  extractSender,
  stripHtml,
  truncate,
  timeAgoMs,
} from "@/lib/helpers";
import { cn } from "@/lib/utils";
import type {
  GmailMessage,
  GmailLabel,
  GmailTab,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Avatar color generator — deterministic from sender name
// ---------------------------------------------------------------------------

const AVATAR_COLORS = [
  "bg-blue-600",
  "bg-emerald-600",
  "bg-amber-600",
  "bg-rose-600",
  "bg-violet-600",
  "bg-cyan-600",
  "bg-orange-600",
  "bg-teal-600",
  "bg-pink-600",
  "bg-lime-600",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

// ---------------------------------------------------------------------------
// Extended type for full email detail (includes HTML body)
// ---------------------------------------------------------------------------

interface GmailMessageFull extends GmailMessage {
  messageHtml?: string;
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

const gmTabs: { key: GmailTab; label: string }[] = [
  { key: "inbox", label: "Inbox" },
  { key: "compose", label: "Compose" },
  { key: "search", label: "Search" },
  { key: "labels", label: "Labels" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GmailView() {
  const [gmTab, setGmTab] = useState<GmailTab>("inbox");
  const [emails, setEmails] = useState<GmailMessage[]>([]);
  const [labels, setLabels] = useState<GmailLabel[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<GmailMessage | null>(null);
  const [emailDetail, setEmailDetail] = useState<GmailMessageFull | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GmailMessage[]>([]);
  // Compose form
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  // Create label form
  const [newLabelName, setNewLabelName] = useState("");
  const [creatingLabel, setCreatingLabel] = useState(false);
  const [loading, setLoading] = useState(true);

  // -----------------------------------------------------------------------
  // Data fetchers
  // -----------------------------------------------------------------------

  const fetchInbox = useCallback(async () => {
    setLoading(true);
    setSelectedEmail(null);
    setEmailDetail(null);
    try {
      const res = await fetch("/api/gmail?action=inbox&max=20");
      const json = await res.json();
      if (json.success) setEmails(json.data.messages || []);
    } catch {
      /* silent */
    }
    setLoading(false);
  }, []);

  const fetchLabels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/gmail?action=labels");
      const json = await res.json();
      if (json.success) setLabels(json.data || []);
    } catch {
      /* silent */
    }
    setLoading(false);
  }, []);

  const fetchEmailDetail = useCallback(async (messageId: string) => {
    setDetailLoading(true);
    setEmailDetail(null);
    try {
      const res = await fetch(`/api/gmail?action=read&id=${encodeURIComponent(messageId)}`);
      const json = await res.json();
      if (json.success) {
        setEmailDetail(json.data as GmailMessageFull);
      }
    } catch {
      /* silent */
    }
    setDetailLoading(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      switch (gmTab) {
        case "inbox": await fetchInbox(); break;
        case "labels": await fetchLabels(); break;
      }
    })();
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gmTab]);

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleSelectEmail = (email: GmailMessage) => {
    setSelectedEmail(email);
    setEmailDetail(null);
    fetchEmailDetail(email.id);
  };

  const handleCloseDetail = () => {
    setSelectedEmail(null);
    setEmailDetail(null);
  };

  const handleReply = () => {
    if (!selectedEmail) return;
    setComposeTo(selectedEmail.from || "");
    setComposeSubject(
      selectedEmail.subject?.startsWith("Re: ")
        ? selectedEmail.subject
        : `Re: ${selectedEmail.subject || ""}`
    );
    setComposeBody("");
    setGmTab("compose");
    setSelectedEmail(null);
    setEmailDetail(null);
  };

  const handleGmailSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setSearchResults([]);
    try {
      const res = await fetch(`/api/gmail?action=search&query=${encodeURIComponent(searchQuery)}&max=20`);
      const json = await res.json();
      if (json.success) setSearchResults(json.data.messages || []);
    } catch {
      /* silent */
    }
    setLoading(false);
  };

  const handleSendEmail = async () => {
    if (!composeTo.trim() || !composeBody.trim()) return;
    setSendingEmail(true);
    setSendSuccess(false);
    setSendError(null);
    try {
      const res = await fetch("/api/gmail?action=send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: composeTo, subject: composeSubject, body: composeBody }),
      });
      const json = await res.json();
      if (json.success) {
        setSendSuccess(true);
        setComposeTo("");
        setComposeSubject("");
        setComposeBody("");
      } else {
        setSendError(json.error);
      }
    } catch {
      setSendError("Failed to send email");
    }
    setSendingEmail(false);
  };

  const handleCreateLabel = async () => {
    if (!newLabelName.trim()) return;
    setCreatingLabel(true);
    try {
      const res = await fetch("/api/gmail?action=createLabel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newLabelName }),
      });
      const json = await res.json();
      if (json.success) {
        setNewLabelName("");
        fetchLabels();
      }
    } catch {
      /* silent */
    }
    setCreatingLabel(false);
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      const res = await fetch("/api/gmail?action=deleteMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
      });
      const json = await res.json();
      if (json.success) {
        setEmails((prev) => prev.filter((e) => e.id !== messageId));
        setSelectedEmail(null);
        setEmailDetail(null);
      }
    } catch {
      /* silent */
    }
  };

  // -----------------------------------------------------------------------
  // Helper to render an email row (inbox + search)
  // -----------------------------------------------------------------------

  const renderEmailRow = (email: GmailMessage, clickable = true) => {
    const isUnread = email.labelIds?.includes("UNREAD");
    const isSent = email.labelIds?.includes("SENT");
    const senderName = extractSender(email.from);

    return (
      <div
        key={email.id}
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={clickable ? () => handleSelectEmail(email) : undefined}
        onKeyDown={clickable ? (e) => { if (e.key === "Enter") handleSelectEmail(email); } : undefined}
        className={cn(
          "flex items-start gap-3 px-4 py-3.5 rounded-xl transition-all duration-200",
          "border border-transparent",
          clickable && "cursor-pointer hover:bg-[#1e293b] hover:border-[#e8e5df]",
        )}
      >
        {/* Avatar */}
        <div className={cn(
          "w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-[#1a1a1a]",
          avatarColor(senderName),
        )}>
          {avatarInitials(senderName)}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isUnread && (
              <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
            )}
            <span className={cn(
              "text-sm truncate",
              isUnread ? "font-bold text-[#1a1a1a]" : "font-medium text-[#1a1a1a]",
            )}>
              {isSent ? "To: " : ""}{senderName}
            </span>
          </div>
          <p className={cn(
            "text-sm truncate mt-0.5",
            isUnread ? "text-slate-100 font-medium" : "text-[#6b6b6b]",
          )}>
            {email.subject || "(No subject)"}
          </p>
          <p className="text-xs text-[#999999] mt-1 line-clamp-2 leading-relaxed">
            {email.snippet ? truncate(stripHtml(email.snippet), 120) : ""}
          </p>
        </div>

        {/* Time */}
        <span className="text-xs text-[#999999] whitespace-nowrap flex-shrink-0 mt-0.5">
          {timeAgoMs(Number(email.internalDate))}
        </span>
      </div>
    );
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <motion.div
      key="gmail"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Tab Navigation */}
      <nav className="border-b border-[#e8e5df] mb-6">
        <div className="flex gap-0 overflow-x-auto">
          {gmTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setGmTab(tab.key); setSelectedEmail(null); setEmailDetail(null); setSearchResults([]); }}
              className={cn(
                "px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                gmTab === tab.key
                  ? "border-red-500 text-red-400"
                  : "border-transparent text-[#6b6b6b] hover:text-[#1a1a1a] hover:border-[#d5d0c9]",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {loading && gmTab !== "compose" && <Spinner color="red" />}

      {/* ================================================================= */}
      {/* INBOX TAB                                                         */}
      {/* ================================================================= */}
      {gmTab === "inbox" && !loading && (
        <div className="flex gap-4 flex-col lg:flex-row">
          {/* Email list */}
          <div className={cn("flex-1 min-w-0", selectedEmail && "hidden lg:block")}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[#1a1a1a]">
                Inbox
                <span className="ml-2 text-sm font-normal text-[#6b6b6b]">
                  {emails.length}
                </span>
              </h2>
              <button
                onClick={fetchInbox}
                className="text-xs text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors px-3 py-1.5 rounded-lg hover:bg-[#1e293b]"
              >
                Refresh
              </button>
            </div>

            {emails.length === 0 ? (
              <div className="bg-[#faf9f7] border border-[#e8e5df] rounded-xl p-12 text-center">
                <MailIcon className="w-10 h-10 text-[#999999] mx-auto mb-3" />
                <p className="text-sm text-[#6b6b6b]">Your inbox is empty</p>
              </div>
            ) : (
              <div className="bg-[#faf9f7] border border-[#e8e5df] rounded-xl overflow-hidden">
                <div className="max-h-[700px] overflow-y-auto custom-scrollbar">
                  {emails.map((email) => renderEmailRow(email))}
                </div>
              </div>
            )}
          </div>

          {/* Email detail panel */}
          {(selectedEmail || detailLoading) && (
            <div className="flex-1 min-w-0 bg-[#faf9f7] border border-[#e8e5df] rounded-xl overflow-hidden flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 bg-[#faf9f7] border-b border-[#e8e5df] flex-shrink-0">
                <button
                  onClick={handleCloseDetail}
                  className="flex items-center gap-1.5 text-sm text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors lg:hidden"
                >
                  <ChevronLeftIcon className="w-4 h-4" />
                  <span>Back</span>
                </button>

                <div className="flex items-center gap-1 ml-auto">
                  {/* Reply */}
                  <button
                    onClick={handleReply}
                    className="inline-flex items-center gap-1.5 text-xs text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors px-3 py-1.5 rounded-lg hover:bg-[#1e293b]"
                    title="Reply"
                  >
                    <SendIcon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Reply</span>
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => selectedEmail && handleDeleteMessage(selectedEmail.id)}
                    className="inline-flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-500/10"
                    title="Delete"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Delete</span>
                  </button>

                  {/* Close (desktop) */}
                  <button
                    onClick={handleCloseDetail}
                    className="text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors p-1.5 rounded-lg hover:bg-[#1e293b] hidden lg:block"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
                {detailLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="w-7 h-7 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
                  </div>
                ) : (
                  <>
                    {/* Subject */}
                    <h3 className="text-lg font-semibold text-[#1a1a1a] leading-snug">
                      {emailDetail?.subject || selectedEmail?.subject || "(No subject)"}
                    </h3>

                    {/* Sender info */}
                    <div className="flex items-center gap-3 mt-4">
                      <div className={cn(
                        "w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-[#1a1a1a]",
                        avatarColor(extractSender(emailDetail?.from || selectedEmail?.from)),
                      )}>
                        {avatarInitials(extractSender(emailDetail?.from || selectedEmail?.from))}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[#1a1a1a] truncate">
                          {extractSender(emailDetail?.from || selectedEmail?.from)}
                        </p>
                        <p className="text-xs text-[#999999] truncate">
                          {emailDetail?.from || selectedEmail?.from}
                        </p>
                      </div>
                      <span className="text-xs text-[#999999] whitespace-nowrap flex-shrink-0">
                        {emailDetail?.date || selectedEmail?.date}
                      </span>
                    </div>

                    {/* To line */}
                    <p className="text-xs text-[#999999] mt-2">
                      <span className="text-[#6b6b6b] font-medium">To:</span>{" "}
                      {emailDetail?.to || selectedEmail?.to}
                    </p>

                    {/* Attachments */}
                    {((emailDetail?.attachmentList?.length ?? 0) > 0) && (
                      <div className="mt-4 flex items-center gap-2 text-xs text-[#6b6b6b] bg-[#faf9f7] px-3 py-2 rounded-lg border border-[#e8e5df]">
                        <MailIcon className="w-3.5 h-3.5" />
                        <span>
                          {(emailDetail?.attachmentList?.length ?? 0)} attachment(s)
                        </span>
                      </div>
                    )}

                    {/* Email body */}
                    <div className="mt-5 text-sm text-[#1a1a1a] leading-relaxed">
                      {emailDetail?.messageHtml ? (
                        <div
                          className="prose prose-invert prose-sm max-w-none [&_a]:text-blue-600 [&_a]:underline [&_a:hover]:text-blue-300 [&_blockquote]:border-l-slate-500 [&_blockquote]:text-[#6b6b6b] [&_pre]:bg-[#0f172a] [&_pre]:rounded-lg [&_pre]:p-4 [&_table]:border-collapse [&_td]:border [&_td]:border-[#e8e5df] [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-[#e8e5df] [&_th]:px-2 [&_th]:py-1 [&_th]:bg-[#faf9f7] [&_th]:text-[#1a1a1a] [&_img]:max-w-full [&_img]:rounded-lg"
                          dangerouslySetInnerHTML={{ __html: emailDetail.messageHtml }}
                        />
                      ) : emailDetail?.messageText ? (
                        <div className="whitespace-pre-wrap break-words">{emailDetail.messageText}</div>
                      ) : selectedEmail?.snippet ? (
                        <div className="whitespace-pre-wrap break-words text-[#6b6b6b] italic">
                          {stripHtml(selectedEmail.snippet)}
                        </div>
                      ) : (
                        <div className="text-[#999999] italic">No content available</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* COMPOSE TAB                                                       */}
      {/* ================================================================= */}
      {gmTab === "compose" && (
        <div className="max-w-2xl">
          <div className="bg-[#faf9f7] border border-[#e8e5df] rounded-xl overflow-hidden">
            <div className="px-5 py-4 bg-[#faf9f7] border-b border-[#e8e5df]">
              <h2 className="text-lg font-semibold text-[#1a1a1a]">Compose Email</h2>
            </div>

            <div className="p-5 space-y-4">
              {/* Success / Error banners */}
              {sendSuccess && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 px-4 py-3 rounded-lg text-sm flex items-center justify-between">
                  <span>Email sent successfully!</span>
                  <button onClick={() => setSendSuccess(false)} className="underline hover:text-emerald-600 text-xs">
                    Dismiss
                  </button>
                </div>
              )}
              {sendError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm flex items-center justify-between">
                  <span>{sendError}</span>
                  <button onClick={() => setSendError(null)} className="underline hover:text-red-300 text-xs">
                    Dismiss
                  </button>
                </div>
              )}

              {/* To */}
              <div>
                <label className="text-xs font-medium text-[#6b6b6b] mb-1.5 block">To</label>
                <input
                  type="email"
                  placeholder="recipient@example.com"
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-[#1a1a1a] placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-colors"
                />
              </div>

              {/* Subject */}
              <div>
                <label className="text-xs font-medium text-[#6b6b6b] mb-1.5 block">Subject</label>
                <input
                  type="text"
                  placeholder="Email subject"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-[#1a1a1a] placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-colors"
                />
              </div>

              {/* Body */}
              <div>
                <label className="text-xs font-medium text-[#6b6b6b] mb-1.5 block">Body</label>
                <textarea
                  placeholder="Write your email..."
                  rows={10}
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-[#1a1a1a] placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 resize-y transition-colors"
                />
              </div>

              {/* Send button */}
              <button
                onClick={handleSendEmail}
                disabled={sendingEmail || !composeTo.trim() || !composeBody.trim()}
                className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-500 disabled:bg-[#e8e5df] disabled:text-[#999999] text-[#1a1a1a] px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                {sendingEmail && (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                <SendIcon className="w-4 h-4" />
                {sendingEmail ? "Sending..." : "Send Email"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* SEARCH TAB                                                        */}
      {/* ================================================================= */}
      {gmTab === "search" && (
        <div>
          {/* Search bar */}
          <div className="bg-[#faf9f7] border border-[#e8e5df] rounded-xl p-4 mb-6">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#999999]">
                  <SearchIcon className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  placeholder="Search emails (e.g. from:john subject:meeting)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleGmailSearch()}
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-[#1a1a1a] placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-colors"
                />
              </div>
              <button
                onClick={handleGmailSearch}
                disabled={!searchQuery.trim()}
                className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-500 disabled:bg-[#e8e5df] disabled:text-[#999999] text-[#1a1a1a] px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                Search
              </button>
            </div>
          </div>

          {loading && <Spinner color="red" />}

          {/* Results */}
          {!loading && searchResults.length > 0 && (
            <div className="bg-[#faf9f7] border border-[#e8e5df] rounded-xl overflow-hidden">
              <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
                {searchResults.map((email) => renderEmailRow(email))}
              </div>
            </div>
          )}

          {!loading && searchQuery && searchResults.length === 0 && (
            <div className="bg-[#faf9f7] border border-[#e8e5df] rounded-xl p-12 text-center">
              <SearchIcon className="w-10 h-10 text-[#999999] mx-auto mb-3" />
              <p className="text-sm text-[#6b6b6b]">
                No results found for &quot;{searchQuery}&quot;
              </p>
            </div>
          )}

          {!searchQuery && !loading && (
            <div className="bg-[#faf9f7] border border-[#e8e5df] rounded-xl p-12 text-center">
              <SearchIcon className="w-10 h-10 text-[#999999] mx-auto mb-3" />
              <p className="text-sm text-[#6b6b6b] mb-3">
                Enter a search query to find emails.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {["from:", "subject:", "has:attachment", "is:unread"].map((op) => (
                  <code
                    key={op}
                    className="bg-[#0f172a] px-2 py-1 rounded text-xs text-[#6b6b6b] border border-[#e8e5df]"
                  >
                    {op}
                  </code>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* LABELS TAB                                                        */}
      {/* ================================================================= */}
      {gmTab === "labels" && !loading && (
        <div className="max-w-2xl space-y-6">
          {/* Create label */}
          <div className="bg-[#faf9f7] border border-[#e8e5df] rounded-xl overflow-hidden">
            <div className="px-5 py-4 bg-[#faf9f7] border-b border-[#e8e5df]">
              <h2 className="text-lg font-semibold text-[#1a1a1a]">Create Label</h2>
            </div>
            <div className="p-5">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Label name"
                  value={newLabelName}
                  onChange={(e) => setNewLabelName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateLabel()}
                  className="flex-1 bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-[#1a1a1a] placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-colors"
                />
                <button
                  onClick={handleCreateLabel}
                  disabled={creatingLabel || !newLabelName.trim()}
                  className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-500 disabled:bg-[#e8e5df] disabled:text-[#999999] text-[#1a1a1a] px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                >
                  {creatingLabel ? "Creating..." : "Create"}
                </button>
              </div>
            </div>
          </div>

          {/* Labels list */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[#1a1a1a]">
                Labels
                <span className="ml-2 text-sm font-normal text-[#6b6b6b]">
                  {labels.length}
                </span>
              </h2>
            </div>

            {labels.length === 0 ? (
              <div className="bg-[#faf9f7] border border-[#e8e5df] rounded-xl p-12 text-center">
                <TagIcon className="w-10 h-10 text-[#999999] mx-auto mb-3" />
                <p className="text-sm text-[#6b6b6b]">No labels found</p>
              </div>
            ) : (
              <div className="bg-[#faf9f7] border border-[#e8e5df] rounded-xl overflow-hidden">
                <div className="grid grid-cols-[1fr_auto] px-5 py-2.5 bg-[#faf9f7] border-b border-[#e8e5df] text-xs font-medium text-[#6b6b6b] uppercase tracking-wider">
                  <span>Name</span>
                  <span>Type</span>
                </div>
                {labels.map((label) => (
                  <div
                    key={label.id}
                    className="grid grid-cols-[1fr_auto] px-5 py-3 hover:bg-[#1e293b] transition-colors border-b border-slate-700/30 last:border-b-0"
                  >
                    <span className="flex items-center gap-2.5 text-sm">
                      <TagIcon className="w-4 h-4 text-[#999999] flex-shrink-0" />
                      {label.color && (
                        <span
                          className="w-3 h-3 rounded-sm inline-block flex-shrink-0"
                          style={{
                            backgroundColor: label.color.backgroundColor,
                            borderColor: label.color.textColor,
                            borderWidth: 1,
                            borderStyle: "solid",
                          }}
                        />
                      )}
                      <span className="text-[#1a1a1a] font-medium truncate">{label.name}</span>
                    </span>
                    <span className={cn(
                      "text-xs px-2.5 py-0.5 rounded-full font-medium",
                      label.type === "system"
                        ? "bg-[#e8e5df] text-[#1a1a1a]"
                        : "bg-blue-500/20 text-blue-600",
                    )}>
                      {label.type === "system" ? "System" : "User"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
