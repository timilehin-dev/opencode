// ---------------------------------------------------------------------------
// Docs Tools
// ---------------------------------------------------------------------------
import { z, tool, zodSchema, safeJson,
  gDocsList, gDocsGet, gDocsCreate, gDocsAppendText } from "./shared";

// ---------------------------------------------------------------------------
// Docs Tools
// ---------------------------------------------------------------------------

export const docsListTool = tool({
  description: "List all Google Docs in the user's Drive.",
  inputSchema: zodSchema(z.object({})),
  execute: safeJson(async () => {
    return await gDocsList();
  }),
});

export const docsReadTool = tool({
  description: "Read the content of a Google Doc.",
  inputSchema: zodSchema(z.object({
    documentId: z.string().describe("The document ID"),
  })),
  execute: safeJson(async ({ documentId }) => {
    return await gDocsGet(documentId);
  }),
});

export const docsCreateTool = tool({
  description: "Create a new Google Doc.",
  inputSchema: zodSchema(z.object({
    title: z.string().describe("Title for the new document"),
  })),
  execute: safeJson(async ({ title }) => {
    return await gDocsCreate(title);
  }),
});

export const docsAppendTool = tool({
  description: "Append text to an existing Google Doc.",
  inputSchema: zodSchema(z.object({
    documentId: z.string().describe("The document ID"),
    text: z.string().describe("Text to append"),
  })),
  execute: safeJson(async ({ documentId, text }) => {
    return await gDocsAppendText(documentId, text);
  }),
});

