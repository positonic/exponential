"use client";

import { Container, Skeleton, Text } from "@mantine/core";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { DecisionsIndex } from "~/app/_components/decisions/DecisionsIndex";

/**
 * Decision Log — one index, two sources (ADR-0060): ADRs projected read-only
 * from every enrolled repo (git is the source of truth; there is deliberately
 * no write path to ADR content anywhere in this UI) beside Decisions logged
 * from meetings, by hand or by Zoe.
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
          Decisions logged from meetings or by hand, beside the ADRs of this
          workspace&apos;s enrolled repositories — those stay read-only,{" "}
          <code>git</code> is their source of truth.
        </>
      }
    />
  );
}
