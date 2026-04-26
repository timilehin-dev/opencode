# Voice Calibration Guide

A systematic methodology for analyzing a user's writing sample and applying their voice
to humanized rewrites. Voice calibration is the single most important factor in making
AI-generated text sound authentic.

---

## Part 1: Analyzing a Writing Sample — Step by Step

### Step 1: Gather Sufficient Material

You need at least 500-1,000 words of the user's writing to calibrate reliably. Shorter
samples lead to unreliable profiles. Ideal sources:

- **Work emails** — especially longer ones with opinions or explanations
- **Blog posts or articles** — shows extended voice with full paragraphs
- **Reports or memos** — shows formal register and professional tone
- **Slack messages or chat** — shows casual register (useful for lower-stakes content)

Avoid mixing very different contexts (e.g., a formal report and a casual Slack thread)
unless the user explicitly wants to blend them. Calibrate to the context the output will
appear in.

### Step 2: Measure the 8 Voice Dimensions

For each dimension below, score the sample on a simple scale. Document your findings —
don't just note them mentally. Use the template in Part 3.

---

### Dimension 1: Sentence Length

**What to measure:**
- Average words per sentence
- Shortest and longest sentences
- How much length varies (rhythm)

**How to measure:**
Count words in 15-20 sentences. Calculate average, range, and standard deviation.

**Example analysis:**

> Sample from a product manager:
> "We should ship this feature. I know the team has concerns about performance, and they're
> valid, but we can address those in a follow-up sprint. The market isn't going to wait for
> us to perfect every edge case. Let's get something out the door and iterate from real
> user feedback."

Analysis: Average 15 words per sentence. Range: 4 to 22. High variance — alternates between
very short punchy statements and longer explanatory ones. This writer uses rhythm deliberately.

**Calibration notes:**
- Short sentences (under 8 words): Used for emphasis and conclusions
- Medium sentences (8-18 words): Standard explanation
- Long sentences (18+ words): Used for context-setting and caveats
- Mixes short and long frequently — never stays in one register long

---

### Dimension 2: Vocabulary Level

**What to measure:**
- Formal vs. casual word choices
- Technical jargon density
- Use of idioms, metaphors, or colloquialisms
- Academic or Latinate vocabulary

**How to measure:**
Flag 20-30 representative word choices. Categorize them as formal/technical/casual/idiomatic.

**Example analysis:**

> Sample: "The new pricing model is more aggressive than what we ran last year. We're
> basically giving away the farm on the entry tier. But it makes sense — we need land and
> expand, and the unit economics work out once they're on the platform for six months. The
> CAC payback is around four months, which is right in line with industry benchmarks."

Analysis: Mix of business jargon ("unit economics," "CAC payback," "land and expand") with
casual idioms ("giving away the farm," "basically"). Comfortable with financial metrics but
explains them plainly. Vocabulary is colloquial-professional — not stiff, not sloppy.

**Calibration notes:**
- Comfortable with industry jargon, doesn't over-explain it
- Uses idioms naturally, not forced
- Never uses academic or Latinate phrasing
- "Basically" and similar filler words appear in moderation

---

### Dimension 3: Punctuation Habits

**What to measure:**
- Em-dash frequency (per paragraph)
- Semicolon usage
- Parenthetical asides
- Exclamation marks
- Question marks
- Comma usage (heavy or light)
- Use of colons, ellipses

**How to measure:**
Tally punctuation marks in 3-4 paragraphs. Note patterns.

**Example analysis:**

> Sample paragraph: "Three options are on the table — each with different trade-offs. Option
> A is cheapest but takes the longest; Option B is fast but expensive. I'd recommend Option
> C (the hybrid approach) because it balances cost and timeline. Is there budget room for the
> upfront investment? If so, I think we should go with C."

Analysis: One em-dash per paragraph on average. One semicolon per paragraph — used for
comparing alternatives. Parentheses for asides. Questions to engage the reader. Commas are
standard. No exclamation marks.

**Calibration notes:**
- Em-dashes: ~1 per paragraph (not excessive)
- Semicolons: occasional, for parallel comparisons
- Parentheses: used for quick asides
- Questions: 0-1 per paragraph, genuine questions
- Exclamation marks: rare to never in professional context

---

### Dimension 4: Paragraph Structure

**What to measure:**
- Average sentences per paragraph
- Opening patterns (how paragraphs start)
- Closing patterns (how paragraphs end)
- Internal structure (topic sentence first? build-up? anecdote lead?)
- Transition style between paragraphs

**How to measure:**
Map 5-8 paragraphs. Note first and last sentence of each.

**Example analysis:**

> Paragraph 1 opens with a direct statement of opinion: "I think we're overthinking this."
> Paragraph 2 opens with context: "The original requirement was..." Paragraph 3 opens with
> a question: "What happens if we just...?" Paragraph 4 opens with a consequence: "The
> biggest risk here isn't technical — it's organizational."
>
> Closings tend to be short, decisive sentences: "Let's decide by Friday." "I can put
> together the proposal." "That's where I'd start."
>
> Average 3-4 sentences per paragraph. No paragraphs longer than 5 sentences.

**Calibration notes:**
- Opens with opinion or direct statement most often
- Closes with a concrete next step or decision point
- Paragraphs stay short (3-4 sentences typically)
- Transitions are implicit — doesn't use "Furthermore" or "In addition"

---

### Dimension 5: Tone Markers

**What to measure:**
- Directness vs. indirectness
- Humor presence and type (dry, self-deprecating, warm)
- Warmth vs. detachment
- Assertiveness level
- Optimism vs. skepticism
- Emotional expressiveness

**How to measure:**
Read the full sample for overall emotional register. Identify specific markers.

**Example analysis:**

> "The Q3 numbers look solid — not amazing, but solid. Revenue is up 12% which beats our
> internal target, even if Wall Street wanted more. I'll take beating our own plan over
> missing someone else's expectations. The team earned this one; they've been grinding
> since the re-org."

Analysis: Matter-of-fact, slightly wry. Honest about shortcomings without being negative.
Acknowledges team effort directly. Shows skepticism about external expectations. Warm toward
the team, direct about the numbers.

**Calibration notes:**
- Direct and honest, doesn't sugarcoat
- Slightly wry/dry humor ("not amazing, but solid")
- Skeptical of external hype
- Warm and appreciative toward team
- Optimistic but grounded in specifics

---

### Dimension 6: Contraction Usage

**What to measure:**
- Frequency: almost always, often, sometimes, rarely, never
- Which contractions appear (don't, can't, it's, we're, I'm, they've, etc.)
- Context: used in casual parts only, or also in formal claims?

**How to measure:**
Count contractions per 100 words. Note which ones appear.

**Example analysis:**

> "We've looked at three vendors and I think Vendor B is the right call. They're not the
> cheapest, but they're the most responsive. I wouldn't bet on Vendor A's support team —
> we've had issues before. Let's set up a call this week."

Count: 8 contractions in 45 words (~18 per 100 words). Includes: we've, I, they're, they're,
wouldn't, we've, Let's. High contraction usage, including in claims ("I think," "I wouldn't
bet"). This writer is consistently informal.

**Calibration notes:**
- Contraction rate: high (15-20 per 100 words)
- Uses contractions even when making assertions
- No context where contractions are avoided
- "Let's" appears frequently for suggesting action

---

### Dimension 7: Opening and Closing Patterns

**What to measure:**
- How the writer starts documents/emails/sections
- How the writer ends documents/emails/sections
- Favorite sentence starters
- Common closing formulas

**How to measure:**
Collect the first and last sentences from 8-10 pieces of writing.

**Example analysis:**

> Openings collected: "Quick update on..." / "I wanted to flag something..." / "Here's where
> we stand on..." / "A few things came up this week..." / "So I looked into this and..."
>
> Closings collected: "Let me know what you think." / "Happy to talk through this." /
> "I'll follow up after the meeting." / "Thoughts?" / "Let's decide Thursday."

Analysis: Opens casually and directly — usually states the purpose in the first sentence.
Never opens with pleasantries or context-building. Closes with a clear next step or
invitation to discuss. Very brief closings — often one sentence.

**Calibration notes:**
- Opens: direct statement of purpose, no preamble
- Closes: specific next step or discussion prompt
- No "Hope this helps" or "Best regards" type formulas
- Conversational but purposeful

---

### Dimension 8: Rhetorical Devices

**What to measure:**
- Metaphors and analogies (type and frequency)
- Analogies from specific domains (sports, cooking, music, etc.)
- Parallelism
- Rhetorical questions
- Understatement or hyperbole
- Lists and enumeration style

**How to measure:**
Flag rhetorical devices in the sample. Categorize and count.

**Example analysis:**

> Devices found:
> - Sports metaphor: "We need to get the ball over the goal line on this one."
> - Construction metaphor: "The foundation is solid; now we build on it."
> - Understatement: "Q3 was not our finest hour."
> - Rhetorical question: "Do we really need another meeting about this?"
> - Financial analogy: "This is a bet, not an investment."
> - Food metaphor: "Half-baked is worse than not baked at all."

Analysis: Mix of metaphors from different domains — sports, construction, finance, cooking.
No single dominant domain. Uses understatement as a humor/tonal device. Rhetorical questions
used sparingly for emphasis. One clear analogy per paragraph at most.

**Calibration notes:**
- Metaphors: 1-2 per longer piece, from varied domains
- Understatement: used for dry humor
- Rhetorical questions: rare, for emphasis only
- No extended analogies or elaborate metaphors

---

## Part 2: Voice Profiles

### Profile 1: Professional Formal

**Characteristics:**
- Sentence length: 18-25 words average, moderate variance
- Vocabulary: formal, precise, industry-standard jargon
- Contractions: rare to none (rate: 0-3 per 100 words)
- Tone: authoritative, measured, respectful
- Paragraphs: 4-6 sentences, topic sentence first
- Openings: context-setting, then thesis
- Closings: summary statement or clear recommendation
- Rhetorical devices: minimal; parallelism only
- Punctuation: standard, no exclamation marks

**Sample:**
> The proposed restructuring addresses the operational inefficiencies identified in the Q2
> audit. Consolidating the customer success and account management teams under a single
> reporting line will eliminate redundant handoffs and reduce response times. Based on the
> pilot program in the EMEA region, we anticipate a 30% reduction in escalation volume.
> We recommend proceeding with the full rollout in Q4, contingent on board approval.

**When to use:** Legal documents, board presentations, official policy documents, executive
summaries, external communications where formality is expected.

---

### Profile 2: Professional Casual

**Characteristics:**
- Sentence length: 12-18 words average, high variance
- Vocabulary: standard English, occasional jargon, plain language
- Contractions: moderate (8-12 per 100 words)
- Tone: friendly, direct, pragmatic
- Paragraphs: 3-5 sentences, mixed openings
- Openings: direct statement or question
- Closings: next step or question for the reader
- Rhetorical devices: occasional metaphor, dry humor
- Punctuation: moderate em-dashes, occasional semicolons

**Sample:**
> We looked at three options for the new office space and I think the Midtown location is
> the right call. It's not the cheapest, but it's close to transit and the layout actually
> works for how we collaborate — lots of small meeting rooms instead of one giant open floor.
> The SoHo space looked cool but the noise levels during our site visit were brutal. I'm
> putting together a cost comparison this week. Thoughts before I send it to finance?

**When to use:** Internal team emails, Slack messages, cross-functional updates, 1:1
communications, most day-to-day professional writing.

---

### Profile 3: Academic

**Characteristics:**
- Sentence length: 20-30 words average, low variance
- Vocabulary: precise, technical, field-specific terminology
- Contractions: none (formal academic) or rare (informal academic)
- Tone: objective, analytical, cautious with claims
- Paragraphs: 5-8 sentences, topic sentence then evidence
- Openings: literature context or research gap
- Closings: implications or limitations
- Rhetorical devices: hedging, qualification, citation framing
- Punctuation: semicolons common, em-dashes rare

**Sample:**
> Recent scholarship has examined the relationship between remote work arrangements and
> employee productivity, though findings remain mixed. Zhang et al. (2023) reported a
> 13% productivity increase among software engineers transitioning to fully remote work;
> however, their sample was limited to a single large technology firm. The present study
> extends this line of inquiry by examining productivity across three industries —
> technology, financial services, and healthcare — using a matched-pairs design. Results
> suggest that productivity effects are moderated by the degree of task interdependence,
> with collaboration-intensive roles showing the largest declines.

**When to use:** Research papers, academic publications, literature reviews, grant proposals,
dissertations, peer-reviewed submissions.

---

### Profile 4: Creative / Storytelling

**Characteristics:**
- Sentence length: highly variable (5-35 words), rhythm-driven
- Vocabulary: vivid, sensory, metaphorical, occasional slang
- Contractions: moderate to high, especially in dialogue
- Tone: engaging, personal, evocative
- Paragraphs: 2-5 sentences, varied structure
- Openings: hook — scene, image, question, or surprise
- Closings: resonant image or emotional beat
- Rhetorical devices: frequent metaphor, simile, sensory detail, varied sentence structure
- Punctuation: em-dashes, ellipses, fragments (intentional)

**Sample:**
> The office was quiet at 6 AM — just the hum of the HVAC and the click of Marcus's keyboard.
> He'd been at it since four, chasing a bug that showed up only when the data set exceeded
> ten million rows. Not exactly glamorous work. But that was the thing about engineering:
> the important problems never looked important from the outside. They just looked like a
> guy staring at a screen, drinking cold coffee, muttering to himself.

**When to use:** Blog posts, narrative nonfiction, personal essays, company culture pieces,
newsletter content, speeches.

---

### Profile 5: Direct / Executive

**Characteristics:**
- Sentence length: 10-15 words average, very short and punchy
- Vocabulary: business-standard, no jargon, no fluff
- Contractions: moderate (5-8 per 100 words)
- Tone: commanding, decisive, no-nonsense
- Paragraphs: 2-3 sentences, each makes one point
- Openings: the bottom line first
- Closings: decision required or deadline
- Rhetorical devices: none — clarity is the only goal
- Punctuation: periods and commas only, nothing decorative

**Sample:**
> Revenue missed target by 8%. The gap is entirely in enterprise deals — mid-market and SMB
> hit their numbers. Three enterprise deals slipped to Q4, two because of procurement delays
> and one because we lost to a competitor on price. I want a revised Q4 pipeline by Friday
> and a pricing review for the enterprise tier. Schedule time with the CFO for next week.

**When to use:** Executive summaries, board updates, crisis communications, time-sensitive
decisions, status reports to senior leadership.

---

### Profile 6: Conversational

**Characteristics:**
- Sentence length: 8-15 words average, frequent fragments
- Vocabulary: everyday language, casual, relatable
- Contractions: high (15-20+ per 100 words)
- Tone: warm, helpful, approachable
- Paragraphs: 2-4 sentences, sometimes just one
- Openings: friendly acknowledgment or direct question
- Closings: casual sign-off, offer to help
- Rhetorical devices: casual analogies, occasional exaggeration
- Punctuation: loose, em-dashes, exclamation marks (1-2 per piece)

**Sample:**
> Hey! So I checked on that thing you asked about and it turns out the vendor does support
> bulk imports — you just have to use their API directly. The UI doesn't have it built in
> yet, which is annoying, but the API docs are actually pretty good. Want me to walk you
> through it? I could set up a quick call tomorrow if that's easier than going back and
> forth here.

**When to use:** Slack conversations, casual team chat, peer-to-peer help, onboarding
conversations, informal knowledge sharing.

---

## Part 3: Applying the Voice Profile to the Rewrite

### The Calibration Process

**Step 1: Score the sample.** Use the 8 dimensions to document the voice characteristics.
Fill out the calibration template below.

**Step 2: Identify the closest profile.** Match to one of the 6 profiles above. Note where
the user's voice diverges from the profile — those divergences are the most authentic parts
of their writing.

**Step 3: Write calibration parameters.** Before rewriting, list the specific rules you'll
follow. See the template below.

**Step 4: Draft with constraints.** As you rewrite, check every paragraph against the
calibration parameters. Adjust in real time.

**Step 5: Read-aloud test.** Read the output alongside the original sample. Do they sound
like the same person wrote them?

### Calibration Template

```
VOICE CALIBRATION — [Project/User Name]
Date: ___________

1. SENTENCE LENGTH
   Average: ____ words
   Range: ____ to ____
   Rhythm pattern: ___________________________

2. VOCABULARY LEVEL
   Formal / Casual / Mixed: _____________
   Jargon level: Low / Medium / High
   Key vocabulary traits: ___________________

3. PUNCTUATION HABITS
   Em-dashes per paragraph: ____
   Semicolons per paragraph: ____
   Exclamation marks per piece: ____
   Notable patterns: ________________________

4. PARAGRAPH STRUCTURE
   Average sentences per paragraph: ____
   Typical opening: ________________________
   Typical closing: ________________________
   Transition style: ________________________

5. TONE MARKERS
   Directness: 1-5: ____
   Humor: None / Dry / Warm / Playful
   Warmth: 1-5: ____
   Skepticism: 1-5: ____

6. CONTRACTION USAGE
   Rate per 100 words: ____
   Notable contractions: ____________________

7. OPENING/CLOSING PATTERNS
   Typical opening: ________________________
   Typical closing: ________________________

8. RHETORICAL DEVICES
   Metaphor frequency: ____
   Common domains: ________________________
   Other devices: __________________________

CLOSEST PROFILE: _______________
KEY DIVERGENCES FROM PROFILE: _______________

REWRITE PARAMETERS:
- Target sentence length: ____
- Contraction rate: ____
- Tone: ____
- Opening style: ____
- Closing style: ____
- Avoid: ____________________
- Include: ____________________
```

### Common Calibration Mistakes

1. **Over-calibrating to a single sample.** One email doesn't capture a full voice. Use
   multiple samples across different contexts.

2. **Ignoring context.** A Slack message and a quarterly report from the same person may
   sound completely different. Calibrate to the output context.

3. **Calibrating to AI text.** If the "writing sample" was itself AI-generated, you'll
   inherit AI patterns. Verify the sample is genuinely human-written.

4. **Making it too consistent.** Real humans aren't perfectly consistent. Allow some
   natural variation — that's what makes writing feel human.

5. **Copying quirks that don't transfer.** If someone uses "lol" in Slack, that doesn't
   mean it belongs in their client-facing email. Adapt to the output context.

6. **Forgetting substance.** Voice calibration applies style, not substance. Don't add
   opinions or claims that weren't in the original just because the user's voice is
   opinionated. Match the style, preserve the content.
