// ---------------------------------------------------------------------------
// /api/webhooks/vercel — Vercel Deployment Webhook Receiver
//
// Receives deployment events from Vercel webhooks.
// Converts them into trigger_events for the proactive scanning system.
//
// Supported events:
//   - deployment.created
//   - deployment.succeeded
//   - deployment.error
//   - deployment.canceled
//   - deployment.ready
//
// Setup: Add a webhook in your Vercel project settings pointing to this URL.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/core/db';

function getEventInfo(body: any) {
  const eventType = body.type || body.event || 'unknown';
  const name = body.name || body.project || 'unknown';
  const target = body.target || 'production';
  const state = body.state || 'unknown';
  const url = body.url || '';
  const deploymentId = body.id || body.deploymentId || '';
  const creator = body.creator?.username || body.creator?.email || 'unknown';

  let event_type = `deploy_${state}`;
  let severity = 'normal';

  switch (state) {
    case 'READY':
      event_type = 'deploy_succeeded';
      severity = 'low';
      break;
    case 'ERROR':
      event_type = 'deploy_failed';
      severity = 'high';
      break;
    case 'BUILD_ERROR':
      event_type = 'build_failed';
      severity = 'critical';
      break;
    case 'CANCELED':
      event_type = 'deploy_cancelled';
      severity = 'low';
      break;
    case 'QUEUED':
    case 'BUILDING':
      event_type = 'deploy_started';
      severity = 'low';
      break;
  }

  return {
    event_type,
    external_id: `vercel:deploy:${deploymentId}`,
    title: `Vercel ${event_type.replace(/_/g, ' ')}: ${name} (${target})`,
    severity,
    payload: {
      deployment_id: deploymentId,
      project: name,
      state,
      target,
      url,
      creator,
      regions: body.regions || [],
      git_source: body.gitSource || null,
      inspector_url: body.inspectorUrl || null,
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const eventInfo = getEventInfo(body);

    // Dedup
    const existing = await query(
      'SELECT id FROM trigger_events WHERE external_id = $1 LIMIT 1',
      [eventInfo.external_id]
    );

    if (existing.rows.length > 0) {
      return NextResponse.json({ ok: true, deduplicated: true, event: eventInfo.event_type });
    }

    await query(
      'INSERT INTO trigger_events (source, event_type, external_id, title, payload, severity, status) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)',
      ['vercel', eventInfo.event_type, eventInfo.external_id, eventInfo.title, eventInfo.payload, eventInfo.severity, 'pending']
    );

    console.log(`[webhook:vercel] Received ${eventInfo.event_type}: ${eventInfo.title}`);

    return NextResponse.json({ ok: true, event: eventInfo.event_type });
  } catch (err) {
    console.error('[webhook:vercel] Error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    name: 'KlawHub Vercel Webhook Receiver',
    supported_events: ['deployment.created', 'deployment.succeeded', 'deployment.error', 'deployment.canceled'],
  });
}
