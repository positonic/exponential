'use client';

import { Suspense } from 'react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { Skeleton, Container, Stack, Text } from '@mantine/core';
import { CommandCenter } from '~/app/_components/home/CommandCenter';

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

  return <CommandCenter />;
}

export default function WorkspaceHomePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <WorkspaceHomeContent />
    </Suspense>
  );
}
