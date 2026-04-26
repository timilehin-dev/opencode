---
name: docx
tags: [docx, word, document, report, proposal, contract]
metadata:
  author: Z.AI
  version: "1.0"
  category: document
  difficulty: intermediate
description: "Comprehensive document creation, editing, and analysis with support for tracked changes, comments, formatting preservation, and text extraction."
license: Proprietary
---

# DOCX Creation, Editing, and Analysis

## Quick Setup

```bash
bash "$SKILL_DIR/setup.sh"    # Interactive environment check + install
```

## Overview

A .docx file is a ZIP archive containing XML files. This skill provides tools for creating, editing, reading, and reviewing Word documents.

## Quick Route — Read This First

**Step 1**: Determine task type → load the corresponding route file
**Step 2**: Determine business scene → load the corresponding scene file (if applicable)
**Step 3**: Load `references/design-system.md` for cover recipes, palettes, and chart colors
**Step 4**: Load `references/common-rules.md` for shared layout, font, and quality rules
**Step 5**: Execute per route instructions
**Step 6**: Run the post-generation checklist

⚠️ **MANDATORY — Cover Recipe Enforcement (Step 3):**
When creating a document that needs a cover page, you MUST use one of the 7 validated cover recipes (R1–R7) from `design-system.md`. **Free-form cover code is FORBIDDEN.** The recipe provides the wrapper table, background, layout structure, border settings, and spacing — do not reinvent any of these.

Workflow: (1) Call `selectCoverRecipe(docType, industry)` to get recipe + palette → (2) Use the corresponding `buildCoverRX()` function code from `design-system.md` → (3) Pass your `config` (title, subtitle, metaLines, etc.) into the recipe builder. If you skip this and write cover code from scratch, the cover WILL have compatibility issues (blank pages in MS Office, missing borders, overflow, etc.).

### Script Path Setup (MANDATORY before any script call)

All CLI tools live in `scripts/` relative to this skill's directory. Before calling any script, resolve the absolute path once:

```bash
DOCX_SCRIPTS="<skill_directory>/scripts"   # ← parent directory of this SKILL.md

# Then all commands use $DOCX_SCRIPTS:
python3 "$DOCX_SCRIPTS/postcheck.py" output.docx
python3 "$DOCX_SCRIPTS/add_toc_placeholders.py" output.docx --auto
```

**For Python imports** (when generation code needs to import skill modules):

```python
import sys, os
DOCX_SCRIPTS = os.path.join("<skill_directory>", "scripts")
if DOCX_SCRIPTS not in sys.path:
    sys.path.insert(0, DOCX_SCRIPTS)
```

**⚠️ NEVER use bare `python3 scripts/...`** — it only works if cwd happens to be the skill directory. Always use the absolute `$DOCX_SCRIPTS` path.

### Task Router

| User Intent | Route | Files to Load |
|-------------|-------|---------------|
| Create/write/generate (no attachment) | **Create** | `routes/create.md` + `references/docx-js-core.md` |
| Edit/modify/revise (has attachment) | **Edit** | `routes/edit.md` + `references/ooxml.md` |
| Format/layout/font/margin | **Format** | `routes/format.md` |
| Comment/annotate/review | **Comment** | `routes/comment.md` |
| Read/analyze/extract | **Read** | `routes/read.md` |

### Scene Router (Optional — load after route)

| User Keywords | Scene | File |
|---------------|-------|------|
| thesis, academic, research, paper, dissertation, abstract, journal | Academic | `scenes/academic.md` |
| report, analysis, experiment, testing, survey, review, summary, proposal, feasibility, competitor, industry, operations | Report | `scenes/report.md` |
| contract, agreement, terms, transfer, NDA, confidential, framework, cooperation, service terms, user agreement, procurement | Contract | `scenes/contract.md` |
| resume, CV, job application | Resume | `scenes/resume.md` |
| exam, test, quiz, paper (exam context), lesson plan | Exam | `scenes/exam.md` |
| official document, notice, letter, reply, minutes, red header, government, issuance | Official | `scenes/official-doc.md` |
| broadcast script, product copy, livestream, speech, presentation script, video script | Copywriting | `scenes/copywriting.md` |
| plan, proposal (if not report context) | Report | `scenes/report.md` |
| policy, regulation, standard, management rules | Official | `scenes/official-doc.md` |

**If no scene matches**, use default design rules from `references/design-system.md` and `references/common-rules.md`.

## Formatting Standards (Always Apply)

→ See `references/common-rules.md` for full font profiles, spacing, indent, and layout rules.

**Key rules (quick reference):**
- **Line spacing**: 1.3x (`line: 312`) — MANDATORY. Exceptions: resume 1.15x, official doc 28pt fixed, copywriting `400`, contract 1.5x
- **CJK body**: Justified + 2-char indent (`firstLine: 480` SimSun / `420` YaHei)
- **Tables**: `margins` set, `ShadingType.CLEAR`, `tableHeader: true`, `cantSplit: true`, title `keepNext: true`
- **Images**: `type` parameter required, preserve aspect ratio via `image-size`, PageBreak inside Paragraph
- **Full-page Table row**: `rule: "exact"` with 1200 twips safety margin

## Unit Quick Reference

| Unit | Value |
|------|-------|
| 1 cm | 567 twips |
| 1 inch | 1440 twips |
| 1 pt | 20 half-points |
| A4 | 11906 × 16838 twips |

For Chinese font size table and common margins, see `references/common-rules.md`.

## Post-Generation — Two-Layer Verification

### Layer 1: Manual Checklist (self-check during generation)

#### Basic Format
- [ ] Line spacing is 1.3x (`line: 312`) or scene-specific override
- [ ] CJK body has 2-char indent (`firstLine: 480` or `420`)
- [ ] Tables have margins set
- [ ] Images preserve aspect ratio via `image-size` — NEVER hardcode both width and height
- [ ] PageBreak inside Paragraph
- [ ] ShadingType uses CLEAR
- [ ] Each numbered list uses unique `reference`
- [ ] **⚠️ CRITICAL — Quotation marks in JS strings properly escaped.** Chinese curly quotes (`""` `''`) MUST use Unicode escapes (`\u201c` `\u201d` `\u2018` `\u2019`); straight quotes (`"` `'`) use `\"` `\'` or alternate delimiters. **This is the #1 most common code generation bug.** Chinese text frequently contains `""` for emphasis or proper nouns (e.g., "双11", "前低后高", "618") — every occurrence MUST be escaped. Failure to escape produces JS syntax errors that silently break document generation.
- [ ] ImageRun includes `type` parameter
- [ ] Header/footer present (unless scene says otherwise)

#### Heading Styles
- [ ] All body chapter headings use `heading: HeadingLevel.HEADING_X` (never simulate with bold + large font)
- [ ] Cover title may skip Heading style (not in TOC), but body headings MUST use Heading style

#### Page Break & Blank Page Prevention
- [ ] Cover/content in separate sections
- [ ] Three rules to prevent blank pages:
  - ① When using section(NEXT_PAGE), previous section must NOT end with PageBreak (double break = blank page)
  - ② PageBreak paragraph SHOULD contain visible text — **exception**: section-ending empty para + PageBreak is allowed (normal section separator, e.g., after cover page)
  - ③ No more than 3 consecutive empty paragraphs
- [ ] Full-page Table row height uses `rule: "exact"` (never `"atLeast"` for tall tables)
- [ ] No unwanted blank pages (check each section ending)

#### TOC
→ See `references/toc.md` for the complete TOC reference and checklist.
- [ ] If TOC title exists → `TableOfContents` element must be present
- [ ] **⚠️ MANDATORY PageBreak after TableOfContents** — a Paragraph containing PageBreak MUST immediately follow the `TableOfContents` element; without it, TOC and body content will render on the same page. This is the #1 TOC formatting failure — never omit it
- [ ] `add_toc_placeholders.py --auto` runs after generation; exit code = 0
- [ ] **TOC MUST be in its own section** — body section sets `page: { pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } }` so page numbers start from the first body page, not from the TOC pages
- [ ] **Page number API nesting** — `pageNumbers` MUST be inside `page: {}`, NOT at properties top level (see toc.md § Page Number API)
- [ ] **3-section page numbering** — Cover (no page#) → Front matter (Roman i,ii,iii, start=1) → Body (Arabic 1,2,3, start=1)
- [ ] **Post-process footers** — Roman section footer instrText must contain `PAGE \* ROMAN \* MERGEFORMAT`; Arabic section `PAGE \* arabic \* MERGEFORMAT` (WPS ignores pgNumType fmt). **⚠️ NEVER use `\* decimal` in instrText** — `decimal` is a docx-js API enum value (`NumberFormat.DECIMAL`), NOT a valid Word field format switch; using it causes page numbers to render as "1decimal", "2decimal". The correct Word field switch for Arabic numerals is `\* arabic`.
- [ ] **Remove empty pgNumType** — Post-process to strip `<w:pgNumType/>` from cover section (docx-js emits empty element that confuses WPS)
- [ ] **⚠️ TOC Refresh Hint MANDATORY** — between `TableOfContents` element and the PageBreak, MUST add an italic gray note paragraph telling users to right-click TOC → "Update Field" to refresh page numbers (see toc.md § TOC Refresh Hint)

#### Table Cross-Page
- [ ] Header rows: `tableHeader: true`
- [ ] All rows: `cantSplit: true`
- [ ] Title paragraph: `keepNext: true`

#### Cover
- [ ] **Cover MUST use a validated recipe (R1–R7)** from `design-system.md` — free-form cover code is forbidden
- [ ] Cover recipe matches document type (per `selectCoverRecipe()` in `design-system.md`)
- [ ] Cover uses the 16838 outer wrapper table with `allNoBorders` (all recipes provide this)
- [ ] Cover title uses `calcTitleLayout()` — never hardcoded font size above 40pt
- [ ] Cover spacing uses `calcCoverSpacing()` — never hardcoded large spacing values
- [ ] Cover content does not overflow (total height ≤ 15638 twips, Table uses `rule: "exact"`)
- [ ] Every TextRun on dark/colored background has explicit `color` set (Rule 9 — never rely on default black)
- [ ] Cover section has no trailing PageBreak or empty paragraphs
- [ ] Title lines split at semantic boundaries (no mid-word breaks, no single-char orphan lines)
- [ ] No text-character decorative lines (`───`, `━━━`) — use paragraph borders only

### Layer 2: Automated Post-Check Script

```bash
python3 "$DOCX_SCRIPTS/postcheck.py" output.docx
```

Automatically checks 14 business rules: blank pages, **cover overflow (font size/spacing/trailing content)**, line spacing consistency, table margins, table cross-page control (cantSplit/tblHeader), image overflow, image aspect ratio distortion, font fallback, CJK indent, heading hierarchy, ShadingType misuse, TOC quality, document cleanliness (placeholder text/Markdown/HTML residuals), report content quality (abstract presence/heading specificity/vague conclusion detection).

⚠️ **After generating any document, MUST run postcheck.py and fix all ❌ errors.**

## Math Formulas

Formula input uses **LaTeX syntax**, internally converted to docx-js Math objects.

- **Basic formulas** (fractions, sub/superscript, roots, summation) → docx-js Math components
- **Complex formulas** (3+ nesting, matrices, piecewise functions) → matplotlib PNG fallback

See `references/math-formulas.md`.

## Charts

Default: **matplotlib template library** generates PNG for embedding.

6 ready-to-use templates: bar, line, pie, box, radar, heatmap.
Colors auto-derived from document palette.accent for style consistency.
Default palette: Morandi low-saturation (see design-system.md).

See `references/chart-templates.md`.

## Dependencies

- **pandoc**: Text extraction
- **docx**: `bun add docx` or `npm install docx` (creating)
- **LibreOffice**: PDF conversion, .doc support
- **Poppler**: PDF to image (`pdftoppm`)
- **defusedxml**: Secure XML parsing
- **python-docx**: Simple comment operations
