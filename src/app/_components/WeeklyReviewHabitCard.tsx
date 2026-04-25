"use client";

import { Card, Group, Stack, Text, Badge, Button, Checkbox, Skeleton } from "@mantine/core";
import { IconFlame, IconCalendarWeek, IconArrowRight } from "@tabler/icons-react";
import Link from "next/link";
import { api } from "~/trpc/react";

export function WeeklyReviewHabitCard() {
  // Get user's workspaces to find the first/default one
  const { data: workspaces, isLoading: workspacesLoading } = api.workspace.list.useQuery();

  // Get first workspace (usually personal)
  const firstWorkspace = workspaces?.[0];

  // Fetch weekly review status for the first workspace
  const { data: completionStatus, isLoading: statusLoading } = api.weeklyReview.isCompletedThisWeek.useQuery(
    { workspaceId: firstWorkspace?.id },
    { enabled: !!firstWorkspace }
  );

  // Fetch streak data
  const { data: streakData, isLoading: streakLoading } = api.weeklyReview.getStreak.useQuery(
    { workspaceId: firstWorkspace?.id },
    { enabled: !!firstWorkspace }
  );

  const isLoading = workspacesLoading || statusLoading || streakLoading;
  const isCompleted = completionStatus?.isCompleted ?? false;
  const currentStreak = streakData?.currentStreak ?? 0;

  if (isLoading) {
    return (
      <Card withBorder className="border-brand-primary/30 bg-brand-primary/5" p="md" radius="md">
        <Group justify="space-between">
          <Group>
            <Skeleton height={24} width={24} radius="sm" />
            <Stack gap={0}>
              <Skeleton height={16} width={120} />
              <Skeleton height={12} width={180} mt={4} />
            </Stack>
          </Group>
          <Skeleton height={32} width={100} radius="sm" />
        </Group>
      </Card>
    );
  }

  if (!firstWorkspace) {
    return null;
  }

  const reviewUrl = `/w/${firstWorkspace.slug}/weekly-review`;

  return (
    <Card withBorder className="border-brand-primary/30 bg-brand-primary/5" p="md" radius="md">
      <Group justify="space-between" wrap="nowrap">
        <Group wrap="nowrap">
          <Checkbox
            checked={isCompleted}
            disabled
            size="md"
            styles={{
              input: {
                cursor: "default",
              },
            }}
          />
          <Stack gap={2}>
            <Group gap="xs">
              <IconCalendarWeek size={16} className="text-brand-primary" />
              <Text fw={500} size="sm">Weekly Review</Text>
              <Badge size="xs" color="blue" variant="light">
                Weekly
              </Badge>
            </Group>
            <Text size="xs" c="dimmed">
              Review all projects, set next actions, and align with your goals
            </Text>
          </Stack>
        </Group>

        <Group gap="sm" wrap="nowrap">
          {currentStreak > 0 && (
            <Badge
              size="sm"
              color="orange"
              variant="light"
              leftSection={<IconFlame size={12} />}
            >
              {currentStreak}w
            </Badge>
          )}
          <Button
            component={Link}
            href={reviewUrl}
            size="xs"
            variant={isCompleted ? "subtle" : "filled"}
            rightSection={!isCompleted && <IconArrowRight size={14} />}
          >
            {isCompleted ? "View" : "Start"}
          </Button>
        </Group>
      </Group>
    </Card>
  );
}
