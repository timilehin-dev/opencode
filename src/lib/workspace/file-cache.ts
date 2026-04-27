/**
 * File cache for serving agent-generated documents.
 *
 * Storage strategy:
 * 1. Supabase Storage (persistent, cross-instance) — primary on Vercel
 * 2. In-memory Map (fast-path within same serverless instance)
 *
 * Files are uploaded to the 'agent-files' bucket in Supabase Storage.
 * The in-memory cache is kept as a fast-path to avoid network round-trips
 * within the same request lifecycle.
 */

import { getSupabase } from "@/lib/core/supabase-client";

const BUCKET = "agent-files";
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_SIZE = 50;

// ---------------------------------------------------------------------------
// In-memory fast-path (same instance, avoids Supabase round-trip)
// ---------------------------------------------------------------------------

interface CachedFile {
  buffer: Buffer;
  mimeType: string;
  filename: string;
  createdAt: number;
}

const memoryCache = new Map<string, CachedFile>();

let _cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanup() {
  if (_cleanupTimer) return;
  _cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, file] of memoryCache.entries()) {
      if (now - file.createdAt > TTL_MS) {
        memoryCache.delete(key);
      }
    }
  }, 60_000);
  if (_cleanupTimer.unref) _cleanupTimer.unref();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Store a file for later download.
 * Uploads to Supabase Storage (persistent) and caches in memory (fast-path).
 */
export async function cacheFile(
  fileId: string,
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<void> {
  ensureCleanup();

  // Always store in memory for same-instance fast-path
  if (memoryCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey !== undefined) memoryCache.delete(oldestKey);
  }
  memoryCache.set(fileId, { buffer, mimeType, filename, createdAt: Date.now() });

  // Upload to Supabase Storage (persistent, cross-instance)
  const supabase = getSupabase();
  if (!supabase) {
    console.warn("[file-cache] Supabase not configured — file only cached in memory (will not persist across serverless instances)");
    return;
  }

  try {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(fileId, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) {
      console.error("[file-cache] Supabase Storage upload failed:", error.message);
    }
  } catch (err) {
    console.error("[file-cache] Supabase Storage upload error:", err);
  }
}

/**
 * Retrieve a file for download.
 * Checks in-memory cache first, then Supabase Storage.
 */
export async function getCachedFile(
  fileId: string,
): Promise<{ buffer: Buffer; mimeType: string; filename: string } | null> {
  // Fast-path: in-memory cache
  const memFile = memoryCache.get(fileId);
  if (memFile) {
    if (Date.now() - memFile.createdAt > TTL_MS) {
      memoryCache.delete(fileId);
    } else {
      return { buffer: memFile.buffer, mimeType: memFile.mimeType, filename: memFile.filename };
    }
  }

  // Slow-path: Supabase Storage (works across serverless instances)
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .download(fileId);

    if (error || !data) {
      return null;
    }

    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Determine mime type from the fileId extension
    const ext = fileId.split(".").pop()?.toLowerCase() || "";
    const mimeMap: Record<string, string> = {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      txt: "text/plain",
      csv: "text/csv",
      json: "application/json",
      md: "text/markdown",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
    };

    return {
      buffer,
      mimeType: mimeMap[ext] || "application/octet-stream",
      filename: fileId,
    };
  } catch (err) {
    console.error("[file-cache] Supabase Storage download error:", err);
    return null;
  }
}
