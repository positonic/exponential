'use client';

import {
  Container,
  Title,
  Card,
  Text,
  Group,
  Stack,
  Badge,
  Button,
  SimpleGrid,
  Avatar,
} from '@mantine/core';
import { IconPlus, IconSettings, IconUsers, IconFolder, IconTarget, IconFlag } from '@tabler/icons-react';
import Link from 'next/link';
import { api } from '~/trpc/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';

export default function WorkspacesPage() {
  const { data: workspaces, isLoading } = api.workspace.list.useQuery();
  const { workspaceSlug } = useWorkspace();

  if (isLoading) {
    return (
      <Container size="lg" className="py-8">
        <Title order={1} className="text-3xl font-bold text-text-primary mb-8">
          Workspaces
        </Title>
        <Text className="text-text-muted">Loading...</Text>
      </Container>
    );
  }

  return (
    <Container size="lg" className="py-8">
      <div className="flex items-center justify-between mb-8">
        <Title order={1} className="text-3xl font-bold text-text-primary">
          Workspaces
        </Title>
        <Button
          component={Link}
          href="/workspaces/new"
          leftSection={<IconPlus size={16} />}
          color="brand"
        >
          New Workspace
        </Button>
      </div>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
        {workspaces?.map((ws) => (
          <Card
            key={ws.id}
            className="bg-surface-secondary border-border-primary hover:border-border-focus transition-colors"
            withBorder
            padding="lg"
          >
            <Stack gap="md">
              <Group justify="space-between">
                <Group gap="sm">
                  <Avatar
                    size="md"
                    radius="sm"
                    color="brand"
                    className="bg-brand-primary text-white"
                  >
                    {ws.name.charAt(0).toUpperCase()}
                  </Avatar>
                  <div>
                    <Text fw={600} className="text-text-primary">
                      {ws.name}
                    </Text>
                    <Text size="xs" className="text-text-muted font-mono">
                      /{ws.slug}
                    </Text>
                  </div>
                </Group>
                {ws.slug === workspaceSlug && (
                  <Badge color="green" size="sm">Current</Badge>
                )}
              </Group>

              {ws.description && (
                <Text size="sm" className="text-text-secondary" lineClamp={2}>
                  {ws.description}
                </Text>
              )}

              <Group gap="lg">
                <Group gap={4}>
                  <IconFolder size={14} className="text-text-muted" />
                  <Text size="xs" className="text-text-muted">
                    {ws._count.projects} projects
                  </Text>
                </Group>
                <Group gap={4}>
                  <IconTarget size={14} className="text-text-muted" />
                  <Text size="xs" className="text-text-muted">
                    {ws._count.goals} goals
                  </Text>
                </Group>
                <Group gap={4}>
                  <IconFlag size={14} className="text-text-muted" />
                  <Text size="xs" className="text-text-muted">
                    {ws._count.outcomes} outcomes
                  </Text>
                </Group>
              </Group>

              <Group gap="xs">
                <IconUsers size={14} className="text-text-muted" />
                <Text size="xs" className="text-text-muted">
                  {ws.members.length} member{ws.members.length !== 1 ? 's' : ''}
                </Text>
                <Badge size="xs" variant="light" color={ws.type === 'personal' ? 'gray' : 'blue'}>
                  {ws.type}
                </Badge>
              </Group>

              <Group gap="sm" mt="xs">
                <Button
                  component={Link}
                  href={`/w/${ws.slug}/projects`}
                  variant="light"
                  size="xs"
                  fullWidth
                >
                  Open
                </Button>
                {(ws.currentUserRole === 'owner' || ws.currentUserRole === 'admin') && (
                  <Button
                    component={Link}
                    href={`/w/${ws.slug}/settings`}
                    variant="subtle"
                    size="xs"
                    leftSection={<IconSettings size={14} />}
                  >
                    Settings
                  </Button>
                )}
              </Group>
            </Stack>
          </Card>
        ))}
      </SimpleGrid>

      {(!workspaces || workspaces.length === 0) && (
        <Card className="bg-surface-secondary border-border-primary text-center py-12" withBorder>
          <Stack align="center" gap="md">
            <Text className="text-text-muted">No workspaces yet</Text>
            <Button
              component={Link}
              href="/workspaces/new"
              leftSection={<IconPlus size={16} />}
              color="brand"
            >
              Create your first workspace
            </Button>
          </Stack>
        </Card>
      )}
    </Container>
  );
}
