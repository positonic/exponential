'use client';

import { Suspense } from 'react';
import { Container, Skeleton, Stack, Text } from '@mantine/core';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { WorkspaceHomeConceptD as WorkspaceHomeCommand } from '~/app/_components/home/WorkspaceHomeConceptD';
import { WorkspaceHomeActivity } from '~/app/_components/home/WorkspaceHomeActivity';
import { WorkspaceHomeCoaching } from '~/app/_components/home/WorkspaceHomeCoaching';
import { GithubConnectCta } from '~/app/_components/home/GithubConnectCta';
import { validateHomeLayout } from '~/app/_components/home/HomeLayoutPicker';

function WorkspaceHomeContent() {
  const { workspace, isLoading: workspaceLoading } = useWorkspace();

  if (workspaceLoading) {
    return (
      <Container size="lg" className="py-8">
        <Stack gap="md">
          <Skeleton height={60} />
          <Skeleton height={200} />
          <Skeleton height={300} />
        </Stack>
      </Container>
    );
  }

  if (!workspace) {
    return (
      <Container size="lg" className="py-8">
        <Text className="text-text-secondary">Workspace not found</Text>
      </Container>
    );
  }

  const layout = validateHomeLayout(workspace.homeLayout);

  const layoutContent =
    layout === 'activity' ? (
      <WorkspaceHomeActivity />
    ) : layout === 'coaching' ? (
      <WorkspaceHomeCoaching />
    ) : (
      <WorkspaceHomeCommand />
    );

  return (
    <>
      <GithubConnectCta />
      {layoutContent}
    </>
  );
}

export default function WorkspaceHomePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <WorkspaceHomeContent />
    </Suspense>
  );
}
