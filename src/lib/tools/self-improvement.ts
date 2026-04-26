// ---------------------------------------------------------------------------
// Phase 6: Self-Improvement Tools — Agent-callable introspection & adaptation
//
// The Self-Improvement Loop is the pinnacle phase: agents can reflect on their
// own performance, learn from mistakes, benchmark against baselines, share
// knowledge across the team, and adapt their strategies over time.
//
// Tools:
//   - reflect_on_performance:  Review recent tasks/conversations for patterns
//   - benchmark_self:          Compare current metrics against baseline
//   - learn_from_mistakes:     Analyze failures and create corrective insights
//   - share_knowledge:         Cross-pollinate learnings with other agents
//   - improve_strategy:        Record strategy updates as persistent memory
// ---------------------------------------------------------------------------

import { tool, zodSchema, z, getCurrentAgentId } from './shared';
import { query } from '@/lib/db';

// ─── Reflect on Performance ──────────────────────────────────────────────────

export const reflectOnPerformance = tool({
  description: `Reflect on your recent performance by analyzing task history, conversations, and learning insights. Generates a self-assessment with strengths, weaknesses, and improvement areas. Use this at the end of complex tasks or periodically to understand your performance trajectory.

Returns a structured assessment including:
- Task completion rate over recent history
- Common tool usage patterns
- Learning insight confidence trends
- Identified strengths and weaknesses
- Specific actionable recommendations`,
  inputSchema: zodSchema(z.object({
    focus_area: z.enum(['tasks', 'conversations', 'learning', 'tools', 'all']).optional()
      .describe('What to focus the reflection on (default: all)'),
    lookback_days: z.number().min(1).max(90).optional()
      .describe('How many days of history to analyze (default: 7)'),
  })),
  execute: async ({ focus_area, lookback_days }) => {
    const agentId = getCurrentAgentId();
    if (!agentId) return 'Error: No agent ID available.';

    const days = lookback_days || 7;
    const focus = focus_area || 'all';
    const parts: string[] = [];
    const sinceDate = new Date(Date.now() - days * 86400000).toISOString();

    try {
      // 1. Task Analysis
      if (focus === 'all' || focus === 'tasks') {
        const taskResult = await query(
          `SELECT status, COUNT(*) as count
           FROM agent_tasks
           WHERE agent_id = $1 AND created_at >= $2
           GROUP BY status`,
          [agentId, sinceDate]
        );

        if (taskResult.rows.length > 0) {
          const total = taskResult.rows.reduce((s: number, r: { count: string }) => s + parseInt(r.count, 10), 0);
          const completed = taskResult.rows.find((r: { status: string }) => r.status === 'completed');
          const failed = taskResult.rows.find((r: { status: string }) => r.status === 'failed');
          const pending = taskResult.rows.find((r: { status: string }) => r.status === 'pending');
          const completedCount = completed ? parseInt(completed.count, 10) : 0;
          const failedCount = failed ? parseInt(failed.count, 10) : 0;
          const completionRate = total > 0 ? Math.round((completedCount / total) * 100) : 0;

          parts.push(`## Task Performance (last ${days} days)
- Total tasks: ${total}
- Completed: ${completedCount} (${completionRate}%)
- Failed: ${failedCount}
- Pending/In-progress: ${pending ? pending.count : 0}
${completionRate >= 80 ? '- Assessment: STRONG task completion rate' : completionRate >= 50 ? '- Assessment: MODERATE — review failed tasks for patterns' : '- Assessment: NEEDS IMPROVEMENT — significant failure rate'}`);
        } else {
          parts.push(`## Task Performance\nNo tasks recorded in the last ${days} days.`);
        }

        // Recent failures
        const recentFailures = await query(
          `SELECT id, title, error, created_at
           FROM agent_tasks
           WHERE agent_id = $1 AND status = 'failed' AND created_at >= $2
           ORDER BY created_at DESC LIMIT 5`,
          [agentId, sinceDate]
        );
        if (recentFailures.rows.length > 0) {
          parts.push(`\n### Recent Failed Tasks`);
          for (const f of recentFailures.rows) {
            parts.push(`- [${new Date(f.created_at as string).toLocaleDateString()}] ${f.title}${f.error ? `: ${String(f.error).substring(0, 100)}` : ''}`);
          }
        }
      }

      // 2. Conversation Analysis
      if (focus === 'all' || focus === 'conversations') {
        const convResult = await query(
          `SELECT COUNT(*) as total,
                  COUNT(*) FILTER (WHERE role = 'user') as user_msgs,
                  COUNT(*) FILTER (WHERE role = 'assistant') as assistant_msgs
           FROM conversations
           WHERE agent_id = $1 AND created_at >= $2`,
          [agentId, sinceDate]
        );
        if (convResult.rows.length > 0) {
          const r = convResult.rows[0];
          parts.push(`\n## Conversation Activity (last ${days} days)
- Total messages: ${r.total}
- User messages: ${r.user_msgs}
- Your responses: ${r.assistant_msgs}
- Avg messages/day: ${Math.round(parseInt(r.total as string, 10) / days)}`);
        }
      }

      // 3. Learning Insights Analysis
      if (focus === 'all' || focus === 'learning') {
        const insightsResult = await query(
          `SELECT insight_type, COUNT(*) as count, ROUND(AVG(confidence)::numeric, 2) as avg_confidence
           FROM learning_insights
           WHERE agent_id = $1 AND created_at >= $2
           GROUP BY insight_type
           ORDER BY count DESC`,
          [agentId, sinceDate]
        );
        if (insightsResult.rows.length > 0) {
          parts.push(`\n## Learning Insights (last ${days} days)`);
          for (const i of insightsResult.rows) {
            parts.push(`- ${i.insight_type}: ${i.count} insights (avg confidence: ${i.avg_confidence})`);
          }

          // Check for correction insights (these indicate mistakes)
          const corrections = insightsResult.rows.find((r: { insight_type: string }) => r.insight_type === 'correction');
          if (corrections && parseInt(corrections.count as string, 10) > 0) {
            parts.push(`- WARNING: ${corrections.count} corrections recorded — user had to fix your output`);
          }
        } else {
          parts.push(`\n## Learning Insights\nNo insights recorded in the last ${days} days.`);
        }

        // Low-confidence insights (potential problem areas)
        const lowConf = await query(
          `SELECT content, confidence FROM learning_insights
           WHERE agent_id = $1 AND confidence < 0.5 AND created_at >= $2
           ORDER BY confidence ASC LIMIT 3`,
          [agentId, sinceDate]
        );
        if (lowConf.rows.length > 0) {
          parts.push(`\n### Low-Confidence Insights (may need review)`);
          for (const lc of lowConf.rows) {
            parts.push(`- [${Math.round(parseFloat(lc.confidence as string) * 100)}%] ${lc.content}`);
          }
        }
      }

      // 4. Tool Usage Patterns
      if (focus === 'all' || focus === 'tools') {
        const toolResult = await query(
          `SELECT action, COUNT(*) as count
           FROM agent_activity
           WHERE agent_id = $1 AND created_at >= $2
             AND action LIKE '%tool%'
           GROUP BY action
           ORDER BY count DESC LIMIT 10`,
          [agentId, sinceDate]
        );
        if (toolResult.rows.length > 0) {
          parts.push(`\n## Top Tool Usage (last ${days} days)`);
          for (const t of toolResult.rows) {
            parts.push(`- ${t.action}: ${t.count} uses`);
          }
        }
      }

      // 5. Strengths & Recommendations
      parts.push(`\n## Recommendations`);
      parts.push(`- Use \`learn_from_mistakes\` to analyze any failed tasks in detail`);
      parts.push(`- Use \`benchmark_self\` to compare against your historical baseline`);
      parts.push(`- Use \`share_knowledge\` to propagate useful insights to teammates`);
      parts.push(`- Use \`improve_strategy\` to record strategy changes based on this reflection`);

      return `# Self-Reflection Report — ${agentId.toUpperCase()} Agent\nGenerated: ${new Date().toISOString()}\n\n${parts.join('\n')}`;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error during reflection: ${message}`;
    }
  },
});

// ─── Benchmark Self ──────────────────────────────────────────────────────────

export const benchmarkSelf = tool({
  description: `Benchmark your current performance against your historical baseline. Compares recent task completion rates, response quality metrics, and learning trajectory against your past performance. Identifies trends — improving, declining, or stable.

Use this to:
- Track improvement over time
- Detect performance degradation early
- Validate that strategy changes are working
- Generate performance reports`,
  inputSchema: zodSchema(z.object({
    compare_period_days: z.number().min(7).max(180).optional()
      .describe('Period for comparison (default: 30 days — compares last 7 days vs prior 23 days)'),
  })),
  execute: async ({ compare_period_days }) => {
    const agentId = getCurrentAgentId();
    if (!agentId) return 'Error: No agent ID available.';

    const totalDays = compare_period_days || 30;
    const recentDays = 7;
    const now = new Date();
    const recentSince = new Date(now.getTime() - recentDays * 86400000).toISOString();
    const baselineSince = new Date(now.getTime() - totalDays * 86400000).toISOString();
    const baselineEnd = new Date(now.getTime() - recentDays * 86400000).toISOString();

    try {
      const parts: string[] = [];

      // Task completion comparison
      const recentTasks = await query(
        `SELECT COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'completed') as completed,
                COUNT(*) FILTER (WHERE status = 'failed') as failed
         FROM agent_tasks WHERE agent_id = $1 AND created_at >= $2`,
        [agentId, recentSince]
      );

      const baselineTasks = await query(
        `SELECT COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'completed') as completed,
                COUNT(*) FILTER (WHERE status = 'failed') as failed
         FROM agent_tasks WHERE agent_id = $1 AND created_at >= $2 AND created_at < $3`,
        [agentId, baselineSince, baselineEnd]
      );

      const r = recentTasks.rows[0] || { total: '0', completed: '0', failed: '0' };
      const b = baselineTasks.rows[0] || { total: '0', completed: '0', failed: '0' };

      const rTotal = parseInt(r.total as string, 10);
      const rCompleted = parseInt(r.completed as string, 10);
      const rFailed = parseInt(r.failed as string, 10);
      const rRate = rTotal > 0 ? Math.round((rCompleted / rTotal) * 100) : 0;

      const bTotal = parseInt(b.total as string, 10);
      const bCompleted = parseInt(b.completed as string, 10);
      const bFailed = parseInt(b.failed as string, 10);
      const bRate = bTotal > 0 ? Math.round((bCompleted / bTotal) * 100) : 0;

      const rateDelta = rRate - bRate;
      const rateTrend = rateDelta > 5 ? 'IMPROVING' : rateDelta < -5 ? 'DECLINING' : 'STABLE';
      const rateArrow = rateDelta > 0 ? '+' : '';

      parts.push(`## Task Completion Benchmark
| Metric | Recent (7d) | Baseline (${totalDays - 7}d prior) | Delta |
|--------|------------|----------------------------------|-------|
| Total tasks | ${rTotal} | ${bTotal} | ${rTotal - bTotal >= 0 ? '+' : ''}${rTotal - bTotal} |
| Completed | ${rCompleted} (${rRate}%) | ${bCompleted} (${bRate}%) | ${rateArrow}${rateDelta}% |
| Failed | ${rFailed} | ${bFailed} | ${rFailed - bFailed >= 0 ? '+' : ''}${rFailed - bFailed} |

**Trend: ${rateTrend}**`);

      // Learning insights trajectory
      const recentInsights = await query(
        `SELECT AVG(confidence)::numeric as avg_conf, COUNT(*) as total
         FROM learning_insights WHERE agent_id = $1 AND created_at >= $2`,
        [agentId, recentSince]
      );
      const baselineInsights = await query(
        `SELECT AVG(confidence)::numeric as avg_conf, COUNT(*) as total
         FROM learning_insights WHERE agent_id = $1 AND created_at >= $2 AND created_at < $3`,
        [agentId, baselineSince, baselineEnd]
      );

      const ri = recentInsights.rows[0] || { avg_conf: '0', total: '0' };
      const bi = baselineInsights.rows[0] || { avg_conf: '0', total: '0' };

      const rConf = parseFloat(ri.avg_conf as string) || 0;
      const bConf = parseFloat(bi.avg_conf as string) || 0;
      const confDelta = Math.round((rConf - bConf) * 100);
      const confTrend = confDelta > 5 ? 'IMPROVING' : confDelta < -5 ? 'DECLINING' : 'STABLE';

      parts.push(`\n## Learning Trajectory
| Metric | Recent (7d) | Baseline (${totalDays - 7}d prior) | Delta |
|--------|------------|----------------------------------|-------|
| Total insights | ${ri.total} | ${bi.total} | ${parseInt(ri.total as string, 10) - parseInt(bi.total as string, 10) >= 0 ? '+' : ''}${parseInt(ri.total as string, 10) - parseInt(bi.total as string, 10)} |
| Avg confidence | ${(rConf * 100).toFixed(0)}% | ${(bConf * 100).toFixed(0)}% | ${confDelta > 0 ? '+' : ''}${confDelta}% |

**Trend: ${confTrend}**`);

      // Activity level
      const recentActivity = await query(
        `SELECT COUNT(*) as total FROM agent_activity WHERE agent_id = $1 AND created_at >= $2`,
        [agentId, recentSince]
      );
      const baselineActivity = await query(
        `SELECT COUNT(*) as total FROM agent_activity WHERE agent_id = $1 AND created_at >= $2 AND created_at < $3`,
        [agentId, baselineSince, baselineEnd]
      );

      const ra = recentActivity.rows[0]?.total || '0';
      const ba = baselineActivity.rows[0]?.total || '0';
      const rDaily = Math.round(parseInt(ra as string, 10) / recentDays);
      const bDaily = bTotal > 0 ? Math.round(parseInt(ba as string, 10) / (totalDays - recentDays)) : 0;

      parts.push(`\n## Activity Level
- Recent daily activity: ${rDaily} events/day
- Baseline daily activity: ${bDaily} events/day
- Activity change: ${rDaily >= bDaily ? '+' : ''}${rDaily - bDaily} events/day`);

      // Overall assessment
      const trends = [rateTrend, confTrend];
      const improving = trends.filter(t => t === 'IMPROVING').length;
      const declining = trends.filter(t => t === 'DECLINING').length;

      let overallAssessment: string;
      if (declining >= 2) {
        overallAssessment = 'DECLINING — Consider running learn_from_mistakes and reviewing your strategy';
      } else if (improving >= 2) {
        overallAssessment = 'IMPROVING — Keep up the good work. Consider sharing insights with teammates.';
      } else {
        overallAssessment = 'STABLE — Performance is consistent. Look for opportunities to optimize.';
      }

      parts.push(`\n## Overall Assessment: ${overallAssessment}`);

      // Store benchmark result as metric
      await query(
        `INSERT INTO agent_metrics (agent_id, metric_type, metric_value, metadata, created_at)
         VALUES ($1, 'benchmark', $2, $3, NOW())
         ON CONFLICT DO NOTHING`,
        [
          agentId,
          JSON.stringify({ completionRate: rRate, avgConfidence: rConf, activityDaily: rDaily, trend: overallAssessment }),
          JSON.stringify({ recentPeriod: `${recentDays}d`, baselinePeriod: `${totalDays - recentDays}d` }),
        ]
      ).catch(() => { /* non-critical */ });

      return `# Performance Benchmark — ${agentId.toUpperCase()} Agent\nGenerated: ${now.toISOString()}\n\n${parts.join('\n')}`;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error during benchmark: ${message}`;
    }
  },
});

// ─── Learn from Mistakes ─────────────────────────────────────────────────────

export const learnFromMistakes = tool({
  description: `Analyze your recent failures, user corrections, and low-confidence insights to identify patterns and create corrective learning strategies. This is the core self-improvement mechanism.

Automatically:
- Scans failed tasks and error patterns
- Reviews user correction insights
- Identifies recurring failure themes
- Creates high-priority learning insights with corrective strategies
- Saves actionable improvements to your persistent memory`,
  inputSchema: zodSchema(z.object({
    lookback_days: z.number().min(1).max(90).optional()
      .describe('How many days of history to scan (default: 14)'),
    auto_correct: z.boolean().optional()
      .describe('Automatically save corrective insights as memories (default: true)'),
  })),
  execute: async ({ lookback_days, auto_correct }) => {
    const agentId = getCurrentAgentId();
    if (!agentId) return 'Error: No agent ID available.';

    const days = lookback_days || 14;
    const shouldSave = auto_correct !== false;
    const sinceDate = new Date(Date.now() - days * 86400000).toISOString();
    const parts: string[] = [];
    const corrections: string[] = [];

    try {
      // 1. Failed tasks analysis
      const failedTasks = await query(
        `SELECT id, title, error, tool_name, input_data, created_at
         FROM agent_tasks
         WHERE agent_id = $1 AND status = 'failed' AND created_at >= $2
         ORDER BY created_at DESC LIMIT 20`,
        [agentId, sinceDate]
      );

      if (failedTasks.rows.length > 0) {
        parts.push(`## Failed Tasks Analysis (${failedTasks.rows.length} failures in ${days} days)`);

        // Group by error pattern
        const errorPatterns = new Map<string, number>();
        const toolFailures = new Map<string, number>();

        for (const task of failedTasks.rows) {
          const error = String(task.error || 'unknown error');
          // Normalize error messages
          const normalizedError = error
            .replace(/\d{4}-\d{2}-\d{2}[T ].*/g, '...') // strip dates
            .replace(/token_[a-f0-9]+/g, 'TOKEN') // strip tokens
            .substring(0, 80);

          errorPatterns.set(normalizedError, (errorPatterns.get(normalizedError) || 0) + 1);

          if (task.tool_name) {
            toolFailures.set(String(task.tool_name), (toolFailures.get(String(task.tool_name)) || 0) + 1);
          }
        }

        // Recurring error patterns
        const recurringErrors = Array.from(errorPatterns.entries())
          .filter(([, count]) => count >= 2)
          .sort((a, b) => b[1] - a[1]);

        if (recurringErrors.length > 0) {
          parts.push(`\n### Recurring Error Patterns (appeared 2+ times)`);
          for (const [error, count] of recurringErrors) {
            parts.push(`- [${count}x] ${error}`);
            corrections.push(`Avoid error pattern: "${error.substring(0, 60)}" — occurred ${count} times`);
          }
        }

        // Tool failure hotspots
        if (toolFailures.size > 0) {
          parts.push(`\n### Tools with Most Failures`);
          const sorted = Array.from(toolFailures.entries()).sort((a, b) => b[1] - a[1]);
          for (const [tool, count] of sorted) {
            parts.push(`- ${tool}: ${count} failures`);
          }
        }
      } else {
        parts.push(`## Failed Tasks\nNo failed tasks in the last ${days} days. Great work!`);
      }

      // 2. User correction insights
      const corrections_ = await query(
        `SELECT content, confidence, created_at
         FROM learning_insights
         WHERE agent_id = $1 AND insight_type = 'correction' AND created_at >= $2
         ORDER BY created_at DESC LIMIT 10`,
        [agentId, sinceDate]
      );

      if (corrections_.rows.length > 0) {
        parts.push(`\n## User Corrections (${corrections_.rows.length} in ${days} days)`);
        for (const c of corrections_.rows) {
          parts.push(`- [${new Date(c.created_at as string).toLocaleDateString()}] ${c.content}`);
          corrections.push(`User correction: ${c.content}`);
        }
      }

      // 3. Low-confidence insights (potential problem areas)
      const lowConf = await query(
        `SELECT insight_type, content, confidence
         FROM learning_insights
         WHERE agent_id = $1 AND confidence < 0.5 AND created_at >= $2
         ORDER BY confidence ASC LIMIT 5`,
        [agentId, sinceDate]
      );

      if (lowConf.rows.length > 0) {
        parts.push(`\n## Low-Confidence Insights`);
        for (const lc of lowConf.rows) {
          parts.push(`- [${lc.insight_type}, ${Math.round(parseFloat(lc.confidence as string) * 100)}%] ${lc.content}`);
        }
      }

      // 4. Generate corrective insights
      if (shouldSave && corrections.length > 0) {
        const correctiveInsights: string[] = [];
        for (const correction of corrections.slice(0, 3)) {
          correctiveInsights.push(`CORRECTIVE: ${correction} (auto-detected from mistake analysis)`);
        }

        // Save as learning insights
        for (const insight of correctiveInsights) {
          await query(
            `INSERT INTO learning_insights (agent_id, insight_type, content, source, confidence)
             VALUES ($1, 'pattern', $2, 'pattern_detection', 0.7)
             ON CONFLICT DO NOTHING`,
            [agentId, insight]
          ).catch(() => {});
        }

        parts.push(`\n## Auto-Corrective Actions Taken`);
        parts.push(`- Saved ${correctiveInsights.length} corrective insights to learning database`);
        parts.push(`- These will be applied in future conversations automatically`);
      }

      // 5. Actionable recommendations
      parts.push(`\n## Next Steps`);
      if (corrections.length > 0) {
        parts.push(`- Use \`improve_strategy\` to update your approach based on these findings`);
        parts.push(`- Use \`share_knowledge\` to warn teammates about recurring error patterns`);
      } else {
        parts.push(`- Performance looks clean! Use \`benchmark_self\` to confirm trends.`);
        parts.push(`- Consider running \`reflect_on_performance\` for a broader view.`);
      }

      return `# Mistake Analysis — ${agentId.toUpperCase()} Agent\nGenerated: ${new Date().toISOString()}\n\n${parts.join('\n')}`;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error during mistake analysis: ${message}`;
    }
  },
});

// ─── Share Knowledge ─────────────────────────────────────────────────────────

export const shareKnowledge = tool({
  description: `Share a learning insight, strategy, or finding with one or more other agents. This cross-pollinates improvements across the team — if you learned something useful, your teammates benefit too.

Use this when:
- You discovered a better way to use a tool
- You found a pattern that other agents should avoid
- You want to share a useful workflow or strategy
- You want to warn teammates about a recurring issue`,
  inputSchema: zodSchema(z.object({
    target_agents: z.array(z.string()).min(1)
      .describe('Which agents to share with. Valid: "general", "mail", "code", "data", "creative", "research", "ops". Use ["all"] for all agents.'),
    insight: z.string().min(10)
      .describe('The insight/knowledge to share. Be specific and actionable.'),
    category: z.enum(['tool_tip', 'workflow', 'warning', 'strategy', 'correction']).optional()
      .describe('Category of the shared knowledge (default: strategy)'),
    priority: z.enum(['low', 'medium', 'high']).optional()
      .describe('Priority level (default: medium)'),
  })),
  execute: async ({ target_agents, insight, category, priority }) => {
    const agentId = getCurrentAgentId();
    if (!agentId) return 'Error: No agent ID available.';

    const validAgents = ['general', 'mail', 'code', 'data', 'creative', 'research', 'ops'];
    const allAgents = target_agents.includes('all') ? validAgents.filter(a => a !== agentId) : target_agents.filter(a => validAgents.includes(a) && a !== agentId);

    if (allAgents.length === 0) {
      return 'No valid target agents specified. Cannot share with yourself. Use ["all"] for all other agents.';
    }

    const cat = category || 'strategy';
    const prio = priority || 'medium';

    try {
      let sharedCount = 0;
      const results: string[] = [];

      for (const target of allAgents) {
        // Save as learning insight for the target agent
        await query(
          `INSERT INTO learning_insights (agent_id, insight_type, content, source, confidence)
           VALUES ($1, 'pattern', $2, 'agent_shared', $3)
           ON CONFLICT DO NOTHING`,
          [target, `[Shared by ${agentId}] [${cat}] ${insight}`, prio === 'high' ? 0.8 : prio === 'medium' ? 0.65 : 0.5]
        );

        // Also send as A2A message for immediate visibility
        await query(
          `INSERT INTO a2a_messages (sender_id, recipient_id, channel_id, content, message_type, priority)
           VALUES ($1, $2, 'knowledge-sharing', $3, 'info', $4)`,
          [agentId, target, `[Knowledge Share - ${cat.toUpperCase()}] ${insight}`, prio]
        );

        sharedCount++;
        results.push(`- ${target}: insight delivered`);
      }

      // Log the sharing activity
      await query(
        `INSERT INTO agent_activity (agent_id, agent_name, action, detail, metadata, created_at)
         VALUES ($1, $2, 'knowledge_shared', $3, $4, NOW())`,
        [agentId, agentId, `Shared ${cat} insight with ${sharedCount} agents`, JSON.stringify({ targets: allAgents, category: cat, priority: prio })]
      ).catch(() => {});

      return `Knowledge shared successfully!\n\nShared "${cat}" insight with ${sharedCount} agents:\n${results.join('\n')}\n\nThe insight: "${insight}"\n\nRecipients will see this in their learning context and A2A inbox.`;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error sharing knowledge: ${message}`;
    }
  },
});

// ─── Improve Strategy ────────────────────────────────────────────────────────

export const improveStrategy = tool({
  description: `Record a strategy update or behavioral change based on your reflections and learnings. This persists as a high-importance memory so you'll apply it in all future conversations.

Use this when:
- You've identified a better approach to a recurring task
- You want to adopt a new best practice
- You need to change your behavior based on user feedback
- You want to formalize a lesson learned into a standing instruction`,
  inputSchema: zodSchema(z.object({
    strategy: z.string().min(10)
      .describe('The strategy or behavioral change to adopt. Write it as a clear instruction to your future self.'),
    reason: z.string().min(5)
      .describe('Why you are making this change. What triggered it?'),
    applies_to: z.enum(['all_tasks', 'specific_tool', 'specific_domain', 'user_interaction', 'team_collaboration']).optional()
      .describe('When this strategy applies (default: all_tasks)'),
    previous_approach: z.string().optional()
      .describe('What you used to do before (for tracking evolution)'),
  })),
  execute: async ({ strategy, reason, applies_to, previous_approach }) => {
    const agentId = getCurrentAgentId();
    if (!agentId) return 'Error: No agent ID available.';

    const scope = applies_to || 'all_tasks';
    const now = new Date().toISOString();

    try {
      // Save as high-importance instruction memory
      const memoryContent = `STRATEGY (${scope}): ${strategy} | Reason: ${reason}`;

      await query(
        `INSERT INTO agent_memory (agent_id, category, content, importance, metadata, created_at, updated_at)
         VALUES ($1, 'instruction', $2, 9, $3, NOW(), NOW())`,
        [agentId, memoryContent, JSON.stringify({ type: 'strategy_update', scope, reason, previous_approach, timestamp: now })]
      );

      // Also record as a high-confidence learning insight
      await query(
        `INSERT INTO learning_insights (agent_id, insight_type, content, source, confidence)
         VALUES ($1, 'pattern', $2, 'self_improvement', 0.85)
         ON CONFLICT DO NOTHING`,
        [agentId, `Strategy update (${scope}): ${strategy}`]
      );

      // Log activity
      await query(
        `INSERT INTO agent_activity (agent_id, agent_name, action, detail, metadata, created_at)
         VALUES ($1, $2, 'strategy_updated', $3, $4, NOW())`,
        [agentId, agentId, `Updated strategy (${scope}): ${strategy.substring(0, 80)}`, JSON.stringify({ scope, reason, previous_approach })]
      ).catch(() => {});

      // Store metric
      await query(
        `INSERT INTO agent_metrics (agent_id, metric_type, metric_value, metadata, created_at)
         VALUES ($1, 'strategy_update', $2, $3, NOW())
         ON CONFLICT DO NOTHING`,
        [agentId, strategy, JSON.stringify({ scope, reason })]
      ).catch(() => {});

      let response = `Strategy updated and saved!\n\n`;
      response += `**New Strategy (${scope}):** ${strategy}\n`;
      response += `**Reason:** ${reason}\n`;
      if (previous_approach) {
        response += `**Previous Approach:** ${previous_approach}\n`;
      }
      response += `\nThis has been saved as a high-importance instruction (importance: 9) and will be loaded into your context in future conversations. You should apply this strategy starting now.\n\n`;
      response += `Consider using \`share_knowledge\` if this strategy would benefit other agents too.`;

      return response;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error updating strategy: ${message}`;
    }
  },
});
