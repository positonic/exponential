'use client';

import { Avatar, Badge, Text, Title } from '@mantine/core';
import { IconRobotFace } from '@tabler/icons-react';
import Link from 'next/link';
import { personHref } from '~/lib/personHref';
import type { RouterOutputs } from '~/trpc/react';

type Person = RouterOutputs['person']['get'];

interface PersonHeaderProps {
  person: Person;
  /** Selected workspace id, or `null` for every workspace. */
  workspaceId: string | null;
  onWorkspaceChange: (workspaceId: string | null) => void;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

/**
 * Who this page is about: avatar and name, the Agent badge and owner for an
 * agent, the workspaces the viewer shares with them (which are also the feed's
 * workspace filter) and the Positions they hold there.
 */
export function PersonHeader({
  person,
  workspaceId,
  onWorkspaceChange,
}: PersonHeaderProps) {
  const { user, owner, sharedWorkspaces, positions } = person;
  const name = user.name ?? 'Unnamed';

  const positionsByWorkspace = sharedWorkspaces
    .map((workspace) => ({
      workspace,
      titles: positions
        .filter((position) => position.workspaceId === workspace.id)
        .map((position) => position.title),
    }))
    .filter((group) => group.titles.length > 0);

  return (
    <header className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <Avatar src={user.image} alt="" size={56} radius="xl" color="brand">
          {initialsOf(name)}
        </Avatar>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Title order={1} className="text-text-primary">
              {name}
            </Title>
            {user.isAgent ? (
              <Badge
                variant="light"
                color="gray"
                leftSection={<IconRobotFace size={12} aria-hidden="true" />}
              >
                Agent
              </Badge>
            ) : null}
          </div>
          {owner ? (
            <Text size="sm" className="text-text-secondary" mt={2}>
              Owned by{' '}
              <Link
                href={personHref(owner.id)}
                className="font-medium text-text-primary hover:underline"
              >
                {owner.name ?? 'Unnamed'}
              </Link>
            </Text>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Text size="xs" tt="uppercase" className="text-text-muted" fw={600}>
          {person.isSelf ? 'Your workspaces' : 'Shared workspaces'}
        </Text>
        {sharedWorkspaces.length === 0 ? (
          <Text size="sm" className="text-text-secondary">
            You don&apos;t share a workspace with {name} any more. Their earlier
            activity in your workspaces is still below.
          </Text>
        ) : (
          <div
            className="wsa-projects__seg wsa-projects__seg--inline"
            role="tablist"
            aria-label="Filter activity by workspace"
          >
            <button
              type="button"
              role="tab"
              aria-selected={workspaceId === null}
              data-active={workspaceId === null}
              className="wsa-projects__seg-btn"
              onClick={() => onWorkspaceChange(null)}
            >
              All
            </button>
            {sharedWorkspaces.map((workspace) => (
              <button
                key={workspace.id}
                type="button"
                role="tab"
                aria-selected={workspaceId === workspace.id}
                data-active={workspaceId === workspace.id}
                className="wsa-projects__seg-btn"
                onClick={() => onWorkspaceChange(workspace.id)}
              >
                {workspace.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {positionsByWorkspace.length > 0 ? (
        <div className="flex flex-col gap-1">
          <Text size="xs" tt="uppercase" className="text-text-muted" fw={600}>
            Positions
          </Text>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {positionsByWorkspace.map(({ workspace, titles }) => (
              <li key={workspace.id} className="text-sm text-text-secondary">
                <span className="font-medium text-text-primary">
                  {titles.join(', ')}
                </span>{' '}
                in {workspace.name}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </header>
  );
}
