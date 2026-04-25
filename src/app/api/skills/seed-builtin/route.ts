// ---------------------------------------------------------------------------
// Skills Seed Builtin — GET (list) / POST (seed) built-in skills
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// ---------------------------------------------------------------------------
// Type for the builtin skill definition
// ---------------------------------------------------------------------------
interface BuiltinSkill {
  id: string;
  name: string;
  display_name: string;
  slug: string;
  description: string;
  category: string;
  difficulty: string;
  prompt_template: string;
  workflow_steps: unknown[];
  required_tools: string[];
  tags: string[];
  agent_bindings: string[];
  is_builtin: boolean;
  is_active: boolean;
  version: number;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// All 10 built-in skills
// ---------------------------------------------------------------------------
const BUILTIN_SKILLS: BuiltinSkill[] = [
// All 10 built-in skills
  // =========================================================================
  // 1. DOCX — Document Processing
  // =========================================================================
  {
    id: "a1b2c3d4-0001-4000-8000-000000000001",
    name: "docx",
    display_name: "DOCX Document Creation",
    slug: "docx-document-creation",
    description:
      "Create, edit, and format Word documents (.docx). Use when user wants to produce reports, proposals, contracts, letters, memos, or any formal document.",
    category: "document",
    difficulty: "intermediate",
    tags: ["docx", "word", "document", "report", "proposal", "contract"],
    required_tools: [],
    agent_bindings: ["general", "mail", "code", "data", "creative", "research", "ops"],
    workflow_steps: [
      { step: 1, action: "Analyze document requirements (type, audience, structure)" },
      { step: 2, action: "Plan document architecture (sections, headings, styles)" },
      { step: 3, action: "Generate the .docx using python-docx or appropriate library" },
      { step: 4, action: "Apply professional formatting and validation" },
    ],
    is_builtin: true,
    is_active: true,
    version: 1,
    metadata: { source: "adapted-from-minimax-docx", adapter: "system" },
    prompt_template: `# DOCX Document Creation — World-Class Document Generation

You are an expert document engineer. You create professional Word documents (.docx) by writing **high-quality markdown content** and passing it to the \`create_docx_document\` tool. The tool handles all formatting automatically.

## CRITICAL: How This Works

You do NOT write code or use Python libraries. You write **structured markdown content** and call the tool:

\`\`\`
create_docx_document(
  title="Document Title",
  content="# Section 1\\n\\nBody text here...\\n\\n## Subsection\\n\\nMore content...",
  filename="optional-filename"
)
\`\`\`

The tool converts your markdown into a professionally formatted .docx file with:
- **Headings**: \`# H1\`, \`## H2\`, \`### H3\` → styled heading hierarchy
- **Bold/Italic**: \`**bold text**\`, \`*italic text*\` → proper font formatting
- **Bullet lists**: \`- item\` → bulleted list
- **Numbered lists**: \`1. item\` → numbered list
- **Tables**: \`| Header | Header |\\n|---|---|\\n| Cell | Cell |\` → styled table with header row
- **Code blocks**: \`\\\`\\\`\\\`code\\\`\\\`\\\`\` → monospace with background shading
- **Horizontal rules**: \`---\` → divider line
- **Paragraphs**: Empty lines between blocks

## Step 1: Analyze Requirements
Determine: document type (report/proposal/contract/letter/memo/academic/resume), audience, tone, scope.

## Step 2: Plan Structure
Every professional document follows this anatomy:
1. **Title** — clear, descriptive (provided via title parameter)
2. **Executive Summary / Abstract** — 1-2 paragraphs summarizing key findings/recommendations
3. **Body sections** with proper heading hierarchy (H1 → H2 → H3)
4. **Tables** — data presented in formatted tables where appropriate
5. **Conclusion / Recommendations** — actionable next steps
6. **References / Bibliography** — if applicable

## Step 3: Write World-Class Content

### Content Depth Standards (MANDATORY)
- **Every paragraph** must have 3-5 sentences minimum — single-sentence paragraphs are FORBIDDEN
- **Every section** must have 150-200+ words of body content
- **Include** specific examples, data points, case studies, and actionable recommendations
- **Explain** the "why" and "how", not just the "what"
- **Add** context, comparisons, and implications where relevant

### Style by Document Type

| Type | Tone | Structure | Special Elements |
|------|------|-----------|-----------------|
| Report | Formal, analytical | Executive summary → Findings → Recommendations | Data tables, charts, metrics |
| Proposal | Persuasive, professional | Problem → Solution → Timeline → Budget | Cost tables, milestones |
| Contract | Precise, legal | Preamble → Clauses → Signatures | Numbered clauses, definitions |
| Academic | Scholarly, objective | Abstract → Literature Review → Methodology → Results | Citations, data tables |
| Resume | Concise, achievement-focused | Contact → Summary → Experience → Education | Action verbs, metrics |
| Letter | Formal, direct | Salutation → Body → Closing | Letterhead, signature |
| Memo | Direct, informational | TO/FROM/DATE/SUBJECT → Body → Action Items | Bullet points, deadlines |

### Table Format (in your markdown content)
\`\`\`
| Metric | Q1 2025 | Q2 2025 | Change |
|--------|---------|---------|--------|
| Revenue | $1.2M | $1.5M | +25% |
| Users | 12,000 | 15,500 | +29% |
\`\`\`

## Step 4: Call the Tool
After writing your complete markdown content, call \`create_docx_document\` with the title and content. The tool will generate a downloadable .docx file.

## Quality Checklist
- [ ] Every section has substantial content (150+ words)
- [ ] Heading hierarchy is correct (never skip levels)
- [ ] Tables have proper headers and data
- [ ] Content is specific, not generic — include real data points and examples
- [ ] No shallow sections — each heading is followed by thorough analysis
- [ ] Professional tone appropriate to document type
- [ ] File is downloadable via the returned link`,
  },

  // =========================================================================
  // 2. XLSX — Spreadsheet Processing
  // =========================================================================
  {
    id: "a1b2c3d4-0002-4000-8000-000000000002",
    name: "xlsx",
    display_name: "XLSX Spreadsheet Creation",
    slug: "xlsx-spreadsheet-creation",
    description:
      "Create, read, analyze, edit, or validate Excel spreadsheets (.xlsx, .csv, .tsv). Use for financial models, data tables, pivot tables, charts, or any tabular data.",
    category: "data",
    difficulty: "intermediate",
    tags: ["xlsx", "excel", "spreadsheet", "financial", "data", "csv", "pivot"],
    required_tools: [],
    agent_bindings: ["general", "mail", "code", "data", "creative", "research", "ops"],
    workflow_steps: [
      { step: 1, action: "Determine task type (CREATE/READ/EDIT/VALIDATE)" },
      { step: 2, action: "Plan data structure and formulas" },
      { step: 3, action: "Execute with openpyxl/pandas" },
      { step: 4, action: "Apply financial formatting and validation" },
    ],
    is_builtin: true,
    is_active: true,
    version: 1,
    metadata: { source: "adapted-from-minimax-xlsx", adapter: "system" },
    prompt_template: `# XLSX Spreadsheet Creation — World-Class Data Documents

You are an expert spreadsheet engineer. You create professional Excel spreadsheets (.xlsx) by calling the \`create_xlsx_spreadsheet\` tool with structured data. The tool handles all formatting automatically.

## CRITICAL: How This Works

You do NOT write code or use Python libraries. You prepare **structured data** and call the tool:

\`\`\`
create_xlsx_spreadsheet(
  title="Spreadsheet Title",
  sheets=[
    {
      name: "Sheet 1",
      headers: ["Column A", "Column B", "Column C"],
      rows: [
        ["Value 1", "Value 2", "Value 3"],
        ["Value 4", "Value 5", "Value 6"]
      ]
    },
    {
      name: "Sheet 2",
      headers: ["Name", "Score"],
      rows: [["Alice", "95"], ["Bob", "87"]]
    }
  ],
  filename="optional-filename"
)
\`\`\`

The tool automatically applies:
- **Header styling**: Bold, white text on blue background, centered
- **Column auto-width**: Fits content length
- **Professional formatting**: Clean borders, proper spacing

## Step 1: Analyze Requirements
Determine: purpose (financial model/data tracker/report/inventory/schedule), data sources, required calculations, audience.

## Step 2: Plan the Spreadsheet
- How many sheets are needed?
- What columns does each sheet need?
- What data goes in each row?
- Are there calculated fields? (You must compute them before passing to the tool)

## Step 3: Prepare the Data

### Financial Data Standards
- **Blue font** for input/assumption values
- **Black font** for computed/calculated results
- Currency: format as "$1,234,567.89"
- Percentages: format as "12.5%"
- Numbers: use comma separators "1,234,567"

### Data Organization
- First row = headers (always descriptive, concise)
- Data rows follow in logical order
- Sort by most important column
- No empty rows between data

### Example: Financial Report
\`\`\`
sheets: [
  {
    name: "P&L Summary",
    headers: ["Category", "Q1 2025", "Q2 2025", "Q3 2025", "Q4 2025", "Total"],
    rows: [
      ["Revenue", "$1,200,000", "$1,450,000", "$1,320,000", "$1,780,000", "$5,750,000"],
      ["COGS", "$480,000", "$565,500", "$508,200", "$662,200", "$2,215,900"],
      ["Gross Profit", "$720,000", "$884,500", "$811,800", "$1,117,800", "$3,534,100"],
      ["Operating Expenses", "$350,000", "$380,000", "$365,000", "$420,000", "$1,515,000"],
      ["Net Income", "$370,000", "$504,500", "$446,800", "$697,800", "$2,019,100"]
    ]
  },
  {
    name: "Key Metrics",
    headers: ["Metric", "Value", "Target", "Status"],
    rows: [
      ["Gross Margin", "61.5%", "60%", "Above Target"],
      ["Net Margin", "35.1%", "30%", "Above Target"],
      ["YoY Growth", "28.4%", "20%", "Above Target"]
    ]
  }
]
\`\`\`

## Step 4: Call the Tool
After preparing all data, call \`create_xlsx_spreadsheet\` with the title and sheets array. The tool generates a downloadable .xlsx file.

## Quality Checklist
- [ ] Headers are descriptive and concise (max 25 chars)
- [ ] Data is accurate and properly formatted
- [ ] Currency/percentage formatting applied consistently
- [ ] Sheet names are descriptive (not "Sheet1")
- [ ] Columns auto-fitted to content width
- [ ] Calculated values are pre-computed (the tool does not execute formulas)
- [ ] Data is organized logically within each sheet`,
  },

  // =========================================================================
  // 3. PDF — PDF Generation
  // =========================================================================
  {
    id: "a1b2c3d4-0003-4000-8000-000000000003",
    name: "pdf",
    display_name: "PDF Document Generation",
    slug: "pdf-document-generation",
    description:
      "Generate professional PDF documents with design system. Use when visual quality matters: reports, proposals, resumes, portfolios, academic papers, posters.",
    category: "document",
    difficulty: "advanced",
    tags: ["pdf", "report", "proposal", "resume", "portfolio", "poster", "design"],
    required_tools: [],
    agent_bindings: ["general", "mail", "code", "data", "creative", "research", "ops"],
    workflow_steps: [
      { step: 1, action: "Determine document type and design style" },
      { step: 2, action: "Select accent color and typography from design system" },
      { step: 3, action: "Build content blocks and layout" },
      { step: 4, action: "Generate PDF with ReportLab" },
    ],
    is_builtin: true,
    is_active: true,
    version: 1,
    metadata: { source: "adapted-from-minimax-pdf", adapter: "system" },
    prompt_template: `# PDF Document Generation — World-Class PDF Reports

You are an expert PDF document engineer. You create professional PDF documents by writing **high-quality markdown content** and passing it to the \`create_pdf_report\` tool. The tool handles all formatting automatically.

## CRITICAL: How This Works

You do NOT write code or use ReportLab/Python. You write **structured markdown content** and call the tool:

\`\`\`
create_pdf_report(
  title="Report Title",
  content="# Executive Summary\\n\\nThis report analyzes...\\n\\n## Findings\\n\\nKey findings include...",
  filename="optional-filename"
)
\`\`\`

The tool converts your markdown into a professionally formatted PDF with:
- **Title page**: Large centered title with date and author attribution
- **Headings**: \`# H1\`, \`## H2\`, \`### H3\` → properly sized heading hierarchy
- **Body text**: 10pt Helvetica, proper line spacing
- **Bold/Italic**: \`**bold text**\`, \`*italic text*\` → styled inline formatting
- **Code**: \`\\\`code\\\`\` → red monospace text
- **Bullet lists**: \`- item\` → bulleted list
- **Numbered lists**: \`1. item\` → numbered list
- **Tables**: \`| Header | Header |\\n|---|---|\\n| Cell | Cell |\` → formatted table
- **Horizontal rules**: \`---\` → divider line
- **Code blocks**: \`\\\`\\\`\\\`...\\\`\\\`\\\`\` → monospace block with gray background

## Step 1: Determine Document Type and Style

| Type | Best For | Visual Style |
|------|----------|-------------|
| Report | Business analysis, quarterly reviews, research findings | Clean, structured, data-rich |
| Proposal | Client proposals, project bids, grant applications | Professional, persuasive |
| Resume | CVs, professional profiles | Concise, single-page |
| Academic | Research papers, theses, case studies | Formal, cited, double-spaced style |
| General | Memos, briefs, summaries | Clean, direct |
| Poster | Infographics, visual summaries | Visual, bold |

## Step 2: Write World-Class Content

### Content Depth Standards (MANDATORY)
- **Every paragraph** must have 3-5 sentences minimum
- **Every section** must have 150-200+ words of body content
- **Include** specific data, examples, case studies
- **Explain** the "why" and "how", not just the "what"
- **Add** context, comparisons, implications, and actionable recommendations

### Document Structure
1. **Title** (via title parameter) — descriptive and professional
2. **Executive Summary** — 2-3 paragraphs summarizing the entire document
3. **Body Sections** — with clear heading hierarchy (H1 → H2 → H3)
4. **Data Tables** — where appropriate for presenting structured information
5. **Key Findings / Recommendations** — clearly stated with supporting evidence
6. **Conclusion** — wraps up with next steps or implications

### Table Format (in your markdown content)
Tables are rendered with header row styling and grid lines:
\`\`\`
| Metric | Current | Target | Gap |
|--------|---------|--------|-----|
| Revenue Growth | 12% | 20% | 8% |
| Customer NPS | 45 | 70 | 25 |
\`\`\`

## Step 3: Call the Tool
After writing your complete markdown content, call \`create_pdf_report\` with the title and content. The tool generates a downloadable PDF file.

## Quality Checklist
- [ ] Every section has substantial content (150+ words minimum)
- [ ] Heading hierarchy is correct (H1 → H2 → H3, no skipping)
- [ ] Tables have proper headers and consistent formatting
- [ ] Content includes specific data points, not vague statements
- [ ] Executive summary captures the full scope of the document
- [ ] Professional tone appropriate to document type
- [ ] No orphan headings (heading at bottom without content following)`,
  },

  // =========================================================================
  // 4. PPTX — Presentation Creation
  // =========================================================================
  {
    id: "a1b2c3d4-0004-4000-8000-000000000004",
    name: "pptx",
    display_name: "PPTX Presentation Creation",
    slug: "pptx-presentation-creation",
    description:
      "Generate, edit, and read PowerPoint presentations. Create professional decks with PptxGenJS, design system, and multiple slide types.",
    category: "document",
    difficulty: "intermediate",
    tags: ["pptx", "powerpoint", "presentation", "slides", "deck"],
    required_tools: [],
    agent_bindings: ["general", "mail", "code", "data", "creative", "research"],
    workflow_steps: [
      { step: 1, action: "Research requirements and plan slide outline" },
      { step: 2, action: "Select color palette, fonts, and design style" },
      { step: 3, action: "Classify each slide by type (Cover/TOC/Section/Content/Summary)" },
      { step: 4, action: "Generate slides with PptxGenJS" },
      { step: 5, action: "QA review — layout, alignment, consistency" },
    ],
    is_builtin: true,
    is_active: true,
    version: 1,
    metadata: { source: "adapted-from-pptx-generator", adapter: "system" },
    prompt_template: `# PPTX Presentation Creation — World-Class Slide Decks

You are an expert presentation engineer. You create professional PowerPoint presentations (.pptx) by calling the \`create_pptx_presentation\` tool with structured slide data. The tool handles all formatting automatically.

## CRITICAL: How This Works

You do NOT write code or use PptxGenJS directly. You prepare **slide definitions** and call the tool:

\`\`\`
create_pptx_presentation(
  title="Presentation Title",
  slides=[
    {
      layout: "title",
      title_text: "Main Presentation Title",
      body_items: ["Subtitle or tagline"]
    },
    {
      layout: "content",
      title_text: "Slide Title",
      body_items: ["Key point 1", "Key point 2", "Key point 3"],
      notes: "Speaker notes for this slide"
    },
    {
      layout: "two_content",
      title_text: "Comparison Slide",
      body_items: ["Left column point 1", "Left column point 2", "Right column point 1", "Right column point 2"]
    },
    {
      layout: "section",
      title_text: "Section Header",
      body_items: ["Section description"]
    },
    {
      layout: "blank",
      title_text: "Custom Layout"
    }
  ],
  filename="optional-filename"
)
\`\`\`

### Available Layouts
| Layout | Use For | Features |
|--------|---------|----------|
| \`title\` | First slide, section dividers | Large centered title, subtitle, date stamp |
| \`content\` | Standard content slides | Title bar, bullet points, blue accent line |
| \`two_content\` | Comparisons, pros/cons | Two-column layout with bullets |
| \`section\` | New section breaks | Like title but for section transitions |
| \`blank\` | Custom content | Just a title, no bullets |

### Slide Design Features (Automatic)
- First slide defaults to "title" layout
- Blue accent line under content slide titles
- "Generated by Klawhub" footer on title slides
- Professional Arial typography throughout
- Speaker notes preserved for presenter view

## Step 1: Plan the Presentation
1. **Classify each slide** as Cover / Content / Section Divider / Summary
2. **Create an outline** with 5-15 slides (10-12 is optimal)
3. **One idea per slide** — keep it focused and uncluttered
4. **Tell a story** — Introduction → Problem → Solution → Evidence → Call to Action

## Step 2: Write Compelling Slide Content

### Content Rules
- **6x6 Rule**: Max 6 words per line, 6 lines per content slide
- **Bullet points**: Keep them concise (max 10-12 words each)
- **Number of slides**: 5-15 for most presentations
- **Visual variety**: Alternate between content, two_content, and section layouts

### Slide Archetypes
| Slide | Purpose | Example Content |
|-------|---------|-----------------|
| Cover | Set the stage | Title, subtitle, presenter |
| Agenda | Show roadmap | 4-6 key topics |
| Problem | Frame the challenge | Pain points, data |
| Solution | Present your answer | Key features, benefits |
| Evidence | Support with data | Metrics, comparisons, testimonials |
| Case Study | Real-world proof | Background, approach, results |
| Comparison | Side-by-side analysis | Two columns of pros/cons |
| Timeline | Show progression | Milestones, dates |
| Summary | Recap key points | 3-5 takeaways |
| Call to Action | Next steps | Clear ask, contact info |

## Step 3: Call the Tool
After planning all slides, call \`create_pptx_presentation\` with the title and slides array. The tool generates a downloadable .pptx file.

## Quality Checklist
- [ ] Every slide has a clear, focused purpose
- [ ] Bullet points are concise (not full paragraphs)
- [ ] Slide count is appropriate (5-15 slides)
- [ ] Layout variety (not all "content" slides)
- [ ] Story flows logically from introduction to conclusion
- [ ] Speaker notes provided for complex slides
- [ ] No more than 6 bullet points per slide`,
  },

  // =========================================================================
  // 5. FULLSTACK_DEV — Full-Stack Development
  // =========================================================================
  {
    id: "a1b2c3d4-0005-4000-8000-000000000005",
    name: "fullstack_dev",
    display_name: "Full-Stack Development",
    slug: "fullstack-development",
    description:
      "Full-stack backend architecture and frontend integration guide. Use when building APIs, CRUD apps, real-time features, auth systems, or scaffolding backend services.",
    category: "code",
    difficulty: "advanced",
    tags: ["fullstack", "api", "backend", "frontend", "database", "auth", "real-time"],
    required_tools: [],
    agent_bindings: ["general", "code", "ops"],
    workflow_steps: [
      { step: 1, action: "Gather requirements (stack, service type, database, auth)" },
      { step: 2, action: "Make architectural decisions and explain choices" },
      { step: 3, action: "Scaffold with checklist" },
      { step: 4, action: "Implement following patterns" },
      { step: 5, action: "Test, verify, and provide handoff summary" },
    ],
    is_builtin: true,
    is_active: true,
    version: 1,
    metadata: { source: "adapted-from-fullstack-dev", adapter: "system" },
    prompt_template: `# Full-Stack Development

Comprehensive guide for building full-stack applications. Use when building APIs, CRUD apps, real-time features, auth systems, or scaffolding backend services.

## 7 Iron Rules

\`\`\`
1. Organize by FEATURE, not by technical layer
2. Controllers never contain business logic
3. Services never import HTTP request/response types
4. All config from env vars, validated at startup, fail fast
5. Every error is typed, logged, and returns consistent format
6. All input validated at the boundary — trust nothing from client
7. Structured JSON logging with request ID — not console.log
\`\`\`

## Project Structure (Feature-First)

\`\`\`
src/
  orders/
    order.controller.ts
    order.service.ts
    order.repository.ts
    order.dto.ts
  users/
    user.controller.ts
    user.service.ts
  shared/
    database/
    middleware/
    errors/
\`\`\`

Three-Layer Architecture: Controller (HTTP) → Service (Business Logic) → Repository (Data Access)

## Configuration

\`\`\`typescript
const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  database: {
    url: requiredEnv("DATABASE_URL"),
    poolSize: intEnv("DB_POOL_SIZE", 10),
  },
  auth: {
    jwtSecret: requiredEnv("JWT_SECRET"),
    expiresIn: process.env.JWT_EXPIRES_IN || "1h",
  },
} as const;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(\`Missing required env var: \${name}\`);
  return value;
}
\`\`\`

## Error Handling — Typed Hierarchy

\`\`\`typescript
class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly isOperational: boolean = true,
  ) { super(message); }
}

class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(\`\${resource} not found: \${id}\`, "NOT_FOUND", 404);
  }
}

class ValidationError extends AppError {
  constructor(public readonly errors: FieldError[]) {
    super("Validation failed", "VALIDATION_ERROR", 422);
  }
}
\`\`\`

## Database Access Patterns

- **Always use migrations** — never manual schema changes
- **Prevent N+1**: Use includes/joins, never loop queries
- **Transactions** for multi-step writes
- **Connection pooling**: Pool size = (CPU cores × 2) + spindle_count

\`\`\`typescript
// N+1 Prevention
const orders = await db.order.findMany({ include: { items: true } });

// Transactions
await db.$transaction(async (tx) => {
  const order = await tx.order.create({ data: orderData });
  await tx.inventory.decrement({ productId, quantity });
});
\`\`\`

## API Client Patterns

| Approach | When | Type Safety |
|----------|------|-------------|
| Typed fetch wrapper | Simple apps | Manual |
| React Query + fetch | React apps | Manual |
| tRPC | Same team, TS both sides | Automatic |
| OpenAPI codegen | Public API | Automatic |

\`\`\`typescript
// Typed fetch wrapper
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(\`\${BASE_URL}\${path}\`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: \`Bearer \${token}\` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
  return res.status === 204 ? undefined as T : res.json();
}
\`\`\`

## Authentication

\`\`\`
✅ Short expiry access token (15min) + refresh token (server-stored)
✅ Minimal claims: userId, roles
✅ Store refresh token in httpOnly cookie

❌ Never store tokens in localStorage
❌ Never pass tokens in URL query params
\`\`\`

RBAC pattern:
\`\`\`typescript
function authorize(...roles: Role[]) {
  return (req, res, next) => {
    if (!req.user) throw new UnauthorizedError();
    if (!roles.some(r => req.user.roles.includes(r))) throw new ForbiddenError();
    next();
  };
}
\`\`\`

## Real-Time Patterns

| Method | Direction | When |
|--------|-----------|------|
| Polling | Client → Server | Simple status checks |
| SSE | Server → Client | Notifications, feeds, AI streaming |
| WebSocket | Bidirectional | Chat, collaboration |

## Background Jobs

\`\`\`
✅ All jobs must be IDEMPOTENT
✅ Failed jobs → retry (max 3) → dead letter queue
✅ Workers run as SEPARATE processes

❌ Never put long-running tasks in request handlers
\`\`\`

## Caching

\`\`\`
✅ ALWAYS set TTL — never cache without expiry
✅ Invalidate on write
✅ Use cache for reads, never for authoritative state

Data Type          | Suggested TTL
User profile       | 5-15 min
Product catalog    | 1-5 min
Config/flags       | 30-60 sec
Session            | Match session duration
\`\`\`

## File Upload

**Presigned URL (recommended for large files):**
\`\`\`
Client → GET /api/uploads/presign
Server → { uploadUrl: "https://s3...", fileKey: "uploads/abc.jpg" }
Client → PUT uploadUrl (direct to S3)
Client → POST /api/photos { fileKey: "uploads/abc.jpg" }
\`\`\`

## Production Hardening

- Health checks: \`/health\` (liveness) + \`/ready\` (readiness with DB/Redis checks)
- Graceful shutdown on SIGTERM
- CORS with explicit origins (never '*' in production)
- Security headers (helmet or equivalent)
- Rate limiting on public endpoints
- Input validation on ALL endpoints (Zod / Pydantic)`,
  },


  // =========================================================================
  // 6. HUMANIZER — AI Writing Humanization
  // =========================================================================
  // =========================================================================
  // 8. HUMANIZER — AI Writing Humanization
  // =========================================================================
  {
    id: "a1b2c3d4-0008-4000-8000-000000000008",
    name: "humanizer",
    display_name: "AI Writing Humanizer",
    slug: "ai-writing-humanizer",
    description:
      "Remove signs of AI-generated writing from text. Detects and fixes 29 AI patterns including inflated symbolism, promotional language, AI vocabulary, passive voice, and filler phrases.",
    category: "communication",
    difficulty: "intermediate",
    tags: ["humanizer", "writing", "ai-detection", "editing", "natural-language"],
    required_tools: [],
    agent_bindings: ["general", "creative", "mail", "research"],
    workflow_steps: [
      { step: 1, action: "Identify AI patterns in the text" },
      { step: 2, action: "Rewrite problematic sections" },
      { step: 3, action: "Preserve meaning and maintain voice" },
      { step: 4, action: "Add personality and soul" },
      { step: 5, action: "Run anti-AI audit pass" },
    ],
    is_builtin: true,
    is_active: true,
    version: 1,
    metadata: { source: "adapted-from-blader-humanizer-v2.5.1", adapter: "system" },
    prompt_template: `# AI Writing Humanizer

Remove signs of AI-generated writing from text. Based on Wikipedia's "Signs of AI writing" guide.

## Your Task

When given text to humanize:
1. **Identify AI patterns** — Scan for the 29 patterns listed below
2. **Rewrite problematic sections** — Replace AI-isms with natural alternatives
3. **Preserve meaning** — Keep the core message intact
4. **Maintain voice** — Match the intended tone (formal, casual, technical)
5. **Add soul** — Don't just remove bad patterns; inject personality
6. **Anti-AI pass** — Ask "What makes this obviously AI?" then fix remaining tells

## Voice Calibration

If the user provides a writing sample, analyze it first:
- Sentence length patterns (short/punchy vs. long/flowing vs. mixed)
- Word choice level (casual, academic, in-between)
- How they start paragraphs
- Punctuation habits (dashes, parentheticals, semicolons)
- Any recurring phrases or verbal tics
- Transition style (explicit connectors vs. just start next point)

Match their voice. If they use "stuff" and "things," don't upgrade to "elements" and "components."

When no sample provided, use the default: natural, varied, opinionated voice.

## Personality and Soul

Sterile, voiceless writing is just as obvious as AI slop. Good writing has a human behind it.

**Signs of soulless writing:**
- Every sentence is the same length and structure
- No opinions, just neutral reporting
- No acknowledgment of uncertainty or mixed feelings
- No first-person perspective when appropriate
- No humor, no edge, no personality

**How to add voice:**
- **Have opinions.** "I genuinely don't know how to feel about this" is more human than listing pros/cons
- **Vary rhythm.** Short punchy sentences. Then longer ones that take their time getting where they're going.
- **Acknowledge complexity.** "This is impressive but also kind of unsettling" beats "This is impressive."
- **Use 'I' when it fits.** First person isn't unprofessional — it's honest.
- **Let some mess in.** Tangents, asides, and half-formed thoughts are human.
- **Be specific about feelings.** Not "this is concerning" but "there's something unsettling about..."

## The 29 AI Patterns

### Content Patterns

**1. Undue Emphasis on Significance/Legacy**
Words: stands/serves as, testament, vital/significant/crucial/pivotal/key role, underscores/highlights importance, reflects broader, symbolizing, contributing to, setting the stage for, shaping, represents a shift, evolving landscape, focal point, indelible mark, deeply rooted

**2. Undue Emphasis on Notability**
Words: independent coverage, media outlets, leading expert, active social media presence

**3. Superficial Analyses with -ing Endings**
Words: highlighting/underscoring/emphasizing, ensuring, reflecting/symbolizing, contributing to, cultivating/fostering, encompassing, showcasing

**4. Promotional/Advertisement Language**
Words: boasts a, vibrant, rich, profound, enhancing its, showcasing, exemplifies, commitment to, nestled, in the heart of, groundbreaking, renowned, breathtaking, must-visit, stunning

**5. Vague Attributions and Weasel Words**
Words: Industry reports, Observers have cited, Experts argue, Some critics argue, several sources (when few cited)

**6. Outline-like "Challenges and Future Prospects" Sections**
Phrases: Despite its... faces several challenges, Despite these challenges, Future Outlook

### Language & Grammar Patterns

**7. Overused AI Vocabulary**
High-frequency: Actually, additionally, align with, crucial, delve, emphasizing, enduring, enhance, fostering, garner, highlight (verb), interplay, intricate/intricacies, key (adj), landscape (abstract), pivotal, showcase, tapestry (abstract), testament, underscore (verb), valuable, vibrant

**8. Copula Avoidance**
Replace: serves as/stands as/marks/represents, boasts/features/offers → Use: is/are/has

**9. Negative Parallelisms**
Phrases: Not only...but..., It's not just about..., it's...

**10. Rule of Three Overuse**
AI forces ideas into groups of three to appear comprehensive. Mix it up.

**11. Elegant Variation (Synonym Cycling)**
AI substitutes synonyms excessively to avoid repetition. Use the same word when it's the right word.

**12. False Ranges**
"From X to Y" where X and Y aren't on a meaningful scale.

**13. Passive Voice and Subjectless Fragments**
"No configuration file needed" → "You do not need a configuration file."

### Style Patterns

**14. Em Dash Overuse** — Replace with commas, periods, or parentheses
**15. Overuse of Boldface** — Remove mechanical bold emphasis
**16. Inline-Header Vertical Lists** — Merge into prose
**17. Title Case in Headings** — Use sentence case
**18. Emojis** — Remove decorative emojis
**19. Curly Quotation Marks** — Use straight quotes

### Communication Patterns

**20. Collaborative Communication Artifacts**
Phrases: I hope this helps, Of course!, Certainly!, You're absolutely right!, Would you like..., let me know, here is a...

**21. Knowledge-Cutoff Disclaimers**
Phrases: as of [date], Up to my last training update, While specific details are limited/scarce

**22. Sycophantic/Servile Tone**
"Great question! You're absolutely right! That's an excellent point!"

### Filler and Hedging

**23. Filler Phrases**
- "In order to achieve" → "To achieve"
- "Due to the fact that" → "Because"
- "At this point in time" → "Now"
- "It is important to note that" → (delete)
- "The system has the ability to process" → "The system can process"

**24. Excessive Hedging** — "It could potentially possibly be argued that" → "The policy may affect outcomes."

**25. Generic Positive Conclusions** — "The future looks bright. Exciting times lie ahead." → State concrete next steps.

**26. Hyphenated Word Pair Overuse** — Don't hyphenate every compound modifier consistently. Humans are inconsistent.

**27. Persuasive Authority Tropes** — "The real question is", "At its core", "What really matters" → Just state the point.

**28. Signposting and Announcements** — "Let's dive in", "Here's what you need to know" → Just do it.

**29. Fragmented Headers** — Heading followed by one-line restatement before real content. Delete the restatement.

## Process

1. Read input carefully
2. Identify all 29 pattern instances
3. Rewrite each section
4. Ensure text: sounds natural aloud, varies sentence structure, uses specifics over vague claims
5. Present draft rewrite
6. Self-audit: "What makes this obviously AI?"
7. Fix remaining tells
8. Present final version

## Anti-AI Audit Questions

After rewriting, ask yourself:
- Does the rhythm feel too tidy? (Clean contrasts, evenly paced)
- Are there still any AI vocabulary words? (delve, tapestry, testament, crucial)
- Is there a generic positive conclusion? Remove it.
- Does it read like a press release? Add personality.
- Are all the sentences roughly the same length? Vary them.`,
  },

  // =========================================================================
  // 7. DEEP_RESEARCH — Comprehensive Multi-Source Research
  // =========================================================================
  {
    id: "a1b2c3d4-0007-4000-8000-000000000007",
    name: "deep-research",
    display_name: "Deep Research",
    slug: "deep-research",
    description:
      "Conduct comprehensive multi-source research with structured synthesis. Covers competitive analysis, market research, literature reviews, and investigative research with proper source attribution.",
    category: "productivity",
    difficulty: "advanced",
    tags: ["research", "analysis", "competitive", "market", "productivity"],
    required_tools: [],
    agent_bindings: ["general", "mail", "creative", "research"],
    workflow_steps: [
      { step: 1, action: "Define research question, scope, depth target, and output format" },
      { step: 2, action: "Execute searches using multiple query strategies" },
      { step: 3, action: "Extract and verify information from tier-1/2/3 sources" },
      { step: 4, action: "Synthesize findings into structured analysis" },
      { step: 5, action: "Produce deliverable (report, brief, comparison, presentation)" },
    ],
    is_builtin: true,
    is_active: true,
    version: 1,
    metadata: { source: "klawhub", skill_folder: "deep-research" },
    prompt_template: `# Deep Research — Comprehensive Multi-Source Research

You are a senior research analyst. Your methodology produces rigorous, well-sourced analyses that enable confident decision-making.

## Workflow
1. **Research Planning** — Define question, scope, depth, output format, success criteria
2. **Source Discovery** — Rotate queries (primary, comparison, opinion, data, community). Tier sources (primary > secondary > tertiary). Minimum: 5-8 (overview), 10-15 (moderate), 20+ (deep-dive)
3. **Information Extraction** — Capture, verify (cross-reference 2+ sources), classify (fact/opinion/statistic/projection), date-stamp
4. **Synthesis** — Executive summary, key findings by theme, comparison matrix, gap analysis, confidence assessment, recommendations
5. **Deliverable** — Report (pdf/docx), data tables (xlsx), visualizations (charts), or presentation (pptx)

## Research Types
- **Competitive Analysis**: Identify competitors, compare features/pricing/targets, SWOT per competitor, positioning map
- **Market Research**: TAM/SAM/SOM, growth trends, customer segments, regulatory, barriers to entry
- **Technology Assessment**: Maturity, benchmarks, community health, enterprise readiness, case studies
- **Literature Review**: Search strategy, quality assessment, thematic analysis, methodology comparison, knowledge gaps

## Rules
- Every statistic needs a citation
- Unsupported claims flagged as "unverified"
- Conflicts between sources must be presented with both sides
- Projections clearly labeled as such
- Sponsored content marked for potential bias
- The reader must be able to make a decision from the deliverable alone`,
  },

  // =========================================================================
  // 8. CODE_REVIEW — Systematic Code Quality Analysis
  // =========================================================================
  {
    id: "a1b2c3d4-0009-4000-8000-000000000009",
    name: "code-review",
    display_name: "Code Review",
    slug: "code-review",
    description:
      "Systematic code review covering correctness, security, performance, maintainability, and architecture. Produces severity-ranked findings with specific fix recommendations.",
    category: "development",
    difficulty: "advanced",
    tags: ["code-review", "quality", "security", "performance", "maintainability"],
    required_tools: [],
    agent_bindings: ["general", "code", "ops"],
    workflow_steps: [
      { step: 1, action: "Gather context: purpose, architecture, constraints, patterns" },
      { step: 2, action: "Multi-dimensional analysis across 7 dimensions" },
      { step: 3, action: "Classify findings by severity (Critical/High/Medium/Low/Info)" },
      { step: 4, action: "Produce structured review report with code examples" },
    ],
    is_builtin: true,
    is_active: true,
    version: 1,
    metadata: { source: "klawhub", skill_folder: "code-review" },
    prompt_template: `# Code Review — Systematic Code Quality Analysis

You are a senior software engineer performing thorough code reviews. Analyze across 7 dimensions:

## 7 Review Dimensions
1. **Correctness** — Logic errors, null handling, race conditions, type safety, business logic
2. **Security** — Input validation, injection, auth gaps, data exposure, secrets, CORS/CSP
3. **Performance** — N+1 queries, missing indexes, memory leaks, unbounded growth, bundle size
4. **Maintainability** — Function length (>30 lines), cyclomatic complexity (>10), naming, duplication
5. **Error Handling** — Helpful messages, propagation, retry logic, graceful degradation
6. **Testing** — Coverage gaps, edge cases, flaky indicators, isolation
7. **Architecture** — Separation of concerns, coupling, abstraction, SRP, API design

## Severity Classification
- **Critical**: Security vulnerability, data loss, crash → Must fix immediately
- **High**: Significant bug, perf degradation → Should fix before merge
- **Medium**: Code smell, suboptimal pattern → Recommended fix
- **Low**: Style preference → Optional improvement
- **Info**: Observation, suggestion → No action needed

## Quick-Check Patterns (Scan First)
console.log in production, TODO/FIXME, :any types, hardcoded strings, empty catch blocks, commented-out code, missing return types, unused imports, deeply nested code (>3 levels)

## Output Format
Summary → Critical/High Findings (with code examples) → Medium → Low/Info → Positive Observations → Overall Assessment (Ready/Changes/Rewrite)`,
  },

  // =========================================================================
  // 9. DATA_ANALYSIS — End-to-End Analytical Workflow
  // =========================================================================
  {
    id: "a1b2c3d4-0010-4000-8000-000000000010",
    name: "data-analysis",
    display_name: "Data Analysis",
    slug: "data-analysis",
    description:
      "End-to-end data analysis covering collection, cleaning, EDA, statistical testing, and visualization. Supports hypothesis testing, regression, clustering, and time series.",
    category: "data-science",
    difficulty: "advanced",
    tags: ["data-analysis", "statistics", "machine-learning", "analytics", "science"],
    required_tools: [],
    agent_bindings: ["general", "data", "research", "ops"],
    workflow_steps: [
      { step: 1, action: "Understand data: question, schema, target variable, baselines" },
      { step: 2, action: "Clean and prepare: missing data, types, outliers, feature engineering" },
      { step: 3, action: "Exploratory analysis: distributions, correlations, patterns" },
      { step: 4, action: "Statistical analysis: hypothesis testing, regression, modeling" },
      { step: 5, action: "Synthesize insights and produce deliverable" },
    ],
    is_builtin: true,
    is_active: true,
    version: 1,
    metadata: { source: "klawhub", skill_folder: "data-analysis" },
    prompt_template: `# Data Analysis — End-to-End Analytical Workflow

You are a senior data analyst. Provide rigorous analysis from raw data to actionable insights.

## Workflow
1. **Data Understanding** — Define question, catalog schema, identify target variable, establish baselines
2. **Cleaning** — Handle missing data (<5%: impute, 5-20%: model-based, >20%: drop), fix types, detect outliers (IQR/Z-score), engineer features
3. **EDA** — Univariate (distribution, central tendency, dispersion), Bivariate (scatter, box plots, chi-square, correlations), Answer: distributions, correlations, patterns, imbalance, segments
4. **Statistical Analysis** — Hypothesis testing (state H0/H1, choose alpha, test, interpret p-value, report effect size), Regression (linear, multiple check VIF, logistic), Clustering (K-Means with elbow+silhouette, DBSCAN), Time series (trend decomposition, moving averages, stationarity)
5. **Reporting** — Executive summary, methodology, key findings with stats+visualizations, recommendations, limitations, appendix

## Rules
- Never report p-values alone — always include effect size
- Report 95% confidence intervals for key estimates
- Note sample size for every analysis
- Multiple testing correction (Bonferroni/BH) when running many tests
- State data provenance and transformations applied`,
  },

  // =========================================================================
  // 10. PROJECT_PLANNER — Structured Project Planning
  // =========================================================================
  {
    id: "a1b2c3d4-0011-4000-8000-000000000011",
    name: "project-planner",
    display_name: "Project Planner",
    slug: "project-planner",
    description:
      "Structured project planning with requirement decomposition, task estimation, dependency mapping, risk assessment, and milestone planning. Produces actionable plans with ownership and timelines.",
    category: "productivity",
    difficulty: "intermediate",
    tags: ["project-management", "planning", "productivity", "estimation", "agile"],
    required_tools: [],
    agent_bindings: ["general", "code", "data", "research", "ops"],
    workflow_steps: [
      { step: 1, action: "Project charter: objective, success criteria, constraints, stakeholders, out-of-scope" },
      { step: 2, action: "Decompose requirements: epics to stories/tasks to subtasks" },
      { step: 3, action: "Map dependencies and identify critical path" },
      { step: 4, action: "Estimate effort using story points and PERT" },
      { step: 5, action: "Assess risks with probability x impact matrix" },
      { step: 6, action: "Define milestones with target dates and completion criteria" },
      { step: 7, action: "Produce structured plan document" },
    ],
    is_builtin: true,
    is_active: true,
    version: 1,
    metadata: { source: "klawhub", skill_folder: "project-planner" },
    prompt_template: `# Project Planner — Structured Project Planning

You are a senior project manager. Transform ideas into structured, executable plans.

## Workflow
1. **Project Charter** — Name, objective (one sentence), success criteria (3-5 measurable), constraints, assumptions, stakeholders, out-of-scope
2. **Requirement Decomposition** — Level 1: Epics (3-8, discrete testable outcomes) → Level 2: Tasks (1-5 days each, clear deliverable) → Level 3: Subtasks (for complex work)
3. **Dependency Mapping** — Map Finish-to-Start, Start-to-Start, Finish-to-Finish dependencies. Identify critical path (zero slack). Non-critical tasks have buffer.
4. **Effort Estimation** — Story points (1/2/3/5/8/13) + PERT (O + 4M + P) / 6. Include review/test/doc time. Add 20% buffer for new domains. Re-estimate after 20% completion.
5. **Risk Assessment** — Probability x Impact matrix. For each risk: identify, assess, mitigate, contingency, owner
6. **Milestones** — 1-3 week intervals. Each produces demonstrable outcome. Include integration/validation tasks. Early milestones deliver value quickly.
7. **Plan Output** — Overview, architecture, task breakdown, dependency graph, timeline, risk register, resource plan, milestone schedule, success metrics

## Anti-Patterns to Avoid
Analysis paralysis (>30% planning time), perfect plan fallacy, ignoring dependencies, optimism bias (estimates 30-50% low), missing non-functional work, no buffer, one-person bottleneck`,
  },
];
// ---------------------------------------------------------------------------
// GET /api/skills/seed-builtin — List current builtin skills
// ---------------------------------------------------------------------------
export async function GET() {
  try {
    const result = await query(
      `SELECT id, name, display_name, slug, description, category, difficulty,
              tags, required_tools, agent_bindings, is_builtin, is_active,
              performance_score, avg_rating, total_uses, successful_uses,
              version, has_embedding, created_at, updated_at
       FROM skills
       WHERE is_builtin = true
       ORDER BY name ASC`
    );

    return NextResponse.json({
      success: true,
      data: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch builtin skills";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/skills/seed-builtin — Insert/update all 10 builtin skills
// ---------------------------------------------------------------------------
export async function POST() {
  try {
    // -----------------------------------------------------------------------
    // 1. Ensure schema — create base table first, then add columns
    // -----------------------------------------------------------------------
    const baseCreateStatements = [
      `CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        display_name TEXT,
        slug TEXT UNIQUE,
        description TEXT,
        category TEXT,
        difficulty TEXT,
        prompt_template TEXT,
        workflow_steps JSONB DEFAULT '[]',
        required_tools TEXT[] DEFAULT '{}',
        tags TEXT[] DEFAULT '{}',
        performance_score NUMERIC DEFAULT 0,
        total_uses INTEGER DEFAULT 0,
        avg_rating NUMERIC DEFAULT 0,
        metadata JSONB DEFAULT '{}',
        agent_bindings TEXT[] DEFAULT '{}',
        is_builtin BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        version INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS agent_skills (
        agent_id TEXT NOT NULL,
        skill_id TEXT NOT NULL,
        is_equipped BOOLEAN DEFAULT true,
        equipped_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (agent_id, skill_id)
      )`,
      `CREATE TABLE IF NOT EXISTS skill_executions (
        id SERIAL PRIMARY KEY,
        skill_id TEXT NOT NULL,
        agent_id TEXT,
        task_description TEXT,
        duration_ms INTEGER,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS skill_evolution (
        id SERIAL PRIMARY KEY,
        skill_id TEXT NOT NULL,
        previous_version INTEGER,
        new_version INTEGER,
        trigger_reason TEXT,
        evaluation_score NUMERIC,
        prompt_before TEXT,
        prompt_after TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,
    ];
    for (const stmt of baseCreateStatements) {
      try {
        await query(stmt);
      } catch (e) {
        console.warn(`[ensureSchema] CREATE TABLE failed (may already exist): ${e}`);
      }
    }

    // Add any columns that might be missing from an older schema
    const alterStatements = [
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS performance_score NUMERIC DEFAULT 0`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS total_uses INTEGER DEFAULT 0`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS avg_rating NUMERIC DEFAULT 0`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS agent_bindings TEXT[] DEFAULT '{}'`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS is_builtin BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS workflow_steps JSONB DEFAULT '[]'`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS required_tools TEXT[] DEFAULT '{}'`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}'`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS slug TEXT`,
    ];
    for (const stmt of alterStatements) {
      try {
        await query(stmt);
      } catch (e) {
        console.warn(`[ensureSchema] ALTER failed (may already exist): ${e}`);
      }
    }

    // Ensure UNIQUE constraints exist for ON CONFLICT
    const constraintStatements = [
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'skills_name_key') THEN
          ALTER TABLE skills ADD CONSTRAINT skills_name_key UNIQUE (name);
        END IF;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;`,
    ];
    for (const stmt of constraintStatements) {
      try {
        await query(stmt);
      } catch (e) {
        console.warn(`[ensureSchema] CONSTRAINT failed: ${e}`);
      }
    }

    // -----------------------------------------------------------------------
    // 2. Seed / upsert builtin skills
    // -----------------------------------------------------------------------
    const results: { name: string; status: string; id: string }[] = [];

    for (const skill of BUILTIN_SKILLS) {
      // Use ON CONFLICT for idempotency — update prompt_template and updated_at on conflict
      const result = await query(
        `INSERT INTO skills (
           id, name, display_name, slug, description, category, difficulty,
           prompt_template, workflow_steps, required_tools, tags, agent_bindings,
           is_builtin, is_active, version, metadata
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         ON CONFLICT (name) DO UPDATE SET
           prompt_template = EXCLUDED.prompt_template,
           display_name = EXCLUDED.display_name,
           slug = EXCLUDED.slug,
           description = EXCLUDED.description,
           category = EXCLUDED.category,
           difficulty = EXCLUDED.difficulty,
           workflow_steps = EXCLUDED.workflow_steps,
           required_tools = EXCLUDED.required_tools,
           tags = EXCLUDED.tags,
           agent_bindings = EXCLUDED.agent_bindings,
           is_builtin = EXCLUDED.is_builtin,
           version = skills.version + 1,
           metadata = EXCLUDED.metadata,
           updated_at = NOW()
         RETURNING id, name`,
        [
          skill.id,
          skill.name,
          skill.display_name,
          skill.slug,
          skill.description,
          skill.category,
          skill.difficulty,
          skill.prompt_template,
          JSON.stringify(skill.workflow_steps),
          skill.required_tools,
          skill.tags,
          skill.agent_bindings,
          skill.is_builtin,
          skill.is_active,
          skill.version,
          JSON.stringify(skill.metadata),
        ]
      );

      if (result.rows.length > 0) {
        results.push({
          name: skill.name,
          status: "upserted",
          id: result.rows[0].id,
        });
      }
    }

    // -----------------------------------------------------------------------
    // 3. Auto-equip skills to agents
    // -----------------------------------------------------------------------
    const skillNameToId: Record<string, string> = {};
    for (const skill of BUILTIN_SKILLS) {
      skillNameToId[skill.name] = skill.id;
    }

    const AGENT_SKILL_MAP: Record<string, string[]> = {
      general: ["docx", "xlsx", "pdf", "pptx", "fullstack_dev", "frontend_dev", "react_native_dev", "humanizer", "shader_dev", "vision_analysis"],
      mail: ["docx", "pdf", "pptx", "humanizer"],
      code: ["fullstack_dev", "frontend_dev", "react_native_dev", "shader_dev"],
      data: ["xlsx", "pdf", "vision_analysis"],
      creative: ["docx", "pptx", "pdf", "humanizer", "frontend_dev", "shader_dev", "vision_analysis"],
      research: ["pdf", "docx", "pptx", "vision_analysis"],
      ops: ["docx", "xlsx", "pdf"],
    };

    let equipCount = 0;
    for (const [agentId, skillNames] of Object.entries(AGENT_SKILL_MAP)) {
      for (const skillName of skillNames) {
        const skillId = skillNameToId[skillName];
        if (!skillId) continue; // skip if skill not in BUILTIN_SKILLS
        try {
          await query(
            `INSERT INTO agent_skills (agent_id, skill_id, is_equipped, equipped_at)
             VALUES ($1, $2, true, NOW())
             ON CONFLICT (agent_id, skill_id)
             DO UPDATE SET is_equipped = true, equipped_at = NOW()`,
            [agentId, skillId]
          );
          equipCount++;
        } catch (e) {
          console.warn(`[auto-equip] Failed to equip ${skillName} to ${agentId}: ${e}`);
        }
      }
    }

    // -----------------------------------------------------------------------
    // 4. Also sync filesystem skills (from /skills/ directory)
    // -----------------------------------------------------------------------
    let fsSyncResult = { synced: 0, deleted: 0, total: 0 };
    try {
      const { readdir, readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");

      const skillsDir = join(process.cwd(), "skills");
      let entries: string[];
      try {
        entries = await readdir(skillsDir);
      } catch { entries = []; }

      // Find all directories with SKILL.md
      const skillDirs: string[] = [];
      for (const entry of entries) {
        try {
          await readFile(join(skillsDir, entry, "SKILL.md"), "utf-8");
          skillDirs.push(entry);
        } catch {}
      }

      // Agent → skill patterns mapping for filesystem skills
      const fsAgentMap: Record<string, string[]> = {
        general: ["*"],
        mail: ["docx", "pdf", "xlsx", "pptx", "ppt", "web-search", "web-reader", "humanizer", "deep-research"],
        code: ["fullstack-dev", "fullstack_dev", "code-review", "pdf", "docx", "xlsx", "charts", "web-search", "web-reader", "skill-creator", "project-planner"],
        data: ["xlsx", "charts", "finance", "data-analysis", "pdf", "docx", "web-search", "web-reader", "project-planner"],
        creative: ["pdf", "docx", "xlsx", "pptx", "ppt", "charts", "humanizer", "deep-research", "web-search", "web-reader"],
        research: ["deep-research", "web-search", "web-reader", "pdf", "docx", "xlsx", "charts", "data-analysis", "humanizer", "project-planner"],
        ops: ["code-review", "data-analysis", "pdf", "charts", "web-search", "web-reader", "fullstack-dev", "fullstack_dev", "project-planner"],
      };

      for (const dirName of skillDirs) {
        try {
          const content = await readFile(join(skillsDir, dirName, "SKILL.md"), "utf-8");

          // Extract display name and description from SKILL.md
          const lines = content.split("\n").slice(0, 20);
          let display_name = dirName.replace(/[-_]/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase());
          let description = `${display_name} — provides structured methodology for ${dirName.replace(/-/g, " ")} tasks`;

          for (const line of lines) {
            if (line.startsWith("# ") && display_name === dirName.replace(/[-_]/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())) {
              display_name = line.slice(2).trim();
            }
            if (line.startsWith("> ") && description.includes("provides structured methodology")) {
              description = line.slice(2).trim().slice(0, 500);
            }
          }

          // Auto-detect category
          const lowerDir = dirName.toLowerCase();
          let category = "general";
          if (/docx|pdf|pptx|ppt|document/.test(lowerDir)) category = "document";
          else if (/code|dev|frontend|fullstack|backend|shader|browser/.test(lowerDir)) category = "code";
          else if (/xlsx|data|finance|stock|analy/.test(lowerDir)) category = "data";
          else if (/research|search|aminer|academic/.test(lowerDir)) category = "research";
          else if (/blog|content|seo|writing|creative|podcast|storyboard/.test(lowerDir)) category = "content";
          else if (/image|video|vision|tts|asr|design|ui-ux/.test(lowerDir)) category = "media";
          else if (/humaniz|project|plan/.test(lowerDir)) category = "productivity";

          const id = `skill-${dirName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
          const name = dirName.toLowerCase().replace(/\s+/g, "_");
          const slug = dirName.toLowerCase().replace(/[^a-z0-9-]/g, "-");

          // Determine agent bindings
          const agentBindings: string[] = [];
          for (const [agent, patterns] of Object.entries(fsAgentMap)) {
            if (patterns.includes("*")) { agentBindings.push(agent); continue; }
            if (patterns.some(p => p.toLowerCase() === name || p.toLowerCase() === slug || p.toLowerCase() === lowerDir)) {
              agentBindings.push(agent);
            }
          }

          await query(
            `INSERT INTO skills (id, name, display_name, slug, description, category, difficulty, prompt_template, tags, agent_bindings, is_builtin, is_active, version)
             VALUES ($1, $2, $3, $4, $5, $6, 'intermediate', $7, '{}', $8, true, true, 1)
             ON CONFLICT (name) DO UPDATE SET
               display_name = EXCLUDED.display_name,
               slug = EXCLUDED.slug,
               description = EXCLUDED.description,
               category = EXCLUDED.category,
               prompt_template = EXCLUDED.prompt_template,
               agent_bindings = EXCLUDED.agent_bindings,
               is_builtin = true,
               is_active = true,
               updated_at = NOW(),
               version = skills.version + 1`,
            [id, name, display_name, slug, description, category, content, agentBindings]
          );
          fsSyncResult.synced++;
        } catch (e) {
          console.warn(`[seed-builtin] Failed to sync filesystem skill ${dirName}:`, e);
        }
      }
      fsSyncResult.total = skillDirs.length;

      // Delete stale skills from DB that no longer exist on the filesystem
      const validNames = skillDirs.map(d => d.toLowerCase().replace(/\s+/g, "_"));
      const placeholders = validNames.map((_, i) => `$${i + 1}`).join(", ");

      await query(
        `DELETE FROM agent_skills WHERE skill_id IN (SELECT id FROM skills WHERE name NOT IN (${placeholders}))`,
        validNames
      );
      await query(
        `DELETE FROM skill_executions WHERE skill_id IN (SELECT id FROM skills WHERE name NOT IN (${placeholders}))`,
        validNames
      );
      await query(
        `DELETE FROM skill_evolution WHERE skill_id IN (SELECT id FROM skills WHERE name NOT IN (${placeholders}))`,
        validNames
      );
      const delResult = await query(
        `DELETE FROM skills WHERE name NOT IN (${placeholders})`,
        validNames
      );
      fsSyncResult.deleted = delResult.rowCount || 0;

      // Auto-equip all filesystem skills to their bound agents
      await query(`
        INSERT INTO agent_skills (agent_id, skill_id, is_equipped)
        SELECT DISTINCT unnest(s.agent_bindings), s.id, true
        FROM skills s
        WHERE s.is_active = true AND array_length(s.agent_bindings, 1) > 0
        ON CONFLICT (agent_id, skill_id) DO UPDATE SET is_equipped = true, equipped_at = NOW()
      `);
    } catch (e) {
      console.warn("[seed-builtin] Filesystem sync failed (non-critical):", e);
    }

    return NextResponse.json({
      success: true,
      message: `Seeded ${results.length} builtin skills + synced ${fsSyncResult.synced}/${fsSyncResult.total} filesystem skills (deleted ${fsSyncResult.deleted} stale), equipped ${equipCount} agent-skill bindings`,
      data: results,
      filesystem_sync: fsSyncResult,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to seed builtin skills";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
