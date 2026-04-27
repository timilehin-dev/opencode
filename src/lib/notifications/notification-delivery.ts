// ---------------------------------------------------------------------------
// Klawhub — Notification Delivery Store
// ---------------------------------------------------------------------------
// Manages notification delivery channels: desktop, webhook, email.
// ---------------------------------------------------------------------------

import { createHmac } from "crypto";

export interface WebhookConfig {
  url: string;
  enabled: boolean;
  events: string[]; // which notification types to send
  secret?: string; // optional HMAC secret
}

export interface NotificationDeliveryConfig {
  webhooks: WebhookConfig[];
  desktopEnabled: boolean;
  soundEnabled: boolean;
  quietHoursStart?: string; // e.g. "22:00"
  quietHoursEnd?: string; // e.g. "08:00"
  quietHoursEnabled: boolean;
}

const STORAGE_KEY = "klaw-notification-delivery";

export const DEFAULT_DELIVERY: NotificationDeliveryConfig = {
  webhooks: [],
  desktopEnabled: true,
  soundEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  quietHoursEnabled: false,
};

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export function loadDeliveryConfig(): NotificationDeliveryConfig {
  if (typeof window === "undefined") return DEFAULT_DELIVERY;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DELIVERY;
    return { ...DEFAULT_DELIVERY, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_DELIVERY;
  }
}

export function saveDeliveryConfig(config: NotificationDeliveryConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Storage full
  }
}

export function updateDeliveryConfig(patch: Partial<NotificationDeliveryConfig>): NotificationDeliveryConfig {
  const current = loadDeliveryConfig();
  const updated = { ...current, ...patch };
  saveDeliveryConfig(updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Webhook helpers
// ---------------------------------------------------------------------------

export function addWebhook(webhook: Omit<WebhookConfig, "id">): NotificationDeliveryConfig {
  const config = loadDeliveryConfig();
  config.webhooks.push({ ...webhook });
  saveDeliveryConfig(config);
  return config;
}

export function removeWebhook(index: number): NotificationDeliveryConfig {
  const config = loadDeliveryConfig();
  config.webhooks.splice(index, 1);
  saveDeliveryConfig(config);
  return config;
}

export function updateWebhook(index: number, patch: Partial<WebhookConfig>): NotificationDeliveryConfig {
  const config = loadDeliveryConfig();
  if (config.webhooks[index]) {
    config.webhooks[index] = { ...config.webhooks[index], ...patch };
    saveDeliveryConfig(config);
  }
  return config;
}

// ---------------------------------------------------------------------------
// Delivery logic — determine if a notification should be delivered
// ---------------------------------------------------------------------------

export function shouldDeliver(type: string, priority: string): { desktop: boolean; webhook: boolean } {
  const config = loadDeliveryConfig();

  // Check quiet hours
  if (config.quietHoursEnabled && priority !== "urgent") {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const start = parseTime(config.quietHoursStart || "22:00");
    const end = parseTime(config.quietHoursEnd || "08:00");

    if (start > end) {
      // Overnight: 22:00 - 08:00
      if (currentMinutes >= start || currentMinutes < end) {
        return { desktop: false, webhook: false };
      }
    } else {
      // Same day: e.g. 12:00 - 14:00
      if (currentMinutes >= start && currentMinutes < end) {
        return { desktop: false, webhook: false };
      }
    }
  }

  // Desktop
  const desktop = config.desktopEnabled;

  // Webhook — check if any webhook is enabled for this type
  const webhook = config.webhooks.some(
    (w) => w.enabled && w.url && (w.events.length === 0 || w.events.includes(type))
  );

  return { desktop, webhook };
}

function parseTime(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// ---------------------------------------------------------------------------
// Send webhook (fire-and-forget)
// ---------------------------------------------------------------------------

export async function deliverWebhook(
  webhook: WebhookConfig,
  payload: {
    type: string;
    priority: string;
    title: string;
    body: string;
    timestamp: string;
    sourceId: string;
  }
): Promise<boolean> {
  try {
    const body = JSON.stringify({
      ...payload,
      deliveredAt: new Date().toISOString(),
      source: "klawhub",
    });
    const res = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(webhook.secret ? { "X-X-Klawhub-Signature": `sha256=${createHmac("sha256", webhook.secret).update(body).digest("hex")}` } : {}),
      },
      body,
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
