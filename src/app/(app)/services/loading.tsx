import { Skeleton } from "@/components/ui/skeleton";

export default function ServicesLoading() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      {/* Header */}
      <div className="mb-6 space-y-1.5">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-3 w-72" />
      </div>

      {/* Service grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-5 rounded-lg bg-white border border-[#e8e5df]">
            <Skeleton className="w-12 h-12 rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-2 w-24" />
            </div>
            <Skeleton className="w-2.5 h-2.5 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
