'use client';

import { Text, Stack, Group, Badge, ActionIcon } from '@mantine/core';
import { IconTarget, IconPlus } from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { isSameDay } from 'date-fns';
import { CreateOutcomeModal } from '../CreateOutcomeModal';

interface OutcomesByGoalProps {
  workspaceId?: string;
}

// Define OutcomeType locally
type OutcomeType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'life' | 'problem';

// Map life domain to colors
const domainColors: Record<string, string> = {
  'Health': 'green',
  'Career': 'blue',
  'Relationships': 'pink',
  'Finance': 'yellow',
  'Growth': 'violet',
  'Spirituality': 'cyan',
  'Fun': 'orange',
  'Environment': 'teal',
};

function getOutcomeTypeColor(type: string): string {
  switch (type.toLowerCase()) {
    case 'daily': return 'blue';
    case 'weekly': return 'green';
    case 'monthly': return 'violet';
    case 'quarterly': return 'orange';
    case 'annual': return 'red';
    default: return 'gray';
  }
}

export function OutcomesByGoal({ workspaceId }: OutcomesByGoalProps) {
  const { data: allOutcomes, isLoading: outcomesLoading } = api.outcome.getMyOutcomes.useQuery({ workspaceId });
  const { data: goals, isLoading: goalsLoading } = api.goal.getAllMyGoals.useQuery({ workspaceId });

  const isLoading = outcomesLoading || goalsLoading;
  const today = new Date();

  // Filter outcomes due today
  const todayOutcomes = allOutcomes?.filter(
    (outcome) => outcome.dueDate && isSameDay(outcome.dueDate, today)
  ) ?? [];

  // Group outcomes by their associated goal
  type GoalType = NonNullable<typeof goals>[number] | null;
  type GroupedOutcomes = Record<string, { goal: GoalType; outcomes: typeof todayOutcomes }>;

  const outcomesByGoal = todayOutcomes.reduce<GroupedOutcomes>((acc, outcome) => {
    const goalId = outcome.goals?.[0]?.id;
    const goal = goalId ? goals?.find(g => g.id === goalId) ?? null : null;
    const key = goal ? `goal-${goal.id}` : 'ungrouped';

    if (!acc[key]) {
      acc[key] = {
        goal,
        outcomes: [],
      };
    }
    acc[key].outcomes.push(outcome);
    return acc;
  }, {});

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-2">
        <div className="h-4 bg-surface-hover rounded w-1/4" />
        <div className="h-16 bg-surface-hover rounded" />
      </div>
    );
  }

  if (todayOutcomes.length === 0) {
    return (
      <Stack gap="xs">
        <Group justify="space-between">
          <Text size="sm" fw={500} className="text-text-secondary">
            Outcomes
          </Text>
          <CreateOutcomeModal>
            <ActionIcon variant="subtle" size="sm">
              <IconPlus size={14} />
            </ActionIcon>
          </CreateOutcomeModal>
        </Group>
        <Text size="sm" className="text-text-muted">
          No outcomes due today. Set outcomes to track meaningful results.
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text size="sm" fw={500} className="text-text-secondary">
          Outcomes
        </Text>
        <CreateOutcomeModal>
          <ActionIcon variant="subtle" size="sm">
            <IconPlus size={14} />
          </ActionIcon>
        </CreateOutcomeModal>
      </Group>

      <Stack gap="md">
        {Object.entries(outcomesByGoal).map(([key, { goal, outcomes }]) => (
          <div key={key}>
            {/* Goal Header */}
            {goal ? (
              <Group gap="xs" className="mb-2">
                <IconTarget size={14} className="text-text-muted" />
                <Text size="xs" fw={500} className="text-text-secondary">
                  {goal.title}
                </Text>
                {goal.lifeDomain && (
                  <Badge
                    size="xs"
                    color={domainColors[goal.lifeDomain.title] ?? 'gray'}
                    variant="dot"
                  >
                    {goal.lifeDomain.title}
                  </Badge>
                )}
              </Group>
            ) : (
              <Text size="xs" className="text-text-muted mb-2">
                Unlinked outcomes
              </Text>
            )}

            {/* Outcomes */}
            <Stack gap="xs" className="pl-4 border-l-2 border-border-primary">
              {outcomes.map((outcome) => (
                <CreateOutcomeModal
                  key={outcome.id}
                  outcome={{
                    id: outcome.id,
                    description: outcome.description,
                    dueDate: outcome.dueDate,
                    type: outcome.type as OutcomeType,
                    whyThisOutcome: outcome.whyThisOutcome,
                    projectId: outcome.projects?.[0]?.id,
                    goalId: outcome.goals?.[0]?.id,
                  }}
                  trigger={
                    <div className="p-2 rounded-md hover:bg-surface-hover cursor-pointer transition-colors">
                      <Group justify="space-between" wrap="nowrap">
                        <Text size="sm" className="text-text-primary" lineClamp={1}>
                          {outcome.description}
                        </Text>
                        <Badge
                          size="xs"
                          color={getOutcomeTypeColor(outcome.type ?? '')}
                          variant="light"
                        >
                          {outcome.type}
                        </Badge>
                      </Group>
                    </div>
                  }
                />
              ))}
            </Stack>
          </div>
        ))}
      </Stack>
    </Stack>
  );
}
