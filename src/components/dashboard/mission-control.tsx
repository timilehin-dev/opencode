"use client";

import { ServiceChips } from "@/components/dashboard/service-chips";
import { MetricsRow } from "@/components/dashboard/metrics-row";
import { CoordinationMap } from "@/components/dashboard/coordination-map";
import { ActiveTasks } from "@/components/dashboard/active-tasks";
import type { ServiceStatus } from "@/lib/types";

interface MissionControlProps {
  serviceStatus: ServiceStatus | null;
}

export function MissionControl({ serviceStatus }: MissionControlProps) {
  return (
    <div className="flex flex-col gap-0">
      {/* Connected Services Row */}
      <ServiceChips serviceStatus={serviceStatus} />

      {/* Metrics */}
      <MetricsRow />

      {/* Split: Coordination Map + Active Tasks — 2-col desktop, stack mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
        <CoordinationMap />
        <ActiveTasks />
      </div>
    </div>
  );
}
