"use client";

import { Anchor, Container, Group, Skeleton, Text } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DecisionDetail } from "~/app/_components/decisions/DecisionDetail";
import { useWorkspace } from "~/providers/WorkspaceProvider";

/**
 * Decision detail page (ADR-0060). The content lives in DecisionDetail,
 * shared with the Decision Log's peek drawer. Sits beside the read-only ADR
 * page at `/decisions/[adrId]`.
 */
export default function DecisionPage() {
  const { workspace, isLoading } = useWorkspace();
  const params = useParams<{ decisionId: string; workspaceSlug: string }>();
  const decisionId = params?.decisionId ?? "";

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
      <DecisionDetail
        workspaceId={workspace.id}
        workspaceSlug={workspace.slug}
        decisionId={decisionId}
      />
    </Container>
  );
}
