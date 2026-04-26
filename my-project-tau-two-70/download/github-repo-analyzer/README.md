# OpenCode

Building a Slack bot through OpenCode on Android.

## GitHub Repository Analyzer

A Python command-line tool that analyzes any public GitHub repository and produces a detailed report including language breakdown, contributor stats, commit frequency patterns, issue metrics, and pull request analytics.

### Features

- **Language breakdown** — percentage of each language used in the repo
- **Top contributors** — ranked by number of commits
- **Commit patterns** — activity by day of week, hour of day, and monthly trends
- **Conventional commit analysis** — detects common prefixes (feat, fix, docs, etc.)
- **Issue metrics** — open/closed ratio, close rate, most used labels
- **Pull request analytics** — open/closed/merged counts and merge rate
- **Multiple output formats** — human-readable text, JSON, and CSV

### Usage

```bash
# Basic text report
python github-repo-analyzer/repo_analyzer.py facebook/react

# JSON output (useful for piping to other tools)
python github-repo-analyzer/repo_analyzer.py --format json facebook/react

# CSV output (useful for spreadsheets)
python github-repo-analyzer/repo_analyzer.py --format csv --output report.csv facebook/react

# Use a GitHub token for higher rate limits
python github-repo-analyzer/repo_analyzer.py --token YOUR_GITHUB_TOKEN owner/repo
```

### Output Format (text)

```
============================================================
  REPOSITORY ANALYSIS: facebook/react
  Generated: 2026-04-13 11:00:00 UTC
============================================================

--- OVERVIEW ---
  Name:           facebook/react
  Description:    The library for web and native user interfaces.
  Stars:          230000
  Forks:          48000
  ...

--- LANGUAGES ---
  JavaScript          72.30%  ###################################
  TypeScript          22.15%  ###########
  ...
```

### Requirements

- Python 3.10+
- No external dependencies (uses only the Python standard library)

### License

MIT
