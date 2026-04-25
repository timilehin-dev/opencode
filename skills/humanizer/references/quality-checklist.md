# Quality Checklist — Quick Reference

A one-page quick reference for the humanizer workflow. Use this during every rewrite to
ensure quality and completeness.

---

## Pre-Rewrite Checklist

Complete these 15 checks BEFORE starting the rewrite.

### Content & Structure

- [ ] **1. Read the full input.** Do not start rewriting until you've read the entire
  text at least once. You need to understand the full argument before touching anything.

- [ ] **2. Identify the purpose.** What is this text trying to accomplish? Inform?
  Persuade? Instruct? The rewrite must preserve this purpose.

- [ ] **3. Extract key information.** List every factual claim, data point, name, date,
  and number in the input. These must all survive the rewrite unchanged.

- [ ] **4. Note the audience.** Who is this written for? Internal team? External clients?
  General public? The voice and formality should match.

- [ ] **5. Check for a voice sample.** Did the user provide a writing sample or reference
  text? If yes, run the voice calibration (see voice-calibration-guide.md). If no, default
  to Professional Casual profile.

### Pattern Detection

- [ ] **6. Scan for Content Patterns (1-6).** Mark every instance of significance
  inflation, notability emphasis, -ing analyses, promotional language, vague attributions,
  and outline-like challenge sections.

- [ ] **7. Scan for Language Patterns (7-13).** Highlight every AI vocabulary word, copula
  avoidance construction, negative parallelism, rule of three, elegant variation, false range,
  and passive voice overuse.

- [ ] **8. Scan for Style Patterns (14-18).** Count em-dashes per paragraph, flag boldface
  in body text, check for inline header lists, title case overuse, and emojis in professional
  content.

- [ ] **9. Scan for Communication Patterns (19-21).** Mark every collaborative artifact
  ("Let's explore," "Ready to get started?"), knowledge-cutoff disclaimer, and sycophantic
  marker ("That's a great question!").

- [ ] **10. Scan for Filler & Hedging (22-29).** Flag filler phrases, excessive hedging,
  generic conclusions, hyphenated word pair chains, authority tropes, signposting, fragmented
  headers, and wall-of-text introductions.

### Readiness

- [ ] **11. Count total pattern instances.** How many AI patterns did you find? If the
  input has fewer than 5, the rewrite should be light. If it has 20+, expect a near-total
  restructuring.

- [ ] **12. Assess structural damage.** Does the input have a coherent structure underneath
  the AI patterns, or is the structure itself AI-generated (outline-like, repetitive,
  signposted)? The answer determines how much restructuring you'll need.

- [ ] **13. Identify the strongest content.** What are the 2-3 strongest points in the
  input? These should become the backbone of the rewrite. Everything else supports them.

- [ ] **14. Check for meaning ambiguity.** Are there any claims in the input that are
  vague or could be interpreted multiple ways? Flag these — you'll need to either clarify
  or preserve the ambiguity intentionally.

- [ ] **15. Confirm scope with the user (if needed).** If the input is very long or the
  patterns are pervasive, consider whether a full rewrite or a targeted cleanup is more
  appropriate. Don't silently rewrite 5,000 words if the user expected a light edit.

---

## Post-Rewrite Checklist

Complete these 15 checks AFTER finishing the rewrite.

### Pattern Elimination

- [ ] **1. Zero AI vocabulary words.** Search the output for every word in the replacement
  table below. None should remain.

- [ ] **2. Zero collaborative artifacts.** Search for: "Let's," "Ready to," "Shall we,"
  "Let me walk you through," "Let's dive in." None should remain.

- [ ] **3. Zero sycophantic markers.** Search for: "Great question," "Absolutely,"
  "Spot on," "You're right," "Good thinking." None should remain in professional writing.

- [ ] **4. Zero knowledge disclaimers.** Search for: "As an AI," "As of my last update,"
  "I don't have access." None should remain.

- [ ] **5. Zero generic conclusions.** Search for: "In conclusion," "Ultimately," "The key
  takeaway," "As we've seen," "At its core." None should remain.

### Structure & Quality

- [ ] **6. Every paragraph has 3+ sentences.** No single-sentence paragraphs. Each paragraph
  should develop one complete idea with enough substance to stand on its own.

- [ ] **7. Sentence length varies.** Check 10 consecutive sentences. The longest should be
  at least 2x the shortest. If every sentence is the same length, it reads robotic.

- [ ] **8. Active voice is 80%+.** Skim for "is/are/was/were" + past participle
  constructions. Passive voice is fine occasionally, but it shouldn't be the default.

- [ ] **9. No meaning was lost.** Compare the key information list (pre-rewrite check #3)
  against the output. Every fact, number, name, and date must be present.

- [ ] **10. The purpose is preserved.** Does the rewrite accomplish the same thing as the
  input? It should inform, persuade, or instruct the same audience about the same topic.

### Voice & Tone

- [ ] **11. Voice matches the calibration target.** If a writing sample was provided, the
  output should read like the same person wrote it. Check sentence length, vocabulary,
  contraction usage, and tone against the calibration parameters.

- [ ] **12. Read-aloud test.** Read the entire output aloud. If you stumble on a sentence
  or if anything sounds like a textbook, marketing deck, or AI chatbot, it needs revision.

- [ ] **13. No em-dash overload.** Count em-dashes: no more than 2 per paragraph. If a
  paragraph has 3+, restructure using periods, commas, or parentheses.

- [ ] **14. Openings are strong.** The document opens with the most interesting or
  important point — not with context, filler, or a summary of everything that follows.

- [ ] **15. Closings are specific.** The document ends with a concrete point, not a
  generic wrap-up. The last sentence should be the strongest, not a fade-out.

---

## Word Replacement Table

Replace these AI-frequent words with more natural alternatives. This table covers the most
reliable AI vocabulary signals — words that appear in AI-generated text at 5-20x the rate
they appear in human writing.

| AI Word | Natural Alternatives | Context Notes |
|---------|---------------------|---------------|
| delve | explore, look into, dig into, examine | "Delve" is the single strongest AI marker. Almost never use it. |
| landscape | field, space, market, industry, area | "The X landscape" is a dead giveaway. Just say "X" or "the X market." |
| leverage | use, build on, take advantage of, apply | "Leverage" is fine in finance (leveraged buyout). Everywhere else, use "use." |
| utilize | use, work with, employ, rely on | "Utilize" adds no meaning over "use." Drop it. |
| facilitate | help, enable, allow, make easier | "Facilitate" sounds like a committee wrote it. "Help" is almost always better. |
| implement | roll out, put in place, set up, launch | "Implement" is fine for APIs. For everything else, use a more vivid verb. |
| comprehensive | full, complete, thorough, detailed | Usually adds length without adding meaning. Cut it or be specific. |
| robust | strong, solid, reliable, sturdy | Overused in tech writing. Specify what makes it strong instead. |
| streamline | speed up, simplify, smooth out, improve | Only use when referring to literal process flow. Otherwise "improve" or "simplify." |
| seamless | smooth, effortless, without friction | Nothing is truly seamless. "Smooth" is honest and sufficient. |
| foster | build, encourage, grow, promote, support | "Foster a culture of..." is AI's favorite phrase. Use "build" or "create." |
| tailored | customized, fitted, adapted, specific | "Tailored" is fine for clothes. For everything else, be specific about what changed. |
| pivot | shift, change direction, refocus, redirect | Overused since 2020. "Shift" or "refocus" is usually better. |
| granular | detailed, specific, fine-grained | "Granular" is technical jargon repurposed as buzzword. "Detailed" works fine. |
| actionable | useful, practical, concrete, specific | Most "actionable insights" are just insights. Let the adjective earn its place. |
| ecosystem | network, system, platform, set of tools | "Ecosystem" inflates. A set of integrated tools is just that. |
| paramount | essential, critical, vital, top priority | Overly dramatic. "Essential" or "critical" conveys urgency without melodrama. |
| stakeholders | team, people involved, everyone affected | "Stakeholders" is fine in formal contexts. In casual writing, name the actual people. |
| embark | start, begin, kick off, launch | "Embark on a journey" is AI writing at its most clichéd. Just say "start." |
| elevate | improve, raise, strengthen, upgrade | "Elevate your game" is motivational-speaker territory. Specify the improvement. |
| demystify | explain, clarify, break down, unpack | Usually followed by something that wasn't actually mysterious. Just explain it. |
| empower | enable, help, give tools to, support | "Empower" is overused to the point of meaninglessness. Use a more specific verb. |
| navigating | working through, dealing with, managing, handling | "Navigating complex X" is an AI construction. Say what's hard and how to deal with it. |
| testament | proof, sign, evidence, shows | "Is a testament to" is literary fluff. "Shows" or "proves" is stronger and shorter. |
| tapestry | mix, combination, web, blend | "Tapestry" is AI's go-to metaphor for complexity. Almost always cut it. |
| realm | area, field, world, space | "In the realm of" is wordy. "In" works. |
| pivotal | important, key, central, critical | Everything can't be pivotal. Use "key" or "important" and let the context add weight. |
| holistic | complete, full, overall, all-inclusive | Often a filler. Specify what's being included rather than claiming totality. |
| synergistic | combined, collaborative, joint, cooperative | "Synergistic" is corporate jargon. "Combined" or "working together" is clearer. |
| innovative | new, different, original, creative | If something is actually new, describe what's new about it. The label adds nothing. |
| cutting-edge | latest, advanced, new, current | Overused. If it's the latest version, say that. Otherwise, describe the capability. |
| groundbreaking | new, first-of-its-kind, breakthrough | Reserve for actual breakthroughs. Most things are just new or improved. |
| state-of-the-art | latest, current, modern, best available | Usually just means "current version." Say that instead. |
| transformative | major, significant, game-changing, far-reaching | Describe the specific change and its impact. The adjective is a shortcut. |
| game-changer | breakthrough, big deal, major shift | Casual equivalent of "transformative." Same advice: show, don't label. |
| paradigm shift | major change, fundamental change, new approach | Almost never literally true. Describe the change specifically. |
| unprecedented | never seen before, record, unusual | Overused since 2020. Most things have precedent. Use only if literally true. |
| additionally | also, plus, on top of that, and | "Additionally" is stilted. "Also" or "and" is almost always better. |
| furthermore | also, and, besides, what's more | Same as above. "Furthermore" signals AI or academic writing. |
| consequently | so, as a result, therefore, that's why | "Consequently" is formal to the point of stiffness. "So" works in most contexts. |
| approximately | about, roughly, around, close to | "Approximately" is fine in technical writing. Elsewhere, "about" is more natural. |
| plethora | many, a lot of, dozens of, plenty of | "A plethora of" is thesaurus abuse. "Many" or "a lot of" is honest. |
| myriad | many, countless, lots of, a wide range of | Often misused as a noun ("a myriad of"). Use "many" or "countless." |
| imperative | essential, must, critical, necessary | "It's imperative that" is AI's version of "you must." Just say what needs to happen. |
| notably | especially, in particular, particularly | "Notably" is a notability marker (Pattern #2). Cut it and state the point directly. |
| importantly | — | Almost always cut. If something is important, it should be obvious without a label. |
| crucially | — | Same as above. The point should be strong enough to stand on its own. |
| significantly | noticeably, substantially, a lot, meaningfully | Sometimes legitimate for data. Often just inflation. Check if the data supports it. |
| inherently | naturally, by nature, basically, by definition | Usually adds nothing. "X is inherently Y" → "X is Y." |
| oftentimes | often, frequently, usually | "Oftentimes" is wordy. "Often" means the same thing. |
| overarching | main, primary, central, big-picture | Fine in moderation. Overused as an AI inflation word. |
|旨在 (Chinese) | — | If working in multilingual contexts, note that Chinese AI has its own cliché patterns. |

---

## Quick-Scan Search Strings

Run these searches on the output to catch remaining AI patterns quickly:

```
# AI vocabulary (search as whole words)
\b(delve|landscape|leverage|utilize|facilitate|implement|comprehensive|robust|streamline|seamless|foster|tailored|pivot|granular|actionable|stakeholders|ecosystem|paramount)\b

# Collaborative artifacts
\b(Let's |Ready to |Shall we|walk you through|dive into)\b

# Sycophantic markers
\b(Great question|Absolutely|Spot on|You're right|Good thinking|Excellent point)\b

# Significance inflation
\b(significant|fundamental|paradigm|cannot be overstated|important to recognize|crucial to understand)\b

# Generic conclusions
\b(In conclusion|Ultimately|The key takeaway|As we've seen|At its core|In summary)\b

# Hedging
\b(It could be argued|There's a case to be made|In some ways|To some extent|It's possible that|One might consider)\b

# Signposting
\b(In this section|First, let's|Next, we'll|Finally, we'll|Let's explore|Let's consider)\b

# Filler phrases
\b(In today's rapidly|increasingly|At the end of the day|When it comes to)\b
```

---

## Emergency Fixes — When You're Stuck

**Problem: The rewrite sounds flat.**
→ Vary sentence length more aggressively. Add one very short sentence (3-5 words) after a
long one. Cut a filler sentence that restates something already said.

**Problem: The rewrite sounds too casual.**
→ Reduce contractions. Replace "you" with the specific subject (users, teams, engineers).
Add one precise technical detail per paragraph.

**Problem: The rewrite sounds too formal.**
→ Add contractions. Replace "therefore" with "so." Replace "individuals" with "people."
Break one long sentence into two shorter ones.

**Problem: The rewrite lost the original's structure.**
→ Go back to the pre-rewrite key information list (check #3). Make sure every data point and
claim is present. The structure can change, but the content must survive.

**Problem: You can't tell if it sounds human.**
→ Read it aloud at normal speaking pace. If it sounds like something someone would say in a
meeting or write in a real email, it's good. If it sounds like it was assembled from a list
of best practices, revise.
