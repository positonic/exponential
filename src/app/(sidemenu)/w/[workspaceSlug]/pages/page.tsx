'use client';

import { Suspense } from 'react';
import { Skeleton, Text } from '@mantine/core';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { PagesListContent } from './_components/PagesListContent';

function WorkspacePagesContent() {
  const { workspace, workspaceId, workspaceSlug, isLoading } = useWorkspace();

  if (isLoading) {
    return (
      <div className="w-full px-6 py-8">
        <Skeleton height={40} width={200} mb="lg" />
        <Skeleton height={300} />
      </div>
    );
  }

  if (!workspace || !workspaceId || !workspaceSlug) {
    return (
      <div className="w-full px-6 py-8">
        <Text className="text-text-secondary">Workspace not found</Text>
      </div>
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
