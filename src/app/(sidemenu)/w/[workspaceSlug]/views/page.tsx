"use client";

import { Suspense } from "react";
import { Container, Stack, Skeleton, Text } from "@mantine/core";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { ViewBoard } from "~/app/_components/views/ViewBoard";
import { DEFAULT_VIEW_CONFIG } from "~/types/view";

function ViewsContent() {
  const { workspace, workspaceId, isLoading: workspaceLoading } = useWorkspace();

  if (workspaceLoading) {
    return (
      <Container size="xl" className="py-6">
        <Stack gap="md">
          <Skeleton height={40} width={200} />
          <Skeleton height={500} />
        </Stack>
      </Container>
    );
  }

  if (!workspace || !workspaceId) {
    return (
      <Container size="xl" className="py-6">
        <Text className="text-text-secondary">Workspace not found</Text>
      </Container>
    );
  }

  return (
    <Container size="xl" className="py-6">
      <ViewBoard
        workspaceId={workspaceId}
        viewConfig={{
          ...DEFAULT_VIEW_CONFIG,
          isVirtual: true,
        }}
      />
    </Container>
  );
}

export default function ViewsPage() {
  return (
    <Suspense
      fallback={
        <Container size="xl" className="py-6">
          <Stack gap="md">
            <Skeleton height={40} width={200} />
            <Skeleton height={500} />
          </Stack>
        </Container>
      }
    >
      <ViewsContent />
    </Suspense>
  );
}
