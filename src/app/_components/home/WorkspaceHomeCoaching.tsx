'use client';

import { Container, SimpleGrid, Skeleton, Stack, Text, Title } from '@mantine/core';
import Link from 'next/link';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';
import { CoachingGoalCard } from './CoachingGoalCard';

function PlaceholderZone({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Stack
      gap="xs"
      className="rounded-lg border border-border-primary bg-surface-secondary px-6 py-10"
    >
      <Text size="sm" fw={600} className="text-text-secondary">
        {title}
      </Text>
      <Text size="sm" className="text-text-muted">
        {description}
      </Text>
    </Stack>
  );
}

function FocusGoalsZone({ workspaceId }: { workspaceId: string }) {
  const { data, isLoading, error } = api.goal.listCoachingFocus.useQuery(
    { workspaceId },
    { enabled: !!workspaceId },
  );

  if (isLoading) {
    return (
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={200} radius="md" />
        ))}
      </SimpleGrid>
    );
  }

  if (error) {
    return (
      <Stack
        gap="xs"
        className="rounded-lg border border-border-primary bg-surface-secondary px-6 py-10"
      >
        <Text size="sm" fw={600} className="text-text-secondary">
          Focus goals
        </Text>
        <Text size="sm" className="text-text-muted">
          Couldn&apos;t load focus goals: {error.message}
        </Text>
      </Stack>
    );
  }

  const goals = data?.goals ?? [];

  if (goals.length === 0) {
    return (
      <Stack
        gap="xs"
        className="rounded-lg border border-border-primary bg-surface-secondary px-6 py-10"
      >
        <Text size="sm" fw={600} className="text-text-secondary">
          Focus goals
        </Text>
        <Text size="sm" className="text-text-muted">
          No active goals for the current quarter
          {data?.currentPeriod ? ` (${data.currentPeriod})` : ''} — set a{' '}
          <Text component="span" fw={500} className="text-text-secondary">
            period
          </Text>{' '}
          on a goal or{' '}
          <Text
            component={Link}
            href="/goals"
            className="text-brand-primary hover:underline"
          >
            create a new one
          </Text>
          .
        </Text>
      </Stack>
    );
  }

  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
      {goals.map((goal) => (
        <CoachingGoalCard key={goal.id} goal={goal} />
      ))}
    </SimpleGrid>
  );
}

export function WorkspaceHomeCoaching() {
  const { workspace } = useWorkspace();

  return (
    <Container size="lg" className="py-8">
      <Stack gap="lg">
        <Stack gap={4}>
          <Title order={2} className="text-text-primary">
            Coaching home
          </Title>
          <Text size="sm" className="text-text-secondary">
            {workspace?.name ?? 'This workspace'} is set to the Coaching layout.
            Sections fill in across follow-up slices.
          </Text>
        </Stack>

        <PlaceholderZone
          title="Header"
          description="Header — week selector + Wheel of Life glance"
        />

        {workspace?.id ? (
          <FocusGoalsZone workspaceId={workspace.id} />
        ) : (
          <PlaceholderZone
            title="Focus goals"
            description="Focus goals — coming in next slice"
          />
        )}

        <PlaceholderZone
          title="Reflection"
          description="Weekly reflection — coming in next slice"
        />
      </Stack>
    </Container>
  );
}
