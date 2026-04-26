export default function AppLoading() {
  return (
    <div className="flex h-full">
      {/* Left Panel skeleton (desktop) */}
      <div className="hidden lg:flex w-[300px] border-r border-border bg-card flex-col flex-shrink-0 p-4 gap-4">
        {/* Agent list items */}
        <div className="h-5 w-24 rounded bg-muted animate-pulse" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-2 rounded-lg">
              <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-20 rounded bg-muted animate-pulse" />
                <div className="h-2 w-14 rounded bg-muted animate-pulse" />
              </div>
            </div>
          ))}
        </div>
        {/* Ops feed skeleton */}
        <div className="border-t border-border pt-4 mt-auto">
          <div className="h-3 w-16 rounded bg-muted animate-pulse mb-3" />
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-2 w-full rounded bg-muted animate-pulse" />
            ))}
          </div>
        </div>
      </div>

      {/* Center panel skeleton */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Header */}
          <div className="space-y-2">
            <div className="h-6 w-48 rounded bg-muted animate-pulse" />
            <div className="h-3 w-72 rounded bg-muted animate-pulse" />
          </div>
          {/* Stats cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
                <div className="h-8 w-8 rounded-lg bg-muted animate-pulse" />
                <div className="h-5 w-16 rounded bg-muted animate-pulse" />
                <div className="h-2 w-24 rounded bg-muted animate-pulse" />
              </div>
            ))}
          </div>
          {/* Content area */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="h-4 w-32 rounded bg-muted animate-pulse" />
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-3 rounded bg-muted animate-pulse" style={{ width: `${85 - i * 10}%` }} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right panel skeleton (desktop) */}
      <div className="hidden lg:flex w-[360px] border-l border-border bg-card flex-col flex-shrink-0">
        {/* Chat tabs */}
        <div className="flex border-b border-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex-1 py-3 text-center">
              <div className="h-2 w-10 rounded bg-muted animate-pulse mx-auto" />
            </div>
          ))}
        </div>
        {/* Chat area */}
        <div className="flex-1 p-4 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-muted animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-2 w-20 rounded bg-muted animate-pulse" />
                <div className="h-16 w-full rounded-lg bg-muted animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
