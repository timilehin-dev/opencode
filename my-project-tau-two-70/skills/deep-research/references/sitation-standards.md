# Citation and Attribution Standards

How to properly cite and attribute sources in research outputs. These standards
ensure that every factual claim can be traced to its origin, that intellectual
credit is given where due, and that readers can assess the evidence behind
conclusions.

---

## General Principles

1. **Cite everything that isn't common knowledge.** When in doubt, cite.
   "Common knowledge" means something a reasonable person in your audience would
   accept without evidence (e.g., "Paris is the capital of France"). Market share
   percentages, performance benchmarks, and survey findings are never common
   knowledge.

2. **Make claims traceable.** The reader should be able to go from your claim
   directly to the specific source that supports it. Avoid vague attributions
   like "research shows" or "industry reports indicate" without naming the
   specific research or report.

3. **Distinguish facts from interpretations.** Cite the fact and attribute the
   interpretation separately. Example: "Revenue grew 23% year-over-year
   [Company 10-K, 2024], which analysts attribute to the new pricing model
   [Forrester, 2024]."

4. **Be consistent.** Use the same citation format throughout a single document.
   Pick a format at the start and stick with it.

5. **Include enough detail for retrieval.** A citation should contain enough
   information for the reader to find the source themselves.

---

## Inline Citation Formats

Use inline citations to connect specific claims to specific sources within the
body of your text. Below are formats for each common source type.

---

### Academic Paper

```
[Author Last Name, Year]                          → [Smith, 2023]
[Author Last Name, Year, p. X]                    → [Smith, 2023, p. 42]
[Author Last Name & Author Last Name, Year]       → [Smith & Jones, 2023]
[Author Last Name et al., Year] (3+ authors)      → [Smith et al., 2023]
```

**Full inline example:**
> Recent experiments show that retrieval-augmented generation reduces
> hallucination rates by up to 40% in domain-specific question answering
> [Lewis et al., 2020].

**When to include page numbers:** Always when quoting directly. Include when
referring to a specific finding, argument, or data point within a longer work.
Omit page numbers when citing the overall conclusion or general finding of a
paper.

---

### News Article

```
[Publication, "Article Title," Date]              → [Reuters, "Global Chip Shortage Eases," Mar. 2024]
[Author Last Name, Publication, Date]              → [Chen, Bloomberg, Jan. 2024]
```

**Full inline example:**
> The European Commission announced new AI regulation requirements in April 2024
> [Chen, Financial Times, Apr. 2024].

**When to include the author:** When the article is bylined and the author is a
recognized beat reporter. For wire service articles (Reuters, AP), the
publication name alone is often sufficient since the byline may rotate.

---

### Company Report / Filing

```
[Company Name, Document Type, Year/Q]              → [Tesla, 10-K FY2023]
[Company Name, "Report Title," Date]               → [McKinsey, "State of AI 2024," Dec. 2024]
```

**Full inline example:**
> Apple's services revenue reached $85.2 billion in fiscal year 2023, up 16%
> from the prior year [Apple, 10-K FY2023].

**Document types to use:** Annual report (10-K), quarterly report (10-Q),
earnings transcript, investor presentation, corporate blog post (distinguish
from peer-reviewed research).

**Important:** For investor presentations and press releases, note that these
are self-reported figures. Consider adding a qualifier:
> Apple reported services revenue of $85.2 billion [Apple, 10-K FY2023].

---

### Government Data / Report

```
[Agency Name, "Report Title," Year]                → [U.S. Census Bureau, "Population Estimates," 2023]
[Agency Name, Dataset Name, Year]                  → [BLS, Consumer Price Index, 2024]
[Agency Name, Law/Regulation Name, Year]           → [EU, AI Act, 2024]
```

**Full inline example:**
> The U.S. civilian labor force participation rate was 62.5% in Q4 2023
> [BLS, Labor Force Statistics, 2024].

**Best practice:** Include a URL or DOI for government datasets so readers can
access the exact table or visualization you referenced.

---

### Blog Post / Technical Article

```
[Author Last Name, Blog/Publication, "Title," Date] → [Kleppmann, "Please Stop Calling Databases CP or AP,"
                                                          Martin Kleppmann's Blog, May 2015]
```

**Full inline example:**
> The CAP theorem is frequently misapplied to systems that don't actually
   require network partition tolerance [Kleppmann, Martin Kleppmann's Blog, May 2015].

**When blog posts are appropriate to cite:** When the author is a recognized
domain expert, when the post contains original analysis not available elsewhere,
or when the post is the canonical reference for a specific concept. Always pair
a blog citation with a reliability assessment — see source-evaluation-criteria.md.

---

### Social Media Post

```
[Author/Handle, Platform, Date]                     → [@satyanadella, X (Twitter), Mar. 2024]
[Author, Platform, Post URL, Date]                  → [Andrej Karpathy, X, https://x.com/..., Jan. 2024]
```

**Full inline example:**
> Satya Nadella announced the acquisition in a post on X, stating the deal
> would close by Q3 2024 [@satyanadella, X (Twitter), Feb. 2024].

**When social media is appropriate to cite:** Official company announcements,
direct quotes from public figures, breaking news where no other source exists,
sentiment and community reaction analysis.

**Important:** Social media posts can be deleted. Take a screenshot or use an
archived version (Wayback Machine) when the citation is critical to your
argument. Note if you accessed an archived version.

---

### Personal Communication

```
[Name, Title, Organization, Communication Type, Date] → [J. Smith, VP Engineering, Acme Corp.,
                                                          email interview, Mar. 2024]
```

**Full inline example:**
> According to a senior engineering leader at Acme Corp, the migration to
> microservices reduced deployment time by 70% [J. Smith, VP Engineering,
> Acme Corp., personal interview, Mar. 2024].

**Guidance:** Personal communications are not verifiable by the reader. Use
them sparingly and only when no public source is available. Clearly label them
as personal communications. Get the person's permission before citing them.
Consider whether the communication reveals non-public information that could be
sensitive.

---

## Bibliography Formatting (Simplified APA Style)

Provide a full bibliography at the end of every research document. Use this
simplified APA-style format — it's widely recognized and relatively compact.

### Journal Article
```
Author, A. B., & Author, C. D. (Year). Title of article. Title of Journal, Volume(Issue), Page-Page. https://doi.org/xxxxx

Example:
Lewis, P., Perez, E., Piktus, A., Petroni, F., Karpukhin, V., Goyal, N., Küttler, H., Lewis, M., Yih, W-t., Rocktäschel, T., Riedel, S., & Kiela, D. (2020). Retrieval-augmented generation for knowledge-intensive NLP tasks. Advances in Neural Information Processing Systems, 33, 9459-9474. https://doi.org/10.5555/3495724.3496382
```

### Conference Paper
```
Author, A. B. (Year). Title of paper. In Proceedings of Conference Name (pp. Page-Page). Publisher. https://doi.org/xxxxx

Example:
Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A. N., Kaiser, Ł., & Polosukhin, I. (2017). Attention is all you need. In Advances in Neural Information Processing Systems 30 (pp. 5998-6008). Curran Associates.
```

### Book
```
Author, A. B. (Year). Title of book (Edition). Publisher.

Example:
Kleinberg, J. M. (2013). Networks, crowds, and markets: Reasoning about a highly connected world. Cambridge University Press.
```

### News Article
```
Author, A. B. (Year, Month Day). Title of article. Publication Name. URL

Example:
Chen, L. (2024, March 15). EU passes landmark AI regulation. Financial Times. https://www.ft.com/example-url
```

### Company Filing / Report
```
Company Name. (Year). Document type for fiscal period. URL

Example:
Apple Inc. (2023). Form 10-K for fiscal year ended September 30, 2023. U.S. Securities and Exchange Commission. https://www.sec.gov/Archives/edgar/data/320193/000032019323000106/aapl-20230930.htm
```

### Government Report / Data
```
Agency Name. (Year). Title of report or dataset. URL

Example:
U.S. Bureau of Labor Statistics. (2024). Labor force statistics from the Current Population Survey. U.S. Department of Labor. https://www.bls.gov/cps/
```

### Blog Post
```
Author, A. B. (Year, Month Day). Title of post [Blog post]. Blog Name. URL

Example:
Kleppmann, M. (2015, May 4). Please stop calling databases CP or AP [Blog post]. Martin Kleppmann's Blog. https://martin.kleppmann.com/2015/05/11/please-stop-calling-databases-cp-or-ap.html
```

### Industry Report
```
Author/Organization. (Year). Title of report. Publisher. URL

Example:
Gartner, Inc. (2024). Magic quadrant for cloud database management systems. Gartner Research. https://www.gartner.com/en/documents/example
```

---

## Citing Statistics and Data Points

Statistics require precise attribution. Follow these rules:

### Rule 1: Cite the original producer of the data
If Statista republished BLS data, cite the BLS (with a note that you accessed it
via Statista). If a blog post summarizes a Gartner report, cite the Gartner
report directly if you can access it.

```
✅ Correct: "The U.S. unemployment rate was 3.7% in January 2024 [BLS, Employment Situation Summary, Jan. 2024]."

❌ Avoid: "The U.S. unemployment rate was 3.7% in January 2024 [Statista]."
```

### Rule 2: Include the date of the data, not just the publication
A report published in 2024 may contain 2022 data. State when the data was
collected or measured.

```
✅ Correct: "Global cloud revenue reached $596 billion in 2023 [Gartner, IT Spending Forecast, published Jan. 2024, covering 2023 data]."

❌ Avoid: "Global cloud revenue reached $596 billion [Gartner, 2024]."
```

### Rule 3: State the sample or scope when relevant
For survey data, market estimates, and other statistical claims, include the
scope so the reader understands what the number represents.

```
✅ Correct: "78% of enterprise organizations reported using AI in at least one business function (n=1,200 CIOs, global survey) [McKinsey, "State of AI," Dec. 2023]."

❌ Avoid: "78% of organizations use AI [McKinsey, 2023]."
```

### Rule 4: Distinguish point estimates from ranges
When a source provides a range or confidence interval, include it.

```
✅ Correct: "The global AI market is projected to reach $1.81 trillion by 2030 (CAGR of 36.6%, 2024-2030) [Grand View Research, 2024]."

❌ Avoid: "The AI market will be $1.81 trillion by 2030."
```

### Rule 5: Note if data is self-reported
Self-reported data has known biases (social desirability, inaccurate recall).
Flag it when it affects the reliability of the claim.

```
✅ Correct: "According to self-reported survey data, 92% of developers use GitHub daily (n=5,000, Stack Overflow Developer Survey, 2023). Note: social desirability bias may inflate this figure."

❌ Avoid: "92% of developers use GitHub daily."
```

---

## Citing Paraphrased vs. Direct Quotes

### Paraphrased Content (Your Words)

When you restate someone else's idea in your own words, you still must cite the
original source. Paraphrasing does not mean changing a few words — it means
genuinely reformulating the idea.

```
✅ Good paraphrase with citation:
  Retrieval-augmented generation combines a language model with an external
  knowledge base, allowing the model to access up-to-date information at
  inference time rather than relying solely on its training data [Lewis et al., 2020].

❌ Unacceptable — too close to original:
  RAG allows language models to access up-to-date information at inference time
  instead of only using training data [Lewis et al., 2020].
  (This is essentially the same sentence with minor word swaps.)
```

**Rules for paraphrasing:**
- You must cite the source even though the words are yours.
- Read the original, close it, write your version, then check that you haven't
  accidentally copied phrases.
- Include a page or section reference when paraphrasing a specific passage
  (not just the general idea of the paper).

### Direct Quotes (Exact Words)

Use direct quotes when the original wording is important — because of precision,
impact, or because you're analyzing the specific language used.

```
Inline format:
  The authors describe this as "a general-purpose fine-tuning recipe for
  language models" [Ouyang et al., 2022, p. 3].

Block quote format (for quotes of 40+ words or when emphasis is needed):
  > We find that in-context learning performs competitively with fine-tuning
  > on a wide range of tasks, while requiring no gradient updates or task-
  > specific parameters [Brown et al., 2020, p. 38].
```

**Rules for direct quotes:**
- Always include a page number or section reference.
- Use quotes sparingly — most research writing should be your own analysis.
- Use block quotes for longer passages (indent or format clearly).
- If you change anything within the quote for readability, use brackets:
  "The [language] model outperformed all baselines."
- If you omit words, use an ellipsis: "The model... outperformed all baselines."
- Do not use quotes to avoid paraphrasing lazy writing. A paragraph of chained
  quotes is not research — it's copy-pasting.

---

## Footnote vs. Inline vs. Endnote Guidance

### Inline Citations (Author-Date)
**Best for:** Most research documents, reports, and analyses.
**Format:** [Author, Year] or [Source, Date] within the text.
**Advantages:** Keeps the reader in the flow. Easy to scan. Compact.
**When to use:** Default choice for business research, technical reports, and
most analytical writing.

```
Example paragraph:
  Cloud adoption in healthcare accelerated during 2020-2022, with spending
  reaching $39.7 billion in 2022 [Gartner, Healthcare IT Spending, 2023].
  This trend was driven by telehealth demand and regulatory flexibility
  [Deloitte, "Digital Health Transformation," 2023]. However, security
  concerns remain the top barrier, cited by 67% of healthcare IT leaders
  [HIMSS, Cybersecurity Survey, 2023].
```

### Footnotes (Superscript Numbers)
**Best for:** Legal analysis, policy papers, academic writing, documents with
many dense citations that would clutter inline text.
**Format:** Superscript number in text¹ with full citation at the bottom of the
page.
**Advantages:** Keeps body text clean. Allows for longer explanatory notes.
**When to use:** Legal memos, academic papers, policy briefs with complex
provenance chains.

```
Example paragraph:
  Cloud adoption in healthcare accelerated during 2020-2022.¹ This trend
  was driven primarily by telehealth demand.²

---
¹ Gartner, Inc. (2023). Healthcare IT Spending Forecast. https://...
² The Centers for Medicare & Medicaid Services (CMS) temporarily expanded
  reimbursement for telehealth services under the 1135 waiver authority
  beginning in March 2020. See CMS, "COVID-19 Emergency Declaration
  Blanket Waivers," updated Jan. 2023. https://...
```

### Endnotes (Numbered, Collected at End)
**Best for:** Long reports, white papers, and books where footnotes would
disrupt page layout.
**Format:** Same as footnotes but collected in a "Notes" section before the
bibliography.
**Advantages:** All notes in one place. Better for print/PDF layout.
**When to use:** Reports over 20 pages, white papers, books, documents that
will be printed.

### Choosing the Right Format

| Factor | Inline | Footnote | Endnote |
|--------|:------:|:--------:|:-------:|
| Document length < 10 pages | ✅ | ⚠️ | ❌ |
| Document length 10-30 pages | ✅ | ✅ | ⚠️ |
| Document length 30+ pages | ⚠️ | ✅ | ✅ |
| Many citations per paragraph | ❌ | ✅ | ✅ |
| Explanatory notes needed | ❌ | ✅ | ✅ |
| Reader is non-academic | ✅ | ⚠️ | ❌ |
| Legal or academic context | ⚠️ | ✅ | ✅ |
| Digital-first / web format | ✅ | ❌ | ❌ |

---

## Handling Anonymous or Crowd-Sourced Data

Some valuable sources lack traditional authorship or editorial oversight.
Cite them transparently so the reader understands the limitations.

### Anonymous Sources

When the author is intentionally anonymous (whistleblower, insider, unnamed
official):

```
Format: [Description of source, communication type, date provided, your
        verification status]

Example:
  A senior engineer at the company described the outage as "the worst we've
  seen in five years" [anonymous source, phone interview, Mar. 2024,
  verified via corroborating incident timeline].
```

**Rules:**
- Describe the source's position and why their anonymity is justified.
- State how you verified the information (corroborating sources, documentary
  evidence).
- Use anonymous sources sparingly and never as the sole source for a critical
  claim.
- Be transparent about what you cannot independently verify.

### Crowd-Sourced Data

For data collected from many unnamed contributors (surveys, platforms,
community databases):

```
Format: [Platform/Organization, Dataset Name, Methodology Summary, Date, n=X]

Example:
  The average software developer salary in the United States was $120,000
  (median, n=65,000 respondents, self-reported) [Stack Overflow Developer
  Survey, 2023].
```

**Rules:**
- Always state the methodology (how data was collected, sample size, selection
  criteria).
- Flag self-reported data explicitly — it's subject to social desirability and
  recall biases.
- Note selection bias: who is likely to participate? (e.g., Stack Overflow
  survey respondents skew toward English-speaking, web-oriented developers.)
- State the date range for data collection.
- Provide a URL to the methodology documentation when available.

### Wikipedia and Similar Collaborative Sources

```
Format: [Wikipedia, "Article Title," last modified Date, accessed Date]

Example:
  Retrieval-augmented generation was first proposed in 2020 [Wikipedia,
  "Retriever-augmented generation," last modified Feb. 2024, accessed
  Mar. 2024].
```

**Rules:**
- Never cite Wikipedia as a primary source for a factual claim.
- Use it only for background context or as a starting point to find primary
  sources.
- Always check the cited references at the bottom of the Wikipedia article and
  cite those directly instead.
- Include the "accessed" date and "last modified" date since Wikipedia content
  changes over time.

### Aggregated / Compiled Data (Statista, SimilarWeb, etc.)

```
Format: [Platform, "Report/Dataset Title," Data Year, accessed Date,
        Original Source if traceable]

Example:
  Global smartphone penetration reached 68% in 2023 [Statista, "Smartphone
  penetration worldwide," 2023 data, accessed Jan. 2024; original data
  sourced from ITU World Telecommunication Indicators].
```

**Rules:**
- Try to trace the data back to the original source (ITU, World Bank, industry
  association, etc.) and cite that directly.
- When the original source is not accessible, cite the aggregator but note the
  original source they credit.
- State the date you accessed the data since aggregator content changes.
- Note any paywalls or access limitations.

---

## Quick Reference Card

| Source Type | Inline Format | Bibliography Key Elements |
|-------------|--------------|--------------------------|
| Academic paper | [Author, Year] | Author(s). Year. Title. Journal. Vol(Issue). Pages. DOI. |
| Conference paper | [Author, Year] | Author(s). Year. Title. In *Proceedings* (pp.). Publisher. |
| News article | [Author, Publication, Date] or [Publication, "Title," Date] | Author. Date. Title. Publication. URL. |
| Company report | [Company, Doc Type, Year/Q] | Company. Year. Document Type. URL. |
| Government data | [Agency, Dataset/Report, Year] | Agency. Year. Title. URL. |
| Blog post | [Author, Blog, Date] | Author. Date. Title [Blog post]. Blog Name. URL. |
| Social media | [@handle, Platform, Date] | Handle. Date. Content description. Platform. URL. |
| Personal comm. | [Name, Title, Org, Type, Date] | Not included in bibliography (non-verifiable). |
| Anonymous source | [Description, Type, Date, verification] | Not included in bibliography (non-verifiable). |
| Crowd-sourced | [Platform, Dataset, n=X, Year] | Platform. Year. Dataset Name. Methodology. URL. |

---

*These standards aim for clarity, traceability, and honesty. They are not meant
to be a substitute for institutional style guides (APA, Chicago, MLA, IEEE) when
those are required. Use this as a practical default for business research and
technical analysis. When working within an institution that mandates a specific
style, follow that style guide.*
