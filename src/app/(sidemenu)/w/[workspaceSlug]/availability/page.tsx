'use client';

import { Suspense } from 'react';
import { Container, Skeleton, Text } from '@mantine/core';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { AvailabilityContent } from './_components/AvailabilityContent';

function WorkspaceAvailabilityContent() {
  const { workspace, workspaceId, isLoading } = useWorkspace();

  if (isLoading) {
    return (
      <Container size="xl" className="py-8">
        <Skeleton height={40} width={220} mb="lg" />
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

  return <AvailabilityContent workspaceId={workspaceId} members={workspace.members ?? []} />;
}

export default function WorkspaceAvailabilityPage() {
  return (
    <main className="h-full text-text-primary">
      <Suspense fallback={<div>Loading...</div>}>
        <WorkspaceAvailabilityContent />
      </Suspense>
    </main>
  );
}
