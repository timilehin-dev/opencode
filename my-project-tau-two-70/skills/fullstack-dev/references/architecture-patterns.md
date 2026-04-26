# Architecture Patterns for Next.js Applications

Practical patterns for Next.js 14+ (App Router) with TypeScript, Prisma, and Tailwind CSS.

---

## 1. Feature-First Architecture

### When to Use / When NOT to Use
- **Use:** Medium-to-large apps with distinct domains, teams owning features end-to-end
- **Avoid:** Tiny prototypes, highly interconnected domains, solo devs on simple CRUD

### Directory Structure

```
src/
├── app/                        # Next.js App Router (thin orchestration)
│   ├── (auth)/login/page.tsx
│   └── api/projects/route.ts
├── features/
│   ├── auth/
│   │   ├── components/          # LoginForm, RegisterForm
│   │   ├── actions/             # Server Actions
│   │   ├── hooks/               # useAuth
│   │   ├── schemas/             # Zod validation
│   │   └── index.ts             # Public barrel export
│   └── projects/
│       ├── components/
│       ├── actions/
│       └── index.ts
├── shared/                     # Shared kernel
│   ├── components/ui/          # shadcn/ui primitives
│   ├── lib/db.ts               # Prisma singleton
│   └── config/
└── middleware.ts
```

### Feature Module Composition

```typescript
// features/projects/index.ts
export { ProjectList } from "./components/ProjectList";
export { useProjects } from "./hooks/useProjects";
export { createProject, deleteProject } from "./actions/project.actions";
export { projectSchema } from "./schemas/project.schema";
export type { Project, CreateProjectInput } from "./types";
```

### Trade-offs
| Pro | Con |
|-----|-----|
| High feature cohesion, easy to navigate | "shared" can become a dumping ground |
| Clear ownership boundaries | Circular dependency risk |

---

## 2. Clean Architecture

### When to Use / When NOT to Use
- **Use:** Complex domains with many rules (fintech, healthcare), framework-agnostic core needed
- **Avoid:** Simple CRUD, small teams without capacity for layers

### Layers (dependency flows inward only)

```
Presentation (pages, UI)    → depends on Application
Application (use cases)     → depends on Domain
Infrastructure (Prisma, S3) → implements Domain interfaces
Domain (entities, rules)    → zero dependencies
```

### Practical Next.js Mapping

```typescript
// domain/entities/project.ts
export class Project {
  constructor(
    public readonly id: string, public readonly name: string,
    public readonly ownerId: string, public readonly status: ProjectStatus,
  ) {}
  canBeDeletedBy(userId: string): boolean {
    return this.ownerId === userId && this.status !== ProjectStatus.ARCHIVED;
  }
}

// application/use-cases/create-project.ts
export class CreateProjectUseCase {
  constructor(private readonly repo: ProjectRepository) {}
  async execute(input: CreateProjectInput): Promise<Project> {
    const existing = await this.repo.findByName(input.name, input.ownerId);
    if (existing) throw new DomainError("Project name already exists");
    return this.repo.save(Project.create(input.name, input.ownerId));
  }
}

// infrastructure/repositories/prisma-project-repository.ts
export class PrismaProjectRepository implements ProjectRepository {
  async save(project: Project) {
    return db.project.create({ data: { id: project.id, name: project.name, ownerId: project.ownerId } });
  }
}

// app/api/projects/route.ts — composition root
const repo = new PrismaProjectRepository();
const useCase = new CreateProjectUseCase(repo);
export async function POST(req: Request) {
  const project = await useCase.execute(await req.json());
  return Response.json(project, { status: 201 });
}
```

### Trade-offs
| Pro | Con |
|-----|-----|
| Testable domain in isolation | More boilerplate |
| Framework-agnostic core | Over-engineered for CRUD |
| Clear parallel dev boundaries | Steeper learning curve |

---

## 3. Micro-Frontend Considerations

### When to Split / When NOT to Split
- **Split:** Independent teams, separate release cycles, different tech stacks needed
- **Don't:** Under 10 devs, shared complex state, added latency outweighs benefits

### Module Federation

```typescript
// next.config.ts
import NextFederationPlugin from "@module-federation/nextjs-mf";
export default {
  plugins: [NextFederationPlugin({
    name: "host",
    remotes: { dashboard: "dashboard@http://localhost:3001/remoteEntry.js" },
    shared: { react: { singleton: true, eager: true }, "@tanstack/react-query": { singleton: true } },
  })],
};
```

### Shared State Boundaries
```typescript
// Use URL as integration boundary — prop drilling, not shared state
import { useQueryStates } from "nuqs";
function HostShell() {
  const [filters] = useQueryStates({ projectId: parseAsString });
  return <div><Dashboard projectId={filters.projectId} /><AdminPanel /></div>;
}
```

### Trade-offs
| Pro | Con |
|-----|-----|
| Independent deployments | Complex build config |
| Scalable org structure | Version skew runtime errors |

---

## 4. Server vs Client Components

### Decision Matrix

| Scenario | Type | Why |
|----------|------|-----|
| Static markup | Server | Zero JS shipped |
| Data fetching (no interaction) | Server | Direct DB access |
| Form with validation | Client (`"use client"`) | State, event handlers |
| Browser APIs (localStorage) | Client | DOM-only APIs |
| Heavy server transforms | Server | Runs once, streams |
| Real-time / WebSocket | Client | Subscription lifecycle |
| Third-party JS library | Client | DOM access required |

### Data Fetching Patterns

```typescript
// Server Component — async data fetching with Suspense
async function ProjectsData() {
  const projects = await db.project.findMany({ orderBy: { createdAt: "desc" } });
  return <ProjectList projects={projects} />;
}
export default function Page() {
  return <Suspense fallback={<Skeleton />}><ProjectsData /></Suspense>;
}

// Client Component — optimistic mutation with Server Action
"use client";
export function ProjectList({ projects }: { projects: Project[] }) {
  const [optimistic, setOptimistic] = useOptimistic(projects);
  const [isPending, startTransition] = useTransition();
  const handleDelete = (id: string) => startTransition(async () => {
    setOptimistic((prev) => prev.filter((p) => p.id !== id));
    await deleteProject(id);
  });
  return <ul>{optimistic.map(p => <li key={p.id}>{p.name}</li>)}</ul>;
}

// Streaming SSR — independent Suspense boundaries
export default function Dashboard() {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Suspense fallback={<Skeleton />}><RevenueChart /></Suspense>
      <Suspense fallback={<Skeleton />}><RecentActivity /></Suspense>
    </div>
  );
}
```

---

## 5. API Design: REST vs tRPC vs Server Actions

| Factor | REST (route.ts) | tRPC | Server Actions |
|--------|----------------|------|----------------|
| External consumers | ✅ | ❌ | ❌ |
| End-to-end type safety | ⚠️ Manual | ✅ Auto | ✅ Auto |
| File uploads | ✅ Native | ⚠️ Adapter | ⚠️ Use route.ts |
| Simple form mutations | ⚠️ Boilerplate | ⚠️ Overhead | ✅ Most ergonomic |
| Webhook receivers | ✅ Native | ❌ | ❌ |

**REST:** Public APIs, webhooks, file uploads, external clients.
**tRPC:** Typed internal APIs, real-time, formal contracts.
**Server Actions:** Form submissions, simple mutations, progressive enhancement.

```typescript
// Shared error envelope
interface ApiError {
  code: string;       // "VALIDATION_ERROR", "NOT_FOUND"
  message: string;
  details?: unknown;
  requestId?: string;
}
```

---

## 6. State Management Strategy

### Four Categories

```typescript
// 1. SERVER STATE — TanStack Query
function useProjects(filters: ProjectFilters) {
  return useQuery({
    queryKey: ["projects", filters],
    queryFn: () => fetch("/api/projects?" + new URLSearchParams(filters)).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });
}

// 2. CLIENT STATE — Zustand (global), useState (local)
export const useSidebarStore = create<SidebarStore>((set) => ({
  isOpen: true,
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
}));

// 3. FORM STATE — React Hook Form + Zod
const { register, handleSubmit, formState: { errors } } = useForm({
  resolver: zodResolver(createProjectSchema),
});

// 4. URL STATE — nuqs
const [filters] = useQueryStates({
  search: parseAsString.withDefault(""),
  page: parseAsInteger.withDefault(1),
});
```

| State Type | Tool | Example |
|-----------|------|---------|
| Server data (read) | TanStack Query | Project lists |
| Server data (write) | Server Actions + revalidatePath | Create/delete |
| Global UI | Zustand | Sidebar, theme |
| Form values | React Hook Form + Zod | Any form |
| URL-synced | nuqs | Filters, tabs, pagination |

| Tool | Pro | Con |
|------|-----|-----|
| TanStack Query | Cache, refetch, dedup | Bundle size |
| Zustand | Minimal boilerplate | Can be overused |
| React Hook Form | Performant, great DX | Schema duplication risk |
| nuqs | Shareable URLs | Not for nested state |

---

## 7. Authentication Patterns

### NextAuth.js v5 Setup

```typescript
// auth.ts
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({ clientId: process.env.GITHUB_ID!, clientSecret: process.env.GITHUB_SECRET! }),
    Credentials({
      async authorize(credentials) {
        const user = await db.user.findUnique({ where: { email: credentials.email as string } });
        if (!user || !(await verifyPassword(credentials.password as string, user.passwordHash))) return null;
        return { id: user.id, email: user.email, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) { if (user) { token.role = user.role; token.id = user.id; } return token; },
    async session({ session, token }) { session.user.role = token.role; session.user.id = token.id; return session; },
  },
});
```

### Middleware-Based Auth + Role-Based Access

```typescript
// middleware.ts
export default auth((req) => {
  const isLoggedIn = !!req.auth;
  if (req.nextUrl.pathname.startsWith("/dashboard") && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (req.nextUrl.pathname.startsWith("/admin") && req.auth?.user?.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }
  return NextResponse.next();
});
export const config = { matcher: ["/dashboard/:path*", "/admin/:path*"] };

// Server Component — direct session check
export default async function AdminPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/unauthorized");
  return <AdminDashboard />;
}
```

| Approach | Pro | Con |
|----------|-----|-----|
| NextAuth v5 | Built-in sessions, multiple providers | Less control over token format |
| Middleware | Pre-render catch, no flash | Edge Runtime limitations |

---

## 8. Database Patterns

### Prisma Singleton

```typescript
// shared/lib/db.ts
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const db = globalForPrisma.prisma || new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"],
});
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
```

### Schema Design

```prisma
model User {
  id           String    @id @default(cuid())
  email        String    @unique
  role         Role      @default(USER)
  passwordHash String?   // null = OAuth user
  projects     Project[] @relation("Owner")
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  @@index([email])
  @@map("users")
}

model Project {
  id      String  @id @default(cuid())
  name    String
  status  Status  @default(ACTIVE)
  ownerId String
  owner   User    @relation("Owner", fields: [ownerId], references: [id])
  @@index([ownerId, status])
  @@map("projects")
}
enum Role { USER, ADMIN }
enum Status { ACTIVE, ARCHIVED, DELETED }
```

### Migration & Connection Pooling

```bash
npx prisma db push                          # Dev: apply directly
npx prisma migrate dev --name add-status    # Create migration
npx prisma migrate deploy                   # Production: apply
npx prisma generate                         # Regenerate client
```

```prisma
# PgBouncer for serverless
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")        # Pooled: port 6543
  directUrl = env("DIRECT_DATABASE_URL") # Direct: migrations, port 5432
}
```

| Pattern | Pro | Con |
|---------|-----|-----|
| Singleton | Prevents dev connection exhaustion | Not needed in serverless |
| PgBouncer | Survives cold starts | Breaks session features |
| `db push` | Fast dev iteration | No rollback in prod |

---

## Quick Reference

| App Size | Recommended Pattern |
|----------|-------------------|
| Prototype/MVP | Feature-first (flat), Server Actions, useState |
| Small SaaS | Feature-first + Zustand, TanStack Query, NextAuth |
| Medium SaaS | Feature-first + clean arch core, tRPC + Server Actions |
| Enterprise | Full clean architecture, REST API, event-driven |
