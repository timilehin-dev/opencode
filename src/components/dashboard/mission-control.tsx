"use client";

import { ServiceChips } from "@/components/dashboard/service-chips";
import { MetricsRow } from "@/components/dashboard/metrics-row";
import { CoordinationMap } from "@/components/dashboard/coordination-map";
import { ActiveTasks } from "@/components/dashboard/active-tasks";
import type { ServiceStatus } from "@/lib/types";
import type { DashboardMetricsView, TodoView } from "@/hooks/use-dashboard-stream";

interface MissionControlProps {
  serviceStatus: ServiceStatus | null;
  metrics?: DashboardMetricsView | null;
  todos?: TodoView[];
}

export function MissionControl({ serviceStatus, metrics, todos }: MissionControlProps) {
  return (
    <div className="flex flex-col gap-0">
      {/* Connected Services Row */}
      <ServiceChips serviceStatus={serviceStatus} />

      {/* Metrics */}
      <MetricsRow metrics={metrics} />

      {/* Split: Coordination Map + Active Tasks — 2-col desktop, stack mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
        <CoordinationMap />
        <ActiveTasks todos={todos} />
      </div>
    </div>
  );
}
