// ---------------------------------------------------------------------------
// /api/triggers — Trigger Management API
//
// CRUD operations for the triggers table (proactive scanning rules).
// Also provides trigger engine execution endpoint.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/core/db';

// GET /api/triggers — List all triggers
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source');
    const enabled = searchParams.get('enabled');

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (source) {
      conditions.push(`source = $${paramIdx}`);
      values.push(source);
      paramIdx++;
    }
    if (enabled !== null && enabled !== undefined) {
      conditions.push(`enabled = $${paramIdx}`);
      values.push(enabled === 'true');
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT * FROM triggers ${whereClause} ORDER BY created_at DESC`;

    const res = await query(sql, values);
    return NextResponse.json({ ok: true, triggers: res.rows, count: res.rows.length });
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

    const res = await query(
      `INSERT INTO triggers (name, description, source, event_type, filter_config, action_type, action_config, agent_id, cooldown_seconds, enabled, created_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8, $9, $10, $11) RETURNING *`,
      [
        name,
        description || '',
        source,
        event_type,
        filter_config || {},
        action_type || 'create_task',
        action_config || {},
        agent_id || null,
        cooldown_seconds || 300,
        enabled !== false,
        'user',
      ]
    );

    return NextResponse.json({ ok: true, trigger: res.rows[0] }, { status: 201 });
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

    const allowedFields = ['name', 'description', 'source', 'event_type', 'filter_config', 'action_type', 'action_config', 'agent_id', 'cooldown_seconds', 'enabled'];
    const sets: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    for (const [key, val] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        sets.push(`${key} = $${paramIdx}`);
        values.push(val);
        paramIdx++;
      }
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    values.push(id);
    const sql = `UPDATE triggers SET ${sets.join(', ')} WHERE id = $${paramIdx} RETURNING *`;
    const res = await query(sql, values);

    return NextResponse.json({ ok: true, trigger: res.rows[0] });
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

    await query('DELETE FROM triggers WHERE id = $1', [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[triggers] DELETE error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
