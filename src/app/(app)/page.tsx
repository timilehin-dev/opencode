"use client";

import { Suspense, lazy } from "react";
import { Skeleton } from "@/components/ui/skeleton";

// Lazy-load the heavy dashboard component
const BentoDashboard = lazy(() =>
  import("@/components/dashboard/bento-dashboard").then((m) => ({
    default: m.default,
  }))
);

// ---------------------------------------------------------------------------
// Loading Skeleton
// ---------------------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <div className="p-4 lg:p-6 space-y-4 lg:space-y-5 animate-pulse max-w-[1600px] mx-auto">
      {/* Welcome banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-1">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-36" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-28 rounded-lg" />
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
      </div>

      {/* Metrics */}
      <Skeleton className="h-24 w-full rounded-xl" />

      {/* Bento grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5">
        {/* Agent crew */}
        <div className="lg:row-span-2 space-y-2">
          <Skeleton className="h-5 w-24" />
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>

        {/* Tasks + Services */}
        <div className="lg:col-span-2 space-y-4 lg:space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-52 rounded-xl" />
            <Skeleton className="h-52 rounded-xl" />
          </div>

          {/* Quick Actions */}
          <div className="space-y-2">
            <Skeleton className="h-5 w-28" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 rounded-lg" />
              ))}
            </div>
          </div>

          {/* Activity */}
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>

      {/* Chat strip */}
      <Skeleton className="h-14 w-full rounded-xl" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <BentoDashboard />
    </Suspense>
  );
}
