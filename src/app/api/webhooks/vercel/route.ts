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

function getEventInfo(body) {
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

export async function POST(request) {
  try {
    const body = await request.json();
    const eventInfo = getEventInfo(body);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.warn('[webhook:vercel] No Supabase config');
      return NextResponse.json({ ok: true, stored: false });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Dedup
    const { data: existing } = await supabase
      .from('trigger_events')
      .select('id')
      .eq('external_id', eventInfo.external_id)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ ok: true, deduplicated: true, event: eventInfo.event_type });
    }

    const { error } = await supabase.from('trigger_events').insert({
      source: 'vercel',
      event_type: eventInfo.event_type,
      external_id: eventInfo.external_id,
      title: eventInfo.title,
      payload: eventInfo.payload,
      severity: eventInfo.severity,
      status: 'pending',
    });

    if (error) {
      console.error('[webhook:vercel] DB insert error:', error);
      return NextResponse.json({ error: 'DB insert failed' }, { status: 500 });
    }

    console.log(`[webhook:vercel] Received ${eventInfo.event_type}: ${eventInfo.title}`);

    return NextResponse.json({ ok: true, event: eventInfo.event_type });
  } catch (err) {
    console.error('[webhook:vercel] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    name: 'KlawHub Vercel Webhook Receiver',
    supported_events: ['deployment.created', 'deployment.succeeded', 'deployment.error', 'deployment.canceled'],
  });
}
