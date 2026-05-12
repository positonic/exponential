'use client';

import { Container, Stack, Text, Title } from '@mantine/core';
import { IconActivity } from '@tabler/icons-react';
import { useWorkspace } from '~/providers/WorkspaceProvider';

export function WorkspaceHomeActivity() {
  const { workspace } = useWorkspace();

  return (
    <Container size="lg" className="py-16">
      <Stack
        align="center"
        gap="md"
        className="rounded-lg border border-border-primary bg-surface-secondary px-8 py-20 text-center"
      >
        <IconActivity size={40} className="text-text-muted" />
        <Title order={2} className="text-text-primary">
          Activity dashboard — coming soon
        </Title>
        <Text className="max-w-md text-text-secondary">
          {workspace?.name ?? 'This workspace'} is set to the Activity layout. The
          full dashboard ships in a follow-up slice — for now, switch to the
          Command Center layout in workspace settings if you need the old home.
        </Text>
      </Stack>
    </Container>
  );
}
