"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, Text, Stack, Group, Button, Skeleton } from "@mantine/core";
import { IconSparkles, IconRefresh, IconCheck } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { startOfWeek, endOfWeek, isSameDay, getDay } from "date-fns";
import { useWorkspace } from "~/providers/WorkspaceProvider";

export function AiNextBestStep() {
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const { workspaceId } = useWorkspace();

  // Check user preference
  const { data: preferences, isLoading: preferencesLoading } =
    api.navigationPreference.getPreferences.useQuery();

  const today = new Date();
  const dayOfWeek = today.toLocaleDateString("en-US", { weekday: "long" });
  const isMonday = getDay(today) === 1;
  const isSunday = getDay(today) === 0;

  // Gather context from various sources
  const { data: todayActions } = api.action.getToday.useQuery({ workspaceId: workspaceId ?? undefined });
  const { data: calendarEvents } = api.calendar.getTodayEvents.useQuery();
  const { data: habitStatus } = api.habit.getTodayStatus.useQuery();
  const { data: weekOutcomes } = api.outcome.getByDateRange.useQuery({
    startDate: startOfWeek(today, { weekStartsOn: 1 }),
    endDate: endOfWeek(today, { weekStartsOn: 1 }),
    workspaceId: workspaceId ?? undefined,
  });
  const { data: activeProjects } =
    api.project.getActiveWithDetails.useQuery({
      workspaceId: workspaceId ?? undefined,
    });

  const getNextBestStep = api.mastra.getNextBestStep.useMutation({
    onSuccess: (data) => {
      setSuggestion(data.suggestion);
      setHasFetched(true);
    },
    onError: () => {
      setSuggestion(
        "Take a moment to appreciate what you've already accomplished. Small wins matter."
      );
      setHasFetched(true);
    },
  });

  // Calculate context values
  const pendingActionsCount =
    todayActions?.filter((a) => a.status !== "COMPLETED").length ?? 0;
  const calendarEventsCount = calendarEvents?.length ?? 0;
  const dailyOutcomesCount =
    weekOutcomes?.filter(
      (o) =>
        o.type === "daily" && o.dueDate && isSameDay(new Date(o.dueDate), today)
    ).length ?? 0;
  const weeklyOutcomesCount =
    weekOutcomes?.filter((o) => o.type === "weekly").length ?? 0;
  const completedHabitsCount =
    habitStatus?.filter((h) => h.isCompletedToday).length ?? 0;
  const totalHabitsCount = habitStatus?.length ?? 0;

  // Identify stale projects (no recent action activity)
  // Since actions don't have createdAt, we check for completedAt on completed actions
  const staleProjectIds =
    activeProjects
      ?.filter((p) => {
        if (p.actions.length === 0) return true;
        // Check if any action was completed recently
        const completedActions = p.actions.filter((a) => a.completedAt);
        if (completedActions.length === 0) {
          // No completed actions - check if project has any ACTIVE actions as activity indicator
          const activeActions = p.actions.filter((a) => a.status === "ACTIVE");
          return activeActions.length === 0;
        }
        // Find most recent completion
        const latestCompletion = completedActions.reduce((latest, action) => {
          const completedAt = action.completedAt ? new Date(action.completedAt) : new Date(0);
          return completedAt > latest ? completedAt : latest;
        }, new Date(0));
        const daysSince = Math.floor(
          (Date.now() - latestCompletion.getTime()) / (1000 * 60 * 60 * 24)
        );
        return daysSince > 7;
      })
      .map((p) => p.id) ?? [];

  const fetchSuggestion = useCallback(() => {
    getNextBestStep.mutate({
      context: {
        pendingActionsCount,
        overdueActionsCount: 0, // Simplified - could add separate query
        calendarEventsCount,
        dailyOutcomesCount,
        weeklyOutcomesCount,
        completedHabitsCount,
        totalHabitsCount,
        staleProjectIds,
        dayOfWeek,
        isMonday,
        isSunday,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getNextBestStep.mutate is stable, including the mutation object causes infinite re-renders
  }, [
    pendingActionsCount,
    calendarEventsCount,
    dailyOutcomesCount,
    weeklyOutcomesCount,
    completedHabitsCount,
    totalHabitsCount,
    staleProjectIds,
    dayOfWeek,
    isMonday,
    isSunday,
  ]);

  // Auto-fetch on mount when data is ready
  useEffect(() => {
    if (
      !hasFetched &&
      todayActions !== undefined &&
      habitStatus !== undefined &&
      weekOutcomes !== undefined
    ) {
      fetchSuggestion();
    }
  }, [hasFetched, todayActions, habitStatus, weekOutcomes, fetchSuggestion]);

  // Don't render if preference is disabled
  if (preferencesLoading) {
    return null;
  }

  if (preferences?.showSuggestedFocus === false) {
    return null;
  }

  // If user has set daily outcome(s), show "focused" state instead of AI suggestion
  if (dailyOutcomesCount > 0) {
    return (
      <Card
        withBorder
        radius="md"
        className="border-green-600/30 bg-surface-secondary"
      >
        <Stack gap="sm">
          <Group gap="xs">
            <IconCheck size={18} className="text-green-600" />
            <Text fw={600} size="sm" className="text-text-primary">
              Today&apos;s Focus Set
            </Text>
          </Group>
          <Text size="sm" className="text-text-secondary">
            You have {dailyOutcomesCount} intention{dailyOutcomesCount > 1 ? "s" : ""} for today. Stay focused!
          </Text>
        </Stack>
      </Card>
    );
  }

  return (
    <Card
      withBorder
      radius="md"
      className="border-brand-primary/30 bg-surface-secondary"
    >
      <Stack gap="md">
        <Group justify="space-between">
          <Group gap="xs">
            <IconSparkles size={18} className="text-brand-primary" />
            <Text fw={600} size="sm" className="text-text-primary">
              Suggested Focus
            </Text>
          </Group>
          <Button
            variant="subtle"
            size="xs"
            leftSection={<IconRefresh size={14} />}
            onClick={fetchSuggestion}
            loading={getNextBestStep.isPending}
          >
            Refresh
          </Button>
        </Group>

        {getNextBestStep.isPending && !suggestion ? (
          <Skeleton height={40} radius="sm" />
        ) : suggestion ? (
          <Text size="sm" className="text-text-primary">
            {suggestion}
          </Text>
        ) : (
          <Text size="sm" className="text-text-muted">
            Loading suggestion...
          </Text>
        )}
      </Stack>
    </Card>
  );
}
