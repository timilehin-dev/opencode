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
    agent_bindings: ["general", "mail", "creative", "research", "data", "ops"],
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
    agent_bindings: ["general", "data", "ops"],
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
    agent_bindings: ["general", "mail", "creative", "research", "data", "ops"],
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
    agent_bindings: ["general", "creative", "mail", "research"],
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
    agent_bindings: ["general", "code"],
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
  // 6. FRONTEND_DEV — Frontend Development Studio
  // =========================================================================
  {
    id: "a1b2c3d4-0006-4000-8000-000000000006",
    name: "frontend_dev",
    display_name: "Frontend Development Studio",
    slug: "frontend-development-studio",
    description:
      "Premium UI design, cinematic animations, and visual art for web pages. Use when building landing pages, marketing sites, dashboards, or implementing scroll animations.",
    category: "code",
    difficulty: "advanced",
    tags: ["frontend", "ui", "ux", "animation", "design", "landing-page", "motion"],
    required_tools: [],
    agent_bindings: ["general", "code", "creative"],
    workflow_steps: [
      { step: 1, action: "Analyze request and set design dials" },
      { step: 2, action: "Plan layout sections and motion architecture" },
      { step: 3, action: "Generate media assets using image generation" },
      { step: 4, action: "Craft copy using AIDA/PAS/FAB frameworks" },
      { step: 5, action: "Build UI with animations" },
      { step: 6, action: "Quality gates review" },
    ],
    is_builtin: true,
    is_active: true,
    version: 1,
    metadata: { source: "adapted-from-frontend-dev", adapter: "system" },
    prompt_template: `# Frontend Development Studio

Build complete, production-ready frontend pages with premium UI design, cinematic animations, AI-generated assets, persuasive copy, and visual art.

## Design Dials

| Dial | Default | Range |
|------|---------|-------|
| DESIGN_VARIANCE | 8 | 1=Symmetry, 10=Asymmetric |
| MOTION_INTENSITY | 6 | 1=Static, 10=Cinematic |
| VISUAL_DENSITY | 4 | 1=Airy, 10=Packed |

Adapt dynamically based on user requests.

## Design Engineering Rules

### Typography
- Headlines: \`text-4xl md:text-6xl tracking-tighter\`
- Body: \`text-base leading-relaxed max-w-[65ch]\`
- **NEVER** use Inter — use Geist/Outfit/Satoshi
- **NEVER** use Serif on dashboards

### Color
- Max 1 accent, saturation < 80%
- **NEVER** use AI purple/blue
- Stick to one palette throughout

### Layout
- **NEVER** use centered heroes when VARIANCE > 4. Force split-screen or asymmetric layouts
- **NEVER** use generic cards when DENSITY > 7. Use \`border-t\`, \`divide-y\`, or spacing
- Use \`max-w-[1400px] mx-auto\` or \`max-w-7xl\`
- Use \`min-h-[100dvh]\` not \`h-screen\`

### States
- **ALWAYS** implement: Loading (skeleton), Empty, Error, Tactile feedback (\`scale-[0.98]\`)
- Forms: Label above input. Error below. \`gap-2\` for input blocks.

### Anti-Emoji Policy
NEVER use emojis anywhere. Use Phosphor or Lucide icons only.

## Anti-Slop Techniques

- **Liquid Glass:** \`backdrop-blur\` + \`border-white/10\` + \`shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]\`
- **Magnetic Buttons:** Use \`useMotionValue\`/\`useTransform\` — never \`useState\` for continuous animations
- **Perpetual Motion:** When INTENSITY > 5, add infinite micro-animations (Pulse, Float, Shimmer)
- **Layout Transitions:** Use Framer \`layout\` and \`layoutId\` props
- **Stagger:** Use \`staggerChildren\` or CSS \`animation-delay: calc(var(--index) * 100ms)\`

## Forbidden Patterns

| Category | Banned |
|----------|--------|
| Visual | Neon glows, pure black (#000), oversaturated accents, gradient text on headers, custom cursors |
| Typography | Inter font, oversized H1s, Serif on dashboards |
| Layout | 3-column equal card rows, floating elements with awkward gaps |
| Components | Default shadcn/ui without customization |

## Motion Engine

### Tool Selection Matrix

| Need | Tool |
|------|------|
| UI enter/exit/layout | **Framer Motion** — \`AnimatePresence\`, \`layoutId\`, springs |
| Scroll storytelling (pin, scrub) | **GSAP + ScrollTrigger** — frame-accurate control |
| Looping icons | **Lottie** — lazy-load (~50KB) |
| 3D/WebGL | **Three.js / R3F** — isolated \`<Canvas>\` |
| Hover/focus states | **CSS only** — zero JS cost |

**Conflict Rules:**
- NEVER mix GSAP + Framer Motion in same component
- R3F MUST live in isolated Canvas wrapper
- ALWAYS lazy-load Lottie, GSAP, Three.js

### Intensity Scale

| Level | Techniques |
|-------|------------|
| 1-2 Subtle | CSS transitions only, 150-300ms |
| 3-4 Smooth | CSS keyframes + Framer animate, stagger ≤3 items |
| 5-6 Fluid | \`whileInView\`, magnetic hover, parallax tilt |
| 7-8 Cinematic | GSAP ScrollTrigger, pinned sections, horizontal hijack |
| 9-10 Immersive | Full scroll sequences, Three.js particles, WebGL shaders |

### Performance Rules

**GPU-only properties (ONLY animate these):** \`transform\`, \`opacity\`, \`filter\`, \`clip-path\`

**NEVER animate:** \`width\`, \`height\`, \`top\`, \`left\`, \`margin\`, \`padding\`, \`font-size\`

### Springs & Easings

| Feel | Framer Config |
|------|---------------|
| Snappy | stiffness: 300, damping: 30 |
| Smooth | stiffness: 150, damping: 20 |
| Bouncy | stiffness: 100, damping: 10 |
| Heavy | stiffness: 60, damping: 20 |

### Accessibility
- ALWAYS wrap motion in \`prefers-reduced-motion\` check
- NEVER flash content > 3 times/second
- ALWAYS provide visible focus rings
- ALWAYS add \`aria-live="polite"\` for dynamically revealed content

## Copywriting

### Frameworks

**AIDA** (landing pages):
ATTENTION → INTEREST → DESIRE → ACTION

**PAS** (pain-driven):
PROBLEM → AGITATE → SOLUTION

**FAB** (product differentiation):
FEATURE → ADVANTAGE → BENEFIT

### CTA Formula
[Action Verb] + [What They Get] + [Urgency/Ease]
Example: "Start my free trial", "Get the template now"

### Headlines
Be specific. Lead with outcome, not method.
Examples: "Double open rates in 30 days", "7 mistakes killing conversions"

## Asset Generation

Generate images using the design tool or code execution for canvas/SVG assets.

**Preset Shortcuts:**
| Shortcut | Spec |
|----------|------|
| hero | 16:9, cinematic, text-safe |
| thumb | 1:1, centered subject |
| icon | 1:1, flat, clean background |
| banner | 21:9, OG/social |

**Rules:**
- NEVER use placeholder URLs (unsplash, picsum, placeholder.com)
- Use inline SVG or canvas-drawn elements for simple graphics
- Asset naming: \`{type}-{descriptor}-{timestamp}.{ext}\`
- Images → WebP format preferred

## Creative Arsenal

| Category | Patterns |
|----------|----------|
| Navigation | Dock magnification, Magnetic button, Dynamic island |
| Layout | Bento grid, Masonry, Split-screen scroll, Curtain reveal |
| Cards | Parallax tilt, Spotlight border, Glassmorphism |
| Scroll | Sticky stack, Horizontal hijack, Zoom parallax |
| Text | Kinetic marquee, Text mask reveal, Scramble effect |
| Micro | Particle effects, Skeleton shimmer, Ripple click, Mesh gradient |

## Visual Art (p5.js)

For generative art:
1. Create a philosophy statement (space, form, color, rhythm)
2. Identify a niche conceptual reference
3. Use seeded randomness: \`randomSeed(seed); noiseSeed(seed);\`
4. Output: single self-contained HTML with p5.js

## Quality Gates

- [ ] Mobile layout collapse for high-variance designs
- [ ] Empty, loading, error states provided
- [ ] Correct motion tool per selection matrix
- [ ] No GSAP + Framer mixed in same component
- [ ] prefers-reduced-motion respected
- [ ] No placeholder URLs — all assets generated
- [ ] Only GPU properties animated`,
  },

  // =========================================================================
  // 7. REACT_NATIVE_DEV — React Native Development
  // =========================================================================
  {
    id: "a1b2c3d4-0007-4000-8000-000000000007",
    name: "react_native_dev",
    display_name: "React Native Development",
    slug: "react-native-development",
    description:
      "React Native and Expo development guide. Use when building mobile apps, implementing animations, managing state, fetching data, or deploying to app stores.",
    category: "code",
    difficulty: "advanced",
    tags: ["react-native", "expo", "mobile", "ios", "android", "animation"],
    required_tools: [],
    agent_bindings: ["general", "code"],
    workflow_steps: [
      { step: 1, action: "Set up project with Expo" },
      { step: 2, action: "Implement core screens and navigation" },
      { step: 3, action: "Add state management and data fetching" },
      { step: 4, action: "Implement animations and native features" },
      { step: 5, action: "Profile performance and test" },
    ],
    is_builtin: true,
    is_active: true,
    version: 1,
    metadata: { source: "adapted-from-react-native-dev", adapter: "system" },
    prompt_template: `# React Native & Expo Development Guide

Build production-ready React Native and Expo applications. Covers UI, animations, state, testing, performance, and deployment.

## Component Preferences

| Purpose | Use | Instead of |
|---------|-----|------------|
| Lists | \`FlashList\` (\`@shopify/flash-list\`) + \`memo\` items | \`FlatList\` |
| Images | \`expo-image\` | RN \`<Image>\` |
| Press | \`Pressable\` | \`TouchableOpacity\` |
| Audio | \`expo-audio\` | \`expo-av\` (deprecated) |
| Video | \`expo-video\` | \`expo-av\` (deprecated) |
| Animations | Reanimated 3 | RN Animated API |
| Gestures | Gesture Handler | PanResponder |
| Platform check | \`process.env.EXPO_OS\` | \`Platform.OS\` |
| Safe area scroll | \`contentInsetAdjustmentBehavior="automatic"\` | \`<SafeAreaView>\` |
| SF Symbols | \`expo-image\` with \`source="sf:name"\` | \`expo-symbols\` |

## State Management

| State Type | Solution |
|------------|----------|
| Local UI state | \`useState\` / \`useReducer\` |
| Shared app state | Zustand or Jotai |
| Server / async data | React Query |
| Form state | React Hook Form + Zod |

## New Project Init

\`\`\`bash
# 1. Create project
npx create-expo-app@latest my-app --template blank-typescript
cd my-app

# 2. Install Expo Router + core deps
npx expo install expo-router react-native-safe-area-context react-native-screens

# 3. Common extras
npx expo install expo-image react-native-reanimated react-native-gesture-handler
\`\`\`

Configure:
1. Set entry point: \`"main": "expo-router/entry"\` in package.json
2. Add scheme: \`"scheme": "my-app"\` in app.json
3. Delete \`App.tsx\` and \`index.ts\`
4. Create \`app/_layout.tsx\` as root Stack layout
5. Create \`app/(tabs)/_layout.tsx\` for tab navigation

## Core Principles

- **Try Expo Go first** (\`npx expo start\`). Custom builds only when needed.
- **Conditional rendering**: use \`{count > 0 && <Text />}\` not \`{count && <Text />}\`
- **Animation rule**: only animate \`transform\` and \`opacity\` — GPU-composited
- **Direct imports**: always import from source, not barrel files — avoids bundle bloat
- **Route files**: always use kebab-case, never co-locate components in \`app/\`

## Performance Priorities

| Priority | Issue | Fix |
|----------|-------|-----|
| CRITICAL | Long list jank | \`FlashList\` + memoized items |
| CRITICAL | Large bundle | Avoid barrel imports, enable R8 |
| HIGH | Too many re-renders | Zustand selectors, React Compiler |
| HIGH | Slow startup | Disable bundle compression, native nav |
| MEDIUM | Animation drops | Only animate \`transform\`/\`opacity\` |

## Animations (Reanimated 3)

\`\`\`typescript
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  FadeIn,
  SlideInRight,
} from "react-native-reanimated";

function AnimatedCard() {
  const offset = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
  }));

  return (
    <Animated.View entering={FadeIn} style={animatedStyle}>
      <Pressable onPressIn={() => (offset.value = withSpring(-4))} />
    </Animated.View>
  );
}
\`\`\`

## Navigation (Expo Router)

\`\`\`typescript
// app/_layout.tsx
import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#f8f9fa" },
        headerTintColor: "#333",
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}

// app/(tabs)/_layout.tsx
import { Tabs } from "expo-router";

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: "#007AFF" }}>
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
\`\`\`

## Forms (React Hook Form + Zod)

\`\`\`typescript
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  email: z.string().email("Invalid email"),
  name: z.string().min(2, "Name too short"),
});

function LoginForm() {
  const { control, handleSubmit } = useForm({
    resolver: zodResolver(schema),
  });

  return (
    <Controller
      control={control}
      name="email"
      render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
        <TextInput
          onChangeText={onChange}
          onBlur={onBlur}
          value={value}
          keyboardType="email-address"
          autoCapitalize="none"
        />
      )}
    />
  );
}
\`\`\`

## Checklist

### New Project
- [ ] Path aliases configured in tsconfig.json
- [ ] EXPO_PUBLIC_API_URL env var set per environment
- [ ] GestureHandlerRootView in root layout
- [ ] contentInsetAdjustmentBehavior="automatic" on scroll views
- [ ] FlashList for lists > 20 items

### Before Shipping
- [ ] Profile in --profile mode, fix frames > 16ms
- [ ] Bundle analyzed, no barrel imports
- [ ] R8 enabled for Android
- [ ] Unit + component tests for critical paths
- [ ] E2E flows for login and core features`,
  },

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
    agent_bindings: ["general", "creative", "mail"],
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
  // 9. SHADER_DEV — GLSL Shader Development
  // =========================================================================
  {
    id: "a1b2c3d4-0009-4000-8000-000000000009",
    name: "shader_dev",
    display_name: "GLSL Shader Development",
    slug: "glsl-shader-development",
    description:
      "Comprehensive GLSL shader techniques for visual effects. Ray marching, SDF modeling, fluid simulation, particles, procedural generation, lighting, and post-processing.",
    category: "code",
    difficulty: "expert",
    tags: ["shader", "glsl", "webgl", "ray-marching", "sdf", "procedural", "gpu"],
    required_tools: [],
    agent_bindings: ["general", "code", "creative"],
    workflow_steps: [
      { step: 1, action: "Identify required techniques from routing table" },
      { step: 2, action: "Write GLSL shader code" },
      { step: 3, action: "Apply WebGL2 adaptation rules" },
      { step: 4, action: "Wrap in standalone HTML page" },
      { step: 5, action: "Validate performance budget" },
    ],
    is_builtin: true,
    is_active: true,
    version: 1,
    metadata: { source: "adapted-from-shader-dev", adapter: "system" },
    prompt_template: `# GLSL Shader Development

Comprehensive shader techniques for real-time visual effects. All shaders are WebGL2-compatible and output as standalone HTML pages.

## Technique Routing Table

| User wants to create... | Primary technique | Combine with |
|---|---|---|
| 3D objects/scenes from math | ray-marching + sdf-3d | lighting-model, shadow-techniques |
| Complex 3D shapes (booleans, blends) | csg-boolean-operations | sdf-3d, ray-marching |
| Infinite repeating patterns | domain-repetition | sdf-3d, ray-marching |
| Organic/warped shapes | domain-warping | procedural-noise |
| Fluid/smoke/ink effects | fluid-simulation | multipass-buffer |
| Particle effects (fire, sparks, snow) | particle-system | procedural-noise, color-palette |
| Physics simulations | simulation-physics | multipass-buffer |
| Game of Life / reaction-diffusion | cellular-automata | multipass-buffer, color-palette |
| Ocean/water surface | water-ocean | atmospheric-scattering, lighting-model |
| Terrain/landscape | terrain-rendering | atmospheric-scattering, procedural-noise |
| Clouds/fog/volumetric fire | volumetric-rendering | procedural-noise, atmospheric-scattering |
| Sky/sunset/atmosphere | atmospheric-scattering | volumetric-rendering |
| Realistic lighting (PBR, Phong) | lighting-model | shadow-techniques, ambient-occlusion |
| Shadows (soft/hard) | shadow-techniques | lighting-model |
| Ambient occlusion | ambient-occlusion | lighting-model, normal-estimation |
| Path tracing / global illumination | path-tracing-gi | analytic-ray-tracing, multipass-buffer |
| Noise/FBM textures | procedural-noise | domain-warping |
| Voronoi/cell patterns | voronoi-cellular-noise | color-palette |
| Fractals (Mandelbrot, Julia) | fractal-rendering | color-palette |
| Color grading/palettes | color-palette | — |
| Bloom/tone mapping/glitch | post-processing | multipass-buffer |
| 2D shapes/UI from SDF | sdf-2d | color-palette |
| 3D audio | sound-synthesis | — |
| Anti-aliased rendering | anti-aliasing | sdf-2d, post-processing |

## WebGL2 Adaptation Rules

### Shader Version & Output
- Use \`canvas.getContext("webgl2")\`
- Shader first line: \`#version 300 es\`, fragment adds \`precision highp float;\`
- Fragment declares: \`out vec4 fragColor;\`
- Vertex: \`attribute\` → \`in\`, \`varying\` → \`out\`
- Fragment: \`varying\` → \`in\`, \`gl_FragColor\` → \`fragColor\`, \`texture2D()\` → \`texture()\`

### Fragment Coordinate
\`\`\`glsl
// WRONG — fragCoord doesn't exist in WebGL2
vec2 uv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;

// CORRECT
vec2 uv = (2.0 * gl_FragCoord.xy - iResolution.xy) / iResolution.y;
\`\`\`

### main() Wrapper
\`\`\`glsl
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    // shader code...
    fragColor = vec4(col, 1.0);
}

void main() {
    mainImage(fragColor, gl_FragCoord.xy);
}
\`\`\`

### Function Declaration Order
GLSL requires functions declared before use:
\`\`\`glsl
// CORRECT — define callee first
vec3 getSunDirection() { return normalize(vec3(1.0)); }
vec3 getAtmosphere(vec3 dir) { return getSunDirection(); }
\`\`\`

### Macro Limitations
\`\`\`glsl
// WRONG — #define cannot use function calls
#define SUN_DIR normalize(vec3(0.8, 0.4, -0.6))

// CORRECT — use const
const vec3 SUN_DIR = vec3(0.756, 0.378, -0.567);
\`\`\`

## HTML Page Setup

\`\`\`html
<!DOCTYPE html>
<html>
<head>
<style>
  body { margin: 0; overflow: hidden; background: #000; }
  canvas { width: 100vw; height: 100vh; display: block; }
</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
const canvas = document.getElementById("c");
const gl = canvas.getContext("webgl2");

const vs = \`#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
\`;

const fs = \`#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
out vec4 fragColor;

void mainImage(out vec4 fc, in vec2 fc2) {
    vec2 uv = (2.0 * fc2 - iResolution.xy) / iResolution.y;
    vec3 col = 0.5 + 0.5 * cos(iTime + uv.xyx + vec3(0, 2, 4));
    fc = vec4(col, 1.0);
}
void main() { mainImage(fragColor, gl_FragCoord.xy); }
\`;

// ... compile, link, render loop ...
</script>
</body>
</html>
\`\`\`

## Performance Budget

Stay within these limits:
- Ray marching main loop: ≤ 128 steps
- Volume sampling / lighting inner loops: ≤ 32 steps
- FBM octaves: ≤ 6 layers
- Total nested loop iterations per pixel: ≤ 1000

## Common GLSL Pitfalls

- **Function signature mismatch**: Parameter count and types must match exactly
- **Reserved words**: Don't use: patch, cast, sample, filter, input, output, common, partition, active
- **Strict type matching**: \`vec3 x = 1.0\` is illegal — use \`vec3 x = vec3(1.0)\`
- **No ternary on structs**: Use \`if\`/\`else\` instead
- **Unused uniforms**: Compiler may optimize them out, causing null location

## Shader Debugging Techniques

| What to check | Code | What to look for |
|---|---|---|
| Surface normals | \`col = nor * 0.5 + 0.5;\` | Smooth gradients = correct |
| Step count | \`col = vec3(float(steps)/MAX_STEPS);\` | Red = bottleneck |
| Depth | \`col = vec3(t / MAX_DIST);\` | Verify hit distances |
| UV coordinates | \`col = vec3(uv, 0.0);\` | Check mapping |
| SDF field | \`col = vec3(abs(d));\` | Visualize zero-crossing |

## Quick Recipes

### Photorealistic SDF Scene
1. sdf-3d + csg-boolean → ray-marching + normal-estimation
2. lighting-model (outdoor three-light) + shadow-techniques (soft) + ambient-occlusion
3. atmospheric-scattering (height-based fog) → post-processing (ACES tonemap + vignette)

### Organic Forms
1. sdf-3d + domain-warping → ray-marching
2. procedural-noise (FBM with derivatives)
3. lighting-model (subsurface scattering via half-Lambert)

### Procedural Landscape
1. terrain-rendering + procedural-noise (erosion FBM)
2. atmospheric-scattering (Rayleigh/Mie + height fog)
3. water-ocean (Gerstner waves) + lighting-model (Fresnel)

### Stylized 2D Art
1. sdf-2d (extended library) + sdf-tricks (layered edges)
2. color-palette (cosine palettes) + polar-uv-manipulation (kaleidoscope)
3. anti-aliasing (SDF analytical AA) + post-processing (bloom, chromatic aberration)`,
  },

  // =========================================================================
  // 10. VISION_ANALYSIS — Image Analysis
  // =========================================================================
  {
    id: "a1b2c3d4-0010-4000-8000-000000001000",
    name: "vision_analysis",
    display_name: "Image Analysis",
    slug: "image-analysis",
    description:
      "Analyze, describe, and extract information from images. Supports OCR, UI review, chart data extraction, object detection, and general image understanding.",
    category: "ai",
    difficulty: "intermediate",
    tags: ["vision", "image", "ocr", "analysis", "object-detection", "ui-review"],
    required_tools: [],
    agent_bindings: ["general", "creative", "data", "research"],
    workflow_steps: [
      { step: 1, action: "Auto-detect image from user message (file path or URL)" },
      { step: 2, action: "Determine analysis mode (describe/ocr/ui-review/chart-data/object-detect)" },
      { step: 3, action: "Call VLM tool with mode-specific prompt" },
      { step: 4, action: "Present structured results" },
    ],
    is_builtin: true,
    is_active: true,
    version: 1,
    metadata: { source: "adapted-from-vision-analysis", adapter: "system" },
    prompt_template: `# Image Analysis

Analyze, describe, and extract information from images using the VLM (Vision Language Model) tool.

## Trigger

This skill activates when the user:
- Shares an image file path or URL (extensions: .jpg, .jpeg, .png, .gif, .webp, .bmp, .svg)
- Uses analysis words near an image: "analyze", "describe", "explain", "look at", "review", "extract text", "OCR", "what is in", "read this image", "tell me about"
- Requests: UI mockup review, wireframe analysis, design critique, data extraction from charts, object detection

## Analysis Modes

| Mode | When to use | Prompt strategy |
|------|-------------|-----------------|
| \`describe\` | General image understanding | Detailed description of all elements |
| \`ocr\` | Text extraction from screenshots, documents | Verbatim text extraction preserving structure |
| \`ui-review\` | UI mockups, wireframes, design files | Design critique with actionable suggestions |
| \`chart-data\` | Charts, graphs, data visualizations | Extract all data points and trends |
| \`object-detect\` | Identify objects, people, activities | List and locate all elements |

## Workflow

### Step 1: Auto-detect Image

Scan the user's message for image file paths or URLs with extensions:
\`.jpg\`, \`.jpeg\`, \`.png\`, \`.gif\`, \`.webp\`, \`.bmp\`, \`.svg\`

Extract the image path from the message.

### Step 2: Select Analysis Mode

Determine the mode based on the user's request:

- "describe this image", "what do you see" → \`describe\`
- "extract text", "OCR", "read this", "what does it say" → \`ocr\`
- "review this UI", "critique this design", "improve this mockup" → \`ui-review\`
- "extract data from chart", "what are the numbers", "get the values" → \`chart-data\`
- "identify objects", "what's in this photo", "detect people" → \`object-detect\`

### Step 3: Call VLM Tool

Use the VLM tool with a mode-specific system prompt:

**describe:**
\`\`\`
Provide a detailed description of this image. Include: main subject, setting/background,
colors/style, any text visible, notable objects, and overall composition.
Be specific and thorough. Describe spatial relationships between elements.
\`\`\`

**ocr:**
\`\`\`
Extract all text visible in this image verbatim. Preserve structure and formatting:
headers, lists, columns, paragraphs. Maintain the original hierarchy.
If text is partially obscured, indicate with [unclear]. If no text found, say so.
\`\`\`

**ui-review:**
\`\`\`
You are a senior UI/UX design reviewer. Analyze this interface. Provide:
1. Strengths — what works well (layout, visual hierarchy, usability)
2. Issues — usability problems, design inconsistencies, accessibility gaps
3. Specific, actionable improvement suggestions with reasoning
Be constructive. Prioritize high-impact issues.
\`\`\`

**chart-data:**
\`\`\`
Extract all data from this chart/graph. Provide:
1. Chart title and type
2. Axis labels and units
3. All data points/series with values (estimate if not precisely readable)
4. Brief trend summary
Format as structured data (table or JSON).
\`\`\`

**object-detect:**
\`\`\`
List all distinct objects, people, and activities visible in this image. For each:
- Describe what it is
- Estimate its approximate location (top-left, center, bottom-right, etc.)
- Note any notable attributes (color, size, orientation)
Be thorough and specific.
\`\`\`

### Step 4: Present Results

Return the analysis in a clear, structured format:

**For describe mode:**
\`\`\`
## Image Description
[Detailed prose description of contents...]
\`\`\`

**For ocr mode:**
\`\`\`
## Extracted Text
[Preserved text structure from the image]
\`\`\`

**For ui-review mode:**
\`\`\`
## UI Design Review

### Strengths
- ...

### Issues
- ...

### Improvement Suggestions
- ...
\`\`\`

**For chart-data mode:**
\`\`\`
## Chart Data
| [Data in table format]
## Trend Summary
[Analysis of trends]
\`\`\`

**For object-detect mode:**
\`\`\`
## Detected Objects
| Object | Location | Attributes |
|--------|----------|------------|
| ...    | ...      | ...        |
\`\`\`

## Notes

- Support for JPEG, PNG, GIF, WebP, BMP formats
- Both local file paths and URLs work
- The VLM tool from handles the actual image processing
- For complex analysis tasks, you can chain multiple mode calls
- Always present results in a structured, readable format`,
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
    let fsSyncResult = { synced: 0, total: 0 };
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
        mail: ["docx", "pdf", "xlsx", "pptx", "ppt", "web-search", "web-reader", "llm", "contentanalysis", "content-strategy"],
        code: ["fullstack-dev", "fullstack_dev", "coding-agent", "web-search", "web-reader", "agent-browser", "charts", "skill-creator", "skill-vetter"],
        data: ["xlsx", "charts", "finance", "stock-analysis-skill", "web-search", "web-reader", "llm", "vlm", "contentanalysis"],
        creative: ["docx", "pdf", "xlsx", "pptx", "ppt", "charts", "image-generation", "image-understand", "image-edit", "visual-design-foundations", "ui-ux-pro-max", "blog-writer", "seo-content-writer", "content-strategy", "contentanalysis", "storyboard-manager", "podcast-generate", "web-search", "web-reader", "tts", "video-generation"],
        research: ["web-search", "web-reader", "multi-search-engine", "aminer-academic-search", "aminer-daily-paper", "aminer-open-academic", "contentanalysis"],
        ops: ["web-search", "web-reader", "agent-browser", "charts"],
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
      message: `Seeded ${results.length} builtin skills + synced ${fsSyncResult.synced}/${fsSyncResult.total} filesystem skills, equipped ${equipCount} agent-skill bindings`,
      data: results,
      filesystem_sync: fsSyncResult,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to seed builtin skills";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
