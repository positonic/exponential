"use client";

import { Anchor, Container, Group, Skeleton, Text, Title } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { DecisionGraphCanvas } from "~/app/_components/decisions/DecisionGraphCanvas";

/**
 * Decision network graph: ADRs clustered by repo, SUPERSEDES edges solid,
 * detected MENTIONS edges dashed (the same weaker treatment as the detail
 * page's Related section). Click a node to open the decision. Read-only,
 * like the whole Decision Log.
 */
export default function DecisionsGraphPage() {
  const { workspace, workspaceId, isLoading } = useWorkspace();
  const router = useRouter();

  const { data: graph, isLoading: graphLoading } = api.adr.graph.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId },
  );

  if (isLoading || (workspace && graphLoading)) {
    return (
      <Container size="xl" className="py-8">
        <Skeleton height={40} width={240} mb="lg" />
        <Skeleton height={500} />
      </Container>
    );
  }

  if (!workspace) {
    return (
      <Container size="xl" className="py-8">
        <Text className="text-text-secondary">Workspace not found</Text>
      </Container>
    );
  }

  return (
    <Container size="xl" className="py-8">
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

      <Title order={2} mt="md" mb={4}>
        Decision graph
      </Title>
      <Group justify="space-between" align="center" mb="lg" wrap="wrap">
        <Text size="sm" className="text-text-secondary">
          The decision network across enrolled repos. Click a decision to open
          it.
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
            router.push(`/w/${workspace.slug}/decisions/${adrId}`)
          }
        />
      )}
    </Container>
  );
}
