import { Skeleton } from "@/components/ui/skeleton";

export default function AnalyticsLoading() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <Skeleton className="w-5 h-5" />
            <Skeleton className="h-6 w-28" />
          </div>
          <Skeleton className="h-3 w-72 ml-8" />
        </div>
        <div className="flex items-center gap-2 ml-8 sm:ml-0">
          <Skeleton className="h-8 w-32 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-16 rounded-md" />
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[#e8e5df] bg-white p-4 space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-4 w-10 rounded-full" />
            </div>
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-2 w-24" />
          </div>
        ))}
      </div>

      {/* Bar chart card */}
      <div className="rounded-xl border border-[#e8e5df] bg-white p-6 mb-6 space-y-3">
        <Skeleton className="h-4 w-48" />
        <div className="flex items-end gap-1 h-44">
          {[60, 80, 45, 90, 55, 70, 85].map((h, i) => (
            <div key={i} className="flex-1" style={{ height: `${h}%` }}>
              <Skeleton className="w-full h-full rounded-t" />
            </div>
          ))}
        </div>
      </div>

      {/* Two column cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="rounded-xl border border-[#e8e5df] bg-white p-6 space-y-3">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-2 w-48" />
          <div className="grid grid-cols-6 sm:grid-cols-8 lg:grid-cols-12 gap-1.5">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-md" />
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-[#e8e5df] bg-white p-6 space-y-3">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-2 w-52" />
          <div className="flex items-center gap-6">
            <Skeleton className="w-40 h-40 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Skeleton className="w-3 h-3 rounded-sm" />
                  <Skeleton className="h-2 flex-1" />
                  <Skeleton className="h-2 w-6" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Agent table skeleton */}
      <div className="rounded-xl border border-[#e8e5df] bg-white p-6 space-y-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-2 w-56" />
        <div className="space-y-3 pt-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-2">
              <Skeleton className="w-2 h-2 rounded-full" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-12 ml-auto" />
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3 w-10" />
              <Skeleton className="w-24 h-8" />
              <Skeleton className="h-4 w-12 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
