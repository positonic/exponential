"use client";

import { Button, Container, Group, Skeleton, Text, Title } from "@mantine/core";
import { IconAffiliate } from "@tabler/icons-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { DecisionsIndex } from "~/app/_components/decisions/DecisionsIndex";

/**
 * Product Decisions lens: the workspace Decision Log with its product filter
 * pre-set to this product, PLUS workspace-level (null-product) ADRs rendered
 * with a "workspace-wide" marker — a workspace-global decision applies to
 * every product until proven otherwise. All the workspace page's filters
 * (and the graph view) are available here too.
 */
export default function ProductDecisionsPage() {
  const params = useParams();
  const productSlug = params?.productSlug as string;
  const { workspace, workspaceId, isLoading } = useWorkspace();

  const { data: product, isLoading: productLoading } =
    api.product.product.getBySlug.useQuery(
      { workspaceId: workspaceId ?? "", slug: productSlug },
      { enabled: !!workspaceId && !!productSlug },
    );

  if (isLoading || productLoading) {
    return (
      <Container size="xl" className="py-8">
        <Skeleton height={40} width={240} mb="lg" />
        <Skeleton height={300} />
      </Container>
    );
  }

  if (!workspace || !workspaceId || !product) {
    return (
      <Container size="xl" className="py-8">
        <Text className="text-text-secondary">Product not found</Text>
      </Container>
    );
  }

  return (
    <Container size="xl" className="py-8">
      <Group justify="space-between" mb="lg">
        <div>
          <Title order={2}>Decisions</Title>
          <Text size="sm" className="text-text-secondary">
            Architectural decisions from {product.name}&apos;s repositories,
            plus workspace-wide decisions. Read-only — git is the source of
            truth.
          </Text>
        </div>
        <Button
          component={Link}
          href={`/w/${workspace.slug}/products/${productSlug}/decisions/graph`}
          variant="light"
          size="sm"
          leftSection={<IconAffiliate size={16} />}
        >
          Graph
        </Button>
      </Group>
      {/* Keyed by product: the App Router reuses this page component across
          product param changes, and the filter state seeded from
          defaultProductId must reset with the product. */}
      <DecisionsIndex
        key={product.id}
        workspaceId={workspaceId}
        workspaceSlug={workspace.slug}
        defaultProductId={product.id}
      />
    </Container>
  );
}
