"use client";

import { AutomationsView } from "@/components/dashboard/automations-view";

export default function WorkflowsPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      <AutomationsView onNavigate={() => {}} />
    </div>
  );
}
