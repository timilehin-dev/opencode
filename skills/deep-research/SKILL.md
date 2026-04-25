---
name: deep-research
description: "Conduct comprehensive multi-source research with structured synthesis. Covers competitive analysis, market research, literature reviews, technical deep-dives, and investigative research with proper source attribution and fact verification."
tags: [research, analysis, competitive, market, productivity]
version: "1.0.0"
license: MIT
metadata:
  author: Klawhub
  category: productivity
  difficulty: advanced
  tools: [web-search, web-reader, pdf, docx, xlsx, charts]
---

# Deep Research — Comprehensive Multi-Source Research

## Purpose
Systematically investigate topics using multiple sources, synthesize findings into structured insights, and produce actionable deliverables. This skill provides a rigorous research methodology that goes beyond surface-level search results.

## When to Activate
- User asks for comprehensive research on a topic
- Competitive analysis, market research, or landscape analysis needed
- Literature reviews or technology assessments required
- User says "research," "investigate," "analyze the market," "compare options"
- Due diligence on technologies, companies, or strategies
- Any request requiring structured multi-source investigation

## Research Methodology

### Phase 1: Research Planning (Mandatory First Step)

Before any searching, define:

1. **Research Question** — One clear question that the research must answer
2. **Scope Boundaries** — What's in scope and what's explicitly out of scope
3. **Depth Target** — How deep to go (overview, moderate, deep-dive)
4. **Output Format** — Report, brief, comparison table, presentation
5. **Success Criteria** — What would make this research complete and useful

Example:
```
Research Question: "Which backend framework is best suited for a real-time collaboration SaaS targeting enterprise?"
Scope: React/Next.js frontend already decided. Focus on Node.js, Python, Go, Rust options.
Depth: Deep-dive — include benchmarks, community health, hiring market, migration stories.
Output: Comparison report with recommendation matrix.
```

### Phase 2: Source Discovery

Execute searches using multiple query strategies:

**Query Rotation Pattern:**
1. Primary query — direct phrasing of the research question
2. Comparison query — "X vs Y vs Z [context]"
3. Opinion query — "X review [year]" or "problems with X"
4. Data query — "X benchmark" or "X statistics"
5. Community query — "X Reddit" or "X experience" or "X Stack Overflow"

**Source Tiering:**
- Tier 1 (Primary): Official documentation, academic papers, regulatory filings, earnings reports
- Tier 2 (Secondary): Reputable tech publications, analyst reports, established blogs
- Tier 3 (Tertiary): Community forums, social media, personal blogs (use for sentiment only)

**Minimum Source Requirements:**
- Overview: 5-8 sources
- Moderate: 10-15 sources
- Deep-dive: 20+ sources across all tiers

### Phase 3: Information Extraction

For each relevant source found:

1. **Capture** — Extract key facts, statistics, quotes, and data points
2. **Verify** — Cross-reference claims across at least 2 sources
3. **Classify** — Tag as: fact, opinion, statistic, projection, anecdote
4. **Date-stamp** — Note when the information was published (stale data warning for >2 years)

**Extraction Template per Source:**
```
Source: [URL or citation]
Published: [date]
Reliability: [high/medium/low]
Key Findings:
- [finding 1]
- [finding 2]
Relevance: [how it answers the research question]
```

### Phase 4: Synthesis & Analysis

Organize findings into a structured analysis:

1. **Executive Summary** — 3-5 sentences answering the research question directly
2. **Key Findings** — Grouped by theme, each with supporting evidence
3. **Comparison Matrix** (if applicable) — Side-by-side evaluation of options
4. **Gap Analysis** — What information is missing or conflicting
5. **Confidence Assessment** — How confident are we in the findings (high/medium/low)
6. **Recommendations** — Actionable next steps based on findings

### Phase 5: Deliverable Creation

Produce the output in the requested format:
- **Reports** — Use `pdf` or `docx` skill for formal documents
- **Data Tables** — Use `xlsx` skill for comparison matrices and raw data
- **Visualizations** — Use `charts` skill for trend analysis and comparisons
- **Presentations** — Use `pptx` skill for stakeholder briefings

## Research Types

### Competitive Analysis
```
Framework:
1. Identify competitors (direct, indirect, emerging)
2. For each competitor:
   - Product/service overview
   - Pricing model
   - Target market
   - Strengths and weaknesses
   - Recent news/funding/milestones
3. Market positioning map
4. Feature comparison matrix
5. SWOT analysis per competitor
6. Strategic implications
```

### Market Research
```
Framework:
1. Market size (TAM/SAM/SOM)
2. Growth trends and projections
3. Key market drivers
4. Customer segments and pain points
5. Competitive landscape summary
6. Regulatory environment
7. Technology enablers
8. Barriers to entry
9. Opportunity assessment
10. Risk factors
```

### Technology Assessment
```
Framework:
1. Technology overview and maturity
2. Architecture and approach
3. Performance characteristics (with benchmarks)
4. Community and ecosystem health
5. Enterprise readiness
6. Learning curve and hiring market
7. Known limitations and trade-offs
8. Roadmap and future direction
9. Case studies and production usage
10. Recommendation with rationale
```

### Literature Review
```
Framework:
1. Research question refinement
2. Search strategy documentation
3. Inclusion/exclusion criteria
4. Source quality assessment
5. Thematic analysis of findings
6. Methodology comparison across studies
7. Knowledge gaps identification
8. Areas for future research
9. Bibliography with annotations
```

## Fact Verification Rules

1. **Numbers must be sourced** — Every statistic needs a citation
2. **Claims must be corroborated** — Unsupported claims are flagged as "unverified"
3. **Dates matter** — Always note when data was collected/published
4. **Conflicts must be noted** — When sources disagree, present both sides
5. **Projections must be labeled** — Clearly distinguish facts from predictions
6. **Sponsored content flagged** — Mark potential bias from sponsored or affiliate content

## Output Quality Standards

- Executive summary must answer the research question in the first paragraph
- Every claim must have at least one source citation
- Comparison tables must use consistent evaluation criteria
- Recommendations must be supported by the evidence presented
- Gaps and uncertainties must be explicitly stated
- The reader should be able to make a decision based on the deliverable alone
