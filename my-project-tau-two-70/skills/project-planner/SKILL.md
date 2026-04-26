---
name: project-planner
description: "Structured project planning methodology covering requirement decomposition, task estimation, dependency mapping, risk assessment, and milestone planning. Produces actionable project plans with clear ownership, timelines, and success criteria."
tags: [project-management, planning, productivity, estimation, agile]
version: "1.0.0"
license: MIT
metadata:
  author: Klawhub
  category: productivity
  difficulty: intermediate
  tools: [pdf, docx, xlsx, charts]
---

# Project Planner — Structured Project Planning

## Purpose
Transform project ideas into structured, actionable plans with clear tasks, dependencies, estimates, risks, and milestones. This skill provides a systematic planning methodology that produces plans teams can actually execute against.

## When to Activate
- User describes a project idea and needs a plan
- Feature development needs task decomposition
- Sprint planning or milestone definition required
- User says "plan this," "break this down," "roadmap," "estimate," "project plan"
- Any request involving multi-step work that benefits from structured planning
- Migration planning, refactoring planning, or system design planning

## Planning Methodology

### Phase 1: Project Charter (Define Success)

Define these before planning tasks:

1. **Project Name** — Clear, descriptive name
2. **Objective** — One sentence: "Build X to achieve Y for Z"
3. **Success Criteria** — 3-5 measurable outcomes that define "done"
4. **Constraints** — Budget, timeline, team size, technology limits
5. **Assumptions** — What are we assuming to be true?
6. **Stakeholders** — Who is impacted? Who decides? Who reviews?
7. **Out of Scope** — Explicitly state what this project does NOT include

### Phase 2: Requirement Decomposition

Break the objective into workable units:

**Level 1: Epics** (Major deliverables)
- Each epic produces a discrete, testable outcome
- Epics should be independently valuable if possible
- Target 3-8 epics per project

**Level 2: Stories/Tasks** (Implementation units)
- Each task has a clear definition of done
- Tasks should be completable in 1-5 days
- Each task maps to exactly one epic
- Target 5-15 tasks per epic

**Level 3: Subtasks** (When needed for complex tasks)
- Break down tasks that require multiple steps
- Useful for tasks spanning multiple files or systems

**Decomposition Checklist:**
- [ ] Every requirement maps to at least one task
- [ ] No task depends on itself or creates circular dependencies
- [ ] Each task has a clear deliverable (code, document, config, etc.)
- [ ] Integration and testing tasks are included (not just feature work)
- [ ] Documentation and deployment tasks are included

### Phase 3: Dependency Mapping

Map dependencies between tasks:

**Dependency Types:**
| Type | Symbol | Description |
|------|--------|-------------|
| Finish-to-Start | A → B | Task B cannot start until A is complete |
| Start-to-Start | A ⇢ B | B can start when A starts (parallel work) |
| Finish-to-Finish | A ⇉ B | B finishes when A finishes |

**Critical Path Analysis:**
1. Map all dependencies
2. Calculate earliest start/finish for each task
3. Identify the critical path (longest chain of dependent tasks)
4. Tasks on the critical path have zero slack — delays here delay the project
5. Non-critical tasks have slack and can be rescheduled without affecting the deadline

### Phase 4: Effort Estimation

Use multiple estimation techniques for accuracy:

**1. Story Points (Relative Sizing)**
- 1: Trivial (config change, simple fix)
- 2: Small (minor feature, simple component)
- 3: Medium (standard feature, moderate complexity)
- 5: Large (complex feature, multiple components)
- 8: Very Large (complex feature with significant unknowns)
- 13: Epic-level (break down further if possible)

**2. Time-Based Estimates**
- Optimistic (O): Best case if everything goes well
- Most Likely (M): Realistic estimate
- Pessimistic (P): Worst case if things go wrong
- Expected = (O + 4M + P) / 6 (PERT formula)

**Estimation Rules:**
- Never estimate a task you don't understand — spike first
- Include time for code review, testing, and documentation
- Add 20% buffer for unknowns in new domains
- Re-estimate after completing 20% of tasks (calibration)

### Phase 5: Risk Assessment

Identify and plan for risks:

**Risk Matrix:**
```
           | Impact  |
           | Low  Med  High |
Probability|                  |
High       | Med  High Crit |
Medium     | Low  Med  High |
Low        | Low  Low  Med  |
```

For each risk:
1. **Identify** — What could go wrong?
2. **Assess** — Probability x Impact = Risk Score
3. **Mitigate** — What can we do to prevent it?
4. **Contingency** — What do we do if it happens?
5. **Owner** — Who is responsible for monitoring?

**Common Project Risks:**
- Scope creep (mitigate: clear out-of-scope, change control process)
- Dependency delays (mitigate: early integration, fallback plans)
- Technical unknowns (mitigate: spike/prototype early)
- Resource availability (mitigate: cross-training, documentation)
- Third-party failures (mitigate: vendor assessment, SLA requirements)
- Integration issues (mitigate: early integration testing, API contracts)

### Phase 6: Milestone Planning

Define checkpoints to track progress:

**Milestone Structure:**
```
Milestone 1: [Name]
  - Target Date: [date]
  - Criteria: [what must be complete]
  - Tasks Included: [task IDs]
  - Dependencies: [what must be done first]

Milestone 2: [Name]
  ...
```

**Healthy Milestone Design:**
- Each milestone produces a demonstrable outcome
- Milestones are spaced 1-3 weeks apart
- Each milestone includes at least one integration or validation task
- Early milestones deliver value quickly (avoid big-bang delivery)

### Phase 7: Plan Output

Produce a structured plan in the requested format:

**Project Plan Document Structure:**
1. **Project Overview** — Charter information
2. **Architecture/Approach** — Technical approach summary
3. **Task Breakdown** — Full task list with estimates
4. **Dependency Graph** — Visual or textual dependency map
5. **Timeline** — Gantt chart or timeline view (use `charts` skill)
6. **Risk Register** — All identified risks with mitigation plans
7. **Resource Plan** — Who does what
8. **Milestone Schedule** — Checkpoint dates and criteria
9. **Success Metrics** — How we know the project succeeded

**For ongoing execution, create:**
- Sprint/task board using `project_create` + `project_add_task` tools
- Routine check-ins using `routine_create` for status updates
- Health checks using `project_health` for progress tracking

## Planning Anti-Patterns to Avoid

1. **Analysis Paralysis** — Don't plan more than 30% of project time
2. **Perfect Plan Fallacy** — Plans are wrong; the value is in the thinking, not the document
3. **Ignoring Dependencies** — Always map dependencies before committing to dates
4. **Optimism Bias** — Estimates are usually 30-50% low for complex projects
5. **Missing Non-Functional Work** — Testing, documentation, deployment are real work
6. **No Buffer** — Always include contingency time for unknowns
7. **One-Person Bottleneck** — Identify and address single points of failure early
