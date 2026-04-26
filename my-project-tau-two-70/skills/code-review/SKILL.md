---
name: code-review
description: "Systematic code review methodology covering correctness, security, performance, maintainability, and architecture. Produces structured review reports with severity-ranked findings, specific fix recommendations, and code examples."
tags: [code-review, quality, security, performance, maintainability]
version: "1.0.0"
license: MIT
metadata:
  author: Klawhub
  category: development
  difficulty: advanced
  tools: [fullstack-dev, pdf, docx, xlsx, charts]
---

# Code Review — Systematic Code Quality Analysis

## Purpose
Provide thorough, structured code reviews that go beyond surface-level comments. This skill covers correctness, security vulnerabilities, performance issues, maintainability concerns, and architectural alignment.

## When to Activate
- User asks for a code review, code audit, or code quality assessment
- Pull request review with detailed feedback needed
- Security audit of codebase or specific files
- Performance bottleneck identification
- Refactoring recommendations needed
- User says "review this code," "check for issues," "audit," "improve this code"

## Review Methodology

### Phase 1: Context Gathering

Before reviewing code, understand:

1. **Purpose** — What is this code supposed to do?
2. **Architecture** — Where does this fit in the system?
3. **Constraints** — Performance requirements, security context, compatibility needs
4. **Existing patterns** — What conventions does the codebase follow?
5. **Change scope** — Is this new code, a modification, or a refactor?

### Phase 2: Multi-Dimensional Analysis

Review across all 7 dimensions, producing severity-ranked findings for each:

#### 1. Correctness
- Logic errors and off-by-one bugs
- Null/undefined handling gaps
- Edge cases not covered
- Race conditions in async code
- Incorrect error handling (swallowing errors, wrong error types)
- Type safety issues (any casts, missing null checks)
- Business logic violations

#### 2. Security
- Input validation and sanitization
- Injection vulnerabilities (SQL, XSS, command injection)
- Authentication and authorization gaps
- Sensitive data exposure (logs, errors, API responses)
- Dependency vulnerabilities
- CORS and CSP misconfigurations
- Secrets and credentials in code
- Insecure direct object references
- Rate limiting and abuse prevention

#### 3. Performance
- N+1 query patterns
- Missing indexes on database queries
- Unnecessary re-renders or re-computations
- Memory leaks (event listeners, subscriptions, closures)
- Unbounded growth (arrays, caches, logs)
- Inefficient algorithms (O(n^2) where O(n) suffices)
- Missing pagination for large datasets
- Synchronous operations that should be async
- Bundle size impact (large imports, tree-shaking failures)

#### 4. Maintainability
- Function/method length (>30 lines is a warning)
- Cyclomatic complexity (>10 branches is a warning)
- Naming clarity (variables, functions, types)
- Code duplication (DRY violations)
- Magic numbers and hardcoded values
- Missing or misleading comments
- Inconsistent patterns within the file
- Dead code and unused imports

#### 5. Error Handling
- Error messages are helpful and actionable
- Errors are properly propagated to callers
- Retry logic with exponential backoff
- Circuit breaker patterns for external calls
- Graceful degradation strategies
- Error logging with sufficient context

#### 6. Testing
- Test coverage gaps
- Missing edge case tests
- Flaky test indicators (timing dependencies, order dependencies)
- Test assertions that don't actually verify behavior
- Missing integration tests for critical paths
- Test isolation issues

#### 7. Architecture & Design
- Separation of concerns violations
- Coupling issues (tight coupling between modules)
- Abstraction level mismatches
- Single Responsibility Principle violations
- Missing or wrong abstraction layers
- API design issues (inconsistent endpoints, missing pagination)
- Configuration management problems

### Phase 3: Finding Classification

Classify each finding:

| Severity | Definition | Action Required |
|----------|-----------|-----------------|
| **Critical** | Security vulnerability, data loss risk, production crash | Must fix immediately |
| **High** | Significant bug, performance degradation, maintainability hazard | Should fix before merge |
| **Medium** | Code smell, minor bug, suboptimal pattern | Recommended fix |
| **Low** | Style preference, minor improvement | Optional improvement |
| **Info** | Observation, suggestion for future consideration | No action needed |

### Phase 4: Review Report

Structure the review as:

```
## Summary
[2-3 sentence overview of code health]

## Critical/High Findings
[Each finding with:]
- **Issue:** Clear description
- **Location:** File:line reference
- **Impact:** What could go wrong
- **Recommendation:** Specific fix with code example
- **Severity:** critical/high

## Medium Findings
[Same format, grouped by category]

## Low/Info Observations
[Brief list]

## Positive Observations
[What the code does well — reviews should acknowledge good patterns]

## Overall Assessment
[Ready to merge / Needs changes / Needs rewrite]
[Estimated effort to address findings]
```

## Quick-Check Patterns (Scan First)

These common issues can be caught with a quick scan:

1. **Console.log in production code** — Search for `console.log`, `console.error`, `print()`
2. **TODO/FIXME/HACK comments** — Search for these markers
3. **Any type usage** — Search for `: any`, `as any`, `@ts-ignore`, `@ts-expect-error`
4. **Hardcoded strings** — URLs, API keys, file paths, email addresses
5. **Empty catch blocks** — `catch (e) {}` or `catch {}`
6. **Commented-out code** — Remove dead code, don't comment it
7. **Inconsistent imports** — Mix of default and named imports from same module
8. **Missing return types** — Functions without explicit return types
9. ** Unused variables/imports** — Dead code that clutters the file
10. **Deeply nested code** — More than 3 levels of indentation

## Code Quality Metrics

When applicable, provide these metrics:

| Metric | Good | Warning | Bad |
|--------|------|---------|-----|
| Functions > 30 lines | < 10% | 10-30% | > 30% |
| Functions > 100 lines | 0% | 1-2 | > 2 |
| Cyclomatic complexity > 10 | < 10% | 10-20% | > 20% |
| File length | < 300 lines | 300-500 | > 500 |
| Test coverage | > 80% | 50-80% | < 50% |
| TODO/FIXME count | 0-2 | 3-5 | > 5 |
| Any type usage | 0 | 1-5 | > 5 |
| Duplication ratio | < 3% | 3-10% | > 10% |

## Language-Specific Checks

### TypeScript/JavaScript
- Proper async/await usage (no unnecessary Promise chains)
- Type guards for discriminated unions
- Exhaustive switch statements with `never` type
- Proper use of `readonly`, `const`, and immutability patterns
- Error boundary implementation in React components

### Python
- Type hints on all function signatures
- Proper exception hierarchy usage
- Context manager usage for resources
- Virtual environment and dependency management
- Docstring quality (Google or NumPy style)

### SQL
- Parameterized queries only (no string concatenation)
- Proper indexing strategy
- Query execution plan review
- Transaction isolation level appropriateness
- Migration reversibility
