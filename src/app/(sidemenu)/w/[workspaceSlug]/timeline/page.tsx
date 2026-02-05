"use client";

import { Suspense } from "react";
import { Container, Skeleton, Text } from "@mantine/core";
import { ProjectTimelineView } from "~/app/_components/ProjectTimelineView";
import { useWorkspace } from "~/providers/WorkspaceProvider";

function WorkspaceTimelineContent() {
  const { workspace, workspaceId, isLoading } = useWorkspace();

  if (isLoading) {
    return (
      <Container size="xl" className="py-8">
        <Skeleton height={36} width={200} mb="md" />
        <Skeleton height={320} />
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
    <Container size="xl" className="py-8">
      <ProjectTimelineView
        workspaceId={workspaceId}
        workspaceSlug={workspace.slug}
      />
    </Container>
  );
}

export default function WorkspaceTimelinePage() {
  return (
    <main className="flex h-full flex-col text-text-primary">
      <Suspense fallback={<div>Loading...</div>}>
        <WorkspaceTimelineContent />
      </Suspense>
    </main>
  );
}
