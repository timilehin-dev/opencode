# Dead Code Report — KlawHub

**Generated**: Auto-analyzed via grep across `src/` directory
**Methodology**: For each exported function/type/constant, searched for any import statement (`from '@/lib/...'`) or dynamic import (`await import(...)`) in the entire `src/` tree.

**IMPORTANT**: No code was deleted. This report is for documentation only.

---

## Summary

| File | Dead Exports | Safe to Remove |
|------|-------------|----------------|
| `src/lib/supabase.ts` | 4 | ✅ Yes |
| `src/lib/self-learning.ts` | 2 | ✅ Yes |
| `src/lib/stitch.ts` | 1 | ✅ Yes |
| `src/lib/api-clients.ts` | 0 | — |
| `src/lib/vercel.ts` | 0 | — |
| `src/lib/a2a.ts` | 8 | ⚠️ See notes |
| `src/lib/task-queue.ts` | 7 | ⚠️ See notes |
| `src/lib/api-errors.ts` | 4 | ⚠️ See notes |
| `src/lib/rate-limiter.ts` | 1 | ⚠️ See notes |

---

## Detailed Findings

### 1. `src/lib/supabase.ts`

| Export | Type | Imported Anywhere? | Safe to Remove? |
|--------|------|--------------------|-----------------|
| `getDb` | Function (alias for `getSupabase`) | ❌ No | ✅ Yes — zero imports |
| `SCHEMA_SQL` | Constant (string) | ❌ No | ✅ Yes — now re-exported via `unified-schema.ts` |
| `KEY_USAGE_SCHEMA_SQL` | Constant (string) | ❌ No | ✅ Yes — now re-exported via `unified-schema.ts` |
| `RLS_FIX_SQL` | Constant (string) | ❌ No | ✅ Yes — now re-exported via `unified-schema.ts` |

**Notes**:
- `PHASE2_SCHEMA_SQL`, `PHASE3_SCHEMA_SQL`, `WORKSPACE_SCHEMA_SQL` are all imported by their respective setup routes. NOT dead.
- `getSupabase()` is imported in 4 files. NOT dead.
- `isSupabaseReady()` is imported in status route. NOT dead.

### 2. `src/lib/self-learning.ts`

| Export | Type | Imported Anywhere? | Safe to Remove? |
|--------|------|--------------------|-----------------|
| `applyInsight` | Function | ❌ No | ✅ Yes — replaced by internal `markInsightsApplied()` |
| `LEARNING_INSIGHTS_SCHEMA` | Constant (string) | ❌ No | ✅ Yes — duplicated in `supabase-setup.ts` PHASE4_SCHEMA_SQL |

**Notes**:
- `applyInsight` was a public wrapper around the UPDATE query, but `getInsightsForPrompt` now uses the internal `markInsightsApplied` directly (batch version). The standalone `applyInsight` is never called.
- All other exports (`recordLearning`, `getAgentInsights`, `getAllInsights`, `getInsightsForPrompt`, `detectPatterns`, `decayInsights`, `getLearningStats`, `LearningInsight` type) are actively used.

### 3. `src/lib/stitch.ts`

| Export | Type | Imported Anywhere? | Safe to Remove? |
|--------|------|--------------------|-----------------|
| `getProject` | Function | ❌ No | ✅ Yes — `listProjects` is used instead |

**Notes**:
- All other exports (`listProjects`, `createProject`, `generateScreen`, `generateDesign`, `editScreen`, `generateVariants`, `listScreens`, `fetchHtmlContent`, `isStitchConfigured`, `getStitchStatus`) are imported by `src/app/api/stitch/route.ts`.
- The entire file is only used if `@google/stitch-sdk` is available. The route returns an error if `STITCH_API_KEY` is not set.

### 4. `src/lib/api-clients.ts`

| Export | Type | Imported Anywhere? | Safe to Remove? |
|--------|------|--------------------|-----------------|
| `executeCodeJudge0` | Function | ✅ Yes (`tools.ts`) | No |
| `readWebPage` | Function | ✅ Yes (`tools.ts`) | No |
| `getStockQuote` | Function | ✅ Yes (`tools.ts`) | No |
| `getHistoricalData` | Function | ✅ Yes (`tools.ts`) | No |
| `searchPapers` | Function | ✅ Yes (`tools.ts`) | No |
| `getPaperDetails` | Function | ✅ Yes (dynamic import in `tools.ts`) | No |
| `getAuthorPapers` | Function | ✅ Yes (dynamic import in `tools.ts`) | No |
| `duckDuckGoSearch` | Function | ✅ Yes (`tools.ts`) | No |
| `getMarketNews` | Function | ✅ Yes (`tools.ts`) | No |

**Result**: All exported functions are used. **No dead code found.**

### 5. `src/lib/vercel.ts`

| Export | Type | Imported Anywhere? | Safe to Remove? |
|--------|------|--------------------|-----------------|
| `listProjects` | Function | ✅ Yes (`vercel/route.ts`, `overview/route.ts`, `tools.ts`) | No |
| `getProject` | Function | ✅ Yes (`vercel/route.ts`) | No |
| `listDeployments` | Function | ✅ Yes (`vercel/route.ts`, `tools.ts`) | No |
| `getDeployment` | Function | ✅ Yes (`tools.ts`) | No |
| `listDomains` | Function | ✅ Yes (`vercel/route.ts`, `tools.ts`) | No |
| `listEnvVars` | Function | ✅ Yes (`vercel/route.ts`) | No |

**Result**: All exported functions are used. **No dead code found.**

### 6. `src/lib/a2a.ts` — Potentially Dead Exports

| Export | Type | Imported Anywhere? | Safe to Remove? |
|--------|------|--------------------|-----------------|
| `sendA2AResponse` | Function | ❌ No (internal only) | ⚠️ Possibly — wraps `sendA2AMessage` |
| `getUnreadCount` | Function | ❌ No | ⚠️ Possibly — convenience function |
| `getChannelMessages` | Function | ❌ No | ⚠️ Possibly — channel support |
| `getAgentChannels` | Function | ❌ No | ⚠️ Possibly — channel support |
| `getA2AMessages` | Function | ❌ No | ⚠️ Possibly — legacy, replaced by `getAgentInbox` |
| `updateA2ATaskStatus` | Function | ❌ No | ⚠️ Possibly — task management |
| `getAgentA2ATasks` | Function | ❌ No | ⚠️ Possibly — task management |
| `sendAgentHandoff` | Function | ❌ No | ⚠️ Possibly — handoff protocol |
| `expireOldMessages` | Function | ❌ No | ⚠️ Possibly — maintenance |
| `createA2ATask` | Function | ⚠️ Internal only | ⚠️ Possibly — used by `sendAgentHandoff` internally |

**Notes**:
- These are **API-level convenience functions** that could be useful in future routes. They are well-tested infrastructure.
- `sendA2AResponse` is only called internally by `sendAgentHandoff` (indirectly through `createA2ATask`).
- The actively used functions are: `sendA2AMessage`, `broadcastA2AMessage`, `getAgentInbox`, `markMessagesRead`, `shareContext`, `queryContext`, `getOrCreateChannel`, `postToChannel` (all via dynamic imports in `tools.ts`), plus `getAgentA2AMessages` (static import in `agents/message/route.ts`).
- **Recommendation**: Do NOT remove these. They form part of the A2A communication infrastructure and may be needed for upcoming features.

### 7. `src/lib/task-queue.ts` — Potentially Dead Exports

| Export | Type | Imported Anywhere? | Safe to Remove? |
|--------|------|--------------------|-----------------|
| `getNextTask` | Function | ❌ No | ⚠️ Possibly |
| `getAnyPendingTask` | Function | ❌ No | ⚠️ Possibly |
| `startTask` | Function | ❌ No | ⚠️ Possibly |
| `completeTask` | Function | ❌ No | ⚠️ Possibly |
| `failTask` | Function | ❌ No | ⚠️ Possibly |
| `cancelTask` | Function | ❌ No | ⚠️ Possibly |
| `getPendingTaskCount` | Function | ❌ No | ⚠️ Possibly |

**Notes**:
- `createTask` is imported by `agents/route.ts` and `automation-engine.ts`.
- `getRecentTasks` and `AgentTask` type are imported by `events/stream/route.ts` and `dashboard/route.ts`.
- The dead exports are the **task lifecycle management** functions (start, complete, fail, cancel) and polling functions. They may be intended for future agent self-management.
- **Recommendation**: Do NOT remove. These are core task queue operations needed for autonomous agent loops.

### 8. `src/lib/api-errors.ts` — Potentially Dead Exports

| Export | Type | Imported Anywhere? | Safe to Remove? |
|--------|------|--------------------|-----------------|
| `apiSuccess` | Function | ❌ No | ⚠️ No — used internally by `withErrorHandler` pattern |
| `apiErrorResponse` | Function | ❌ No | ⚠️ No — used internally by `withErrorHandler` |
| `parseBody` | Function | ❌ No | ✅ Yes — but utility |
| `requireFields` | Function | ❌ No | ✅ Yes — but utility |

**Notes**:
- `withErrorHandler` and `ApiError` are actively imported. NOT dead.
- `apiSuccess` and `apiErrorResponse` are called internally by `withErrorHandler`. They're not meant to be imported directly.
- `parseBody` and `requireFields` are convenience helpers that haven't been adopted yet.
- **Recommendation**: Keep `apiSuccess`/`apiErrorResponse` (internal). Consider removing `parseBody`/`requireFields` if unused in 30 days.

### 9. `src/lib/rate-limiter.ts` — Potentially Dead Exports

| Export | Type | Imported Anywhere? | Safe to Remove? |
|--------|------|--------------------|-----------------|
| `rateLimit` | Function | ❌ No | ⚠️ No — documented in comments |
| `cleanupStore` | Function | ❌ No | ✅ Yes — cleanup utility |

**Notes**:
- `checkRateLimit` is imported by `middleware.ts`. NOT dead.
- `rateLimit` is documented in the file's usage example but not used. It's a higher-level wrapper.
- **Recommendation**: Keep `rateLimit` (it's the documented API). Remove `cleanupStore` if no periodic cleanup is needed.

---

## Schema SQL Duplication Notes

| Constant | Location | Status |
|----------|----------|--------|
| `SCHEMA_SQL` | `supabase.ts` | Core tables — canonical source |
| `WORKSPACE_SCHEMA_SQL` | `supabase.ts` | **DUPLICATE** of tables in `SCHEMA_SQL` (reminders, todos, contacts) |
| `PHASE2_SCHEMA_SQL` | `supabase.ts` | Also duplicated inside `PHASE4_SCHEMA_SQL` in `supabase-setup.ts` |
| `LEARNING_INSIGHTS_SCHEMA` | `self-learning.ts` | Also duplicated inside `PHASE4_SCHEMA_SQL` in `supabase-setup.ts` |
| `PHASE4_SCHEMA_SQL` | `supabase-setup.ts` | Contains Phase 2 + Phase 4 tables |
| `A2A_TABLES_SQL` | `supabase-setup.ts` | Only has `a2a_messages` and `a2a_tasks` — missing `a2a_shared_context`, `a2a_channels`, `a2a_channel_messages` |

## Missing Tables

The following tables are referenced in code but have **no CREATE TABLE** in any schema file:

| Table | Referenced In | Status |
|-------|--------------|--------|
| `workflow_executions` | `workflow-engine.ts` | ✅ **Fixed** — Added to `WORKFLOW_SCHEMA_SQL` in `unified-schema.ts` |
| `a2a_shared_context` | `a2a.ts` (`shareContext`, `queryContext`) | ✅ **Fixed** — Added to `A2A_EXTENDED_TABLES_SQL` in `unified-schema.ts` |
| `a2a_channels` | `a2a.ts` (`getOrCreateChannel`, `postToChannel`) | ✅ **Fixed** — Added to `A2A_EXTENDED_TABLES_SQL` in `unified-schema.ts` |
| `a2a_channel_messages` | `a2a.ts` (`postToChannel`, `getChannelMessages`) | ✅ **Fixed** — Added to `A2A_EXTENDED_TABLES_SQL` in `unified-schema.ts` |

---

## Recommendations

1. **Safe to remove now** (confirmed zero usage):
   - `getDb` alias from `supabase.ts`
   - `getProject` from `stitch.ts`
   - `applyInsight` from `self-learning.ts`
   - `parseBody`, `requireFields` from `api-errors.ts`

2. **Safe to remove but keep for now** (utility exports):
   - `SCHEMA_SQL`, `KEY_USAGE_SCHEMA_SQL`, `RLS_FIX_SQL` from `supabase.ts` — now re-exported via `unified-schema.ts`
   - `LEARNING_INSIGHTS_SCHEMA` from `self-learning.ts` — duplicated in `PHASE4_SCHEMA_SQL`

3. **Do NOT remove** (infrastructure for future/current use):
   - All `a2a.ts` exports — core A2A protocol functions
   - All `task-queue.ts` exports — core task management operations
   - `apiSuccess`, `apiErrorResponse` from `api-errors.ts` — used internally
