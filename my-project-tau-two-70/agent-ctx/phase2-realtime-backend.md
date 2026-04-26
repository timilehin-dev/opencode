# Phase 2: Real-time Backend — Implementation Report

## Summary
Implemented the complete Phase 2 real-time backend for Claw Agent Hub. All 8 steps completed successfully. TypeScript compiles clean with `tsc --noEmit`. No existing functionality was broken.

## Files Created (8 new files)

### Backend — Data Layer
1. **`src/lib/activity.ts`** (~210 lines) — Phase 2 data access layer
   - `logActivity()` — Fire-and-forget activity logging to `agent_activity` table
   - `getRecentActivity(limit)` — Fetch recent events for Ops Feed
   - `persistAgentStatus(agentId, update)` — Upsert agent status using INSERT ON CONFLICT
   - `getAllPersistedStatuses()` — Get all agent statuses from DB
   - `getDashboardMetrics()` — Aggregate metrics for Metrics Row (messages today, tool calls, tasks done, active delegations)

### Backend — API Routes
2. **`src/app/api/events/stream/route.ts`** (~130 lines) — SSE endpoint
   - GET /api/events/stream — Server-Sent Events stream
   - Sends initial snapshot (agent statuses, activity, metrics, todos)
   - Polls every 3s for new activity + status changes
   - Emits events: `snapshot`, `activity`, `status`, `metrics`
   - Handles client disconnect via abort signal

3. **`src/app/api/dashboard/route.ts`** (~65 lines) — REST fallback
   - GET /api/dashboard — Full dashboard snapshot
   - Returns merged in-memory + DB agent statuses, activity, metrics, todos

4. **`src/app/api/todos/route.ts`** (~40 lines) — Todo CRUD
   - GET /api/todos — List all todos
   - POST /api/todos — Update todo status (toggle done/open)

5. **`src/app/api/setup/phase2/route.ts`** (~40 lines) — Migration endpoint
   - POST /api/setup/phase2 — Creates `agent_activity` and `agent_status` tables

### Frontend — Hooks
6. **`src/hooks/use-dashboard-stream.ts`** (~230 lines) — Real-time data hook
   - Tries SSE first via EventSource
   - Falls back to polling /api/dashboard every 5s on SSE failure
   - Returns: `{ agentStatuses, activity, metrics, todos, isConnected, reconnect }`
   - Auto-reconnects on SSE error → polling → try SSE again

## Files Modified (6 existing files)

7. **`src/lib/supabase.ts`** — Added `PHASE2_SCHEMA_SQL` export (~30 lines added)
   - `agent_activity` table with indexes on agent_id+created_at and created_at
   - `agent_status` table with PRIMARY KEY on agent_id

8. **`src/app/api/chat/route.ts`** — Instrumented with Phase 2 logging (~15 lines added)
   - Added import of `logActivity` and `persistAgentStatus`
   - After `updateAgentStatus("busy")` → log `status_change` + persist
   - In `onStepFinish` with toolCalls → log `tool_call` for each tool
   - In `onStepFinish` with finishReason="stop" → log `chat_message` + persist messages
   - In `onFinish` → log `task_complete` + persist status with tasksCompleted
   - In `onError` → log `error` + persist error status
   - ALL calls are fire-and-forget (`.catch(() => {})`) — never block the chat response

9. **`src/components/dashboard/ops-feed.tsx`** — Replaced mock data with real events (~130 lines rewritten)
   - Removed all `MOCK_OPS` hardcoded data
   - Accepts `events` and `isConnected` props
   - Shows real-time activity with proper formatting
   - Auto-scrolls to newest event
   - Shows "No activity yet" empty state
   - Live badge reflects actual connection status (green/red)

10. **`src/components/dashboard/agent-crew.tsx`** — Wired to real statuses (~120 lines rewritten)
    - Accepts `agentStatuses` prop
    - Replaced hardcoded Active/Standby with real status from DB
    - Status colors: busy=emerald, idle=gray, error=red, offline=dim
    - `currentTask` shown as tooltip on hover
    - Smooth transition on status changes

11. **`src/components/dashboard/metrics-row.tsx`** — Wired to real metrics (~80 lines rewritten)
    - Accepts `metrics` prop
    - Shows real numbers from DB
    - Shows "—" when metrics haven't loaded yet
    - Dynamic delta text based on actual values

12. **`src/components/dashboard/active-tasks.tsx`** — Wired to real todos (~190 lines rewritten)
    - Accepts `todos` prop
    - Checkbox click calls POST /api/todos with optimistic update
    - Shows "No tasks yet" empty state
    - Proper priority labels from DB
    - Agent emoji chips based on assigned_agent

13. **`src/components/dashboard/coordination-map.tsx`** — Added Phase 2.5 comment + banner (~5 lines changed)
    - Added comment: `// Phase 2.5: Wire to real delegation events from query_agent tool`
    - Added subtle "Showing recent delegations" banner at top

14. **`src/components/dashboard/mission-control.tsx`** — Wired metrics and todos props (~5 lines changed)
    - Passes `metrics` and `todos` to child components

15. **`src/app/page.tsx`** — Wired useDashboardStream hook (~10 lines changed)
    - Added `useDashboardStream()` import and call
    - Passes `agentStatuses` to AgentCrew
    - Passes `events` and `isConnected` to OpsFeed
    - Passes `metrics` and `todos` to MissionControl

## Architecture Decisions
- **pg Pool pattern**: Matches existing `workspace.ts` — each function creates a pool, queries, then ends
- **Fire-and-forget**: All `logActivity()` and `persistAgentStatus()` calls use `.catch(() => {})` to never block chat
- **SSE with polling fallback**: EventSource first, degrades gracefully to REST polling
- **Merged statuses**: In-memory for real-time, DB for persistence — merged in dashboard endpoint
- **INSERT ON CONFLICT**: Atomic upsert for agent_status avoids race conditions
