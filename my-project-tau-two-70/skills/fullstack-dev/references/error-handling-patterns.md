# Error Handling Patterns for Next.js Applications

Handling, logging, and recovering from errors across the full Next.js stack.

---

## 1. Error Classification System

```typescript
// shared/lib/errors.ts
export abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
  abstract readonly category: ErrorCategory;
  constructor(message: string, public readonly context?: Record<string, unknown>) {
    super(message); this.name = this.constructor.name;
  }
}
export type ErrorCategory = "client" | "server" | "domain" | "infrastructure";

// Client Errors (4xx)
export class ValidationError extends AppError { category = "client" as const; code = "VALIDATION_ERROR"; statusCode = 422; }
export class NotFoundError extends AppError {
  category = "client" as const; code = "NOT_FOUND"; statusCode = 404;
  constructor(resource: string, id?: string) { super(`${resource}${id ? ` (${id})` : ""} not found`, { resource, id }); }
}
export class UnauthorizedError extends AppError { category = "client" as const; code = "UNAUTHORIZED"; statusCode = 401; }
export class ForbiddenError extends AppError { category = "client" as const; code = "FORBIDDEN"; statusCode = 403; }
export class ConflictError extends AppError { category = "client" as const; code = "CONFLICT"; statusCode = 409; }
export class RateLimitError extends AppError {
  category = "client" as const; code = "RATE_LIMITED"; statusCode = 429;
  constructor(retryAfter: number) { super("Too many requests", { retryAfter }); }
}

// Server / Domain / Infrastructure
export class InternalError extends AppError { category = "server" as const; code = "INTERNAL_ERROR"; statusCode = 500; }
export class DomainError extends AppError { category = "domain" as const; code = "DOMAIN_ERROR"; statusCode = 422; }
export class DatabaseError extends AppError { category = "infrastructure" as const; code = "DATABASE_ERROR"; statusCode = 503; }
export class ExternalServiceError extends AppError {
  category = "infrastructure" as const; code = "EXTERNAL_SERVICE_ERROR"; statusCode = 502;
  constructor(service: string) { super(`"${service}" failed`, { service }); }
}

// Helpers
export function isAppError(e: unknown): e is AppError { return e instanceof AppError; }
export function toHttpError(e: unknown) {
  if (isAppError(e)) return { statusCode: e.statusCode, body: { error: { code: e.code, message: e.message, details: e.context } } };
  return { statusCode: 500, body: { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } } };
}
```

---

## 2. Next.js Error Boundaries

### error.tsx (Route-Level)

```tsx
// app/projects/[id]/error.tsx
"use client";
import { useEffect } from "react";
import { Button } from "@/shared/components/ui/button";
import { logger } from "@/shared/lib/logger";

export default function ProjectError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { logger.error("Page error", { message: error.message, digest: error.digest }); }, [error]);
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="text-muted-foreground">{error.message || "Failed to load."}</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
```

### global-error.tsx (Root)

```tsx
// app/global-error.tsx
"use client";
import { useEffect } from "react";
import { logger } from "@/shared/lib/logger";
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { logger.critical("Unhandled error", { message: error.message }); }, [error]);
  return (
    <html><body>
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
        <h1 className="text-2xl font-bold">Application Error</h1>
        <p>An unexpected error occurred.</p>
        <button onClick={reset} className="rounded-md bg-primary px-4 py-2 text-primary-foreground">Try again</button>
      </div>
    </body></html>
  );
}
```

### not-found.tsx

```tsx
// app/not-found.tsx
import Link from "next/link";
export default function NotFound() {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
      <h2>Not Found</h2>
      <Link href="/" className="text-primary underline">Return home</Link>
    </div>
  );
}
// Resource-specific: app/projects/[id]/not-found.tsx
// export default function ProjectNotFound() { ... }
```

---

## 3. API Error Handling

```typescript
// shared/lib/api/errors.ts
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { isAppError, toHttpError } from "@/shared/lib/errors";
import { logger } from "@/shared/lib/logger";

export function handleApiError(error: unknown): NextResponse {
  if (isAppError(error)) {
    if (error.category === "server" || error.category === "infrastructure")
      logger.error(`[${error.code}] ${error.message}`, { context: error.context });
    const { statusCode, body } = toHttpError(error);
    return NextResponse.json(body, { status: statusCode });
  }
  if (error instanceof ZodError)
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request", details: error.flatten() } }, { status: 422 });
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const m: Record<string, [number, string]> = {
      P2002: [409, "Already exists"], P2025: [404, "Not found"], P2003: [422, "FK violation"],
    };
    const [s, msg] = m[error.code] ?? [503, "Database error"];
    return NextResponse.json({ error: { code: "DB_ERROR", message: msg, details: error.meta } }, { status: s });
  }
  logger.error("Unhandled API error", { error });
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Unexpected error" } }, { status: 500 });
}
```

---

## 4. Database Error Handling

| Prisma Code | Meaning | HTTP | Action |
|-------------|---------|------|--------|
| P2002 | Unique constraint | 409 | Return conflict |
| P2025 | Record not found | 404 | Return not found |
| P2003 | Foreign key | 422 | Return validation error |
| P1001 | Connection error | 503 | Retry gracefully |

### Safe Query Wrapper

```typescript
// shared/lib/db/query.ts
import { NotFoundError, DatabaseError } from "@/shared/lib/errors";

export async function findOrThrow<T>(fn: () => Promise<T | null>, resource: string, id?: string): Promise<T> {
  try {
    const result = await fn();
    if (result === null) throw new NotFoundError(resource, id);
    return result;
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    throw new DatabaseError("Query failed", { resource, id });
  }
}
// Usage: const project = await findOrThrow(() => db.project.findUnique({ where: { id } }), "Project", id);
```

### Transaction with Domain Validation

```typescript
export async function transferOwnership(projectId: string, newOwnerId: string) {
  return db.$transaction(async (tx) => {
    const project = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
    if (project.ownerId === newOwnerId) throw new DomainError("New owner must differ");
    await tx.auditLog.create({ data: { action: "TRANSFER", entityId: projectId } });
    return tx.project.update({ where: { id: projectId }, data: { ownerId: newOwnerId } });
  });
}
```

---

## 5. Client-Side Error Handling

### Toast Notifications for Server Actions

```tsx
"use client";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { createProject } from "../actions/create-project";
export function ProjectForm() {
  const [state, formAction, isPending] = useActionState(createProject, { success: false });
  useEffect(() => {
    if (state.success) toast.success("Created", { description: state.data.name });
    if (!state.success && state.error) toast.error("Failed", { description: state.error });
  }, [state]);
  return <form action={formAction}>{/* fields */}<button disabled={isPending}>Create</button></form>;
}
```

### Optimistic Updates with Rollback

```tsx
"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetch(`/api/projects/${id}`, { method: "DELETE" }).then(r => {
      if (!r.ok) throw new Error(); return id;
    }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["projects"] });
      const prev = qc.getQueryData(["projects"]);
      qc.setQueryData(["projects"], (old: Project[]) => old?.filter(p => p.id !== id));
      return { prev };
    },
    onError: (_e, _id, ctx) => { qc.setQueryData(["projects"], ctx?.prev); toast.error("Failed — reverted"); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["projects"] }),
    onSuccess: () => toast.success("Deleted"),
  });
}
```

### Form Validation Display

```tsx
"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
export function UserForm() {
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(userSchema) });
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register("name")} />
      {errors.name && <p className="text-sm text-destructive mt-1">{errors.name.message}</p>}
    </form>);
}
```

---

## 6. Logging Strategy

```typescript
// shared/lib/logger.ts
type LogLevel = "debug" | "info" | "warn" | "error" | "critical";
const LEVELS: LogLevel[] = ["debug", "info", "warn", "error", "critical"];

class Logger {
  private context: Record<string, unknown> = {};
  constructor(private minLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) ?? "info") {}

  with(ctx: Record<string, unknown>) {
    const child = new Logger(this.minLevel); child.context = { ...this.context, ...ctx }; return child;
  }
  private emit(level: LogLevel, message: string, extra?: Record<string, unknown>) {
    if (LEVELS.indexOf(level) < LEVELS.indexOf(this.minLevel)) return;
    const entry = { level, message, timestamp: new Date().toISOString(), ...this.context, ...extra };
    (level === "critical" || level === "error" ? console.error : console.log)(JSON.stringify(entry));
  }
  debug(msg: string, ctx?: Record<string, unknown>) { this.emit("debug", msg, ctx); }
  info(msg: string, ctx?: Record<string, unknown>) { this.emit("info", msg, ctx); }
  warn(msg: string, ctx?: Record<string, unknown>) { this.emit("warn", msg, ctx); }
  error(msg: string, ctx?: Record<string, unknown>) { this.emit("error", msg, ctx); }
  critical(msg: string, ctx?: Record<string, unknown>) { this.emit("critical", msg, ctx); }
}
export const logger = new Logger();
```

| Level | When | Example |
|-------|------|---------|
| debug | Verbose dev info | "Query in 12ms" |
| info | Normal operations | "User created" |
| warn | Recoverable issues | "Rate limit nearing" |
| error | Needs attention | "DB timeout" |
| critical | System failure | "Connections exhausted" |

---

## 7. Monitoring: Sentry

```typescript
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV,
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
      ignoreErrors: ["NEXT_REDIRECT", "AbortError"],
      beforeSend(event) {
        if (event.request?.headers) delete event.request.headers["authorization"];
        return event;
      },
    });
  }
}
// Context enrichment
import * as Sentry from "@sentry/nextjs";
export function setUserContext(user: { id: string; email: string; role: string }) {
  Sentry.setUser({ id: user.id, email: user.email }); Sentry.setTag("userRole", user.role);
}
// Performance spans
export async function exportAllProjects() {
  return Sentry.startSpan({ name: "export.projects", op: "db.query" }, async () =>
    transformToCsv(await db.project.findMany({ include: { tasks: true } }))
  );
}
```

---

## 8. Retry Patterns

### Exponential Backoff with Jitter

```typescript
export async function withRetry<T>(fn: () => Promise<T>, opts: {
  maxAttempts?: number; baseDelayMs?: number; maxDelayMs?: number;
  shouldRetry?: (e: unknown) => boolean;
} = {}): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 1000, maxDelayMs = 30000,
    shouldRetry = (e) => e instanceof DatabaseError || e instanceof ExternalServiceError } = opts;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { return await fn(); } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !shouldRetry(error)) throw error;
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs) * Math.random();
      logger.warn("Retrying", { attempt, maxAttempts, nextRetryMs: Math.round(delay) });
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError;
}
// Usage: await withRetry(() => sendEmail(payload), { maxAttempts: 5 });
```

### Circuit Breaker

```typescript
export class CircuitBreaker {
  private state: "closed" | "open" | "half-open" = "closed";
  private failures = 0; private nextAttempt = 0;
  constructor(private threshold: number, private resetMs: number) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open" && Date.now() < this.nextAttempt) throw new Error("Circuit breaker OPEN");
    if (this.state === "open") this.state = "half-open";
    try {
      const result = await fn(); this.failures = 0; this.state = "closed"; return result;
    } catch (error) {
      if (++this.failures >= this.threshold) {
        this.state = "open"; this.nextAttempt = Date.now() + this.resetMs;
        logger.error("Circuit breaker opened", { failures: this.failures });
      }
      throw error;
    }
  }
}
// const breaker = new CircuitBreaker(5, 30000); await breaker.execute(() => sendEmail(payload));
```

### Dead Letter Queue

```typescript
export async function sendWithDeadLetter(payload: EmailPayload, fn: (p: EmailPayload) => Promise<void>) {
  try { await withRetry(() => fn(payload), { maxAttempts: 3 }); } catch (error) {
    await db.deadLetter.create({
      data: { service: "email", payload: JSON.stringify(payload),
        lastError: error instanceof Error ? error.message : String(error), status: "PENDING_REVIEW" },
    });
    logger.error("Moved to dead letter queue", { service: "email" });
  }
}
```
