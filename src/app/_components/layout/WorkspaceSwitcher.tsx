'use client';

import {
  Menu,
  Button,
  Avatar,
  Group,
  Text,
  Skeleton,
} from '@mantine/core';
import {
  IconChevronDown,
  IconChevronsLeft,
  IconPlus,
  IconSettings,
  IconCheck,
  IconBriefcase,
  IconLayoutKanban,
  IconDeviceProjector,
  IconWriting,
} from '@tabler/icons-react';
import Image from 'next/image';
import Link from 'next/link';
import clsx from 'clsx';
import { api } from '~/trpc/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { type ThemeConfig } from '~/config/themes';

interface WorkspaceSwitcherProps {
  theme?: ThemeConfig;
  onCollapse?: () => void;
  hideCollapse?: boolean;
  className?: string;
}

const pillClasses = {
  amber: 'bg-brand-warning/15 text-brand-warning',
  blue: 'bg-brand-primary/15 text-brand-primary',
  green: 'bg-brand-success/15 text-brand-success',
  neutral: 'bg-surface-tertiary text-text-secondary',
} as const;

type PillVariant = keyof typeof pillClasses;

const roleToPill: Record<
  'owner' | 'admin' | 'member' | 'viewer',
  { label: string; variant: PillVariant }
> = {
  owner: { label: 'Owner', variant: 'amber' },
  admin: { label: 'Admin', variant: 'blue' },
  member: { label: 'Member', variant: 'green' },
  viewer: { label: 'Viewer', variant: 'neutral' },
};

export function WorkspaceSwitcher({
  theme,
  onCollapse,
  hideCollapse = false,
  className,
}: WorkspaceSwitcherProps = {}) {
  const {
    workspace,
    workspaceSlug,
    userRole,
    switchWorkspace,
    isLoading: contextLoading,
  } = useWorkspace();
  const { data: workspaces, isLoading: listLoading } =
    api.workspace.list.useQuery();
  const { data: actions } = api.action.getAll.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: false,
  });

  const activeInboxCount =
    actions?.filter((a) => !a.projectId && a.status === 'ACTIVE').length ?? 0;
  const hasNotification = activeInboxCount > 0;

  const isLoading = contextLoading || listLoading;

  if (isLoading) {
    return (
      <div className={clsx('flex items-center gap-2 px-2 py-2 w-full', className)}>
        <Skeleton height={36} radius="md" className="flex-1" />
      </div>
    );
  }

  if (!workspaces || workspaces.length === 0) {
    return (
      <div className={clsx('flex items-center gap-2 px-2 py-2 w-full', className)}>
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

  const pill = userRole ? roleToPill[userRole] : null;
  const workspaceName = workspace?.name ?? 'Select Workspace';
  const logoSrc = theme?.logo;
  const isImageLogo = logoSrc?.includes('/');

  return (
    <div
      className={clsx(
        'flex items-center gap-2 px-2 py-2 min-w-0 w-full',
        className,
      )}
    >
      <Menu shadow="md" width={280} position="bottom-start">
        <Menu.Target>
          <button
            type="button"
            className="flex flex-1 min-w-0 items-center gap-2.5 rounded-md px-1.5 py-1 text-left hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
            aria-haspopup="menu"
          >
            <span className="relative grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-md border border-border-primary bg-surface-secondary text-text-primary">
              {isImageLogo && logoSrc ? (
                <Image
                  src={logoSrc}
                  alt=""
                  width={16}
                  height={16}
                  className="object-contain"
                />
              ) : logoSrc ? (
                <span className="text-sm">{logoSrc}</span>
              ) : (
                <span className="text-xs font-semibold">
                  {workspaceName.charAt(0).toUpperCase()}
                </span>
              )}
              {hasNotification && (
                <span
                  className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-background-secondary bg-brand-error"
                  aria-hidden="true"
                />
              )}
            </span>

            <span
              className="flex-1 min-w-0 truncate text-[15px] font-semibold tracking-tight text-text-primary"
              title={workspaceName}
            >
              {workspaceName}
            </span>

            {pill && (
              <span
                className={clsx(
                  'shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium leading-normal',
                  pillClasses[pill.variant],
                )}
              >
                {pill.label}
              </span>
            )}

            <IconChevronDown
              size={14}
              className="shrink-0 text-text-muted"
            />
          </button>
        </Menu.Target>

        <Menu.Dropdown className="bg-surface-secondary border-border-primary">
          <Menu.Label className="text-text-muted">Workspaces</Menu.Label>
          {workspaces.map((ws) => (
            <Menu.Item
              key={ws.id}
              onClick={() => switchWorkspace(ws.slug)}
              leftSection={
                <Avatar
                  size="xs"
                  color="brand"
                  radius="sm"
                  className="bg-brand-primary text-white"
                >
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
            <>
              <Menu.Divider className="border-border-primary" />
              <Menu.Item
                leftSection={<IconBriefcase size={14} />}
                component={Link}
                href={`/w/${workspace.slug}/home`}
                className="text-text-primary hover:bg-surface-hover"
              >
                Workspace Home
              </Menu.Item>
              <Menu.Item
                leftSection={<IconLayoutKanban size={14} />}
                component={Link}
                href={`/w/${workspace.slug}/actions`}
                className="text-text-primary hover:bg-surface-hover"
              >
                Actions
              </Menu.Item>
              <Menu.Item
                leftSection={<IconDeviceProjector size={14} />}
                component={Link}
                href={`/w/${workspace.slug}/projects`}
                className="text-text-primary hover:bg-surface-hover"
              >
                Projects
              </Menu.Item>
              <Menu.Item
                leftSection={<IconWriting size={14} />}
                component={Link}
                href={`/w/${workspace.slug}/content`}
                className="text-text-primary hover:bg-surface-hover"
              >
                Content
              </Menu.Item>
              <Menu.Item
                leftSection={<IconSettings size={14} />}
                component={Link}
                href={`/w/${workspace.slug}/settings`}
                className="text-text-primary hover:bg-surface-hover"
              >
                Workspace Settings
              </Menu.Item>
            </>
          )}
        </Menu.Dropdown>
      </Menu>

      {!hideCollapse && (
        <button
          type="button"
          onClick={onCollapse}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
          aria-label="Collapse menu"
          title="Collapse menu"
        >
          <IconChevronsLeft size={16} />
        </button>
      )}
    </div>
  );
}
