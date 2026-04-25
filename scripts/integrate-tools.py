#!/usr/bin/env python3
"""
Integrate upgraded tool definitions into src/lib/tools.ts.

Replaces 4 document-creation tool sections with upgraded versions:
  - PDF tool  (createPdfReportTool)
  - DOCX tool (createDocxDocumentTool)
  - XLSX tool (createXlsxSpreadsheetTool)
  - PPTX tool (createPptxPresentationTool)

For each upgraded file the script:
  1. Removes standalone import lines (zod, ai)
  2. Removes standalone safeJson / safeJsonWithRetry function definitions
  3. Keeps all helper functions, constants, schemas, and the export const
  4. Replaces the old tool section in tools.ts with the cleaned upgraded content

Section boundaries are detected dynamically by searching for each tool's
export const declaration and then scanning backwards for its comment header,
and forwards for its closing `});`.
"""

import re
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

TOOLS_TS = Path("/home/z/my-project/klawhub/src/lib/tools.ts")

UPGRADED_FILES = {
    "pdf": Path("/home/z/my-project/klawhub/download/upgraded-pdf-tool.ts"),
    "docx": Path("/home/z/my-project/klawhub/download/upgraded-docx-tool.ts"),
    "xlsx": Path("/home/z/my-project/klawhub/download/upgraded-xlsx-tool.ts"),
    "pptx": Path("/home/z/my-project/klawhub/download/upgraded-pptx-tool.ts"),
}

# Tool export names and their section keywords for validation
TOOL_EXPORTS = {
    "pdf":  "createPdfReportTool",
    "docx": "createDocxDocumentTool",
    "xlsx": "createXlsxSpreadsheetTool",
    "pptx": "createPptxPresentationTool",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def read_lines(path: Path) -> list[str]:
    """Read a file and return a list of lines (no newlines)."""
    return path.read_text(encoding="utf-8").splitlines()


def find_section_bounds(lines: list[str], export_name: str) -> tuple[int, int]:
    """
    Find the (start, end) 1-based line range of a tool section.
    
    - Start: scan backwards from `export const {name}` to find the
      comment header block (lines starting with // ---).
    - End: count braces forward from the export to find the matching
      closing `});`.
    """
    # Find the export line
    export_idx = None
    for i, line in enumerate(lines):
        if f"export const {export_name}" in line:
            export_idx = i
            break
    if export_idx is None:
        raise ValueError(f"Could not find 'export const {export_name}' in tools.ts")

    # Scan backwards to find comment header
    # Look for the first line that starts with // ---- that is preceded by
    # a blank line or is at the start of a comment block
    start = export_idx
    j = export_idx - 1
    # Skip any blank lines immediately before the export
    while j >= 0 and lines[j].strip() == '':
        j -= 1
    # Now find the start of the comment block
    # Comment blocks look like: // ----- ... -----
    if j >= 0 and '---' in lines[j]:
        # Found a dash-line, this is part of the comment header
        start = j
        j -= 1
        # Go back while previous line is also a dash-line
        while j >= 0 and '---' in lines[j]:
            start = j
            j -= 1
        # Go back to include any additional comment lines above the dashes
        while j >= 0 and (lines[j].strip().startswith('//') or lines[j].strip() == ''):
            start = j
            j -= 1
        start = j + 1  # +1 because we went one too far
    else:
        # No comment header found, just use the line before the export
        start = j + 1

    # Count braces forward to find the closing `});`
    depth = 0
    end = export_idx
    for k in range(export_idx, len(lines)):
        for ch in lines[k]:
            if ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
        end = k
        if depth <= 0:
            break

    # Return 1-based inclusive range
    return (start + 1, end + 1)


def strip_imports_and_safejson(lines: list[str], label: str) -> list[str]:
    """
    Remove:
      - import { z } from "zod";
      - import { tool, zodSchema } from "ai";
      - standalone safeJson / safeJsonWithRetry function definitions
      - Comment blocks that are ONLY about safeJson
    Return the cleaned lines.
    """
    cleaned = []
    removed_imports = 0
    removed_safejson = 0

    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # ── Skip standalone import lines ──────────────────────────────
        if re.match(r'^import\s+\{.*\}\s+from\s+["\']zod["\']', stripped):
            removed_imports += 1
            i += 1
            continue
        if re.match(r'^import\s+\{.*\}\s+from\s+["\']ai["\']', stripped):
            removed_imports += 1
            i += 1
            continue

        # ── Skip standalone safeJson / safeJsonWithRetry definitions ─
        if re.match(r'^function\s+safeJson(WithRetry)?\b', stripped):
            removed_safejson += 1
            # Skip function body (count braces)
            brace_count = 0
            started = False
            while i < len(lines):
                for ch in lines[i]:
                    if ch == '{':
                        brace_count += 1
                        started = True
                    elif ch == '}':
                        brace_count -= 1
                i += 1
                if started and brace_count <= 0:
                    break
            continue

        # ── Skip comment blocks that are only about safeJson ─────────
        # Look for patterns like:
        #   // Re-export safeJson so this file can be used standalone...
        #   // ── safeJson: pass-through for standalone...
        if re.match(r'^//\s+.*safeJson', stripped, re.IGNORECASE):
            # Skip this comment line and any consecutive comment lines about safeJson
            i += 1
            while i < len(lines) and lines[i].strip().startswith('//'):
                i += 1
            continue

        cleaned.append(line)
        i += 1

    print(f"  [{label}] Removed {removed_imports} imports, {removed_safejson} safeJson defs")
    return cleaned


def remove_leading_blank_lines(lines: list[str]) -> list[str]:
    """Remove blank lines from the start of a list."""
    while lines and lines[0].strip() == '':
        lines.pop(0)
    return lines


def remove_trailing_blank_lines(lines: list[str]) -> list[str]:
    """Remove blank lines from the end of a list."""
    while lines and lines[-1].strip() == '':
        lines.pop()
    return lines


# ---------------------------------------------------------------------------
# Main integration
# ---------------------------------------------------------------------------

def main():
    print("=" * 70)
    print("Tool Integration Script — KlawHub")
    print("=" * 70)

    # 1. Read the original tools.ts
    print(f"\n[1/4] Reading {TOOLS_TS} ...")
    original_lines = read_lines(TOOLS_TS)
    original_count = len(original_lines)
    print(f"  Original file: {original_count} lines")

    # 2. Dynamically find section boundaries
    print(f"\n[2/4] Detecting tool section boundaries ...")
    old_sections = {}
    for name, export_name in TOOL_EXPORTS.items():
        start, end = find_section_bounds(original_lines, export_name)
        old_sections[name] = (start, end)
        section_len = end - start + 1
        print(f"  [{name}] {export_name}: lines {start}–{end} ({section_len} lines)")

    # Validate sections don't overlap
    sorted_bounds = sorted(old_sections.values(), key=lambda x: x[0])
    for i in range(len(sorted_bounds) - 1):
        _, end_curr = sorted_bounds[i]
        start_next, _ = sorted_bounds[i + 1]
        if end_curr >= start_next:
            print(f"\n  ✗ OVERLAP: section ending at {end_curr} overlaps with next starting at {start_next}")
            sys.exit(1)
    print("  No overlaps detected ✓")

    # 3. Read and clean all upgraded files
    print(f"\n[3/4] Reading and cleaning upgraded tool files ...")
    upgraded_content = {}
    for name, path in UPGRADED_FILES.items():
        print(f"  Processing {name} ...")
        raw_lines = read_lines(path)
        print(f"    Raw: {len(raw_lines)} lines")

        cleaned = strip_imports_and_safejson(raw_lines, name)
        cleaned = remove_leading_blank_lines(cleaned)
        cleaned = remove_trailing_blank_lines(cleaned)

        upgraded_content[name] = cleaned
        print(f"    Cleaned: {len(cleaned)} lines")

    # 4. Build the new file by replacing sections
    print(f"\n[4/4] Replacing tool sections ...")

    # Sort sections by start line so we can process them in order
    sorted_sections = sorted(old_sections.items(), key=lambda x: x[1][0])

    new_lines = []
    last_pos = 0  # 0-based position after last copied line

    for name, (start, end) in sorted_sections:
        # Copy everything before this section (from last_pos to start-1)
        # start/end are 1-based, so start-1 is 0-based index
        before_section = original_lines[last_pos:start - 1]
        new_lines.extend(before_section)

        # Add a blank line before the new section if the previous line isn't blank
        if new_lines and new_lines[-1].strip() != '':
            new_lines.append('')

        # Insert the upgraded content
        replacement = upgraded_content[name]
        new_lines.extend(replacement)

        # Track position (end is 1-based inclusive, so next copy starts at end)
        last_pos = end  # end is the last line of the old section (1-based)
                        # Since we use slicing up to `start-1` (0-based = start-1 exclusive),
                        # we need last_pos as 1-based exclusive upper bound
                        # Actually: lines[last_pos:] will skip line at index last_pos (0-based)
                        # So last_pos should be `end` (1-based = 0-based index of end line)
                        # lines[end:] starts from the line after end. But end is 1-based.
                        # end 1-based → 0-based index is end-1. We want to start copying from
                        # line end+1 (1-based), which is index end (0-based). So last_pos = end.

        old_len = end - start + 1
        new_len = len(replacement)
        delta = new_len - old_len
        print(f"  [{name}] Replaced lines {start}–{end} ({old_len} lines) → {new_len} lines (Δ {delta:+d})")

    # Copy everything after the last section
    remaining = original_lines[last_pos:]
    new_lines.extend(remaining)

    # 5. Write the result
    print(f"\n[5/5] Writing updated tools.ts ...")
    output_text = '\n'.join(new_lines) + '\n'
    TOOLS_TS.write_text(output_text, encoding="utf-8")
    new_count = len(new_lines)
    print(f"  New file: {new_count} lines (was {original_count}, Δ {new_count - original_count:+d})")

    # ---------------------------------------------------------------------------
    # Verification
    # ---------------------------------------------------------------------------
    print(f"\n{'=' * 70}")
    print("Verification")
    print(f"{'=' * 70}")

    # Re-read and verify
    result_lines = read_lines(TOOLS_TS)
    result_text = '\n'.join(result_lines)

    checks_passed = 0
    checks_failed = 0

    def check(name, condition, detail=""):
        nonlocal checks_passed, checks_failed
        if condition:
            print(f"  ✓ {name}")
            checks_passed += 1
        else:
            print(f"  ✗ {name} — {detail}")
            checks_failed += 1

    # Check all 4 tool exports exist
    for name, export_name in TOOL_EXPORTS.items():
        check(f"{export_name} exists", f"export const {export_name}" in result_text)

    # Check allTools export exists
    check("allTools export exists", "export const allTools" in result_text)

    # Check toolMap references still exist
    check("create_pdf_report in allTools", "create_pdf_report: createPdfReportTool" in result_text)
    check("create_docx_document in allTools", "create_docx_document: createDocxDocumentTool" in result_text)
    check("create_xlsx_spreadsheet in allTools", "create_xlsx_spreadsheet: createXlsxSpreadsheetTool" in result_text)
    check("create_pptx_presentation in allTools", "create_pptx_presentation: createPptxPresentationTool" in result_text)

    # Check no leftover standalone imports from upgraded files
    import_count = result_text.count('import { z } from "zod"')
    check("No duplicate zod imports", import_count <= 1, f"found {import_count} occurrences")

    import_count = result_text.count('import { tool, zodSchema } from "ai"')
    check("No duplicate ai imports", import_count <= 1, f"found {import_count} occurrences")

    # Check brace balance (rough heuristic — may be off by ±1 due to
    # template literals like ${} or regex containing braces)
    open_braces = result_text.count('{')
    close_braces = result_text.count('}')
    brace_diff = abs(open_braces - close_braces)
    check("Brace balance (±5 tolerance)", brace_diff <= 5,
          f"open={open_braces}, close={close_braces}, diff={open_braces - close_braces}")

    # Check file size is in expected range
    check("File size in expected range", 8000 <= len(result_lines) <= 15000,
          f"got {len(result_lines)} lines")

    # Check the untouched region is preserved (Google Drive tool)
    check("Google Drive tool preserved", "downloadDriveFileTool" in result_text)

    # Check getToolsForAgent still exists at end
    check("getToolsForAgent exists", "export function getToolsForAgent" in result_text)

    # Summary
    print(f"\n  Results: {checks_passed} passed, {checks_failed} failed")

    if checks_failed > 0:
        print("\n  ⚠ SOME CHECKS FAILED — review the output above")
        sys.exit(1)
    else:
        print("\n  ✅ All checks passed — integration successful!")
        sys.exit(0)


if __name__ == "__main__":
    main()
