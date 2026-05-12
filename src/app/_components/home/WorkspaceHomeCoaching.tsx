'use client';

import { Container, Stack, Text, Title } from '@mantine/core';
import { useWorkspace } from '~/providers/WorkspaceProvider';

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

        <PlaceholderZone
          title="Focus goals"
          description="Focus goals — coming in next slice"
        />

        <PlaceholderZone
          title="Reflection"
          description="Weekly reflection — coming in next slice"
        />
      </Stack>
    </Container>
  );
}
