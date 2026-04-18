import { Skeleton } from "@/components/ui/skeleton";

export default function AgentsLoading() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      {/* Header */}
      <div className="mb-6 space-y-1.5">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-3 w-64" />
      </div>

      {/* Search bar */}
      <div className="mb-6">
        <Skeleton className="h-10 w-full max-w-md rounded-lg" />
      </div>

      {/* Agent grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[#e8e5df] bg-white p-5 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="w-12 h-12 rounded-xl" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-2 w-36" />
              </div>
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-2 w-3/4" />
            <div className="flex items-center gap-2 pt-2">
              <Skeleton className="h-2 w-16" />
              <Skeleton className="h-2 w-14" />
              <Skeleton className="h-2 w-20" />
            </div>
            <div className="flex gap-2 pt-1">
              <Skeleton className="h-7 w-20 rounded-md" />
              <Skeleton className="h-7 w-16 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
