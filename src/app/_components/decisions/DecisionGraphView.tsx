"use client";

import { Group, Skeleton, Text } from "@mantine/core";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import { DecisionGraphCanvas } from "~/app/_components/decisions/DecisionGraphCanvas";

/**
 * The decision network graph body (description + legend + canvas), shared
 * between the workspace graph page (/w/[slug]/decisions/graph) and the product
 * graph lens (/w/[slug]/products/[productSlug]/decisions/graph). SUPERSEDES
 * edges solid, detected MENTIONS edges dashed — the same weaker treatment as
 * the detail page's Related section. Click a node to open the decision.
 * Read-only, like the whole Decision Log.
 *
 * With `productId` (+ `includeWorkspaceWide`) the graph is scoped the same way
 * the index's product filter scopes the table.
 */
interface DecisionGraphViewProps {
  workspaceId: string;
  workspaceSlug: string;
  description: string;
  /** Scope to one product's repos. */
  productId?: string;
  /** With productId: also include workspace-level (null-product) repos. */
  includeWorkspaceWide?: boolean;
}

export function DecisionGraphView({
  workspaceId,
  workspaceSlug,
  description,
  productId,
  includeWorkspaceWide,
}: DecisionGraphViewProps) {
  const router = useRouter();

  const { data: graph, isLoading } = api.adr.graph.useQuery(
    { workspaceId, productId, includeWorkspaceWide },
    { enabled: !!workspaceId },
  );

  if (isLoading) {
    return <Skeleton height={500} />;
  }

  return (
    <>
      <Group justify="space-between" align="center" mb="lg" wrap="wrap">
        <Text size="sm" className="text-text-secondary">
          {description}
        </Text>
        <Group gap="lg">
          <Group gap={6} wrap="nowrap">
            <span
              aria-hidden
              className="inline-block h-0 w-8 border-t-2 border-solid border-brand-info"
            />
            <Text size="xs" className="text-text-muted">
              supersedes
            </Text>
          </Group>
          <Group gap={6} wrap="nowrap">
            <span
              aria-hidden
              className="inline-block h-0 w-8 border-t-2 border-dashed border-border-primary"
            />
            <Text size="xs" className="text-text-muted">
              mentions (detected)
            </Text>
          </Group>
        </Group>
      </Group>

      {!graph || graph.nodes.length === 0 ? (
        <Text className="text-text-secondary">
          No decisions synced yet — nothing to draw.
        </Text>
      ) : (
        <DecisionGraphCanvas
          repos={graph.repos}
          nodes={graph.nodes}
          edges={graph.edges}
          onNodeClick={(adrId) =>
            router.push(`/w/${workspaceSlug}/decisions/${adrId}`)
          }
        />
      )}
    </>
  );
}
