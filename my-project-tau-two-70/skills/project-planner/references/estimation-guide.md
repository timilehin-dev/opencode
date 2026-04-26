# Estimation Methodology Guide

> A comprehensive reference for accurate, consistent project estimation across work types.

---

## 1. Story Points System (Fibonacci Scale)

Story points measure effort, complexity, and uncertainty — not time alone. Use the Fibonacci sequence to reflect that larger tasks carry exponentially more uncertainty.

### Point Definitions

| Points | Label | Description | Example |
|--------|-------|-------------|---------|
| **1** | Trivial | Well-understood, no unknowns, minimal testing. Can be done in under an hour. | Update button label text |
| **2** | Simple | Straightforward logic, minor edge cases, clear acceptance criteria. | Add a sortable column to an existing table |
| **3** | Moderate | Multiple steps, some design decisions, moderate testing required. | Build a basic CRUD form with validation |
| **5** | Complex | Significant logic, cross-component changes, requires design input, non-trivial testing. | Implement search with filtering, pagination, and highlighting |
| **8** | Very Complex | Cross-system integration, performance considerations, unclear edge cases, significant testing. | Build a real-time notification system with WebSocket fallback |
| **13** | Epic / Unknown | High uncertainty, research needed, may need to be broken down further. Avoid assigning; split first. | Full payment integration with multiple providers and retry logic |

### Estimation Dimensions

For each story, consider all three dimensions:

1. **Effort**: How much work is involved?
2. **Complexity**: How difficult is the work?
3. **Uncertainty / Risk**: What don't we know yet?

The final point value reflects the *highest* of the three dimensions. A task that is low effort but high uncertainty (e.g., "update this third-party library") should score higher than the effort alone suggests.

### Rules of Thumb

- **Never estimate in hours first, then convert.** Story points are intentionally abstract.
- **Anything scoring 13+ should be broken into smaller stories** before estimating.
- **Compare to reference stories** — always anchor against a story the team already completed at a known size.
- **Each team defines its own scale.** A "5" for one team is not the same as a "5" for another.

---

## 2. Planning Poker Methodology

Planning Poker is a consensus-based estimation technique that prevents anchoring and ensures every voice is heard.

### Session Setup

- **Participants**: All developers contributing to the sprint, plus the Product Owner (for questions, not voting).
- **Materials**: A deck of Fibonacci cards (physical or digital) per participant.
- **Pre-requisite**: Stories are groomed, acceptance criteria exist, and any necessary design/technical spikes are complete.

### Process

1. **The Product Owner reads the story** and answers clarifying questions (no solution discussion yet).
2. **Each participant selects a card privately** — no sharing until all have chosen.
3. **All cards are revealed simultaneously.**
4. **Discussion round:**
   - If all cards are the same or adjacent (e.g., 3 and 5), take the higher value.
   - If there is wide disagreement (e.g., 2 vs 8), the **lowest and highest estimators explain their reasoning**.
5. **Re-vote** after discussion.
6. **Repeat until consensus** (or a majority with no strong objection after 2 rounds).
7. **Time-box**: Maximum 5 minutes per story. If unresolved, flag for a follow-up.

### Handling Disagreements

- **Focus on the "why"**, not on convincing others. The goal is shared understanding.
- **Avoid "splitting the difference"** — that just masks disagreement.
- **If a senior developer says 2 and a junior says 8**, this often means the task contains hidden complexity that the senior is discounting. Explore it.
- **Allow "I don't know"** as a valid vote. It means the story needs more grooming.

### Anchoring Bias Avoidance

- **Never reveal estimates** until all cards are down (simultaneous reveal).
- **The Product Owner must not suggest** a number before the vote.
- **Rotate who reads the story** to prevent a single voice from framing every discussion.

---

## 3. PERT Estimation

PERT (Program Evaluation and Review Technique) is a statistical method for estimating task duration when uncertainty is high.

### Formula

```
PERT Estimate = (Optimistic + 4 × Most Likely + Pessimistic) / 6
Standard Deviation = (Pessimistic - Optimistic) / 6
```

### Worked Examples

**Example 1: API Endpoint Development**
- Optimistic (O): 2 days
- Most Likely (M): 3 days
- Pessimistic (P): 7 days (includes potential auth issues)

```
PERT = (2 + 4×3 + 7) / 6 = (2 + 12 + 7) / 6 = 21 / 6 = 3.5 days
SD = (7 - 2) / 6 = 0.83 days
```

Range at 95% confidence: 3.5 ± (2 × 0.83) = **1.8 to 5.2 days**

**Example 2: Database Migration**
- Optimistic (O): 1 day
- Most Likely (M): 2 days
- Pessimistic (P): 10 days (complex data mapping, possible rollback)

```
PERT = (1 + 4×2 + 10) / 6 = (1 + 8 + 10) / 6 = 19 / 6 = 3.2 days
SD = (10 - 1) / 6 = 1.5 days
```

Range at 95% confidence: 3.2 ± (2 × 1.5) = **0.2 to 6.2 days**

### When to Use PERT vs Story Points

| Situation | Use PERT | Use Story Points |
|-----------|----------|-----------------|
| Sprint planning with experienced team | | ✓ |
| One-off project with no velocity history | ✓ | |
| Contract work with billing implications | ✓ | |
| Research/exploration tasks with high uncertainty | ✓ | |
| Ongoing product development | | ✓ |
| Tasks needing date commitments for stakeholders | ✓ | |

---

## 4. Velocity Tracking

Velocity is the team's average story points completed per sprint. It is a planning tool, not a performance metric.

### Calculation

```
Sprint Velocity = Sum of story points for all stories completed in the sprint
```

**Rules for counting:**
- Only count **fully completed** stories (meets all acceptance criteria, tested, reviewed).
- Partially done stories count as **zero**.
- Bug fixes and chores are tracked separately (do not inflate velocity).

### Establishing a Baseline

- **Minimum 3 sprints** before using velocity for reliable forecasting.
- Calculate a **range**: `[average - 1 SD, average + 1 SD]`.
- Plan against the **low end** of the range for commitments; use the average for forecasting.

### Accounting for Interruptions

Track **planned capacity** vs actual:

```
Planned Capacity = Sprint Days × Team Size × Hours per Day
Actual Capacity = Planned Capacity - Support Hours - Meeting Overhead - Absences
Capacity Ratio = Actual Capacity / Planned Capacity
```

Apply the capacity ratio to velocity when planning:

```
Adjusted Velocity = Baseline Velocity × Capacity Ratio
```

### Velocity Anti-Patterns

- **Gaming the numbers**: Splitting stories to inflate velocity, or inflating point values.
- **Comparing across teams**: Velocity is team-specific.
- **Using velocity as a KPI**: This incentivizes gaming and demoralizes the team.
- **Ignoring trends**: If velocity drops for 2+ sprints, investigate — don't just accept it.

---

## 5. Estimation by Work Type

Not all work fits story points. Match the estimation technique to the work type.

### Feature Development → Story Points

- Use Fibonacci scale.
- Break down epics into stories before estimating.
- Include testing and documentation effort in the estimate.

### Bug Fixes → Time-Based

- **Trivial**: Under 30 min — fix inline, no tracking needed.
- **Minor**: 30 min to 2 hours — track individually.
- **Major**: 2 hours to 1 day — create a task with time estimate.
- **Critical**: Over 1 day — investigate first, estimate after root cause is understood.

Time-box bug investigation to avoid open-ended effort.

### Infrastructure / DevOps → Time-Based

- Estimate in hours or days.
- Include testing time (e.g., verifying the deployment pipeline works).
- Add a 30% buffer for infrastructure work — dependencies on external systems are common.

### Documentation → Time-Based

- **Inline code docs**: Include in the feature story point estimate.
- **User-facing docs**: Estimate separately in hours.
- **Technical specs / RFCs**: 2-8 hours depending on scope; use PERT for complex specs.

### Research / Spikes → Time-Boxed

- Always set a maximum time limit (e.g., "spike, max 8 hours").
- The output is a recommendation and refined estimate, not production code.
- After the spike, estimate the resulting work using the appropriate method.

---

## 6. Common Estimation Biases and Mitigations

### Optimism Bias

**What**: Consistently underestimating effort because "this time will be different."

**Signs**: Historical actuals are 30-50% higher than estimates across multiple sprints.

**Mitigation**:
- Track estimation accuracy: `Actual / Estimated` ratio over time.
- Apply a **calibration factor** based on historical data (if your team consistently takes 1.3× their estimates, plan at 0.77× velocity).
- Use reference class forecasting: compare to similar past tasks.

### Anchoring Bias

**What**: The first number mentioned disproportionately influences the final estimate.

**Signs**: The first person to speak sets the estimate, and the group converges on it.

**Mitigation**:
- Use Planning Poker (simultaneous reveal).
- For PERT, gather O/M/P independently before sharing.

### Planning Fallacy

**What**: Underestimating time even when you know similar tasks took longer in the past.

**Signs**: Every project is "different this time" yet results are consistently late.

**Mitigation**:
- Mandate reference to historical data for any estimate.
- Use PERT with a deliberately pessimistic P value.
- Ask: "When was the last time we did something similar, and how long did it actually take?"

### Expert Bias

**What**: Deferring to the most senior/ loudest voice, suppressing other perspectives.

**Signs**: Junior developers stop contributing to estimation discussions.

**Mitigation**:
- Anonymous estimation (Planning Poker without discussion on the first round).
- Rotate facilitation of estimation sessions.
- Explicitly ask quieter team members for their reasoning.

---

## 7. Re-Estimation Triggers

Estimates are hypotheses. Update them when evidence changes.

### Mandatory Re-Estimation Triggers

| Trigger | Action |
|---------|--------|
| **Scope change** requested by stakeholders | Re-estimate affected stories |
| **New technical information** discovered during implementation | Re-estimate remaining work |
| **Velocity deviation > 20%** for 2 consecutive sprints | Review all outstanding estimates |
| **Dependency change** (e.g., upstream API changes) | Re-estimate dependent stories |
| **Team member joins or leaves** | Recalculate velocity baseline |
| **Unplanned absences** exceeding 20% of sprint capacity | Reduce sprint commitment |

### Voluntary Re-Estimation Triggers

- A developer consistently finishes stories well under/over estimate.
- New tooling or framework is adopted that changes productivity.
- Major refactoring is completed that changes the codebase landscape.

### Process

1. Identify the trigger and affected scope.
2. Gather the team for a focused estimation session (15-30 min).
3. Document the reason for re-estimation and the previous vs new values.
4. Communicate impact to stakeholders if the timeline shifts.

---

## 8. Buffer Allocation

Buffers protect against uncertainty. Allocate them explicitly rather than padding individual estimates.

### Buffer Types

| Buffer | Percentage | Covers |
|--------|-----------|--------|
| **Known Unknowns** | 20% | Identified risks, planned absences, support rotations |
| **Unknown Unknowns** | 10% | Unexpected issues, scope discovery, technical surprises |
| **Total Recommended Buffer** | 30% | Combined buffer |

### When to Increase Buffer

- **New team** (first 3 sprints together): add 10% extra.
- **New technology stack**: add 10-15% extra.
- **Heavy external dependencies** (third-party APIs, vendor timelines): add 10-15% extra.
- **Regulatory/compliance requirements**: add 10% extra.
- **Maximum recommended total buffer**: 50%. Beyond this, the project plan itself needs rethinking.

### When to Decrease Buffer

- **Mature team with proven velocity**: reduce unknown unknowns to 5%.
- **Well-understood domain with existing codebase**: reduce known unknowns to 10%.
- **Low-risk maintenance work**: reduce to 15% total.

### Buffer Anti-Patterns

- **Individual padding**: Adding buffer to each estimate. This compounds and is invisible.
- **Treating buffer as free time**: If the buffer isn't needed, it accelerates delivery — not a place to add scope.
- **Never explaining buffers**: Stakeholders should understand that buffer is risk management, not inefficiency.

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────┐
│  ESTIMATION QUICK REFERENCE                             │
├─────────────────────────────────────────────────────────┤
│  Story Points:   1=Trivial  2=Simple  3=Moderate        │
│                  5=Complex  8=Very Complex              │
│                  13=Epic → BREAK IT DOWN                 │
│                                                         │
│  PERT:  (O + 4M + P) / 6                               │
│  SD:    (P - O) / 6                                     │
│                                                         │
│  Velocity:  Plan at low-end of [avg - SD, avg + SD]     │
│  Buffer:    20% known unknowns + 10% unknown unknowns   │
│                                                         │
│  Re-estimate when: scope change, velocity >20% off,     │
│  team change, new tech info                             │
│                                                         │
│  Features → Story Points │ Bugs → Time-Based            │
│  Infra → Time-Based     │ Docs → Time-Based             │
│  Spikes → Time-Boxed    │                               │
└─────────────────────────────────────────────────────────┘
```
