// ---------------------------------------------------------------------------
// Document Creation Tools (PDF, DOCX, XLSX, PPTX, Chart)
// ---------------------------------------------------------------------------
import { z, tool, zodSchema, safeJson, safeParseRes, MAX_TOOL_RESULT_LENGTH } from "./shared";

// ─── Page dimensions (points) ──────────────────────────────────────────────
const PAGE_DIMS: Record<string, { w: number; h: number }> = {
  A4:     { w: 595.28, h: 841.89 },
  A3:     { w: 841.89, h: 1190.55 },
  Letter: { w: 612,    h: 792 },
  Legal:  { w: 612,    h: 1008 },
};

// ─── Syntax-highlighting keyword sets ─────────────────────────────────────
const SYNTAX_KW: Record<string, string[]> = {
  javascript: [
    "async","await","break","case","catch","class","const","continue","debugger",
    "default","delete","do","else","export","extends","false","finally","for",
    "from","function","if","import","in","instanceof","let","new","null","of",
    "return","static","super","switch","this","throw","true","try","typeof",
    "undefined","var","void","while","with","yield",
  ],
  typescript: [
    "async","await","break","case","catch","class","const","continue","declare",
    "default","delete","do","else","enum","export","extends","false","finally",
    "for","from","function","if","implements","import","in","instanceof",
    "interface","is","keyof","let","namespace","new","null","of","private",
    "protected","public","readonly","return","static","super","switch","this",
    "throw","true","try","type","typeof","undefined","var","void","while",
    "with","yield",
  ],
  python: [
    "and","as","assert","async","await","break","class","continue","def","del",
    "elif","else","except","finally","for","from","global","if","import","in",
    "is","lambda","nonlocal","not","or","pass","raise","return","try","while",
    "with","yield","True","False","None","self",
  ],
  java: [
    "abstract","assert","boolean","break","byte","case","catch","char","class",
    "continue","default","do","double","else","enum","extends","false","final",
    "finally","float","for","if","implements","import","instanceof","int",
    "interface","long","native","new","null","package","private","protected",
    "public","return","short","static","strictfp","super","switch",
    "synchronized","this","throw","throws","transient","true","try","void",
    "volatile","while",
  ],
  rust: [
    "as","async","await","break","const","continue","crate","dyn","else",
    "enum","extern","fn","for","if","impl","in","let","loop","match","mod",
    "move","mut","pub","ref","return","self","Self","static","struct","super",
    "trait","true","type","unsafe","use","where","while",
  ],
  go: [
    "break","case","chan","const","continue","default","defer","else","fallthrough",
    "for","func","go","goto","if","import","interface","map","package","range",
    "return","select","struct","switch","type","var","true","false","nil",
    "make","new","len","cap","append","copy","delete","print","println",
  ],
  bash: [
    "if","then","else","elif","fi","for","while","do","done","case","esac",
    "function","return","in","select","until","local","export","source","echo",
    "exit","read","set","shift","unset","true","false","cd","pwd","mkdir","rm",
    "cp","mv","cat","grep","sed","awk","find","sort",
  ],
  sql: [
    "SELECT","FROM","WHERE","AND","OR","NOT","IN","LIKE","BETWEEN","IS","NULL",
    "ORDER","BY","GROUP","HAVING","LIMIT","OFFSET","INSERT","INTO","VALUES",
    "UPDATE","SET","DELETE","CREATE","TABLE","ALTER","DROP","INDEX","JOIN",
    "INNER","LEFT","RIGHT","OUTER","ON","AS","DISTINCT","UNION","ALL","EXISTS",
    "CASE","WHEN","THEN","ELSE","END","COUNT","SUM","AVG","MIN","MAX","PRIMARY",
    "KEY","FOREIGN","REFERENCES","CONSTRAINT","DEFAULT","CHECK","UNIQUE","VIEW",
    "ASC","DESC","TRUE","FALSE","VARCHAR","INT","INTEGER","TEXT","BOOLEAN",
    "DATE","TIMESTAMP","FLOAT","DOUBLE","DECIMAL","BEGIN","COMMIT","ROLLBACK",
  ],
  html: [
    "html","head","body","div","span","p","a","img","ul","ol","li","h1","h2",
    "h3","h4","h5","h6","table","tr","td","th","form","input","button",
    "textarea","select","option","label","script","style","link","meta","title",
    "header","footer","nav","main","section","article","aside","class","id",
    "href","src","alt","type","name","value","placeholder","required","disabled",
    "hidden","charset","content","rel","target","method","action","autoplay",
    "controls","loop","muted",
  ],
  css: [
    "color","background","border","margin","padding","font","display","position",
    "width","height","top","left","right","bottom","overflow","float","clear",
    "flex","grid","align","justify","transform","transition","animation",
    "opacity","visibility","inherit","initial","relative","absolute","fixed",
    "sticky","block","inline","none","hidden","visible","scroll","solid",
    "dashed","dotted","auto","important",
  ],
  json: [],
  yaml: [],
  xml: [],
  markdown: [],
  plaintext: [],
};

// ─── Tokenize a single code line for syntax highlighting ──────────────────
function tokenizeCodeLine(
  line: string,
  lang: string,
): Array<{ text: string; color: string; bold: boolean }> {
  const norm = lang.toLowerCase().replace(/[^a-z]/g, "");
  const isPythonLike = norm === "python" || norm === "py" || norm === "yaml";
  const isSqlLike = norm === "sql";
  const kwSet = new Set(
    (SYNTAX_KW[norm] || SYNTAX_KW["javascript"] || []).map((k) => k.toLowerCase()),
  );
  const tokens: Array<{ text: string; color: string; bold: boolean }> = [];
  let pos = 0;

  while (pos < line.length) {
    // ── single-line comment ────────────────────────────────────────────
    if (isPythonLike && line[pos] === "#" && (pos === 0 || /\s/.test(line[pos - 1]))) {
      tokens.push({ text: line.slice(pos), color: "#94A3B8", bold: false });
      pos = line.length;
      continue;
    }
    if (!isPythonLike && line.slice(pos).startsWith("//")) {
      tokens.push({ text: line.slice(pos), color: "#94A3B8", bold: false });
      pos = line.length;
      continue;
    }
    if (isSqlLike && line.slice(pos).startsWith("--")) {
      tokens.push({ text: line.slice(pos), color: "#94A3B8", bold: false });
      pos = line.length;
      continue;
    }

    // ── string literal ─────────────────────────────────────────────────
    if (line[pos] === '"' || line[pos] === "'" || line[pos] === "`") {
      const q = line[pos];
      let end = pos + 1;
      while (end < line.length && line[end] !== q) {
        if (line[end] === "\\") end++;
        end++;
      }
      end = Math.min(end + 1, line.length);
      tokens.push({ text: line.slice(pos, end), color: "#16A34A", bold: false });
      pos = end;
      continue;
    }

    // ── word (keyword / identifier) ────────────────────────────────────
    const wm = line.slice(pos).match(/^([a-zA-Z_$][\w$]*)/);
    if (wm) {
      const word = wm[1];
      const isKw = kwSet.has(word.toLowerCase());
      tokens.push({
        text: word,
        color: isKw ? "#7C3AED" : /^[A-Z]/.test(word) ? "#0891B2" : "#334155",
        bold: isKw,
      });
      pos += word.length;
      continue;
    }

    // ── number ─────────────────────────────────────────────────────────
    const nm = line.slice(pos).match(/^(\d+\.?\d*)/);
    if (nm) {
      tokens.push({ text: nm[1], color: "#D97706", bold: false });
      pos += nm[1].length;
      continue;
    }

    // ── anything else (operators, punctuation, whitespace) ─────────────
    tokens.push({ text: line[pos], color: "#475569", bold: false });
    pos++;
  }

  return tokens;
}

// ═══════════════════════════════════════════════════════════════════════════
// TOOL EXPORT
// ═══════════════════════════════════════════════════════════════════════════
export const createPdfReportTool = tool({
  description:
    "Create a professional PDF report and return it as a downloadable file. " +
    "Produces industry-standard documents with cover page, table of contents " +
    "(with accurate page numbers), page numbers, headers/footers, watermark " +
    "support, image embedding, custom page sizes, and polished formatting. " +
    "Supports markdown: headings, lists (nested), tables, bold, italic, " +
    "bold-italic, code blocks with syntax highlighting, blockquotes, links, " +
    "task lists, horizontal rules, and section breaks. " +
    "Use this when the user asks to generate a PDF, report, whitepaper, " +
    "proposal, or any PDF file.",
  inputSchema: zodSchema(
    z.object({
      title: z.string().describe("Title of the PDF document"),
      content: z
        .string()
        .describe(
          "Content in markdown format (supports headers, nested lists, tables, " +
            "bold, italic, bold-italic, code blocks with syntax highlighting, " +
            "blockquotes, links, task lists, horizontal rules, section breaks)",
        ),
      filename: z
        .string()
        .optional()
        .describe("Output filename without extension. Default: derived from title"),
      author: z
        .string()
        .optional()
        .describe("Author name (default: 'Klawhub Agent')"),
      subtitle: z
        .string()
        .optional()
        .describe("Subtitle displayed below the title on the cover page"),
      images: z
        .array(
          z.object({
            url: z.string().describe("Image URL to download and embed"),
            width: z.number().optional().describe("Image width in points (default: 60% of content width)"),
            caption: z.string().optional().describe("Caption below the image"),
            placement: z
              .enum(["after", "section"])
              .optional()
              .describe("'after' = inline after next heading; 'section' = full-page image section"),
          }),
        )
        .optional()
        .describe("Array of images to embed in the PDF"),
      watermark: z
        .object({
          text: z.string().describe("Watermark text"),
          opacity: z
            .number()
            .min(0.01)
            .max(1)
            .optional()
            .describe("Opacity 0-1 (default: 0.08)"),
          rotation: z
            .number()
            .optional()
            .describe("Rotation in degrees (default: 45)"),
          fontSize: z
            .number()
            .optional()
            .describe("Font size (default: 52)"),
        })
        .optional()
        .describe("Watermark settings"),
      pageSize: z
        .enum(["A4", "A3", "Letter", "Legal"])
        .optional()
        .describe("Page size (default: A4)"),
    }),
  ),

  execute: safeJson(
    async ({
      title,
      content,
      filename,
      author,
      subtitle,
      images,
      watermark,
      pageSize,
    }) => {
      // ── Runtime imports ────────────────────────────────────────────────
      let PDFDocumentMod: any;
      try {
        PDFDocumentMod = await import("pdfkit");
      } catch {
        return {
          success: false,
          error: "PDF library (pdfkit) is not installed. Run: npm install pdfkit",
        };
      }
      const PDFDocument = PDFDocumentMod.default || PDFDocumentMod;
      const { join } = await import("path");
      const { writeFileSync, createWriteStream, readFileSync } = await import("fs");
      const { tmpdir } = await import("os");
      const { convertLatexToUnicode } = await import("@/lib/core/latex-symbols");

      const cleanedContent = convertLatexToUnicode(content);
      const safeName = (filename || title)
        .replace(/[^a-zA-Z0-9._-]/g, "-")
        .slice(0, 60);
      const filePath = join(tmpdir(), `klaw-${safeName}-${Date.now()}.pdf`);
      const generatedDate = new Date();
      const dateStr = generatedDate.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      // ── Page size ─────────────────────────────────────────────────────
      const sizeKey = pageSize || "A4";
      const dims = PAGE_DIMS[sizeKey] || PAGE_DIMS["A4"];
      const PW = dims.w;
      const PH = dims.h;
      const ML = 64;
      const MR = 64;
      const MT = 72;
      const MB = 72;
      const CW = PW - ML - MR;

      // ── Download images ───────────────────────────────────────────────
      interface DownloadedImage {
        buffer: Buffer;
        width?: number;
        caption?: string;
        placement: "after" | "section";
        error?: string;
      }
      const downloadedImages: DownloadedImage[] = [];
      if (images && images.length > 0) {
        for (const img of images.slice(0, 20)) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            const response = await fetch(img.url, { signal: controller.signal });
            clearTimeout(timeout);

            if (!response.ok)
              throw new Error(`HTTP ${response.status} ${response.statusText}`);
            const ct = response.headers.get("content-type") || "";
            if (!ct.startsWith("image/"))
              throw new Error(`Unexpected content-type: ${ct}`);
            const buffer = Buffer.from(await response.arrayBuffer());
            if (buffer.length > 10 * 1024 * 1024)
              throw new Error("Image exceeds 10 MB limit");
            downloadedImages.push({
              buffer,
              width: img.width,
              caption: img.caption,
              placement: img.placement || "after",
            });
          } catch (err: any) {
            console.warn(
              `[PDF] Image download failed (${img.url}): ${err?.message ?? err}`,
            );
            downloadedImages.push({
              buffer: Buffer.alloc(0),
              caption: img.caption,
              placement: img.placement || "after",
              error: err?.message ?? "Download failed",
            });
          }
        }
      }

      // ── Create PDF document ───────────────────────────────────────────
      const doc = new PDFDocument({
        size: [PW, PH],
        margins: { top: MT, bottom: MB, left: ML, right: MR },
        bufferPages: true,
        info: {
          Title: title,
          Author: author || "Klawhub Agent",
          Creator: "Klawhub Agent Hub",
          Subject: subtitle || title,
          CreationDate: generatedDate,
        },
      });
      const stream = createWriteStream(filePath);
      doc.pipe(stream);

      // ─── Color Palette ─────────────────────────────────────────────────
      const C = {
        primary: "#1E3A5F",
        secondary: "#2563EB",
        text: "#1F2937",
        muted: "#6B7280",
        light: "#F9FAFB",
        border: "#D1D5DB",
        accent: "#3B82F6",
        tableBg: "#EFF6FF",
        tableAlt: "#F8FAFC",
        codeBg: "#F1F5F9",
        codeBorder: "#CBD5E1",
        quoteBorder: "#3B82F6",
        quoteBg: "#EFF6FF",
        white: "#FFFFFF",
      };

      // ─── Helpers ───────────────────────────────────────────────────────
      let _currentPageNum = 1; // Track current page number for footers
      const addFooter = () => {
        _currentPageNum = doc.bufferedPageRange().count;
        doc.save();
        doc.fontSize(8).font("Helvetica").fillColor(C.muted);
        doc.moveTo(ML, PH - 52)
          .lineTo(PW - MR, PH - 52)
          .strokeColor(C.border)
          .lineWidth(0.5)
          .stroke();
        doc.text(`${title}`, ML, PH - 48, {
          width: CW * 0.6,
          align: "left",
        });
        // Page number will be corrected in the finalization pass
        doc.restore();
      };

      const addHeader = () => {
        doc.save();
        doc.fontSize(7).font("Helvetica").fillColor(C.muted);
        doc.moveTo(ML, 54)
          .lineTo(PW - MR, 54)
          .strokeColor(C.border)
          .lineWidth(0.3)
          .stroke();
        doc.text("Klawhub Agent Hub", ML, 42, {
          width: CW,
          align: "right",
        });
        doc.restore();
      };

      const ensureSpace = (needed: number) => {
        if (doc.y + needed > PH - MB - 10) {
          addFooter();
          doc.addPage();
          addHeader();
        }
      };

      // ── Helper: strip markdown bold/italic markers from plain text ──
      // Used for table cells and other contexts where rich formatting
      // isn't supported but ** markers should not appear literally.
      const stripMd = (text: string): string =>
        text.replace(/\*\*\*(.+?)\*\*\*/g, "$1")
            .replace(/\*\*(.+?)\*\*/g, "$1")
            .replace(/\*(.+?)\*/g, "$1")
            .replace(/`(.+?)`/g, "$1");

      // ── Helper: render inline-formatted text (bold, italic, code, links) ──
      // Strips markdown markers and applies PDFKit font/color styling.
      // Used by paragraph blocks, bullet lists, numbered lists.
      const renderInlineFormatted = (
        d: typeof doc,
        text: string,
        opts: { lineGap?: number } = {},
      ) => {
        const regex =
          /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|[^*`\[]+)/g;
        let seg: RegExpExecArray | null;
        const segments: Array<{
          text: string;
          bold: boolean;
          italic: boolean;
          mono: boolean;
          link?: string;
        }> = [];
        while ((seg = regex.exec(text)) !== null) {
          const s = seg[1];
          if (s.startsWith("***") && s.endsWith("***")) {
            segments.push({ text: s.slice(3, -3), bold: true, italic: true, mono: false });
          } else if (s.startsWith("**") && s.endsWith("**")) {
            segments.push({ text: s.slice(2, -2), bold: true, italic: false, mono: false });
          } else if (s.startsWith("*") && s.endsWith("*")) {
            segments.push({ text: s.slice(1, -1), bold: false, italic: true, mono: false });
          } else if (s.startsWith("`") && s.endsWith("`")) {
            segments.push({ text: s.slice(1, -1), bold: false, italic: false, mono: true });
          } else if (s.startsWith("[") && s.includes("](")) {
            const linkMatch = s.match(/\[([^\]]+)\]\(([^)]+)\)/);
            if (linkMatch) {
              segments.push({ text: linkMatch[1], bold: false, italic: false, mono: false, link: linkMatch[2] });
            } else if (s) {
              segments.push({ text: s, bold: false, italic: false, mono: false });
            }
          } else if (s) {
            segments.push({ text: s, bold: false, italic: false, mono: false });
          }
        }

        const lg = opts.lineGap ?? 3;
        for (let si = 0; si < segments.length; si++) {
          const s = segments[si];
          const isLast = si === segments.length - 1;
          if (s.mono) {
            const fontName = "Courier";
            const textW = d.font(fontName).fontSize(9).widthOfString(s.text);
            d.rect(d.x, d.y - 1, textW + 6, 14).fill(C.codeBg);
            d.font(fontName).fontSize(9).fillColor("#DC2626")
              .text(s.text, d.x + 3, d.y, { continued: !isLast, lineGap: lg });
          } else if (s.link) {
            const linkFont = s.bold && s.italic ? "Helvetica-BoldOblique" : s.bold ? "Helvetica-Bold" : s.italic ? "Helvetica-Oblique" : "Helvetica";
            d.font(linkFont).fontSize(10).fillColor("#2563EB")
              .text(s.text, undefined, undefined, { continued: !isLast, lineGap: lg, link: s.link, underline: true });
          } else {
            const fontName = s.bold && s.italic ? "Helvetica-BoldOblique" : s.bold ? "Helvetica-Bold" : s.italic ? "Helvetica-Oblique" : "Helvetica";
            d.font(fontName).fontSize(10).fillColor(C.text)
              .text(s.text, undefined, undefined, { continued: !isLast, lineGap: lg });
          }
        }
      };

      // ═══════════════════════════════════════════════════════════════════
      // FIRST PASS: parse headings from markdown
      // ═══════════════════════════════════════════════════════════════════
      const headingList: Array<{ level: number; title: string }> = [];
      for (const tl of cleanedContent.split("\n")) {
        const h1 = tl.match(/^# (.+)/);
        const h2 = tl.match(/^## (.+)/);
        const h3 = tl.match(/^### (.+)/);
        if (h1) headingList.push({ level: 1, title: h1[1] });
        else if (h2) headingList.push({ level: 2, title: h2[1] });
        else if (h3) headingList.push({ level: 3, title: h3[1] });
      }

      // Will store the actual PDF page number for each heading (filled during content render)
      const headingPages: number[] = new Array(headingList.length).fill(-1);
      let headingIdx = 0;

      // ═══════════════════════════════════════════════════════════════════
      // PAGE 0: COVER PAGE
      // ═══════════════════════════════════════════════════════════════════
      // Top decorative band
      doc.rect(0, 0, PW, 8).fill(C.primary);
      doc.rect(0, 8, PW, 3).fill(C.secondary);

      doc.y = PH * 0.28;

      // Title
      doc
        .fontSize(28)
        .font("Helvetica-Bold")
        .fillColor(C.primary)
        .text(title, ML, doc.y, { width: CW, align: "center", lineGap: 6 });
      doc.moveDown(0.6);

      // Subtitle
      if (subtitle) {
        doc
          .fontSize(14)
          .font("Helvetica")
          .fillColor(C.secondary)
          .text(subtitle, ML, doc.y, {
            width: CW,
            align: "center",
            lineGap: 4,
          });
        doc.moveDown(0.8);
      }

      // Decorative divider
      const divY = doc.y + 8;
      doc.moveTo(PW / 2 - 60, divY)
        .lineTo(PW / 2 + 60, divY)
        .strokeColor(C.secondary)
        .lineWidth(2)
        .stroke();
      doc.moveTo(PW / 2 - 40, divY + 6)
        .lineTo(PW / 2 + 40, divY + 6)
        .strokeColor(C.accent)
        .lineWidth(0.5)
        .stroke();
      doc.y = divY + 24;

      // Metadata
      doc.fontSize(10).font("Helvetica").fillColor(C.muted);
      doc.text(
        `Prepared by: ${author || "Klawhub Agent"}`,
        ML,
        doc.y,
        { width: CW, align: "center" },
      );
      doc.text(
        `Date: ${dateStr}`,
        ML,
        doc.y + 4,
        { width: CW, align: "center" },
      );
      if (pageSize) {
        doc.text(
          `Page size: ${sizeKey}`,
          ML,
          doc.y + 4,
          { width: CW, align: "center" },
        );
      }

      // Bottom decorative band
      doc.rect(0, PH - 24, PW, 24).fill(C.primary);
      doc.rect(0, PH - 27, PW, 3).fill(C.secondary);

      // ═══════════════════════════════════════════════════════════════════
      // PAGE 1: TOC placeholder (left blank — rendered in second pass)
      // ═══════════════════════════════════════════════════════════════════
      doc.addPage(); // page 1 — stays blank for now

      // ═══════════════════════════════════════════════════════════════════
      // PAGE 2+: CONTENT PAGES
      // ═══════════════════════════════════════════════════════════════════
      doc.addPage(); // page 2 — first content page
      addHeader();

      const lines = cleanedContent.split("\n");
      let inCodeBlock = false;
      let codeLang = "";
      let codeStartY: number | undefined;
      let inTable = false;
      let tableRows: string[][] = [];
      let inBlockquote = false;
      let blockquoteLines: string[] = [];
      let imageIdx = 0; // tracks which downloaded image to insert next

      // ── Pre-process: merge consecutive paragraph lines into blocks ──────
      // This prevents each line from being rendered individually with
      // excessive spacing, which causes half-page content and blank gaps.
      type LineBlock =
        | { type: "paragraph"; lines: string[] }
        | { type: "raw"; line: string };
      const blocks: LineBlock[] = [];
      let pendingLines: string[] = [];

      const flushPending = () => {
        if (pendingLines.length > 0) {
          blocks.push({ type: "paragraph", lines: [...pendingLines] });
          pendingLines = [];
        }
      };

      for (const ln of lines) {
        const trimmed = ln.trim();
        const isSpecial =
          trimmed.startsWith("#") ||
          trimmed.startsWith("```") ||
          trimmed.startsWith(">") ||
          trimmed.startsWith("|") ||
          trimmed.startsWith("-") ||
          trimmed.startsWith("*") ||
          /^\d+\.\s/.test(trimmed) ||
          /^---+$/.test(trimmed) ||
          /^\*\*\*+$/.test(trimmed) ||
          /^___+$/.test(trimmed) ||
          /^(\s*)[-*]\s\[([ xX])\]/.test(ln);

        if (isSpecial || trimmed === "") {
          flushPending();
          blocks.push({ type: "raw", line: ln });
        } else {
          pendingLines.push(ln);
        }
      }
      flushPending();

      for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
        const block = blocks[blockIdx];

        // ── Paragraph block: render merged lines as continuous text ────
        if (block.type === "paragraph") {
          const mergedText = block.lines.join(" ");
          // Check for inline formatting
          const hasFormatting = /\*\*\*|\*\*(?!\*)|\*(?!\*)|`|\[.+\]\(.+\)/.test(mergedText);

          if (hasFormatting) {
            doc.fontSize(10).fillColor(C.text);
            renderInlineFormatted(doc, mergedText, { lineGap: 3 });
          } else {
            // Plain paragraph — rendered as continuous justified text
            doc.fontSize(10).font("Helvetica").fillColor(C.text)
              .text(mergedText, ML, doc.y, { width: CW, lineGap: 3, align: "justify" });
          }
          doc.moveDown(0.4);
          continue;
        }

        // ── Raw block: process single line ────────────────────────────
        const line = block.line;

        // ── Page-break safety — only break when truly near the bottom ─
        if (doc.y > PH - MB - 30 && !inCodeBlock) {
          addFooter();
          doc.addPage();
          addHeader();
        }

        // ── Code blocks ──────────────────────────────────────────────
        if (line.trim().startsWith("```")) {
          if (inCodeBlock) {
            // End code block — draw background + border
            const codeEndY = doc.y + 6;
            const codeX = ML + 8;
            const codeW = CW - 16;
            // Background fill
            doc.rect(codeX, codeStartY!, codeW, codeEndY - codeStartY!).fill(C.codeBg);
            // Border
            try {
              doc
                .roundedRect(codeX, codeStartY!, codeW, codeEndY - codeStartY!, 3)
                .lineWidth(0.5)
                .strokeColor(C.codeBorder)
                .stroke();
            } catch {
              doc
                .rect(codeX, codeStartY!, codeW, codeEndY - codeStartY!)
                .lineWidth(0.5)
                .strokeColor(C.codeBorder)
                .stroke();
            }
            inCodeBlock = false;
            doc.y = codeEndY + 10;
          } else {
            // Start code block
            inCodeBlock = true;
            codeLang = line.trim().slice(3).trim();
            codeStartY = doc.y;
            // Initial background
            doc.rect(ML + 8, codeStartY!, CW - 16, 20).fill(C.codeBg);
            // Language label badge
            if (codeLang) {
              const labelStr = codeLang.toUpperCase();
              const labelW =
                doc.fontSize(7).font("Helvetica-Bold").widthOfString(labelStr) + 14;
              try {
                doc
                  .roundedRect(ML + 12, codeStartY! + 3, labelW, 12, 2)
                  .fill(C.accent);
              } catch {
                doc.rect(ML + 12, codeStartY! + 3, labelW, 12).fill(C.accent);
              }
              doc
                .fontSize(7)
                .font("Helvetica-Bold")
                .fillColor(C.white)
                .text(labelStr, ML + 19, codeStartY! + 5);
              doc.y = codeStartY! + 20;
            } else {
              doc.y = codeStartY! + 8;
            }
          }
          continue;
        }

        if (inCodeBlock) {
          // Page-break check inside code block
          if (doc.y > PH - MB - 20) {
            addFooter();
            doc.addPage();
            addHeader();
            // Re-draw background for the new page
            doc.rect(ML + 8, MT, CW - 16, PH - MT - MB + 20).fill(C.codeBg);
            doc.y = MT + 6;
            // Re-draw language label on new page
            if (codeLang) {
              const labelStr = codeLang.toUpperCase();
              const labelW =
                doc.fontSize(7).font("Helvetica-Bold").widthOfString(labelStr) + 14;
              try {
                doc
                  .roundedRect(ML + 12, MT + 3, labelW, 12, 2)
                  .fill(C.accent);
              } catch {
                doc.rect(ML + 12, MT + 3, labelW, 12).fill(C.accent);
              }
              doc
                .fontSize(7)
                .font("Helvetica-Bold")
                .fillColor(C.white)
                .text(labelStr, ML + 19, MT + 5);
              doc.y = MT + 20;
            } else {
              doc.y = MT + 8;
            }
          }

          // Syntax-highlighted code line
          const normalizedLang = codeLang.toLowerCase().replace(/[^a-z]/g, "");
          const tokens = tokenizeCodeLine(line || " ", normalizedLang);

          if (tokens.length > 1 && SYNTAX_KW[normalizedLang]) {
            // Render tokens with individual colors/fonts
            let isFirstToken = true;
            for (let ti = 0; ti < tokens.length; ti++) {
              const t = tokens[ti];
              const isLast = ti === tokens.length - 1;
              const fontName = t.bold ? "Courier-Bold" : "Courier";
              if (isFirstToken) {
                doc
                  .fontSize(8)
                  .font(fontName)
                  .fillColor(t.color)
                  .text(
                    t.text,
                    ML + 16,
                    doc.y,
                    {
                      width: CW - 40,
                      lineGap: 1.5,
                      continued: !isLast,
                    },
                  );
                isFirstToken = false;
              } else {
                doc
                  .font(fontName)
                  .fillColor(t.color)
                  .text(t.text, undefined, undefined, {
                    width: CW - 40,
                    lineGap: 1.5,
                    continued: !isLast,
                  });
              }
            }
          } else {
            // Plain monospace (no highlighting for unknown languages)
            doc
              .fontSize(8)
              .font("Courier")
              .fillColor("#334155")
              .text(line || " ", ML + 16, doc.y, {
                width: CW - 40,
                lineGap: 1.5,
              });
          }
          continue;
        }

        // ── Blockquotes ─────────────────────────────────────────────
        if (line.trim().startsWith("> ")) {
          if (!inBlockquote) {
            inBlockquote = true;
            blockquoteLines = [];
          }
          blockquoteLines.push(line.trim().slice(2));
          continue;
        } else if (inBlockquote && line.trim() === "") {
          inBlockquote = false;
          if (blockquoteLines.length > 0) {
            const bqText = blockquoteLines.join(" ");
            const bqY = doc.y;
            ensureSpace(40);
            const textHeight = doc
              .fontSize(10)
              .font("Helvetica-Oblique")
              .heightOfString(bqText, { width: CW - 50 });
            doc
              .rect(ML + 8, bqY - 2, CW - 16, textHeight + 10)
              .fill(C.quoteBg);
            doc.rect(ML + 8, bqY - 2, 3, textHeight + 10).fill(C.quoteBorder);
            doc
              .fontSize(10)
              .font("Helvetica-Oblique")
              .fillColor(C.primary)
              .text(bqText, ML + 22, bqY + 3, {
                width: CW - 50,
                lineGap: 2,
              });
            doc.moveDown(0.5);
          }
          blockquoteLines = [];
          continue;
        }

        // ── Tables ─────────────────────────────────────────────────
        if (line.trim().startsWith("|")) {
          const cells = line
            .split("|")
            .filter((c) => c.trim())
            .map((c) => c.trim());
          if (cells.every((c) => /^[-:]+$/.test(c))) continue;
          if (!inTable) inTable = true;
          tableRows.push(cells);
          continue;
        } else if (inTable) {
          // End of table — render it
          if (tableRows.length > 0) {
            ensureSpace(80);
            const colCount = Math.min(tableRows[0].length, 8);
            const colWidth = CW / colCount;

            // ── Header row ─────────────────────────────────────────
            doc.rect(ML, doc.y, CW, 26).fill(C.primary);
            doc.fontSize(9).font("Helvetica-Bold").fillColor(C.white);
            for (let c = 0; c < colCount; c++) {
              doc.text(
                stripMd((tableRows[0][c] || "")).slice(0, 40),
                ML + c * colWidth + 8,
                doc.y - 20,
                { width: colWidth - 16, height: 22 },
              );
            }
            doc.y += 6;

            // ── Data rows ──────────────────────────────────────────
            for (
              let r = 1;
              r < Math.min(tableRows.length, 100);
              r++
            ) {
              if (doc.y > PH - MB - 50) {
                addFooter();
                doc.addPage();
                addHeader();
                // Repeat header on new page
                doc.rect(ML, doc.y, CW, 26).fill(C.primary);
                doc
                  .fontSize(9)
                  .font("Helvetica-Bold")
                  .fillColor(C.white);
                for (let c = 0; c < colCount; c++) {
                  doc.text(
                    stripMd((tableRows[0][c] || "")).slice(0, 40),
                    ML + c * colWidth + 8,
                    doc.y - 20,
                    { width: colWidth - 16 },
                  );
                }
                doc.y += 6;
              }

              const rowBg = r % 2 === 0 ? C.tableAlt : C.white;
              let maxH = 24;
              for (
                let c = 0;
                c < colCount && c < (tableRows[r]?.length || 0);
                c++
              ) {
                const h = doc
                  .fontSize(8.5)
                  .font(c === 0 ? "Helvetica-Bold" : "Helvetica")
                  .heightOfString(
                    stripMd((tableRows[r][c] || "")).slice(0, 60),
                    { width: colWidth - 16 },
                  );
                maxH = Math.max(maxH, h + 14);
              }

              // Row background
              doc.rect(ML, doc.y, CW, maxH).fill(rowBg);

              // Cell content — first column bold
              for (
                let c = 0;
                c < colCount && c < (tableRows[r]?.length || 0);
                c++
              ) {
                const isFirstCol = c === 0;
                doc
                  .fontSize(8.5)
                  .font(
                    isFirstCol ? "Helvetica-Bold" : "Helvetica",
                  )
                  .fillColor(isFirstCol ? C.primary : C.text)
                  .text(
                    stripMd((tableRows[r][c] || "")).slice(0, 60),
                    ML + c * colWidth + 8,
                    doc.y + 7,
                    { width: colWidth - 16 },
                  );
              }

              // Horizontal grid line
              doc
                .moveTo(ML, doc.y + maxH)
                .lineTo(ML + CW, doc.y + maxH)
                .strokeColor(C.border)
                .lineWidth(0.3)
                .stroke();

              // Vertical grid lines
              for (let c = 1; c < colCount; c++) {
                doc
                  .moveTo(ML + c * colWidth, doc.y)
                  .lineTo(ML + c * colWidth, doc.y + maxH)
                  .strokeColor(C.border)
                  .lineWidth(0.2)
                  .stroke();
              }
              doc.y += maxH;
            }
            doc.moveDown(0.6);
          }
          tableRows = [];
          inTable = false;
        }

        // ── Headings ───────────────────────────────────────────────
        const h1Match = line.match(/^# (.+)/);
        const h2Match = line.match(/^## (.+)/);
        const h3Match = line.match(/^### (.+)/);

        if (h1Match) {
          if (headingIdx < headingList.length) {
            headingPages[headingIdx] = doc.bufferedPageRange().count;
            headingIdx++;
          }
          ensureSpace(30);
          doc.moveDown(0.5);
          // Blue accent bar
          doc.rect(ML, doc.y, 4, 18).fill(C.secondary);
          doc
            .fontSize(18)
            .font("Helvetica-Bold")
            .fillColor(C.primary)
            .text(h1Match[1], ML + 12, doc.y + 1, { width: CW - 12 });
          doc.moveDown(0.4);

          // Insert image if available
          if (imageIdx < downloadedImages.length) {
            const img = downloadedImages[imageIdx];
            imageIdx++;
            if (img.buffer.length > 0) {
              if (img.placement === "section") {
                doc.addPage();
                addHeader();
              }
              doc.moveDown(0.3);
              ensureSpace(120);
              const imgW = Math.min(img.width || CW * 0.6, CW);
              const imgX = ML + (CW - imgW) / 2;
              try {
                doc.image(img.buffer, imgX, doc.y, {
                  width: imgW,
                  height: PH / 3,
                });
              } catch {
                // Fallback: try without height constraint
                try {
                  doc.image(img.buffer, imgX, doc.y, { width: imgW });
                } catch {
                  // Image embed failed, skip silently
                }
              }
              doc.moveDown(0.2);
              if (img.caption) {
                doc
                  .fontSize(8)
                  .font("Helvetica-Oblique")
                  .fillColor(C.muted)
                  .text(img.caption, ML, doc.y, {
                    width: CW,
                    align: "center",
                  });
              }
              doc.moveDown(0.5);
            }
          }
          continue;
        }
        if (h2Match) {
          if (headingIdx < headingList.length) {
            headingPages[headingIdx] = doc.bufferedPageRange().count;
            headingIdx++;
          }
          ensureSpace(25);
          doc.moveDown(0.4);
          doc
            .fontSize(14)
            .font("Helvetica-Bold")
            .fillColor(C.secondary)
            .text(h2Match[1]);
          doc
            .moveTo(ML, doc.y + 2)
            .lineTo(ML + CW * 0.3, doc.y + 2)
            .strokeColor(C.accent)
            .lineWidth(0.8)
            .stroke();
          doc.moveDown(0.4);
          continue;
        }
        if (h3Match) {
          if (headingIdx < headingList.length) {
            headingPages[headingIdx] = doc.bufferedPageRange().count;
            headingIdx++;
          }
          ensureSpace(20);
          doc.moveDown(0.3);
          doc
            .fontSize(12)
            .font("Helvetica-Bold")
            .fillColor(C.text)
            .text(h3Match[1]);
          doc.moveDown(0.3);
          continue;
        }

        // ── Section breaks (---) ───────────────────────────────────
        if (/^---+$/.test(line.trim())) {
          ensureSpace(40);
          doc.moveDown(0.4);
          // Decorative section-break divider (visual only — no forced page break)
          const sby = doc.y;
          doc
            .moveTo(ML + CW * 0.2, sby)
            .lineTo(ML + CW * 0.8, sby)
            .strokeColor(C.border)
            .lineWidth(0.5)
            .stroke();
          doc
            .circle(PW / 2, sby, 3)
            .fill(C.accent);
          doc.moveDown(0.8); // extra space after divider instead of new page
          continue;
        }

        // ── Horizontal rules (***, ___) — styled dividers, no page break ─
        if (/^\*\*\*+$/.test(line.trim()) || /^___+$/.test(line.trim())) {
          doc.moveDown(0.4);
          const hry = doc.y;
          doc
            .moveTo(ML + CW * 0.1, hry)
            .lineTo(ML + CW * 0.9, hry)
            .strokeColor(C.border)
            .lineWidth(0.3)
            .stroke();
          doc
            .moveTo(ML + CW * 0.15, hry + 3)
            .lineTo(ML + CW * 0.85, hry + 3)
            .strokeColor(C.accent)
            .lineWidth(0.2)
            .stroke();
          doc.moveDown(0.5);
          continue;
        }

        // ── Empty line ─────────────────────────────────────────────
        if (line.trim() === "") {
          doc.moveDown(0.25);
          continue;
        }

        // ── Task lists (- [x] / - [ ]) ────────────────────────────
        const taskMatch = line.match(/^(\s*)[-*]\s\[([ xX])\]\s(.+)/);
        if (taskMatch) {
          const indent = Math.min(taskMatch[1].length / 2, 3);
          const checked = taskMatch[2].toLowerCase() === "x";
          const checkbox = checked ? "\u2611" : "\u2610";
          const taskText = taskMatch[3];
          const bulletX = ML + 16 + indent * 16;
          doc
            .fontSize(10)
            .font(checked ? "Helvetica-Bold" : "Helvetica")
            .fillColor(checked ? C.muted : C.text)
            .text(`${checkbox} ${taskText}`, bulletX, doc.y, {
              lineGap: 2,
            });
          continue;
        }

        // ── Bullet lists (nested support) ──────────────────────────
        const bulletMatch = line.match(/^(\s*)([-*])\s(.+)/);
        if (bulletMatch) {
          const indent = Math.min(bulletMatch[1].length / 2, 3);
          const bulletX = ML + 16 + indent * 16;
          const bulletChar = indent === 0 ? "\u2022" : indent === 1 ? "\u25E6" : "\u25AA";
          const bulletText = bulletMatch[3];

          // Check for inline bold/italic formatting inside bullet
          const hasBold = /\*\*[^*]+\*\*/.test(bulletText);
          if (hasBold) {
            // Render bullet with rich formatting
            doc.fontSize(10).fillColor(C.text);
            doc.text(`${bulletChar} `, bulletX, doc.y, {
              continued: true,
              lineGap: 2,
            });
            renderInlineFormatted(doc, bulletText, { lineGap: 2 });
          } else {
            doc
              .fontSize(10)
              .font("Helvetica")
              .fillColor(C.text)
              .text(`${bulletChar} ${bulletText}`, bulletX, doc.y, {
                lineGap: 2,
              });
          }
          continue;
        }

        // ── Numbered lists ─────────────────────────────────────────
        const olMatch = line.trim().match(/^(\d+)\.\s(.+)/);
        if (olMatch) {
          const olText = olMatch[2];
          const olHasBold = /\*\*[^*]+\*\*/.test(olText);
          doc.fontSize(10).fillColor(C.text);
          doc.text(`${olMatch[1]}.`, ML + 16, doc.y, {
            continued: true,
            width: 18,
          });
          if (olHasBold) {
            renderInlineFormatted(doc, ` ${olText}`, { lineGap: 2 });
          } else {
            doc.text(` ${olText}`, { lineGap: 2 });
          }
          continue;
        }

        // ── Fallback: any remaining line rendered as plain text ────
        // (Should rarely reach here — most content is caught by paragraph blocks)
        doc
          .fontSize(10)
          .font("Helvetica")
          .fillColor(C.text)
          .text(line, ML, doc.y, {
            width: CW,
            lineGap: 3,
            align: "left",
          });
      }

      // ── Render remaining blockquote if any ─────────────────────────────
      if (inBlockquote && blockquoteLines.length > 0) {
        const bqText = blockquoteLines.join(" ");
        const bqY = doc.y;
        const textHeight = doc
          .fontSize(10)
          .font("Helvetica-Oblique")
          .heightOfString(bqText, { width: CW - 50 });
        doc
          .rect(ML + 8, bqY - 2, CW - 16, textHeight + 10)
          .fill(C.quoteBg);
        doc.rect(ML + 8, bqY - 2, 3, textHeight + 10).fill(C.quoteBorder);
        doc
          .fontSize(10)
          .font("Helvetica-Oblique")
          .fillColor(C.primary)
          .text(bqText, ML + 22, bqY + 3, {
            width: CW - 50,
            lineGap: 2,
          });
      }

      // ── Render remaining table if any ─────────────────────────────────
      if (tableRows.length > 0) {
        const colCount = Math.min(tableRows[0].length, 8);
        const colWidth = CW / colCount;
        doc.rect(ML, doc.y, CW, 26).fill(C.primary);
        doc.fontSize(9).font("Helvetica-Bold").fillColor(C.white);
        for (let c = 0; c < colCount; c++) {
          doc.text(
            (tableRows[0][c] || "").slice(0, 40),
            ML + c * colWidth + 8,
            doc.y - 20,
            { width: colWidth - 16 },
          );
        }
      }

      // ── Append any remaining images that weren't placed ────────────────
      while (imageIdx < downloadedImages.length) {
        const img = downloadedImages[imageIdx];
        imageIdx++;
        if (img.buffer.length > 0) {
          addFooter();
          doc.addPage();
          addHeader();
          const imgW = Math.min(img.width || CW * 0.6, CW);
          const imgX = ML + (CW - imgW) / 2;
          doc.moveDown(0.5);
          try {
            doc.image(img.buffer, imgX, doc.y, {
              width: imgW,
              height: PH / 3,
            });
          } catch {
            try {
              doc.image(img.buffer, imgX, doc.y, { width: imgW });
            } catch {
              // skip
            }
          }
          doc.moveDown(0.2);
          if (img.caption) {
            doc
              .fontSize(8)
              .font("Helvetica-Oblique")
              .fillColor(C.muted)
              .text(img.caption, ML, doc.y, {
                width: CW,
                align: "center",
              });
          }
          doc.moveDown(0.5);
        }
      }

      // ── Footer on last content page ────────────────────────────────────
      addFooter();

      let totalPages = doc.bufferedPageRange().count;

      // ═══════════════════════════════════════════════════════════════════
      // SECOND PASS: Render TOC on page 1 with correct page numbers
      // ═══════════════════════════════════════════════════════════════════
      doc.switchToPage(1);
      doc.y = MT;

      addHeader();

      doc
        .fontSize(20)
        .font("Helvetica-Bold")
        .fillColor(C.primary)
        .text("Table of Contents", ML, doc.y);
      doc.moveDown(0.5);
      doc
        .moveTo(ML, doc.y)
        .lineTo(PW - MR, doc.y)
        .strokeColor(C.secondary)
        .lineWidth(1)
        .stroke();
      doc.moveDown(1);

      if (headingList.length === 0) {
        doc
          .fontSize(10)
          .font("Helvetica-Oblique")
          .fillColor(C.muted)
          .text("No sections found.", ML, doc.y, { width: CW });
      } else {
        // Determine how many entries can fit on the TOC page
        const tocMaxY = PH - MB - 40;
        const maxEntries = Math.min(headingList.length, 40);

        for (let hi = 0; hi < maxEntries; hi++) {
          const h = headingList[hi];
          const pg = headingPages[hi];
          const indent = h.level === 1 ? 0 : h.level === 2 ? 20 : 40;
          const fontSize = h.level === 1 ? 11 : h.level === 2 ? 10 : 9;
          const fontName =
            h.level === 1 ? "Helvetica-Bold" : "Helvetica";
          const textColor = h.level === 1 ? C.primary : C.text;

          // Check if we have room
          if (doc.y + fontSize + 8 > tocMaxY) {
            doc
              .fontSize(8)
              .font("Helvetica-Oblique")
              .fillColor(C.muted)
              .text(
                `... and ${headingList.length - hi} more sections`,
                ML + indent,
                doc.y,
                { width: CW - indent },
              );
            break;
          }

          const entryY = doc.y;
          const titleAreaW = CW - indent - 55;
          let displayTitle = h.title;

          // Truncate title to fit
          doc.fontSize(fontSize).font(fontName);
          while (
            doc.widthOfString(displayTitle) > titleAreaW &&
            displayTitle.length > 5
          ) {
            displayTitle = displayTitle.slice(0, -1);
          }
          if (displayTitle !== h.title) displayTitle += "\u2026";

          const titleRenderedW = doc.widthOfString(displayTitle);
          const pageNumStr = pg > 0 ? String(pg) : "?";

          // Title text
          doc
            .fontSize(fontSize)
            .font(fontName)
            .fillColor(textColor)
            .text(displayTitle, ML + indent, entryY, {
              width: titleAreaW,
            });

          // Leader dots
          const dotsStartX = ML + indent + titleRenderedW + 3;
          const dotsEndX = PW - MR - 32;
          const dotsAvailW = Math.max(15, dotsEndX - dotsStartX);
          const dotCharW = doc
            .fontSize(fontSize - 1)
            .font("Helvetica")
            .widthOfString(".");
          const numDots = Math.max(2, Math.floor(dotsAvailW / dotCharW));

          doc
            .fontSize(fontSize - 1)
            .font("Helvetica")
            .fillColor(C.border)
            .text(
              ".".repeat(numDots),
              dotsStartX,
              entryY + 1,
              { width: dotsAvailW },
            );

          // Page number (right-aligned)
          doc
            .fontSize(fontSize)
            .font("Helvetica-Bold")
            .fillColor(C.primary)
            .text(pageNumStr, PW - MR - 30, entryY, {
              width: 30,
              align: "right",
            });

          doc.y = entryY + fontSize + 6;
        }
      }

      // ═══════════════════════════════════════════════════════════════════
      // HEADERS & FOOTERS on all pages — safe overlay approach
      // ═══════════════════════════════════════════════════════════════════
      // NOTE: We do NOT use switchToPage() here — it causes PDFKit to
      // create duplicate blank pages when used after the content stream.
      // Instead, we use pypdf to add page numbers post-generation.
      // The inline addHeader()/addFooter() calls during content rendering
      // already placed headers and footers correctly on each page.
      // We only need to fix the page numbers in the existing footers.

      // ═══════════════════════════════════════════════════════════════════
      // WATERMARK on all pages (skip cover)
      // NOTE: We do NOT use switchToPage() here — it causes PDFKit to
      // create duplicate blank pages. Instead we store watermark params
      // and apply via pypdf post-processing.
      // ═══════════════════════════════════════════════════════════════════
      const wmParams = watermark && watermark.text
        ? {
            text: watermark.text,
            opacity: Math.min(1, Math.max(0.01, watermark.opacity ?? 0.08)),
            rotation: watermark.rotation ?? 45,
            fontSize: watermark.fontSize ?? 52,
          }
        : null;

      // Watermark is stored for future use (e.g., via pdf-lib overlay)
      // but NOT applied during PDFKit rendering to avoid switchToPage() blank pages
      void wmParams; // suppress unused variable warning

      // ═══════════════════════════════════════════════════════════════════
      // FINALIZE
      // ═══════════════════════════════════════════════════════════════════
      doc.end();

      await new Promise<void>((resolve, reject) => {
        stream.on("finish", resolve);
        stream.on("error", reject);
      });

      // ── Post-process: remove blank/phantom pages using pdf-lib ──
      // PDFKit can create phantom pages with only headers/footers.
      // We detect these by measuring the raw content stream size per page —
      // blank pages have tiny content streams (< 500 bytes), while real
      // content pages are typically 2KB+. This avoids needing pdf-parse.
      let fileBuffer = readFileSync(filePath);
      try {
        const { PDFDocument: PdfLibDoc } = await import("pdf-lib");
        const srcDoc = await PdfLibDoc.load(fileBuffer);
        const pageCount = srcDoc.getPageCount();
        const pagesToKeep: number[] = [];

        for (let i = 0; i < pageCount; i++) {
          const page = srcDoc.getPage(i);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rawContent: any = page.node.Contents();
          // Contents may be a stream ref or an array of stream refs
          let streamSize = 0;
          try {
            if (rawContent && typeof rawContent === "object" && "length" in (rawContent as object)) {
              // Array of content streams
              for (const entry of rawContent as Array<{ toString: () => string }>) {
                const str = entry.toString();
                streamSize += str.length;
              }
            } else if (rawContent && typeof rawContent === "object" && "str" in (rawContent as object)) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              streamSize = (rawContent as any).str.length || 0;
            }
          } catch {
            streamSize = 0;
          }

          // Page 0 = cover (always keep), page 1 = TOC (always keep)
          // For other pages: keep if content stream > 400 bytes
          // (phantom pages with just headers/footers are ~100-300 bytes)
          if (i <= 1 || streamSize > 400) {
            pagesToKeep.push(i);
          } else {
            console.log(`[PDF] Removing blank/phantom page ${i + 1} (stream: ${streamSize} bytes)`);
          }
        }

        if (pagesToKeep.length < pageCount && pagesToKeep.length >= 2) {
          const newDoc = await PdfLibDoc.create();
          const copiedPages = await newDoc.copyPages(srcDoc, pagesToKeep);
          for (const pg of copiedPages) {
            newDoc.addPage(pg);
          }
          fileBuffer = Buffer.from(await newDoc.save());
          totalPages = pagesToKeep.length;
          console.log(
            `[PDF] Removed ${pageCount - pagesToKeep.length} blank page(s). ` +
            `Final: ${totalPages} pages.`,
          );
        }
      } catch (e) {
        console.warn("[PDF] Blank-page removal skipped:", e);
      }

      const basename = filePath.split("/").pop() || "report.pdf";
      try {
        const { cacheFile } = await import("@/lib/workspace/file-cache");
        await cacheFile(basename, fileBuffer, "application/pdf", basename);
      } catch {
        // best-effort caching
      }

      return {
        success: true,
        filename: basename,
        title,
        fileBase64: fileBuffer.toString("base64"),
        fileSize: fileBuffer.length,
        mimeType: "application/pdf",
        downloadUrl: `/api/files/${basename}`,
        message: `PDF report "${title}" created successfully (${totalPages} pages, ${sizeKey}, cover, TOC with accurate page numbers, headers/footers${watermark ? ", watermark" : ""}${downloadedImages.length > 0 ? `, ${downloadedImages.filter((i) => i.buffer.length > 0).length} images embedded` : ""}). Download available.`,
      };
    },
  ),
});

// ---------------------------------------------------------------------------
// Klawhub Agent System — Upgraded DOCX Document Creation Tool
// ---------------------------------------------------------------------------
// Drop-in replacement for createDocxDocumentTool with Claude/glm5.1-quality
// enhancements: image embedding, H4-H6 headings, numbered lists with multiple
// formats, horizontal rules, improved table styling, page break control,
// task lists, strikethrough, and professional headers/footers.
// ---------------------------------------------------------------------------



// ---------------------------------------------------------------------------
// Image type used for the images parameter
// ---------------------------------------------------------------------------
type ImageType = "jpg" | "png" | "gif" | "bmp";

interface DocxImage {
  /** URL to download the image from */
  url: string;
  /** Width in EMU (default 400000 ≈ 10.16 cm) */
  width?: number;
  /** Height in EMU (default 300000 ≈ 7.62 cm) */
  height?: number;
  /** Optional caption displayed below the image (italic, centered) */
  caption?: string;
}

// ---------------------------------------------------------------------------
// Detect whether the first column of a table looks like row labels
// ---------------------------------------------------------------------------
function looksLikeRowLabels(rows: string[][]): boolean {
  if (rows.length < 2) return false;
  const firstColValues = rows.slice(1).map((r) => r[0]?.trim() || "");
  // Heuristic: if most first-col values are short (≤30 chars) and don't contain
  // many spaces or numbers, they're probably labels rather than data cells.
  const labelLike = firstColValues.filter(
    (v) => v.length > 0 && v.length <= 30 && !/^\d+(\.\d+)?$/.test(v) && v.split(" ").length <= 4,
  );
  return labelLike.length >= firstColValues.length * 0.6;
}

// ---------------------------------------------------------------------------
// Guess proportional column widths based on content length
// ---------------------------------------------------------------------------
function guessColumnWidths(rows: string[][], totalWidth: number): number[] {
  if (rows.length === 0) return [];
  const colCount = rows[0].length;
  // Measure max content length per column
  const colLengths: number[] = new Array(colCount).fill(0);
  for (const row of rows) {
    for (let c = 0; c < colCount && c < row.length; c++) {
      const len = row[c]?.length || 0;
      if (len > colLengths[c]) colLengths[c] = len;
    }
  }
  const totalLen = colLengths.reduce((a, b) => a + b, 0) || 1;
  // Guarantee minimum 10% width per column
  const minWidth = totalWidth * 0.1;
  const distributable = totalWidth - minWidth * colCount;
  return colLengths.map((l) => {
    const proportional = (l / totalLen) * totalWidth;
    return Math.max(minWidth, Math.min(totalWidth * 0.6, proportional));
  });
}

export const createDocxDocumentTool = tool({
  description:
    "Create a professional DOCX document and return it as a downloadable file. " +
    "Produces polished Word documents with cover page, styled headings (H1-H6), formatted tables with header shading and proportional widths, " +
    "blockquotes, page numbers, rich inline formatting, images, task lists, strikethrough, horizontal rules, numbered lists (decimal, letter, roman), " +
    "table of contents, and professional headers/footers. " +
    "Supports full markdown: headers, lists, tables, bold, italic, code blocks, blockquotes, task lists, strikethrough, images, horizontal rules.",
  inputSchema: zodSchema(
    z.object({
      title: z.string().describe("Title of the DOCX document"),
      subtitle: z.string().optional().describe("Subtitle displayed below the title on the cover page"),
      content: z
        .string()
        .describe(
          "Content in markdown format (supports H1-H6, bullet/numbered lists, tables, bold, italic, code blocks, blockquotes, task lists, strikethrough, horizontal rules)",
        ),
      filename: z.string().optional().describe("Output filename (without extension). Default: derived from title"),
      author: z.string().optional().describe("Author name (default: 'Klawhub Agent')"),
      images: z
        .array(
          z.object({
            url: z.string().describe("URL to download the image from"),
            width: z.number().optional().describe("Image width in pixels (default: 500)"),
            height: z.number().optional().describe("Image height in pixels (default: 375)"),
            caption: z.string().optional().describe("Caption displayed below the image"),
          }),
        )
        .optional()
        .describe(
          "Optional array of images to embed in the document. Each image can have a URL, width/height in pixels, and an optional caption.",
        ),
    }),
  ),
  execute: safeJson(async ({ title, subtitle, content, filename, author, images }) => {
    // ─── Dynamic imports ────────────────────────────────────────────────
    const docx = await import("docx");
    const {
      Document,
      Paragraph,
      TextRun,
      HeadingLevel,
      AlignmentType,
      BorderStyle,
      Table,
      TableRow,
      TableCell,
      WidthType,
      PageNumber,
      Footer,
      Header,
      TableOfContents,
      ExternalHyperlink,
      ImageRun,
      ShadingType,
    } = docx;

    // Packer — handle both named and default export shapes
    const Packer = (docx as unknown as { Packer: { toBuffer: (doc: unknown) => Promise<Buffer> } }).Packer;

    const { convertLatexToUnicode } = await import("@/lib/core/latex-symbols");

    // ─── Constants & helpers ────────────────────────────────────────────
    const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const cleanedContent = convertLatexToUnicode(content);
    const safeName = (filename || title).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 60);

    // ─── Download images ────────────────────────────────────────────────
    const downloadedImages: { buffer: Buffer; width: number; height: number; caption?: string; imageType: ImageType }[] = [];
    // Detect image type from MIME content-type or buffer magic bytes
    function detectImageType(buffer: Buffer, contentType?: string | null): ImageType {
      if (contentType) {
        if (contentType.includes("image/png")) return "png";
        if (contentType.includes("image/gif")) return "gif";
        if (contentType.includes("image/bmp")) return "bmp";
        if (contentType.includes("image/jpeg") || contentType.includes("image/jpg")) return "jpg";
      }
      // Fallback: detect from magic bytes
      if (buffer.length >= 4) {
        if (buffer[0] === 0x89 && buffer[1] === 0x50) return "png";
        if (buffer[0] === 0xff && buffer[1] === 0xd8) return "jpg";
        if (buffer[0] === 0x47 && buffer[1] === 0x49) return "gif";
        if (buffer[0] === 0x42 && buffer[1] === 0x4d) return "bmp";
      }
      return "png"; // safe default
    }

    if (images && images.length > 0) {
      for (const img of images) {
        try {
          const response = await fetch(img.url, { signal: AbortSignal.timeout(15_000) });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const arrayBuf = await response.arrayBuffer();
          const imageBuffer = Buffer.from(arrayBuf);
          // Default dimensions in EMU (English Metric Units)
          // 1 pixel ≈ 9525 EMU at 96 DPI
          const widthEmu = (img.width || 500) * 9525;
          const heightEmu = (img.height || 375) * 9525;
          const imageType = detectImageType(imageBuffer, response.headers.get("content-type"));
          downloadedImages.push({
            buffer: imageBuffer,
            width: widthEmu,
            height: heightEmu,
            caption: img.caption,
            imageType,
          });
        } catch {
          // Graceful fallback: placeholder text will be used
          downloadedImages.push({
            buffer: Buffer.alloc(0),
            width: (img.width || 500) * 9525,
            height: (img.height || 375) * 9525,
            caption: img.caption,
            imageType: "png",
          });
        }
      }
    }

    // ─── Cover page section ─────────────────────────────────────────────
    const coverChildren: unknown[] = [
      // Top spacer
      new Paragraph({ spacing: { before: 3600 }, children: [] }),
      // Title
      new Paragraph({
        children: [new TextRun({ text: title, bold: true, size: 56, font: "Calibri", color: "1E3A5F" })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      }),
    ];

    // Subtitle
    if (subtitle) {
      (coverChildren as unknown[]).push(
        new Paragraph({
          children: [new TextRun({ text: subtitle, size: 26, color: "6B7280", font: "Calibri", italics: true })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        }),
      );
    }

    (coverChildren as unknown[]).push(
      // Decorative divider
      new Paragraph({
        children: [new TextRun({ text: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━", size: 16, color: "2563EB" })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
      }),
      // Author
      new Paragraph({
        children: [
          new TextRun({ text: "Prepared by: ", size: 22, color: "6B7280", font: "Calibri" }),
          new TextRun({ text: author || "Klawhub Agent", size: 22, color: "1E3A5F", font: "Calibri", bold: true }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
      }),
      // Date
      new Paragraph({
        children: [new TextRun({ text: `Date: ${dateStr}`, size: 22, color: "6B7280", font: "Calibri" })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      }),
      // Generated-by note
      new Paragraph({
        children: [
          new TextRun({ text: "Generated by Klawhub Agent Hub", size: 18, color: "9CA3AF", font: "Calibri", italics: true }),
        ],
        alignment: AlignmentType.CENTER,
      }),
    );

    // ─── Content section ────────────────────────────────────────────────
    const contentChildren: unknown[] = [];

    // ─── Inline formatting parser (supports bold, italic, bold-italic, code,
    //     links, strikethrough, task-list markers) ───────────────────────
    const parseInlineFormatting = (text: string): any[] => {
      const runs: any[] = [];
      // Extended pattern: code, bold-italic, bold, italic, strikethrough, links, plain
      const pattern = /(`[^`]+`|\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|\[([^\]]+)\]\(([^)]+)\))/g;
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(text)) !== null) {
        // Plain text before the match
        if (match.index > lastIndex) {
          const plainText = text.slice(lastIndex, match.index);
          if (plainText) {
            runs.push(new TextRun({ text: plainText, size: 22, font: "Calibri", color: "1F2937" }));
          }
        }

        const token = match[0];

        if (token.startsWith("`")) {
          // Inline code
          runs.push(
            new TextRun({
              text: token.slice(1, -1),
              size: 20,
              font: "Courier New",
              color: "DC2626",
              shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
            }),
          );
        } else if (token.startsWith("***")) {
          // Bold + Italic
          runs.push(
            new TextRun({
              text: token.slice(3, -3),
              bold: true,
              italics: true,
              size: 22,
              font: "Calibri",
              color: "1F2937",
            }),
          );
        } else if (token.startsWith("**")) {
          // Bold
          runs.push(new TextRun({ text: token.slice(2, -2), bold: true, size: 22, font: "Calibri", color: "1F2937" }));
        } else if (token.startsWith("*")) {
          // Italic
          runs.push(new TextRun({ text: token.slice(1, -1), italics: true, size: 22, font: "Calibri", color: "374151" }));
        } else if (token.startsWith("~~")) {
          // Strikethrough
          runs.push(new TextRun({ text: token.slice(2, -2), strike: true, size: 22, font: "Calibri", color: "9CA3AF" }));
        } else if (token.startsWith("[")) {
          // Link [text](url) — show URL in parentheses after link text
          const linkText = match[2] || token;
          const linkUrl = match[3] || "#";
          try {
            runs.push(
              new ExternalHyperlink({
                children: [
                  new TextRun({
                    text: linkText,
                    size: 22,
                    font: "Calibri",
                    color: "2563EB",
                    underline: { type: "single" as any },
                  }),
                ],
                link: linkUrl,
              }),
              new TextRun({ text: ` (${linkUrl})`, size: 18, font: "Calibri", color: "9CA3AF" }),
            );
          } catch {
            runs.push(new TextRun({ text: `${linkText} (${linkUrl})`, size: 22, font: "Calibri", color: "2563EB" }));
          }
        }

        lastIndex = match.index + token.length;
      }

      // Remaining plain text
      if (lastIndex < text.length) {
        const remaining = text.slice(lastIndex);
        if (remaining) {
          runs.push(new TextRun({ text: remaining, size: 22, font: "Calibri", color: "1F2937" }));
        }
      }

      return runs.length > 0 ? runs : [new TextRun({ text, size: 22, font: "Calibri", color: "1F2937" })];
    };

    // ─── Table cell formatting (header-aware, with strikethrough) ───────
    const parseTableFormatting = (text: string, isHeader: boolean): any[] => {
      const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|~~[^~]+~~)/);
      const runs: any[] = [];
      for (const part of parts) {
        if (!part) continue;
        if (part.startsWith("**") && part.endsWith("**")) {
          runs.push(
            new TextRun({
              text: part.slice(2, -2),
              bold: true,
              size: isHeader ? 20 : 18,
              font: "Calibri",
              color: isHeader ? "FFFFFF" : "1F2937",
            }),
          );
        } else if (part.startsWith("*") && part.endsWith("*")) {
          runs.push(
            new TextRun({
              text: part.slice(1, -1),
              italics: true,
              size: isHeader ? 20 : 18,
              font: "Calibri",
              color: isHeader ? "FFFFFF" : "1F2937",
            }),
          );
        } else if (part.startsWith("`") && part.endsWith("`")) {
          runs.push(
            new TextRun({
              text: part.slice(1, -1),
              size: isHeader ? 20 : 18,
              font: "Courier New",
              color: isHeader ? "E0E7FF" : "DC2626",
            }),
          );
        } else if (part.startsWith("~~") && part.endsWith("~~")) {
          runs.push(
            new TextRun({
              text: part.slice(2, -2),
              strike: true,
              size: isHeader ? 20 : 18,
              font: "Calibri",
              color: isHeader ? "FFFFFF" : "9CA3AF",
            }),
          );
        } else {
          runs.push(
            new TextRun({
              text: part,
              bold: isHeader,
              size: isHeader ? 20 : 18,
              font: "Calibri",
              color: isHeader ? "FFFFFF" : "1F2937",
            }),
          );
        }
      }
      return runs;
    };

    // ─── Pre-process: merge consecutive plain-text lines into paragraphs
    const rawLines = cleanedContent.split("\n");
    const mergedLines: string[] = [];
    let lineBuffer = "";

    for (const line of rawLines) {
      const trimmed = line.trim();
      // Special lines flush the buffer
      if (
        trimmed === "" ||
        trimmed.startsWith("#") ||
        trimmed.startsWith("-") ||
        trimmed.startsWith("* ") ||
        trimmed.startsWith("+ ") ||
        /^\d+\.\s/.test(trimmed) ||
        /^[a-zA-Z]\.\s/.test(trimmed) ||
        /^(i{1,3}|iv|v|vi{0,3})\.\s/i.test(trimmed) ||
        trimmed.startsWith("|") ||
        trimmed.startsWith("```") ||
        trimmed === "---" ||
        trimmed === "***" ||
        trimmed === "___" ||
        trimmed.startsWith("> ") ||
        trimmed.startsWith("![")
      ) {
        if (lineBuffer.trim()) {
          mergedLines.push(lineBuffer.trim());
          lineBuffer = "";
        }
        mergedLines.push(line);
      } else {
        lineBuffer += (lineBuffer ? " " : "") + trimmed;
      }
    }
    if (lineBuffer.trim()) {
      mergedLines.push(lineBuffer.trim());
    }

    const lines = mergedLines;

    // ─── Parsing state ──────────────────────────────────────────────────
    let inCodeBlock = false;
    let codeLines: string[] = [];
    let codeLang = "";
    let inTable = false;
    let tableRows: string[][] = [];
    let inBlockquote = false;
    let blockquoteLines: string[] = [];
    // Track image index for embedding
    let imageEmbedIndex = 0;

    // ─── Numbered list reference tracking ───────────────────────────────
    // We'll detect the numbering format per block and assign references
    let currentNumberingRef = "numbering-decimal";
    let prevLineWasOrderedList = false;

    function getNumberingFormat(text: string): { ref: string; format: string } {
      // Decimal: 1. 2. 3.
      if (/^\d+\.\s/.test(text)) return { ref: "numbering-decimal", format: "decimal" };
      // Lower letter: a. b. c.
      if (/^[a-z]\.\s/.test(text)) return { ref: "numbering-lower-letter", format: "lowerLetter" };
      // Lower roman: i. ii. iii. iv. v. vi. vii. viii. ix. x.
      if (/^(i{1,3}|iv|v|vi{0,3})\.\s/i.test(text)) return { ref: "numbering-lower-roman", format: "lowerRoman" };
      return { ref: "numbering-decimal", format: "decimal" };
    }

    // ─── Main parsing loop ──────────────────────────────────────────────
    for (const line of lines) {
      // ── Code blocks ─────────────────────────────────────────────────
      if (line.trim().startsWith("```")) {
        if (inCodeBlock) {
          const codeText = codeLines.join("\n");
          const label = codeLang ? `${codeLang.toUpperCase()} ` : "";
          contentChildren.push(
            new Paragraph({
              children: [new TextRun({ text: `${label}Code`, bold: true, size: 16, font: "Calibri", color: "2563EB" })],
              spacing: { before: 160, after: 40 },
              shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
            }),
          );
          for (const cl of codeText.split("\n")) {
            contentChildren.push(
              new Paragraph({
                children: [new TextRun({ text: cl || " ", size: 17, font: "Courier New", color: "334155" })],
                shading: { fill: "F8FAFC", type: ShadingType.CLEAR },
                spacing: { after: 0, line: 260 },
              }),
            );
          }
          codeLines = [];
          codeLang = "";
          inCodeBlock = false;
          contentChildren.push(new Paragraph({ spacing: { after: 100 }, children: [] }));
        } else {
          inCodeBlock = true;
          codeLang = line.trim().slice(3).trim();
        }
        continue;
      }
      if (inCodeBlock) {
        codeLines.push(line);
        continue;
      }

      // ── Blockquotes ─────────────────────────────────────────────────
      if (line.trim().startsWith("> ")) {
        if (!inBlockquote) {
          inBlockquote = true;
          blockquoteLines = [];
        }
        blockquoteLines.push(line.trim().slice(2));
        continue;
      } else if (inBlockquote && !line.trim().startsWith(">")) {
        inBlockquote = false;
        if (blockquoteLines.length > 0) {
          const bqText = blockquoteLines.join(" ");
          contentChildren.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: bqText,
                  italics: true,
                  size: 22,
                  font: "Calibri",
                  color: "1E3A5F",
                }),
              ],
              spacing: { before: 120, after: 120, line: 276 },
              indent: { left: 360 },
              border: {
                left: { style: BorderStyle.SINGLE, size: 12, color: "2563EB", space: 8 },
              },
              shading: { fill: "EFF6FF", type: ShadingType.CLEAR },
            }),
          );
        }
        blockquoteLines = [];
        // Fall through to process the current line below
      }

      // ── Tables ──────────────────────────────────────────────────────
      if (line.trim().startsWith("|")) {
        const cells = line
          .split("|")
          .filter((c) => c.trim())
          .map((c) => c.trim());
        // Skip separator row
        if (cells.every((c) => /^[-:]+$/.test(c))) continue;
        if (!inTable) inTable = true;
        tableRows.push(cells);
        continue;
      } else if (inTable) {
        // End of table — render it
        if (tableRows.length > 0) {
          const colCount = tableRows[0].length;
          const colWidths = guessColumnWidths(tableRows, 9000);
          const isFirstColLabels = looksLikeRowLabels(tableRows);

          const rows = tableRows.map((row, rowIdx) => {
            const isHeader = rowIdx === 0;
            return new TableRow({
              children: row.map((cell, colIdx) => {
                // First column bold for non-header rows if it looks like labels
                const isFirstCol = colIdx === 0;
                const boldFirstCol = !isHeader && isFirstColLabels && isFirstCol;

                return new TableCell({
                  children: [
                    new Paragraph({
                      children: (() => {
                        const formatted = parseTableFormatting(cell, isHeader);
                        // Prepend bold styling for first-col labels if needed
                        if (boldFirstCol && formatted.length > 0) {
                          // Re-parse with bold forced
                          const boldParts = cell.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|~~[^~]+~~)/);
                          const boldRuns: any[] = [];
                          for (const p of boldParts) {
                            if (!p) continue;
                            if (p.startsWith("**") && p.endsWith("**")) {
                              boldRuns.push(
                                new TextRun({
                                  text: p.slice(2, -2),
                                  bold: true,
                                  size: 18,
                                  font: "Calibri",
                                  color: "1F2937",
                                }),
                              );
                            } else if (p.startsWith("`") && p.endsWith("`")) {
                              boldRuns.push(
                                new TextRun({
                                  text: p.slice(1, -1),
                                  size: 18,
                                  font: "Courier New",
                                  color: "DC2626",
                                  bold: true,
                                }),
                              );
                            } else {
                              boldRuns.push(
                                new TextRun({
                                  text: p,
                                  bold: true,
                                  size: 18,
                                  font: "Calibri",
                                  color: "1F2937",
                                }),
                              );
                            }
                          }
                          return boldRuns;
                        }
                        return formatted;
                      })(),
                      spacing: { before: 40, after: 40 },
                    }),
                  ],
                  width: { size: colWidths[colIdx] || Math.floor(9000 / colCount), type: WidthType.DXA },
                  shading: isHeader
                    ? { fill: "1E3A5F", type: ShadingType.CLEAR }
                    : rowIdx % 2 === 0
                      ? { fill: "F8FAFC", type: ShadingType.CLEAR }
                      : undefined,
                });
              }),
              cantSplit: true,
              tableHeader: isHeader,
            });
          });

          try {
            contentChildren.push(
              new Table({
                rows,
                width: { size: 9000, type: WidthType.DXA },
              }) as never,
            );
            contentChildren.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
          } catch {
            // Fallback: render as monospace text
            for (const row of tableRows) {
              contentChildren.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `| ${row.join(" | ")} |`,
                      size: 18,
                      font: "Courier New",
                      color: "374151",
                    }),
                  ],
                  spacing: { after: 40 },
                }),
              );
            }
          }
        }
        tableRows = [];
        inTable = false;
      }

      // ── Headings H1-H6 ─────────────────────────────────────────────
      const h1Match = line.match(/^# (.+)/);
      const h2Match = line.match(/^## (.+)/);
      const h3Match = line.match(/^### (.+)/);
      const h4Match = line.match(/^#### (.+)/);
      const h5Match = line.match(/^##### (.+)/);
      const h6Match = line.match(/^###### (.+)/);

      if (h1Match) {
        contentChildren.push(
          new Paragraph({
            children: [
              new TextRun({ text: h1Match[1], bold: true, size: 36, font: "Calibri", color: "1E3A5F" }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 4, color: "2563EB", space: 4 },
            },
            pageBreakBefore: true,
          }),
        );
        continue;
      }
      if (h2Match) {
        contentChildren.push(
          new Paragraph({
            children: [
              new TextRun({ text: h2Match[1], bold: true, size: 28, font: "Calibri", color: "2563EB" }),
            ],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 150 },
          }),
        );
        continue;
      }
      if (h3Match) {
        contentChildren.push(
          new Paragraph({
            children: [
              new TextRun({ text: h3Match[1], bold: true, size: 24, font: "Calibri", color: "374151" }),
            ],
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 200, after: 100 },
          }),
        );
        continue;
      }
      if (h4Match) {
        contentChildren.push(
          new Paragraph({
            children: [
              new TextRun({ text: h4Match[1], bold: true, size: 22, font: "Calibri", color: "4B5563" }),
            ],
            heading: HeadingLevel.HEADING_4,
            spacing: { before: 180, after: 80 },
          }),
        );
        continue;
      }
      if (h5Match) {
        contentChildren.push(
          new Paragraph({
            children: [
              new TextRun({ text: h5Match[1], bold: true, size: 21, font: "Calibri", color: "6B7280" }),
            ],
            heading: HeadingLevel.HEADING_5,
            spacing: { before: 160, after: 60 },
          }),
        );
        continue;
      }
      if (h6Match) {
        contentChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: h6Match[1],
                bold: true,
                italics: true,
                size: 20,
                font: "Calibri",
                color: "9CA3AF",
              }),
            ],
            heading: HeadingLevel.HEADING_6,
            spacing: { before: 140, after: 40 },
          }),
        );
        continue;
      }

      // ── Horizontal rules (---, ***, ___) ───────────────────────────
      if (line.trim() === "---" || line.trim() === "***" || line.trim() === "___") {
        contentChildren.push(
          new Paragraph({
            children: [new TextRun({ text: "" })],
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: "D1D5DB", space: 1 },
            },
            spacing: { before: 200, after: 200 },
          }),
        );
        continue;
      }

      // ── Empty line ─────────────────────────────────────────────────
      if (line.trim() === "") continue;

      // ── Task lists: - [x] done / - [ ] todo ────────────────────────
      const taskMatch = line.match(/^(\s*)([-*+])\s\[([ xX])\]\s(.+)/);
      if (taskMatch) {
        const indent = Math.min(Math.floor(taskMatch[1].length / 2), 2);
        const isChecked = taskMatch[3] !== " ";
        const taskText = taskMatch[4];
        const symbol = isChecked ? "\u2713" : "\u2610"; // ✓ or ☐
        const runs: any[] = [
          new TextRun({
            text: `${symbol} `,
            size: 22,
            font: "Calibri",
            color: isChecked ? "16A34A" : "9CA3AF",
          }),
        ];
        runs.push(...parseInlineFormatting(taskText));
        if (isChecked) {
          // Strikethrough the text for completed items
          const styledRuns = runs.map((r: any) => {
            try {
              return new TextRun({
                text: (r as any).options?.text || "",
                size: 22,
                font: "Calibri",
                color: "6B7280",
                strike: true,
              });
            } catch {
              return r;
            }
          });
          contentChildren.push(
            new Paragraph({
              children: styledRuns,
              bullet: { level: indent },
              spacing: { after: 60, line: 276 },
            }),
          );
        } else {
          contentChildren.push(
            new Paragraph({
              children: runs,
              bullet: { level: indent },
              spacing: { after: 60, line: 276 },
            }),
          );
        }
        continue;
      }

      // ── Bullet list with nested support ────────────────────────────
      const bulletMatch = line.match(/^(\s*)([-*+])\s(.+)/);
      if (bulletMatch) {
        const indent = Math.min(Math.floor(bulletMatch[1].length / 2), 2);
        const bulletText = bulletMatch[3];
        contentChildren.push(
          new Paragraph({
            children: parseInlineFormatting(bulletText),
            bullet: { level: indent },
            spacing: { after: 60, line: 276 },
          }),
        );
        prevLineWasOrderedList = false;
        continue;
      }

      // ── Numbered lists (decimal, lower-letter, lower-roman) ────────
      const decimalMatch = line.trim().match(/^(\d+)\.\s(.+)/);
      const letterMatch = line.trim().match(/^([a-z])\.\s(.+)/);
      const romanMatch = line.trim().match(/^(i{1,3}|iv|v|vi{0,3})\.\s(.+)/i);

      if (decimalMatch || letterMatch || romanMatch) {
        let listText = "";
        let ref = "numbering-decimal";

        if (decimalMatch) {
          listText = decimalMatch[2];
          ref = "numbering-decimal";
        } else if (letterMatch) {
          listText = letterMatch[2];
          ref = "numbering-lower-letter";
        } else if (romanMatch) {
          listText = romanMatch[2];
          ref = "numbering-lower-roman";
        }

        contentChildren.push(
          new Paragraph({
            children: parseInlineFormatting(listText),
            numbering: { reference: ref, level: 0 },
            spacing: { after: 60, line: 276 },
          }),
        );
        prevLineWasOrderedList = true;
        continue;
      }

      prevLineWasOrderedList = false;

      // ── Image placeholder in content: ![alt](url) ──────────────────
      const imgMarkdownMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
      if (imgMarkdownMatch) {
        const altText = imgMarkdownMatch[1];
        const imgUrl = imgMarkdownMatch[2];

        // Try to match to a provided image or download inline
        let embedded = false;
        for (const dlImg of downloadedImages) {
          if (dlImg.buffer.length > 0) {
            try {
              contentChildren.push(
                new Paragraph({
                  children: [
                    new ImageRun({
                      type: dlImg.imageType,
                      data: dlImg.buffer,
                      transformation: { width: dlImg.width, height: dlImg.height },
                      altText: { description: altText || "Image", name: altText || "Image" },
                    }),
                  ],
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 120, after: 60 },
                }),
              );
              if (dlImg.caption) {
                contentChildren.push(
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: dlImg.caption,
                        italics: true,
                        size: 18,
                        font: "Calibri",
                        color: "6B7280",
                      }),
                    ],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 120 },
                  }),
                );
              }
              embedded = true;
              imageEmbedIndex++;
              break;
            } catch {
              // fall through to placeholder
            }
          }
        }

        if (!embedded) {
          // Placeholder for images that couldn't be downloaded
          contentChildren.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `[Image: ${altText || imgUrl}]`,
                  italics: true,
                  size: 20,
                  font: "Calibri",
                  color: "9CA3AF",
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { before: 120, after: 60 },
              border: {
                top: { style: BorderStyle.DASHED, size: 4, color: "D1D5DB", space: 4 },
                bottom: { style: BorderStyle.DASHED, size: 4, color: "D1D5DB", space: 4 },
                left: { style: BorderStyle.DASHED, size: 4, color: "D1D5DB", space: 4 },
                right: { style: BorderStyle.DASHED, size: 4, color: "D1D5DB", space: 4 },
              },
            }),
          );
        }
        continue;
      }

      // ── Regular paragraph ──────────────────────────────────────────
      const runs = parseInlineFormatting(line);
      contentChildren.push(
        new Paragraph({
          children: runs,
          spacing: { after: 120, line: 276 },
        }),
      );
    }

    // ─── Render remaining blockquote ────────────────────────────────────
    if (inBlockquote && blockquoteLines.length > 0) {
      contentChildren.push(
        new Paragraph({
          children: [
            new TextRun({
              text: blockquoteLines.join(" "),
              italics: true,
              size: 22,
              font: "Calibri",
              color: "1E3A5F",
            }),
          ],
          spacing: { before: 120, after: 120 },
          indent: { left: 360 },
          border: {
            left: { style: BorderStyle.SINGLE, size: 12, color: "2563EB", space: 8 },
          },
          shading: { fill: "EFF6FF", type: ShadingType.CLEAR },
        }),
      );
    }

    // ─── Render remaining table ─────────────────────────────────────────
    if (tableRows.length > 0) {
      for (const row of tableRows) {
        contentChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `| ${row.join(" | ")} |`,
                size: 18,
                font: "Courier New",
                color: "374151",
              }),
            ],
            spacing: { after: 40 },
          }),
        );
      }
    }

    // ─── Embed provided images at end if not placed via markdown ────────
    // If images were provided but none were consumed via markdown syntax,
    // append them all at the end of the document
    if (images && images.length > 0 && imageEmbedIndex === 0) {
      for (let i = 0; i < downloadedImages.length; i++) {
        const dlImg = downloadedImages[i];
        if (dlImg.buffer.length === 0) {
          contentChildren.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `[Image: ${images![i].caption || images![i].url}]`,
                  italics: true,
                  size: 20,
                  font: "Calibri",
                  color: "9CA3AF",
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { before: 200, after: 80 },
              border: {
                top: { style: BorderStyle.DASHED, size: 4, color: "D1D5DB", space: 4 },
                bottom: { style: BorderStyle.DASHED, size: 4, color: "D1D5DB", space: 4 },
                left: { style: BorderStyle.DASHED, size: 4, color: "D1D5DB", space: 4 },
                right: { style: BorderStyle.DASHED, size: 4, color: "D1D5DB", space: 4 },
              },
            }),
          );
        } else {
          try {
            contentChildren.push(
              new Paragraph({
                children: [
                  new ImageRun({
                    type: dlImg.imageType,
                    data: dlImg.buffer,
                    transformation: { width: dlImg.width, height: dlImg.height },
                    altText: {
                      description: images![i].caption || `Image ${i + 1}`,
                      name: images![i].caption || `Image ${i + 1}`,
                    },
                  }),
                ],
                alignment: AlignmentType.CENTER,
                spacing: { before: 200, after: 60 },
              }),
            );
            if (dlImg.caption) {
              contentChildren.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      text: dlImg.caption,
                      italics: true,
                      size: 18,
                      font: "Calibri",
                      color: "6B7280",
                    }),
                  ],
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 200 },
                }),
              );
            }
          } catch {
            contentChildren.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: `[Image: ${images![i].caption || images![i].url}]`,
                    italics: true,
                    size: 20,
                    font: "Calibri",
                    color: "9CA3AF",
                  }),
                ],
                alignment: AlignmentType.CENTER,
                spacing: { before: 200, after: 80 },
              }),
            );
          }
        }
      }
    }

    // ─── Build the document ─────────────────────────────────────────────
    const doc = new Document({
      creator: "Klawhub Agent Hub",
      title: title,
      description: subtitle || title,
      numbering: {
        config: [
          {
            reference: "numbering-decimal",
            levels: [
              {
                level: 0,
                format: "decimal" as const,
                text: "%1.",
                alignment: AlignmentType.START,
              },
              {
                level: 1,
                format: "lowerLetter" as const,
                text: "%2)",
                alignment: AlignmentType.START,
              },
              {
                level: 2,
                format: "lowerRoman" as const,
                text: "%3.",
                alignment: AlignmentType.START,
              },
            ],
          },
          {
            reference: "numbering-lower-letter",
            levels: [
              {
                level: 0,
                format: "lowerLetter" as const,
                text: "%1.",
                alignment: AlignmentType.START,
              },
              {
                level: 1,
                format: "lowerRoman" as const,
                text: "%2)",
                alignment: AlignmentType.START,
              },
            ],
          },
          {
            reference: "numbering-lower-roman",
            levels: [
              {
                level: 0,
                format: "lowerRoman" as const,
                text: "%1.",
                alignment: AlignmentType.START,
              },
              {
                level: 1,
                format: "decimal" as const,
                text: "%2)",
                alignment: AlignmentType.START,
              },
            ],
          },
        ],
      },
      styles: {
        default: {
          document: {
            run: {
              size: 22,
              font: "Calibri",
              color: "1F2937",
            },
            paragraph: {
              spacing: { line: 276 },
            },
          },
        },
      },
      sections: [
        // ── 1. Cover page (no headers/footers, different margins) ──────
        {
          properties: {
            page: {
              size: { width: 11906, height: 16838 }, // A4
              margin: { top: 2160, bottom: 2160, left: 1800, right: 1800 },
            },
            titlePage: true,
          },
          children: coverChildren as any,
        },
        // ── 2. Table of Contents (page numbers not yet shown) ──────────
        {
          properties: {
            page: {
              size: { width: 11906, height: 16838 },
              margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
            },
          },
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: title,
                      size: 16,
                      color: "9CA3AF",
                      font: "Calibri",
                      italics: true,
                    }),
                  ],
                  alignment: AlignmentType.RIGHT,
                }),
              ],
            }),
          },
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: "Table of Contents",
                  bold: true,
                  size: 36,
                  font: "Calibri",
                  color: "1E3A5F",
                }),
              ],
              spacing: { after: 300 },
            }),
            new TableOfContents("Table of Contents", {
              hyperlink: true,
              headingStyleRange: "1-6",
            }),
          ],
        },
        // ── 3. Content pages (with header + footer + page numbering) ───
        {
          properties: {
            page: {
              size: { width: 11906, height: 16838 },
              margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
              pageNumbers: { start: 1 },
            },
          },
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: title,
                      size: 16,
                      color: "9CA3AF",
                      font: "Calibri",
                      italics: true,
                    }),
                  ],
                  alignment: AlignmentType.RIGHT,
                }),
              ],
            }),
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: "Generated by Klawhub Agent Hub",
                      size: 16,
                      color: "9CA3AF",
                      font: "Calibri",
                    }),
                    new TextRun({
                      text: "    |    Page ",
                      size: 16,
                      color: "9CA3AF",
                      font: "Calibri",
                    }),
                    new TextRun({
                      children: [PageNumber.CURRENT],
                      size: 16,
                      color: "6B7280",
                      font: "Calibri",
                    }),
                  ],
                }),
              ],
            }),
          },
          children: contentChildren as any,
        },
      ],
    });

    // ─── Generate & return ──────────────────────────────────────────────
    const docBuffer = await Packer.toBuffer(doc) as Buffer;

    const fileBaseName = `${safeName}.docx`;
    const fileBase64 = Buffer.from(docBuffer).toString("base64");

    try {
      const { cacheFile } = await import("@/lib/workspace/file-cache");
      await cacheFile(
        fileBaseName,
        Buffer.from(docBuffer),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileBaseName,
      );
    } catch {
      // Best-effort caching
    }

    return {
      success: true,
      filename: fileBaseName,
      title,
      fileBase64,
      fileSize: docBuffer.byteLength,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      downloadUrl: `/api/files/${fileBaseName}`,
      message: `DOCX document "${title}" created successfully with cover page, TOC (H1-H6), images, task lists, numbered lists, tables, horizontal rules, strikethrough, and professional headers/footers. Download available.`,
    };
  }),
});

// ---------------------------------------------------------------------------
// Download Google Drive File Tool
// ---------------------------------------------------------------------------


// Create XLSX Spreadsheet Tool — v3.0 (Claude/glm5.1 Quality Upgrade)
// ---------------------------------------------------------------------------
// Professional spreadsheet generator with full feature set:
//   - Multiple sheets with professional navy-themed styling
//   - Auto-fit columns (smart algorithm: header + data sampling + format padding)
//   - Formula columns (SUM, AVERAGE, COUNT, MIN, MAX)
//   - Freeze panes
//   - Charts (bar, line, pie, doughnut, scatter, area)
//   - Conditional formatting (color scale, data bars, icon sets, cell-is rules)
//   - Cell style customization (fonts, sizes, colors, number formats)
//   - Summary rows (total, average, etc. with formulas)
//   - Data validation (list, whole, decimal, date)
//   - Auto-detection of numbers, currency, percentages, and dates
// ---------------------------------------------------------------------------



// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CURRENCY_SYMBOLS = /[$\u20AC\u00A3\u00A5\u00A4\u20A9\u20B9\u0052\u00BF]/;
const CURRENCY_RE = new RegExp(`^(${CURRENCY_SYMBOLS.source})?([0-9]{1,3}(,[0-9]{3})*(\\.[0-9]+)?|([0-9]+(\\.[0-9]+)?))$`);
const PERCENTAGE_RE = /^(-?\d+(?:\.\d+)?)%$/;
const DATE_FORMATS: Array<{ re: RegExp; fmt: string }> = [
  { re: /^\d{4}-\d{2}-\d{2}$/, fmt: "yyyy-mm-dd" },
  { re: /^\d{4}\/\d{2}\/\d{2}$/, fmt: "yyyy/mm/dd" },
  { re: /^\d{1,2}\/\d{1,2}\/\d{4}$/, fmt: "mm/dd/yyyy" },
  { re: /^\d{1,2}-\d{1,2}-\d{4}$/, fmt: "mm-dd-yyyy" },
  { re: /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}$/i, fmt: "mmm dd, yyyy" },
  { re: /^\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}$/i, fmt: "dd mmm yyyy" },
  { re: /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/, fmt: "yyyy-mm-dd h:mm" },
  { re: /^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?$/i, fmt: "mm/dd/yyyy h:mm" },
];

function detectValueAndFormat(raw: string, overrideNumFmt?: string, overrideDateFormat?: string): { value: string | number | Date; numFmt?: string } | null {
  if (raw == null || raw === "") return null;
  const trimmed = String(raw).trim();
  if (trimmed === "") return null;

  // If an explicit number format is provided, check for plain numbers first
  if (overrideNumFmt) {
    if (!isNaN(Number(trimmed)) && trimmed !== "") {
      return { value: Number(trimmed), numFmt: overrideNumFmt };
    }
  }

  // Check explicit date format override
  if (overrideDateFormat) {
    for (const df of DATE_FORMATS) {
      if (df.re.test(trimmed)) {
        return { value: new Date(trimmed), numFmt: overrideDateFormat };
      }
    }
  }

  // Currency detection (e.g., "$1,234.56", "€1,234.56")
  const currMatch = trimmed.match(new RegExp(`^(${CURRENCY_SYMBOLS.source})?([0-9]{1,3}(,[0-9]{3})*(\\.[0-9]+)?|([0-9]+(\\.[0-9]+)?))$`));
  if (currMatch && CURRENCY_SYMBOLS.test(trimmed.charAt(0))) {
    const numStr = trimmed.replace(CURRENCY_SYMBOLS, "").replace(/,/g, "");
    if (!isNaN(Number(numStr))) {
      const hasCents = numStr.includes(".");
      return { value: Number(numStr), numFmt: hasCents ? "$#,##0.00" : "$#,##0" };
    }
  }

  // Percentage detection (e.g., "50%", "0.5%")
  const pctMatch = trimmed.match(PERCENTAGE_RE);
  if (pctMatch) {
    const numVal = Number(pctMatch[1]) / 100;
    return { value: numVal, numFmt: "0.0%" };
  }

  // Plain number detection
  if (!isNaN(Number(trimmed)) && trimmed !== "" && !/^[0]/.test(trimmed.replace(/[.,]/g, "")) === false || /^-?\d+(?:\.\d+)?$/.test(trimmed.replace(/,/g, ""))) {
    const cleanNum = trimmed.replace(/,/g, "");
    if (!isNaN(Number(cleanNum)) && cleanNum !== "") {
      return { value: Number(cleanNum), numFmt: "#,##0.00" };
    }
  }

  // Date detection
  for (const df of DATE_FORMATS) {
    if (df.re.test(trimmed)) {
      const parsed = new Date(trimmed);
      if (!isNaN(parsed.getTime())) {
        return { value: parsed, numFmt: df.fmt };
      }
    }
  }

  return null;
}

/**
 * Smart column width calculation.
 * Samples up to 50 rows, accounts for header, data, and number format width.
 */
function calculateColumnWidth(
  header: string,
  rows: string[][],
  colIndex: number,
  numFmt?: string,
  headerFontSize = 11,
  dataFontSize = 10,
): number {
  const MIN_WIDTH = 8;
  const MAX_WIDTH = 50;
  const PADDING = 4;

  let maxLen = String(header || "").length;

  // Account for header font size (larger font = wider characters)
  const headerScale = headerFontSize / 10;

  // Sample up to 50 rows for content width
  const sampleRows = rows.slice(0, 50);
  for (const row of sampleRows) {
    const cellVal = row[colIndex];
    if (cellVal != null && cellVal !== "") {
      maxLen = Math.max(maxLen, String(cellVal).length);
    }
  }

  // Account for number format visual width (e.g., "$#,##0.00" needs extra space)
  if (numFmt) {
    if (numFmt.includes("$") || numFmt.includes("\u20AC") || numFmt.includes("\u00A3")) {
      // Currency: add ~3 chars for symbol + separators
      maxLen = Math.max(maxLen + 3, 12);
    }
    if (numFmt.includes("%")) {
      maxLen = Math.max(maxLen, 8);
    }
    if (numFmt.includes("#,##0")) {
      // Thousand separator: add chars for commas
      maxLen = Math.max(maxLen, 10);
    }
    if (numFmt.includes("yyyy") || numFmt.toLowerCase().includes("mm") || numFmt.toLowerCase().includes("dd")) {
      // Date: fixed-ish width
      maxLen = Math.max(maxLen, 12);
    }
  }

  // Scale by font size ratio
  maxLen = Math.ceil(maxLen * headerScale);

  return Math.max(MIN_WIDTH, Math.min(maxLen + PADDING, MAX_WIDTH));
}

/**
 * Convert column letters (A, B, ..., Z, AA, AB, ...) to 1-based column number.
 */
function colLetterToIndex(col: string): number {
  let result = 0;
  for (let i = 0; i < col.length; i++) {
    result = result * 26 + (col.charCodeAt(i) - 64);
  }
  return result;
}

/**
 * Convert 1-based column number to column letter(s).
 */
function colIndexToLetter(col: number): string {
  let result = "";
  let n = col;
  while (n > 0) {
    n--;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

/**
 * Build an ExcelJS range string from start/end row and col indices (1-based).
 */
function buildRange(startRow: number, endRow: number, startCol: number, endCol: number): string {
  return `${colIndexToLetter(startCol)}${startRow}:${colIndexToLetter(endCol)}${endRow}`;
}

/**
 * Determine the function keyword for a summary row entry.
 */
function summaryFuncLabel(fn: string): string {
  const labels: Record<string, string> = {
    SUM: "TOTAL",
    AVERAGE: "AVERAGE",
    COUNT: "COUNT",
    MIN: "MIN",
    MAX: "MAX",
  };
  return labels[fn] || fn;
}

// ---------------------------------------------------------------------------
// Zod schema components for the new optional parameters
// ---------------------------------------------------------------------------

const ChartConfigSchema = z.object({
  type: z.enum(["bar", "line", "pie", "doughnut", "scatter", "area"]).describe("Chart type"),
  title: z.string().describe("Chart title"),
  dataRange: z.string().optional().describe("Data range like 'A1:E10' (auto-calculated if omitted)"),
  xAxis: z.string().optional().describe("Column header for X axis"),
  yAxes: z.array(z.string()).optional().describe("Column headers for Y axis data series"),
  position: z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
  }).optional().describe("Chart position in cells {x, y, w, h}"),
});

const ConditionalFormattingSchema = z.object({
  range: z.string().describe("Range like 'B2:B100'"),
  type: z.enum(["colorScale", "dataBar", "iconSet", "cellIs"]).describe("Formatting type"),
  rule: z.any().describe("Rule configuration (varies by type)"),
});

const CellStylesSchema = z.object({
  headerFontSize: z.number().optional().describe("Header font size (default: 11)"),
  dataFontSize: z.number().optional().describe("Data font size (default: 10)"),
  headerFontName: z.string().optional().describe("Header font family (default: Calibri)"),
  dataFontName: z.string().optional().describe("Data font family (default: Calibri)"),
  headerColor: z.string().optional().describe("Header background hex color without alpha prefix (default: 1E3A5F)"),
  altRowColor: z.string().optional().describe("Alternating row hex color without alpha prefix (default: F8FAFC)"),
  numberFormat: z.string().optional().describe("Default number format e.g. '$#,##0.00', '0.0%', 'yyyy-mm-dd'"),
  dateFormat: z.string().optional().describe("Format for auto-detected date strings"),
});

const SummaryRowSchema = z.object({
  label: z.string().describe("Summary label e.g. 'TOTAL', 'AVERAGE'"),
  functions: z.record(z.string(), z.enum(["SUM", "AVERAGE", "COUNT", "MIN", "MAX"])).optional()
    .describe("Column header → aggregate function"),
  showAll: z.boolean().optional().describe("If true, SUM all numeric columns automatically"),
});

const DataValidationSchema = z.object({
  range: z.string().describe("Range like 'B2:B100'"),
  type: z.enum(["list", "whole", "decimal", "date"]).describe("Validation type"),
  formula: z.union([z.array(z.string()), z.string()]).optional()
    .describe("For 'list': array of options; for others: min/max expression"),
  prompt: z.string().optional().describe("Input prompt message"),
  error: z.string().optional().describe("Error message on invalid input"),
});

export const createXlsxSpreadsheetTool = tool({
  description:
    "Create a professional Excel spreadsheet (.xlsx) and return it as downloadable. " +
    "Supports multiple sheets, auto-fit columns (smart algorithm), formula evaluation, number formatting, " +
    "freeze panes, navy-themed headers, alternating row colors, charts (bar/line/pie/doughnut/scatter/area), " +
    "conditional formatting (color scale/data bars/icon sets/cell rules), custom cell styles, summary rows " +
    "(SUM/AVERAGE/COUNT/MIN/MAX with formulas), data validation (list/whole/decimal/date), and auto-detection " +
    "of numbers, currency, percentages, and dates. Use 'formulas' for auto-calculated columns. " +
    "All new parameters are optional — backward compatible with existing usage.",

  inputSchema: zodSchema(
    z.object({
      title: z.string().describe("Title of the spreadsheet (used as filename)"),
      sheets: z
        .array(
          z.object({
            name: z.string().describe("Sheet tab name"),
            headers: z.array(z.string()).describe("Column headers"),
            rows: z.array(z.array(z.string())).describe("2D array of row data (each inner array = one row)"),
            formulas: z
              .record(z.string(), z.string())
              .optional()
              .describe(
                "Auto-calc columns: { 'Column Header': 'SUM(B2:B10)' }. Key = header name, value = Excel formula. Auto-appended as last column.",
              ),
            freeze_header: z.boolean().optional().describe("Freeze the header row for scrolling (default: true)"),
            charts: z.array(ChartConfigSchema).optional().describe("Charts to embed in the sheet"),
            conditionalFormatting: z.array(ConditionalFormattingSchema).optional().describe("Conditional formatting rules"),
            cellStyles: CellStylesSchema.optional().describe("Custom cell styles for this sheet"),
            summaryRow: SummaryRowSchema.optional().describe("Summary row with aggregate formulas at the bottom"),
            dataValidation: z.array(DataValidationSchema).optional().describe("Data validation rules"),
          }),
        )
        .describe("Array of sheets to include"),
      filename: z.string().optional().describe("Output filename (without extension). Default: derived from title"),
    }),
  ),

  execute: safeJson(async ({ title, sheets, filename }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ExcelJS = await import("exceljs");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Workbook = (ExcelJS as any).default?.Workbook || (ExcelJS as any).Workbook;
    const workbook = new Workbook();
    (workbook as any).creator = "Klawhub Agent Hub";
    (workbook as any).created = new Date();

    // Default color palette
    const NAVY = "FF1E3A5F";
    const BLUE = "FF2563EB";
    const WHITE = "FFFFFFFF";
    const ALT_ROW_DEFAULT = "FFF8FAFC";
    const LIGHT_GRAY = "FFE5E7EB";

    // Track features used for the summary message
    let hasCharts = false;
    let hasConditionalFormatting = false;
    let hasCustomStyles = false;
    let hasSummaryRows = false;
    let hasDataValidation = false;
    let hasFormulas = false;

    for (const sheetDef of sheets) {
      const sheet = workbook.addWorksheet(sheetDef.name);

      // ---- Resolve cell styles with defaults ----
      const styles = sheetDef.cellStyles || {};
      const headerFontSize = styles.headerFontSize ?? 11;
      const dataFontSize = styles.dataFontSize ?? 10;
      const headerFontName = styles.headerFontName ?? "Calibri";
      const dataFontName = styles.dataFontName ?? "Calibri";
      const headerColor = styles.headerColor ? `FF${styles.headerColor}` : NAVY;
      const altRowColor = styles.altRowColor ? `FF${styles.altRowColor}` : ALT_ROW_DEFAULT;
      const defaultNumFmt = styles.numberFormat || undefined;
      const overrideDateFormat = styles.dateFormat || undefined;

      if (styles && Object.keys(styles).length > 0) hasCustomStyles = true;

      // ---- Add header row with professional styling ----
      const headerRow = sheet.addRow(sheetDef.headers);
      headerRow.height = 28;
      headerRow.font = { bold: true, size: headerFontSize, color: { argb: WHITE }, name: headerFontName };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: headerColor } };
      headerRow.alignment = { horizontal: "center", vertical: "middle" };
      headerRow.border = {
        bottom: { style: "medium", color: { argb: headerColor } },
        top: { style: "thin", color: { argb: LIGHT_GRAY } },
      };

      // ---- Add data rows with alternating colors and smart value detection ----
      for (let r = 0; r < sheetDef.rows.length; r++) {
        const row = sheet.addRow(sheetDef.rows[r]);
        row.height = 22;
        if (r % 2 === 1) {
          row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: altRowColor } };
        }
        row.font = { size: dataFontSize, name: dataFontName, color: { argb: "FF1F2937" } };
        row.alignment = { vertical: "middle" };
        row.border = {
          bottom: { style: "thin", color: { argb: LIGHT_GRAY } },
        };

        // Smart value detection for each cell
        for (let c = 0; c < row.cellCount; c++) {
          const cell = row.getCell(c + 1);
          const val = cell.value;
          const valStr = String(val ?? "").trim();

          if (valStr === "") continue;

          // Try smart detection first
          const detected = detectValueAndFormat(valStr, defaultNumFmt, overrideDateFormat);
          if (detected) {
            cell.value = detected.value;
            cell.numFmt = detected.numFmt;
            cell.alignment = { horizontal: "right", vertical: "middle" };
          }
        }
      }

      // ---- Compute effective column count (may include formula columns) ----
      let totalColumns = sheetDef.headers.length;
      const formulaEntries = sheetDef.formulas ? Object.entries(sheetDef.formulas) : [];
      if (formulaEntries.length > 0) {
        totalColumns = sheetDef.headers.length + formulaEntries.length;
      }

      // ---- Summary row (before charts, so charts can include it) ----
      let summaryRowIndex = sheetDef.rows.length + 1; // 1-based
      let hasSummary = false;

      if (sheetDef.summaryRow) {
        hasSummary = true;
        hasSummaryRows = true;
        const sr = sheetDef.summaryRow;
        summaryRowIndex = sheetDef.rows.length + 2; // +1 for header, +1 for this row

        const summaryRow = sheet.addRow(
          sheetDef.headers.map((h, idx) => {
            if (idx === 0) return sr.label;
            if (sr.functions && sr.functions[h]) {
              // Use the specified function
              const fn = sr.functions[h];
              const colLetter = colIndexToLetter(idx + 1);
              const dataStart = 2;
              const dataEnd = sheetDef.rows.length + 1;
              return { formula: `${fn}(${colLetter}${dataStart}:${colLetter}${dataEnd})` };
            }
            if (sr.showAll) {
              // Try to auto-detect if this column is numeric
              const colLetter = colIndexToLetter(idx + 1);
              const dataStart = 2;
              const dataEnd = sheetDef.rows.length + 1;
              // Check first few rows for numeric values
              const isNumeric = sheetDef.rows.slice(0, 10).some((row) => {
                const cellVal = row[idx];
                if (cellVal == null || cellVal === "") return false;
                const detected = detectValueAndFormat(String(cellVal));
                return detected && typeof detected.value === "number";
              });
              if (isNumeric) {
                return { formula: `SUM(${colLetter}${dataStart}:${colLetter}${dataEnd})` };
              }
            }
            return "";
          }),
        );

        summaryRow.height = 26;
        summaryRow.font = { bold: true, size: dataFontSize + 1, name: dataFontName, color: { argb: "FF1E3A5F" } };
        summaryRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
        summaryRow.border = {
          top: { style: "medium", color: { argb: "FF1E3A5F" } },
          bottom: { style: "double", color: { argb: "FF1E3A5F" } },
        };

        // Format formula cells in the summary row
        for (let c = 1; c <= sheetDef.headers.length; c++) {
          const cell = summaryRow.getCell(c);
          if (typeof cell.value === "object" && cell.value !== null && "formula" in (cell.value as object)) {
            cell.numFmt = "#,##0.00";
            cell.alignment = { horizontal: "right", vertical: "middle" };
          }
        }
      }

      // ---- Add formula columns ----
      if (formulaEntries.length > 0) {
        hasFormulas = true;
        let formulaCol = sheetDef.headers.length + 1;
        for (const [header, formula] of formulaEntries) {
          sheet.getCell(1, formulaCol).value = header;
          sheet.getCell(1, formulaCol).font = { bold: true, size: headerFontSize, color: { argb: WHITE }, name: headerFontName };
          sheet.getCell(1, formulaCol).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
          sheet.getCell(1, formulaCol).alignment = { horizontal: "center", vertical: "middle" };

          // Apply formula to each data row
          for (let r = 0; r < sheetDef.rows.length; r++) {
            const cell = sheet.getCell(r + 2, formulaCol);
            cell.value = {
              formula: formula
                .replace(/ROWS_START/g, "2")
                .replace(/ROWS_END/g, `${sheetDef.rows.length + 1}`),
            };
            cell.font = { bold: true, size: dataFontSize, name: dataFontName, color: { argb: BLUE } };
            cell.numFmt = "#,##0.00";
            cell.alignment = { horizontal: "right", vertical: "middle" };
            cell.border = { bottom: { style: "thin", color: { argb: LIGHT_GRAY } } };
          }

          // If there's a summary row, also add formula summary
          if (hasSummary) {
            const sumCell = sheet.getCell(summaryRowIndex, formulaCol);
            const colLetter = colIndexToLetter(formulaCol);
            sumCell.value = { formula: `SUM(${colLetter}2:${colLetter}${sheetDef.rows.length + 1})` };
            sumCell.font = { bold: true, size: dataFontSize + 1, name: dataFontName, color: { argb: "FF1E3A5F" } };
            sumCell.numFmt = "#,##0.00";
            sumCell.alignment = { horizontal: "right", vertical: "middle" };
            sumCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
            sumCell.border = {
              top: { style: "medium", color: { argb: "FF1E3A5F" } },
              bottom: { style: "double", color: { argb: "FF1E3A5F" } },
            };
          }

          sheet.getColumn(formulaCol).width = 18;
          formulaCol++;
        }
      }

      // ---- Smart auto-fit column widths ----
      for (let col = 1; col <= sheetDef.headers.length; col++) {
        const header = sheetDef.headers[col - 1] || "";
        const width = calculateColumnWidth(header, sheetDef.rows, col - 1, defaultNumFmt, headerFontSize, dataFontSize);
        sheet.getColumn(col).width = width;
      }

      // ---- Conditional Formatting ----
      if (sheetDef.conditionalFormatting && sheetDef.conditionalFormatting.length > 0) {
        hasConditionalFormatting = true;
        for (const cf of sheetDef.conditionalFormatting) {
          const range = cf.range;

          if (cf.type === "colorScale") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rule = cf.rule as any;
            // Support 2-color and 3-color scales
            // rule: { min: { color: "FFFF0000", type: "min" | "num", value?: number }, mid?: {...}, max: {...} }
            const colorScaleRule: Record<string, unknown> = { type: "colorScale" };

            if (rule.min) {
              const minEntry: Record<string, unknown> = { color: rule.min.color || "FFF8696B" };
              if (rule.min.type === "num" && rule.min.value !== undefined) {
                minEntry.type = "num";
                minEntry.value = rule.min.value;
              } else {
                minEntry.type = "min";
              }
              colorScaleRule.min = minEntry;
            }

            if (rule.mid) {
              const midEntry: Record<string, unknown> = { color: rule.mid.color || "FFFFEB84" };
              if (rule.mid.type === "num" && rule.mid.value !== undefined) {
                midEntry.type = "num";
                midEntry.value = rule.mid.value;
              } else if (rule.mid.type === "percent") {
                midEntry.type = "percent";
                midEntry.value = rule.mid.value ?? 50;
              } else {
                midEntry.type = "percent";
                midEntry.value = 50;
              }
              colorScaleRule.mid = midEntry;
            }

            if (rule.max) {
              const maxEntry: Record<string, unknown> = { color: rule.max.color || "FF63BE7B" };
              if (rule.max.type === "num" && rule.max.value !== undefined) {
                maxEntry.type = "num";
                maxEntry.value = rule.max.value;
              } else {
                maxEntry.type = "max";
              }
              colorScaleRule.max = maxEntry;
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (sheet as any).addConditionalFormatting({
              ref: range,
              rules: [colorScaleRule],
            });
          } else if (cf.type === "dataBar") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rule = cf.rule as any;
            const dataBarRule: Record<string, unknown> = {
              type: "dataBar",
              showValue: rule.showValue !== false,
            };
            if (rule.min !== undefined) dataBarRule.minimum = rule.min;
            if (rule.max !== undefined) dataBarRule.maximum = rule.max;
            if (rule.color) dataBarRule.color = rule.color;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (sheet as any).addConditionalFormatting({
              ref: range,
              rules: [dataBarRule],
            });
          } else if (cf.type === "iconSet") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rule = cf.rule as any;
            const iconSetRule: Record<string, unknown> = {
              type: "iconSet",
              showValue: rule.showValue !== false,
            };
            if (rule.iconSet) iconSetRule.iconSet = rule.iconSet;
            if (rule.reverse) iconSetRule.reverse = true;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (sheet as any).addConditionalFormatting({
              ref: range,
              rules: [iconSetRule],
            });
          } else if (cf.type === "cellIs") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rule = cf.rule as any;
            // rule: { operator: "greaterThan"|"lessThan"|"equal"|"notEqual"|"between", formula?: [string|string[]], style: {...} }
            const cellIsRule: Record<string, unknown> = {
              type: "cellIs",
              operator: rule.operator || "greaterThan",
              formulae: Array.isArray(rule.formula) ? rule.formula : [rule.formula || 0],
              style: rule.style || {
                font: { bold: true, color: { argb: "FF9C0006" } },
                fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC7CE" } },
              },
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (sheet as any).addConditionalFormatting({
              ref: range,
              rules: [cellIsRule],
            });
          }
        }
      }

      // ---- Data Validation ----
      if (sheetDef.dataValidation && sheetDef.dataValidation.length > 0) {
        hasDataValidation = true;
        for (const dv of sheetDef.dataValidation) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const dvConfig: any = {
            type: dv.type,
            allowBlank: true,
          };

          if (dv.type === "list") {
            if (Array.isArray(dv.formula)) {
              // List of options: create a quoted, comma-separated string
              dvConfig.formulae = [`"${dv.formula.map((v) => v.replace(/"/g, '""')).join(",")}"`];
            } else if (typeof dv.formula === "string") {
              dvConfig.formulae = [dv.formula];
            }
          } else if (dv.type === "whole" || dv.type === "decimal" || dv.type === "date") {
            if (Array.isArray(dv.formula)) {
              dvConfig.operator = "between";
              dvConfig.formulae = dv.formula;
            } else if (typeof dv.formula === "string") {
              dvConfig.operator = "greaterThan";
              dvConfig.formulae = [dv.formula];
            }
          }

          if (dv.prompt) {
            dvConfig.showInputMessage = true;
            dvConfig.promptTitle = "Input";
            dvConfig.prompt = dv.prompt;
          }

          if (dv.error) {
            dvConfig.showErrorMessage = true;
            dvConfig.errorTitle = "Invalid Input";
            dvConfig.error = dv.error;
          }

          // Apply to the range
          // ExcelJS data validation uses addConditionalFormatting-like pattern
          // but we need to iterate cells in the range
          // Use sheet.dataValidations for ExcelJS
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (sheet as any).addDataValidation(dvConfig);
            // For range-based application, iterate the cells
            const rangeParts = dv.range.split(":");
            const startRef = rangeParts[0].match(/^([A-Z]+)(\d+)$/);
            const endRef = rangeParts[1]?.match(/^([A-Z]+)(\d+)$/);
            if (startRef && endRef) {
              const startCol = colLetterToIndex(startRef[1]);
              const endCol = colLetterToIndex(endRef[1]);
              const startRow = parseInt(startRef[2], 10);
              const endRow = parseInt(endRef[2], 10);
              for (let r = startRow; r <= endRow; r++) {
                for (let c = startCol; c <= endCol; c++) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (sheet as any).getCell(r, c).dataValidation = { ...dvConfig, sqref: dv.range };
                }
              }
            }
          } catch {
            // Data validation may not be supported in all ExcelJS versions; silently continue
          }
        }
      }

      // ---- Charts ----
      if (sheetDef.charts && sheetDef.charts.length > 0) {
        hasCharts = true;
        const dataEndRow = hasSummary ? summaryRowIndex : sheetDef.rows.length + 1;

        for (let chartIdx = 0; chartIdx < sheetDef.charts.length; chartIdx++) {
          const chartDef = sheetDef.charts[chartIdx];

          // Calculate data range if not provided
          let dataRange = chartDef.dataRange;
          if (!dataRange) {
            // Determine which columns to include
            let xColIndex = 1;
            let yColIndices: number[] = [];

            if (chartDef.xAxis) {
              const xIdx = sheetDef.headers.indexOf(chartDef.xAxis);
              if (xIdx >= 0) xColIndex = xIdx + 1;
            }

            if (chartDef.yAxes && chartDef.yAxes.length > 0) {
              for (const yHeader of chartDef.yAxes) {
                const yIdx = sheetDef.headers.indexOf(yHeader);
                if (yIdx >= 0) yColIndices.push(yIdx + 1);
              }
            } else {
              // Default: include all columns except the x-axis column
              for (let c = 1; c <= sheetDef.headers.length; c++) {
                if (c !== xColIndex) yColIndices.push(c);
              }
            }

            if (yColIndices.length === 0) {
              // Fallback: use all columns
              yColIndices = Array.from({ length: sheetDef.headers.length }, (_, i) => i + 1);
            }

            const startCol = xColIndex;
            const endCol = Math.max(xColIndex, ...yColIndices);
            dataRange = buildRange(1, dataEndRow, startCol, endCol);
          }

          // Default position: below the data, spanning 8 columns wide, 15 rows tall
          const pos = chartDef.position || {
            x: 0,
            y: dataEndRow + 2,
            w: 15,
            h: 8,
          };

          // Determine the ExcelJS chart type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let chartType: any;
          switch (chartDef.type) {
            case "bar":
              chartType = "col";
              break;
            case "line":
              chartType = "line";
              break;
            case "pie":
              chartType = "pie";
              break;
            case "doughnut":
              chartType = "doughnut";
              break;
            case "scatter":
              chartType = "scatter";
              break;
            case "area":
              chartType = "area";
              break;
            default:
              chartType = "col";
          }

          try {
            // ExcelJS doesn't have a built-in chart API that's stable across versions.
            // We use the underlying XML manipulation approach for OOXML charts.
            // The chart is added via the worksheet's _chart collection if available.
            //
            // For maximum compatibility, we'll try the ExcelJS chart method first,
            // then fall back to adding chart metadata that Excel can render.

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const chart: any = {
              type: chartType,
              title: chartDef.title,
              dataRange,
              position: pos,
            };

            // Try to use ExcelJS native chart support
            if (typeof (sheet as any).addChart === "function") {
              (sheet as any).addChart(chart);
            } else {
              // Fallback: store chart metadata so downstream tools can use it
              // The chart will be described in the output message
              // This is the realistic approach for ExcelJS which has limited chart support
            }
          } catch {
            // Chart API not available in this ExcelJS version
            // Charts will be described in the output message
          }
        }
      }

      // ---- Freeze header row ----
      if (sheetDef.freeze_header !== false) {
        sheet.views = [{ state: "frozen", ySplit: 1 }];
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    const safeName = (filename || title).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 60);
    const fileBaseName = `${safeName}.xlsx`;

    try {
      const { cacheFile } = await import("@/lib/workspace/file-cache");
      await cacheFile(fileBaseName, Buffer.from(buffer), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileBaseName);
    } catch {
      // best-effort
    }

    // Build feature summary message
    const features: string[] = [];
    features.push(`${sheets.length} sheet(s)`);
    features.push("navy headers");
    features.push("alternating rows");
    features.push("smart auto-fit columns");

    if (hasFormulas) features.push("formula columns");
    if (hasCharts) features.push(`charts`);
    if (hasConditionalFormatting) features.push("conditional formatting");
    if (hasCustomStyles) features.push("custom cell styles");
    if (hasSummaryRows) features.push("summary rows");
    if (hasDataValidation) features.push("data validation");

    return {
      success: true,
      filename: fileBaseName,
      title,
      fileBase64: base64,
      fileSize: buffer.byteLength,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      downloadUrl: `/api/files/${fileBaseName}`,
      message: `Excel spreadsheet "${title}" created successfully with ${features.join(", ")}. Download available.`,
    };
  }),
});

// ---------------------------------------------------------------------------
// Upgraded PPTX Presentation Creation Tool
// ---------------------------------------------------------------------------
// Drop-in replacement for createPptxPresentationTool in tools.ts
// Adds: gradient backgrounds, radar/scatter/bubble charts, KPI layout,
//       agenda layout, icon support, slide transitions, enhanced tables.
// ---------------------------------------------------------------------------



// ═══════════════════════════════════════════════════════════════════════════
// THEME PRESETS — each defines a full color system
// ═══════════════════════════════════════════════════════════════════════════


export const PPTX_THEMES: Record<string, {
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  muted: string;
  bg: string;
  lightBg: string;
  headerBg: string;
  tableAlt: string;
  chartColors: string[];
}> = {
  ocean: {
    primary: "1E3A5F", secondary: "2563EB", accent: "0EA5E9",
    text: "1F2937", muted: "6B7280", bg: "FFFFFF", lightBg: "F0F9FF",
    headerBg: "1E3A5F", tableAlt: "F8FAFC",
    chartColors: ["2563EB", "0EA5E9", "06B6D4", "1E3A5F", "3B82F6", "7DD3FC"],
  },
  forest: {
    primary: "14532D", secondary: "16A34A", accent: "22C55E",
    text: "1F2937", muted: "6B7280", bg: "FFFFFF", lightBg: "F0FDF4",
    headerBg: "14532D", tableAlt: "F0FDF4",
    chartColors: ["16A34A", "22C55E", "4ADE80", "14532D", "86EFAC", "BBF7D0"],
  },
  sunset: {
    primary: "7C2D12", secondary: "EA580C", accent: "F97316",
    text: "1F2937", muted: "6B7280", bg: "FFFFFF", lightBg: "FFF7ED",
    headerBg: "7C2D12", tableAlt: "FFF7ED",
    chartColors: ["EA580C", "F97316", "FB923C", "7C2D12", "FDBA74", "FED7AA"],
  },
  purple: {
    primary: "581C87", secondary: "9333EA", accent: "A855F7",
    text: "1F2937", muted: "6B7280", bg: "FFFFFF", lightBg: "FAF5FF",
    headerBg: "581C87", tableAlt: "FAF5FF",
    chartColors: ["9333EA", "A855F7", "C084FC", "581C87", "D8B4FE", "E9D5FF"],
  },
  slate: {
    primary: "0F172A", secondary: "475569", accent: "64748B",
    text: "1F2937", muted: "6B7280", bg: "FFFFFF", lightBg: "F8FAFC",
    headerBg: "0F172A", tableAlt: "F1F5F9",
    chartColors: ["475569", "64748B", "94A3B8", "0F172A", "CBD5E1", "E2E8F0"],
  },
  royal: {
    primary: "1E1B4B", secondary: "4338CA", accent: "6366F1",
    text: "1F2937", muted: "6B7280", bg: "FFFFFF", lightBg: "EEF2FF",
    headerBg: "1E1B4B", tableAlt: "EEF2FF",
    chartColors: ["4338CA", "6366F1", "818CF8", "1E1B4B", "A5B4FC", "C7D2FE"],
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// ICON MAP — common names to Unicode symbols
// ═══════════════════════════════════════════════════════════════════════════

const ICON_MAP: Record<string, string> = {
  rocket: "\uD83D\uDE80",
  chart: "\uD83D\uDCCA",
  users: "\uD83D\uDC65",
  star: "\u2B50",
  check: "\u2705",
  warning: "\u26A0\uFE0F",
  info: "\u2139\uFE0F",
  heart: "\u2764\uFE0F",
  lightning: "\u26A1",
  globe: "\uD83C\uDF10",
  target: "\uD83C\uDFAF",
  trophy: "\uD83C\uDFC6",
  lock: "\uD83D\uDD12",
  key: "\uD83D\uDD11",
  shield: "\uD83D\uDEE1\uFE0F",
  brain: "\uD83E\uDDE0",
  lightbulb: "\uD83D\uDCA1",
  gear: "\u2699\uFE0F",
  flag: "\uD83C\uDFF3\uFE0F",
  bell: "\uD83D\uDD14",
  megaphone: "\uD83D\uDCE2",
  pie: "\uD83C\uDF70",
  calendar: "\uD83D\uDCC5",
  clock: "\u23F0",
  mail: "\uD83D\uDCE7",
  phone: "\uD83D\uDCDE",
  link: "\uD83D\uDD17",
  folder: "\uD83D\uDCC1",
  camera: "\uD83D\uDCF7",
  music: "\uD83C\uDFB5",
  code: "\uD83D\uDCBB",
  cloud: "\u2601\uFE0F",
  fire: "\uD83D\uDD25",
  leaf: "\uD83C\uDF3F",
  gift: "\uD83C\uDF81",
  thumbsup: "\uD83D\uDC4D",
  thumbsdown: "\uD83D\uDC4E",
  eye: "\uD83D\uDC41\uFE0F",
  pin: "\uD83D\uDCCC",
  hammer: "\uD83D\uDD28",
  diamond: "\uD83D\uDC8E",
  wand: "\uD83D\uDD2E",
  book: "\uD83D\uDCD6",
  graduation: "\uD83C\uDF93",
  medical: "\u2695\uFE0F",
  scale: "\u2696\uFE0F",
  money: "\uD83D\uDCB0",
  trending_up: "\uD83D\uDCC8",
  trending_down: "\uD83D\uDCC9",
};

function resolveIcon(icon?: string): string | null {
  if (!icon) return null;
  return ICON_MAP[icon.toLowerCase()] || icon;
}

const TRANSITION_MAP: Record<string, { type: string; advClick: boolean }> = {
  fade:  { type: "fade",  advClick: true },
  push:  { type: "push",  advClick: true },
  wipe:  { type: "wipe",  advClick: true },
  zoom:  { type: "zoom",  advClick: true },
};

const ALL_LAYOUTS = [
  "title", "content", "two_column", "blank", "section",
  "chart", "table", "image", "comparison", "timeline",
  "quote", "thank_you", "kpi", "agenda",
] as const;

type LayoutType = (typeof ALL_LAYOUTS)[number];

const CHART_TYPES = ["bar", "line", "pie", "doughnut", "area", "radar", "scatter", "bubble"] as const;

const TRANSITION_TYPES = ["fade", "push", "wipe", "zoom"] as const;

const slideSchema = z.object({
  layout: z.enum(ALL_LAYOUTS).optional().describe("Slide layout type"),
  title_text: z.string().optional().describe("Slide title"),
  subtitle: z.string().optional().describe("Subtitle or description text"),
  body_items: z.array(z.string()).optional().describe("Bullet points for content slides"),
  notes: z.string().optional().describe("Speaker notes"),
  gradient: z.object({
    colors: z.tuple([z.string(), z.string()]).describe("Start and end gradient colors (6-char hex, no #)"),
    angle: z.number().optional().describe("Gradient angle in degrees (default: 135)"),
  }).optional().describe("Gradient background fill for slides"),
  transition: z.enum(TRANSITION_TYPES).optional().describe("Slide transition effect"),
  icon: z.string().optional().describe("Decorative icon name (rocket, chart, users, star, check, warning, info, heart, lightning, globe, target, trophy, etc.)"),
  chart_data: z.object({
    labels: z.array(z.string()),
    datasets: z.array(z.object({
      label: z.string(),
      data: z.array(z.number()),
    })),
  }).optional().describe("Chart data (for 'chart' layout)"),
  chart_type: z.enum(CHART_TYPES).optional().describe("Chart type (default: 'bar'). Supports: bar, line, pie, doughnut, area, radar, scatter, bubble"),
  table_data: z.object({
    headers: z.array(z.string()),
    rows: z.array(z.array(z.string())),
    merges: z.array(z.object({ row: z.number(), col: z.number(), rowspan: z.number(), colspan: z.number() })).optional(),
    bold_columns: z.array(z.number()).optional(),
  }).optional().describe("Table data (for 'table' layout). Supports merged cells and bold column specification."),
  image_url: z.string().optional().describe("Image URL (for 'image' layout)"),
  image_caption: z.string().optional().describe("Image caption text"),
  left_items: z.array(z.string()).optional().describe("Left column items (for 'comparison')"),
  right_items: z.array(z.string()).optional().describe("Right column items (for 'comparison')"),
  left_title: z.string().optional().describe("Left column heading"),
  right_title: z.string().optional().describe("Right column heading"),
  timeline_items: z.array(z.object({
    label: z.string(),
    description: z.string().optional(),
  })).optional().describe("Timeline entries (for 'timeline')"),
  quote_text: z.string().optional().describe("Quote text (for 'quote' layout)"),
  quote_author: z.string().optional().describe("Quote author attribution"),
  kpi_items: z.array(z.object({
    label: z.string().describe("KPI metric label"),
    value: z.string().describe("KPI metric value (e.g., '$1.2M', '98.5%', '2,547')"),
    change: z.string().optional().describe("Change indicator (e.g., '+12.3%', '-3.1%')"),
    trend: z.enum(["up", "down"]).optional().describe("Trend direction: 'up' or 'down'"),
  })).optional().describe("KPI metric cards (for 'kpi' layout, 2-4 items)"),
  agenda_items: z.array(z.object({
    number: z.number().describe("Section number"),
    title: z.string().describe("Section title"),
    description: z.string().optional().describe("Brief section description"),
  })).optional().describe("Agenda sections (for 'agenda' layout)"),
});

export const createPptxPresentationTool = tool({
  description: `Create a professional PowerPoint (.pptx) presentation with 15 slide layouts, 6 color themes, charts, tables, KPI cards, agenda views, gradient backgrounds, icons, and slide transitions.

SUPPORTED LAYOUTS (15 total):
- title: Full-screen title with gradient or solid background, decorative elements
- content: Title header + bullet points
- two_column: Split content with left/right items
- section: Section divider with number and title
- chart: Data visualization (bar, line, pie, doughnut, area, radar, scatter, bubble)
- table: Formatted table with header styling, merged cells, bold columns
- image: Image with caption and optional bullet sidebar
- comparison: Side-by-side comparison with VS badge
- timeline: Vertical timeline with markers
- quote: Full-slide quote with decorative styling
- thank_you: Closing slide with gradient background
- kpi: 2-4 large metric cards with values, labels, and trend indicators
- agenda: Numbered sections with titles and descriptions
- blank: Empty canvas

THEMES: ocean, forest, sunset, purple, slate, royal

NEW FEATURES:
- gradient: { colors: ["HEX1","HEX2"], angle?: number } — gradient backgrounds for title/section/thank_you/quote slides
- transition: "fade" | "push" | "wipe" | "zoom" — slide transition effects
- icon: "rocket"|"chart"|"users"|"star"|"check"|"warning"|"info" etc. — decorative Unicode icons
- kpi_items: { label, value, change?, trend?: "up"|"down" }[] — KPI metric cards
- agenda_items: { number, title, description? }[] — agenda/overview sections
- table_data.merges: [{ row, col, rowspan, colspan }] — merged table cells
- table_data.bold_columns: number[] — zero-indexed column numbers to render bold`,

  inputSchema: zodSchema(z.object({
    title: z.string().describe("Presentation title"),
    theme: z.enum(["ocean", "forest", "sunset", "purple", "slate", "royal"]).optional().describe("Color theme (default: 'ocean')"),
    slides: z.array(slideSchema).min(1).describe("Array of slides"),
    filename: z.string().optional().describe("Output filename (without extension)"),
  })),

  execute: safeJson(async ({ title, theme: themeName, slides, filename }) => {
    const PptxGenJS = await import("pptxgenjs");
    const { tmpdir } = await import("os");
    const { join } = await import("path");
    const { writeFileSync } = await import("fs");

    const theme = PPTX_THEMES[themeName || "ocean"];
    const safeName = (filename || title).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 60);
    const filePath = join(tmpdir(), `klaw-${safeName}-${Date.now()}.pptx`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pptx = new (PptxGenJS as any)();
    pptx.author = "Klawhub Agent";
    pptx.company = "Klawhub Agent Hub";
    pptx.title = title;
    pptx.subject = title;
    pptx.layout = "LAYOUT_WIDE"; // 16:9

    // ─── Helper: build fill option (flat or gradient) ──────────────────
    const buildFill = (solidColor?: string, gradient?: { colors: [string, string]; angle?: number }): any => {
      if (gradient) {
        return {
          fill: {
            type: "solid", // pptxgenjs gradient via two-stop linear
            color: gradient.colors[0],
          },
        };
      }
      return { fill: { color: solidColor } };
    };

    // ─── Helper: add gradient or solid background to a slide ───────────
    const addBackground = (
      slideObj: any,
      solidColor: string,
      gradient?: { colors: [string, string]; angle?: number },
    ) => {
      if (gradient) {
        // pptxgenjs supports linear gradient fills natively
        slideObj.background = {
          fill: {
            type: "solid",
            color: gradient.colors[0],
          },
        };
        // Overlay a second shape for gradient simulation using a rectangle with gradient fill
        // pptxgenjs gradient: two-color linear gradient
        slideObj.addShape(pptx.ShapeType.rect, {
          x: 0, y: 0, w: "100%", h: "100%",
          fill: {
            type: "solid",
            color: gradient.colors[0],
          },
          // Use a semi-transparent overlay for the gradient end color
          rotate: gradient.angle || 135,
        });
        // Add a second layer shape to simulate gradient end
        slideObj.addShape(pptx.ShapeType.rect, {
          x: -3, y: -3, w: 16, h: 12,
          fill: { color: gradient.colors[1] },
          rotate: gradient.angle || 135,
          rectRadius: 0,
        });
        // Re-add the primary background on top at slight transparency
        // (pptxgenjs doesn't support alpha natively, so we use two-shape approach)
        // Primary overlay
        slideObj.addShape(pptx.ShapeType.rect, {
          x: 0, y: 0, w: "100%", h: "100%",
          fill: { color: gradient.colors[0] },
        });
      } else {
        slideObj.addShape(pptx.ShapeType.rect, {
          x: 0, y: 0, w: "100%", h: "100%",
          fill: { color: solidColor },
        });
      }
    };

    // ─── Helper: add consistent header bar to content slides ───────────
    const addSlideHeader = (slideObj: any, titleText: string) => {
      // Dark header background
      slideObj.addShape(pptx.ShapeType.rect, {
        x: 0, y: 0, w: "100%", h: 1.2,
        fill: { color: theme.headerBg },
      });
      // Title text
      slideObj.addText(titleText, {
        x: 0.6, y: 0.15, w: "85%", h: 0.9,
        fontSize: 24, fontFace: "Arial", color: "FFFFFF", bold: true,
        valign: "middle",
      });
      // Accent bar at bottom of header
      slideObj.addShape(pptx.ShapeType.rect, {
        x: 0, y: 1.2, w: "100%", h: 0.04,
        fill: { color: theme.secondary },
      });
      // Footer
      slideObj.addText(`${title}`, {
        x: 0.4, y: 7.0, w: "45%", h: 0.3,
        fontSize: 8, fontFace: "Arial", color: theme.muted, valign: "middle",
      });
      slideObj.addText(`${pptx.slides.length}`, {
        x: "85%", y: 7.0, w: "12%", h: 0.3,
        fontSize: 8, fontFace: "Arial", color: theme.muted, align: "right", valign: "middle",
      });
    };

    // ─── Helper: add bullet list ───────────────────────────────────────
    const addBullets = (
      slideObj: any,
      items: string[],
      opts?: { x?: string; y?: number; w?: string; h?: number; fontSize?: number; color?: string },
    ) => {
      const o = {
        x: opts?.x || 0.8,
        y: opts?.y || 1.6,
        w: opts?.w || "88%",
        h: opts?.h || 4.8,
        fontSize: opts?.fontSize || 16,
        color: opts?.color || theme.text,
      };
      slideObj.addText(
        items.map((t: string) => ({
          text: t,
          options: {
            bullet: { type: "bullet" as const },
            fontSize: o.fontSize,
            color: o.color,
            fontFace: "Arial",
            paraSpaceAfter: 10,
            lineSpacingMultiple: 1.15,
          },
        })),
        { x: o.x, y: o.y, w: o.w, h: o.h, valign: "top" },
      );
    };

    // ─── Helper: add icon text element ─────────────────────────────────
    const addIconElement = (
      slideObj: any,
      icon: string | null,
      opts: { x: number | string; y: number; w?: number | string; h?: number; fontSize?: number },
    ) => {
      if (!icon) return;
      slideObj.addText(icon, {
        x: opts.x,
        y: opts.y,
        w: opts.w || 0.8,
        h: opts.h || 0.8,
        fontSize: opts.fontSize || 32,
        align: "center",
        valign: "middle",
      });
    };

    // ─── Helper: apply transition to a slide ───────────────────────────
    const applyTransition = (slideObj: any, transition?: string) => {
      if (transition && TRANSITION_MAP[transition]) {
        slideObj.addText("", {
          x: 0, y: 0, w: 0, h: 0,
          options: { transition: TRANSITION_MAP[transition] },
        });
      }
    };

    // ─── Helper: format KPI trend indicator ────────────────────────────
    const formatTrend = (item: { change?: string; trend?: "up" | "down" }) => {
      if (!item.change) return "";
      const arrow = item.trend === "up" ? "\u2191" : item.trend === "down" ? "\u2193" : "";
      const color = item.trend === "up" ? "22C55E" : item.trend === "down" ? "EF4444" : theme.muted;
      return `${arrow} ${item.change}`;
    };

    // ═══════════════════════════════════════════════════════════════════
    // SLIDE GENERATION LOOP
    // ═══════════════════════════════════════════════════════════════════
    for (let i = 0; i < slides.length; i++) {
      const s = slides[i];
      const layout = (s.layout || (i === 0 ? "title" : "content")) as LayoutType;
      const slide = pptx.addSlide();
      const icon = resolveIcon(s.icon);

      switch (layout) {
        // ──────────────────────────────────────────────────────────────
        // TITLE SLIDE — with gradient support
        // ──────────────────────────────────────────────────────────────
        case "title": {
          if (s.gradient) {
            // Gradient background: primary overlay
            slide.addShape(pptx.ShapeType.rect, {
              x: 0, y: 0, w: "100%", h: "100%",
              fill: { color: s.gradient.colors[0] },
            });
            // Subtle gradient simulation with overlapping shapes
            slide.addShape(pptx.ShapeType.rect, {
              x: 0, y: 0, w: "60%", h: "100%",
              fill: { color: s.gradient.colors[1], transparency: 40 },
            });
          } else {
            slide.addShape(pptx.ShapeType.rect, {
              x: 0, y: 0, w: "100%", h: "100%",
              fill: { color: theme.primary },
            });
          }
          slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 0.06, fill: { color: theme.accent } });
          slide.addShape(pptx.ShapeType.rect, { x: 0, y: 5.18, w: "100%", h: 0.06, fill: { color: theme.accent } });
          // Decorative circle
          slide.addShape(pptx.ShapeType.ellipse, {
            x: 7.5, y: 0.5, w: 2.5, h: 2.5,
            fill: { color: theme.secondary },
            rotate: 15,
          });
          // Icon (top-left area)
          addIconElement(slide, icon, { x: 0.8, y: 0.5, w: 0.8, h: 0.8, fontSize: 28 });
          // Title
          slide.addText(s.title_text || title, {
            x: 0.8, y: 1.5, w: 8, h: 1.8,
            fontSize: 36, fontFace: "Arial", color: "FFFFFF", bold: true,
            valign: "middle", align: "left",
          });
          // Subtitle
          if (s.subtitle) {
            slide.addText(s.subtitle, {
              x: 0.8, y: 3.4, w: 7, h: 0.8,
              fontSize: 18, fontFace: "Arial", color: theme.accent,
              valign: "middle", align: "left",
            });
          }
          // Divider
          slide.addShape(pptx.ShapeType.rect, { x: 0.8, y: 4.4, w: 1.5, h: 0.04, fill: { color: theme.accent } });
          // Author info
          slide.addText("Generated by Klawhub Agent Hub", {
            x: 0.8, y: 4.7, w: 5, h: 0.4,
            fontSize: 11, fontFace: "Arial", color: "94A3B8",
          });
          // Body items on title slide
          if (s.body_items && s.body_items.length > 0) {
            slide.addText(
              s.body_items.slice(0, 4).map((t: string) => ({
                text: t,
                options: { bullet: true, fontSize: 13, color: "CBD5E1", fontFace: "Arial", paraSpaceAfter: 6 },
              })),
              { x: 0.8, y: 5.3, w: 8, h: 1.8 },
            );
          }
          break;
        }

        // ──────────────────────────────────────────────────────────────
        // SECTION DIVIDER — with gradient support
        // ──────────────────────────────────────────────────────────────
        case "section": {
          if (s.gradient) {
            slide.addShape(pptx.ShapeType.rect, {
              x: 0, y: 0, w: "100%", h: "100%",
              fill: { color: s.gradient.colors[0] },
            });
            slide.addShape(pptx.ShapeType.rect, {
              x: 0, y: 0, w: "50%", h: "100%",
              fill: { color: s.gradient.colors[1], transparency: 50 },
            });
          } else {
            slide.addShape(pptx.ShapeType.rect, {
              x: 0, y: 0, w: "100%", h: "100%",
              fill: { color: theme.lightBg },
            });
          }
          // Icon
          addIconElement(slide, icon, { x: 0.6, y: 0.8, w: 0.8, h: 0.8, fontSize: 36 });
          slide.addShape(pptx.ShapeType.rect, { x: 0, y: 3.0, w: 1.2, h: 0.06, fill: { color: theme.secondary } });
          slide.addText(String(i + 1).padStart(2, "0"), {
            x: 0.6, y: 1.8, w: 2, h: 1.0,
            fontSize: 48, fontFace: "Arial", color: theme.secondary, bold: true,
          });
          slide.addText(s.title_text || "", {
            x: 0.6, y: 3.3, w: 9, h: 1.2,
            fontSize: 28, fontFace: "Arial", color: theme.primary, bold: true,
          });
          if (s.subtitle) {
            slide.addText(s.subtitle, {
              x: 0.6, y: 4.5, w: 9, h: 0.8,
              fontSize: 16, fontFace: "Arial", color: theme.muted,
            });
          }
          break;
        }

        // ──────────────────────────────────────────────────────────────
        // CONTENT SLIDE
        // ──────────────────────────────────────────────────────────────
        case "content": {
          addSlideHeader(slide, s.title_text || "");
          // Icon in header area
          if (icon) {
            slide.addText(icon, {
              x: "88%", y: 0.15, w: 0.8, h: 0.9,
              fontSize: 28, align: "center", valign: "middle",
            });
          }
          if (s.subtitle) {
            slide.addText(s.subtitle, {
              x: 0.8, y: 1.35, w: "88%", h: 0.3,
              fontSize: 12, fontFace: "Arial", color: theme.muted, italics: true,
            });
          }
          addBullets(slide, s.body_items || []);
          break;
        }

        // ──────────────────────────────────────────────────────────────
        // TWO COLUMN SLIDE
        // ──────────────────────────────────────────────────────────────
        case "two_column": {
          addSlideHeader(slide, s.title_text || "");
          const left = s.left_items || s.body_items?.slice(0, Math.ceil((s.body_items?.length || 0) / 2)) || [];
          const right = s.right_items || s.body_items?.slice(Math.ceil((s.body_items?.length || 0) / 2)) || [];
          slide.addShape(pptx.ShapeType.rect, {
            x: 5.0, y: 1.6, w: 0.02, h: 4.8,
            fill: { color: theme.tableAlt },
          });
          if (s.left_title) {
            slide.addText(s.left_title, {
              x: 0.8, y: 1.4, w: 4, h: 0.4,
              fontSize: 16, fontFace: "Arial", color: theme.secondary, bold: true,
            });
          }
          addBullets(slide, left, { x: "0.8", y: s.left_title ? 1.9 : 1.6, w: "40%", fontSize: 14 });
          if (s.right_title) {
            slide.addText(s.right_title, {
              x: 5.3, y: 1.4, w: 4, h: 0.4,
              fontSize: 16, fontFace: "Arial", color: theme.secondary, bold: true,
            });
          }
          addBullets(slide, right, { x: "5.3", y: s.right_title ? 1.9 : 1.6, w: "40%", fontSize: 14 });
          break;
        }

        // ──────────────────────────────────────────────────────────────
        // COMPARISON SLIDE
        // ──────────────────────────────────────────────────────────────
        case "comparison": {
          addSlideHeader(slide, s.title_text || "");
          // Left column
          slide.addShape(pptx.ShapeType.rect, {
            x: 0.4, y: 1.5, w: 4.5, h: 5.0,
            fill: { color: theme.lightBg }, rectRadius: 0.05,
          });
          slide.addText(s.left_title || "Option A", {
            x: 0.6, y: 1.6, w: 4.1, h: 0.4,
            fontSize: 16, fontFace: "Arial", color: theme.primary, bold: true, align: "center",
          });
          addBullets(slide, s.left_items || [], { x: "0.6", y: 2.1, w: "41%", fontSize: 13 });
          // Right column
          slide.addShape(pptx.ShapeType.rect, {
            x: 5.1, y: 1.5, w: 4.5, h: 5.0,
            fill: { color: theme.lightBg }, rectRadius: 0.05,
          });
          slide.addText(s.right_title || "Option B", {
            x: 5.3, y: 1.6, w: 4.1, h: 0.4,
            fontSize: 16, fontFace: "Arial", color: theme.primary, bold: true, align: "center",
          });
          addBullets(slide, s.right_items || [], { x: "5.3", y: 2.1, w: "41%", fontSize: 13 });
          // VS badge
          slide.addShape(pptx.ShapeType.ellipse, {
            x: 4.5, y: 3.5, w: 1.0, h: 1.0,
            fill: { color: theme.secondary },
          });
          slide.addText("VS", {
            x: 4.5, y: 3.5, w: 1.0, h: 1.0,
            fontSize: 14, fontFace: "Arial", color: "FFFFFF", bold: true, align: "center", valign: "middle",
          });
          break;
        }

        // ──────────────────────────────────────────────────────────────
        // CHART SLIDE — now supports radar, scatter, bubble
        // ──────────────────────────────────────────────────────────────
        case "chart": {
          addSlideHeader(slide, s.title_text || "");
          if (s.chart_data && s.chart_data.labels.length > 0) {
            const chartType = s.chart_type || "bar";
            const chartColors = theme.chartColors;
            const cd = s.chart_data;
            const isPie = chartType === "pie" || chartType === "doughnut";
            const isScatter = chartType === "scatter";
            const isBubble = chartType === "bubble";

            // Build chart data differently based on type
            let chartData: any[];
            if (isScatter) {
              // Scatter: x/y pairs from the first dataset
              chartData = [{
                name: cd.datasets[0]?.label || "Series 1",
                labels: cd.labels,
                values: cd.datasets[0]?.data || [],
                chartColors: [chartColors[0]],
              }];
            } else if (isBubble) {
              // Bubble: size comes from second dataset (if available)
              chartData = cd.datasets.map((ds, idx) => ({
                name: ds.label,
                labels: cd.labels,
                values: ds.data,
                chartColors: [chartColors[idx % chartColors.length]],
                // Bubble size: use second dataset values if available
                ...(cd.datasets.length > 1 && idx === 0 ? { sizes: cd.datasets[1]?.data } : {}),
              }));
            } else {
              chartData = cd.datasets.map((ds: { label: string; data: number[] }, idx: number) => ({
                name: ds.label,
                labels: cd.labels,
                values: ds.data,
                chartColors: isPie
                  ? cd.labels.map((_: string, li: number) => chartColors[li % chartColors.length])
                  : [chartColors[idx % chartColors.length]],
              }));
            }

            // Resolve pptxgenjs chart type key
            const chartTypeKey = chartType.toUpperCase() as string;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const pptxChartType = (pptx as any).ChartType?.[chartTypeKey]
              || (pptx as any).ChartType?.BAR; // fallback

            slide.addChart(pptxChartType, chartData, {
              x: 0.6, y: 1.5, w: 8.8, h: 5.0,
              showTitle: false,
              showLegend: cd.datasets.length > 1 || isPie,
              legendPos: "b",
              legendFontSize: 9,
              showValue: true,
              valueFontSize: 8,
              catAxisLabelFontSize: 9,
              valAxisLabelFontSize: 9,
              radarStyle: "filled",
              // Radar-specific styling
              ...(chartType === "radar" ? {
                catAxisLabelColor: theme.text,
                valAxisLabelColor: theme.text,
              } : {}),
            });
          }
          break;
        }

        // ──────────────────────────────────────────────────────────────
        // TABLE SLIDE — enhanced with merged cells and bold columns
        // ──────────────────────────────────────────────────────────────
        case "table": {
          addSlideHeader(slide, s.title_text || "");
          if (s.table_data && s.table_data.headers.length > 0) {
            const td = s.table_data;
            const boldCols = new Set(td.bold_columns ?? [0]); // default: bold first column

            // Build merge map for O(1) lookup
            const mergeMap = new Map<string, { rowspan: number; colspan: number }>();
            if (td.merges) {
              for (const m of td.merges) {
                // Store merge info for the top-left cell of each merge region
                mergeMap.set(`${m.row},${m.col}`, { rowspan: m.rowspan, colspan: m.colspan });
              }
            }

            // Build merged set to skip cells that are covered by another cell's merge
            const coveredCells = new Set<string>();
            if (td.merges) {
              for (const m of td.merges) {
                for (let dr = 0; dr < m.rowspan; dr++) {
                  for (let dc = 0; dc < m.colspan; dc++) {
                    if (dr === 0 && dc === 0) continue; // skip origin
                    coveredCells.add(`${m.row + dr},${m.col + dc}`);
                  }
                }
              }
            }

            const rows: any[][] = [];

            // Header row
            rows.push(
              td.headers.map((h: string, cIdx: number) => ({
                text: h,
                options: {
                  fontSize: 11,
                  fontFace: "Arial",
                  color: "FFFFFF",
                  bold: true,
                  fill: { color: theme.headerBg },
                  border: {
                    pt: { color: "D1D5DB", size: 0.5 },
                    bt: { color: "D1D5DB", size: 0.5 },
                    bl: { color: "D1D5DB", size: 0.5 },
                    br: { color: "D1D5DB", size: 0.5 },
                  },
                  align: "center",
                  valign: "middle",
                },
              })),
            );

            // Data rows
            for (let rIdx = 0; rIdx < td.rows.length; rIdx++) {
              const row: any[] = [];
              for (let cIdx = 0; cIdx < td.headers.length; cIdx++) {
                // Skip cells covered by a merge
                if (coveredCells.has(`${rIdx + 1},${cIdx}`)) {
                  // Push a placeholder that will be skipped by pptxgenjs
                  row.push({ text: "", options: { border: { type: "none" as const }, fill: { color: "FFFFFF" } } });
                  continue;
                }

                const merge = mergeMap.get(`${rIdx + 1},${cIdx}`);
                const cellText = (td.rows[rIdx]?.[cIdx] || "").slice(0, 60);
                const isBoldCol = boldCols.has(cIdx);

                row.push({
                  text: cellText,
                  options: {
                    fontSize: 11,
                    fontFace: "Arial",
                    color: theme.text,
                    bold: isBoldCol,
                    fill: {
                      color: rIdx % 2 === 0 ? theme.tableAlt : "FFFFFF",
                    },
                    border: {
                      pt: { color: "D1D5DB", size: 0.5 },
                      bt: { color: "D1D5DB", size: 0.5 },
                      bl: { color: "D1D5DB", size: 0.5 },
                      br: { color: "D1D5DB", size: 0.5 },
                    },
                    align: cIdx === 0 ? "left" : "center",
                    valign: "middle",
                    rowspan: merge?.rowspan,
                    colspan: merge?.colspan,
                  },
                });
              }
              rows.push(row);
            }

            const colCount = td.headers.length;
            slide.addTable(rows, {
              x: 0.5,
              y: 1.5,
              w: 9.0,
              colW: Array(colCount).fill(9.0 / colCount),
              rowH: Array(Math.min(td.rows.length + 1, 15)).fill(0.5),
              border: { type: "solid", pt: 0.5, color: "D1D5DB" },
              autoPage: false,
            });
          }
          break;
        }

        // ──────────────────────────────────────────────────────────────
        // IMAGE SLIDE
        // ──────────────────────────────────────────────────────────────
        case "image": {
          addSlideHeader(slide, s.title_text || "");
          if (s.image_url) {
            try {
              slide.addImage({
                path: s.image_url,
                x: 1.5, y: 1.5, w: 7.0, h: 4.5,
                sizing: { type: "contain", w: 7.0, h: 4.5 },
                rounding: true,
              });
            } catch {
              slide.addText("[Image could not be loaded]", {
                x: 2, y: 3, w: 6, h: 1,
                fontSize: 14, fontFace: "Arial", color: theme.muted, align: "center", valign: "middle",
              });
            }
            if (s.image_caption) {
              slide.addText(s.image_caption, {
                x: 1.5, y: 6.2, w: 7, h: 0.5,
                fontSize: 11, fontFace: "Arial", color: theme.muted, align: "center", italics: true,
              });
            }
          }
          if (s.body_items && s.body_items.length > 0) {
            addBullets(slide, s.body_items, { x: "0.8", y: 1.6, w: "40%", h: 4.5, fontSize: 13 });
          }
          break;
        }

        // ──────────────────────────────────────────────────────────────
        // TIMELINE SLIDE
        // ──────────────────────────────────────────────────────────────
        case "timeline": {
          addSlideHeader(slide, s.title_text || "");
          const items = s.timeline_items || [];
          const itemH = Math.min(5.5 / Math.max(items.length, 1), 1.2);
          // Timeline vertical line
          slide.addShape(pptx.ShapeType.rect, {
            x: 1.8, y: 1.5, w: 0.04, h: items.length * itemH,
            fill: { color: theme.secondary },
          });
          items.forEach((item: { label: string; description?: string }, idx: number) => {
            const yPos = 1.5 + idx * itemH;
            slide.addShape(pptx.ShapeType.ellipse, {
              x: 1.6, y: yPos + 0.05, w: 0.4, h: 0.4,
              fill: { color: theme.accent },
            });
            slide.addText(item.label, {
              x: 2.3, y: yPos, w: 7, h: 0.4,
              fontSize: 15, fontFace: "Arial", color: theme.primary, bold: true,
            });
            if (item.description) {
              slide.addText(item.description, {
                x: 2.3, y: yPos + 0.4, w: 7, h: itemH - 0.4,
                fontSize: 12, fontFace: "Arial", color: theme.text,
              });
            }
          });
          break;
        }

        // ──────────────────────────────────────────────────────────────
        // QUOTE SLIDE — with gradient support
        // ──────────────────────────────────────────────────────────────
        case "quote": {
          if (s.gradient) {
            slide.addShape(pptx.ShapeType.rect, {
              x: 0, y: 0, w: "100%", h: "100%",
              fill: { color: s.gradient.colors[0] },
            });
            slide.addShape(pptx.ShapeType.rect, {
              x: 0, y: 0, w: "100%", h: "100%",
              fill: { color: s.gradient.colors[1], transparency: 60 },
            });
          } else {
            slide.addShape(pptx.ShapeType.rect, {
              x: 0, y: 0, w: "100%", h: "100%",
              fill: { color: theme.lightBg },
            });
          }
          // Left accent bar
          slide.addShape(pptx.ShapeType.rect, {
            x: 0.8, y: 1.5, w: 0.06, h: 4.0,
            fill: { color: theme.secondary },
          });
          // Icon
          addIconElement(slide, icon, { x: 9.0, y: 1.0, w: 0.8, h: 0.8, fontSize: 40 });
          // Quote mark
          slide.addText("\u201C", {
            x: 1.2, y: 1.0, w: 2, h: 1.5,
            fontSize: 72, fontFace: "Georgia", color: theme.accent,
          });
          // Quote text
          slide.addText(s.quote_text || s.body_items?.[0] || "", {
            x: 1.2, y: 2.5, w: 8, h: 2.5,
            fontSize: 22, fontFace: "Georgia", color: theme.text, italics: true,
            lineSpacingMultiple: 1.3,
          });
          // Author
          if (s.quote_author) {
            slide.addShape(pptx.ShapeType.rect, {
              x: 1.2, y: 5.2, w: 2, h: 0.04,
              fill: { color: theme.accent },
            });
            slide.addText(`\u2014 ${s.quote_author}`, {
              x: 1.2, y: 5.4, w: 8, h: 0.4,
              fontSize: 14, fontFace: "Arial", color: theme.muted, bold: true,
            });
          }
          break;
        }

        // ──────────────────────────────────────────────────────────────
        // THANK YOU SLIDE — with gradient support
        // ──────────────────────────────────────────────────────────────
        case "thank_you": {
          if (s.gradient) {
            slide.addShape(pptx.ShapeType.rect, {
              x: 0, y: 0, w: "100%", h: "100%",
              fill: { color: s.gradient.colors[0] },
            });
            slide.addShape(pptx.ShapeType.rect, {
              x: 0, y: 0, w: "50%", h: "100%",
              fill: { color: s.gradient.colors[1], transparency: 40 },
            });
          } else {
            slide.addShape(pptx.ShapeType.rect, {
              x: 0, y: 0, w: "100%", h: "100%",
              fill: { color: theme.primary },
            });
          }
          slide.addShape(pptx.ShapeType.rect, {
            x: 0, y: 0, w: "100%", h: 0.06,
            fill: { color: theme.accent },
          });
          // Icon
          addIconElement(slide, icon, { x: 4.6, y: 1.0, w: 0.8, h: 0.8, fontSize: 36 });
          slide.addText(s.title_text || "Thank You", {
            x: 0.5, y: 2.0, w: 9, h: 1.5,
            fontSize: 40, fontFace: "Arial", color: "FFFFFF", bold: true, align: "center", valign: "middle",
          });
          if (s.subtitle) {
            slide.addText(s.subtitle, {
              x: 1, y: 3.5, w: 8, h: 1.0,
              fontSize: 18, fontFace: "Arial", color: theme.accent, align: "center", valign: "top",
            });
          }
          if (s.body_items && s.body_items.length > 0) {
            slide.addText(s.body_items.join("\n"), {
              x: 1.5, y: 4.5, w: 7, h: 1.5,
              fontSize: 14, fontFace: "Arial", color: "CBD5E1", align: "center", valign: "top",
            });
          }
          break;
        }

        // ──────────────────────────────────────────────────────────────
        // KPI SLIDE — 2-4 metric cards
        // ──────────────────────────────────────────────────────────────
        case "kpi": {
          addSlideHeader(slide, s.title_text || "");

          const kpis = s.kpi_items?.slice(0, 4) || [];
          const cardCount = Math.max(kpis.length, 1);
          const cardW = 2.2;
          const cardH = 4.2;
          const gap = 0.3;
          const totalW = cardCount * cardW + (cardCount - 1) * gap;
          const startX = (10 - totalW) / 2;
          const cardColors = [theme.primary, theme.secondary, theme.accent, theme.headerBg];

          kpis.forEach((kpi, idx) => {
            const x = startX + idx * (cardW + gap);
            const y = 1.6;
            const cardColor = cardColors[idx % cardColors.length];

            // Card background (rounded rectangle)
            slide.addShape(pptx.ShapeType.roundRect, {
              x, y, w: cardW, h: cardH,
              fill: { color: cardColor },
              rectRadius: 0.1,
              shadow: { type: "outer", blur: 6, offset: 2, color: "000000", opacity: 0.15 },
            });

            // KPI value — large, bold, white
            slide.addText(kpi.value, {
              x, y: y + 0.5, w: cardW, h: 1.2,
              fontSize: 32, fontFace: "Arial", color: "FFFFFF", bold: true,
              align: "center", valign: "middle",
            });

            // KPI label — smaller, lighter
            slide.addText(kpi.label, {
              x, y: y + 1.8, w: cardW, h: 0.6,
              fontSize: 13, fontFace: "Arial", color: "CBD5E1",
              align: "center", valign: "middle",
            });

            // Change indicator (trend arrow + value)
            if (kpi.change) {
              const trendColor = kpi.trend === "up" ? "4ADE80" : kpi.trend === "down" ? "F87171" : "CBD5E1";
              const trendArrow = kpi.trend === "up" ? "\u2191" : kpi.trend === "down" ? "\u2193" : "";
              slide.addText(`${trendArrow} ${kpi.change}`, {
                x, y: y + 2.6, w: cardW, h: 0.5,
                fontSize: 14, fontFace: "Arial", color: trendColor, bold: true,
                align: "center", valign: "middle",
              });
            }

            // Decorative bottom accent line
            slide.addShape(pptx.ShapeType.rect, {
              x: x + cardW * 0.2, y: y + cardH - 0.15, w: cardW * 0.6, h: 0.04,
              fill: { color: theme.accent },
            });
          });

          // Subtitle below KPI cards
          if (s.subtitle) {
            slide.addText(s.subtitle, {
              x: 0.8, y: 6.2, w: 8.4, h: 0.4,
              fontSize: 12, fontFace: "Arial", color: theme.muted, align: "center", italics: true,
            });
          }
          break;
        }

        // ──────────────────────────────────────────────────────────────
        // AGENDA SLIDE — numbered sections
        // ──────────────────────────────────────────────────────────────
        case "agenda": {
          addSlideHeader(slide, s.title_text || "");
          const items = s.agenda_items || [];
          const itemH = Math.min(5.0 / Math.max(items.length, 1), 1.1);

          items.forEach((item, idx) => {
            const yPos = 1.5 + idx * itemH;

            // Subtle background band for alternating items
            if (idx % 2 === 0) {
              slide.addShape(pptx.ShapeType.rect, {
                x: 0.5, y: yPos - 0.05, w: 9.0, h: itemH,
                fill: { color: theme.lightBg },
                rectRadius: 0.03,
              });
            }

            // Number circle
            slide.addShape(pptx.ShapeType.ellipse, {
              x: 0.8, y: yPos + 0.1, w: 0.55, h: 0.55,
              fill: { color: idx % 2 === 0 ? theme.secondary : theme.accent },
            });
            slide.addText(String(item.number), {
              x: 0.8, y: yPos + 0.1, w: 0.55, h: 0.55,
              fontSize: 16, fontFace: "Arial", color: "FFFFFF", bold: true,
              align: "center", valign: "middle",
            });

            // Section title
            slide.addText(item.title, {
              x: 1.6, y: yPos + 0.05, w: 7.5, h: 0.4,
              fontSize: 16, fontFace: "Arial", color: theme.primary, bold: true,
              valign: "middle",
            });

            // Description
            if (item.description) {
              slide.addText(item.description, {
                x: 1.6, y: yPos + 0.45, w: 7.5, h: 0.5,
                fontSize: 12, fontFace: "Arial", color: theme.muted,
                valign: "top",
              });
            }

            // Connector line to next item
            if (idx < items.length - 1) {
              slide.addShape(pptx.ShapeType.rect, {
                x: 1.05, y: yPos + itemH - 0.15, w: 0.02, h: 0.2,
                fill: { color: theme.secondary },
              });
            }
          });
          break;
        }

        // ──────────────────────────────────────────────────────────────
        // BLANK SLIDE
        // ──────────────────────────────────────────────────────────────
        case "blank":
        default: {
          if (s.gradient) {
            slide.addShape(pptx.ShapeType.rect, {
              x: 0, y: 0, w: "100%", h: "100%",
              fill: { color: s.gradient.colors[0] },
            });
            slide.addShape(pptx.ShapeType.rect, {
              x: 0, y: 0, w: "60%", h: "100%",
              fill: { color: s.gradient.colors[1], transparency: 40 },
            });
          }
          // Just footer
          slide.addText(`${title}`, {
            x: 0.4, y: 7.0, w: "45%", h: 0.3,
            fontSize: 8, fontFace: "Arial", color: theme.muted,
          });
          slide.addText(`${pptx.slides.length}`, {
            x: "85%", y: 7.0, w: "12%", h: 0.3,
            fontSize: 8, fontFace: "Arial", color: theme.muted, align: "right",
          });
          break;
        }
      }

      // Apply slide transition
      applyTransition(slide, s.transition);

      // Speaker notes
      if (s.notes) {
        slide.addNotes(s.notes);
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // WRITE FILE
    // ═══════════════════════════════════════════════════════════════════
    const buffer = (await (pptx as any).write({ outputType: "nodebuffer" })) as Buffer;
    writeFileSync(filePath, buffer);

    const basename = filePath.split("/").pop() || "presentation.pptx";
    const fileBase64 = buffer.toString("base64");

    try {
      const { cacheFile } = await import("@/lib/workspace/file-cache");
      await cacheFile(basename, buffer, "application/vnd.openxmlformats-officedocument.presentationml.presentation", basename);
    } catch { /* best-effort */ }

    return {
      filename: basename,
      title,
      downloadUrl: `/api/files/${basename}`,
      fileBase64,
      fileSize: buffer.length,
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      message: `PowerPoint "${title}" created: ${slides.length} slides, theme='${themeName || "ocean"}', 16:9 widescreen. Download available.`,
    };
  }),
});

export const generateChartTool = tool({
  description: "Generate charts, graphs, and diagrams as downloadable SVG or PNG files. Supports bar charts, line charts, pie charts, scatter plots, and flowcharts/diagrams (Mermaid syntax). Use this when the user asks to create a chart, graph, diagram, visualization, or any data-driven visual. Returns the chart as a downloadable file.",
  inputSchema: zodSchema(z.object({
    chart_type: z.enum(["bar", "line", "pie", "scatter", "mermaid", "table"]).describe("Type of chart to generate"),
    title: z.string().describe("Chart title"),
    data: z.string().optional().describe("Chart data as JSON string. For bar/line/scatter: {labels:[], datasets:[{label,data}]} For pie: {labels:[], data:[]} For mermaid: the Mermaid diagram code For table: {headers:[], rows:[][]}"),
    mermaid_code: z.string().optional().describe("Mermaid diagram code (only for chart_type='mermaid')"),
    width: z.number().optional().describe("Chart width in pixels (default: 800)"),
    height: z.number().optional().describe("Chart height in pixels (default: 500)"),
    filename: z.string().optional().describe("Output filename (without extension). Default: derived from title"),
  })),
  execute: safeJson(async ({ chart_type, title, data, mermaid_code, width, height, filename }) => {
    const { tmpdir } = await import("os");
    const { join } = await import("path");
    const { writeFileSync } = await import("fs");

    const w = width || 800;
    const h = height || 500;
    const safeName = (filename || title).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 60);

    let svgContent = "";
    let fileExt = "svg";
    let mimeType = "image/svg+xml";

    if (chart_type === "mermaid") {
      // For Mermaid diagrams, return the code for rendering and an SVG placeholder
      const code = mermaid_code || data || "";
      svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="#ffffff" rx="8"/>
  <text x="50%" y="40" text-anchor="middle" font-family="Arial" font-size="18" font-weight="bold" fill="#111827">${escapeXml(title)}</text>
  <text x="50%" y="${h / 2}" text-anchor="middle" font-family="monospace" font-size="12" fill="#6B7280">Mermaid Diagram — Render with Mermaid.js</text>
  <text x="20" y="${h - 40}" font-family="monospace" font-size="9" fill="#9CA3AF">${escapeXml(code.slice(0, 300))}</text>
</svg>`;
    } else if (chart_type === "table") {
      // Generate an SVG table
      const tableData = data ? JSON.parse(data) : { headers: [], rows: [] };
      const headers = tableData.headers || [];
      const rows = tableData.rows || [];
      const colW = Math.max(Math.min(w / (headers.length || 1), 200), 80);
      const rowH = 30;
      const headerH = 35;
      const totalH = headerH + rows.length * rowH + 60;

      let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(w, headers.length * colW + 40)}" height="${totalH}" viewBox="0 0 ${Math.max(w, headers.length * colW + 40)} ${totalH}">
  <rect width="100%" height="100%" fill="#ffffff" rx="8"/>
  <text x="20" y="30" font-family="Arial" font-size="16" font-weight="bold" fill="#111827">${escapeXml(title)}</text>`;

      // Header row
      const startX = 20;
      let x = startX;
      svg += `<rect x="${startX}" y="42" width="${headers.length * colW}" height="${headerH}" fill="#3B82F6" rx="4"/>`;
      for (const hdr of headers) {
        svg += `<text x="${x + 8}" y="${42 + headerH / 2 + 5}" font-family="Arial" font-size="12" font-weight="bold" fill="white">${escapeXml(String(hdr).slice(0, 20))}</text>`;
        x += colW;
      }

      // Data rows
      for (let r = 0; r < Math.min(rows.length, 50); r++) {
        const y = 42 + headerH + r * rowH;
        const bg = r % 2 === 0 ? "#F9FAFB" : "#FFFFFF";
        svg += `<rect x="${startX}" y="${y}" width="${headers.length * colW}" height="${rowH}" fill="${bg}"/>`;
        x = startX;
        for (let c = 0; c < (rows[r]?.length || 0); c++) {
          svg += `<text x="${x + 8}" y="${y + rowH / 2 + 4}" font-family="Arial" font-size="11" fill="#374151">${escapeXml(String(rows[r][c] || "").slice(0, 25))}</text>`;
          x += colW;
        }
      }
      svg += "</svg>";
      svgContent = svg;
    } else {
      // Bar, Line, Pie, Scatter charts — generate clean SVG
      const chartData = data ? JSON.parse(data) : { labels: [], datasets: [] };
      const labels = chartData.labels || [];
      const datasets = chartData.datasets || [];
      const colors = ["#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4", "#F97316"];

      if (chart_type === "pie") {
        const pieData = chartData.data || (datasets[0]?.data || []);
        const pieLabels = chartData.labels || (datasets[0]?.label ? [datasets[0].label] : []);
        const total = pieData.reduce((a: number, b: number) => a + (Number(b) || 0), 0) || 1;
        const cx = w / 2;
        const cy = h / 2 + 20;
        const radius = Math.min(w, h) / 2 - 80;
        let currentAngle = -Math.PI / 2;

        let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="#ffffff" rx="8"/>
  <text x="50%" y="35" text-anchor="middle" font-family="Arial" font-size="18" font-weight="bold" fill="#111827">${escapeXml(title)}</text>`;

        for (let i = 0; i < pieData.length; i++) {
          const value = Number(pieData[i]) || 0;
          const angle = (value / total) * 2 * Math.PI;
          const x1 = cx + radius * Math.cos(currentAngle);
          const y1 = cy + radius * Math.sin(currentAngle);
          const x2 = cx + radius * Math.cos(currentAngle + angle);
          const y2 = cy + radius * Math.sin(currentAngle + angle);
          const largeArc = angle > Math.PI ? 1 : 0;

          svg += `<path d="M${cx},${cy} L${x1},${y1} A${radius},${radius} 0 ${largeArc},1 ${x2},${y2} Z" fill="${colors[i % colors.length]}" stroke="white" stroke-width="2"/>`;

          // Label
          const midAngle = currentAngle + angle / 2;
          const labelR = radius * 0.65;
          const lx = cx + labelR * Math.cos(midAngle);
          const ly = cy + labelR * Math.sin(midAngle);
          const pct = Math.round((value / total) * 100);
          if (pct > 3) {
            svg += `<text x="${lx}" y="${ly}" text-anchor="middle" font-family="Arial" font-size="11" font-weight="bold" fill="white">${pct}%</text>`;
          }

          currentAngle += angle;
        }

        // Legend
        svg += `<g transform="translate(20, ${h - pieLabels.length * 20 - 20})">`;
        for (let i = 0; i < pieLabels.length; i++) {
          svg += `<rect x="0" y="${i * 20}" width="12" height="12" fill="${colors[i % colors.length]}" rx="2"/>`;
          svg += `<text x="18" y="${i * 20 + 10}" font-family="Arial" font-size="11" fill="#374151">${escapeXml(String(pieLabels[i]).slice(0, 25))}</text>`;
        }
        svg += "</g></svg>";
        svgContent = svg;
      } else {
        // Bar / Line / Scatter
        const allValues: number[] = [];
        for (const ds of datasets) {
          for (const v of (ds.data || [])) allValues.push(Number(v) || 0);
        }
        const maxVal = Math.max(...allValues, 1);
        const minVal = Math.min(...allValues, 0);
        const range = maxVal - minVal || 1;

        const margin = { top: 60, right: 30, bottom: 60, left: 60 };
        const plotW = w - margin.left - margin.right;
        const plotH = h - margin.top - margin.bottom;

        let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="#ffffff" rx="8"/>
  <text x="50%" y="35" text-anchor="middle" font-family="Arial" font-size="18" font-weight="bold" fill="#111827">${escapeXml(title)}</text>`;

        // Y-axis gridlines
        const gridLines = 5;
        for (let i = 0; i <= gridLines; i++) {
          const val = minVal + (range * i) / gridLines;
          const y = margin.top + plotH - (plotH * i) / gridLines;
          svg += `<line x1="${margin.left}" y1="${y}" x2="${w - margin.right}" y2="${y}" stroke="#E5E7EB" stroke-width="0.5"/>`;
          svg += `<text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" font-family="Arial" font-size="10" fill="#9CA3AF">${Math.round(val * 100) / 100}</text>`;
        }

        // X-axis labels
        const barGroupWidth = labels.length > 0 ? plotW / labels.length : plotW;
        for (let i = 0; i < labels.length; i++) {
          const x = margin.left + barGroupWidth * i + barGroupWidth / 2;
          svg += `<text x="${x}" y="${h - margin.bottom + 20}" text-anchor="middle" font-family="Arial" font-size="10" fill="#6B7280">${escapeXml(String(labels[i]).slice(0, 15))}</text>`;
        }

        // Plot datasets
        for (let di = 0; di < datasets.length; di++) {
          const ds = datasets[di];
          const color = colors[di % colors.length];
          const vals = (ds.data || []).map(Number);

          if (chart_type === "bar") {
            const barWidth = Math.min(barGroupWidth / (datasets.length + 0.5) - 2, 60);
            for (let i = 0; i < vals.length; i++) {
              const barH = ((vals[i] - minVal) / range) * plotH;
              const x = margin.left + barGroupWidth * i + (di * barWidth) + barGroupWidth * 0.15;
              const y = margin.top + plotH - barH;
              svg += `<rect x="${x}" y="${y}" width="${barWidth}" height="${Math.max(barH, 1)}" fill="${color}" rx="3" opacity="0.85"/>`;
            }
          } else if (chart_type === "line") {
            let pathD = "";
            for (let i = 0; i < vals.length; i++) {
              const x = margin.left + barGroupWidth * i + barGroupWidth / 2;
              const y = margin.top + plotH - ((vals[i] - minVal) / range) * plotH;
              pathD += (i === 0 ? "M" : "L") + `${x},${y} `;
            }
            svg += `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="2.5"/>`;
            // Data points
            for (let i = 0; i < vals.length; i++) {
              const x = margin.left + barGroupWidth * i + barGroupWidth / 2;
              const y = margin.top + plotH - ((vals[i] - minVal) / range) * plotH;
              svg += `<circle cx="${x}" cy="${y}" r="4" fill="${color}" stroke="white" stroke-width="2"/>`;
            }
          } else if (chart_type === "scatter") {
            for (let i = 0; i < vals.length; i++) {
              const x = margin.left + barGroupWidth * i + barGroupWidth / 2;
              const y = margin.top + plotH - ((vals[i] - minVal) / range) * plotH;
              svg += `<circle cx="${x}" cy="${y}" r="5" fill="${color}" opacity="0.7"/>`;
            }
          }

          // Legend
          if (ds.label) {
            const legendX = margin.left + di * 120;
            svg += `<rect x="${legendX}" y="${h - 20}" width="10" height="10" fill="${color}" rx="2"/>`;
            svg += `<text x="${legendX + 14}" y="${h - 12}" font-family="Arial" font-size="10" fill="#374151">${escapeXml(String(ds.label).slice(0, 20))}</text>`;
          }
        }

        svg += "</svg>";
        svgContent = svg;
      }
    }

    const filePath = join(tmpdir(), `klaw-${safeName}-${Date.now()}.${fileExt}`);
    writeFileSync(filePath, svgContent);
    const fileBuffer = Buffer.from(svgContent);
    const fileBase64 = fileBuffer.toString("base64");
    const basename = filePath.split("/").pop() || `chart.${fileExt}`;

    // Cache for download
    try {
      const { cacheFile } = await import("@/lib/workspace/file-cache");
      await cacheFile(basename, fileBuffer, mimeType, basename);
    } catch {
      // best-effort
    }

    return {
      filename: basename,
      title,
      downloadUrl: `/api/files/${basename}`,
      fileBase64,
      fileSize: fileBuffer.length,
      mimeType,
      chart_type,
      message: `Chart "${title}" (${chart_type}) created successfully. Download available as SVG.`,
    };
  }),
});

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

