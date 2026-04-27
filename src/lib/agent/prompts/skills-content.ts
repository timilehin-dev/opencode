// ---------------------------------------------------------------------------
// Skills Content — Skill lists, tool references, quality standards
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Skills Awareness — per-agent based on their equipped skills
// ---------------------------------------------------------------------------

export const AGENT_SKILL_LIST: Record<string, string> = {
  general: `pdf, docx, xlsx, pptx, charts, fullstack-dev, web-search, web-reader, finance, skill-creator, humanizer, deep-research, code-review, data-analysis, project-planner`,
  mail: `pdf, docx, xlsx, pptx, charts, web-search, web-reader, humanizer, deep-research`,
  code: `fullstack-dev, code-review, pdf, docx, xlsx, charts, web-search, web-reader, skill-creator, project-planner`,
  data: `xlsx, charts, finance, data-analysis, pdf, docx, web-search, web-reader, project-planner`,
  creative: `pdf, docx, xlsx, pptx, charts, humanizer, deep-research, web-search, web-reader`,
  research: `deep-research, web-search, web-reader, pdf, docx, xlsx, charts, data-analysis, humanizer, project-planner`,
  ops: `code-review, data-analysis, pdf, charts, web-search, web-reader, fullstack-dev, project-planner`,
};

// ---------------------------------------------------------------------------
// Document Tool Reference — comprehensive feature documentation
// ---------------------------------------------------------------------------

export const DOCUMENT_TOOL_REFERENCE = `
## DOCUMENT CREATION TOOLS — Complete Feature Reference

### 📄 PDF Report (\`create_pdf_report\`)
**When to use:** Reports, white papers, research summaries, executive briefs, invoices, certificates, formatted handouts.
**Key features:**
- Multi-section documents with headers, paragraphs, lists, tables
- Custom page sizes and margins
- Color themes and branding
- Tables with cell formatting
- Headers and footers with page numbers
- Bullet and numbered lists
- Bold, italic, underline text formatting
**Quality standard:** Every PDF should have a title page, table of contents (for 3+ pages), and consistent formatting throughout.

### 📝 DOCX Document (\`create_docx_document\`)
**When to use:** Letters, contracts, proposals, meeting minutes, articles, blog posts, SOPs, training materials.
**Key features:**
- Full document hierarchy: H1-H4 headings, paragraphs, lists
- Tables with merged cells and styling
- Images from URLs
- Headers, footers, page numbers
- Styles and formatting (bold, italic, underline, colors)
- Table of contents auto-generation
- Multiple sections with different page layouts
**Quality standard:** Use proper heading hierarchy (H1 → H2 → H3), never skip levels. Include headers/footers for professional documents. Minimum 3-4 sections for substantive documents.

### 📊 Excel Spreadsheet (\`create_xlsx_spreadsheet\`)
**When to use:** Data analysis, financial models, budgets, tracking sheets, dashboards, data export, inventory lists.
**Key features:**
- Multiple worksheets with custom names
- Cell formatting: number formats, currency, percentages, dates
- Formulas and calculated fields
- Conditional formatting
- Charts embedded in sheets
- Frozen panes and auto-filter
- Column widths and row heights
- Data validation
**Quality standard:** Always include header rows with bold formatting. Use number formats appropriate to the data (currency symbols, decimal places). Name worksheets descriptively. Freeze header row for data-heavy sheets.

### 📽️ PowerPoint Presentation (\`create_pptx_presentation\`)
**When to use:** Pitch decks, training presentations, status updates, quarterly reviews, project walkthroughs, client proposals.
**Key features — 15 LAYOUTS:**
| Layout | Purpose | Key Fields |
|---|---|---|
| \`title\` | Opening/title slide | title_text, subtitle, body_items, gradient, icon |
| \`content\` | Bullet point content | title_text, body_items, subtitle |
| \`two_column\` | Split content | left_title, right_title, left_items, right_items |
| \`section\` | Section divider | title_text, subtitle, gradient, icon |
| \`chart\` | Data visualization | chart_data, chart_type (bar/line/pie/doughnut/area/radar/scatter/bubble) |
| \`table\` | Data tables | table_data (headers, rows, merges, bold_columns) |
| \`image\` | Image showcase | image_url, image_caption, body_items |
| \`comparison\` | Side-by-side | left_title, right_title, left_items, right_items |
| \`timeline\` | Sequential events | timeline_items [{label, description}] |
| \`quote\` | Quote/insight | quote_text, quote_author, gradient |
| \`thank_you\` | Closing slide | title_text, subtitle, body_items, gradient, icon |
| \`kpi\` | **NEW** Metric cards | kpi_items [{label, value, change?, trend?}] (2-4 cards) |
| \`agenda\` | **NEW** Overview/listing | agenda_items [{number, title, description?}] |
| \`blank\` | Custom canvas | gradient |

**NEW FEATURES:**
- **Gradient backgrounds:** \`gradient: { colors: ["1E3A5F", "0EA5E9"], angle: 135 }\` — for title, section, thank_you, quote, blank slides
- **Slide transitions:** \`transition: "fade" | "push" | "wipe" | "zoom"\`
- **Icons:** \`icon: "rocket" | "chart" | "users" | "star" | "check" | "warning" | "info" | "heart" | "lightning" | "globe" | "target" | "trophy"\` and 30+ more
- **Enhanced tables:** \`merges: [{row, col, rowspan, colspan}]\`, \`bold_columns: [0]\` (auto-bold first column by default)
- **Radar/Scatter/Bubble charts:** \`chart_type: "radar" | "scatter" | "bubble"\`

**6 THEMES:** ocean (blue), forest (green), sunset (orange), purple (violet), slate (gray), royal (indigo)

### 📈 Chart/Diagram Generation (\`generate_chart\`)
**When to use:** Standalone charts for embedding, quick data visualizations, diagrams.
**Key features:** Bar, line, pie, scatter charts and Mermaid diagrams. SVG/PNG output.

### 🔤 When to Choose Which Format
| Need | Best Tool |
|---|---|
| Formal report with analysis | PDF |
| Editable document for collaboration | DOCX |
| Data with calculations/formulas | XLSX |
| Visual presentation for meetings | PPTX |
| Quick standalone chart | Charts (generate_chart) |
| Interactive data exploration | XLSX with multiple sheets |
| Research brief with citations | PDF or DOCX |
`;

// ---------------------------------------------------------------------------
// Document Quality Standards
// ---------------------------------------------------------------------------

export const DOCUMENT_QUALITY_STANDARDS = `
## DOCUMENT QUALITY STANDARDS — Every output must meet these criteria

### Content Depth
- **No shallow paragraphs.** Each paragraph should be 3-5 sentences with specific data, examples, or reasoning.
- **Quantify when possible.** Use specific numbers ($1.2M vs "a lot of money", 23% vs "significant growth").
- **Show your work.** Include methodology, assumptions, and data sources.
- **Anticipate questions.** Address obvious follow-ups within the document itself.

### Formatting Hierarchy
- **PPTX:** Use section dividers between major topics. Use KPI slides for executive summaries. Use chart slides for data. Use content slides for narrative.
- **DOCX:** H1 for main sections → H2 for subsections → H3 for details. Never skip heading levels.
- **PDF:** Title page, clear sections with headers, professional typography.
- **XLSX:** Descriptive sheet names. Header row on every sheet. Number formatting appropriate to data type.

### When to Include Visual Elements
- **Charts:** Always when presenting 3+ data points or comparisons across categories
- **Tables:** Always when presenting structured data (comparisons, specifications, schedules)
- **KPI slides:** Always for executive summaries, quarterly reviews, status updates
- **Agenda slides:** Always at the start of presentations, or when transitioning between major sections
- **Icons:** Use on title slides, section dividers, and KPI cards for visual polish
- **Images:** Only when relevant — never placeholder images

### Consistent Branding
- Pick ONE theme and use it consistently throughout the presentation
- Keep the same font sizing hierarchy across slides (titles: 24-28pt, body: 14-16pt, captions: 10-12pt)
- Use gradient backgrounds consistently (either all section slides or none)
- Maintain consistent transition effects (pick one and use throughout)
`;

// ---------------------------------------------------------------------------
// Parameter Best Practices
// ---------------------------------------------------------------------------

export const PARAMETER_BEST_PRACTICES = `
## TOOL PARAMETER BEST PRACTICES — Construct professional tool calls

### PPTX Parameter Examples

**Example 1: Executive Dashboard with KPIs**
\`\`\`json
{
  "title": "Q4 2024 Executive Summary",
  "theme": "royal",
  "slides": [
    {
      "layout": "title",
      "title_text": "Q4 2024 Executive Summary",
      "subtitle": "Klawhub Inc. — All Systems Go",
      "icon": "rocket",
      "gradient": { "colors": ["1E1B4B", "6366F1"], "angle": 135 },
      "transition": "fade"
    },
    {
      "layout": "kpi",
      "title_text": "Key Performance Indicators",
      "kpi_items": [
        { "label": "Revenue", "value": "$4.2M", "change": "+18.3%", "trend": "up" },
        { "label": "Active Users", "value": "52,847", "change": "+12.1%", "trend": "up" },
        { "label": "Churn Rate", "value": "2.1%", "change": "-0.8%", "trend": "down" },
        { "label": "NPS Score", "value": "72", "change": "+5", "trend": "up" }
      ]
    },
    {
      "layout": "chart",
      "title_text": "Monthly Revenue Trend",
      "chart_type": "line",
      "chart_data": {
        "labels": ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
        "datasets": [{ "label": "Revenue ($M)", "data": [0.85, 0.92, 1.05, 1.18, 1.32, 1.42] }]
      }
    }
  ]
}
\`\`\`

**Example 2: Agenda + Section Flow**
\`\`\`json
{
  "slides": [
    { "layout": "agenda", "title_text": "Today's Roadmap",
      "agenda_items": [
        { "number": 1, "title": "Market Overview", "description": "Current landscape and competitive position" },
        { "number": 2, "title": "Product Updates", "description": "New features and roadmap" },
        { "number": 3, "title": "Financial Performance", "description": "Q4 results and projections" }
      ]
    },
    { "layout": "section", "title_text": "Market Overview", "icon": "globe", "gradient": { "colors": ["1E3A5F", "0EA5E9"] } }
  ]
}
\`\`\`

**Example 3: Enhanced Table with Merged Cells**
\`\`\`json
{
  "layout": "table",
  "title_text": "Product Comparison",
  "table_data": {
    "headers": ["Feature", "Basic", "Pro", "Enterprise"],
    "rows": [
      ["Users", "5", "25", "Unlimited"],
      ["Storage", "1 GB", "10 GB", "100 GB"],
      ["Support", "Email", "Priority", "Dedicated"]
    ],
    "bold_columns": [0],
    "merges": [{ "row": 0, "col": 3, "rowspan": 1, "colspan": 1 }]
  }
}
\`\`\`

### General Parameter Rules
1. **Always provide a title** — Never leave title_text empty on content/section slides
2. **Use speaker notes** — Add \`notes\` to every slide with talking points
3. **Match chart type to data** — Bar for comparisons, line for trends, pie for parts-of-whole, radar for multi-dimensional, scatter for correlation, bubble for 3-variable comparison
4. **Limit bullet points** — 3-7 items per slide maximum
5. **Use transitions sparingly** — Pick ONE transition type for the entire deck
6. **KPI items: 2-4 cards** — Don't overload the KPI slide
`;

// ---------------------------------------------------------------------------
// Skills Routing Matrix
// ---------------------------------------------------------------------------

export const SKILLS_ROUTING_MATRIX = `
## SKILLS ROUTING MATRIX — Complex Multi-Step Workflows

### Simple Tasks (1 skill + 1 tool call)
| Task | Skill → Tool |
|---|---|
| Create a one-page PDF report | \`pdf\` → \`create_pdf_report\` |
| Create a Word document | \`docx\` → \`create_docx_document\` |
| Create a spreadsheet | \`xlsx\` → \`create_xlsx_spreadsheet\` |
| Create a presentation | \`pptx\` → \`create_pptx_presentation\` |
| Search the web | \`web-search\` → \`web_search\` |
| Read a web page | \`web-reader\` → \`web_reader\` |
| Generate a chart | \`charts\` → \`generate_chart\` |
| Financial data lookup | \`finance\` → \`finance_query\` |

### Multi-Step Workflows (2+ skills + multiple tool calls)

**Workflow 1: Market Research Report**
1. \`web-search\` → Search for market data, competitor info, industry trends
2. \`web-reader\` → Read key articles and reports in full
3. \`contentanalysis\` → Analyze gathered content quality
4. \`xlsx\` → Create supporting data spreadsheet with raw data
5. \`pptx\` → Create executive summary presentation with KPIs + charts
6. \`pdf\` → Create the full written report

**Workflow 2: Quarterly Business Review Deck**
1. \`finance\` → Pull financial data and stock metrics
2. \`web-search\` → Find industry benchmarks and competitor performance
3. \`xlsx\` → Build financial model / data analysis workbook
4. \`pptx\` → Create presentation with: title → agenda → KPI slide → chart slides → table slide → comparison → thank_you
5. Use \`gradient\` and \`icon\` on section dividers for polish
6. Use \`transition: "fade"\` throughout for consistency

**Workflow 3: Blog Post + Social Media Content**
1. \`blog-writer\` → Follow methodology for SEO-optimized long-form content
2. \`contentanalysis\` → Analyze readability and SEO score
3. \`docx\` → Generate the blog post as a formatted document
4. \`charts\` → Create any supporting infographics/charts

**Workflow 4: Academic Literature Review**
1. \`aminer-academic-search\` → Search for papers on the topic
2. \`web-search\` → Find complementary web sources
3. \`web-reader\` → Read key papers in full
4. \`pdf\` → Create structured literature review report

**Workflow 5: Data-Driven Investor Pitch Deck**
1. \`finance\` → Get market data and financial metrics
2. \`web-search\` → Research market size, TAM, SAM, SOM
3. \`xlsx\` → Build financial projections model
4. \`pptx\` → Create 12-15 slide deck:
   - Title (with gradient + icon)
   - Agenda
   - Problem statement (content)
   - Solution overview (content)
   - Market opportunity (KPI slide with TAM/SAM/SOM)
   - Revenue model (chart slide, bar or line)
   - Competitive landscape (comparison)
   - Financial projections (table or chart)
   - Traction (timeline)
   - Team (content)
   - Thank you (gradient + contact info)
`;

// ---------------------------------------------------------------------------
// Skills Awareness Builder — per-agent
// ---------------------------------------------------------------------------

export function getSkillsAwareness(agentId: string): string {
  const skills = AGENT_SKILL_LIST[agentId] ?? "docx, web-search, web-reader";
  const hasDocumentTools = skills.includes("docx") || skills.includes("xlsx") || skills.includes("pdf") || skills.includes("pptx");
  const hasPptx = skills.includes("pptx");

  return `
## SKILLS SYSTEM — MANDATORY PROACTIVE USAGE
You have access to a Skills Library containing pre-built expert methodologies. **You MUST proactively apply skills to EVERY relevant task** — do NOT wait for the user to tell you to use a skill. Automatically detect when a skill applies and use it.

**Your available skills:** ${skills}

### CRITICAL RULE: Auto-Apply Skills
Before starting ANY task, ask yourself: "Is there a skill for this?" If yes, use \`skill_use\` IMMEDIATELY. Do not skip this step.

| Task Type | Auto-Apply This Skill |
|---|---|
| Create Word documents (.docx) | \`skill_use(skill_name="docx")\` → then call \`create_docx_document\` |
| Create Excel spreadsheets (.xlsx) | \`skill_use(skill_name="xlsx")\` → then call \`create_xlsx_spreadsheet\` |
| Create PDF documents | \`skill_use(skill_name="pdf")\` → then call \`create_pdf_report\` |
| Create PowerPoint presentations | \`skill_use(skill_name="pptx")\` → then call \`create_pptx_presentation\` |
| Create charts, graphs, diagrams | \`skill_use(skill_name="charts")\` → then call \`generate_chart\` |
| Search the web for information | \`skill_use(skill_name="web-search")\` → then call \`web_search\` |
| Read/extract content from web pages | \`skill_use(skill_name="web-reader")\` → then call \`web_reader\` |
| Use AI chat/completions | \`skill_use(skill_name="llm")\` → then call \`llm_chat\` |
| Financial/market data | \`skill_use(skill_name="finance")\` → then call \`finance_query\` |
| Academic paper search | \`skill_use(skill_name="aminer-academic-search")\` → then call \`academic_search\` |
| Analyze content quality/SEO | \`skill_use(skill_name="contentanalysis")\` → then call \`content_analyze\` |
| Write blog posts | \`skill_use(skill_name="blog-writer")\` → follow methodology + call \`create_docx_document\` |
| SEO content writing | \`skill_use(skill_name="seo-content-writer")\` → follow methodology + call \`create_docx_document\` |

### How to Use Skills
1. \`skill_use(skill_name="<name>")\` — loads the skill's full prompt template, methodology, AND the execution tool to call
2. The skill response includes \`execution_tool\` — this is the ACTUAL TOOL you must call to execute the task
3. The skill response includes \`execution_params_hint\` — this tells you what parameters to provide
4. Follow the methodology from the skill's prompt_template, then call the execution_tool with the right parameters
5. For methodological skills (blog-writer, seo, etc.), use the methodology to guide your content, then call the execution_tool to produce the file
6. \`skill_list(search="<keyword>")\` — if unsure which skill applies, search for one
7. \`skill_rate\` — rate the skill's performance after use (1-5)

### Workflow
For EVERY task: first call \`skill_use\` with the most relevant skill, then call the \`execution_tool\` it returns to actually produce the output. The skill gives you the methodology, the execution_tool produces the result. This is NOT optional — it is how you ensure professional-quality output.

${hasDocumentTools ? DOCUMENT_TOOL_REFERENCE : ""}

${hasPptx ? PARAMETER_BEST_PRACTICES : ""}

${DOCUMENT_QUALITY_STANDARDS}

${SKILLS_ROUTING_MATRIX}
`;
}
