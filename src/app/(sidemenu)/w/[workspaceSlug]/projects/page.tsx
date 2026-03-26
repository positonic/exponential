'use client';

import { Suspense } from 'react';
import { Projects } from '~/app/_components/Projects';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { Skeleton, Container, Text } from '@mantine/core';

function WorkspaceProjectsContent() {
  const { workspace, isLoading } = useWorkspace();

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

  return <Projects />;
}

export default function WorkspaceProjectsPage() {
  return (
    <main className="flex h-full flex-col text-text-primary">
      <div className="flex-1 overflow-auto">
        <Suspense fallback={<div>Loading...</div>}>
          <WorkspaceProjectsContent />
        </Suspense>
      </div>
    </main>
  );
}
