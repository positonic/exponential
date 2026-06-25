'use client';

import { Suspense } from 'react';
import { Container, Skeleton, Text } from '@mantine/core';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { PagesListContent } from './_components/PagesListContent';

function WorkspacePagesContent() {
  const { workspace, workspaceId, workspaceSlug, isLoading } = useWorkspace();

  if (isLoading) {
    return (
      <Container size="lg" className="py-8">
        <Skeleton height={40} width={200} mb="lg" />
        <Skeleton height={300} />
      </Container>
    );
  }

  if (!workspace || !workspaceId || !workspaceSlug) {
    return (
      <Container size="lg" className="py-8">
        <Text className="text-text-secondary">Workspace not found</Text>
      </Container>
    );
  }

  return <PagesListContent workspaceId={workspaceId} workspaceSlug={workspaceSlug} />;
}

export default function WorkspacePagesPage() {
  return (
    <main className="flex h-full flex-col text-text-primary">
      <Suspense fallback={<div>Loading…</div>}>
        <WorkspacePagesContent />
      </Suspense>
    </main>
  );
}
