'use client';

import { MetricsDashboard } from '~/app/_components/metrics/MetricsDashboard';

/**
 * `/w/[workspaceSlug]/metrics` — read-only, cycle-scoped delivery-metrics
 * dashboard. Nav entry is gated to `product`-plugin workspaces, but the route
 * itself is visible to any workspace member; data access is enforced by the
 * `sprintAnalytics.getActiveCycleMetrics` procedure (workspace membership).
 * See ADR-0047.
 */
export default function MetricsPage() {
  return (
    <div className="flex h-full flex-col text-text-primary">
      <MetricsDashboard />
    </div>
  );
}
