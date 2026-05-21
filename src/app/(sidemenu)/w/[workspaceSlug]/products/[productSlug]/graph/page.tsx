"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Group, Skeleton, Stack, Switch } from "@mantine/core";
import { IconAffiliate } from "@tabler/icons-react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { EmptyState } from "~/app/_components/EmptyState";
import {
  DependencyGraphCanvas,
  type GraphNodeClick,
} from "~/app/_components/product/graph/DependencyGraphCanvas";
import { TicketDrawer } from "~/app/_components/product/graph/TicketDrawer";

export default function ProductGraphPage() {
  const params = useParams();
  const router = useRouter();
  const productSlug = params.productSlug as string;
  const { workspace, workspaceId } = useWorkspace();
  const [showCompleted, setShowCompleted] = useState(false);
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
        <Switch
          label="Show completed"
          checked={showCompleted}
          onChange={(event) => setShowCompleted(event.currentTarget.checked)}
        />
      </Group>
      {hasTickets ? (
        <DependencyGraphCanvas
          tickets={graph!.tickets}
          features={graph!.features}
          objectives={graph!.objectives}
          blockingEdges={graph!.blockingEdges}
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
