import { Skeleton } from "@/components/ui/skeleton";

export default function MemoryLoading() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <Skeleton className="w-5 h-5" />
            <Skeleton className="h-6 w-44" />
          </div>
          <Skeleton className="h-3 w-72 ml-8" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-20 rounded-md" />
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[#e8e5df] bg-white p-3 space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-5 w-10" />
          </div>
        ))}
      </div>

      {/* Search + filters card */}
      <div className="rounded-xl border border-[#e8e5df] bg-white p-4 mb-6 space-y-3">
        <Skeleton className="h-9 w-full rounded-lg" />
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-16 rounded-md" />
          ))}
        </div>
      </div>

      {/* Memory list */}
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[#e8e5df] bg-white p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="w-5 h-5 rounded-full" />
              <Skeleton className="h-4 w-16 rounded-full" />
              <Skeleton className="h-4 w-14 rounded-full" />
              <Skeleton className="h-2 w-16 ml-auto" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-2 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}
