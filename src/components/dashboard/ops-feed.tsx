"use client";

const MOCK_OPS = [
  {
    id: 1,
    dot: "bg-emerald-500",
    html: '<strong>Claw General</strong> → routed email review to <strong>Mail Agent</strong>',
    time: "20:55:01",
  },
  {
    id: 2,
    dot: "bg-blue-500",
    html: '<strong>Mail Agent</strong> processing 5 unread emails via gmail_search',
    time: "20:55:12",
  },
  {
    id: 3,
    dot: "bg-purple-500",
    html: '<strong>Research Agent</strong> deep research: SaaS market analysis Q2 2026',
    time: "20:55:18",
  },
  {
    id: 4,
    dot: "bg-emerald-500",
    html: '<strong>Claw General</strong> created todo: Follow up on client contract',
    time: "20:55:30",
  },
  {
    id: 5,
    dot: "bg-blue-500",
    html: '<strong>Creative Agent</strong> generating presentation draft in Google Docs',
    time: "20:55:42",
  },
  {
    id: 6,
    dot: "bg-orange-500",
    html: '<strong>Ops Agent</strong> health check: all services operational',
    time: "20:56:01",
  },
  {
    id: 7,
    dot: "bg-purple-500",
    html: '<strong>Code Agent</strong> merged PR #42 → triggering Vercel deploy',
    time: "20:56:15",
  },
  {
    id: 8,
    dot: "bg-amber-500",
    html: '<strong>Data Agent</strong> completed Q2 revenue analysis from Sheets',
    time: "20:56:30",
  },
];

export function OpsFeed() {
  return (
    <div className="flex-1 border-t border-white/[0.06] flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-[18px] py-4 pb-1">
        <span className="text-[12px] font-bold uppercase tracking-[1px] text-zinc-600">
          Live Operations
        </span>
        <span className="text-[10px] text-emerald-400 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Live
        </span>
      </div>

      {/* Feed */}
      <div className="flex-1 px-[18px] pb-2 overflow-y-auto custom-scrollbar">
        {MOCK_OPS.map((op) => (
          <div
            key={op.id}
            className="flex items-start gap-2 py-2 border-b border-white/[0.03] last:border-b-0"
          >
            <div
              className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${op.dot}`}
            />
            <div className="min-w-0">
              <div
                className="text-[11.5px] text-zinc-400 leading-relaxed [&_strong]:text-zinc-200 [&_strong]:font-semibold"
                dangerouslySetInnerHTML={{ __html: op.html }}
              />
              <div className="text-[10px] text-zinc-700 mt-0.5">{op.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
