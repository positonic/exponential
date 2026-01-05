'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { NavigationWrapper } from '~/app/_components/NavigationWrapper';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { Skeleton, Container, Text, Stack } from '@mantine/core';
import { api } from '~/trpc/react';
import { startOfDay } from 'date-fns';
import { isValidFocusPeriod } from '~/types/focus';
import type { FocusPeriod } from '~/types/focus';

function WorkspaceTodayContent() {
  const { workspace, workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const searchParams = useSearchParams();

  // Get tab and focus from URL
  const tab = searchParams.get('tab') ?? undefined;
  const focusParam = searchParams.get('focus');
  const focus: FocusPeriod | undefined = isValidFocusPeriod(focusParam) ? focusParam : undefined;

  // Check if today's day record exists
  const today = startOfDay(new Date());
  const { data: todayRecord, isLoading: dayLoading } = api.day.getByDate.useQuery(
    { date: today },
    { enabled: !!workspace }
  );

  // Check calendar connection status
  const { data: calendarStatus, isLoading: calendarLoading } = api.calendar.getConnectionStatus.useQuery(
    undefined,
    { enabled: !!workspace }
  );

  const isLoading = workspaceLoading || dayLoading || calendarLoading;

  if (isLoading) {
    return (
      <Container size="xl" className="py-8">
        <Stack gap="md">
          <Skeleton height={60} />
          <Skeleton height={400} />
        </Stack>
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

  return (
    <NavigationWrapper
      calendarConnected={calendarStatus?.isConnected ?? false}
      todayExists={!!todayRecord}
      initialTab={tab}
      initialFocus={focus}
      workspaceId={workspaceId ?? undefined}
      workspaceName={workspace.name}
    />
  );
}

export default function WorkspaceTodayPage() {
  return (
    <main className="flex h-full flex-col items-center justify-start text-text-primary">
      <div className="container flex flex-col items-stretch justify-start gap-4 px-4 py-8">
        <Suspense fallback={<div>Loading...</div>}>
          <WorkspaceTodayContent />
        </Suspense>
      </div>
    </main>
  );
}
