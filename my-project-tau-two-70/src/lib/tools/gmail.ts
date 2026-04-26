// ---------------------------------------------------------------------------
// Gmail Tools
// ---------------------------------------------------------------------------
import { z, tool, zodSchema, safeJson, safeParseRes, googleFetch, plainTextToHtml, safeJsonParse,
  gGmailSendEmail, gGmailFetchEmails, gGmailListLabels, gGmailCreateLabel, gGmailDeleteLabel, gGmailProfile } from "./shared";

// ---------------------------------------------------------------------------
// Gmail Tools
// ---------------------------------------------------------------------------

export const gmailSendTool = tool({
  description: "Send an email via Gmail. Use this when the user wants to compose and send an email message.",
  inputSchema: zodSchema(z.object({
    to: z.string().describe("Recipient email address"),
    subject: z.string().optional().describe("Email subject line"),
    body: z.string().describe("Email body content (plain text or HTML)"),
    isHtml: z.boolean().optional().describe("Whether the body is HTML format (default: false)"),
  })),
  execute: safeJson(async ({ to, subject, body, isHtml }) => {
    return await gGmailSendEmail({ to, subject, body, isHtml });
  }),
});

export const gmailFetchTool = tool({
  description: "Fetch/search emails from Gmail inbox. Supports full Gmail search syntax (e.g., 'is:unread', 'from:someone@example.com', 'subject:urgent').",
  inputSchema: zodSchema(z.object({
    query: z.string().optional().describe("Gmail search query (e.g., 'is:unread', 'from:someone@example.com', 'subject:urgent')"),
    maxResults: z.number().optional().describe("Max number of emails to fetch (default: 10)"),
    labelIds: z.array(z.string()).optional().describe("Filter by label IDs (e.g., ['INBOX', 'UNREAD'])"),
  })),
  execute: safeJson(async ({ query, maxResults, labelIds }) => {
    return await gGmailFetchEmails({ query, maxResults: maxResults || 10, labelIds });
  }),
});



export const gmailLabelsTool = tool({
  description: "List all Gmail labels (both system and user-created).",
  inputSchema: zodSchema(z.object({})),
  execute: safeJson(async () => {
    return await gGmailListLabels();
  }),
});

export const gmailCreateLabelTool = tool({
  description: "Create a new Gmail label.",
  inputSchema: zodSchema(z.object({
    name: z.string().describe("Name for the new label"),
  })),
  execute: safeJson(async ({ name }) => {
    return await gGmailCreateLabel(name);
  }),
});

export const gmailDeleteLabelTool = tool({
  description: "Delete a Gmail label by its ID.",
  inputSchema: zodSchema(z.object({
    labelId: z.string().describe("The ID of the label to delete"),
  })),
  execute: safeJson(async ({ labelId }) => {
    await gGmailDeleteLabel(labelId);
    return { deleted: true, labelId };
  }),
});

export const gmailProfileTool = tool({
  description: "Get the current Gmail profile (email address, message count, thread count).",
  inputSchema: zodSchema(z.object({})),
  execute: safeJson(async () => {
    return await gGmailProfile();
  }),
});

// ---------------------------------------------------------------------------
// Gmail Reply Tool
// ---------------------------------------------------------------------------

export const gmailReplyTool = tool({
  description: "Reply to an existing email thread. Fetches the thread's last message to set proper In-Reply-To and References headers for proper threading.",
  inputSchema: zodSchema(z.object({
    threadId: z.string().describe("The Gmail thread ID to reply to"),
    to: z.string().describe("Recipient email address"),
    body: z.string().describe("Reply body content (plain text or HTML)"),
    subject: z.string().optional().describe("Override subject line (default: same as thread)"),
    isHtml: z.boolean().optional().describe("Whether the body is HTML format (default: false)"),
    cc: z.array(z.string()).optional().describe("CC recipients"),
    bcc: z.array(z.string()).optional().describe("BCC recipients"),
  })),
  execute: safeJson(async ({ threadId, to, body, subject, isHtml, cc, bcc }) => {
    // Fetch the thread to get the last message's Message-ID
    const threadRes = await googleFetch(
      `https://www.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata&metadataHeaders=Message-Id&metadataHeaders=References&metadataHeaders=Subject`,
    );
    const threadData = (await threadRes.json()) as { messages?: Array<{ payload?: { headers?: Array<{ name: string; value: string }> } }> };
    const lastMsg = threadData.messages?.[threadData.messages.length - 1];
    const headers = lastMsg?.payload?.headers || [];
    const getHeader = (name: string) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || "";
    const originalMessageId = getHeader("Message-Id");
    const originalReferences = getHeader("References");

    // Build RFC 2822 reply message
    const sanitizeHeader = (s: string) => s.replace(/[\r\n]/g, "");
    let message = "";
    message += `To: ${sanitizeHeader(to)}\r\n`;
    if (cc?.length) message += `Cc: ${cc.map(sanitizeHeader).join(", ")}\r\n`;
    if (bcc?.length) message += `Bcc: ${bcc.map(sanitizeHeader).join(", ")}\r\n`;
    message += `Subject: ${sanitizeHeader(subject || getHeader("Subject") || "")}\r\n`;
    message += "Content-Type: text/html; charset=utf-8\r\n";
    message += "MIME-Version: 1.0\r\n";
    if (originalMessageId) message += `In-Reply-To: ${originalMessageId}\r\n`;
    if (originalMessageId) message += `References: ${originalReferences ? originalReferences + " " : ""}${originalMessageId}\r\n`;
    message += "\r\n";
    message += isHtml ? body : plainTextToHtml(body);

    const encoded = Buffer.from(message).toString("base64url");
    const res = await googleFetch("https://www.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      body: JSON.stringify({ raw: encoded, threadId }),
    });
    return safeParseRes(res);
  }),
});

// ---------------------------------------------------------------------------
// Gmail Thread Tool
// ---------------------------------------------------------------------------

export const gmailThreadTool = tool({
  description: "Get the full conversation thread for a Gmail thread. Returns all messages in the thread with headers (from, to, subject, date) and content.",
  inputSchema: zodSchema(z.object({
    threadId: z.string().describe("The Gmail thread ID"),
  })),
  execute: safeJson(async ({ threadId }) => {
    const res = await googleFetch(
      `https://www.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`,
    );
    const data = await safeJsonParse(res) as {
      id: string;
      messages?: Array<{
        id: string;
        threadId: string;
        payload?: {
          headers?: Array<{ name: string; value: string }>;
          mimeType?: string;
          parts?: Array<{ body?: { data: string }; mimeType?: string }>;
          body?: { data: string };
        };
      }>;
    };

    const messages = (data.messages || []).map(msg => {
      const headers = msg.payload?.headers || [];
      const get = (name: string) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || "";
      // Extract body content
      let content = "";
      if (msg.payload?.body?.data) {
        content = Buffer.from(msg.payload.body.data, "base64url").toString("utf-8");
      } else if (msg.payload?.parts) {
        for (const part of msg.payload.parts) {
          if (part.mimeType === "text/plain" && part.body?.data) {
            content = Buffer.from(part.body.data, "base64url").toString("utf-8");
            break;
          }
          if (part.mimeType === "text/html" && part.body?.data) {
            content = Buffer.from(part.body.data, "base64url").toString("utf-8");
          }
        }
      }
      // Strip control characters (except \n \r \t) to prevent JSON serialization issues
      content = content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
      return {
        id: msg.id,
        from: get("From"),
        to: get("To"),
        subject: get("Subject"),
        date: get("Date"),
        contentType: msg.payload?.mimeType,
        content: content.slice(0, 5000), // Truncate very long messages
      };
    });

    return { threadId: data.id, messageCount: messages.length, messages };
  }),
});

// ---------------------------------------------------------------------------
// Gmail Batch Tool
// ---------------------------------------------------------------------------

export const gmailBatchTool = tool({
  description: "Perform batch operations on multiple Gmail messages at once: trash, delete, mark as read, add or remove labels.",
  inputSchema: zodSchema(z.object({
    action: z.enum(["trash", "delete", "markRead", "addLabel", "removeLabel"]).describe("The batch action to perform"),
    messageIds: z.array(z.string()).describe("Array of Gmail message IDs to operate on"),
    labelId: z.string().optional().describe("Label ID (required for addLabel and removeLabel actions)"),
  })),
  execute: safeJson(async ({ action, messageIds, labelId }) => {
    const addLabelIds: string[] = [];
    const removeLabelIds: string[] = [];

    switch (action) {
      case "trash":
        addLabelIds.push("TRASH");
        removeLabelIds.push("INBOX");
        break;
      case "delete":
        // Permanently delete: first trash, then use individual DELETE calls
        // Gmail batchModify can only trash, not permanently delete.
        // We use batchModify to trash first, then per-message DELETE.
        {
          const trashRes = await googleFetch(
            "https://www.googleapis.com/gmail/v1/users/me/messages/batchModify",
            {
              method: "POST",
              body: JSON.stringify({ ids: messageIds, addLabelIds: ["TRASH"], removeLabelIds: ["INBOX"] }),
            },
          );
          // Now permanently delete each message from trash
          let deletedCount = 0;
          let failCount = 0;
          for (const msgId of messageIds) {
            try {
              await googleFetch(
                `https://www.googleapis.com/gmail/v1/users/me/messages/${msgId}`,
                { method: "DELETE" },
              );
              deletedCount++;
            } catch {
              failCount++;
            }
          }
          return { success: true, action: "delete", totalMessages: messageIds.length, permanentlyDeleted: deletedCount, failed: failCount };
        }
      case "markRead":
        removeLabelIds.push("UNREAD");
        break;
      case "addLabel":
        if (!labelId) throw new Error("labelId is required for addLabel action");
        addLabelIds.push(labelId);
        break;
      case "removeLabel":
        if (!labelId) throw new Error("labelId is required for removeLabel action");
        removeLabelIds.push(labelId);
        break;
    }

    const res = await googleFetch(
      "https://www.googleapis.com/gmail/v1/users/me/messages/batchModify",
      {
        method: "POST",
        body: JSON.stringify({ ids: messageIds, addLabelIds, removeLabelIds }),
      },
    );
    return { success: true, action, messageIdsProcessed: messageIds.length };
  }),
});

// Gmail Send with Attachments Tool
// ---------------------------------------------------------------------------

export const gmailSendWithAttachmentTool = tool({
  description: "Send an email via Gmail with file attachments (PDF, DOCX, XLSX, images, etc.). Provide attachment data as base64-encoded content. This is the recommended tool when you need to send documents, reports, or files via email.",
  inputSchema: zodSchema(z.object({
    to: z.string().describe("Recipient email address"),
    subject: z.string().optional().describe("Email subject line"),
    body: z.string().describe("Email body content (plain text or HTML)"),
    isHtml: z.boolean().optional().describe("Whether the body is HTML format (default: true)"),
    attachments: z.array(z.object({
      filename: z.string().describe("Attachment filename with extension (e.g., 'report.pdf')"),
      contentBase64: z.string().describe("Base64-encoded file content"),
      mimeType: z.string().optional().describe("MIME type (auto-detected from filename if not provided)"),
    })).optional().describe("Array of file attachments"),
    cc: z.array(z.string()).optional().describe("CC recipients"),
    bcc: z.array(z.string()).optional().describe("BCC recipients"),
  })),
  execute: safeJson(async ({ to, subject, body, isHtml, attachments, cc, bcc }) => {
    // Build MIME multipart message with attachments
    const boundary = "klaw-boundary-" + Date.now();
    const sanitize = (s: string) => s.replace(/[\r\n]/g, "");

    let message = "";
    message += `To: ${sanitize(to)}\r\n`;
    if (cc?.length) message += `Cc: ${cc.map(sanitize).join(", ")}\r\n`;
    if (bcc?.length) message += `Bcc: ${bcc.map(sanitize).join(", ")}\r\n`;
    if (subject) message += `Subject: ${sanitize(subject)}\r\n`;

    if (attachments && attachments.length > 0) {
      // MIME multipart with attachments
      message += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n`;
      message += "MIME-Version: 1.0\r\n\r\n";

      // Text body part
      const htmlBody = isHtml ? body : plainTextToHtml(body);
      message += `--${boundary}\r\n`;
      message += "Content-Type: text/html; charset=utf-8\r\n\r\n";
      message += htmlBody + "\r\n\r\n";

      // Attachment parts
      for (const att of attachments) {
        const ext = att.filename.split(".").pop()?.toLowerCase() || "";
        const mimeMap: Record<string, string> = {
          pdf: "application/pdf",
          docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          csv: "text/csv",
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          txt: "text/plain",
        };
        const mime = att.mimeType || mimeMap[ext] || "application/octet-stream";

        message += `--${boundary}\r\n`;
        message += `Content-Type: ${mime}\r\n`;
        message += `Content-Disposition: attachment; filename="${att.filename}"\r\n`;
        message += "Content-Transfer-Encoding: base64\r\n\r\n";
        message += att.contentBase64 + "\r\n\r\n";
      }

      message += `--${boundary}--\r\n`;
    } else {
      // No attachments — simple HTML email
      const htmlBody = isHtml ? body : plainTextToHtml(body);
      message += "Content-Type: text/html; charset=utf-8\r\n";
      message += "MIME-Version: 1.0\r\n\r\n";
      message += htmlBody;
    }

    const encoded = Buffer.from(message).toString("base64url");
    const res = await googleFetch("https://www.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      body: JSON.stringify({ raw: encoded }),
    });
    const data = await safeParseRes(res);
    return { success: true, messageId: (data as { id?: string }).id, attachments: attachments?.length || 0 };
  }),
});

