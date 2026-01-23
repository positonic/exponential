"use client";

import { useState } from "react";
import { Stack, Group, Title, Text, Button, Paper } from "@mantine/core";
import { IconClock } from "@tabler/icons-react";
import type { RouterOutputs } from "~/trpc/react";
import { api } from "~/trpc/react";
import { TimeGrid } from "../TimeGrid";
import {
  SchedulingSuggestionsModal,
  type SchedulingSuggestion,
} from "../SchedulingSuggestionsModal";

type DailyPlan = RouterOutputs["dailyPlan"]["getOrCreateToday"];
type DailyPlanAction = DailyPlan["plannedActions"][number];

interface ScheduleStepProps {
  dailyPlan: DailyPlan;
  tasks: DailyPlanAction[];
  planDate: Date;
  workHoursStart: string;
  workHoursEnd: string;
  onUpdateTask: (
    taskId: string,
    updates: { scheduledStart?: Date | null; scheduledEnd?: Date | null; schedulingMethod?: string | null }
  ) => Promise<void>;
  onRefetch: () => void;
  onNext: () => void;
  onBack: () => void;
}

export function ScheduleStep({
  dailyPlan,
  tasks,
  planDate,
  workHoursStart,
  workHoursEnd,
  onUpdateTask,
  onRefetch,
  onNext,
  onBack,
}: ScheduleStepProps) {
  const [suggestionsModalOpen, setSuggestionsModalOpen] = useState(false);

  // Get calendar events for the plan date
  const timeMin = new Date(planDate);
  timeMin.setHours(0, 0, 0, 0);
  const timeMax = new Date(planDate);
  timeMax.setHours(23, 59, 59, 999);

  const { data: connectionStatus } = api.calendar.getConnectionStatus.useQuery();
  const { data: calendarEvents } = api.calendar.getEvents.useQuery(
    { timeMin, timeMax, maxResults: 50 },
    { enabled: connectionStatus?.isConnected }
  );

  // Get scheduling suggestions query
  const {
    data: suggestionsData,
    isLoading: isLoadingSuggestions,
    refetch: refetchSuggestions,
  } = api.scheduling.getSuggestionsForDailyPlan.useQuery(
    { dailyPlanId: dailyPlan.id },
    { enabled: false } // Only fetch when requested
  );

  // Apply suggestions mutation
  const applySuggestionsMutation = api.scheduling.applySuggestions.useMutation({
    onSuccess: () => {
      onRefetch();
      setSuggestionsModalOpen(false);
    },
  });

  const handleScheduleTask = async (
    taskId: string,
    scheduledStart: Date,
    scheduledEnd: Date
  ) => {
    // When manually scheduling, clear the auto-suggested method
    await onUpdateTask(taskId, { scheduledStart, scheduledEnd, schedulingMethod: "manual" });
  };

  const handleGetSuggestions = async () => {
    await refetchSuggestions();
    setSuggestionsModalOpen(true);
  };

  const handleApplySuggestions = async (suggestions: SchedulingSuggestion[]) => {
    await applySuggestionsMutation.mutateAsync({
      suggestions: suggestions.map((s) => ({
        taskId: s.taskId,
        scheduledStart: s.suggestedStart,
        scheduledEnd: s.suggestedEnd,
      })),
    });
  };

  // Transform suggestions data to modal format
  const modalSuggestions: SchedulingSuggestion[] = (suggestionsData?.suggestions ?? []).map((s) => ({
    taskId: s.taskId,
    taskName: s.taskName,
    duration: s.duration,
    suggestedStart: new Date(s.suggestedStart),
    suggestedEnd: new Date(s.suggestedEnd),
    reasoning: s.reasoning,
    score: s.score,
  }));

  return (
    <Group align="flex-start" gap="xl" wrap="nowrap">
      {/* Left Panel: Instructions */}
      <Stack w={280} gap="lg">
        <div>
          <Title order={3} className="text-text-primary">
            Schedule your tasks
          </Title>
          <Text c="dimmed" size="sm" mt="xs">
            Drag tasks to the timeline to time-block your day, or skip this step
            to work through your list flexibly.
          </Text>
        </div>

        <Paper
          p="md"
          className="bg-surface-secondary border border-border-primary"
        >
          <Group gap="xs" mb="sm">
            <IconClock size={16} className="text-text-muted" />
            <Text fw={600} size="sm" className="text-text-primary">
              Quick Tips
            </Text>
          </Group>
          <Stack gap="xs">
            <Text size="xs" c="dimmed">
              • Click &quot;Get Suggestions&quot; for AI scheduling
            </Text>
            <Text size="xs" c="dimmed">
              • Drag tasks to specific time slots
            </Text>
            <Text size="xs" c="dimmed">
              • Tasks auto-calculate end time
            </Text>
            <Text size="xs" c="dimmed">
              • Gray slots show calendar events
            </Text>
          </Stack>
        </Paper>

        <Stack gap="xs">
          <Button variant="default" onClick={onNext} className="border-border-primary">
            Next
          </Button>
          <Button variant="subtle" onClick={onBack}>
            Back
          </Button>
        </Stack>
      </Stack>

      {/* Right: Time Grid */}
      <Stack flex={1}>
        <TimeGrid
          planDate={planDate}
          tasks={tasks}
          calendarEvents={calendarEvents ?? []}
          onScheduleTask={handleScheduleTask}
          workHoursStart={workHoursStart}
          workHoursEnd={workHoursEnd}
          onGetSuggestions={() => void handleGetSuggestions()}
          isLoadingSuggestions={isLoadingSuggestions}
        />
      </Stack>

      {/* Scheduling Suggestions Modal */}
      <SchedulingSuggestionsModal
        opened={suggestionsModalOpen}
        onClose={() => setSuggestionsModalOpen(false)}
        suggestions={modalSuggestions}
        isLoading={isLoadingSuggestions}
        calendarConnected={suggestionsData?.calendarConnected ?? true}
        onApply={handleApplySuggestions}
        isApplying={applySuggestionsMutation.isPending}
      />
    </Group>
  );
}
