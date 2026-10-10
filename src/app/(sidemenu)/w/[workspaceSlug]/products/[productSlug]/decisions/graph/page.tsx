"use client";

import { Container, Skeleton, Text } from "@mantine/core";
import { useParams } from "next/navigation";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { DecisionGraphView } from "~/app/_components/decisions/DecisionGraphView";

/**
 * Product decision graph lens: the workspace decision network scoped to this
 * product's repos PLUS workspace-level (null-product) repos — the same scope
 * as the product Decisions index. Graph shared via DecisionGraphView; the
 * shell height accounts for the product header and tab strip above.
 */
export default function ProductDecisionsGraphPage() {
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
        <Skeleton height={500} />
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
    <DecisionGraphView
      workspaceId={workspaceId}
      workspaceSlug={workspace.slug}
      backHref={`/w/${workspace.slug}/products/${productSlug}/decisions`}
      description={`${product.name}'s repos plus workspace-wide. Click a decision to open it.`}
      heightClassName="h-[calc(100dvh-300px)]"
      productId={product.id}
      includeWorkspaceWide
    />
  );
}
