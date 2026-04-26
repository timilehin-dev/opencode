// ---------------------------------------------------------------------------
// Sync Filesystem Skills → Database
// ---------------------------------------------------------------------------
// Scans /skills/ directory for SKILL.md files and upserts them into the
// `skills` table. Also auto-equips to agents based on AGENT_SKILL_MAP.
//
// POST /api/skills/sync-filesystem  — trigger sync
// GET  /api/skills/sync-filesystem  — status (count synced vs total)
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { query } from "@/lib/db";

// ---------------------------------------------------------------------------
// Agent → Skill category mapping (which agents get which skill categories)
// ---------------------------------------------------------------------------

// Explicit skill → category mapping (aligned with skills page filter tabs)
const SKILL_CATEGORY_MAP: Record<string, { category: string; difficulty: string }> = {
  // Content / Document Creation
  "pdf":            { category: "content",        difficulty: "advanced" },
  "docx":           { category: "content",        difficulty: "intermediate" },
  "pptx":           { category: "content",        difficulty: "intermediate" },
  "charts":         { category: "content",        difficulty: "intermediate" },
  "humanizer":      { category: "communication",  difficulty: "intermediate" },
  // Code / Development
  "fullstack-dev":  { category: "code",           difficulty: "advanced" },
  "code-review":    { category: "code",           difficulty: "advanced" },
  "skill-creator":  { category: "code",           difficulty: "advanced" },
  // Data / Analysis / Finance
  "xlsx":           { category: "data",           difficulty: "intermediate" },
  "finance":        { category: "data",           difficulty: "intermediate" },
  "data-analysis":  { category: "data",           difficulty: "advanced" },
  // Research
  "deep-research":  { category: "research",       difficulty: "advanced" },
  "web-search":     { category: "research",       difficulty: "beginner" },
  "web-reader":     { category: "research",       difficulty: "beginner" },
  // Planning
  "project-planner":{ category: "planning",       difficulty: "intermediate" },
};

const AGENT_SKILL_MAP: Record<string, string[]> = {
  // General gets ALL skills
  general: ["*"],

  // Mail: documents + communication + research + humanizer
  mail: [
    "pdf", "docx", "xlsx", "pptx", "charts",
    "web-search", "web-reader",
    "humanizer", "deep-research",
  ],

  // Code: development + review + project planning
  code: [
    "fullstack-dev", "code-review",
    "pdf", "docx", "xlsx", "charts",
    "web-search", "web-reader",
    "skill-creator", "project-planner",
  ],

  // Data: analysis + finance + visualization
  data: [
    "xlsx", "charts", "finance", "data-analysis",
    "pdf", "docx",
    "web-search", "web-reader",
    "project-planner",
  ],

  // Creative: content creation + humanizer + research
  creative: [
    "pdf", "docx", "xlsx", "pptx", "charts",
    "humanizer", "deep-research",
    "web-search", "web-reader",
  ],

  // Research: deep research + analysis + documents
  research: [
    "deep-research",
    "web-search", "web-reader",
    "pdf", "docx", "xlsx", "charts",
    "data-analysis", "humanizer", "project-planner",
  ],

  // Ops: monitoring + review + diagnostics
  ops: [
    "code-review", "data-analysis",
    "pdf", "charts",
    "web-search", "web-reader",
    "fullstack-dev", "project-planner",
  ],
};

// ---------------------------------------------------------------------------
// Helper: read first N lines of a file to extract metadata
// ---------------------------------------------------------------------------

function extractMetadata(content: string, dirName: string): {
  display_name: string;
  description: string;
  category: string;
  difficulty: string;
  tags: string[];
} {
  const lines = content.split("\n").slice(0, 30);
  let display_name = dirName.replace(/[-_]/g, " ").replace(/\b\w/g, l => l.toUpperCase());
  let description = "";
  const tags: string[] = [];

  // Use the explicit SKILL_CATEGORY_MAP for category & difficulty
  const key = dirName.toLowerCase();
  const mapped = SKILL_CATEGORY_MAP[key];
  const category = mapped?.category ?? "content";
  const difficulty = mapped?.difficulty ?? "intermediate";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Look for title/header patterns
    if (line.startsWith("# ") && display_name === dirName.replace(/[-_]/g, " ").replace(/\b\w/g, l => l.toUpperCase())) {
      display_name = line.slice(2).trim();
    }
    if ((line.startsWith("## Description") || line.startsWith("### Description")) && lines[i + 1]) {
      description = lines[i + 1].trim().slice(0, 500);
    }
    if (line.startsWith("> ") && !description) {
      description = line.slice(2).trim().slice(0, 500);
    }

    // Tags from the directory name and content keywords
    if (line.startsWith("Tags:") || line.startsWith("tags:")) {
      const tagStr = line.split(/[:#]/).slice(1).join("").trim();
      tags.push(...tagStr.split(/[,\[\]]/).map(t => t.trim()).filter(Boolean));
    }
  }

  // Fallback description from first substantial paragraph
  if (!description) {
    const paragraphs = content.split("\n\n").filter(p => p.trim().length > 20);
    if (paragraphs.length > 0) {
      description = paragraphs[0].trim().slice(0, 500).replace(/[#*>`]/g, "").trim();
    } else {
      description = `${display_name} skill — provides structured methodology for ${dirName.replace(/-/g, " ")} tasks`;
    }
  }

  return { display_name, description, category, difficulty, tags };
}

// ---------------------------------------------------------------------------
// POST handler: scan filesystem and sync to DB
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const skillsDir = join(process.cwd(), "skills");

    // List all directories under /skills/
    let entries: string[];
    try {
      entries = await readdir(skillsDir);
    } catch {
      return NextResponse.json({
        success: false,
        error: "Skills directory not found at /skills/",
      });
    }

    // Filter to directories that have SKILL.md
    const skillDirs: string[] = [];
    for (const entry of entries) {
      const skillPath = join(skillsDir, entry, "SKILL.md");
      try {
        await readFile(skillPath, "utf-8");
        skillDirs.push(entry);
      } catch {
        // Not a skill directory (no SKILL.md) — skip
        // Also check for single-file skills like klaw-designer.md
      }
    }

    // Also check for single .md files in /skills/ root
    for (const entry of entries) {
      if (entry.endsWith(".md") && !entry.startsWith("klaw-")) {
        // Could be a top-level skill file
      }
    }

    let synced = 0;
    let errors: string[] = [];

    for (const dirName of skillDirs) {
      try {
        const skillPath = join(skillsDir, dirName, "SKILL.md");
        const content = await readFile(skillPath, "utf-8");

        // Extract metadata from SKILL.md content
        const meta = extractMetadata(content, dirName);

        // Generate a stable ID from directory name
        const id = `skill-${dirName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
        const name = dirName.toLowerCase().replace(/\s+/g, "_");
        const slug = dirName.toLowerCase().replace(/[^a-z0-9-]/g, "-");

        // Determine agent bindings
        const agentBindings: string[] = [];
        for (const [agent, skillPatterns] of Object.entries(AGENT_SKILL_MAP)) {
          if (skillPatterns.includes("*")) {
            agentBindings.push(agent);
            continue;
          }
          if (
            skillPatterns.some(
              p => p.toLowerCase() === name || p.toLowerCase() === slug || p.toLowerCase() === dirName.toLowerCase()
            )
          ) {
            agentBindings.push(agent);
          }
        }

        // Upsert into DB
        await query(
          `INSERT INTO skills (id, name, display_name, slug, description, category, difficulty, prompt_template, tags, agent_bindings, is_builtin, is_active, version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, true, 1)
           ON CONFLICT (name) DO UPDATE SET
             display_name = EXCLUDED.display_name,
             slug = EXCLUDED.slug,
             description = EXCLUDED.description,
             category = EXCLUDED.category,
             difficulty = EXCLUDED.difficulty,
             prompt_template = EXCLUDED.prompt_template,
             tags = EXCLUDED.tags,
             agent_bindings = EXCLUDED.agent_bindings,
             is_builtin = true,
             is_active = true,
             updated_at = NOW(),
             version = skills.version + 1`,
          [
            id,
            name,
            meta.display_name,
            slug,
            meta.description,
            meta.category,
            meta.difficulty,
            content,  // SKILL.md content = prompt_template
            meta.tags,
            agentBindings,
          ]
        );

        synced++;
      } catch (e) {
        errors.push(`${dirName}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // -------------------------------------------------------------------
    // Delete stale skills from DB that no longer exist on the filesystem
    // -------------------------------------------------------------------
    const validNames = skillDirs.map(d => d.toLowerCase().replace(/\s+/g, "_"));
    const placeholders = validNames.map((_, i) => `$${i + 1}`).join(", ");

    // First, unequip any agent_skills for skills about to be deleted
    await query(
      `DELETE FROM agent_skills
       WHERE skill_id IN (SELECT id FROM skills WHERE name NOT IN (${placeholders}))`,
      validNames
    );

    // Delete stale skill_executions
    await query(
      `DELETE FROM skill_executions
       WHERE skill_id IN (SELECT id FROM skills WHERE name NOT IN (${placeholders}))`,
      validNames
    );

    // Delete stale skill_evolution entries
    await query(
      `DELETE FROM skill_evolution
       WHERE skill_id IN (SELECT id FROM skills WHERE name NOT IN (${placeholders}))`,
      validNames
    );

    // Finally delete the stale skills themselves
    const deleteResult = await query(
      `DELETE FROM skills WHERE name NOT IN (${placeholders})`,
      validNames
    );
    const deleted = deleteResult.rowCount || 0;

    // Now auto-equip all active skills to their bound agents
    const equipResult = await query(`
      INSERT INTO agent_skills (agent_id, skill_id, is_equipped)
      SELECT DISTINCT unnest(s.agent_bindings), s.id, true
      FROM skills s
      WHERE s.is_active = true
        AND array_length(s.agent_bindings, 1) > 0
      ON CONFLICT (agent_id, skill_id) DO UPDATE SET
        is_equipped = true,
        equipped_at = NOW()
    `);

    return NextResponse.json({
      success: true,
      synced,
      deleted,
      total: skillDirs.length,
      errors: errors.length > 0 ? errors : undefined,
      equipped_to_agents: equipResult.rowCount,
    });
  } catch (e) {
    console.error("[sync-filesystem] Error:", e);
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

// ---------------------------------------------------------------------------
// GET handler: return status
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    // Count skills in DB vs filesystem
    const dbResult = await query(
      "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_builtin = true) as builtin, COUNT(*) FILTER (WHERE is_active = true) as active FROM skills"
    );
    const dbCount = dbResult.rows[0];

    const skillsDir = join(process.cwd(), "skills");
    let fsCount = 0;
    try {
      const entries = await readdir(skillsDir);
      for (const entry of entries) {
        try {
          await readFile(join(skillsDir, entry, "SKILL.md"), "utf-8");
          fsCount++;
        } catch {}
      }
    } catch {}

    return NextResponse.json({
      filesystem_skills: fsCount,
      database_skills: parseInt(dbCount.total) || 0,
      database_builtin: parseInt(dbCount.builtin) || 0,
      database_active: parseInt(dbCount.active) || 0,
    });
  } catch (e) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
