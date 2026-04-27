// ---------------------------------------------------------------------------
// Klawhub — Supabase JS Client (browser-safe singleton)
//
// Provides a Supabase JS client for features that need the PostgREST API
// or Supabase Storage (which cannot be accessed via raw pg Pool).
//
// Server-side database operations should use `query()` from `@/lib/core/db`
// instead — it's faster (direct pg connection, no REST overhead) and supports
// transactions.
//
// Use this ONLY for:
//   - Supabase Storage uploads/downloads (file-cache.ts)
//   - Client-side browser writes (analytics-store.ts, memory.ts)
//   - Any feature requiring the Supabase SDK specifically
// ---------------------------------------------------------------------------

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _supabase: SupabaseClient | null = null;

/**
 * Get the Supabase JS client singleton.
 * Returns null if NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY
 * are not configured.
 */
export function getSupabase(): SupabaseClient | null {
  if (_supabase) return _supabase;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return null;

  _supabase = createClient(url, key, {
    auth: {
      persistSession: false,
    },
  });

  return _supabase;
}

/** Check if Supabase is configured and reachable. */
export async function isSupabaseReady(): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const { error } = await supabase.from("agent_memory").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}
