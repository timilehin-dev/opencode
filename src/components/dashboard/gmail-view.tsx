"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ChevronLeftIcon,
  SearchIcon,
  TagIcon,
  Spinner,
} from "@/components/icons";
import {
  extractSender,
  stripHtml,
  truncate,
  timeAgoMs,
} from "@/lib/helpers";
import type {
  GmailMessage,
  GmailLabel,
  GmailTab,
} from "@/lib/types";

const gmTabs: { key: GmailTab; label: string }[] = [
  { key: "inbox", label: "Inbox" },
  { key: "compose", label: "Compose" },
  { key: "search", label: "Search" },
  { key: "labels", label: "Labels" },
];

export function GmailView() {
  const [gmTab, setGmTab] = useState<GmailTab>("inbox");
  const [emails, setEmails] = useState<GmailMessage[]>([]);
  const [labels, setLabels] = useState<GmailLabel[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<GmailMessage | null>(null);
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

  const fetchInbox = useCallback(async () => {
    setLoading(true);
    setSelectedEmail(null);
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
      }
    } catch {
      /* silent */
    }
  };

  return (
    <motion.div
      key="gmail"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Gmail Tab Navigation */}
      <nav className="border-b border-slate-800 mb-6">
        <div className="flex gap-0 overflow-x-auto">
          {gmTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setGmTab(tab.key); setSelectedEmail(null); setSearchResults([]); }}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                gmTab === tab.key
                  ? "border-red-500 text-red-400"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {loading && gmTab !== "compose" && <Spinner color="red" />}

      {/* Inbox Tab */}
      {gmTab === "inbox" && !loading && (
        <div className="flex gap-4 flex-col lg:flex-row">
          {/* Email list */}
          <div className={`flex-1 min-w-0 ${selectedEmail ? "hidden lg:block" : ""}`}>
            <h2 className="text-lg font-semibold text-white mb-3">
              Inbox <span className="ml-2 text-sm font-normal text-slate-400">({emails.length})</span>
            </h2>
            {emails.length === 0 ? (
              <div className="bg-[#1a2332] border border-slate-700/50 rounded-xl p-8 text-center text-slate-400">Inbox is empty</div>
            ) : (
              <div className="space-y-1 max-h-[700px] overflow-y-auto custom-scrollbar">
                {emails.map((email) => {
                  const isUnread = email.labelIds?.includes("UNREAD");
                  const isSent = email.labelIds?.includes("SENT");
                  return (
                    <button
                      key={email.id}
                      onClick={() => setSelectedEmail(email)}
                      className={`w-full text-left bg-[#1a2332] border border-slate-700/50 rounded-lg px-4 py-3 hover:border-slate-600 hover:bg-[#1e293b] transition-colors ${isUnread ? "border-l-2 border-l-red-500" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm truncate ${isUnread ? "font-bold text-white" : "text-slate-300"}`}>
                              {isSent ? "To: " : ""}{extractSender(email.from)}
                            </span>
                          </div>
                          <p className={`text-sm truncate mt-0.5 ${isUnread ? "text-white font-medium" : "text-slate-400"}`}>
                            {email.subject || "(No subject)"}
                          </p>
                          <p className="text-xs text-slate-500 truncate mt-1">
                            {email.snippet ? truncate(stripHtml(email.snippet), 100) : ""}
                          </p>
                        </div>
                        <span className="text-xs text-slate-500 whitespace-nowrap flex-shrink-0">
                          {timeAgoMs(Number(email.internalDate))}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Email detail */}
          {selectedEmail && (
            <div className="flex-1 min-w-0 bg-[#1a2332] border border-slate-700/50 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-[#151d2e] border-b border-slate-700/50">
                <button onClick={() => setSelectedEmail(null)} className="flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors lg:hidden">
                  <ChevronLeftIcon /> Back
                </button>
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    onClick={() => handleDeleteMessage(selectedEmail.id)}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded hover:bg-red-500/10"
                  >
                    Delete
                  </button>
                  <button onClick={() => setSelectedEmail(null)} className="text-xs text-slate-400 hover:text-white transition-colors px-2 py-1">
                    Close
                  </button>
                </div>
              </div>
              <div className="p-5">
                <h3 className="text-lg font-semibold text-white">{selectedEmail.subject || "(No subject)"}</h3>
                <div className="flex items-center gap-3 mt-3 text-sm text-slate-400">
                  <span className="font-medium text-white">{extractSender(selectedEmail.from)}</span>
                  <span className="text-slate-600">&lt;{selectedEmail.from}&gt;</span>
                  <span className="ml-auto text-xs">{selectedEmail.date}</span>
                </div>
                <div className="mt-4 text-sm text-slate-300 leading-relaxed max-h-[400px] overflow-y-auto custom-scrollbar whitespace-pre-wrap break-words">
                  {selectedEmail.messageText ? stripHtml(selectedEmail.messageText) : selectedEmail.snippet || "No content"}
                </div>
                {selectedEmail.attachmentList && selectedEmail.attachmentList.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-700/50">
                    <span className="text-xs font-medium text-slate-400">
                      {selectedEmail.attachmentList.length} attachment(s)
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Compose Tab */}
      {gmTab === "compose" && (
        <div className="max-w-2xl">
          <div className="bg-[#1a2332] border border-slate-700/50 rounded-xl p-5">
            <h2 className="text-lg font-semibold text-white mb-4">Compose Email</h2>
            {sendSuccess && (
              <div className="mb-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-3 rounded-lg text-sm">
                Email sent successfully!
                <button onClick={() => setSendSuccess(false)} className="ml-3 underline hover:text-emerald-300">Dismiss</button>
              </div>
            )}
            {sendError && (
              <div className="mb-4 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
                {sendError}
                <button onClick={() => setSendError(null)} className="ml-3 underline hover:text-red-300">Dismiss</button>
              </div>
            )}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1 block">To</label>
                <input type="email" placeholder="recipient@example.com" value={composeTo} onChange={(e) => setComposeTo(e.target.value)}
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1 block">Subject</label>
                <input type="text" placeholder="Email subject" value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)}
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1 block">Body</label>
                <textarea placeholder="Write your email..." rows={10} value={composeBody} onChange={(e) => setComposeBody(e.target.value)}
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 resize-y" />
              </div>
              <button onClick={handleSendEmail} disabled={sendingEmail || !composeTo.trim() || !composeBody.trim()}
                className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors">
                {sendingEmail && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {sendingEmail ? "Sending..." : "Send Email"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search Tab */}
      {gmTab === "search" && (
        <div>
          <div className="flex gap-2 mb-6">
            <div className="flex-1 relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"><SearchIcon /></div>
              <input
                type="text"
                placeholder="Search emails (e.g. from:john subject:meeting)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleGmailSearch()}
                className="w-full bg-[#0f172a] border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500"
              />
            </div>
            <button onClick={handleGmailSearch} disabled={!searchQuery.trim()}
              className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors">
              Search
            </button>
          </div>

          {loading && <Spinner color="red" />}

          {!loading && searchResults.length > 0 && (
            <div className="space-y-1 max-h-[600px] overflow-y-auto custom-scrollbar">
              {searchResults.map((email) => (
                <div key={email.id} className="bg-[#1a2332] border border-slate-700/50 rounded-lg px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white truncate">{extractSender(email.from)}</span>
                      </div>
                      <p className="text-sm text-white truncate mt-0.5">{email.subject || "(No subject)"}</p>
                      <p className="text-xs text-slate-500 truncate mt-1">
                        {email.snippet ? truncate(stripHtml(email.snippet), 120) : ""}
                      </p>
                    </div>
                    <span className="text-xs text-slate-500 whitespace-nowrap flex-shrink-0">
                      {timeAgoMs(Number(email.internalDate))}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && searchQuery && searchResults.length === 0 && (
            <div className="bg-[#1a2332] border border-slate-700/50 rounded-xl p-8 text-center text-slate-400">
              No results found for &quot;{searchQuery}&quot;
            </div>
          )}

          {!searchQuery && !loading && (
            <div className="bg-[#1a2332] border border-slate-700/50 rounded-xl p-8 text-center text-slate-400">
              Enter a search query to find emails. Supports Gmail search operators like <code className="bg-[#0f172a] px-1.5 py-0.5 rounded text-xs">from:</code>, <code className="bg-[#0f172a] px-1.5 py-0.5 rounded text-xs">subject:</code>, <code className="bg-[#0f172a] px-1.5 py-0.5 rounded text-xs">has:attachment</code>
            </div>
          )}
        </div>
      )}

      {/* Labels Tab */}
      {gmTab === "labels" && !loading && (
        <div className="max-w-2xl space-y-6">
          {/* Create label form */}
          <div className="bg-[#1a2332] border border-slate-700/50 rounded-xl p-5">
            <h2 className="text-lg font-semibold text-white mb-4">Create Label</h2>
            <div className="flex gap-2">
              <input type="text" placeholder="Label name" value={newLabelName} onChange={(e) => setNewLabelName(e.target.value)}
                className="flex-1 bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500" />
              <button onClick={handleCreateLabel} disabled={creatingLabel || !newLabelName.trim()}
                className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
                {creatingLabel ? "Creating..." : "Create"}
              </button>
            </div>
          </div>

          {/* Labels list */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-3">
              Labels <span className="ml-2 text-sm font-normal text-slate-400">({labels.length})</span>
            </h2>
            <div className="bg-[#1a2332] border border-slate-700/50 rounded-xl overflow-hidden">
              <div className="grid grid-cols-[1fr_auto] px-5 py-2.5 bg-[#151d2e] border-b border-slate-700/50 text-xs font-medium text-slate-400 uppercase tracking-wider">
                <span>Name</span><span>Type</span>
              </div>
              {labels.map((label) => (
                <div key={label.id} className="grid grid-cols-[1fr_auto] px-5 py-2.5 hover:bg-[#1e293b] transition-colors border-b border-slate-700/30 last:border-b-0">
                  <span className="flex items-center gap-2 text-sm">
                    <TagIcon />
                    {label.color && (
                      <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: label.color.backgroundColor, borderColor: label.color.textColor, borderWidth: 1, borderStyle: "solid" }} />
                    )}
                    <span className="text-white font-medium">{label.name}</span>
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${label.type === "system" ? "bg-slate-700 text-slate-300" : "bg-blue-500/20 text-blue-400"}`}>
                    {label.type === "system" ? "System" : "User"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
