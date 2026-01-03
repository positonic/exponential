"use client";

import {
  Card,
  Text,
  Group,
  Stack,
  Badge,
  ActionIcon,
} from "@mantine/core";
import {
  IconDots,
  IconActivity,
  IconCalendar,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { ActionList } from "./ActionList";
import { isSameDay } from "date-fns";

// Helper function to get outcome type color
function getOutcomeTypeColor(type: string): string {
  switch (type.toLowerCase()) {
    case "daily":
      return "blue";
    case "weekly":
      return "green";
    case "monthly":
      return "violet";
    case "quarterly":
      return "orange";
    case "annual":
      return "red";
    default:
      return "gray";
  }
}

// Helper function to format outcome type for display
function formatOutcomeType(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function TodayOverview() {
  const { data: actions = [] } = api.action.getToday.useQuery();
  const { data: outcomes = [] } = api.outcome.getMyOutcomes.useQuery();

  // Filter outcomes that are due today
  const today = new Date();
  const outcomesToday = outcomes.filter(
    (outcome) => outcome.dueDate && isSameDay(outcome.dueDate, today)
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Left Column - Today's Actions */}
      <div className="lg:col-span-2">
        <Card
          withBorder
          radius="md"
          className="border-border-primary bg-surface-secondary"
        >
          {/* Card Header */}
          <Group justify="space-between" mb="lg">
            <Text fw={600} size="lg" className="text-text-primary">
              Today&apos;s Actions
            </Text>
            <ActionIcon variant="subtle" size="md">
              <IconDots size={16} />
            </ActionIcon>
          </Group>

          {/* Action List */}
          <ActionList
            viewName="today"
            actions={actions}
            showCheckboxes={false}
            enableBulkEditForOverdue={true}
          />
        </Card>
      </div>

      {/* Right Column - Sidebar */}
      <div className="space-y-6">
        {/* Today's Outcomes Card */}
        <Card
          withBorder
          radius="md"
          className="border-border-primary bg-surface-secondary"
        >
          <Group justify="space-between" mb="md">
            <Group gap="xs">
              <IconActivity size={18} className="text-text-primary" />
              <Text fw={600} size="lg" className="text-text-primary">
                Today&apos;s Outcomes
              </Text>
            </Group>
            <ActionIcon variant="subtle" size="md">
              <IconDots size={16} />
            </ActionIcon>
          </Group>

          <Stack gap="md">
            {outcomesToday.length > 0 ? (
              outcomesToday.map((outcome) => (
                <Group
                  key={outcome.id}
                  gap="sm"
                  align="flex-start"
                  className="cursor-pointer rounded-md p-2 hover:bg-surface-hover"
                >
                  <Stack gap={2} style={{ flex: 1 }}>
                    <Group justify="space-between" wrap="nowrap">
                      <Text
                        size="sm"
                        fw={500}
                        className="text-text-primary"
                        lineClamp={2}
                      >
                        {outcome.description}
                      </Text>
                    </Group>
                    <Group gap="xs">
                      {outcome.type && (
                        <Badge
                          variant="light"
                          color={getOutcomeTypeColor(outcome.type)}
                          size="xs"
                        >
                          {formatOutcomeType(outcome.type)}
                        </Badge>
                      )}
                      {outcome.dueDate && (
                        <Group gap={4} align="center" className="text-xs text-text-muted">
                          <IconCalendar size={12} />
                          <span>
                            {outcome.dueDate.toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </Group>
                      )}
                    </Group>
                  </Stack>
                </Group>
              ))
            ) : (
              <Text size="sm" c="dimmed" ta="center" py="md">
                No outcomes due today
              </Text>
            )}
          </Stack>
        </Card>
      </div>
    </div>
  );
}
