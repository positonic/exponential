'use client';

import { Container, Title, Button, Skeleton, Text } from '@mantine/core';
import { GoalsTable } from '~/app/_components/GoalsTable';
import { CreateGoalModal } from '~/app/_components/CreateGoalModal';
import { api } from '~/trpc/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';

export default function WorkspaceGoalsPage() {
  const { workspace, workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const { data: goals } = api.goal.getAllMyGoals.useQuery(
    { workspaceId: workspaceId ?? undefined },
    {
      refetchOnWindowFocus: true,
      staleTime: 0,
      enabled: !!workspace,
    }
  );

  if (workspaceLoading) {
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

  return (
    <Container size="xl" className="py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <Title
          order={1}
          className="text-4xl font-bold bg-gradient-to-r from-green-400 to-teal-400 bg-clip-text text-transparent"
        >
          Goals
        </Title>
        <CreateGoalModal>
          <Button
            variant="filled"
            color="dark"
            leftSection="+"
          >
            Add Goal
          </Button>
        </CreateGoalModal>
      </div>

      {/* Content */}
      <GoalsTable goals={goals ?? []} />
    </Container>
  );
}
