'use client';

import { Suspense } from 'react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { Skeleton, Container, Text } from '@mantine/core';
import { ProjectsTasksView } from '~/app/_components/ProjectsTasksView/ProjectsTasksView';

function ProjectsTasksContent() {
  const { workspace, workspaceId, isLoading } = useWorkspace();

  if (isLoading) {
    return (
      <Container size="xl" className="py-8">
        <Skeleton height={40} width={200} mb="lg" />
        <Skeleton height={400} />
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

  return <ProjectsTasksView workspaceId={workspaceId ?? undefined} />;
}

export default function ProjectsTasksPage() {
  return (
    <main className="flex h-full flex-col text-text-primary">
      <div className="flex-1 overflow-auto">
        <Suspense fallback={<div>Loading...</div>}>
          <ProjectsTasksContent />
        </Suspense>
      </div>
    </main>
  );
}
