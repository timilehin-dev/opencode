"use client";

import { ServiceChips } from "@/components/dashboard/service-chips";
import { MetricsRow } from "@/components/dashboard/metrics-row";
import type { ServiceStatus } from "@/lib/types";
import type { DashboardMetricsView, AgentStatusView } from "@/hooks/use-dashboard-stream";

interface MissionControlProps {
  serviceStatus: ServiceStatus | null;
  metrics?: DashboardMetricsView | null;
  agentStatuses?: AgentStatusView[];
}

/**
 * @deprecated MissionControl is no longer used by the dashboard page.
 * The dashboard now imports ServiceChips and MetricsRow directly.
 * This component is kept for backward compatibility only.
 */
export function MissionControl({ serviceStatus, metrics, agentStatuses }: MissionControlProps) {
  return (
    <div className="flex flex-col gap-5">
      {/* Connected Services Row */}
      <section>
        <ServiceChips serviceStatus={serviceStatus} />
      </section>

      {/* Metrics */}
      <section>
        <MetricsRow metrics={metrics} agentStatuses={agentStatuses} />
      </section>
    </div>
  );
}
