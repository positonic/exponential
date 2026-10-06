'use client';

import { useMemo } from 'react';
import {
  Avatar,
  Card,
  Checkbox,
  Group,
  Progress,
  Stack,
  Table,
  Text,
  Tooltip,
} from '@mantine/core';
import { IconUsers } from '@tabler/icons-react';
import { api, type RouterOutputs } from '~/trpc/react';
import { formatMinutes } from './format';

type ContributorRow =
  RouterOutputs['sprintAnalytics']['getContributions']['rows'][number];

/**
 * Per-person contributions over all cycles (no `cycleId`) or one cycle.
 *
 * Fetches every row once and narrows to the selected members client-side, so
 * changing the filter never refetches. Each row's checkbox toggles that person
 * in the page-wide member filter. Ticket share is measured against the whole
 * team's completed tickets, so it reads the same filtered or not.
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

  const selected = useMemo(() => new Set(memberIds), [memberIds]);
  const isFiltered = selected.size > 0;

  const teamCompleted = useMemo(
    () => (data?.rows ?? []).reduce((sum, r) => sum + r.completedTickets, 0),
    [data],
  );

  const rows = useMemo(
    () =>
      (data?.rows ?? []).filter((r) =>
        isFiltered ? r.userId != null && selected.has(r.userId) : true,
      ),
    [data, isFiltered, selected],
  );

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
          {isFiltered && (
            <Text size="xs" className="text-text-muted">
              ({rows.length} of {data?.rows.length ?? 0})
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
          Tickets count toward their assignee. PRs and commits are matched
          through each member&apos;s connected GitHub account (— means none is
          linked); time is confirmed time logged inside the cycle window.
        </Text>
      </Stack>
    </Card>
  );
}

function ContributorTableRow({
  row,
  teamCompleted,
  isSelected,
  onToggle,
}: {
  row: ContributorRow;
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
      <Tooltip label="No GitHub account linked" withArrow>
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
