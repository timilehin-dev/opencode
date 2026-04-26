// ---------------------------------------------------------------------------
// /api/triggers — Trigger Management API
//
// CRUD operations for the triggers table (proactive scanning rules).
// Also provides trigger engine execution endpoint.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function getSupabase() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase not configured');
  }
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(supabaseUrl, supabaseKey);
}

// GET /api/triggers — List all triggers
export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabase();
    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source');
    const enabled = searchParams.get('enabled');

    let query = supabase
      .from('triggers')
      .select('*')
      .order('created_at', { ascending: false });

    if (source) query = query.eq('source', source);
    if (enabled !== null && enabled !== undefined) query = query.eq('enabled', enabled === 'true');

    const { data, error } = await query;

    if (error) throw error;
    return NextResponse.json({ ok: true, triggers: data, count: data?.length || 0 });
  } catch (err) {
    console.error('[triggers] GET error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/triggers — Create a new trigger
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, source, event_type, filter_config, action_type, action_config, agent_id, cooldown_seconds, enabled } = body;

    if (!name || !source || !event_type) {
      return NextResponse.json({ error: 'name, source, and event_type are required' }, { status: 400 });
    }

    const supabase = await getSupabase();
    const { data, error } = await supabase.from('triggers').insert({
      name,
      description: description || '',
      source,
      event_type,
      filter_config: filter_config || {},
      action_type: action_type || 'create_task',
      action_config: action_config || {},
      agent_id: agent_id || null,
      cooldown_seconds: cooldown_seconds || 300,
      enabled: enabled !== false,
      created_by: 'user',
    }).select().single();

    if (error) throw error;
    return NextResponse.json({ ok: true, trigger: data }, { status: 201 });
  } catch (err) {
    console.error('[triggers] POST error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH /api/triggers — Update a trigger
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('triggers')
      .update(updates)
      .eq('id', id)
      .select().single();

    if (error) throw error;
    return NextResponse.json({ ok: true, trigger: data });
  } catch (err) {
    console.error('[triggers] PATCH error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/triggers — Delete a trigger
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const supabase = await getSupabase();
    const { error } = await supabase.from('triggers').delete().eq('id', id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[triggers] DELETE error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
