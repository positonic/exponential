'use client';

import { Menu, Button, Avatar, Group, Text, Skeleton } from '@mantine/core';
import { IconChevronDown, IconPlus, IconSettings, IconCheck } from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import Link from 'next/link';

export function WorkspaceSwitcher() {
  const { workspace, workspaceSlug, switchWorkspace, isLoading: contextLoading } = useWorkspace();
  const { data: workspaces, isLoading: listLoading } = api.workspace.list.useQuery();

  const isLoading = contextLoading || listLoading;

  if (isLoading) {
    return (
      <div className="px-1 py-1">
        <Skeleton height={36} radius="md" />
      </div>
    );
  }

  // If no workspaces exist yet, show a create button
  if (!workspaces || workspaces.length === 0) {
    return (
      <div className="px-1 py-1">
        <Button
          component={Link}
          href="/workspaces/new"
          variant="light"
          size="sm"
          fullWidth
          leftSection={<IconPlus size={16} />}
        >
          Create Workspace
        </Button>
      </div>
    );
  }

  return (
    <div className="px-1 py-1">
      <Menu shadow="md" width={280} position="bottom-start">
        <Menu.Target>
          <Button
            variant="subtle"
            fullWidth
            className="text-text-primary hover:bg-surface-hover"
            rightSection={<IconChevronDown size={14} />}
            styles={{
              root: {
                justifyContent: 'space-between',
                paddingLeft: 8,
                paddingRight: 8,
              },
              inner: {
                justifyContent: 'space-between',
                width: '100%',
              },
            }}
          >
            <Group gap="xs" wrap="nowrap">
              <Avatar
                size="sm"
                color="brand"
                radius="sm"
                className="bg-brand-primary text-white"
              >
                {workspace?.name?.charAt(0).toUpperCase() ?? 'W'}
              </Avatar>
              <Text size="sm" fw={500} truncate className="text-text-primary">
                {workspace?.name ?? 'Select Workspace'}
              </Text>
            </Group>
          </Button>
        </Menu.Target>

        <Menu.Dropdown className="bg-surface-secondary border-border-primary">
          <Menu.Label className="text-text-muted">Workspaces</Menu.Label>
          {workspaces.map((ws) => (
            <Menu.Item
              key={ws.id}
              onClick={() => switchWorkspace(ws.slug)}
              leftSection={
                <Avatar size="xs" color="brand" radius="sm" className="bg-brand-primary text-white">
                  {ws.name.charAt(0).toUpperCase()}
                </Avatar>
              }
              rightSection={
                ws.slug === workspaceSlug ? (
                  <IconCheck size={14} className="text-brand-primary" />
                ) : null
              }
              className="text-text-primary hover:bg-surface-hover"
            >
              <Group gap={4} wrap="nowrap">
                <Text size="sm" truncate>
                  {ws.name}
                </Text>
                {ws.type === 'personal' && (
                  <Text size="xs" className="text-text-muted">
                    (Personal)
                  </Text>
                )}
              </Group>
            </Menu.Item>
          ))}

          <Menu.Divider className="border-border-primary" />

          <Menu.Item
            leftSection={<IconPlus size={14} />}
            component={Link}
            href="/workspaces/new"
            className="text-text-primary hover:bg-surface-hover"
          >
            Create Workspace
          </Menu.Item>

          {workspace && (
            <Menu.Item
              leftSection={<IconSettings size={14} />}
              component={Link}
              href={`/w/${workspace.slug}/settings`}
              className="text-text-primary hover:bg-surface-hover"
            >
              Workspace Settings
            </Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>
    </div>
  );
}
