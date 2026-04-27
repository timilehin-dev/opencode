// ---------------------------------------------------------------------------
// Memory Tools — Agent-callable tools for persistent memory operations
//
// These tools allow agents to save, search, recall, and manage their own
// memories at runtime. This is critical for autonomous task execution —
// agents can now carry context between runs.
//
// Tools:
//   - memory_save:      Save a memory (fact, preference, event, workflow)
//   - memory_search:    Search memories by keyword
//   - memory_recall:    Recall recent memories (by category, limit)
//   - memory_forget:    Delete a memory by ID
//   - memory_list:      List all memories for the current agent
//   - memory_summary:   Get a formatted summary of all memories (for context)
// ---------------------------------------------------------------------------

import { tool, zodSchema, z, getCurrentAgentId } from './shared';
import { getSupabase } from '@/lib/schema/supabase';

// ─── Memory Save ─────────────────────────────────────────────────────────────

export const memorySave = tool({
  description: `Save a memory for future reference. Use this to remember important facts, user preferences, task outcomes, workflow recipes, or lessons learned. Memories persist across sessions and are loaded automatically in future conversations.

Categories:
- "episodic" — Events, experiences, task outcomes (importance 4)
- "semantic" — Facts, knowledge, preferences (importance 6)
- "procedural" — Workflows, recipes, how-to steps (importance 7)
- "preference" — User preferences, style choices (importance 6)
- "context" — Project context, current situation (importance 5)
- "instruction" — Standing instructions, rules (importance 8)`,
  inputSchema: zodSchema(z.object({
    content: z.string().describe('The memory content to save. Be specific and concise — future-you will read this.'),
    category: z.enum(['episodic', 'semantic', 'procedural', 'preference', 'context', 'instruction']).describe('Memory category — episodic=events, semantic=facts, procedural=workflows, preference=user likes, context=project state, instruction=rules'),
    importance: z.number().min(1).max(10).optional().describe('Importance 1-10 (default varies by category). Higher = more likely to be loaded into context.'),
    tags: z.array(z.string()).optional().describe('Optional tags for organization (e.g., ["gmail", "urgent", "github-bug"])'),
  })),
  execute: async ({ content, category, importance, tags }) => {
    const agentId = getCurrentAgentId();
    if (!agentId) return 'Error: No agent ID available — cannot save memory.';

    // Default importance by category
    const defaultImportance: Record<string, number> = {
      episodic: 4, semantic: 6, procedural: 7,
      preference: 6, context: 5, instruction: 8, general: 5,
    };
    const imp = importance ?? defaultImportance[category] ?? 5;

    try {
      const supabase = getSupabase();
      if (!supabase) return 'Error: Database not configured.';

      const metadata = tags ? { tags } : {};

      const { data, error } = await supabase
        .from('agent_memory')
        .insert({
          agent_id: agentId,
          category,
          content,
          importance: imp,
          metadata,
        })
        .select('id')
        .single();

      if (error) {
        // Try without metadata column (legacy schema)
        const { data: fallback, error: fallbackError } = await supabase
          .from('agent_memory')
          .insert({
            agent_id: agentId,
            category,
            content,
            importance: imp,
          })
          .select('id')
          .single();

        if (fallbackError) return `Error saving memory: ${fallbackError.message}`;
        return `Memory saved (ID: ${fallback?.id}, category: ${category}, importance: ${imp})`;
      }

      return `Memory saved (ID: ${data?.id}, category: ${category}, importance: ${imp})`;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error saving memory: ${message}`;
    }
  },
});

// ─── Memory Search ───────────────────────────────────────────────────────────

export const memorySearch = tool({
  description: `Search your persistent memories by keyword. Returns memories matching your query across all categories. Use this to find specific facts, past events, or preferences you've saved before.`,
  inputSchema: zodSchema(z.object({
    query: z.string().describe('Search query — keywords to find in memory content'),
    category: z.enum(['episodic', 'semantic', 'procedural', 'preference', 'context', 'instruction', 'all']).optional().describe('Filter by category (default: all)'),
    limit: z.number().min(1).max(20).optional().describe('Max results to return (default: 10)'),
  })),
  execute: async ({ query, category, limit }) => {
    const agentId = getCurrentAgentId();
    if (!agentId) return 'Error: No agent ID available.';

    try {
      const supabase = getSupabase();
      if (!supabase) return 'Error: Database not configured.';

      let queryBuilder = supabase
        .from('agent_memory')
        .select('id, category, content, importance, created_at, updated_at')
        .eq('agent_id', agentId);

      if (category && category !== 'all') {
        queryBuilder = queryBuilder.eq('category', category);
      }

      // Text search via ilike (Supabase supports this)
      queryBuilder = queryBuilder
        .or(`content.ilike.%${query}%`)
        .order('importance', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit || 10);

      const { data: memories, error } = await queryBuilder;

      if (error) return `Error searching memories: ${error.message}`;
      if (!memories || memories.length === 0) return `No memories found matching "${query}".`;

      const formatted = memories.map(m =>
        `[ID:${m.id}] [${m.category}] (importance: ${m.importance}) ${m.content}`
      ).join('\n');

      return `Found ${memories.length} memories:\n${formatted}`;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error searching memories: ${message}`;
    }
  },
});

// ─── Memory Recall ────────────────────────────────────────────────────────────

export const memoryRecall = tool({
  description: `Recall your most recent memories. Returns recent memories ordered by recency. Use this to quickly catch up on context from previous sessions or recent task executions.`,
  inputSchema: zodSchema(z.object({
    category: z.enum(['episodic', 'semantic', 'procedural', 'preference', 'context', 'instruction', 'all']).optional().describe('Filter by category (default: all)'),
    limit: z.number().min(1).max(30).optional().describe('Max memories to recall (default: 10)'),
    min_importance: z.number().min(1).max(10).optional().describe('Minimum importance threshold (default: 1)'),
  })),
  execute: async ({ category, limit, min_importance }) => {
    const agentId = getCurrentAgentId();
    if (!agentId) return 'Error: No agent ID available.';

    try {
      const supabase = getSupabase();
      if (!supabase) return 'Error: Database not configured.';

      let queryBuilder = supabase
        .from('agent_memory')
        .select('id, category, content, importance, created_at, updated_at')
        .eq('agent_id', agentId);

      if (category && category !== 'all') {
        queryBuilder = queryBuilder.eq('category', category);
      }

      if (min_importance) {
        queryBuilder = queryBuilder.gte('importance', min_importance);
      }

      const { data: memories, error } = await queryBuilder
        .order('created_at', { ascending: false })
        .limit(limit || 10);

      if (error) return `Error recalling memories: ${error.message}`;
      if (!memories || memories.length === 0) return 'No memories found. Use memory_save to store important information.';

      const formatted = memories.map(m =>
        `[${m.category}] (importance: ${m.importance}, ${new Date(m.created_at).toLocaleDateString()}) ${m.content}`
      ).join('\n');

      return `Recalled ${memories.length} recent memories:\n${formatted}`;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error recalling memories: ${message}`;
    }
  },
});

// ─── Memory Forget ───────────────────────────────────────────────────────────

export const memoryForget = tool({
  description: `Delete a specific memory by ID. Use this to remove outdated, incorrect, or no-longer-relevant memories. Always confirm you have the right ID before deleting.`,
  inputSchema: zodSchema(z.object({
    id: z.union([z.string(), z.number()]).describe('The memory ID to delete (from memory_list or memory_search results)'),
  })),
  execute: async ({ id }) => {
    const agentId = getCurrentAgentId();
    if (!agentId) return 'Error: No agent ID available.';

    try {
      const supabase = getSupabase();
      if (!supabase) return 'Error: Database not configured.';

      // Verify it belongs to this agent first
      const { data: existing, error: findError } = await supabase
        .from('agent_memory')
        .select('id, content')
        .eq('id', id)
        .eq('agent_id', agentId)
        .single();

      if (findError || !existing) {
        return `Memory ID ${id} not found for this agent.`;
      }

      const { error } = await supabase
        .from('agent_memory')
        .delete()
        .eq('id', id)
        .eq('agent_id', agentId);

      if (error) return `Error deleting memory: ${error.message}`;
      return `Memory deleted: "${existing.content.substring(0, 80)}..."`;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error deleting memory: ${message}`;
    }
  },
});

// ─── Memory List ─────────────────────────────────────────────────────────────

export const memoryList = tool({
  description: `List all your memories with optional filtering. Returns a summary of all stored memories grouped by category. Use this to see what you remember and identify gaps.`,
  inputSchema: zodSchema(z.object({
    category: z.enum(['episodic', 'semantic', 'procedural', 'preference', 'context', 'instruction', 'all']).optional().describe('Filter by category (default: all)'),
  })),
  execute: async ({ category }) => {
    const agentId = getCurrentAgentId();
    if (!agentId) return 'Error: No agent ID available.';

    try {
      const supabase = getSupabase();
      if (!supabase) return 'Error: Database not configured.';

      // Get count by category
      let countQuery = supabase
        .from('agent_memory')
        .select('category, count')
        .eq('agent_id', agentId);

      if (category && category !== 'all') {
        countQuery = countQuery.eq('category', category);
      }

      // Get recent memories
      let recentQuery = supabase
        .from('agent_memory')
        .select('id, category, content, importance, created_at')
        .eq('agent_id', agentId)
        .order('importance', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(15);

      if (category && category !== 'all') {
        recentQuery = recentQuery.eq('category', category);
      }

      const [countResult, recentResult] = await Promise.all([countQuery, recentQuery]);

      if (recentResult.error) return `Error listing memories: ${recentResult.error.message}`;

      const memories = recentResult.data || [];
      if (memories.length === 0) return 'No memories stored yet. Use memory_save to start building your knowledge base.';

      // Group by category
      const byCategory: Record<string, number> = {};
      for (const m of memories) {
        byCategory[m.category] = (byCategory[m.category] || 0) + 1;
      }

      const summary = Object.entries(byCategory)
        .map(([cat, count]) => `  ${cat}: ${count}`)
        .join('\n');

      const items = memories.map(m =>
        `  [${m.category}] ID:${m.id} (imp:${m.importance}) ${m.content.substring(0, 100)}${m.content.length > 100 ? '...' : ''}`
      ).join('\n');

      return `Memory Summary (${memories.length} total):\n${summary}\n\nRecent memories:\n${items}`;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error listing memories: ${message}`;
    }
  },
});

// ─── Memory Summary ──────────────────────────────────────────────────────────

export const memorySummary = tool({
  description: `Get a formatted summary of all your high-importance memories. This is the same content that gets injected into your system prompt. Use this to see what context you're starting with.`,
  inputSchema: zodSchema(z.object({})),
  execute: async () => {
    const agentId = getCurrentAgentId();
    if (!agentId) return 'Error: No agent ID available.';

    try {
      const supabase = getSupabase();
      if (!supabase) return 'Error: Database not configured.';

      const { data: memories, error } = await supabase
        .from('agent_memory')
        .select('category, content, importance')
        .eq('agent_id', agentId)
        .gte('importance', 6)
        .order('importance', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) return `Error getting memory summary: ${error.message}`;
      if (!memories || memories.length === 0) return 'No high-importance memories stored.';

      const byCategory: Record<string, string[]> = {};
      for (const m of memories) {
        if (!byCategory[m.category]) byCategory[m.category] = [];
        byCategory[m.category].push(m.content);
      }

      const sections = Object.entries(byCategory)
        .map(([cat, items]) => `### ${cat.charAt(0).toUpperCase() + cat.slice(1)}\n${items.map(c => `- ${c}`).join('\n')}`)
        .join('\n\n');

      return `Your Persistent Memory (${memories.length} high-importance items):\n\n${sections}`;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error getting memory summary: ${message}`;
    }
  },
});

