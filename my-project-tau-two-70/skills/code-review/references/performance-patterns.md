# Common Performance Anti-Patterns with Fixes

> Reference guide for identifying and resolving performance issues during code review.
> Organized by domain: Database, Memory, Frontend, API, Algorithms.

---

## 1. Database Patterns

### 1.1 N+1 Queries

**Detection method:**
- Look for loops that make individual database calls inside the loop body.
- Check query logs for repeated similar queries with different parameters.
- Use `EXPLAIN` or query logging to count total queries per request.

**Impact assessment:** **HIGH** — Linear query scaling; 100 items = 101 queries. Causes massive latency and connection pool pressure.

**Problem code:**
```typescript
// VULNERABLE: N+1 — 1 query for users + N queries for posts
async function getUsersWithPosts() {
  const users = await db.query("SELECT * FROM users");

  for (const user of users) {
    // Each iteration fires a separate query!
    user.posts = await db.query("SELECT * FROM posts WHERE user_id = ?", [user.id]);
  }

  return users;
}
```

**Fix:**
```typescript
// FIX: Batch fetch with JOIN or IN clause — 1 query total
async function getUsersWithPosts() {
  const users = await db.query(`
    SELECT u.*, JSON_AGG(p.*) AS posts
    FROM users u
    LEFT JOIN posts p ON p.user_id = u.id
    GROUP BY u.id
  `);
  return users;
}

// FIX: Alternative with ORM (eager loading)
const users = await User.findAll({
  include: [{ model: Post, as: "posts" }],
});
```

**Estimated improvement:** 10-100x reduction in query count; latency drops from seconds to milliseconds.

---

### 1.2 Missing Indexes

**Detection method:**
- Run `EXPLAIN ANALYZE` on slow queries; look for `Seq Scan` (full table scan).
- Monitor `pg_stat_statements` for queries with high total execution time.
- Check for columns used in `WHERE`, `JOIN`, `ORDER BY` without indexes.

**Impact assessment:** **HIGH** — Full table scan on large tables; query time grows linearly with table size.

**Problem code:**
```sql
-- No index on email column
SELECT * FROM users WHERE email = 'user@example.com';
-- Query plan: Seq Scan on users (cost=0.00..15420.00 rows=1 width=256)
```

**Fix:**
```sql
-- Create index on the lookup column
CREATE INDEX CONCURRENTLY idx_users_email ON users (email);

-- Now: Index Scan using idx_users_email (cost=0.42..8.44 rows=1 width=256)
```

**Estimated improvement:** 100-10000x faster lookups on tables with 10K+ rows.

---

### 1.3 SELECT * Anti-Pattern

**Detection method:**
- Search for `SELECT *` or ORM calls without explicit field selection.
- Check network payload sizes for API responses.

**Impact assessment:** **MEDIUM** — Wasted I/O, memory, and network bandwidth.

**Problem code:**
```typescript
// Fetches ALL columns including blob/text fields
const user = await db.query("SELECT * FROM users WHERE id = ?", [id]);
```

**Fix:**
```typescript
// Fetch only needed columns
const user = await db.query(
  "SELECT id, name, email, avatar_url FROM users WHERE id = ?",
  [id],
);

// ORM equivalent
const user = await User.findByPk(id, {
  attributes: ["id", "name", "email", "avatarUrl"],
});
```

**Estimated improvement:** 20-80% reduction in transfer size for wide tables.

---

### 1.4 Unbounded OFFSET Pagination

**Detection method:**
- Search for `OFFSET` in queries without a hard cap.
- Look for paginated endpoints without max-page validation.

**Impact assessment:** **HIGH** — `OFFSET 100000` still scans 100000 rows; degrades linearly.

**Problem code:**
```typescript
// OFFSET gets slower as page number grows
app.get("/api/users", async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 50;
  const offset = (page - 1) * limit;
  const users = await db.query(
    "SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?",
    [limit, offset],
  );
  res.json(users);
});
```

**Fix:**
```typescript
// FIX: cursor-based (keyset) pagination — constant time
app.get("/api/users", async (req, res) => {
  const limit = 50;
  const cursor = req.query.cursor; // e.g., "2024-01-15T10:30:00Z|user_id_42"

  let query = "SELECT * FROM users ORDER BY created_at DESC, id DESC LIMIT ?";
  const params: unknown[] = [limit + 1]; // fetch one extra to detect next page

  if (cursor) {
    const [createdAt, id] = cursor.split("|");
    query += " WHERE (created_at, id) < (?, ?)";
    params.push(createdAt, id);
  }

  const rows = await db.query(query, params);
  const hasNextPage = rows.length > limit;
  const users = rows.slice(0, limit);

  const nextCursor = hasNextPage
    ? `${users[users.length - 1].created_at}|${users[users.length - 1].id}`
    : null;

  res.json({ users, nextCursor });
});
```

**Estimated improvement:** Constant-time pagination regardless of depth; eliminates OFFSET scan degradation.

---

### 1.5 Missing Pagination

**Detection method:**
- API endpoints returning unbounded arrays.
- Queries without `LIMIT`.

**Impact assessment:** **CRITICAL** — Can OOM the server, exhaust connections, and DDoS the service.

**Problem code:**
```typescript
// Returns ALL matching records — no limit
app.get("/api/logs", async (req, res) => {
  const logs = await db.query("SELECT * FROM audit_logs WHERE created_at > NOW() - INTERVAL '7 days'");
  res.json(logs); // could be millions of rows
});
```

**Fix:**
```typescript
// FIX: always enforce a maximum limit
const MAX_LIMIT = 1000;
app.get("/api/logs", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, MAX_LIMIT);
  const offset = parseInt(req.query.offset) || 0;
  const logs = await db.query(
    "SELECT * FROM audit_logs WHERE created_at > NOW() - INTERVAL '7 days' ORDER BY created_at DESC LIMIT ? OFFSET ?",
    [limit, offset],
  );
  res.json({ logs, limit, offset });
});
```

---

### 1.6 Connection Pool Exhaustion

**Detection method:**
- Monitor `pg_stat_activity` for growing connection counts.
- Look for long-running transactions or missing connection release.
- Check for queries inside loops without batching.

**Impact assessment:** **HIGH** — New requests hang; cascading failures.

**Recommended fix:**
```typescript
import { Pool } from "pg";

// FIX: configure pool with explicit limits and timeouts
const pool = new Pool({
  host: process.env.DB_HOST,
  max: 20,                    // max connections
  idleTimeoutMillis: 30000,    // close idle connections after 30s
  connectionTimeoutMillis: 5000, // fail fast if no connection
  maxUses: 7500,               // recycle connections to prevent memory leaks
});

// FIX: always release clients
async function queryWithTimeout(sql: string, params: unknown[]) {
  const client = await pool.connect();
  try {
    // Set statement timeout
    await client.query("SET statement_timeout = '30s'");
    return await client.query(sql, params);
  } finally {
    client.release(); // always release, even on error
  }
}
```

---

## 2. Memory Patterns

### 2.1 Memory Leaks

**Detection method:**
- Heap snapshots in Chrome DevTools or `node --inspect`.
- Run `process.memoryUsage()` over time to detect unbounded growth.
- Use `--heapsnapshot-signal` in Node.js to capture snapshots on demand.

**Impact assessment:** **HIGH** — Gradual memory growth leading to OOM crashes.

**Problem code:**
```typescript
// VULNERABLE: global cache that grows unbounded
const cache = new Map<string, any>();

app.get("/api/data/:id", async (req, res) => {
  if (!cache.has(req.params.id)) {
    cache.set(req.params.id, await fetchExpensiveData(req.params.id));
  }
  res.json(cache.get(req.params.id));
  // Map grows forever — memory leak
});
```

**Fix:**
```typescript
// FIX: LRU cache with size limit
import LRU from "lru-cache";

const cache = new LRU<string, unknown>({
  max: 5000,             // max items
  ttl: 1000 * 60 * 5,   // 5 minute TTL
  maxSize: 50 * 1024 * 1024, // 50 MB max
  sizeCalculation: (value) => JSON.stringify(value).length,
});

app.get("/api/data/:id", async (req, res) => {
  const data = await cache.fetch(req.params.id, async () => {
    return fetchExpensiveData(req.params.id);
  });
  res.json(data);
});
```

**Estimated improvement:** Bounded memory usage; old entries auto-evicted.

---

### 2.2 Event Listener Leaks

**Detection method:**
- `getEventListeners()` in DevTools to count listeners.
- Look for `addEventListener` in loops or lifecycle hooks without `removeEventListener`.
- Check for EventEmitter instances with `on()` without `off()`.

**Impact assessment:** **MEDIUM** — Accumulates over time; especially problematic in SPAs and long-running servers.

**Problem code:**
```typescript
// VULNERABLE: adds a new listener on every call
function setupFeature() {
  window.addEventListener("resize", handleResize);
  // Never removed — leaks accumulate on repeated calls
}
```

**Fix:**
```typescript
// FIX: track and clean up listeners
class Feature {
  private resizeHandler = this.handleResize.bind(this);

  enable() {
    window.addEventListener("resize", this.resizeHandler);
  }

  disable() {
    window.removeEventListener("resize", this.resizeHandler);
  }

  private handleResize() {
    // ...
  }
}

// Or use AbortController (modern API)
const controller = new AbortController();
window.addEventListener("resize", handleResize, { signal: controller.signal });
// Later: controller.abort() removes all listeners with that signal
```

---

### 2.3 Closure Traps

**Detection method:**
- Large objects captured in closures that should be garbage collected.
- Timers or callbacks holding references to stale data.

**Impact assessment:** **MEDIUM** — Prevents GC of captured variables.

**Problem code:**
```typescript
// VULNERABLE: closure holds reference to large data
function processItems(items: LargeItem[]) {
  let result: unknown[] = [];

  items.forEach((item) => {
    // This closure captures `items` (the entire array)
    setTimeout(() => {
      result.push(transform(item));
      if (result.length === items.length) {
        onComplete(result);
      }
    }, Math.random() * 1000);
  });
  // `items` array cannot be GC'd until all timeouts complete
}
```

**Fix:**
```typescript
// FIX: minimize closure scope
function processItems(items: LargeItem[]) {
  const length = items.length; // capture only the primitive
  let count = 0;
  const results: unknown[] = new Array(length);

  for (let i = 0; i < length; i++) {
    // Only `i` is captured, not the entire array
    const item = items[i];
    setTimeout(() => {
      results[i] = transform(item);
      count++;
      if (count === length) {
        onComplete(results);
      }
    }, 0);
  }

  items = null; // allow original array to be GC'd
}
```

---

### 2.4 Large Object Retention

**Detection method:**
- Heap snapshots showing large arrays/objects not released.
- Profiling to find objects surviving multiple GC cycles.

**Impact assessment:** **MEDIUM** — High memory footprint.

**Problem code:**
```typescript
// VULNERABLE: accumulating results without clearing
const allResults: Result[] = [];
async function ingestFile(filePath: string) {
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) {
    const parsed = parseChunk(chunk);
    allResults.push(...parsed); // grows without bound
  }
}
```

**Fix:**
```typescript
// FIX: process in batches and stream results
async function ingestFile(filePath: string) {
  const stream = fs.createReadStream(filePath);
  const BATCH_SIZE = 1000;
  let batch: Result[] = [];

  for await (const chunk of stream) {
    const parsed = parseChunk(chunk);
    batch.push(...parsed);

    if (batch.length >= BATCH_SIZE) {
      await saveBatch(batch);
      batch = []; // release memory
    }
  }

  if (batch.length > 0) {
    await saveBatch(batch);
  }
}
```

---

## 3. Frontend Patterns

### 3.1 Unnecessary Re-renders

**Detection method:**
- React DevTools Profiler to identify re-render cascades.
- `console.log` in render to detect unexpected re-renders.
- Look for inline object/array creation in JSX props.

**Impact assessment:** **MEDIUM** — Causes jank, especially on complex component trees.

**Problem code:**
```tsx
// VULNERABLE: new object reference on every render
function Parent() {
  const [count, setCount] = useState(0);

  return (
    <>
      <button onClick={() => setCount(c => c + 1)}>Count: {count}</button>
      {/* style prop creates a new object every render — Child re-renders */}
      <Child style={{ color: "red", fontSize: 16 }} data={[1, 2, 3]} />
    </>
  );
}

const Child = React.memo(function Child({ style, data }) {
  return <div style={style}>{data.join(",")}</div>;
});
// React.memo won't help because props are new references every render
```

**Fix:**
```tsx
// FIX: hoist constants and memoize
function Parent() {
  const [count, setCount] = useState(0);
  const childStyle = useMemo(() => ({ color: "red", fontSize: 16 }), []);
  const childData = useMemo(() => [1, 2, 3], []);

  return (
    <>
      <button onClick={() => setCount(c => c + 1)}>Count: {count}</button>
      <Child style={childStyle} data={childData} />
    </>
  );
}
```

---

### 3.2 Bundle Bloat

**Detection method:**
- `webpack-bundle-analyzer` or `vite-plugin-visualizer`.
- Check for full library imports (e.g., `import _ from "lodash"`).
- Look for heavy dependencies that could be replaced with lighter alternatives.

**Impact assessment:** **HIGH** — Slow initial load, poor UX on mobile.

**Problem code:**
```typescript
// VULNERABLE: imports entire lodash (~70KB gzipped)
import _ from "lodash";
const result = _.debounce(fn, 300);
```

**Fix:**
```typescript
// FIX: tree-shakeable imports
import debounce from "lodash-es/debounce";
const result = debounce(fn, 300);

// BETTER: use native or lightweight alternatives
import { debounce } from "es-toolkit"; // tree-shakeable, modern
const result = debounce(fn, 300);

// Replace moment.js (~300KB) with date-fns or dayjs (~2KB)
import dayjs from "dayjs";
```

**Estimated improvement:** 50-90% reduction in bundle size.

---

### 3.3 Missing Lazy Loading

**Detection method:**
- Check route definitions for synchronous imports.
- Look for heavy components (charts, editors, maps) loaded upfront.

**Impact assessment:** **MEDIUM-HIGH** — Delays initial page load.

**Problem code:**
```tsx
// VULNERABLE: all components loaded upfront
import HeavyChart from "./components/HeavyChart";
import RichTextEditor from "./components/RichTextEditor";
import MapView from "./components/MapView";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/analytics" element={<HeavyChart />} />
      <Route path="/editor" element={<RichTextEditor />} />
      <Route path="/map" element={<MapView />} />
    </Routes>
  );
}
```

**Fix:**
```tsx
// FIX: lazy-load route-level code splits
import { lazy, Suspense } from "react";

const HeavyChart = lazy(() => import("./components/HeavyChart"));
const RichTextEditor = lazy(() => import("./components/RichTextEditor"));
const MapView = lazy(() => import("./components/MapView"));

function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/analytics" element={<HeavyChart />} />
        <Route path="/editor" element={<RichTextEditor />} />
        <Route path="/map" element={<MapView />} />
      </Routes>
    </Suspense>
  );
}
```

---

### 3.4 Layout Thrashing

**Detection method:**
- Chrome DevTools Performance tab — look for alternating layout/paint bars.
- Check for interleaved DOM reads and writes.

**Impact assessment:** **MEDIUM** — Causes dropped frames and jank.

**Problem code:**
```typescript
// VULNERABLE: interleaved read/write forces reflow each time
for (const el of document.querySelectorAll(".item")) {
  const height = el.offsetHeight;        // READ — forces layout
  el.style.height = `${height * 2}px`;   // WRITE — invalidates layout
  // Next iteration reflows again
}
```

**Fix:**
```typescript
// FIX: batch reads, then batch writes
const items = document.querySelectorAll(".item");

// Batch all reads
const heights = Array.from(items).map((el) => el.offsetHeight);

// Batch all writes
items.forEach((el, i) => {
  el.style.height = `${heights[i] * 2}px`;
});
```

---

## 4. API Patterns

### 4.1 Missing Caching

**Detection method:**
- Repeated identical requests to expensive endpoints.
- No `Cache-Control` headers on GET responses.
- No application-level caching for computed data.

**Impact assessment:** **MEDIUM-HIGH** — Unnecessary load on backend and database.

**Problem code:**
```typescript
// VULNERABLE: no caching — every request hits the database
app.get("/api/products", async (req, res) => {
  const products = await db.query("SELECT * FROM products WHERE active = true");
  res.json(products);
});
```

**Fix:**
```typescript
// FIX: HTTP cache headers + application cache
import NodeCache from "node-cache";

const productCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

app.get("/api/products", async (req, res) => {
  const cacheKey = "active_products";
  let products = productCache.get(cacheKey);

  if (!products) {
    products = await db.query("SELECT * FROM products WHERE active = true");
    productCache.set(cacheKey, products);
  }

  res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  res.json(products);
});
```

---

### 4.2 Chatty APIs

**Detection method:**
- Browser Network tab showing 20+ sequential requests on page load.
- Components making individual API calls for each data item.

**Impact assessment:** **MEDIUM** — High latency from cumulative round trips.

**Problem code:**
```typescript
// VULNERABLE: separate request per item
async function loadDashboard() {
  const user = await fetch("/api/user").then(r => r.json());
  const notifications = await fetch("/api/notifications").then(r => r.json());
  const settings = await fetch("/api/settings").then(r => r.json());
  const stats = await fetch("/api/stats").then(r => r.json());
  return { user, notifications, settings, stats };
  // 4 sequential round trips — ~1.6s at 400ms each
}
```

**Fix:**
```typescript
// FIX: single batched endpoint
async function loadDashboard() {
  const data = await fetch("/api/dashboard").then(r => r.json());
  return data;
  // 1 round trip — ~400ms
}

// Or use Promise.all for independent requests:
async function loadDashboard() {
  const [user, notifications, settings, stats] = await Promise.all([
    fetch("/api/user").then(r => r.json()),
    fetch("/api/notifications").then(r => r.json()),
    fetch("/api/settings").then(r => r.json()),
    fetch("/api/stats").then(r => r.json()),
  ]);
  return { user, notifications, settings, stats };
  // Parallel round trip — ~400ms (slowest one)
}
```

---

### 4.3 Sync Operations That Should Be Async

**Detection method:**
- `fs.readFileSync`, `child_process.execSync`, `crypto.pbkdf2Sync` in request handlers.
- CPU-bound operations blocking the event loop.

**Impact assessment:** **CRITICAL** — Blocks all other requests on the same process.

**Problem code:**
```typescript
// VULNERABLE: synchronous file read blocks event loop
app.get("/api/report", (req, res) => {
  const data = fs.readFileSync("/tmp/large-report.json", "utf-8");
  res.json(JSON.parse(data)); // blocks for hundreds of ms on large files
});
```

**Fix:**
```typescript
// FIX: async I/O
app.get("/api/report", async (req, res) => {
  const data = await fs.promises.readFile("/tmp/large-report.json", "utf-8");
  res.json(JSON.parse(data));
});

// For CPU-bound work, offload to worker threads
import { Worker } from "worker_threads";

app.get("/api/heavy-compute", async (req, res) => {
  const worker = new Worker("./workers/compute.js", {
    workerData: { input: req.body.data },
  });
  const result = await new Promise((resolve, reject) => {
    worker.on("message", resolve);
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
    });
  });
  res.json(result);
});
```

---

## 5. Algorithm Patterns

### 5.1 O(n^2) Loops

**Detection method:**
- Nested loops iterating over the same or similar collections.
- Search/lookup inside inner loops.

**Impact assessment:** **HIGH** — Degrades significantly with data size (10K items = 100M operations).

**Problem code:**
```typescript
// VULNERABLE: nested loop — O(n^2)
function findDuplicates(users: User[]): User[] {
  const duplicates: User[] = [];
  for (let i = 0; i < users.length; i++) {
    for (let j = i + 1; j < users.length; j++) {
      if (users[i].email === users[j].email) {
        duplicates.push(users[i]);
        break;
      }
    }
  }
  return duplicates;
}
```

**Fix:**
```typescript
// FIX: use Set/Map for O(n) lookup
function findDuplicates(users: User[]): User[] {
  const seen = new Map<string, User>();
  const duplicates: User[] = [];

  for (const user of users) {
    if (seen.has(user.email)) {
      duplicates.push(seen.get(user.email)!);
    } else {
      seen.set(user.email, user);
    }
  }

  return duplicates;
}
```

**Estimated improvement:** O(n^2) → O(n); 10K items: ~100M ops → ~10K ops.

---

### 5.2 Redundant Computations

**Detection method:**
- Same expensive computation called repeatedly with same inputs.
- Missing memoization for pure functions.

**Impact assessment:** **MEDIUM** — Wastes CPU cycles.

**Problem code:**
```typescript
// VULNERABLE: expensive computation repeated on each call
function getPermissions(user: User): Permission[] {
  const roles = user.roles; // potentially expensive lookup
  const permissions = computePermissions(roles); // heavy computation
  return permissions;
}

// Called in a loop:
for (const user of users) {
  if (getPermissions(user).includes("admin")) { ... }  // computed
  if (getPermissions(user).includes("write")) { ... }  // computed AGAIN
}
```

**Fix:**
```typescript
// FIX: memoize pure functions
function memoize<T extends (...args: any[]) => any>(fn: T): T {
  const cache = new Map<string, ReturnType<T>>();
  return ((...args: any[]) => {
    const key = JSON.stringify(args);
    if (!cache.has(key)) {
      cache.set(key, fn(...args));
    }
    return cache.get(key)!;
  }) as T;
}

const getPermissions = memoize(function getPermissions(user: User): Permission[] {
  return computePermissions(user.roles);
});
```

---

### 5.3 Unnecessary Cloning

**Detection method:**
- `JSON.parse(JSON.stringify(obj))` for deep clone.
- Spread operator on large objects/arrays.

**Impact assessment:** **LOW-MEDIUM** — Wastes memory and CPU.

**Problem code:**
```typescript
// VULNERABLE: expensive deep clone via JSON serialization
function updateConfig(config: Config, key: string, value: unknown): Config {
  const copy = JSON.parse(JSON.stringify(config)); // very slow for large objects
  copy[key] = value;
  return copy;
}
```

**Fix:**
```typescript
// FIX: structuredClone (native, faster)
function updateConfig(config: Config, key: string, value: unknown): Config {
  const copy = structuredClone(config);
  copy[key] = value;
  return copy;
}

// FIX: shallow clone is often sufficient
function updateConfig(config: Config, key: string, value: unknown): Config {
  return { ...config, [key]: value };
}
```

---

### 5.4 Regex Catastrophic Backtracking

**Detection method:**
- Regex with nested quantifiers (`(a+)+`, `(a|a)*`, `(a*)*`).
- Regex that hangs on long strings (test with `aaa...bbb...` input).

**Impact assessment:** **CRITICAL** — Can lock the event loop for minutes or hours (ReDoS attack vector).

**Problem code:**
```typescript
// VULNERABLE: nested quantifiers — catastrophic backtracking
const isValidEmail = /^(a+)+$/.test(userInput); // hangs on "aaaaaaaaaaaaaaaaX"
```

**Fix:**
```typescript
// FIX: use possessive quantifiers or atomic groups
// JavaScript: use specific patterns without nested quantifiers
const isSafe = /^a+$/.test(input); // linear time

// FIX: for complex validation, set a timeout
import { exec } from "node:child_process";

function safeRegexTest(pattern: RegExp, input: string, timeoutMs = 100): boolean {
  const start = Date.now();
  try {
    // Replace with safe regex that avoids nested quantifiers
    // Or use a regex engine with backtracking limits
    return pattern.test(input);
  } finally {
    if (Date.now() - start > timeoutMs) {
      console.warn(`Regex took too long: ${pattern}`);
      return false;
    }
  }
}

// BEST: use libraries like safe-regex to validate patterns
import safeRegex from "safe-regex";
console.log(safeRegex("(a+)+"));    // false — unsafe
console.log(safeRegex("^a+$"));     // true — safe
```

**Estimated improvement:** From exponential time O(2^n) to linear time O(n).

---

## Quick-Reference Summary

| Domain | Anti-Pattern | Severity | Fix Strategy |
|---|---|---|---|
| Database | N+1 queries | HIGH | Eager loading, JOIN, batch IN |
| Database | Missing indexes | HIGH | `EXPLAIN ANALYZE`, add composite indexes |
| Database | Unbounded OFFSET | HIGH | Cursor-based pagination |
| Memory | Unbounded caches | HIGH | LRU cache with TTL and max size |
| Memory | Event listener leaks | MEDIUM | AbortController, cleanup in lifecycle |
| Frontend | Bundle bloat | HIGH | Tree shaking, code splitting, replace heavy libs |
| Frontend | Missing lazy loading | MEDIUM | `React.lazy()`, dynamic imports |
| API | Missing caching | MEDIUM | HTTP cache headers + app-level cache |
| API | Sync in async context | CRITICAL | `fs.promises`, worker threads |
| Algorithm | O(n^2) loops | HIGH | Set/Map for O(1) lookups |
| Algorithm | ReDoS | CRITICAL | Avoid nested quantifiers, use safe-regex |
