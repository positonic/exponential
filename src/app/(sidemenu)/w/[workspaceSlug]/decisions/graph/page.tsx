"use client";

import { Anchor, Container, Group, Skeleton, Text, Title } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { DecisionGraphCanvas } from "~/app/_components/decisions/DecisionGraphCanvas";

/**
 * Decision network graph: ADRs clustered by repo, SUPERSEDES edges solid.
 * Click a node to open the decision. Read-only, like the whole Decision Log.
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

  const supersedesEdges = (graph?.edges ?? []).filter(
    (e) => e.type === "SUPERSEDES",
  );

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
      <Text size="sm" className="text-text-secondary" mb="lg">
        The decision network across enrolled repos. Click a decision to open it.
      </Text>

      {!graph || graph.nodes.length === 0 ? (
        <Text className="text-text-secondary">
          No decisions synced yet — nothing to draw.
        </Text>
      ) : (
        <DecisionGraphCanvas
          repos={graph.repos}
          nodes={graph.nodes}
          edges={supersedesEdges}
          onNodeClick={(adrId) =>
            router.push(`/w/${workspace.slug}/decisions/${adrId}`)
          }
        />
      )}
    </Container>
  );
}
