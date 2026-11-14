'use client';

import { useMemo, useState } from 'react';
import {
  Avatar,
  Button,
  Card,
  Checkbox,
  Group,
  Popover,
  Progress,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBrandGithub, IconUsers } from '@tabler/icons-react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api, type RouterOutputs } from '~/trpc/react';
import { formatMinutes } from './format';

type ContributorRow =
  RouterOutputs['sprintAnalytics']['getContributions']['rows'][number];

/**
 * Per-person contributions over all cycles (no `cycleId`) or one cycle.
 *
 * Every row stays listed whatever is selected, so more people can be ticked;
 * each row's checkbox toggles that person in the page-wide member filter, which
 * narrows the charts. Ticket share is measured against the whole team's
 * completed tickets. Owners and admins can set the GitHub username a member's
 * PRs and commits are matched on, unless the member connected GitHub themselves.
 */
export function ContributorsTable({
  workspaceId,
  cycleId,
  memberIds,
  onToggleMember,
}: {
  workspaceId: string;
  cycleId?: string;
  memberIds: string[];
  onToggleMember: (userId: string) => void;
}) {
  const { data, isLoading } = api.sprintAnalytics.getContributions.useQuery({
    workspaceId,
    cycleId,
  });

  const { userRole } = useWorkspace();
  const canSetGithub = userRole === 'owner' || userRole === 'admin';

  const selected = useMemo(() => new Set(memberIds), [memberIds]);

  const teamCompleted = useMemo(
    () => (data?.rows ?? []).reduce((sum, r) => sum + r.completedTickets, 0),
    [data],
  );

  const rows = data?.rows ?? [];

  return (
    <Card
      withBorder
      radius="md"
      className="border-border-primary bg-surface-secondary"
    >
      <Stack gap="md">
        <Group gap="xs">
          <IconUsers size={16} className="text-text-muted" />
          <Text size="sm" fw={500} className="text-text-secondary">
            Contributors
          </Text>
          {selected.size > 0 && (
            <Text size="xs" className="text-text-muted">
              ({selected.size} selected)
            </Text>
          )}
        </Group>

        {isLoading ? (
          <div className="animate-pulse space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-8 rounded bg-surface-hover" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <Text size="sm" className="text-text-muted">
            No contributions in scope yet.
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={640}>
            <Table verticalSpacing="xs" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th className="text-text-muted">Member</Table.Th>
                  <Table.Th className="text-text-muted">Tickets done</Table.Th>
                  <Table.Th ta="right" className="text-text-muted">Points</Table.Th>
                  <Table.Th ta="right" className="text-text-muted">PRs merged</Table.Th>
                  <Table.Th ta="right" className="text-text-muted">Commits</Table.Th>
                  <Table.Th ta="right" className="text-text-muted">Time logged</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((row) => (
                  <ContributorTableRow
                    key={row.userId ?? 'unassigned'}
                    row={row}
                    workspaceId={workspaceId}
                    canSetGithub={canSetGithub}
                    teamCompleted={teamCompleted}
                    isSelected={row.userId != null && selected.has(row.userId)}
                    onToggle={onToggleMember}
                  />
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}

        <Text size="xs" className="text-text-muted">
          Tickets count toward their assignee. PRs and commits are matched on
          each member&apos;s GitHub username, from their connected GitHub
          account or set by a workspace admin (— means none is known); time is
          confirmed time logged inside the cycle window.
        </Text>
      </Stack>
    </Card>
  );
}

function ContributorTableRow({
  row,
  workspaceId,
  canSetGithub,
  teamCompleted,
  isSelected,
  onToggle,
}: {
  row: ContributorRow;
  workspaceId: string;
  canSetGithub: boolean;
  teamCompleted: number;
  isSelected: boolean;
  onToggle: (userId: string) => void;
}) {
  const { userId } = row;
  const label =
    userId == null ? 'Unassigned' : (row.name ?? row.email ?? 'Unknown');
  const share =
    teamCompleted > 0 ? (row.completedTickets / teamCompleted) * 100 : 0;
  const githubValue = (n: number) =>
    row.githubLinked ? (
      n
    ) : (
      <Tooltip label="No GitHub username set" withArrow>
        <span className="text-text-muted">—</span>
      </Tooltip>
    );

  return (
    <Table.Tr>
      <Table.Td>
        <Group gap="xs" wrap="nowrap">
          {userId != null ? (
            <Checkbox
              size="xs"
              checked={isSelected}
              onChange={() => onToggle(userId)}
              aria-label={`Filter to ${label}`}
            />
          ) : (
            <span className="inline-block w-4" />
          )}
          <Avatar src={row.image} size={24} radius="xl">
            {row.userId == null ? '?' : label[0]?.toUpperCase()}
          </Avatar>
          <div className="min-w-0">
            <Text size="sm" className="truncate text-text-primary">
              {label}
            </Text>
            {row.userId != null && !row.isMember && (
              <Text size="xs" className="text-text-muted">
                Former member
              </Text>
            )}
            {userId != null && row.isMember && (
              <GithubLogin
                workspaceId={workspaceId}
                userId={userId}
                memberName={label}
                login={row.githubLogin}
                editable={canSetGithub && row.githubLoginSource !== 'account'}
              />
            )}
          </div>
        </Group>
      </Table.Td>
      <Table.Td>
        <Stack gap={4} className="min-w-[120px]">
          <Text size="sm" className="text-text-primary">
            {row.completedTickets}
            <span className="text-text-muted"> / {row.assignedTickets}</span>
          </Text>
          {row.userId != null && (
            <Tooltip label={`${Math.round(share)}% of the team's completed tickets`} withArrow>
              <Progress value={share} size="xs" radius="xl" color="indigo" />
            </Tooltip>
          )}
        </Stack>
      </Table.Td>
      <Table.Td ta="right">
        <Text size="sm" className="text-text-primary">
          {row.completedPoints}
          <span className="text-text-muted"> / {row.totalPoints}</span>
        </Text>
      </Table.Td>
      <Table.Td ta="right">
        <Text size="sm" className="text-text-primary">
          {row.userId == null ? '' : githubValue(row.mergedPrs)}
        </Text>
      </Table.Td>
      <Table.Td ta="right">
        <Text size="sm" className="text-text-primary">
          {row.userId == null ? '' : githubValue(row.commits)}
        </Text>
      </Table.Td>
      <Table.Td ta="right">
        <Text size="sm" className="text-text-primary">
          {row.userId == null
            ? ''
            : row.minutesLogged > 0
              ? formatMinutes(row.minutesLogged)
              : '—'}
        </Text>
      </Table.Td>
    </Table.Tr>
  );
}

/**
 * The member's GitHub username under their name. Admins get a popover to set,
 * change or clear it; a login from the member's own connected account is shown
 * read-only. Saving refetches the Metrics queries so the counts update.
 */
function GithubLogin({
  workspaceId,
  userId,
  memberName,
  login,
  editable,
}: {
  workspaceId: string;
  userId: string;
  memberName: string;
  login: string | null;
  editable: boolean;
}) {
  const [opened, setOpened] = useState(false);
  const [value, setValue] = useState('');
  const utils = api.useUtils();
  const setLogin = api.github.setMemberGithubLogin.useMutation({
    onSuccess: async () => {
      setOpened(false);
      await utils.sprintAnalytics.invalidate();
    },
    onError: (error) => {
      notifications.show({
        color: 'red',
        title: 'GitHub username not saved',
        message: error.message,
      });
    },
  });

  if (!editable) {
    return login ? (
      <Text size="xs" className="truncate text-text-muted">
        @{login}
      </Text>
    ) : null;
  }

  const open = () => {
    setValue(login ?? '');
    setOpened(true);
  };
  const save = (next: string | null) =>
    setLogin.mutate({ workspaceId, userId, login: next });

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      withArrow
      trapFocus
    >
      <Popover.Target>
        <UnstyledButton onClick={open} className="flex items-center gap-1">
          <IconBrandGithub size={12} className="text-text-muted" />
          <Text size="xs" className="truncate text-text-muted hover:text-text-primary">
            {login ? `@${login}` : 'Set GitHub username'}
          </Text>
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) save(value.trim());
          }}
        >
          <Stack gap="xs" w={240}>
            <TextInput
              size="xs"
              label={`${memberName}'s GitHub username`}
              placeholder="octocat"
              value={value}
              onChange={(e) => setValue(e.currentTarget.value)}
              data-autofocus
            />
            <Group justify="space-between" gap="xs">
              {login ? (
                <Button
                  size="xs"
                  variant="subtle"
                  color="red"
                  onClick={() => save(null)}
                  loading={setLogin.isPending && setLogin.variables?.login === null}
                >
                  Remove
                </Button>
              ) : (
                <span />
              )}
              <Button
                size="xs"
                type="submit"
                disabled={!value.trim()}
                loading={setLogin.isPending && setLogin.variables?.login !== null}
              >
                Save
              </Button>
            </Group>
          </Stack>
        </form>
      </Popover.Dropdown>
    </Popover>
  );
}
