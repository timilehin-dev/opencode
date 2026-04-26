# API Design Guide for Next.js Applications

Patterns for building robust, type-safe APIs with Next.js App Router, Server Actions, and Zod.

---

## 1. REST API Conventions (route.ts)

### File Structure
```
app/api/
├── health/route.ts                  # GET /api/health
├── projects/
│   ├── route.ts                     # GET, POST /api/projects
│   ├── [id]/route.ts               # GET, PATCH, DELETE /api/projects/:id
│   └── [id]/tasks/route.ts
```

### Standard Route Handler

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/shared/lib/db";
import { projectQuerySchema, createProjectSchema } from "@/features/projects/schemas";
import { parseQuery, handleApiError } from "@/shared/lib/api";

export async function GET(request: NextRequest) {
  try {
    const q = parseQuery(projectQuerySchema, request.nextUrl.searchParams);
    const [data, total] = await Promise.all([
      db.project.findMany({ where: { status: q.status }, skip: (q.page - 1) * q.limit, take: q.limit, orderBy: { createdAt: "desc" } }),
      db.project.count({ where: { status: q.status } }),
    ]);
    return NextResponse.json({ data, pagination: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) } });
  } catch (e) { return handleApiError(e); }
}

export async function POST(request: NextRequest) {
  try {
    const input = createProjectSchema.parse(await request.json());
    return NextResponse.json(await db.project.create({ data: input }), { status: 201 });
  } catch (e) { return handleApiError(e); }
}
```

### HTTP Method → Status Code Map

| Method | Idempotent | Success | Common Errors |
|--------|-----------|---------|---------------|
| GET | Yes | 200 | 404 |
| POST | No | 201 | 400, 409, 422 |
| PUT | Yes | 200 | 400, 404, 409 |
| PATCH | No | 200 | 400, 404 |
| DELETE | Yes | 200/204 | 404 |

---

## 2. Server Actions

### When to Use vs API Routes

| Use Case | Server Action | API Route |
|----------|:---:|:---:|
| Form submission | ✅ | ⚠️ |
| Progressive enhancement | ✅ | ❌ |
| External client (mobile) | ❌ | ✅ |
| File upload | ❌ | ✅ |
| Webhook receiver | ❌ | ✅ |

### Server Action with Validation

```typescript
"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/shared/lib/db";
import { auth } from "@/auth";
import { createProjectSchema } from "../schemas/project.schema";
import type { ActionState } from "@/shared/lib/actions";

export async function createProject(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { success: false, error: "Unauthorized" };
  const result = createProjectSchema.safeParse({ name: formData.get("name"), description: formData.get("description") });
  if (!result.success) return { success: false, error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors };
  try {
    revalidatePath("/projects");
    return { success: true, data: await db.project.create({ data: { name: result.data.name, ownerId: session.user.id } }) };
  } catch (error) {
    if (error?.code === "P2002") return { success: false, error: "Already exists" };
    return { success: false, error: "Failed to create" };
  }
}
```

### Client Component Usage

```tsx
"use client";
import { useActionState } from "react";
import { createProject } from "../actions/create-project";
export function CreateProjectForm() {
  const [state, formAction, isPending] = useActionState(createProject, { success: false });
  return (
    <form action={formAction}>
      <input name="name" />
      {state.fieldErrors?.name && <span className="text-destructive">{state.fieldErrors.name[0]}</span>}
      <button type="submit" disabled={isPending}>{isPending ? "Creating..." : "Create"}</button>
      {state.error && <p className="text-destructive">{state.error}</p>}
    </form>);
}
```

---

## 3. API Versioning

### URL Path (Recommended)

```typescript
// app/api/v1/projects/route.ts
// app/api/v2/projects/route.ts
```

### Header-Based

```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  const version = request.headers.get("x-api-version") ?? "v1";
  const url = request.nextUrl.clone();
  url.pathname = url.pathname.replace("/api/", `/api/${version}/`);
  return NextResponse.rewrite(url);
}
```

| Strategy | Best For | Trade-off |
|----------|----------|-----------|
| URL path | Public APIs | Explicit, cacheable |
| Header | Internal APIs | Clean URLs, hard to test |
| Query param | Gradual migration | Pollutes cache |

---

## 4. Pagination

### Cursor-Based (Large datasets)

```typescript
const projects = await db.project.findMany({
  take: limit + 1, // extra to detect next page
  ...(cursor && { cursor: { id: cursor }, skip: 1 }),
  orderBy: { createdAt: "desc" },
});
const hasMore = projects.length > limit;
return NextResponse.json({ data: hasMore ? projects.slice(0, limit) : projects,
  nextCursor: hasMore ? projects[limit - 1].id : null });
```

### Offset-Based (Simple, small datasets)

```typescript
const [items, total] = await Promise.all([
  db.project.findMany({ skip: (page - 1) * limit, take: limit }), db.project.count(),
]);
```

| Pattern | Pros | Cons |
|---------|------|------|
| Cursor | Stable with inserts, fast at scale | No random page access |
| Offset | Simple, supports page jumping | Inconsistent on concurrent writes |

---

## 5. Rate Limiting

```typescript
// shared/lib/rate-limit.ts — Upstash Redis
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
const ratelimit = new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.slidingWindow(10, "10 s") });

// In handler:
const { allowed, remaining, reset } = await ratelimit.limit(`create:${session?.user?.id ?? ip}`);
if (!allowed) return NextResponse.json({ error: "Too many requests" },
  { status: 429, headers: { "Retry-After": String(reset), "X-RateLimit-Remaining": String(remaining) } });
```

---

## 6. Request Validation (Zod)

```typescript
// shared/lib/api.ts
export function parseQuery<T>(schema: ZodSchema<T>, sp: URLSearchParams): T {
  const raw: Record<string, string> = {};
  sp.forEach((v, k) => { raw[k] = v; });
  return schema.parse(raw);
}
export const createProjectSchema = z.object({
  name: z.string().min(1, "Required").max(100), description: z.string().max(1000).optional(), ownerId: z.string().cuid(),
});
export const projectQuerySchema = z.object({
  status: z.enum(["ACTIVE", "ARCHIVED", "ALL"]).default("ACTIVE"),
  search: z.string().optional(), sortBy: z.enum(["createdAt", "name"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20),
});
```

---

## 7. Error Response Format

```typescript
// shared/lib/api/errors.ts
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { isAppError, toHttpError } from "@/shared/lib/errors";

export function handleApiError(error: unknown): NextResponse {
  if (isAppError(error)) { const { statusCode, body } = toHttpError(error); return NextResponse.json(body, { status: statusCode }); }
  if (error instanceof ZodError)
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request", details: error.flatten() } }, { status: 422 });
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const m: Record<string, [number, string]> = { P2002: [409, "Exists"], P2025: [404, "Not found"], P2003: [422, "FK violation"] };
    const [s, msg] = m[error.code] ?? [503, "DB error"];
    return NextResponse.json({ error: { code: "DB_ERROR", message: msg } }, { status: s });
  }
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Unexpected error" } }, { status: 500 });
}
```

---

## 8. File Upload

```typescript
const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export async function POST(request: NextRequest) {
  const file = (await request.formData()).get("file") as File | null;
  if (!file) return errorResponse("MISSING_FILE", "No file", 400);
  if (file.size > MAX_SIZE) return errorResponse("FILE_TOO_LARGE", "Max 5 MB", 413);
  if (!ALLOWED.includes(file.type)) return errorResponse("INVALID_TYPE", "Not allowed", 415);
  const blob = await put(file.name, file, { access: "public" }); // @vercel/blob
  return NextResponse.json({ url: blob.url }, { status: 201 });
}
```

---

## 9. WebSocket / Real-Time

### Server-Sent Events

```typescript
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const iv = setInterval(async () => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(await db.project.findUnique({ where: { id } }))}\n\n`));
      }, 5000);
      request.signal.addEventListener("abort", () => clearInterval(iv));
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
}
```

### Pusher (Production WebSockets)

```typescript
import Pusher from "pusher";
export const pusher = new Pusher({ appId: process.env.PUSHER_APP_ID!, key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!, cluster: process.env.PUSHER_CLUSTER! });
export const notify = (projectId: string, event: string, data: unknown) =>
  pusher.trigger(`project-${projectId}`, event, data);
```

---

## 10. API Documentation

- Auto-generate from Zod schemas (openapi-zodio or tRPC OpenAPI plugin)
- TypeScript types as source of truth — derive OpenAPI, not the reverse
- Include examples via `.describe()` or `z.string().example("value")`
- Consider `next-swagger-doc` for Swagger UI at `/api/docs`
