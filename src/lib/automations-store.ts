// ---------------------------------------------------------------------------
// Client-Side Automations Store — localStorage-backed automation CRUD
//
// Designed for Vercel serverless where SQLite is unavailable.
// Data persists in the browser across sessions.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AutomationItem {
  id: number;
  name: string;
  description: string;
  triggerType: "schedule" | "event" | "manual";
  triggerConfig: Record<string, unknown>;
  actionType: "agent_task" | "notification";
  actionConfig: Record<string, unknown>;
  agentId: string | null;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  runCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationLog {
  id: number;
  automationId: number;
  status: "running" | "success" | "error";
  result: Record<string, unknown>;
  durationMs: number | null;
  errorMessage: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const AUTOMATIONS_KEY = "claw-automations";
const LOGS_KEY = "claw-automation-logs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadAutomations(): AutomationItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(AUTOMATIONS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveAutomations(items: AutomationItem[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTOMATIONS_KEY, JSON.stringify(items));
}

function loadLogs(): AutomationLog[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOGS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveLogs(logs: AutomationLog[]): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = logs.length > 200 ? logs.slice(-200) : logs;
    localStorage.setItem(LOGS_KEY, JSON.stringify(trimmed));
  } catch {
    console.warn("[Automations] Failed to save logs");
  }
}

function getNextId(items: { id: number }[]): number {
  if (items.length === 0) return 1;
  return Math.max(...items.map((i) => i.id)) + 1;
}

// ---------------------------------------------------------------------------
// Public API — Automations CRUD
// ---------------------------------------------------------------------------

export function getAllAutomations(): AutomationItem[] {
  return loadAutomations();
}

export function getAutomation(id: number): AutomationItem | null {
  const items = loadAutomations();
  return items.find((a) => a.id === id) || null;
}

export function createAutomation(data: {
  name: string;
  description?: string;
  triggerType: string;
  triggerConfig?: Record<string, unknown>;
  actionType: string;
  actionConfig?: Record<string, unknown>;
  agentId?: string;
  enabled?: boolean;
}): AutomationItem {
  const items = loadAutomations();
  const now = new Date().toISOString();
  const newAutomation: AutomationItem = {
    id: getNextId(items),
    name: data.name,
    description: data.description || "",
    triggerType: data.triggerType as "schedule" | "event" | "manual",
    triggerConfig: data.triggerConfig || {},
    actionType: data.actionType as "agent_task" | "notification",
    actionConfig: data.actionConfig || {},
    agentId: data.agentId || null, // eslint-disable-line -- convert undefined to null
    enabled: data.enabled !== false,
    lastRunAt: null,
    lastStatus: null,
    runCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  items.push(newAutomation);
  saveAutomations(items);
  return newAutomation;
}

export function updateAutomation(
  id: number,
  data: Partial<{
    name: string;
    description: string;
    triggerType: string;
    triggerConfig: Record<string, unknown>;
    actionType: string;
    actionConfig: Record<string, unknown>;
    agentId: string;
    enabled: boolean;
  }>,
): AutomationItem | null {
  const items = loadAutomations();
  const index = items.findIndex((a) => a.id === id);
  if (index === -1) return null;

  const item = items[index];
  if (data.name !== undefined) item.name = data.name;
  if (data.description !== undefined) item.description = data.description;
  if (data.triggerType !== undefined) item.triggerType = data.triggerType as "schedule" | "event" | "manual";
  if (data.triggerConfig !== undefined) item.triggerConfig = data.triggerConfig;
  if (data.actionType !== undefined) item.actionType = data.actionType as "agent_task" | "notification";
  if (data.actionConfig !== undefined) item.actionConfig = data.actionConfig;
  if (data.agentId !== undefined) item.agentId = data.agentId;
  if (data.enabled !== undefined) item.enabled = data.enabled;
  item.updatedAt = new Date().toISOString();

  items[index] = item;
  saveAutomations(items);
  return item;
}

export function deleteAutomation(id: number): boolean {
  const items = loadAutomations();
  const filtered = items.filter((a) => a.id !== id);
  if (filtered.length === items.length) return false;
  saveAutomations(filtered);
  return true;
}

// ---------------------------------------------------------------------------
// Public API — Execution Logs
// ---------------------------------------------------------------------------

export function logAutomationRun(data: {
  automationId: number;
  status: "running" | "success" | "error";
  result?: Record<string, unknown>;
  durationMs?: number;
  errorMessage?: string;
}): AutomationLog {
  const logs = loadLogs();
  const newLog: AutomationLog = {
    id: getNextId(logs),
    automationId: data.automationId,
    status: data.status,
    result: data.result || {},
    durationMs: data.durationMs || null,
    errorMessage: data.errorMessage || null,
    createdAt: new Date().toISOString(),
  };
  logs.push(newLog);
  saveLogs(logs);

  // Also update the automation's run metadata
  if (data.status === "success" || data.status === "error") {
    const items = loadAutomations();
    const index = items.findIndex((a) => a.id === data.automationId);
    if (index !== -1) {
      items[index].lastRunAt = new Date().toISOString();
      items[index].lastStatus = data.status;
      items[index].runCount += 1;
      items[index].updatedAt = new Date().toISOString();
      saveAutomations(items);
    }
  }

  return newLog;
}

export function getAutomationLogs(automationId?: number, limit: number = 20): AutomationLog[] {
  const logs = loadLogs();
  if (automationId) {
    return logs
      .filter((l) => l.automationId === automationId)
      .reverse()
      .slice(0, limit);
  }
  return logs.reverse().slice(0, limit);
}
