"use client";

import { Anchor, Container, Group, Skeleton, Text } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AdrDetail } from "~/app/_components/decisions/AdrDetail";
import { useWorkspace } from "~/providers/WorkspaceProvider";

/**
 * ADR detail page. The read-only content lives in AdrDetail, shared with the
 * Decision Log's peek drawer.
 */
export default function DecisionDetailPage() {
  const { workspace, isLoading } = useWorkspace();
  const params = useParams<{ adrId: string; workspaceSlug: string }>();
  const adrId = params?.adrId ?? "";

  if (isLoading) {
    return (
      <Container size="md" className="py-8">
        <Skeleton height={40} width={280} mb="lg" />
        <Skeleton height={400} />
      </Container>
    );
  }

  if (!workspace) {
    return (
      <Container size="md" className="py-8">
        <Text className="text-text-secondary">Workspace not found</Text>
      </Container>
    );
  }

  return (
    <Container size="md" className="py-8">
      <Anchor
        component={Link}
        href={`/w/${workspace.slug}/decisions`}
        size="sm"
        className="text-text-secondary"
      >
        <Group gap={4} wrap="nowrap">
          <IconArrowLeft size={14} />
          All decisions
        </Group>
      </Anchor>
      <AdrDetail workspaceId={workspace.id} workspaceSlug={workspace.slug} adrId={adrId} />
    </Container>
  );
}
