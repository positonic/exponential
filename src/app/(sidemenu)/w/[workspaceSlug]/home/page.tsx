'use client';

import { Suspense } from 'react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { Skeleton, Container, Stack, Text } from '@mantine/core';
import { api } from '~/trpc/react';
import { HomeContent } from '~/app/_components/HomeContent';

function WorkspaceHomeContent() {
  const { workspace, workspaceId, workspaceSlug, isLoading: workspaceLoading } = useWorkspace();

  // Fetch workspace-specific recent project
  const { data: projects, isLoading: projectsLoading } = api.project.getAll.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: !!workspace }
  );

  // Get current user name from session
  const { data: currentUser } = api.user.getCurrentUser.useQuery();

  const isLoading = workspaceLoading || projectsLoading;

  if (isLoading) {
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

  // Get most recent project in this workspace
  const recentProject = projects?.[0] ?? null;

  return (
    <HomeContent
      userName={currentUser?.name ?? 'there'}
      isNewUser={false}
      userData={null}
      recentProject={recentProject ? {
        id: recentProject.id,
        name: recentProject.name,
        slug: recentProject.slug,
        workspace: { slug: workspace.slug },
      } : null}
      workspaceSlug={workspaceSlug ?? undefined}
      workspaceName={workspace.name}
    />
  );
}

export default function WorkspaceHomePage() {
  return (
    <main className="flex h-full flex-col items-center justify-start text-text-primary">
      <Suspense fallback={<div>Loading...</div>}>
        <WorkspaceHomeContent />
      </Suspense>
    </main>
  );
}
