"use client";

import { ServiceChips } from "@/components/dashboard/service-chips";
import { MetricsRow } from "@/components/dashboard/metrics-row";
import { CoordinationMap } from "@/components/dashboard/coordination-map";
import { ActiveTasks } from "@/components/dashboard/active-tasks";
import type { ServiceStatus } from "@/lib/types";
import type { DashboardMetricsView, TodoView, DelegationView, AgentTaskView, AgentStatusView } from "@/hooks/use-dashboard-stream";

interface MissionControlProps {
  serviceStatus: ServiceStatus | null;
  metrics?: DashboardMetricsView | null;
  agentStatuses?: AgentStatusView[];
  todos?: TodoView[];
  delegations?: DelegationView[];
  tasks?: AgentTaskView[];
}

export function MissionControl({ serviceStatus, metrics, agentStatuses, todos, delegations, tasks: _tasks }: MissionControlProps) {
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

      {/* Split: Coordination Map + Active Tasks — 2-col desktop, stack mobile */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="min-h-[340px] max-h-[440px]">
          <CoordinationMap delegations={delegations || []} />
        </div>
        <div className="min-h-[340px] max-h-[440px]">
          <ActiveTasks todos={todos} />
        </div>
      </section>
    </div>
  );
}
