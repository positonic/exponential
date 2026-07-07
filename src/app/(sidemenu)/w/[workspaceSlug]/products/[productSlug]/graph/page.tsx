"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Group, Select, Skeleton, Stack, Switch } from "@mantine/core";
import { IconAffiliate } from "@tabler/icons-react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { EmptyState } from "~/app/_components/EmptyState";
import {
  DependencyGraphCanvas,
  type GraphNodeClick,
} from "~/app/_components/product/graph/DependencyGraphCanvas";
import { TicketDrawer } from "~/app/_components/product/graph/TicketDrawer";
import {
  applyCycleFilter,
  deriveCycleOptions,
  hasUncycledTickets,
  CYCLE_FILTER_ALL,
  CYCLE_FILTER_NONE,
  type CycleFilterValue,
} from "~/app/_components/product/graph/cycleFilter";

export default function ProductGraphPage() {
  const params = useParams();
  const router = useRouter();
  const productSlug = params.productSlug as string;
  const { workspace, workspaceId } = useWorkspace();
  const [showCompleted, setShowCompleted] = useState(false);
  const [cycleFilter, setCycleFilter] =
    useState<CycleFilterValue>(CYCLE_FILTER_ALL);
  const [drawerTicketId, setDrawerTicketId] = useState<string | null>(null);

  const { data: product, isLoading: isProductLoading } =
    api.product.product.getBySlug.useQuery(
      { workspaceId: workspaceId ?? "", slug: productSlug },
      { enabled: !!workspaceId && !!productSlug },
    );

  const { data: graph, isLoading: isGraphLoading } =
    api.product.product.getDependencyGraph.useQuery(
      { productId: product?.id ?? "", includeCompleted: showCompleted },
      { enabled: !!product?.id },
    );

  const allTickets = graph?.tickets;
  const allEdges = graph?.blockingEdges;
  const allFeatures = graph?.features;

  const cycleOptions = useMemo(
    () => deriveCycleOptions(allTickets ?? []),
    [allTickets],
  );
  const showNoCycleOption = useMemo(
    () => hasUncycledTickets(allTickets ?? []),
    [allTickets],
  );
  // Fall back to "All" when the selected cycle drops out of the data
  // (e.g. after toggling "Show completed").
  const effectiveFilter =
    cycleFilter === CYCLE_FILTER_ALL ||
    (cycleFilter === CYCLE_FILTER_NONE && showNoCycleOption) ||
    cycleOptions.some((c) => c.id === cycleFilter)
      ? cycleFilter
      : CYCLE_FILTER_ALL;

  const { tickets: visibleTickets, dimmedTicketIds } = useMemo(
    () => applyCycleFilter(allTickets ?? [], allEdges ?? [], effectiveFilter),
    [allTickets, allEdges, effectiveFilter],
  );

  // Features stay visible only while an in-cycle (non-dimmed) ticket needs
  // them; blocking edges only when both endpoints are drawn.
  const visibleFeatures = useMemo(() => {
    if (effectiveFilter === CYCLE_FILTER_ALL) return allFeatures ?? [];
    const neededFeatureIds = new Set(
      visibleTickets
        .filter((t) => !dimmedTicketIds.has(t.id) && t.featureId)
        .map((t) => t.featureId),
    );
    return (allFeatures ?? []).filter((f) => neededFeatureIds.has(f.id));
  }, [allFeatures, visibleTickets, dimmedTicketIds, effectiveFilter]);

  const visibleEdges = useMemo(() => {
    const ids = new Set(visibleTickets.map((t) => t.id));
    return (allEdges ?? []).filter(
      (e) => ids.has(e.fromTicketId) && ids.has(e.toTicketId),
    );
  }, [allEdges, visibleTickets]);

  if (!workspace) return null;

  const basePath = `/w/${workspace.slug}/products/${productSlug}`;

  const handleNodeClick = (event: GraphNodeClick) => {
    switch (event.kind) {
      case "ticket":
        setDrawerTicketId(event.ticketId);
        return;
      case "feature":
        router.push(`${basePath}/features/${event.featureId}`);
        return;
      case "objective":
        router.push(`/w/${workspace.slug}/goals/${event.goalId}`);
        return;
      case "unaligned":
        // No-op — the Unaligned container is a grouping visual, not navigable.
        return;
    }
  };

  if (isProductLoading || (product && isGraphLoading && !graph)) {
    return (
      <Stack gap="md">
        <Skeleton height={32} width={220} />
        <Skeleton height={600} />
      </Stack>
    );
  }

  if (!product) {
    return (
      <EmptyState
        icon={IconAffiliate}
        title="Product not found"
        message="We couldn't find this product."
      />
    );
  }

  const hasTickets = (graph?.tickets.length ?? 0) > 0;

  return (
    <Stack gap="md">
      <Group justify="flex-end">
        {cycleOptions.length > 0 && (
          <Select
            aria-label="Filter by cycle"
            size="sm"
            w={200}
            allowDeselect={false}
            value={effectiveFilter}
            onChange={(value) => setCycleFilter(value ?? CYCLE_FILTER_ALL)}
            data={[
              { value: CYCLE_FILTER_ALL, label: "All cycles" },
              ...cycleOptions.map((c) => ({ value: c.id, label: c.name })),
              ...(showNoCycleOption
                ? [{ value: CYCLE_FILTER_NONE, label: "No cycle" }]
                : []),
            ]}
          />
        )}
        <Switch
          label="Show completed"
          checked={showCompleted}
          onChange={(event) => setShowCompleted(event.currentTarget.checked)}
        />
      </Group>
      {hasTickets ? (
        <DependencyGraphCanvas
          tickets={visibleTickets}
          features={visibleFeatures}
          objectives={graph!.objectives}
          blockingEdges={visibleEdges}
          dimmedTicketIds={dimmedTicketIds}
          onNodeClick={handleNodeClick}
        />
      ) : (
        <EmptyState
          icon={IconAffiliate}
          title="No dependencies yet"
          message="Add tickets in the Backlog tab and link them with Depends on / Required for to see the dependency graph here."
        />
      )}
      <TicketDrawer
        ticketId={drawerTicketId}
        basePath={basePath}
        onClose={() => setDrawerTicketId(null)}
      />
    </Stack>
  );
}
