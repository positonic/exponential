"use client";

import { Container, Skeleton, Text } from "@mantine/core";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { DecisionsIndex } from "~/app/_components/decisions/DecisionsIndex";

/**
 * Decision Log — workspace-level index of ADRs projected read-only from every
 * enrolled repo. Git is the source of truth; there is deliberately no write
 * path to ADR content anywhere in this UI.
 */
export default function DecisionsPage() {
  const { workspace, workspaceId, isLoading } = useWorkspace();

  if (isLoading) {
    return (
      <Container size="xl" className="py-8">
        <Skeleton height={40} width={240} mb="lg" />
        <Skeleton height={300} />
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
    <DecisionsIndex
      workspaceId={workspaceId}
      workspaceSlug={workspace.slug}
      graphHref={`/w/${workspace.slug}/decisions/graph`}
      description={
        <>
          Architectural decisions across this workspace&apos;s enrolled
          repositories. Read-only — <code>git</code> is the source of truth.
        </>
      }
    />
  );
}
