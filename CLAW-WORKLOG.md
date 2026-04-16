---
Task ID: A2A-autonomous-routing
Agent: Super Z (Main)
Task: Fix email markdown headers + implement autonomous A2A routing between specialist agents

Work Log:
- Diagnosed that `plainTextToHtml()` in google.ts only handled exactly `### `, `## `, `# ` — missed `#### ` through `###### ` and headings without spaces
- Replaced 3 hardcoded heading checks with single regex `/^#{1,6}\s*(.+)/` that handles all levels
- Identified that NO specialist agent had the `query_agent` tool — A2A routing was completely non-functional
- Removed domain-inappropriate tools from Creative Agent: `gmail_send`, `gmail_fetch`, `calendar_list`, `calendar_events`, `calendar_create`
- Added `query_agent` to all 4 specialist agents: mail, code, data, creative
- Updated `query_agent` tool description to emphasize AUTONOMOUS task routing (not just querying)
- Created shared constants `AGENT_TEAM_DIRECTORY` and `AUTONOMOUS_ROUTING_RULES` for DRY
- Rewrote all 5 agent system prompts to include Team Directory and Autonomous Routing sections
- Removed "When Asked Outside Your Domain" refusal sections that told users to try another agent
- Agents now autonomously route tasks via `query_agent` without asking user permission
- Build passed, pushed to GitHub for Vercel auto-deploy

Stage Summary:
- 3 files changed: google.ts (email formatter), tools.ts (query_agent description), agents.ts (complete rewrite)
- Creative Agent no longer has email/calendar tools — must route to Mail Agent
- All specialist agents can now autonomously collaborate via query_agent
- The delegation chain works: agent recognizes task outside domain → routes to correct specialist → specialist executes with provided context → result returned
- Committed as: feat: A2A autonomous routing + fix email markdown headers
