'use client';

import { Container, Title, Button, Skeleton, Text } from '@mantine/core';
import { OutcomesTable } from '~/app/_components/OutcomesTable';
import { CreateOutcomeModal } from '~/app/_components/CreateOutcomeModal';
import { api } from '~/trpc/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';

export default function WorkspaceOutcomesPage() {
  const { workspace, workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const outcomesQuery = api.outcome.getMyOutcomes.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: !!workspace }
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
          className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent"
        >
          Outcomes
        </Title>
        <CreateOutcomeModal>
          <Button
            variant="filled"
            color="dark"
            leftSection="+"
          >
            Add Outcome
          </Button>
        </CreateOutcomeModal>
      </div>

      {/* Content */}
      <OutcomesTable outcomes={outcomesQuery.data ?? []} />
    </Container>
  );
}
