'use client';

import { Suspense, useState } from 'react';
import { Button, Container, Group, Skeleton, Stack, Text } from '@mantine/core';
import { IconCalendarPlus } from '@tabler/icons-react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { ScheduleMeetingModal } from '~/app/_components/calendar/ScheduleMeetingModal';
import { WorkspaceHomeConceptD as WorkspaceHomeCommand } from '~/app/_components/home/WorkspaceHomeConceptD';
import { WorkspaceHomeActivity } from '~/app/_components/home/WorkspaceHomeActivity';
import { WorkspaceHomeCoaching } from '~/app/_components/home/WorkspaceHomeCoaching';
import { GithubConnectCta } from '~/app/_components/home/GithubConnectCta';
import { JoinedWorkspaceBanner } from '~/app/_components/home/JoinedWorkspaceBanner';
import { validateHomeLayout } from '~/app/_components/home/HomeLayoutPicker';

function WorkspaceHomeContent() {
  const { workspace, isLoading: workspaceLoading } = useWorkspace();
  const [scheduleOpen, setScheduleOpen] = useState(false);

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
      <JoinedWorkspaceBanner />
      {/* Activity layout shows GitHub in the rail widget; other layouts have no
          rail, so they keep the top Connect banner. */}
      {layout !== 'activity' && <GithubConnectCta />}
      {/* Workspace-page entry point for cross-member scheduling (V3). */}
      <Group justify="flex-end" px="md" pt="sm">
        <Button
          size="xs"
          variant="light"
          leftSection={<IconCalendarPlus size={14} />}
          onClick={() => setScheduleOpen(true)}
        >
          Schedule meeting
        </Button>
      </Group>
      <ScheduleMeetingModal
        opened={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        defaultWorkspaceId={workspace.id}
      />
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
