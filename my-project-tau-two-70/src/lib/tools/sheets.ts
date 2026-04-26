// ---------------------------------------------------------------------------
// Sheets Tools
// ---------------------------------------------------------------------------
import { z, tool, zodSchema, safeJson, safeParseRes, googleFetch,
  gSheetsGet, gSheetsGetValues, gSheetsBatchGetValues, gSheetsAppendValues, gSheetsUpdateValues, gSheetsCreate, gSheetsAddSheet } from "./shared";

// ---------------------------------------------------------------------------
// Sheets Tools
// ---------------------------------------------------------------------------

export const sheetsReadTool = tool({
  description: "Read spreadsheet metadata and content.",
  inputSchema: zodSchema(z.object({
    spreadsheetId: z.string().describe("The spreadsheet ID"),
    ranges: z.string().optional().describe("Range(s) to read (e.g., 'Sheet1!A1:B10')"),
  })),
  execute: safeJson(async ({ spreadsheetId, ranges }) => {
    return await gSheetsGet(spreadsheetId, ranges);
  }),
});

export const sheetsValuesTool = tool({
  description: "Get cell values from a spreadsheet range.",
  inputSchema: zodSchema(z.object({
    spreadsheetId: z.string().describe("The spreadsheet ID"),
    range: z.string().describe("Range to read (e.g., 'Sheet1!A1:B10')"),
  })),
  execute: safeJson(async ({ spreadsheetId, range }) => {
    return await gSheetsGetValues(spreadsheetId, range);
  }),
});

export const sheetsAppendTool = tool({
  description: "Append rows of data to a spreadsheet.",
  inputSchema: zodSchema(z.object({
    spreadsheetId: z.string().describe("The spreadsheet ID"),
    range: z.string().describe("Target range (e.g., 'Sheet1!A1')"),
    values: z.array(z.array(z.string())).describe("2D array of values to append (each inner array is a row)"),
  })),
  execute: safeJson(async ({ spreadsheetId, range, values }) => {
    return await gSheetsAppendValues(spreadsheetId, range, values);
  }),
});

export const sheetsUpdateTool = tool({
  description: "Update cell values in a spreadsheet range.",
  inputSchema: zodSchema(z.object({
    spreadsheetId: z.string().describe("The spreadsheet ID"),
    range: z.string().describe("Range to update (e.g., 'Sheet1!A1:B5')"),
    values: z.array(z.array(z.string())).describe("2D array of new values"),
  })),
  execute: safeJson(async ({ spreadsheetId, range, values }) => {
    return await gSheetsUpdateValues(spreadsheetId, range, values);
  }),
});

export const sheetsCreateTool = tool({
  description: "Create a new Google Spreadsheet.",
  inputSchema: zodSchema(z.object({
    title: z.string().describe("Title for the new spreadsheet"),
  })),
  execute: safeJson(async ({ title }) => {
    return await gSheetsCreate(title);
  }),
});

export const sheetsAddSheetTool = tool({
  description: "Add a new sheet tab to an existing spreadsheet.",
  inputSchema: zodSchema(z.object({
    spreadsheetId: z.string().describe("The spreadsheet ID"),
    sheetName: z.string().describe("Name for the new sheet tab"),
  })),
  execute: safeJson(async ({ spreadsheetId, sheetName }) => {
    return await gSheetsAddSheet(spreadsheetId, sheetName);
  }),
});

// ---------------------------------------------------------------------------
// Sheets Batch Get Tool
// ---------------------------------------------------------------------------

export const sheetsBatchGetTool = tool({
  description: "Batch read values from multiple ranges in a Google Spreadsheet in a single API call.",
  inputSchema: zodSchema(z.object({
    spreadsheetId: z.string().describe("The spreadsheet ID"),
    ranges: z.array(z.string()).describe("Array of ranges to read (e.g., ['Sheet1!A1:B10', 'Sheet2!A1:A5'])"),
  })),
  execute: safeJson(async ({ spreadsheetId, ranges }) => {
    return await gSheetsBatchGetValues(spreadsheetId, ranges);
  }),
});

// ---------------------------------------------------------------------------
// Sheets Clear Tool
// ---------------------------------------------------------------------------

export const sheetsClearTool = tool({
  description: "Clear all values from a range in a Google Spreadsheet.",
  inputSchema: zodSchema(z.object({
    spreadsheetId: z.string().describe("The spreadsheet ID"),
    range: z.string().describe("Range to clear (e.g., 'Sheet1!A1:B10')"),
  })),
  execute: safeJson(async ({ spreadsheetId, range }) => {
    const res = await googleFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`,
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    );
    return safeParseRes(res);
  }),
});

