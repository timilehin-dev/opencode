---
Task ID: 1
Agent: Main Agent
Task: Complete skills system overhaul — sync filesystem skills, fix phantom names, make agents self-aware

Work Log:
- Investigated full skills architecture: 11 skill tools, DB tables (skills, agent_skills, skill_executions, skill_evolution), filesystem skills dir with 46 SKILL.md files
- Found critical gap: only 10 builtin skills in DB, 12 phantom skills with no SKILL.md, 46 filesystem skills NOT synced
- Found AGENT_SKILL_LIST had phantom names (code_review, research_deep, meeting_prep, etc.) that DID exist in DB but had no filesystem backing
- Created /api/skills/sync-filesystem/route.ts for manual filesystem→DB sync
- Updated seed-builtin route to auto-sync all filesystem skills on deploy
- Fixed AGENT_SKILL_LIST: replaced phantom names with real filesystem skill names (docx, xlsx, pdf, ppt, pptx, charts, web-search, web-reader, etc.)
- Rewrote getSkillsAwareness() to be MANDATORY PROACTIVE USAGE with task→skill auto-detection table
- Fixed UUID generation bug (id column is UUID type, not TEXT)
- Fixed missing category parameter in SQL INSERT
- Ran direct DB sync: 46/46 filesystem skills synced successfully
- Total: 65 active skills in DB, 154 agent-skill bindings
- Agent bindings: general=65, creative=27, code=17, data=17, mail=15, research=13, ops=11

Stage Summary:
- All 46 filesystem skills now synced to DB with full SKILL.md content as prompt_template
- Each skill auto-equipped to appropriate agents based on category mapping
- Agents now have MANDATORY skill awareness with task→skill mapping table in system prompts
- skill_use tool will find skills via exact name match → slug match → ILIKE fuzzy match
- Commits: 28515c1 (initial), dea93f7 (UUID fix)
