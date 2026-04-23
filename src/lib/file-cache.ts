/**
 * In-process file cache for serving generated documents.
 * 
 * On Vercel serverless, /tmp/ is ephemeral — files written during tool execution
 * in one request aren't accessible in subsequent GET requests. This cache
 * stores file buffers in memory so /api/files/[fileId] can serve them.
 * 
 * Files auto-expire after 10 minutes to prevent memory leaks.
 */

interface CachedFile {
  buffer: Buffer;
  mimeType: string;
  filename: string;
  createdAt: number;
}

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CACHE_SIZE = 100;

const fileCache = new Map<string, CachedFile>();

// Clean expired entries periodically
let _cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanup() {
  if (_cleanupTimer) return;
  _cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, file] of fileCache.entries()) {
      if (now - file.createdAt > TTL_MS) {
        fileCache.delete(key);
      }
    }
  }, 60_000);
  
  // Don't prevent process exit
  if (_cleanupTimer.unref) _cleanupTimer.unref();
}

/**
 * Store a file in the cache. Returns the fileId that can be used to retrieve it.
 */
export function cacheFile(fileId: string, buffer: Buffer, mimeType: string, filename: string): void {
  ensureCleanup();
  
  // Evict oldest if at capacity
  if (fileCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = fileCache.keys().next().value;
    if (oldestKey !== undefined) fileCache.delete(oldestKey);
  }
  
  fileCache.set(fileId, { buffer, mimeType, filename, createdAt: Date.now() });
}

/**
 * Retrieve a file from the cache. Returns null if not found or expired.
 */
export function getCachedFile(fileId: string): { buffer: Buffer; mimeType: string; filename: string } | null {
  const file = fileCache.get(fileId);
  if (!file) return null;
  
  if (Date.now() - file.createdAt > TTL_MS) {
    fileCache.delete(fileId);
    return null;
  }
  
  return { buffer: file.buffer, mimeType: file.mimeType, filename: file.filename };
}
