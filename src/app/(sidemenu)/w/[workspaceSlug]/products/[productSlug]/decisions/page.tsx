"use client";

import { Container, Skeleton, Text } from "@mantine/core";
import { useParams } from "next/navigation";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { DecisionsIndex } from "~/app/_components/decisions/DecisionsIndex";

/**
 * Product Decisions lens: the workspace Decision Log with its product scope
 * pre-set to this product, PLUS workspace-level (null-product) ADRs rendered
 * with a "Workspace-wide" marker — a workspace-global decision applies to
 * every product until proven otherwise. The scope chip stays editable and
 * the product graph is one click away.
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
    // Keyed by product: the App Router reuses this page component across
    // product param changes, and the scope state seeded from
    // defaultProductId must reset with the product.
    <DecisionsIndex
      key={product.id}
      workspaceId={workspaceId}
      workspaceSlug={workspace.slug}
      defaultProductId={product.id}
      graphHref={`/w/${workspace.slug}/products/${productSlug}/decisions/graph`}
      description={
        <>
          Architectural decisions across {product.name}&apos;s repositories.
          Read-only — <code>git</code> is the source of truth.
        </>
      }
    />
  );
}
