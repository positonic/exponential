'use client';

import { Badge, Collapse, Group, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import Link from 'next/link';
import { useState } from 'react';

interface CommitAction {
  id: string;
  name: string;
  status: string;
  dueDate: Date | string | null;
  completedAt: Date | string | null;
}

interface CoachingGoalCommitLinesProps {
  goalId: number;
  projectCount: number;
  lastWeekKept: CommitAction[];
  lastWeekMissed: CommitAction[];
  thisWeekActions: CommitAction[];
}

function formatDueDate(value: Date | string | null) {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
}

export function CoachingGoalCommitLines({
  goalId,
  projectCount,
  lastWeekKept,
  lastWeekMissed,
  thisWeekActions,
}: CoachingGoalCommitLinesProps) {
  const [expanded, setExpanded] = useState(false);

  if (projectCount === 0) {
    return (
      <Stack
        gap={4}
        className="rounded-md border border-dashed border-border-primary bg-surface-secondary px-3 py-2"
      >
        <Text size="xs" className="text-text-muted">
          No commitments linked —{' '}
          <Text
            component={Link}
            href={`/goals/${goalId}/edit`}
            className="text-brand-primary hover:underline"
          >
            link a project to this goal
          </Text>{' '}
          to track weekly commitments.
        </Text>
      </Stack>
    );
  }

  const kept = lastWeekKept.length;
  const total = kept + lastWeekMissed.length;

  return (
    <Stack gap={6}>
      <UnstyledButton
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={`commit-detail-${goalId}`}
        className="flex items-center gap-1 rounded text-left hover:bg-surface-hover"
      >
        {expanded ? (
          <IconChevronDown size={14} className="text-text-muted" aria-hidden />
        ) : (
          <IconChevronRight size={14} className="text-text-muted" aria-hidden />
        )}
        <Text size="xs" className="text-text-secondary">
          Last week:{' '}
          <Text component="span" fw={600} className="text-text-primary">
            {kept}/{total}
          </Text>{' '}
          kept
        </Text>
      </UnstyledButton>

      <Collapse in={expanded}>
        <Stack id={`commit-detail-${goalId}`} gap={2} className="pl-5">
          {kept === 0 && lastWeekMissed.length === 0 ? (
            <Text size="xs" className="text-text-muted">
              Nothing tracked for last week.
            </Text>
          ) : null}
          {lastWeekKept.map((a) => (
            <Text key={a.id} size="xs" className="text-text-secondary">
              ✓ {a.name}
            </Text>
          ))}
          {lastWeekMissed.map((a) => (
            <Text
              key={a.id}
              size="xs"
              className="text-text-muted line-through decoration-text-muted"
            >
              {a.name}
            </Text>
          ))}
        </Stack>
      </Collapse>

      <Stack gap={4}>
        <Text size="xs" className="text-text-secondary">
          This week:
        </Text>
        {thisWeekActions.length === 0 ? (
          <Text size="xs" className="pl-1 text-text-muted">
            No commitments yet.
          </Text>
        ) : (
          <Stack gap={2} className="pl-1">
            {thisWeekActions.map((a) => (
              <Group key={a.id} gap={6} wrap="nowrap" align="center">
                <Text size="xs" className="truncate text-text-primary">
                  {a.name}
                </Text>
                {a.dueDate ? (
                  <Badge size="xs" variant="light" color="gray">
                    {formatDueDate(a.dueDate)}
                  </Badge>
                ) : null}
              </Group>
            ))}
          </Stack>
        )}
      </Stack>
    </Stack>
  );
}
