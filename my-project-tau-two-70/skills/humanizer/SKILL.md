---
name: humanizer
description: "Transform AI-generated text into natural, human-sounding writing. Detect and eliminate 29 categories of AI writing patterns including significance inflation, collaborative artifacts, sycophantic tone, excessive hedging, and robotic vocabulary. Apply voice calibration to match a target writing style."
tags: [writing, editing, content, communication, productivity]
version: "2.5.1"
license: MIT
metadata:
  author: Klawhub
  category: communication
  difficulty: intermediate
  tools: [docx, pdf, web-reader]
  compatibility: claude-code, opencode
---

# Humanizer — AI Writing Humanizer

## Purpose
Transform AI-generated text into authentic, natural, human-sounding writing that is indistinguishable from content written by a skilled human writer. This skill detects and systematically eliminates 29 categories of AI writing patterns.

## When to Activate
- User provides AI-generated text and asks it to sound more natural or human
- User asks to "humanize," "rewrite," "make sound less robotic," or "remove AI patterns"
- Content needs to pass AI detection tools or meet editorial quality standards
- Email drafts, blog posts, reports, or any written content needs a human touch

## Voice Calibration (CRITICAL — Do This First)

If the user provides a writing sample or reference text, analyze it for:
1. **Sentence length distribution** — average, range, and rhythm patterns
2. **Vocabulary level** — formal vs. casual, technical vs. accessible
3. **Punctuation habits** — em-dash frequency, semicolon usage, comma splices
4. **Paragraph structure** — average sentences per paragraph, topic flow
5. **Tone markers** — humor, directness, warmth, assertiveness
6. **Contraction usage** — frequency and style
7. **Opening/closing patterns** — how they start and end thoughts

Match these characteristics in the output. If no sample is provided, default to:
- Conversational professional tone
- Mixed sentence lengths (short and long for rhythm)
- Moderate contractions
- Direct statements over hedged ones

## AI Pattern Detection — 29 Categories

### Category A: Content Patterns

**1. Significance Inflation**
- Pattern: "This represents a significant/fundamental/paradigm shift in..."
- Pattern: "It's important to recognize/understand/acknowledge that..."
- Pattern: "This cannot be overstated/overemphasized"
- Fix: State the point directly without inflation. Remove significance qualifiers.

**2. Notability Emphasis**
- Pattern: "Notably/Importantly/Significantly/Crucially, ..."
- Pattern: "It's worth noting/mentioning/highlighting that..."
- Fix: Remove the marker. If the point matters, it will stand on its own.

**3. Superficial -ing Analyses**
- Pattern: "By leveraging X, organizations can achieve Y"
- Pattern: "Utilizing this approach enables teams to..."
- Fix: Use concrete subjects and verbs. "Teams that use X achieve Y."

**4. Promotional Language**
- Pattern: "Cutting-edge/innovative/groundbreaking/state-of-the-art"
- Pattern: "Revolutionize/transform/elevate your [workflow/process]"
- Fix: Replace with factual descriptions. "This approach reduces processing time by 40%."

**5. Vague Attributions**
- Pattern: "Experts agree/studies show/research suggests..."
- Fix: Name the specific source or remove the claim. "A 2023 McKinsey study found..."

**6. Outline-like Challenges Sections**
- Pattern: Headers like "Challenges," "Considerations," "Key Takeaways" followed by bullet lists with 1-2 sentence explanations
- Fix: Weave challenges naturally into the narrative flow

### Category B: Language & Grammar Patterns

**7. AI Vocabulary**
- Words to eliminate: "delve," "landscape," "leverage," "utilize," "facilitate," "implement," "comprehensive," "robust," "streamline," "seamless," "foster," "tailored," "pivot," "granular," "actionable," "stakeholders," "ecosystem," "paramount"
- Replacement: Use simpler, more specific alternatives

**8. Copula Avoidance**
- Pattern: Avoiding "is/are" by using constructions like "serves as," "functions as," "acts as"
- Fix: Use "is" and "are" — they're perfectly fine verbs

**9. Negative Parallelisms**
- Pattern: "not just X, but Y" / "not merely X, but also Y"
- Fix: Say Y directly. If X is worth mentioning, state it plainly.

**10. Rule of Three**
- Pattern: "fast, reliable, and scalable" / "simple, effective, and powerful"
- Fix: Use the one or two descriptors that actually matter

**11. Elegant Variation**
- Pattern: Using different words for the same thing to avoid repetition
- Fix: Consistent terminology is clearer than a thesaurus

**12. False Ranges**
- Pattern: "everything from X to Y" / "ranging from X to Y"
- Fix: Be specific about what's actually covered

**13. Passive Voice Overuse**
- Pattern: "It should be noted that..." / "Decisions were made to..."
- Fix: Use active voice. "Note that..." / "We decided to..."

### Category C: Style Patterns

**14. Em Dash Overuse**
- Pattern: More than 2 em-dashes per paragraph
- Fix: Use periods, commas, or parentheses for variety

**15. Boldface Overuse**
- Pattern: Bold text in the middle of sentences or paragraphs
- Fix: Use bold only for true emphasis, not for rhythm or decoration

**16. Inline Header Lists**
- Pattern: Headers within paragraphs followed by explanations
- Fix: Use prose or proper lists, not hybrid header-text constructs

**17. Title Case Overuse**
- Pattern: Capitalizing words that don't need it: "The Implementation of the Dashboard"
- Fix: Only capitalize proper nouns and the first word of sentences

**18. Emojis in Professional Content**
- Pattern: Using emojis in reports, proposals, or formal writing
- Fix: Remove emojis from professional content unless explicitly requested

### Category D: Communication Patterns

**19. Collaborative Artifacts**
- Pattern: "Let's explore..." / "Let's dive into..." / "Let me walk you through..."
- Pattern: "Shall we?" / "Ready to get started?"
- Fix: Write as a direct document, not a conversation

**20. Knowledge-Cutoff Disclaimers**
- Pattern: "As of my last update..." / "As an AI language model..."
- Fix: Remove entirely — never include these

**21. Sycophantic Tone**
- Pattern: "That's a great question!" / "Absolutely!" / "You're spot on!"
- Pattern: Excessive agreement and validation before answering
- Fix: Answer directly. Acknowledge only when genuinely adding value.

### Category E: Filler & Hedging

**22. Filler Phrases**
- Pattern: "In today's rapidly evolving..." / "In an increasingly... world"
- Pattern: "At the end of the day" / "When it comes to"
- Fix: Delete and start with the actual point

**23. Excessive Hedging**
- Pattern: "It could be argued that..." / "There's a case to be made..."
- Pattern: "In some ways..." / "To some extent..."
- Fix: State your position with appropriate confidence

**24. Generic Conclusions**
- Pattern: "Ultimately..." / "In conclusion..." / "The key takeaway is..."
- Fix: Let the content speak for itself. End with the strongest point.

**25. Hyphenated Word Pairs**
- Pattern: "cost-effective," "time-saving," "high-quality," "user-friendly"
- Fix: These are fine in moderation but watch for overuse. Rephrase when possible.

**26. Persuasive Authority Tropes**
- Pattern: "It's no secret that..." / "The data speaks for itself..."
- Fix: Present the data directly without meta-commentary

**27. Signposting**
- Pattern: "In this section, we'll explore..." / "First, let's consider..."
- Fix: Dive directly into the content

**28. Fragmented Headers**
- Pattern: Short headers every 1-2 paragraphs that break flow
- Fix: Use headers only for genuine section changes

**29. Wall-of-Text Introduction**
- Pattern: Long opening paragraph that summarizes everything before saying anything
- Fix: Start with the most interesting or important point

## Processing Workflow

### Step 1: Pattern Audit
Read the input text and identify ALL instances of the 29 patterns. Mark each one.

### Step 2: Structural Assessment
Evaluate the overall structure:
- Is the opening engaging or generic?
- Does each paragraph develop a single clear idea?
- Is there unnecessary repetition?
- Are transitions natural or formulaic?

### Step 3: Rewrite
Apply voice calibration and eliminate all detected patterns:
- Replace AI vocabulary with natural alternatives
- Restructure sentences for varied rhythm
- Remove all collaborative artifacts and sycophantic markers
- Ensure each paragraph has 3-5 substantive sentences
- Build to strong conclusions without generic wrap-ups

### Step 4: Quality Check
- Read the output aloud — does it sound like a human wrote it?
- Check for any remaining AI patterns from the 29 categories
- Verify the voice matches the calibration target
- Ensure no meaning was lost in the rewrite

## Quality Standards
- Every paragraph must have at least 3 sentences
- No paragraph may be a single sentence
- Sentence length must vary (combine short punchy statements with longer ones)
- Active voice should be used 80%+ of the time
- Zero instances of the 29 AI patterns in the final output
- The text must convey the same information and meaning as the input
- Technical accuracy must be preserved
