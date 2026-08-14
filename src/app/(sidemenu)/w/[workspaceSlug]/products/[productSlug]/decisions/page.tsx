"use client";

import { Container, Skeleton, Text, Title } from "@mantine/core";
import { useParams } from "next/navigation";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { DecisionsIndex } from "~/app/_components/decisions/DecisionsIndex";

/**
 * Product Decisions lens: the workspace Decision Log pre-filtered to this
 * product's repos, PLUS workspace-level (null-product) ADRs rendered with a
 * "workspace-wide" marker — a workspace-global decision applies to every
 * product until proven otherwise.
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
      <Title order={2} mb={4}>
        Decisions
      </Title>
      <Text size="sm" className="text-text-secondary" mb="lg">
        Architectural decisions from {product.name}&apos;s repositories, plus
        workspace-wide decisions. Read-only — git is the source of truth.
      </Text>
      <DecisionsIndex
        workspaceId={workspaceId}
        workspaceSlug={workspace.slug}
        lockedProductId={product.id}
      />
    </Container>
  );
}
