"use client";

import { MemoryView } from "@/components/dashboard/memory-view";

export default function MemoryPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      <MemoryView onNavigate={() => {}} />
    </div>
  );
}
