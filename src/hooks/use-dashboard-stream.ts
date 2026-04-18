// ---------------------------------------------------------------------------
// useDashboardStream — Real-time dashboard data hook
//
// Strategy:
// 1. Try SSE first (EventSource to /api/events/stream)
// 2. If SSE fails or disconnects, fall back to polling /api/dashboard every 5s
// 3. On reconnect, do a full snapshot fetch
// Phase 3: Also tracks tasks and delegations from SSE stream
// ---------------------------------------------------------------------------

"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentStatusView {
  id: string;
  name: string;
  emoji: string;
  color: string;
  status: string;
  currentTask: string | null;
  lastActivity: string | null;
  tasksCompleted: number;
  messagesProcessed: number;
}

export interface ActivityEventView {
  id: number;
  agent_id: string;
  agent_name: string | null;
  action: string;
  detail: string;
  tool_name: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface DashboardMetricsView {
  messagesToday: number;
  toolCallsToday: number;
  tasksDone: number;
  activeDelegations: number;
}

export interface TodoView {
  id: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  due_date: string | null;
  assigned_agent: string | null;
  created_at: string;
}

// Phase 3: Task and Delegation types for dashboard
export interface AgentTaskView {
  id: number;
  agent_id: string;
  task: string;
  context: string;
  trigger_type: string;
  trigger_source: string;
  priority: string;
  status: string;
  result: string;
  error: string;
  tool_calls: unknown[];
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface DelegationView {
  id: number;
  initiator_agent: string;
  assigned_agent: string;
  task: string;
  context: string;
  status: string;
  result: string;
  delegation_chain: string[];
  duration_ms: number | null;
  created_at: string;
  completed_at: string | null;
}

export interface DashboardState {
  agentStatuses: AgentStatusView[];
  activity: ActivityEventView[];
  metrics: DashboardMetricsView;
  todos: TodoView[];
  tasks: AgentTaskView[];
  delegations: DelegationView[];
  isConnected: boolean;
  reconnect: () => void;
}

// ---------------------------------------------------------------------------
// Fetch dashboard snapshot (REST fallback)
// ---------------------------------------------------------------------------

async function fetchDashboardSnapshot(): Promise<{
  agentStatuses: AgentStatusView[];
  activity: ActivityEventView[];
  metrics: DashboardMetricsView;
  todos: TodoView[];
  tasks: AgentTaskView[];
  delegations: DelegationView[];
} | null> {
  try {
    const res = await fetch("/api/dashboard");
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.success) return null;
    return json.data;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDashboardStream(): DashboardState {
  const [agentStatuses, setAgentStatuses] = useState<AgentStatusView[]>([]);
  const [activity, setActivity] = useState<ActivityEventView[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetricsView>({
    messagesToday: 0,
    toolCallsToday: 0,
    tasksDone: 0,
    activeDelegations: 0,
  });
  const [todos, setTodos] = useState<TodoView[]>([]);
  const [tasks, setTasks] = useState<AgentTaskView[]>([]);
  const [delegations, setDelegations] = useState<DelegationView[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // Start polling fallback
  const startPolling = useCallback(() => {
    cleanup();
    // Fetch immediately
    fetchDashboardSnapshot().then((data) => {
      if (!mountedRef.current || !data) return;
      if (data.agentStatuses) setAgentStatuses(data.agentStatuses);
      if (data.activity) setActivity(data.activity.reverse()); // newest last for display
      if (data.metrics) setMetrics(data.metrics);
      if (data.todos) setTodos(data.todos);
      if (data.tasks) setTasks(data.tasks);
      if (data.delegations) setDelegations(data.delegations);
    });

    // Then poll every 5s
    pollIntervalRef.current = setInterval(async () => {
      const data = await fetchDashboardSnapshot();
      if (!mountedRef.current || !data) return;
      if (data.agentStatuses) setAgentStatuses(data.agentStatuses);
      if (data.activity) setActivity(data.activity.reverse());
      if (data.metrics) setMetrics(data.metrics);
      if (data.todos) setTodos(data.todos);
      if (data.tasks) setTasks(data.tasks);
      if (data.delegations) setDelegations(data.delegations);
    }, 5000);
  }, [cleanup]);

  // Start SSE connection
  const startSSE = useCallback(() => {
    cleanup();

    try {
      const es = new EventSource("/api/events/stream");
      eventSourceRef.current = es;

      es.addEventListener("snapshot", (event) => {
        try {
          const data = JSON.parse(event.data);
          if (!mountedRef.current) return;
          if (data.agentStatuses) setAgentStatuses(data.agentStatuses);
          if (data.recentActivity) setActivity(data.recentActivity.reverse());
          if (data.metrics) setMetrics(data.metrics);
          if (data.todos) setTodos(data.todos);
          if (data.tasks) setTasks(data.tasks);
          if (data.delegations) setDelegations(data.delegations);
          setIsConnected(true);
        } catch {
          /* ignore parse errors */
        }
      });

      es.addEventListener("activity", (event) => {
        try {
          const newEvents: ActivityEventView[] = JSON.parse(event.data);
          if (!mountedRef.current) return;
          setActivity((prev) => [...prev, ...newEvents]);
        } catch {
          /* ignore parse errors */
        }
      });

      es.addEventListener("status", (event) => {
        try {
          const statuses: AgentStatusView[] = JSON.parse(event.data);
          if (!mountedRef.current) return;
          setAgentStatuses(statuses);
        } catch {
          /* ignore parse errors */
        }
      });

      es.addEventListener("metrics", (event) => {
        try {
          const m: DashboardMetricsView = JSON.parse(event.data);
          if (!mountedRef.current) return;
          setMetrics(m);
        } catch {
          /* ignore parse errors */
        }
      });

      // Phase 3: Listen for task events
      es.addEventListener("task", (event) => {
        try {
          const newTasks: AgentTaskView[] = JSON.parse(event.data);
          if (!mountedRef.current) return;
          setTasks((prev) => [...newTasks.reverse(), ...prev]);
        } catch {
          /* ignore parse errors */
        }
      });

      // Phase 3: Listen for delegation events
      es.addEventListener("delegation", (event) => {
        try {
          const newDelegations: DelegationView[] = JSON.parse(event.data);
          if (!mountedRef.current) return;
          setDelegations((prev) => [...newDelegations.reverse(), ...prev]);
        } catch {
          /* ignore parse errors */
        }
      });

      es.onopen = () => {
        if (mountedRef.current) setIsConnected(true);
      };

      es.onerror = () => {
        if (mountedRef.current) {
          setIsConnected(false);
          // Fall back to polling after SSE error
          startPolling();
        }
      };
    } catch {
      // SSE not supported or URL error — fall back to polling
      startPolling();
    }
  }, [cleanup, startPolling]);

  // Reconnect function (public API)
  const reconnect = useCallback(() => {
    startSSE();
  }, [startSSE]);

  // Initial mount
  useEffect(() => {
    mountedRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- SSE setup requires state in effect
    startSSE();

    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [startSSE, cleanup]);

  return {
    agentStatuses,
    activity,
    metrics,
    todos,
    tasks,
    delegations,
    isConnected,
    reconnect,
  };
}
