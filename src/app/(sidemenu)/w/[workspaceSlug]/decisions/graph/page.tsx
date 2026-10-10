"use client";

import { Container, Skeleton, Text } from "@mantine/core";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { DecisionGraphView } from "~/app/_components/decisions/DecisionGraphView";

/**
 * Full-screen decision network graph across every enrolled repo in the
 * workspace. The graph itself (header row, legend, canvas, node-click
 * navigation) is shared with the product graph lens — see DecisionGraphView.
 */
export default function DecisionsGraphPage() {
  const { workspace, workspaceId, isLoading } = useWorkspace();

  if (isLoading) {
    return (
      <Container size="xl" className="py-8">
        <Skeleton height={40} width={240} mb="lg" />
        <Skeleton height={500} />
      </Container>
    );
  }

  if (!workspace || !workspaceId) {
    return (
      <Container size="xl" className="py-8">
        <Text className="text-text-secondary">Workspace not found</Text>
      </Container>
    );
  }

  return (
    <DecisionGraphView
      workspaceId={workspaceId}
      workspaceSlug={workspace.slug}
      backHref={`/w/${workspace.slug}/decisions`}
    />
  );
}
