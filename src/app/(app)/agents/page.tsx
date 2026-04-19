"use client";

import { AgentsView } from "@/components/dashboard/agents-view";

export default function AgentsPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      <AgentsView onNavigate={() => {}} />
    </div>
  );
}
