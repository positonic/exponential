"use client";

import { Suspense, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Container, Stack, Skeleton, Text } from "@mantine/core";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { ViewBoard } from "~/app/_components/views/ViewBoard";
import { DEFAULT_VIEW_CONFIG } from "~/types/view";
import { useActionDeepLink } from "~/hooks/useActionDeepLink";
import { useDetailedActionsEnabled } from "~/hooks/useDetailedActionsEnabled";

function ActionsContent() {
  const { workspace, workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const { actionIdFromUrl, setActionId, clearActionId } = useActionDeepLink();
  const detailedEnabled = useDetailedActionsEnabled();
  const router = useRouter();

  // When detailed mode is ON and a deep link is present, redirect to the detail page
  useEffect(() => {
    if (detailedEnabled && actionIdFromUrl && workspace?.slug) {
      router.replace(`/w/${workspace.slug}/actions/${actionIdFromUrl}`);
    }
  }, [detailedEnabled, actionIdFromUrl, workspace?.slug, router]);

  // Conditional action open handler
  const handleActionOpen = useCallback(
    (id: string) => {
      if (detailedEnabled && workspace?.slug) {
        router.push(`/w/${workspace.slug}/actions/${id}`);
      } else {
        setActionId(id);
      }
    },
    [detailedEnabled, workspace?.slug, router, setActionId],
  );

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
          name: `${workspace.name} Workspace Actions`,
          isVirtual: true,
        }}
        deepLinkActionId={detailedEnabled ? null : actionIdFromUrl}
        onActionOpen={handleActionOpen}
        onActionClose={clearActionId}
      />
    </Container>
  );
}

export default function ActionsPage() {
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
      <ActionsContent />
    </Suspense>
  );
}
