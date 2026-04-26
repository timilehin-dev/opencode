"""
GitHub Repository Analyzer
==========================
Analyzes any public GitHub repository and produces a detailed report
including language breakdown, contributor stats, recent activity,
commit frequency, issue metrics, and more.

Usage:
    python repo_analyzer.py <owner>/<repo>
    python repo_analyzer.py --format json <owner>/<repo>
    python repo_analyzer.py --format csv <owner>/<repo>

Examples:
    python repo_analyzer.py facebook/react
    python repo_analyzer.py --format json timilehin-dev/opencode
"""

import argparse
import json
import csv
import sys
import time
from datetime import datetime, timedelta, timezone
from collections import Counter, defaultdict
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

GITHUB_API = "https://api.github.com"
PER_PAGE = 100


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def fetch_json(url: str, headers: dict | None = None) -> dict | list:
    """Fetch JSON from a URL with optional headers."""
    if headers is None:
        headers = {
            "Accept": "application/vnd.github+json",
            "User-Agent": "GitHub-Repo-Analyzer/1.0",
        }
    req = Request(url, headers=headers)
    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as exc:
        print(f"  [!] HTTP {exc.code} for {url}", file=sys.stderr)
        if exc.code == 403:
            print("  [!] Rate limit likely hit. Wait a moment or add a GITHUB_TOKEN env var.", file=sys.stderr)
        return []
    except URLError as exc:
        print(f"  [!] Connection error: {exc.reason}", file=sys.stderr)
        return []


def fetch_all_pages(url: str, headers: dict | None = None, max_pages: int = 10) -> list:
    """Paginate through all results from a GitHub API endpoint."""
    results = []
    page = 1
    while page <= max_pages:
        separator = "&" if "?" in url else "?"
        paginated_url = f"{url}{separator}page={page}&per_page={PER_PAGE}"
        data = fetch_json(paginated_url, headers)
        if not data or (isinstance(data, list) and len(data) == 0):
            break
        results.extend(data)
        if isinstance(data, list) and len(data) < PER_PAGE:
            break
        page += 1
        time.sleep(0.3)  # Be respectful to rate limits
    return results


# ---------------------------------------------------------------------------
# Analysis functions
# ---------------------------------------------------------------------------

def get_repo_info(owner: str, repo: str, token: str | None = None) -> dict:
    """Fetch repository metadata."""
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "GitHub-Repo-Analyzer/1.0",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    return fetch_json(f"{GITHUB_API}/repos/{owner}/{repo}", headers)


def analyze_languages(owner: str, repo: str, token: str | None = None) -> dict:
    """Get language breakdown by bytes of code."""
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "GitHub-Repo-Analyzer/1.0"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    data = fetch_json(f"{GITHUB_API}/repos/{owner}/{repo}/languages", headers)
    total = sum(data.values()) if data else 0
    breakdown = {}
    for lang, bytes_count in sorted(data.items(), key=lambda x: -x[1]):
        pct = (bytes_count / total * 100) if total > 0 else 0
        breakdown[lang] = {"bytes": bytes_count, "percentage": round(pct, 2)}
    return breakdown


def analyze_contributors(owner: str, repo: str, token: str | None = None) -> list:
    """Fetch contributor statistics."""
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "GitHub-Repo-Analyzer/1.0"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    data = fetch_all_pages(
        f"{GITHUB_API}/repos/{owner}/{repo}/contributors",
        headers, max_pages=5
    )
    contributors = []
    for c in data[:20]:  # Top 20 contributors
        contributors.append({
            "login": c.get("login", "unknown"),
            "contributions": c.get("contributions", 0),
            "profile_url": c.get("html_url", ""),
        })
    return contributors


def analyze_commits(owner: str, repo: str, token: str | None = None) -> dict:
    """Analyze commit frequency and patterns."""
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "GitHub-Repo-Analyzer/1.0"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    commits = fetch_all_pages(
        f"{GITHUB_API}/repos/{owner}/{repo}/commits",
        headers, max_pages=10
    )

    # Commit frequency by day of week
    day_counter = Counter()
    # Commit frequency by hour of day
    hour_counter = Counter()
    # Monthly commit count (last 12 months)
    monthly_counter = Counter()

    now = datetime.now(timezone.utc)

    for commit_data in commits:
        commit = commit_data.get("commit", {})
        date_str = commit.get("author", {}).get("date", "")
        if not date_str:
            continue

        try:
            commit_date = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            day_counter[commit_date.strftime("%A")] += 1
            hour_counter[commit_date.hour] += 1
            month_key = commit_date.strftime("%Y-%m")
            # Only count last 12 months
            if commit_date > now - timedelta(days=365):
                monthly_counter[month_key] += 1
        except (ValueError, TypeError):
            continue

    # Most common commit message prefixes (conventional commits pattern)
    prefix_counter = Counter()
    for commit_data in commits:
        message = commit_data.get("commit", {}).get("message", "")
        first_line = message.split("\n")[0].strip()
        if ":" in first_line:
            prefix = first_line.split(":")[0].strip()
            prefix_counter[prefix] += 1

    return {
        "total_analyzed": len(commits),
        "by_day_of_week": dict(day_counter),
        "by_hour_of_day": dict(sorted(hour_counter.items())),
        "monthly_last_12": dict(sorted(monthly_counter.items())),
        "common_prefixes": dict(prefix_counter.most_common(10)),
    }


def analyze_issues(owner: str, repo: str, token: str | None = None) -> dict:
    """Analyze open vs closed issues and labels."""
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "GitHub-Repo-Analyzer/1.0"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    open_issues = fetch_all_pages(
        f"{GITHUB_API}/repos/{owner}/{repo}/issues?state=open",
        headers, max_pages=5
    )
    closed_issues = fetch_all_pages(
        f"{GITHUB_API}/repos/{owner}/{repo}/issues?state=closed",
        headers, max_pages=5
    )

    label_counter = Counter()
    for issue in open_issues + closed_issues:
        for label in issue.get("labels", []):
            label_counter[label["name"]] += 1

    # Filter out pull requests (they appear in issues API)
    open_bugs = [i for i in open_issues if "pull_request" not in i]
    closed_bugs = [i for i in closed_issues if "pull_request" not in i]

    return {
        "open_issues": len(open_bugs),
        "closed_issues": len(closed_bugs),
        "total_issues": len(open_bugs) + len(closed_bugs),
        "close_rate_pct": round(
            len(closed_bugs) / (len(open_bugs) + len(closed_bugs)) * 100, 2
        ) if (len(open_bugs) + len(closed_bugs)) > 0 else 0,
        "top_labels": dict(label_counter.most_common(15)),
    }


def analyze_pull_requests(owner: str, repo: str, token: str | None = None) -> dict:
    """Analyze pull request metrics."""
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "GitHub-Repo-Analyzer/1.0"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    open_prs = fetch_all_pages(
        f"{GITHUB_API}/repos/{owner}/{repo}/pulls?state=open",
        headers, max_pages=5
    )
    closed_prs = fetch_all_pages(
        f"{GITHUB_API}/repos/{owner}/{repo}/pulls?state=closed",
        headers, max_pages=5
    )

    merged = [pr for pr in closed_prs if pr.get("merged", False)]

    return {
        "open": len(open_prs),
        "closed": len(closed_prs) - len(merged),
        "merged": len(merged),
        "merge_rate_pct": round(
            len(merged) / len(closed_prs) * 100, 2
        ) if len(closed_prs) > 0 else 0,
    }


# ---------------------------------------------------------------------------
# Report generators
# ---------------------------------------------------------------------------

def generate_text_report(owner: str, repo: str, data: dict) -> str:
    """Generate a human-readable text report."""
    lines = []
    lines.append("=" * 60)
    lines.append(f"  REPOSITORY ANALYSIS: {owner}/{repo}")
    lines.append(f"  Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}")
    lines.append("=" * 60)

    # --- Overview ---
    info = data.get("repo_info", {})
    lines.append("")
    lines.append("--- OVERVIEW ---")
    lines.append(f"  Name:           {info.get('full_name', 'N/A')}")
    lines.append(f"  Description:    {info.get('description', 'No description')}")
    lines.append(f"  Created:        {info.get('created_at', 'N/A')[:10]}")
    lines.append(f"  Last pushed:    {info.get('pushed_at', 'N/A')[:10]}")
    lines.append(f"  Stars:          {info.get('stargazers_count', 0)}")
    lines.append(f"  Forks:          {info.get('forks_count', 0)}")
    lines.append(f"  Open Issues:    {info.get('open_issues_count', 0)}")
    lines.append(f"  Watchers:       {info.get('watchers_count', 0)}")
    lines.append(f"  License:        {info.get('license', {}) and info['license'].get('name', 'None') or 'None'}")
    lines.append(f"  Default Branch: {info.get('default_branch', 'main')}")

    # --- Languages ---
    langs = data.get("languages", {})
    lines.append("")
    lines.append("--- LANGUAGES ---")
    for lang, info in langs.items():
        bar_len = int(info["percentage"] / 2)
        bar = "#" * bar_len
        lines.append(f"  {lang:<20} {info['percentage']:>6.2f}%  {bar}")

    # --- Contributors ---
    contributors = data.get("contributors", [])
    lines.append("")
    lines.append("--- TOP CONTRIBUTORS ---")
    for i, c in enumerate(contributors[:10], 1):
        lines.append(f"  {i:>2}. {c['login']:<30} {c['contributions']:>5} commits")

    # --- Commit Patterns ---
    commits = data.get("commits", {})
    lines.append("")
    lines.append("--- COMMIT PATTERNS ---")
    lines.append(f"  Commits analyzed: {commits.get('total_analyzed', 0)}")
    lines.append("")
    lines.append("  By Day of Week:")
    day_order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    for day in day_order:
        count = commits.get("by_day_of_week", {}).get(day, 0)
        bar = "#" * count
        lines.append(f"    {day:<12} {count:>4}  {bar}")

    lines.append("")
    lines.append("  By Hour of Day (UTC):")
    for hour, count in commits.get("by_hour_of_day", {}).items():
        lines.append(f"    {hour:02d}:00       {count:>4}  {'#' * count}")

    lines.append("")
    lines.append("  Common Commit Prefixes:")
    for prefix, count in commits.get("common_prefixes", {}).items():
        lines.append(f"    {prefix:<25} {count:>4}")

    # --- Issues ---
    issues = data.get("issues", {})
    lines.append("")
    lines.append("--- ISSUES ---")
    lines.append(f"  Open:       {issues.get('open_issues', 0)}")
    lines.append(f"  Closed:     {issues.get('closed_issues', 0)}")
    lines.append(f"  Total:      {issues.get('total_issues', 0)}")
    lines.append(f"  Close Rate: {issues.get('close_rate_pct', 0)}%")
    lines.append("")
    lines.append("  Top Labels:")
    for label, count in list(issues.get("top_labels", {}).items())[:10]:
        lines.append(f"    {label:<30} {count:>4}")

    # --- Pull Requests ---
    prs = data.get("pull_requests", {})
    lines.append("")
    lines.append("--- PULL REQUESTS ---")
    lines.append(f"  Open:        {prs.get('open', 0)}")
    lines.append(f"  Closed:      {prs.get('closed', 0)}")
    lines.append(f"  Merged:      {prs.get('merged', 0)}")
    lines.append(f"  Merge Rate:  {prs.get('merge_rate_pct', 0)}%")

    lines.append("")
    lines.append("=" * 60)
    return "\n".join(lines)


def generate_json_report(data: dict) -> str:
    """Generate a JSON report."""
    return json.dumps(data, indent=2, default=str)


def generate_csv_report(data: dict) -> str:
    """Generate a CSV report with key metrics."""
    output = []
    writer = csv.writer(output)

    writer.writerow(["Metric", "Value"])

    # Overview
    info = data.get("repo_info", {})
    writer.writerow(["Repository", info.get("full_name", "")])
    writer.writerow(["Description", info.get("description", "")])
    writer.writerow(["Stars", info.get("stargazers_count", 0)])
    writer.writerow(["Forks", info.get("forks_count", 0)])
    writer.writerow(["Open Issues", info.get("open_issues_count", 0)])
    writer.writerow(["Watchers", info.get("watchers_count", 0)])
    writer.writerow(["Default Branch", info.get("default_branch", "")])

    # Languages
    for lang, lang_info in data.get("languages", {}).items():
        writer.writerow([f"Language - {lang}", f"{lang_info['percentage']}%"])

    # Contributors
    for c in data.get("contributors", [])[:10]:
        writer.writerow([f"Contributor - {c['login']}", f"{c['contributions']} commits"])

    # Commit patterns
    commits = data.get("commits", {})
    writer.writerow(["Commits Analyzed", commits.get("total_analyzed", 0)])
    for day, count in commits.get("by_day_of_week", {}).items():
        writer.writerow([f"Commits on {day}", count])
    for prefix, count in commits.get("common_prefixes", {}).items():
        writer.writerow([f"Commit prefix - {prefix}", count])

    # Issues
    issues = data.get("issues", {})
    writer.writerow(["Issues - Open", issues.get("open_issues", 0)])
    writer.writerow(["Issues - Closed", issues.get("closed_issues", 0)])
    writer.writerow(["Issues - Close Rate", f"{issues.get('close_rate_pct', 0)}%"])

    # Pull Requests
    prs = data.get("pull_requests", {})
    writer.writerow(["PRs - Open", prs.get("open", 0)])
    writer.writerow(["PRs - Merged", prs.get("merged", 0)])
    writer.writerow(["PRs - Merge Rate", f"{prs.get('merge_rate_pct', 0)}%"])

    return "\n".join(output)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Analyze a GitHub repository and produce a detailed report.",
        epilog="Examples:\n"
               "  python repo_analyzer.py facebook/react\n"
               "  python repo_analyzer.py --format json timilehin-dev/opencode\n"
               "  python repo_analyzer.py --format csv --output report.csv owner/repo",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "repo",
        help="Repository in 'owner/repo' format (e.g. facebook/react)",
    )
    parser.add_argument(
        "--format", "-f",
        choices=["text", "json", "csv"],
        default="text",
        help="Output format (default: text)",
    )
    parser.add_argument(
        "--output", "-o",
        help="Write output to a file instead of stdout",
    )
    parser.add_argument(
        "--token", "-t",
        help="GitHub personal access token (or set GITHUB_TOKEN env var)",
    )

    args = parser.parse_args()

    # Parse owner/repo
    if "/" not in args.repo:
        print("Error: Repository must be in 'owner/repo' format.", file=sys.stderr)
        sys.exit(1)

    owner, repo = args.repo.split("/", 1)
    token = args.token or None

    print(f"Analyzing {owner}/{repo}...")
    print()

    # Fetch all data
    data = {}

    print("  [1/6] Fetching repository info...")
    data["repo_info"] = get_repo_info(owner, repo, token)
    if not data["repo_info"]:
        print(f"Error: Could not find repository '{owner}/{repo}'.", file=sys.stderr)
        sys.exit(1)

    print("  [2/6] Analyzing languages...")
    data["languages"] = analyze_languages(owner, repo, token)

    print("  [3/6] Analyzing contributors...")
    data["contributors"] = analyze_contributors(owner, repo, token)

    print("  [4/6] Analyzing commit patterns...")
    data["commits"] = analyze_commits(owner, repo, token)

    print("  [5/6] Analyzing issues...")
    data["issues"] = analyze_issues(owner, repo, token)

    print("  [6/6] Analyzing pull requests...")
    data["pull_requests"] = analyze_pull_requests(owner, repo, token)

    print()
    print("Analysis complete!")

    # Generate report
    if args.format == "json":
        report = generate_json_report(data)
    elif args.format == "csv":
        report = generate_csv_report(data)
    else:
        report = generate_text_report(owner, repo, data)

    # Output
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(report)
        print(f"\nReport saved to: {args.output}")
    else:
        print()
        print(report)


if __name__ == "__main__":
    main()
