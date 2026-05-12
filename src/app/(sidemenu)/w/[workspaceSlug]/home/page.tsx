'use client';

import { Suspense } from 'react';
import { Container, Skeleton, Stack, Text } from '@mantine/core';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { WorkspaceHomeConceptD as WorkspaceHomeCommand } from '~/app/_components/home/WorkspaceHomeConceptD';
import { WorkspaceHomeActivity } from '~/app/_components/home/WorkspaceHomeActivity';
import { WorkspaceHomeCoaching } from '~/app/_components/home/WorkspaceHomeCoaching';
import {
  DEFAULT_HOME_LAYOUT,
  HOME_LAYOUT_VALUES,
  type HomeLayout,
} from '~/app/_components/home/HomeLayoutPicker';

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

  const rawLayout = workspace.homeLayout ?? DEFAULT_HOME_LAYOUT;
  const layout: HomeLayout = (HOME_LAYOUT_VALUES as readonly string[]).includes(rawLayout)
    ? (rawLayout as HomeLayout)
    : DEFAULT_HOME_LAYOUT;

  if (layout === 'activity') return <WorkspaceHomeActivity />;
  if (layout === 'coaching') return <WorkspaceHomeCoaching />;
  return <WorkspaceHomeCommand />;
}

export default function WorkspaceHomePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <WorkspaceHomeContent />
    </Suspense>
  );
}
