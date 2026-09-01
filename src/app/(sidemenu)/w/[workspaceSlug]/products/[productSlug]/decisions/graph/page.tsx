"use client";

import { Anchor, Container, Group, Skeleton, Text, Title } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { DecisionGraphView } from "~/app/_components/decisions/DecisionGraphView";

/**
 * Product decision graph lens: the workspace decision network scoped to this
 * product's repos PLUS workspace-level (null-product) repos — the same scope
 * as the product Decisions index. Graph body shared via DecisionGraphView.
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
    <Container size="xl" className="py-8">
      <Anchor
        component={Link}
        href={`/w/${workspace.slug}/products/${productSlug}/decisions`}
        size="sm"
        className="text-text-secondary"
      >
        <Group gap={4} wrap="nowrap">
          <IconArrowLeft size={14} />
          All decisions
        </Group>
      </Anchor>

      <Title order={2} mt="md" mb={4}>
        Decision graph
      </Title>
      <DecisionGraphView
        workspaceId={workspaceId}
        workspaceSlug={workspace.slug}
        productId={product.id}
        includeWorkspaceWide
        description={`The decision network across ${product.name}'s repositories, plus workspace-wide decisions. Click a decision to open it.`}
      />
    </Container>
  );
}
