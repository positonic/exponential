"use client";

import {
  Card,
  Text,
  Badge,
  Group,
  ActionIcon,
  Menu,
  Checkbox,
  Stack,
} from "@mantine/core";
import {
  IconDots,
  IconEdit,
  IconTrash,
  IconFlame,
  IconTarget,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { CreateHabitModal } from "./CreateHabitModal";
import { MiniStreakCalendar } from "./HabitStreakCalendar";
import { startOfDay } from "date-fns";

interface HabitCompletion {
  id: string;
  completedDate: Date;
  notes: string | null;
  duration: number | null;
  rating: number | null;
}

interface HabitCardProps {
  habit: {
    id: string;
    title: string;
    description: string | null;
    frequency: string;
    daysOfWeek: number[];
    timeOfDay: string | null;
    startDate: Date;
    endDate: Date | null;
    isActive: boolean;
    goalId: number | null;
    goal: { id: number; title: string } | null;
    completions: HabitCompletion[];
  };
  isCompletedToday?: boolean;
  showCalendar?: boolean;
}

const FREQUENCY_LABELS: Record<string, string> = {
  daily: "Daily",
  "3x_week": "3x/week",
  weekly: "Weekly",
  bi_weekly: "Bi-weekly",
  monthly: "Monthly",
  custom: "Custom",
};

export function HabitCard({
  habit,
  isCompletedToday = false,
  showCalendar = true,
}: HabitCardProps) {
  const utils = api.useUtils();

  const toggleCompletion = api.habit.toggleCompletion.useMutation({
    onMutate: async () => {
      // Optimistic update
      await utils.habit.getTodayStatus.cancel();
      await utils.habit.getMyHabits.cancel();
    },
    onSettled: () => {
      void utils.habit.getTodayStatus.invalidate();
      void utils.habit.getMyHabits.invalidate();
    },
  });

  const deleteHabit = api.habit.deleteHabit.useMutation({
    onSuccess: () => {
      void utils.habit.getMyHabits.invalidate();
      void utils.habit.getTodayStatus.invalidate();
    },
  });

  const handleToggle = () => {
    toggleCompletion.mutate({
      habitId: habit.id,
      date: startOfDay(new Date()),
    });
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this habit?")) {
      deleteHabit.mutate({ id: habit.id });
    }
  };

  // Calculate current streak (simplified)
  const currentStreak = habit.completions.length > 0
    ? calculateStreak(habit.completions)
    : 0;

  return (
    <Card withBorder padding="md" radius="md">
      <Group justify="space-between" mb="xs">
        <Group gap="sm">
          <Checkbox
            checked={isCompletedToday}
            onChange={handleToggle}
            disabled={toggleCompletion.isPending}
            size="lg"
            styles={{
              input: {
                cursor: "pointer",
              },
            }}
          />
          <div>
            <Text fw={500} lineClamp={1}>
              {habit.title}
            </Text>
            {habit.description && (
              <Text size="xs" c="dimmed" lineClamp={1}>
                {habit.description}
              </Text>
            )}
          </div>
        </Group>

        <Group gap="xs">
          <Badge variant="light" size="sm">
            {FREQUENCY_LABELS[habit.frequency] ?? habit.frequency}
          </Badge>

          {currentStreak > 0 && (
            <Badge
              variant="gradient"
              gradient={{ from: "orange", to: "red" }}
              size="sm"
              leftSection={<IconFlame size={12} />}
            >
              {currentStreak}
            </Badge>
          )}

          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" size="sm">
                <IconDots size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <CreateHabitModal
                habit={{
                  id: habit.id,
                  title: habit.title,
                  description: habit.description,
                  frequency: habit.frequency,
                  daysOfWeek: habit.daysOfWeek,
                  timeOfDay: habit.timeOfDay,
                  startDate: habit.startDate,
                  endDate: habit.endDate,
                  goalId: habit.goalId,
                }}
                trigger={
                  <Menu.Item leftSection={<IconEdit size={14} />}>
                    Edit
                  </Menu.Item>
                }
              />
              <Menu.Item
                leftSection={<IconTrash size={14} />}
                color="red"
                onClick={handleDelete}
              >
                Delete
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>

      {habit.goal && (
        <Group gap="xs" mb="sm">
          <IconTarget size={14} className="text-text-muted" />
          <Text size="xs" c="dimmed">
            {habit.goal.title}
          </Text>
        </Group>
      )}

      {showCalendar && habit.completions.length > 0 && (
        <Stack gap="xs" mt="sm">
          <Text size="xs" c="dimmed">
            Last 30 days
          </Text>
          <MiniStreakCalendar completions={habit.completions} />
        </Stack>
      )}
    </Card>
  );
}

// Helper function to calculate current streak
function calculateStreak(completions: HabitCompletion[]): number {
  if (completions.length === 0) return 0;

  const today = startOfDay(new Date());
  const sortedCompletions = [...completions].sort(
    (a, b) =>
      new Date(b.completedDate).getTime() - new Date(a.completedDate).getTime()
  );

  let streak = 0;
  let checkDate = today;

  for (const completion of sortedCompletions) {
    const completionDate = startOfDay(new Date(completion.completedDate));
    const dayDiff = Math.floor(
      (checkDate.getTime() - completionDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (dayDiff === 0 || dayDiff === 1) {
      streak++;
      checkDate = completionDate;
    } else {
      break;
    }
  }

  return streak;
}
