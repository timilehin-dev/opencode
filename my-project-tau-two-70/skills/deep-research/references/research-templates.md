# Research Templates

Ready-to-use templates for each major research type. Each template includes
section-by-section guidance so you know exactly what to fill in and why.

---

## Template 1: Competitive Analysis

**Purpose:** Understand the competitive landscape around a product, company,
or technology. Produces actionable strategic intelligence.

**When to use:** Entering a new market, preparing a pitch deck, building a
product roadmap, responding to a competitor's move.

---

### 1. Executive Summary

Write this section **last**. It should be a 150-250 word distillation of the
entire analysis.

**Guidance:**

- State the scope: which market/segment and which competitors are covered.
- Summarize the top 2-3 strategic findings in plain language.
- Name the single most important implication for the reader's organization.
- Include a one-line "bottom line" recommendation if one exists.

**Template:**

```
[Market/Segment] is a [size estimate] market growing at [rate]. We analyzed
[N] competitors: [list names]. Key findings: [finding 1], [finding 2],
[finding 3]. The most significant strategic implication is [implication].

Bottom line: [one actionable recommendation].
```

---

### 2. Competitor Profiles

Create one profile per competitor. Order them by relevance (not alphabetically).

**Guidance for each profile:**

| Field | What to fill in |
|---|---|
| Company overview | Founded year, HQ location, funding stage, employee count, parent company if any. |
| Core value proposition | Their one-sentence pitch — use their own language, not your interpretation. |
| Target customers | Primary persona(s) they sell to. Include company size, geography, industry if relevant. |
| Revenue / financials | Latest available revenue, growth rate, profitability status. Note the source and date. |
| Key products / services | List the 2-4 most relevant offerings with brief descriptions. |
| Distribution model | Direct sales, self-serve, channel partners, marketplace, etc. |
| Recent strategic moves | Funding rounds, acquisitions, leadership changes, product launches in the last 12-18 months. |
| Known strengths | Honest assessment — what do they do better than most? |
| Known weaknesses | Honest assessment — where do customers or reviewers complain? |

**Template:**

```markdown
### [Competitor Name]

- **Overview:** [Founded] | [HQ] | [Employees] | [Funding: stage, amount if known]
- **Value Proposition:** "[Their tagline or core pitch]"
- **Target Customers:** [Description of primary buyer persona]
- **Financials:** [Revenue / growth / profitability — cite source]
- **Key Offerings:**
  1. [Product A] — [Brief description]
  2. [Product B] — [Brief description]
- **Distribution:** [How they go to market]
- **Recent Moves:**
  - [Date]: [Move] — [Why it matters]
- **Strengths:** [2-3 bullet points]
- **Weaknesses:** [2-3 bullet points]
```

---

### 3. Feature Comparison Matrix

Create a table comparing the top features/capabilities across all analyzed
competitors, plus your own product if applicable.

**Guidance:**

- Limit to 8-12 features maximum — focus on what customers actually care about.
- Use a simple rating system: ✅ Full support, ⚠️ Partial/limited, ❌ Not available, or use a 1-5 scale.
- Add a "Differentiator" column highlighting which features are unique to each competitor.
- Note: feature availability can change rapidly; include the date you verified each entry.

**Template:**

```
| Feature / Capability     | Your Product | Competitor A | Competitor B | Competitor C |
|--------------------------|:------------:|:------------:|:------------:|:------------:|
| [Feature 1]              | ✅/⚠️/❌     | ✅/⚠️/❌     | ✅/⚠️/❌     | ✅/⚠️/❌     |
| [Feature 2]              |              |              |              |              |
| [Feature 3]              |              |              |              |              |
| ...                      |              |              |              |              |

*Verified: [Date]* | *Method: [How verified — website, trial, analyst report, etc.]*
```

---

### 4. Pricing Comparison

Document pricing models side by side. Pricing data is often incomplete — be
transparent about gaps.

**Guidance:**

- Include pricing model type: per-seat, usage-based, freemium, enterprise-custom, etc.
- Note billing frequency: monthly vs. annual (annual is usually discounted).
- List what's included in each tier (feature gates, support levels, SLAs).
- Flag hidden costs: implementation fees, training, data egress, add-on modules.
- If pricing is not public, state "Not publicly listed — obtained via [method/source]."

**Template:**

```
| Competitor     | Pricing Model   | Entry Tier (price/mo) | Mid Tier (price/mo) | Enterprise (price/mo) | Free Tier? |
|----------------|-----------------|----------------------|---------------------|-----------------------|:----------:|
| Competitor A   | [model]         | $[X] ([features])    | $[Y] ([features])   | $[Z] ([features])     | Yes/No     |
| Competitor B   | [model]         |                      |                     |                       |            |
| Your Product   | [model]         |                      |                     |                       |            |

Notes:
- Competitor A: [Hidden costs, contract requirements, etc.]
- Competitor B: [Not publicly listed — estimate based on G2 reviews]
```

---

### 5. Market Positioning Map

A 2x2 or 2x3 visual matrix placing competitors along two strategic axes.

**Guidance:**

- Choose axes that matter for buyer decisions. Common choices:
  - Price (low ↔ high) × Feature depth (basic ↔ comprehensive)
  - Ease of use ↔ Customizability
  - SMB focus ↔ Enterprise focus × Best-of-breed ↔ All-in-one
- Place each competitor (and your product) on the map.
- Provide a text description of each quadrant: who sits there, what it means.
- Note movement trends: "Competitor B is moving from [quadrant] toward [quadrant]."

**Template (text-based):**

```
                    [High Axis Label]
                          |
              Q2          |          Q1
        [Description]     |     [Description]
           • Comp B       |        • Comp A
                          |
  [Low Axis Label] -------+------- [High Axis Label]
                          |
              Q3          |          Q4
        [Description]     |     [Description]
           • Your Co.     |        • Comp C
                          |
                    [Low Axis Label]

Key insight: [What the positioning reveals about market gaps or your opportunity]
```

---

### 6. SWOT per Competitor

Create a SWOT analysis for each major competitor. Strengths and Weaknesses are
internal; Opportunities and Threats are external market factors.

**Guidance:**

- Be specific — avoid vague entries like "strong brand." Say "strong brand
  recognition among Fortune 500 CIOs, per Gartner 2024 survey."
- Limit to 3-5 items per quadrant.
- Differentiate from your own SWOT: this is about *their* position.
- Opportunities and Threats should be shared market factors viewed from their
  perspective.

**Template:**

```markdown
### SWOT: [Competitor Name]

| Strengths | Weaknesses |
|-----------|-----------|
| [Specific strength with evidence] | [Specific weakness with evidence] |
| | |
| | |

| Opportunities | Threats |
|---------------|---------|
| [Market opportunity they could exploit] | [External threat to their position] |
| | |
| | |
```

---

### 7. Strategic Implications

Translate all analysis into actionable recommendations. This is the "so what?"

**Guidance:**

- Address the reader's organization directly: "Given [our] current position..."
- Provide 3-5 prioritized recommendations ranked by impact and feasibility.
- For each recommendation, state: what to do, why, expected outcome, and risk level.
- Include a "watch list" of competitor moves to monitor going forward.
- Attach a confidence level to each recommendation (high / medium / low) based on
  the quality of underlying data.

**Template:**

```
1. **[Recommendation]** — [Priority: High/Medium/Low] — [Confidence: High/Medium/Low]
   - Action: [What specifically to do]
   - Rationale: [Why, based on evidence above]
   - Expected outcome: [What success looks like]
   - Risk: [What could go wrong]

2. **[Recommendation]** — ...

Competitor Watch List:
- [Competitor]: Monitor [specific development] — check every [timeframe]
- [Competitor]: Watch for [signal] — indicates [strategic shift]

Information gaps that limit confidence:
- [Gap 1]: [How to resolve — e.g., "schedule analyst call" or "wait for next earnings"]
- [Gap 2]: ...
```

---
---

## Template 2: Market Research

**Purpose:** Quantify and characterize a market opportunity. Provides the
data foundation for business cases, investment decisions, and go-to-market
strategy.

**When to use:** Evaluating a new market, building a business case, preparing
for fundraising, informing product strategy.

---

### 1. Market Sizing (TAM / SAM / SOM)

**Guidance:**

- **TAM (Total Addressable Market):** The total demand for the product/service
  if 100% market share were achieved. Use top-down (industry reports, census
  data) and bottom-up (price × quantity for each segment) approaches. When they
  diverge, present both and explain the gap.
- **SAM (Serviceable Addressable Market):** The portion of TAM you can
  realistically reach given your geography, business model, and channel. Define
  the filters you apply and why.
- **SOM (Serviceable Obtainable Market):** The portion of SAM you can
  realistically capture in 1-3 years given competition, resources, and timing.
  Anchor this with analogies to similar companies' early growth.
- Always state assumptions explicitly. Always cite sources with dates.
- Provide year-over-year projections for 3-5 years, noting the methodology
  (CAGR from analyst reports, bottom-up build, etc.).

**Template:**

```
Market Size (Current Year):

| Metric | Value | Source | Methodology |
|--------|-------|--------|-------------|
| TAM    | $[X]B | [Source, date] | [Top-down / Bottom-up / Hybrid] |
| SAM    | $[X]B | Derived from TAM with filters: [list] |
| SOM    | $[X]M | Based on: [analogies, resource constraints, timeline] |

Key Assumptions:
1. [Assumption] — Sensitivity: if this changes by ±X%, TAM changes by ±Y%.
2. [Assumption] — ...

Projected Growth:

| Year | TAM | SAM | SOM | Growth Rate (YoY) |
|------|-----|-----|-----|-------------------|
| [Y]  |     |     |     |                   |
| [Y+1]|     |     |     |                   |
| [Y+3]|     |     |     |                   |

Methodology: [CAGR based on Source A / Bottom-up unit model / Combination]
Confidence level: [High / Medium / Low] — Caveats: [list]
```

---

### 2. Growth Trends

**Guidance:**

- Identify 3-5 macro trends driving or inhibiting growth.
- Distinguish between cyclical and structural trends.
- For each trend, provide: description, evidence (data points with sources),
  direction (accelerating / stable / decelerating), and impact on the market.
- Include both quantitative trends (market size, adoption rates) and qualitative
  shifts (buyer behavior changes, regulatory sentiment).

**Template:**

```markdown
### Trend 1: [Trend Name]

- **Description:** [2-3 sentence explanation]
- **Evidence:** [Data points with citations]
- **Direction:** Accelerating / Stable / Decelerating / Emerging
- **Impact on Market:** [How this trend changes market dynamics]
- **Time Horizon:** [Short-term (<1yr) / Medium (1-3yr) / Long-term (3yr+)]

### Trend 2: [Trend Name]
...
```

---

### 3. Customer Segments

**Guidance:**

- Segment the market using a consistent framework (firmographics, behavioral,
  psychographic, or needs-based). Choose the framework that best predicts
  purchasing behavior for this market.
- For each segment, estimate: size (number of potential customers or revenue
  potential), growth rate, key needs/pain points, buying process characteristics,
  and current solution alternatives.
- Identify the most attractive segment(s) for the reader's organization and
  explain why.

**Template:**

```
| Segment | Description | Est. Size | Growth | Key Needs | Buying Process | Current Solutions |
|---------|-------------|-----------|--------|-----------|---------------|-------------------|
| Segment A | [Who they are] | [X companies / $Y revenue] | [rate] | [top 3 needs] | [how they buy] | [what they use today] |
| Segment B | | | | | | |
| Segment C | | | | | | |

Most Attractive Segment: [Name]
Reasoning: [Why — consider size, growth, fit with your capabilities, competitive intensity]
```

---

### 4. Regulatory Landscape

**Guidance:**

- Identify all relevant regulations, standards, and compliance requirements.
- Distinguish between current requirements and proposed/upcoming legislation.
- Note geographic variation — a regulation that applies in the EU may not apply
  in the US.
- Assess the cost of compliance and how it serves as a barrier to entry or a
  moat for incumbents.
- Flag any regulatory changes that could significantly impact the market.

**Template:**

```
| Regulation / Standard | Jurisdiction | Status | Impact | Compliance Cost | Relevance to Us |
|-----------------------|-------------|--------|--------|----------------|-----------------|
| [Name] | [Where] | Active / Proposed / Under Review | [High/Med/Low on market] | [Estimate or range] | [Direct / Indirect / None] |

Upcoming Changes to Monitor:
- [Change]: [Expected date] — [Potential impact]

Regulatory Risk Level: [Low / Medium / High]
```

---

### 5. Barriers to Entry

**Guidance:**

- List 4-8 barriers, categorized by type: regulatory, capital, technology,
  network effects, switching costs, brand/ trust, talent, data/ IP.
- Rate each barrier's severity for a new entrant (not for the reader's org).
- Identify which barriers are eroding over time (e.g., cloud lowering capital
  requirements) and which are strengthening.

**Template:**

```
| Barrier | Type | Severity (1-5) | Trend (↑↓→) | Notes |
|---------|------|:--------------:|:-----------:|-------|
| [Barrier 1] | [Type] | [X] | [Strengthening/Stable/Eroding] | [Explanation] |
| [Barrier 2] | | | | |
```

---
---

## Template 3: Technology Assessment

**Purpose:** Evaluate a technology's maturity, viability, and fit for a specific
use case. Supports build-vs-buy decisions and technology selection.

**When to use:** Evaluating a new framework, platform, or tooling; preparing
for an architecture decision record; assessing emerging technologies.

---

### 1. Technology Overview

**Guidance:**

- Name the technology precisely (including version if relevant).
- State the one-sentence description of what it does and for whom.
- List the maintainer(s) and their track record.
- Provide a brief history: when was it created, why, major milestones.

**Template:**

```
**Technology:** [Name] [Version if applicable]
**Category:** [e.g., "ML framework," "database," "CI/CD tool," "protocol"]
**One-liner:** [What it is in one sentence]
**Maintainer(s):** [Who owns/develops it — company, foundation, community]
**Initial Release:** [Date] | **Latest Stable:** [Version, date]
**License:** [Open source license or commercial terms]
**Brief History:** [2-3 sentences on origin and evolution]
```

---

### 2. Maturity Model Assessment

**Guidance:**

- Place the technology on a standard maturity scale.
- Provide evidence for each dimension: adoption breadth, API stability,
  documentation quality, breaking change frequency, production deployment track
  record.
- If the technology has multiple components, assess each separately.

**Maturity Scale:**
1. **Research/Experimental** — Academic or lab use only. No production deployments.
2. **Early Adopter** — Production use by a handful of brave teams. APIs still changing.
3. **Growing** — Meaningful production adoption. APIs mostly stable. Gaps in ecosystem.
4. **Mature** — Broad production use. Stable APIs. Rich ecosystem. Multiple vendors.
5. **Legacy/Stable** — Ubiquitous but innovation slowing. May have technical debt.

**Template:**

```
Overall Maturity Stage: [Stage number — Name]
Confidence: [High / Medium / Low]

| Dimension | Assessment | Evidence |
|-----------|-----------|----------|
| Adoption breadth | [How widely adopted — companies, industries] | [Notable adopters, download stats, survey data] |
| API stability | [Stable / Evolving / Unstable] | [Breaking change frequency, deprecation policy] |
| Documentation | [Excellent / Good / Adequate / Poor] | [Coverage of APIs, examples, tutorials quality] |
| Ecosystem | [Rich / Growing / Sparse / Minimal] | [Number of plugins, integrations, third-party tools] |
| Production track record | [Extensive / Moderate / Limited / None] | [Known production deployments at scale] |
| Security posture | [Strong / Adequate / Concerning / Unknown] | [CVE history, security audits, vulnerability response] |
```

---

### 3. Benchmark Criteria

**Guidance:**

- Define 6-10 evaluation criteria relevant to the use case.
- Weight each criterion based on stakeholder priorities (weights should sum to 100%).
- Score each criterion on a 1-5 scale with justification.
- Include a comparison against 1-2 alternative technologies if applicable.

**Template:**

```
| Criterion | Weight | Score (1-5) | Justification |
|-----------|:------:|:-----------:|---------------|
| Performance (latency/throughput) | [X]% | [N] | [Evidence: benchmark results, user reports] |
| Scalability | [X]% | [N] | [Evidence: known limits, architecture] |
| Ease of adoption / learning curve | [X]% | [N] | [Evidence: developer experience, time to first value] |
| Community / support | [X]% | [N] | [Evidence: Stack Overflow activity, Slack users, paid support] |
| Integration ecosystem | [X]% | [N] | [Evidence: available connectors, API coverage] |
| Cost (total cost of ownership) | [X]% | [N] | [Evidence: licensing, infrastructure, personnel costs] |
| Security & compliance | [X]% | [N] | [Evidence: certifications, audit history] |
| Vendor risk / longevity | [X]% | [N] | [Evidence: funding, backing, adoption trajectory] |

**Weighted Score:** [Sum of score × weight] / [Max possible] = [percentage]
**Comparison:** [Technology] scores [X%] vs. [Alternative A] at [Y%] vs. [Alternative B] at [Z%]
```

---

### 4. Community Health Metrics

**Guidance:**

- For open-source projects, these metrics are leading indicators of long-term viability.
- Gather data from GitHub, Stack Overflow, Discord/Slack, package registries.
- Note the date data was collected — these metrics change rapidly.

**Template:**

```
| Metric | Value | Date Collected | Trend (6mo) | Healthy Range |
|--------|-------|:--------------:|:-----------:|---------------|
| GitHub stars | [N] | [date] | [+X%] | Context-dependent |
| GitHub contributors (last 6mo) | [N] | | | [>20 active is healthy for major projects] |
| GitHub issues (open / closed ratio) | [X / Y] | | | [Lower open ratio is better] |
| GitHub PR merge time (median) | [X days] | | | [<7 days is good] |
| Release cadence | [Every X days/weeks] | | | [Regular releases indicate active maintenance] |
| npm/PyPI/docker pulls (monthly) | [N] | | | [Compare to peers] |
| Stack Overflow questions (last 12mo) | [N] | | | [Growing + answered = healthy] |
| Stack Overflow answer ratio | [X%] | | | [>70% answered is good] |
| Community chat members | [N] | | | [Context-dependent] |

**Community Health Assessment:** [Healthy / At Risk / Declining]
**Key Risk:** [e.g., "Bus factor of 2 — only 2 contributors do 80% of commits"]
```

---

### 5. Enterprise Readiness Checklist

**Guidance:**

- Evaluate whether the technology is suitable for enterprise production use.
- Check each item and provide a status: ✅ Pass, ⚠️ Partial, ❌ Fail, ➖ N/A.
- For any ⚠️ or ❌ items, describe the gap and any mitigations.

**Template:**

```
| Category | Checkpoint | Status | Notes |
|----------|-----------|:------:|-------|
| Security | SSO/SAML support | ✅/⚠️/❌ | [Details] |
| Security | RBAC / fine-grained permissions | | |
| Security | Audit logging | | |
| Security | Known CVEs (critical/high) | | |
| Compliance | SOC 2 Type II certification | | |
| Compliance | GDPR compliance features | | |
| Compliance | HIPAA BAA available | | |
| Operations | High availability / failover | | |
| Operations | Backup / disaster recovery | | |
| Operations | Multi-region deployment | | |
| Operations | SLA available (commercial) | | |
| Vendor | Commercial support available | | |
| Vendor | Vendor lock-in assessment | | |
| Vendor | Financial stability of maintainer | | |
| Governance | Contribution / IP clarity (OSS) | | |
| Governance | Roadmap transparency | | |
| Governance | Breaking change policy | | |

**Enterprise Readiness Score:** [X] / [Y] checkpoints passed
**Overall Assessment:** [Ready / Ready with caveats / Not recommended for enterprise]
**Caveats:** [List]
```

---
---

## Template 4: Literature Review

**Purpose:** Systematically identify, evaluate, and synthesize existing research
on a topic. Produces a defensible summary of the state of knowledge.

**When to use:** Academic research, evidence-based decision making, building a
theoretical foundation, identifying research gaps.

---

### 1. Search Strategy

**Guidance:**

- Document every database and source you searched. This ensures reproducibility.
- Record the exact search strings used (including Boolean operators and filters).
- Note date ranges, language restrictions, and any other limits applied.
- Track the number of results at each stage for a PRISMA-style flow diagram.

**Template:**

```
Databases Searched:
| Database | Date Searched | Date Range | Results | After Duplicates Removed |
|----------|:------------:|------------|:-------:|:------------------------:|
| Google Scholar | [date] | [range] | [N] | |
| PubMed | [date] | [range] | [N] | |
| IEEE Xplore | [date] | [range] | [N] | |
| arXiv | [date] | [range] | [N] | |
| [Other] | | | | |

Search Strings:
1. "[exact phrase]" AND [keyword] AND [keyword]
2. [alternative string with synonyms]
3. [string for related concept]

Filters Applied:
- Language: [English only / No restriction]
- Publication type: [Peer-reviewed only / Conference papers included / etc.]
- Date range: [e.g., 2015-2024]
- Other: [e.g., "exclude preprints" or "only review articles"]

Snowball / Supplementary Sources:
- Backward citation tracking from [N] key papers
- Forward citation tracking via Google Scholar
- Hand-searching [specific journal / conference proceedings]
- Expert recommendations: [list sources if applicable]
```

---

### 2. Inclusion / Exclusion Criteria

**Guidance:**

- Define clear, operational criteria before screening. This reduces bias.
- Inclusion criteria describe what *must* be true for a paper to be included.
- Exclusion criteria describe what *disqualifies* a paper.
- Apply criteria in two stages: (1) title/abstract screening, (2) full-text review.

**Template:**

```markdown
### Inclusion Criteria (all must be met):
1. [e.g., "Published between 2015-2024"]
2. [e.g., "Peer-reviewed journal article or conference paper"]
3. [e.g., "Empirical study (quantitative, qualitative, or mixed methods)"]
4. [e.g., "Focuses on [specific topic/population/intervention]"]
5. [e.g., "Published in English"]

### Exclusion Criteria (any one disqualifies):
1. [e.g., "Editorials, opinion pieces, or non-empirical commentaries"]
2. [e.g., "Studies with fewer than 30 participants"]
3. [e.g., "Duplicate publications of the same dataset"]
4. [e.g., "Studies not available in full text"]
5. [e.g., "Preprints without subsequent peer-reviewed publication"]

### Screening Results:
- Total identified: [N]
- After duplicate removal: [N]
- After title/abstract screening: [N] (excluded: [N] + reasons)
- After full-text review: [N] (excluded: [N] + reasons)
- Final included: [N]
```

---

### 3. Quality Assessment

**Guidance:**

- Assess the methodological quality of each included study.
- Use a standardized framework appropriate to the study types (e.g., CASP for
  qualitative studies, RoB 2 for RCTs, MMAT for mixed methods, Newcastle-Ottawa
  for observational studies).
- Rate each study and note which ones carry the most weight in synthesis.

**Template:**

```
| # | Authors (Year) | Study Design | Quality Score | Key Quality Issues | Weight in Synthesis |
|---|----------------|-------------|:-------------:|-------------------|:-------------------:|
| 1 | [Author et al., Year] | [e.g., RCT, cohort, case study] | [X/10] | [e.g., "Small sample, no blinding"] | High / Medium / Low |
| 2 | | | | | |
| 3 | | | | | |

Quality Framework Used: [e.g., "CASP Qualitative Checklist," "Modified Newcastle-Ottawa Scale"]
Assessment Notes:
- Common weaknesses across studies: [e.g., "Most studies lack control groups"]
- Strongest evidence comes from: [e.g., "Three large-scale RCTs (Studies 2, 5, 8)"]
```

---

### 4. Thematic Analysis Framework

**Guidance:**

- Identify 4-8 major themes that emerge across the literature.
- For each theme, summarize the consensus, key debates, and gaps.
- Map each included study to the theme(s) it addresses.
- Note where studies converge (consistent findings) and where they diverge
  (conflicting results or methodological disagreements).
- End with a clear statement of what is known, what is debated, and what is unknown.

**Template:**

```markdown
### Theme 1: [Theme Name]

**Consensus:** [What most studies agree on — with citations]
**Key findings:**
- [Finding from Study A (Author, Year)]
- [Finding from Study B (Author, Year)]

**Debates / Contradictions:**
- [Study C found X, but Study D found Y — possible explanation: Z]

**Gaps:**
- [What hasn't been studied or remains unclear]

**Confidence:** [High / Medium / Low] — [Why]

---

### Theme 2: [Theme Name]
...

---

### Summary of Evidence

**Well-established (high confidence):**
1. [Finding with supporting citations]
2. [Finding]

**Emerging evidence (medium confidence):**
1. [Finding — note it's from fewer or weaker studies]
2. [Finding]

**Unresolved / conflicting (low confidence):**
1. [Finding — note the disagreement]
2. [Finding]

**Research gaps identified:**
1. [Gap — why it matters and how future work could address it]
2. [Gap]
```

---

*These templates are starting frameworks. Adapt section depth and scope to match
the stakes and timeline of each research project. A 2-hour competitive scan for a
standup update does not need a full SWOT per competitor; a board presentation on
market entry absolutely does.*
