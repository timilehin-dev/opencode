# Risk Assessment Framework & Matrix Template

> A structured approach to identifying, assessing, and managing project risks throughout the project lifecycle.

---

## 1. Probability Scale (1-5)

| Level | Label | Definition | Criteria |
|-------|-------|------------|----------|
| **1** | Rare | Very unlikely to occur. < 5% chance. | No precedent in similar projects; requires a confluence of unlikely events. |
| **2** | Unlikely | Could occur but not expected. 5-20% chance. | Has happened once in similar projects; specific conditions required. |
| **3** | Possible | May occur during the project. 20-50% chance. | Has happened in past projects; conditions are plausible. |
| **4** | Likely | Will probably occur. 50-80% chance. | Has happened multiple times; current conditions favor occurrence. |
| **5** | Almost Certain | Expected to occur. > 80% chance. | Happens regularly in similar projects; conditions actively present. |

---

## 2. Impact Scale (1-5)

Impact is assessed across four dimensions. Use the **highest impact score** across dimensions for the risk rating.

### Schedule Impact

| Level | Schedule Impact | Description |
|-------|----------------|-------------|
| **1** | Negligible | < 1 day delay; absorbed within existing float. |
| **2** | Minor | 1-5 day delay; minor schedule adjustment needed. |
| **3** | Moderate | 1-2 week delay; milestone at risk, resequencing required. |
| **4** | Major | 2-4 week delay; multiple milestones impacted, escalation needed. |
| **5** | Critical | > 4 week delay; project completion date at risk, stakeholder impact. |

### Cost Impact

| Level | Cost Impact | Description |
|-------|-------------|-------------|
| **1** | Negligible | < $1,000; within contingency. |
| **2** | Minor | $1,000 - $10,000; minor budget reallocation. |
| **3** | Moderate | $10,000 - $50,000; requires budget revision. |
| **4** | Major | $50,000 - $100,000; executive approval needed. |
| **5** | Critical | > $100,000; project viability at risk. |

### Quality Impact

| Level | Quality Impact | Description |
|-------|---------------|-------------|
| **1** | Negligible | Minor inconvenience; workaround available. |
| **2** | Minor | Feature degradation; acceptable for release with note. |
| **3** | Moderate | Significant quality issue; requires rework before release. |
| **4** | Major | Critical defect; blocks key functionality. |
| **5** | Critical | System failure; data loss, security breach, or regulatory violation. |

### Scope Impact

| Level | Scope Impact | Description |
|-------|--------------|-------------|
| **1** | Negligible | Minor scope adjustment; no stakeholder impact. |
| **2** | Minor | Feature deferred to next release. |
| **3** | Moderate | Epic-level feature at risk; requires prioritization discussion. |
| **4** | Major | Multiple features cut; significant stakeholder impact. |
| **5** | Critical | Project scope fundamentally changed; business case undermined. |

---

## 3. Risk Matrix (5×5 Grid)

Risk Score = Probability × Impact

```
         IMPACT
         1       2       3       4       5
       ┌───────┬───────┬───────┬───────┬───────┐
  P  1 │   1   │   2   │   3   │   4   │   5   │
  R    │ GREEN │ GREEN │ GREEN │ GREEN │ YELLOW│
  O    │       │       │       │       │       │
  B    ├───────┼───────┼───────┼───────┼───────┤
  A  2 │   2   │   4   │   6   │   8   │  10   │
  B    │ GREEN │ GREEN │ YELLOW│ YELLOW│ ORANGE│
       │       │       │       │       │       │
       ├───────┼───────┼───────┼───────┼───────┤
  L  3 │   3   │   6   │   9   │  12   │  15   │
  I    │ GREEN │ YELLOW│ ORANGE│ ORANGE│  RED  │
  T    │       │       │       │       │       │
  Y    ├───────┼───────┼───────┼───────┼───────┤
       │   4   │   8   │  12   │  16   │  20   │
  L  4 │ YELLOW│ ORANGE│ ORANGE│  RED  │  RED  │
  I    │       │       │       │       │       │
  K    ├───────┼───────┼───────┼───────┼───────┤
  E    │   5   │  10   │  15   │  20   │  25   │
  L  5 │ YELLOW│ ORANGE│  RED  │  RED  │  RED  │
  Y    │       │       │       │       │       │
       └───────┴───────┴───────┴───────┴───────┘
```

### Risk Level Thresholds

| Score Range | Level | Color | Action Required |
|-------------|-------|-------|-----------------|
| **1-4** | Low | 🟢 Green | Monitor; no active mitigation needed. Review monthly. |
| **5-9** | Medium | 🟡 Yellow | Active monitoring; define mitigation. Review biweekly. |
| **10-15** | High | 🟠 Orange | Mitigation plan required; assign owner. Review weekly. |
| **16-25** | Critical | 🔴 Red | Immediate action required; escalate to leadership. Review daily. |

---

## 4. Risk Register Template

Copy into a spreadsheet for tracking. Each row represents one identified risk.

### Column Definitions

| Column | Type | Description |
|--------|------|-------------|
| **ID** | Text | Unique identifier (e.g., R-001, R-002). |
| **Description** | Text | Clear statement of the risk condition and consequence. |
| **Category** | Dropdown | Technical, Resource, Schedule, Scope, External, Organizational. |
| **Probability** | Number | 1-5 (from Probability Scale). |
| **Impact** | Number | 1-5 (highest across Schedule, Cost, Quality, Scope). |
| **Score** | Formula | `Probability × Impact` (auto-calculated). |
| **Risk Level** | Formula | Low / Medium / High / Critical (based on score thresholds). |
| **Mitigation Strategy** | Text | Proactive actions to reduce probability or impact. |
| **Contingency Plan** | Text | Reactive plan if the risk materializes. |
| **Response Type** | Dropdown | Avoid, Transfer, Mitigate, Accept. |
| **Owner** | Text | Person responsible for monitoring and mitigation. |
| **Status** | Dropdown | Open, Mitigating, Materialized, Closed, Deferred. |
| **Review Date** | Date | Next scheduled review (based on risk level cadence). |
| **Notes** | Text | Free-form notes, links, references. |

### CSV-Ready Header Row

```
ID,Description,Category,Probability,Impact,Score,Risk Level,Mitigation Strategy,Contingency Plan,Response Type,Owner,Status,Review Date,Notes
```

### Example Entries

```
R-001,Third-party API changes format without notice,External,4,4,16,Critical,Implement integration tests that detect schema changes; subscribe to API provider's changelog,Fallback to cached data; implement adapter layer,Mitigate,Alice Chen,Open,2025-02-01,API version 3.2 currently in use
R-002,Senior developer leaves mid-sprint,Resource,2,4,8,High,Cross-train on critical modules; maintain up-to-date documentation,Redistribute work; engage contractor for short-term coverage,Mitigate,Bob Martinez,Open,2025-01-25,Key person: backend lead
R-003,Scope creep from stakeholder requests,Scope,4,3,12,High,Formal change control process; sprint commitments locked after planning,Defer non-critical items to backlog; negotiate timeline extension,Mitigate,Carol Singh,Open,2025-01-28,3 change requests received last sprint
R-004,CI/CD pipeline failure blocks deployment,Technical,3,4,12,High,Redundant pipeline; manual deployment procedure documented,Roll back to last known good deployment; fix pipeline as P0,Mitigate,DevOps Team,Open,2025-01-25,Pipeline failed twice last month
```

---

## 5. Common Project Risks by Category

### Technical Risks

| Risk | Typical Prob. | Typical Impact |
|------|--------------|----------------|
| Technology stack is immature or poorly understood | 3 | 4 |
| Integration with legacy systems fails | 3 | 4 |
| Performance requirements cannot be met | 3 | 4 |
| Security vulnerabilities discovered late | 3 | 5 |
| Technical debt prevents feature delivery | 4 | 3 |
| Automated testing is insufficient | 4 | 3 |

### Resource Risks

| Risk | Typical Prob. | Typical Impact |
|------|--------------|----------------|
| Key team member becomes unavailable | 2 | 4 |
| Team lacks required skills | 3 | 3 |
| Hiring takes longer than planned | 3 | 3 |
| Burnout from sustained crunch | 3 | 4 |
| Conflicting priorities across projects | 4 | 3 |

### Schedule Risks

| Risk | Typical Prob. | Typical Impact |
|------|--------------|----------------|
| Dependencies deliver late | 4 | 4 |
| Scope underestimated | 4 | 3 |
| External deadlines are non-negotiable | 3 | 4 |
| Scope creep erodes schedule buffer | 4 | 3 |
| Scope change requests are frequent | 4 | 3 |

### Scope Risks

| Risk | Typical Prob. | Typical Impact |
|------|--------------|----------------|
| Requirements are ambiguous | 4 | 3 |
| Stakeholders disagree on priorities | 3 | 3 |
| Hidden requirements discovered during implementation | 4 | 4 |
| Feature interdependencies not identified | 3 | 3 |
| Regulatory requirements change mid-project | 2 | 5 |

### External Risks

| Risk | Typical Prob. | Typical Impact |
|------|--------------|----------------|
| Third-party API/provider changes | 3 | 4 |
| Vendor delays or quality issues | 3 | 3 |
| Market conditions change project viability | 2 | 5 |
| Regulatory environment shifts | 2 | 4 |
| Infrastructure/cloud outages | 2 | 3 |

### Organizational Risks

| Risk | Typical Prob. | Typical Impact |
|------|--------------|----------------|
| Leadership changes project priorities | 3 | 4 |
| Budget cuts mid-project | 2 | 5 |
| Organizational restructure disrupts team | 2 | 4 |
| Lack of stakeholder availability for decisions | 4 | 3 |
| Communication gaps between distributed teams | 4 | 2 |

---

## 6. Risk Response Strategies

### Avoid

**Definition**: Eliminate the risk by removing its cause or changing the project plan.

**When to use**: The risk is high probability, high impact, and avoidance is feasible.

| Example | Avoidance Action |
|---------|-----------------|
| Unproven technology | Use a proven alternative. |
| Overloaded team member | Redistribute workload or extend timeline. |
| Ambiguous requirements | Resolve ambiguity before starting work. |

### Transfer

**Definition**: Shift the risk impact to a third party (insurance, vendor, contract terms).

**When to use**: Another party is better equipped to manage the risk.

| Example | Transfer Mechanism |
|---------|-------------------|
| Infrastructure failure | Use managed cloud services with SLAs. |
| Compliance risk | Engage a compliance consultant. |
| Vendor delivery failure | Include penalty clauses in contracts. |

### Mitigate

**Definition**: Reduce the probability and/or impact of the risk through proactive actions.

**When to use**: The risk cannot be avoided or transferred, but can be reduced.

| Example | Mitigation Action |
|---------|------------------|
| Key person dependency | Cross-training, documentation, pair programming. |
| Scope creep | Formal change control, sprint commitment lock. |
| Performance issues | Early performance testing, profiling sprints. |
| Security vulnerabilities | Security audit at milestone gates, automated scanning. |

### Accept

**Definition**: Acknowledge the risk and choose not to take action (or take minimal action).

**When to use**: The risk is low probability, low impact, or the cost of mitigation exceeds the potential impact.

| Example | Acceptance Approach |
|---------|-------------------|
| Minor UI inconsistencies | Fix in future sprint if reported. |
| Known low-severity bug | Document, monitor, do not fix now. |
| Low-probability external dependency delay | Monitor, no proactive mitigation. |

### Strategy Selection Matrix

| Risk Score | Primary Strategy | Secondary Strategy |
|-----------|-----------------|-------------------|
| 1-4 | Accept | Monitor |
| 5-9 | Mitigate | Accept with monitoring |
| 10-15 | Mitigate or Avoid | Plan contingency |
| 16-25 | Avoid or Transfer | Escalate immediately |

---

## 7. Risk Review Cadence

Risk management is an ongoing process, not a one-time exercise.

### Review Schedule by Risk Level

| Risk Level | Review Frequency | Participants | Actions |
|-----------|-----------------|-------------|---------|
| **Critical (Red)** | Daily | Risk owner + PM + lead | Update status, trigger contingency if needed. |
| **High (Orange)** | Weekly | Full team at standup | Review mitigation progress, reassess score. |
| **Medium (Yellow)** | Biweekly | Risk owner + PM | Check if probability/impact has changed. |
| **Low (Green)** | Monthly | PM review | Confirm risk still exists; close stale risks. |

### Risk Review Meeting Agenda (15 min)

1. **Status update on open risks** (5 min) — any materialized? any mitigated?
2. **New risks identified** (5 min) — capture from recent incidents or retrospectives.
3. **Score reassessment** (3 min) — update probability/impact based on new information.
4. **Action items** (2 min) — assign follow-ups.

### Risk Closure Criteria

- **Mitigated**: Probability or Impact reduced to Low (score ≤ 4).
- **Accepted**: Risk acknowledged with no further action.
- **Materialized**: Risk occurred — execute contingency plan, then close.
- **Obsolete**: Risk is no longer applicable (project phase changed, dependency resolved).

---

## 8. Risk Appetite Framework

Risk appetite defines how much risk an organization or project is willing to accept. Align the project's risk tolerance with organizational context.

### Risk Appetite by Project Type

| Project Type | Schedule Risk Appetite | Cost Risk Appetite | Quality Risk Appetite | Scope Risk Appetite |
|-------------|----------------------|-------------------|----------------------|-------------------|
| **Critical / Life-Safety** (medical, aerospace) | Low | Low | Very Low | Low |
| **Enterprise Core Systems** (billing, ERP) | Low | Medium | Low | Medium |
| **Customer-Facing Product** (SaaS, mobile) | Medium | Medium | Medium | Medium |
| **Internal Tools** | High | High | High | High |
| **R&D / Prototype** | High | Medium | High | Very High |
| **Regulated / Compliance** | Low | Low | Very Low | Low |

### Setting Project-Specific Risk Appetite

For each project, define:

1. **Maximum acceptable risk score** before escalation is mandatory.
2. **Risk budget**: How many medium/high risks are acceptable simultaneously.
3. **Quality gates**: What quality standard is non-negotiable.
4. **Schedule flexibility**: How much schedule slip is acceptable before escalating.

### Example Risk Appetite Statement

> "For Project Alpha, we accept a maximum of 5 medium-risk items and no critical-risk items at any time. Schedule risk is tolerated up to 10% slippage before escalation. Quality risk is not tolerated for any customer-facing feature — zero critical defects at launch."

### Communicating Risk Appetite

- Include risk appetite in the **project charter**.
- Review and confirm at **project kickoff** with stakeholders.
- Revisit when **project context changes** (e.g., new regulation, acquisition).
