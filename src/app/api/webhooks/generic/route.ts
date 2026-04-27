// ---------------------------------------------------------------------------
// /api/webhooks/generic — Generic Webhook Receiver
//
// Accepts arbitrary webhook payloads from any service and converts them
// into trigger_events. Useful for services like Slack, Discord, Stripe,
// custom monitoring, RSS feeds, etc.
//
// Payload format:
//   {
//     "source": "slack" | "discord" | "stripe" | "custom" | etc.,
//     "event_type": "notification.received" | "payment.failed" | etc.,
//     "external_id": "unique-id-for-dedup",
//     "title": "Human-readable event summary",
//     "severity": "normal" | "low" | "medium" | "high" | "critical",
//     "payload": { ... any data ... }
//   }
//
// Or raw — the system will auto-classify:
//   {
//     "source": "custom-service",
//     "data": { ... }
//   }
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/core/db';

const GENERIC_WEBHOOK_SECRET = process.env.GENERIC_WEBHOOK_SECRET || '';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Verify webhook secret if configured
    if (GENERIC_WEBHOOK_SECRET) {
      const auth = request.headers.get('authorization') || '';
      const xSecret = request.headers.get('x-webhook-secret') || '';
      if (auth !== `Bearer ${GENERIC_WEBHOOK_SECRET}` && xSecret !== GENERIC_WEBHOOK_SECRET) {
        return NextResponse.json({ error: 'Invalid or missing secret' }, { status: 401 });
      }
    }

    // Build event from payload
    const event = {
      source: body.source || body.service || 'webhook',
      event_type: body.event_type || body.type || body.action || 'webhook_event',
      external_id: body.external_id || body.id || `webhook:${Date.now()}`,
      title: body.title || body.summary || body.subject || `Webhook event from ${body.source || 'unknown'}`,
      severity: body.severity || 'normal',
      payload: body.payload || body.data || body,
      status: 'pending',
    };

    // Validate severity
    const validSeverities = ['critical', 'high', 'medium', 'low', 'normal'];
    if (!validSeverities.includes(event.severity)) {
      event.severity = 'normal';
    }

    // Dedup
    const existing = await query(
      'SELECT id FROM trigger_events WHERE external_id = $1 LIMIT 1',
      [event.external_id]
    );

    if (existing.rows.length > 0) {
      return NextResponse.json({ ok: true, deduplicated: true, event: event.event_type });
    }

    await query(
      'INSERT INTO trigger_events (source, event_type, external_id, title, payload, severity, status) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)',
      [event.source, event.event_type, event.external_id, event.title, event.payload, event.severity, event.status]
    );

    console.log(`[webhook:generic] Received ${event.event_type} from ${event.source}: ${event.title}`);

    return NextResponse.json({ ok: true, event: event.event_type, title: event.title });
  } catch (err) {
    console.error('[webhook:generic] Error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    name: 'KlawHub Generic Webhook Receiver',
    description: 'Accepts webhook payloads from any service and creates trigger_events',
    payload_format: {
      source: 'string — source service name (e.g., slack, stripe, custom)',
      event_type: 'string — event type identifier',
      external_id: 'string — unique ID for deduplication',
      title: 'string — human-readable summary',
      severity: 'string — critical|high|medium|low|normal',
      payload: 'object — arbitrary event data',
    },
    configured: !!GENERIC_WEBHOOK_SECRET,
  });
}
