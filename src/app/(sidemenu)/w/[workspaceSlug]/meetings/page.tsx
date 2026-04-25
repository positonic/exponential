'use client';

import { Suspense } from 'react';
import { Container, Skeleton, Text } from '@mantine/core';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { MeetingsContent } from '~/app/_components/MeetingsContent';

function WorkspaceMeetingsContent() {
  const { workspace, workspaceId, isLoading } = useWorkspace();

  if (isLoading) {
    return (
      <Container size="xl" className="py-8">
        <Skeleton height={40} width={200} mb="lg" />
        <Skeleton height={300} />
      </Container>
    );
  }

  if (!workspace) {
    return (
      <Container size="xl" className="py-8">
        <Text className="text-text-secondary">Workspace not found</Text>
      </Container>
    );
  }

  return <MeetingsContent workspaceId={workspaceId ?? undefined} />;
}

export default function WorkspaceMeetingsPage() {
  return (
    <main className="flex h-full flex-col items-center justify-center text-text-primary">
      <div className="container flex flex-col items-center justify-center gap-12 px-4 py-8">
        <Suspense fallback={<div>Loading...</div>}>
          <WorkspaceMeetingsContent />
        </Suspense>
      </div>
    </main>
  );
}
