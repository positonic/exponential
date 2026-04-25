"use client";

import { Stack, Text, Group, Checkbox, Badge, Paper } from "@mantine/core";
import { IconChecklist } from "@tabler/icons-react";
import { api } from "~/trpc/react";

interface ActionsDueTodayProps {
  workspaceId?: string;
}

export function ActionsDueToday({ workspaceId }: ActionsDueTodayProps) {
  const { data: todayActions, isLoading } = api.action.getToday.useQuery({
    workspaceId,
  });
  const utils = api.useUtils();

  // Get overdue actions (due before today, not completed)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: overdueActions } = api.action.getByDateRange.useQuery({
    startDate: new Date(2020, 0, 1), // Far past
    endDate: today,
    workspaceId,
  });

  const filteredOverdue =
    overdueActions?.filter((a) => a.status !== "COMPLETED") ?? [];

  const updateAction = api.action.update.useMutation({
    onSuccess: () => {
      void utils.action.getToday.invalidate();
      void utils.action.getByDateRange.invalidate();
    },
  });

  const handleToggle = (actionId: string, currentStatus: string) => {
    updateAction.mutate({
      id: actionId,
      status: currentStatus === "COMPLETED" ? "ACTIVE" : "COMPLETED",
    });
  };

  // Combine overdue and today's actions
  const combinedActions = [
    ...filteredOverdue.map((a) => ({ ...a, isOverdue: true })),
    ...(todayActions?.map((a) => ({ ...a, isOverdue: false })) ?? []),
  ];

  const pendingCount = combinedActions.filter(
    (a) => a.status !== "COMPLETED"
  ).length;

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

  return (
    <Paper p="md" className="rounded-md bg-background-primary">
      <Stack gap="sm">
        <Group gap="xs">
          <IconChecklist size={16} className="text-text-muted" />
          <Text size="sm" fw={500} className="text-text-secondary">
            Actions {pendingCount > 0 && `(${pendingCount})`}
          </Text>
        </Group>

        {combinedActions.length === 0 ? (
          <Text size="sm" className="text-text-muted">
            No actions scheduled for today
          </Text>
        ) : (
          <Stack gap="xs">
            {combinedActions.slice(0, 5).map((action) => (
              <Group key={action.id} gap="sm" wrap="nowrap">
                <Checkbox
                  checked={action.status === "COMPLETED"}
                  onChange={() => handleToggle(action.id, action.status)}
                  size="sm"
                />
                <Text
                  size="sm"
                  className={
                    action.status === "COMPLETED"
                      ? "line-through text-text-muted"
                      : "text-text-primary"
                  }
                  lineClamp={1}
                >
                  {action.name}
                </Text>
                {action.isOverdue && (
                  <Badge size="xs" variant="light" color="gray">
                    from earlier
                  </Badge>
                )}
              </Group>
            ))}

            {combinedActions.length > 5 && (
              <Text size="xs" className="text-text-muted">
                +{combinedActions.length - 5} more
              </Text>
            )}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
