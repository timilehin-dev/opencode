// ---------------------------------------------------------------------------
// Skill Library Tools
// ---------------------------------------------------------------------------
import { z, tool, zodSchema, safeJson, safeParseRes, getSelfBaseUrl, getSelfFetchHeaders, query } from "./shared";

// ---------------------------------------------------------------------------
// Skills Tools — Phase 6A: Skill Library Foundation
// ---------------------------------------------------------------------------

export const skillListTool = tool({
  description: "List available skills in the skill library. Supports filtering by category, search query, or agent compatibility. Returns skill names, descriptions, categories, performance scores, and required tools.",
  inputSchema: zodSchema(z.object({
    search: z.string().optional().describe("Search query to filter skills by name or description"),
    category: z.string().optional().describe("Filter by category (research, code, communication, data, planning, ops, content)"),
    agent: z.string().optional().describe("Filter to skills available for a specific agent ID"),
  })),
  execute: safeJson(async ({ search, category, agent }) => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (category) params.set("category", category);
    if (agent) params.set("agent", agent);
    const res = await fetch(`${getSelfBaseUrl()}/api/skills?${params.toString()}`, {
      headers: getSelfFetchHeaders(),
    });
    return await safeParseRes(res);
  }),
});

// ---------------------------------------------------------------------------
// Skill-to-Tool Mapping — bridges skills to executable tools
// ---------------------------------------------------------------------------

const SKILL_TOOL_MAP: Record<string, { tool: string; description: string; params_hint: string }> = {
  // Document Creation
  pdf: { tool: "create_pdf_report", description: "Create professional PDF documents with formatted headers, tables, code blocks, lists, and more", params_hint: "Provide title (string) and content (markdown string)" },
  docx: { tool: "create_docx_document", description: "Create professional Word documents with rich formatting", params_hint: "Provide title (string) and content (markdown string)" },
  xlsx: { tool: "create_xlsx_spreadsheet", description: "Create Excel spreadsheets with multiple sheets, formatting, and formulas", params_hint: "Provide title (string) and sheets (array of {name, headers, rows})" },
  pptx: { tool: "create_pptx_presentation", description: "Create PowerPoint presentations with multiple slides, layouts, and speaker notes", params_hint: "Provide title (string) and slides (array of {layout, title_text, body_items, notes})" },
  ppt: { tool: "create_pptx_presentation", description: "Create PowerPoint presentations (alias for pptx)", params_hint: "Provide title (string) and slides (array of {layout, title_text, body_items, notes})" },
  // Data Visualization
  charts: { tool: "generate_chart", description: "Generate charts, graphs, and diagrams (bar, line, pie, scatter, mermaid, table)", params_hint: "Provide chart_type, title, data (JSON string)" },
  // Web Tools
  "web-search": { tool: "web_search", description: "Search the web for real-time information (Tavily + DuckDuckGo + Wikipedia + Brave)", params_hint: "Provide query (string) and optional num_results" },
  "web-reader": { tool: "web_reader", description: "Read and extract content from web pages using cheerio HTML parser", params_hint: "Provide url (string)" },
  "multi-search-engine": { tool: "web_search_advanced", description: "Advanced multi-engine web search with AI answer synthesis", params_hint: "Provide query (string) for deep search results" },
  // AI/ML Tools
  llm: { tool: "llm_chat", description: "Send messages to AI language model (Ollama) for text generation, analysis, brainstorming", params_hint: "Provide messages (array of {role, content})" },
  // Code Execution
  "coding-agent": { tool: "code_execute", description: "Execute code in Judge0 CE sandbox — JS, Python, TS, Go, Rust, Java, C++, Ruby, PHP, Swift, Kotlin, R, SQL, Bash", params_hint: "Provide code (string) and language" },
  "fullstack-dev": { tool: "code_execute", description: "Full-stack web development using code execution sandbox", params_hint: "Provide code for web development tasks" },
  // Finance (Yahoo Finance — FREE, no API key)
  finance: { tool: "finance_query", description: "Query financial data — stock prices, historical data, market news, company info via Yahoo Finance", params_hint: "Provide query_type (stock_price/historical_data/market_news/company_info), optional symbol" },
  "stock-analysis-skill": { tool: "finance_query", description: "Analyze stocks using Yahoo Finance data", params_hint: "Use query_type='stock_price' or 'company_info', provide symbol" },
  // Academic Research (Semantic Scholar — FREE, no API key)
  "aminer-academic-search": { tool: "academic_search", description: "Search academic papers via Semantic Scholar API", params_hint: "Provide query (string), optional search_type and num_results" },
  "aminer-daily-paper": { tool: "academic_search", description: "Get daily paper recommendations via Semantic Scholar", params_hint: "Provide query (string) describing research interests" },
  "aminer-open-academic": { tool: "academic_search", description: "Open academic search via Semantic Scholar", params_hint: "Provide query (string)" },
  // Content Analysis
  contentanalysis: { tool: "content_analyze", description: "Analyze content for readability, sentiment, SEO, keywords, structure", params_hint: "Provide content (string) and optional analysis_type" },
  // Content Creation (methodological — use docx/pdf tools with methodology)
  "blog-writer": { tool: "create_docx_document", description: "Write blog posts — use skill methodology + docx tool for output", params_hint: "Follow blog-writer methodology from prompt_template, then create with create_docx_document" },
  "seo-content-writer": { tool: "create_docx_document", description: "Write SEO-optimized content — use methodology + docx tool for output", params_hint: "Follow seo-content-writer methodology, then create with create_docx_document" },
  "content-strategy": { tool: "create_docx_document", description: "Develop content strategy — methodology + docx tool for output", params_hint: "Follow content-strategy methodology, then create strategy document with create_docx_document" },
  "market-research-reports": { tool: "create_pdf_report", description: "Create market research reports — use methodology + PDF tool", params_hint: "Follow methodology, research with web_search, then create with create_pdf_report" },
  // Browser & Extraction
  "agent-browser": { tool: "web_reader", description: "Browser automation — read web pages and extract content", params_hint: "Provide url (string) to read page content" },
  "web-shader-extractor": { tool: "web_reader", description: "Extract WebGL/Canvas shader code from web pages", params_hint: "Provide url (string) of the page to extract from" },
  // Specialized Skills
  "interview-designer": { tool: "create_docx_document", description: "Design interview guides — methodology + docx output", params_hint: "Follow interview-designer methodology, then create with create_docx_document" },
  "skill-creator": { tool: "skill_create", description: "Create new skills for the skill library", params_hint: "Provide name, display_name, description, category, prompt_template" },
  "skill-vetter": { tool: "skill_inspect", description: "Vet and inspect skills for quality and security", params_hint: "Provide skill_name or skill_id to inspect" },
  "writing-plans": { tool: "create_docx_document", description: "Create writing plans — methodology + docx output", params_hint: "Follow writing-plans methodology, then create plan document" },
  "anti-pua": { tool: "create_docx_document", description: "Anti-PUA analysis — methodology + docx output", params_hint: "Follow anti-pua methodology" },
  "qingyan-research": { tool: "web_search", description: "Deep research tool — uses web search + web reader for comprehensive research", params_hint: "Use web_search for research, then web_reader for detailed content" },
  "auto-target-tracker": { tool: "create_xlsx_spreadsheet", description: "Track targets/goals — methodology + xlsx output", params_hint: "Follow methodology, then create tracker with create_xlsx_spreadsheet" },
  // Design (methodological — uses docx/pdf for output)
  "ui-ux-pro-max": { tool: "create_docx_document", description: "UI/UX design guidance — methodology + docx output", params_hint: "Follow ui-ux methodology, create design doc with create_docx_document" },
  "visual-design-foundations": { tool: "create_docx_document", description: "Visual design foundations — methodology + docx output", params_hint: "Follow design methodology, create guidelines with create_docx_document" },
  "storyboard-manager": { tool: "create_docx_document", description: "Storyboard management — methodology + docx output", params_hint: "Follow storyboard methodology, create with create_docx_document" },
  // Podcast & Media
  "podcast-generate": { tool: "create_docx_document", description: "Generate podcast scripts — methodology + docx output", params_hint: "Follow podcast methodology, create script with create_docx_document" },
  // Marketing
  "marketing-mode": { tool: "create_docx_document", description: "Marketing content — methodology + docx output", params_hint: "Follow marketing methodology, create content with create_docx_document" },
  // Finance research (uses academic + finance tools)
  "ai-news-collectors": { tool: "web_search", description: "Collect AI news — uses web search", params_hint: "Search for latest AI news with web_search" },
};

export const skillUseTool = tool({
  description: "Apply a skill's prompt template and workflow to enhance task execution. Returns the skill methodology AND the specific execution tool to call for actually performing the task. Always call the returned execution_tool after getting the skill methodology.",
  inputSchema: zodSchema(z.object({
    skill_name: z.string().describe("The name of the skill to use (e.g., 'pdf', 'docx', 'xlsx', 'charts', 'web-search', 'llm', 'finance', 'blog-writer')"),
    context: z.string().optional().describe("Optional context about the current task to customize the skill application"),
  })),
  execute: safeJson(async ({ skill_name, context }) => {
    // Single optimized query with fallback chain (exact → slug → fuzzy)
    const result = await query(
      `SELECT * FROM skills WHERE is_active = true AND (
        name = $1 OR slug = $1 OR name ILIKE $2 OR display_name ILIKE $2 OR slug ILIKE $2
      ) ORDER BY
        CASE WHEN name = $1 THEN 0 WHEN slug = $1 THEN 1 ELSE 2 END
      LIMIT 1`,
      [skill_name, `%${skill_name}%`]
    );
    if (result.rows.length > 0) {
      const skill = result.rows[0];
      // Fast lookup: try exact match first, then substring match
      let toolMapping = SKILL_TOOL_MAP[skill.name] || SKILL_TOOL_MAP[skill.slug!];
      if (!toolMapping) {
        for (const key of Object.keys(SKILL_TOOL_MAP)) {
          if (skill.name.includes(key) || skill.slug?.includes(key)) {
            toolMapping = SKILL_TOOL_MAP[key];
            break;
          }
        }
      }

      return {
        success: true,
        skill_name: skill.name,
        display_name: skill.display_name,
        prompt_template: skill.prompt_template,
        workflow_steps: skill.workflow_steps,
        required_tools: skill.required_tools,
        difficulty: skill.difficulty,
        performance_score: skill.performance_score,
        context_applied: context || null,
        execution_tool: toolMapping?.tool || null,
        execution_description: toolMapping?.description || null,
        execution_params_hint: toolMapping?.params_hint || null,
        action_required: toolMapping
          ? `IMPORTANT: After reading this skill's methodology, call the '${toolMapping.tool}' tool to actually execute the task. ${toolMapping.params_hint}`
          : "This is a methodological skill. Follow the workflow steps above to complete the task using your available tools.",
      };
    }
    return { success: false, error: `Skill '${skill_name}' not found. Use skill_list to see available skills.` };
  }),
});

export const skillCreateTool = tool({
  description: "Create a new custom skill in the skill library. Define a reusable prompt template and workflow that agents can apply to future tasks. Custom skills can be rated and evolve based on performance feedback.",
  inputSchema: zodSchema(z.object({
    name: z.string().describe("Unique skill name (snake_case, e.g., 'my_custom_skill')"),
    display_name: z.string().describe("Human-readable skill name (e.g., 'My Custom Skill')"),
    description: z.string().describe("Clear description of what the skill does and when to use it"),
    category: z.string().optional().describe("Category: research, code, communication, data, planning, ops, content, general"),
    difficulty: z.string().optional().describe("Difficulty level: beginner, intermediate, advanced, expert"),
    prompt_template: z.string().describe("The prompt template that guides the agent when using this skill"),
    workflow_steps: z.array(z.string()).optional().describe("Ordered list of workflow step descriptions"),
    required_tools: z.array(z.string()).optional().describe("List of tool names required by this skill"),
    tags: z.array(z.string()).optional().describe("Tags for searchability"),
  })),
  execute: safeJson(async ({ name, display_name, description, category, difficulty, prompt_template, workflow_steps, required_tools, tags }) => {
    const res = await fetch(`${getSelfBaseUrl()}/api/skills`, {
      method: "POST",
      headers: getSelfFetchHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ name, display_name, description, category, difficulty, prompt_template, workflow_steps, required_tools, tags }),
    });
    return await safeParseRes(res);
  }),
});

export const skillEquipTool = tool({
  description: "Equip or unequip skills for a specific agent. When a skill is equipped, the agent can discover and use it. Use this to customize which skills each agent has access to.",
  inputSchema: zodSchema(z.object({
    agent_id: z.string().describe("The agent ID to equip skills for (e.g., 'general', 'mail', 'code', 'data', 'research', 'ops', 'creative')"),
    skill_ids: z.array(z.string()).optional().describe("Skill UUIDs to equip"),
    unequip_skill_ids: z.array(z.string()).optional().describe("Skill UUIDs to unequip"),
  })),
  execute: safeJson(async ({ agent_id, skill_ids, unequip_skill_ids }) => {
    const res = await fetch(`${getSelfBaseUrl()}/api/agent-skills`, {
      method: "POST",
      headers: getSelfFetchHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ agent_id, skill_ids, unequip_skill_ids }),
    });
    return await safeParseRes(res);
  }),
});

export const skillRateTool = tool({
  description: "Rate a skill's performance after using it. Ratings (1-5) help improve the skill library by tracking quality and guiding future skill selection. Rate 4-5 for excellent results, 3 for adequate, 1-2 for poor.",
  inputSchema: zodSchema(z.object({
    skill_id: z.string().describe("The UUID of the skill to rate"),
    agent_id: z.string().describe("Your agent ID"),
    rating: z.number().min(1).max(5).describe("Rating from 1 (poor) to 5 (excellent)"),
    feedback: z.string().optional().describe("Optional text feedback about the skill's performance"),
  })),
  execute: safeJson(async ({ skill_id, agent_id, rating, feedback }) => {
    const res = await fetch(`${getSelfBaseUrl()}/api/skills/rate`, {
      method: "POST",
      headers: getSelfFetchHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ skill_id, agent_id, rating, feedback }),
    });
    return await safeParseRes(res);
  }),
});

export const skillInspectTool = tool({
  description: "Get detailed information about a specific skill including its full prompt template, workflow steps, required tools, performance metrics, and usage history. Use this before deciding whether to apply a skill.",
  inputSchema: zodSchema(z.object({
    skill_id: z.string().describe("The UUID of the skill to inspect"),
  })),
  execute: safeJson(async ({ skill_id }) => {
    const res = await fetch(`${getSelfBaseUrl()}/api/skills/${skill_id}`, {
      headers: getSelfFetchHeaders(),
    });
    return await safeParseRes(res);
  }),
});

export const skillEvaluateTool = tool({
  description: "Evaluate a skill's execution quality using structured multi-dimensional assessment. Use this after applying a skill to assess how well it performed across relevance, accuracy, completeness, clarity, and efficiency.",
  inputSchema: zodSchema(z.object({
    skill_id: z.string().describe("The UUID of the skill to evaluate"),
    agent_id: z.string().describe("Your agent ID"),
    task_id: z.string().optional().describe("Optional task ID for tracking"),
    input_summary: z.string().describe("Summary of what the user asked for"),
    output_summary: z.string().describe("Summary of what the skill produced"),
    success: z.boolean().optional().describe("Whether the skill execution was successful"),
  })),
  execute: safeJson(async ({ skill_id, agent_id, task_id, input_summary, output_summary, success }) => {
    const res = await fetch(`${getSelfBaseUrl()}/api/skills/evaluate`, {
      method: "POST",
      headers: getSelfFetchHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ skill_id, agent_id, task_id, input_summary, output_summary, success }),
    });
    return await safeParseRes(res);
  }),
});

// ---------------------------------------------------------------------------
// Phase 6C: Skill Evolution & Rollback Tools
// ---------------------------------------------------------------------------

export const skillEvolveTool = tool({
  description: "Evolve and improve a skill based on past evaluation feedback. The system will analyze weaknesses and rewrite the skill's prompt template to be more effective. Use this when a skill has been evaluated multiple times and needs improvement.",
  inputSchema: zodSchema(z.object({
    skill_id: z.string().describe("The UUID of the skill to evolve"),
    agent_id: z.string().describe("Your agent ID for tracking"),
  })),
  execute: safeJson(async ({ skill_id, agent_id }) => {
    const res = await fetch(`${getSelfBaseUrl()}/api/skills/evolve`, {
      method: "POST",
      headers: getSelfFetchHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ skill_id, agent_id }),
    });
    return await safeParseRes(res);
  }),
});

export const skillRollbackTool = tool({
  description: "Roll back a skill to a previous version if an evolution made it worse. Requires the evolution_id from the evolution timeline. Use this to undo a bad skill evolution.",
  inputSchema: zodSchema(z.object({
    skill_id: z.string().describe("The UUID of the skill to roll back"),
    evolution_id: z.string().describe("The evolution record ID to roll back to"),
  })),
  execute: safeJson(async ({ skill_id, evolution_id }) => {
    const res = await fetch(`${getSelfBaseUrl()}/api/skills/rollback`, {
      method: "POST",
      headers: getSelfFetchHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ skill_id, evolution_id }),
    });
    return await safeParseRes(res);
  }),
});

// ---------------------------------------------------------------------------
// Phase 7A: Hybrid Skill Retrieval Tools
// ---------------------------------------------------------------------------

export const skillSearchHybridTool = tool({
  description: "Search skills using hybrid vector + keyword retrieval. Combines semantic similarity (pgvector) with TF-IDF keyword matching, reranked using Reciprocal Rank Fusion. Returns the best matching skills with match method indicators.",
  inputSchema: zodSchema(z.object({
    query: z.string().describe("Search query describing the desired skill"),
    top_k: z.number().optional().describe("Number of results to return (default: 10)"),
  })),
  execute: safeJson(async ({ query, top_k }) => {
    const res = await fetch(`${getSelfBaseUrl()}/api/skills/search`, {
      method: "POST",
      headers: getSelfFetchHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ query, top_k: top_k || 10 }),
    });
    return await safeParseRes(res);
  }),
});

export const skillRefreshEmbeddingsTool = tool({
  description: "Regenerate embeddings for all skills (or a specific skill). Use this after adding new skills or updating skill content. Embeddings enable vector similarity search for better skill matching.",
  inputSchema: zodSchema(z.object({
    skill_id: z.string().optional().describe("Optional: regenerate embedding for just one skill (UUID)"),
  })),
  execute: safeJson(async ({ skill_id }) => {
    const body: Record<string, unknown> = {};
    if (skill_id) body.skill_id = skill_id;
    const res = await fetch(`${getSelfBaseUrl()}/api/skills/embeddings`, {
      method: "POST",
      headers: getSelfFetchHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    return await safeParseRes(res);
  }),
});

export const skillEmbeddingSetupTool = tool({
  description: "Initialize pgvector extension and add embedding columns to the skills table. Run this once before generating embeddings. Idempotent — safe to run multiple times.",
  inputSchema: zodSchema(z.object({})),
  execute: safeJson(async () => {
    const res = await fetch(`${getSelfBaseUrl()}/api/skills/embeddings/setup`, {
      method: "POST",
      headers: getSelfFetchHeaders({ "Content-Type": "application/json" }),
    });
    return await safeParseRes(res);
  }),
});


