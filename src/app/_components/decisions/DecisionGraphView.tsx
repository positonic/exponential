"use client";

import { Anchor, Container, Group, Skeleton, Text, Title } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import { DecisionGraphCanvas } from "~/app/_components/decisions/DecisionGraphCanvas";

/**
 * The full-screen decision network graph (compact header row + canvas filling
 * the remaining viewport), shared between the workspace graph page
 * (/w/[slug]/decisions/graph) and the product graph lens
 * (/w/[slug]/products/[productSlug]/decisions/graph). SUPERSEDES edges solid,
 * detected MENTIONS edges dashed — the same weaker treatment as the detail
 * page's Related section. Click a node to open the decision. Read-only, like
 * the whole Decision Log.
 *
 * With `productId` (+ `includeWorkspaceWide`) the graph is scoped the same way
 * the index's product filter scopes the table. `heightClassName` sizes the
 * shell — the canvas fills it — because each page sits under different chrome
 * (the product lens renders below the product header and tab strip).
 */
interface DecisionGraphViewProps {
  workspaceId: string;
  workspaceSlug: string;
  /** Where the "All decisions" back link points. */
  backHref: string;
  /** Short hint shown beside the title on wider screens. */
  description?: string;
  /** Height of the full-screen shell; the canvas fills whatever this allows. */
  heightClassName?: string;
  /** Scope to one product's repos. */
  productId?: string;
  /** With productId: also include workspace-level (null-product) repos. */
  includeWorkspaceWide?: boolean;
}

export function DecisionGraphView({
  workspaceId,
  workspaceSlug,
  backHref,
  description = "Click a decision to open it.",
  heightClassName = "h-[calc(100dvh-120px)]",
  productId,
  includeWorkspaceWide,
}: DecisionGraphViewProps) {
  const router = useRouter();

  const { data: graph, isLoading } = api.adr.graph.useQuery(
    { workspaceId, productId, includeWorkspaceWide },
    { enabled: !!workspaceId },
  );

  const backLink = (
    <Anchor
      component={Link}
      href={backHref}
      size="sm"
      className="text-text-secondary"
    >
      <Group gap={4} wrap="nowrap">
        <IconArrowLeft size={14} />
        All decisions
      </Group>
    </Anchor>
  );

  if (isLoading) {
    return (
      <Container size="xl" className="py-8">
        <Skeleton height={40} width={240} mb="lg" />
        <Skeleton height={500} />
      </Container>
    );
  }

  if (!graph || graph.nodes.length === 0) {
    return (
      <Container size="xl" className="py-8">
        {backLink}
        <Title order={2} mt="md" mb={4}>
          Decision graph
        </Title>
        <Text className="text-text-secondary">
          No decisions synced yet — nothing to draw.
        </Text>
      </Container>
    );
  }

  return (
    <div
      className={`flex ${heightClassName} flex-col overflow-hidden px-4 pt-4 lg:px-6`}
    >
      <Group justify="space-between" align="center" mb="sm" wrap="wrap">
        <Group gap="md" wrap="nowrap">
          {backLink}
          <Title order={3}>Decision graph</Title>
          <Text size="sm" className="text-text-secondary" visibleFrom="md">
            {description}
          </Text>
        </Group>
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

      <div className="min-h-0 flex-1 pb-4">
        <DecisionGraphCanvas
          repos={graph.repos}
          nodes={graph.nodes}
          edges={graph.edges}
          onNodeClick={(adrId) =>
            router.push(`/w/${workspaceSlug}/decisions/${adrId}`)
          }
        />
      </div>
    </div>
  );
}
