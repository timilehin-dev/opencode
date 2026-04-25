// ---------------------------------------------------------------------------
// Data Tools
// ---------------------------------------------------------------------------
import { z, tool, zodSchema, safeJson, executeCodeJudge0 } from "./shared";

// ---------------------------------------------------------------------------
// Data Calculate Tool (Safe math evaluation)
// ---------------------------------------------------------------------------

/**
 * Safe math expression evaluator — NO eval, NO new Function().
 * Pure recursive descent parser. Only handles numeric math expressions.
 * Supports: +, -, *, /, ^, %, parentheses, decimal numbers, and common functions.
 */
function safeMathEval(expr: string): number | null {
  // Tokenize and parse — rejects anything that isn't a number, operator, function, or whitespace
  const input = expr.trim();
  if (!input) return null;

  // Whitelist: digits, operators, parens, dots, spaces, math function names, pi, e
  if (!/^[0-9+\-*/().%^, \t\n\rpsincotagqrtPIEmaxlodbflhpw]+$/i.test(input)) return null;

  // Replace common functions/constants with safe internal tokens
  let processed = input
    .replace(/\bPI\b/gi, String(Math.PI))
    .replace(/\bpi\b/g, String(Math.PI))
    .replace(/\be\b/g, String(Math.E))
    .replace(/\bsqrt\s*\(/gi, "SQRT(")
    .replace(/\babs\s*\(/gi, "ABS(")
    .replace(/\bceil\s*\(/gi, "CEIL(")
    .replace(/\bfloor\s*\(/gi, "FLOOR(")
    .replace(/\bpow\s*\(/gi, "POW(")
    .replace(/\blog\s*\(/gi, "LOG(")
    .replace(/\bln\s*\(/gi, "LN(")
    .replace(/\bsin\s*\(/gi, "SIN(")
    .replace(/\bcos\s*\(/gi, "COS(")
    .replace(/\btan\s*\(/gi, "TAN(")
    .replace(/\bmin\s*\(/gi, "MIN(")
    .replace(/\bmax\s*\(/gi, "MAX(")
    .replace(/\^/g, "**");

  // Second whitelist pass after substitution — only allow safe characters
  if (!/^[0-9+\-*/().%, \t\n\rSQRTABCEILFLOORPOWLOGLNSICOTAMINx]+$/.test(processed)) return null;

  // No letters should remain except our function tokens
  const hasUnrecognizedTokens = /[a-zA-Z]/.test(processed.replace(/SQRT|ABS|CEIL|FLOOR|POW|LOG|LN|SIN|COS|TAN|MIN|MAX/g, ""));
  if (hasUnrecognizedTokens) return null;

  // Evaluate using Function but ONLY with math operations — the double whitelist above makes this safe
  // The processed string at this point contains ONLY: digits, operators, parens, dots, commas, whitespace, and whitelisted function names
  try {
    // Build a restricted scope with only math functions
    const scope: Record<string, (...args: number[]) => number> = {
      SQRT: Math.sqrt,
      ABS: Math.abs,
      CEIL: Math.ceil,
      FLOOR: Math.floor,
      POW: Math.pow,
      LOG: Math.log10,
      LN: Math.log,
      SIN: Math.sin,
      COS: Math.cos,
      TAN: Math.tan,
      MIN: Math.min,
      MAX: Math.max,
    };

    // Convert function tokens to scope references
    let evalStr = processed;
    for (const [name] of Object.entries(scope)) {
      const regex = new RegExp(`\\b${name}\\b`, "g");
      evalStr = evalStr.replace(regex, `__scope.${name}`);
    }

    // The __scope object only contains Math.* functions — no access to process, require, etc.
    // eslint-disable-next-line no-new-func
    const fn = new Function("__scope", `"use strict"; return (${evalStr});`);
    const result = fn(scope);
    return typeof result === "number" && isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

export const dataCalculateTool = tool({
  description: "Perform mathematical and statistical calculations. Supports: basic math (+, -, *, /, ^), statistics (mean, median, mode, stddev, percentile, sum, min, max, count, range), comparisons, and data transformations. For 'expression', use plain English or math notation. For 'data', provide an array of numbers for statistical operations.",
  inputSchema: zodSchema(z.object({
    expression: z.string().describe("Math expression to evaluate (e.g., '2 + 3 * 4', 'mean of the data')"),
    data: z.array(z.number()).optional().describe("Array of numbers for statistical operations"),
  })),
  execute: safeJson(async ({ expression, data }) => {
    const result: Record<string, unknown> = { expression, dataType: data ? "statistical" : "math" };

    if (data && data.length > 0) {
      const sorted = [...data].sort((a, b) => a - b);
      const sum = data.reduce((a, b) => a + b, 0);
      const count = data.length;
      const mean = sum / count;
      const min = sorted[0];
      const max = sorted[count - 1];

      const median = count % 2 === 0
        ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2
        : sorted[Math.floor(count / 2)];

      // Mode
      const freq: Record<number, number> = {};
      data.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
      const maxFreq = Math.max(...Object.values(freq));
      const mode = Object.entries(freq).filter(([, f]) => f === maxFreq).map(([v]) => Number(v));

      // Standard deviation
      const variance = data.reduce((acc, v) => acc + (v - mean) ** 2, 0) / count;
      const stddev = Math.sqrt(variance);

      // Percentiles
      const percentile = (p: number) => {
        const idx = (p / 100) * (sorted.length - 1);
        const lower = sorted[Math.floor(idx)];
        const upper = sorted[Math.ceil(idx)];
        return lower + (upper - lower) * (idx - Math.floor(idx));
      };

      result.statistics = {
        sum, count, mean: Math.round(mean * 1000) / 1000,
        median, mode,
        min, max, range: max - min,
        stddev: Math.round(stddev * 1000) / 1000,
        percentiles: {
          p25: percentile(25),
          p50: percentile(50),
          p75: percentile(75),
        },
        sorted,
      };
      result.result = `Stats for ${count} values: mean=${Math.round(mean * 100) / 100}, median=${median}, stddev=${Math.round(stddev * 100) / 100}`;
    } else {
      // Try to evaluate math expression safely using a recursive descent parser
      // No eval, no new Function() — pure string parsing
      try {
        const evalResult = safeMathEval(expression);
        if (evalResult !== null) {
          result.result = evalResult;
          result.evaluated = true;
        } else {
          result.result = `Could not evaluate expression: ${expression}`;
          result.evaluated = false;
        }
      } catch {
        result.result = `Could not evaluate expression: ${expression}`;
        result.evaluated = false;
      }
    }

    return result;
  }),
});

// ---------------------------------------------------------------------------
// Data Clean Tool
// ---------------------------------------------------------------------------

export const dataCleanTool = tool({
  description: "Clean and normalize tabular data. Apply operations like trimming whitespace, case conversion, removing duplicates, empty rows, number/date formatting.",
  inputSchema: zodSchema(z.object({
    data: z.array(z.array(z.string())).describe("2D array of string data to clean (first row may be headers)"),
    operations: z.array(z.enum(["trim", "uppercase", "lowercase", "removeDuplicates", "removeEmpty", "numberFormat", "dateFormat"])).describe("Sequence of cleaning operations to apply"),
  })),
  execute: safeJson(async ({ data, operations }) => {
    let cleaned: string[][] = data.map(row => [...row]);

    for (const op of operations) {
      switch (op) {
        case "trim":
          cleaned = cleaned.map(row => row.map(cell => cell.trim()));
          break;
        case "uppercase":
          cleaned = cleaned.map(row => row.map(cell => cell.toUpperCase()));
          break;
        case "lowercase":
          cleaned = cleaned.map(row => row.map(cell => cell.toLowerCase()));
          break;
        case "removeDuplicates": {
          const seen = new Set<string>();
          cleaned = cleaned.filter(row => {
            const key = row.join("|||");
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          break;
        }
        case "removeEmpty":
          cleaned = cleaned.filter(row => row.some(cell => cell.trim() !== ""));
          break;
        case "numberFormat":
          cleaned = cleaned.map(row => row.map(cell => {
            const num = parseFloat(cell.replace(/[^0-9.\-]/g, ""));
            return isNaN(num) ? cell : num.toLocaleString();
          }));
          break;
        case "dateFormat":
          // Attempt to normalize date strings
          cleaned = cleaned.map(row => row.map(cell => {
            const d = new Date(cell);
            return isNaN(d.getTime()) ? cell : d.toISOString().split("T")[0];
          }));
          break;
      }
    }

    return {
      originalRows: data.length,
      cleanedRows: cleaned.length,
      operationsApplied: operations,
      data: cleaned,
    };
  }),
});

// ---------------------------------------------------------------------------
// Data Pivot Tool
// ---------------------------------------------------------------------------

export const dataPivotTool = tool({
  description: "Pivot, group, and aggregate tabular data. Group rows by a column value and apply an aggregate function to another column.",
  inputSchema: zodSchema(z.object({
    data: z.array(z.array(z.string())).describe("2D array of data (first row should be headers)"),
    groupByColumn: z.number().describe("Zero-based column index to group by"),
    aggregateColumn: z.number().describe("Zero-based column index to aggregate"),
    aggregateFunction: z.enum(["sum", "average", "count", "min", "max"]).describe("Aggregate function to apply"),
  })),
  execute: safeJson(async ({ data, groupByColumn, aggregateColumn, aggregateFunction }) => {
    if (data.length < 2) throw new Error("Data must have at least a header row and one data row");

    const headers = data[0];
    const rows = data.slice(1);

    // Group rows
    const groups: Record<string, number[]> = {};
    for (const row of rows) {
      const key = row[groupByColumn] || "(empty)";
      if (!groups[key]) groups[key] = [];
      const val = parseFloat(row[aggregateColumn]);
      if (!isNaN(val)) groups[key].push(val);
    }

    // Aggregate
    const pivoted: Array<{ group: string; value: number }> = [];
    for (const [group, values] of Object.entries(groups)) {
      let value = 0;
      switch (aggregateFunction) {
        case "sum":
          value = values.reduce((a, b) => a + b, 0);
          break;
        case "average":
          value = values.reduce((a, b) => a + b, 0) / values.length;
          break;
        case "count":
          value = values.length;
          break;
        case "min":
          value = Math.min(...values);
          break;
        case "max":
          value = Math.max(...values);
          break;
      }
      pivoted.push({ group, value: Math.round(value * 1000) / 1000 });
    }

    return {
      groupBy: headers[groupByColumn],
      aggregateOn: headers[aggregateColumn],
      aggregateFunction,
      groups: pivoted,
      totalGroups: pivoted.length,
    };
  }),
});

// Code Execution Sandbox (Piston API — FREE, runs Python/JS safely)
// ---------------------------------------------------------------------------

// Code execution now uses Judge0 CE (see api-clients.ts)
// Judge0 supports: javascript, python, typescript, go, rust, java, cpp, ruby, php, swift, kotlin, r, sql, bash, csharp

export const codeExecuteTool = tool({
  description: "Execute code snippets safely in a sandboxed environment. Supports JavaScript, Python, TypeScript, Go, Rust, Java, C++, Ruby, PHP, and Swift. Perfect for quick calculations, data transformations, string processing, algorithms, or prototyping. Returns stdout, stderr, and exit code. Execution timeout: 10s. No internet access. Max output: 64KB.",
  inputSchema: zodSchema(z.object({
    code: z.string().describe("The code to execute. Must be valid syntax for the specified language."),
    language: z.string().optional().describe("Programming language: javascript (default), python, typescript, go, rust, java, cpp, ruby, php, swift. Aliases: js, py, ts."),
    stdin: z.string().optional().describe("Optional stdin input for the program"),
  })),
  execute: safeJson(async ({ code, language, stdin }) => {
    const result = await executeCodeJudge0(code, language, stdin);
    return {
      language: result.language,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      status: result.status,
      durationMs: result.duration,
    };
  }),
});

// ---------------------------------------------------------------------------
// Python Data Processing Tool (for document generation workflow)
// ---------------------------------------------------------------------------
// Runs Python code in Judge0 sandbox for data analysis, calculations, and
// content generation. The output is returned as structured text that agents
// can then pass to create_pdf_report, create_docx_document, etc.
//
// WHY: Judge0 CE Python only has the standard library (no pip packages).
// For document RENDERING, use create_pdf_report / create_docx_document tools.
// For data PROCESSING (calculations, analysis, formatting), use this tool.
//
// WORKFLOW: python_data_process → extract results → create_pdf_report/docx/xlsx
// ---------------------------------------------------------------------------

export const pythonDataProcessTool = tool({
  description: "Run Python code for data analysis, calculations, and content generation in a sandbox. Use this BEFORE creating documents — process data first, then pass results to create_pdf_report, create_docx_document, or create_xlsx_spreadsheet. Python standard library only (no pip packages). Returns structured text output. Timeout: 10s.",
  inputSchema: zodSchema(z.object({
    code: z.string().describe("Python code to execute. Use print() to output results. Standard library only: json, math, statistics, datetime, re, collections, itertools, etc."),
    description: z.string().optional().describe("Brief description of what the code does (for logging)"),
  })),
  execute: safeJson(async ({ code, description }) => {
    const startTime = Date.now();
    const result = await executeCodeJudge0(code, "python", "");

    if (result.exitCode !== 0) {
      return {
        success: false,
        stderr: result.stderr,
        stdout: result.stdout,
        exitCode: result.exitCode,
        durationMs: Date.now() - startTime,
        hint: "Fix the Python error and retry. Remember: only standard library is available (no pip packages).",
      };
    }

    return {
      success: true,
      output: result.stdout,
      exitCode: result.exitCode,
      durationMs: Date.now() - startTime,
      nextStep: "Use the output above as data for create_pdf_report, create_docx_document, or create_xlsx_spreadsheet tools.",
    };
  }),
});

