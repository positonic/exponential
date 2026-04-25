"use client";

import { Stack, Text, Group, Paper, Badge } from "@mantine/core";
import { IconTarget } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { startOfWeek, endOfWeek, isSameDay } from "date-fns";

interface OutcomeAwarenessProps {
  workspaceId?: string;
}

export function OutcomeAwareness({ workspaceId }: OutcomeAwarenessProps) {
  const today = new Date();

  const { data: weekOutcomes, isLoading } = api.outcome.getByDateRange.useQuery(
    {
      startDate: startOfWeek(today, { weekStartsOn: 1 }),
      endDate: endOfWeek(today, { weekStartsOn: 1 }),
      workspaceId,
    }
  );

  // Filter outcomes by type
  const todayOutcomes =
    weekOutcomes?.filter(
      (o) => o.type === "daily" && o.dueDate && isSameDay(new Date(o.dueDate), today)
    ) ?? [];

  const weeklyOutcomes =
    weekOutcomes?.filter((o) => o.type === "weekly") ?? [];

  if (isLoading) {
    return (
      <Paper p="md" className="rounded-md bg-background-primary">
        <div className="animate-pulse space-y-2">
          <div className="h-4 w-3/4 rounded bg-surface-hover" />
          <div className="h-8 rounded bg-surface-hover" />
        </div>
      </Paper>
    );
  }

  const totalCount = todayOutcomes.length + weeklyOutcomes.length;

  return (
    <Paper p="md" className="rounded-md bg-background-primary">
      <Stack gap="sm">
        <Group gap="xs">
          <IconTarget size={16} className="text-text-muted" />
          <Text size="sm" fw={500} className="text-text-secondary">
            Outcomes {totalCount > 0 && `(${totalCount})`}
          </Text>
        </Group>

        {totalCount === 0 ? (
          <Text size="sm" className="text-text-muted">
            No outcomes set yet. Use the capture above to add one.
          </Text>
        ) : (
          <Stack gap="xs">
            {/* Today's daily outcomes */}
            {todayOutcomes.slice(0, 2).map((outcome) => (
              <Group key={outcome.id} gap="xs" wrap="nowrap">
                <Badge size="xs" color="yellow" variant="dot">
                  Today
                </Badge>
                <Text size="sm" className="text-text-primary" lineClamp={1}>
                  {outcome.description}
                </Text>
              </Group>
            ))}

            {/* Weekly outcomes */}
            {weeklyOutcomes.slice(0, 2).map((outcome) => (
              <Group key={outcome.id} gap="xs" wrap="nowrap">
                <Badge size="xs" color="blue" variant="dot">
                  Week
                </Badge>
                <Text size="sm" className="text-text-primary" lineClamp={1}>
                  {outcome.description}
                </Text>
              </Group>
            ))}

            {totalCount > 4 && (
              <Text size="xs" className="text-text-muted">
                +{totalCount - 4} more
              </Text>
            )}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
