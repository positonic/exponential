"use client";

import { Container, Title, Group, Stack, Paper, Text, SimpleGrid, ThemeIcon } from "@mantine/core";
import { IconFlame, IconCheck, IconCalendar, IconPlus } from "@tabler/icons-react";
import { CreateHabitModal } from "~/app/_components/CreateHabitModal";
import { HabitList, TodayHabits } from "~/app/_components/HabitList";
import { HabitStreakCalendar } from "~/app/_components/HabitStreakCalendar";
import { api } from "~/trpc/react";
import { subDays, startOfDay } from "date-fns";
import { useMemo } from "react";

export default function HabitsPage() {
  // Memoize date range to prevent infinite query loops
  const dateRange = useMemo(() => {
    const today = startOfDay(new Date());
    return {
      startDate: subDays(today, 90),
      endDate: today,
    };
  }, []);

  const { data: habits } = api.habit.getMyHabits.useQuery();
  const { data: completions } = api.habit.getCompletions.useQuery(dateRange);

  // Calculate stats
  const totalHabits = habits?.filter((h) => h.isActive).length ?? 0;
  const totalCompletions = completions?.length ?? 0;

  // Calculate longest current streak across all habits
  const longestStreak = habits?.reduce((max, habit) => {
    const streak = calculateCurrentStreak(habit.completions);
    return Math.max(max, streak);
  }, 0) ?? 0;

  return (
    <Container size="xl" py="md">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between">
          <div>
            <Title order={2}>Habits</Title>
            <Text c="dimmed" size="sm">
              Build consistent routines to achieve your goals
            </Text>
          </div>
          <CreateHabitModal>
            <Group gap="xs" className="cursor-pointer text-brand-primary hover:opacity-80">
              <IconPlus size={18} />
              <Text fw={500}>Add Habit</Text>
            </Group>
          </CreateHabitModal>
        </Group>

        {/* Stats Cards */}
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <Paper withBorder p="md" radius="md">
            <Group>
              <ThemeIcon size="lg" variant="light" color="blue">
                <IconCalendar size={20} />
              </ThemeIcon>
              <div>
                <Text size="xl" fw={700}>
                  {totalHabits}
                </Text>
                <Text size="xs" c="dimmed">
                  Active Habits
                </Text>
              </div>
            </Group>
          </Paper>

          <Paper withBorder p="md" radius="md">
            <Group>
              <ThemeIcon size="lg" variant="light" color="green">
                <IconCheck size={20} />
              </ThemeIcon>
              <div>
                <Text size="xl" fw={700}>
                  {totalCompletions}
                </Text>
                <Text size="xs" c="dimmed">
                  Completions (90 days)
                </Text>
              </div>
            </Group>
          </Paper>

          <Paper withBorder p="md" radius="md">
            <Group>
              <ThemeIcon size="lg" variant="light" color="orange">
                <IconFlame size={20} />
              </ThemeIcon>
              <div>
                <Text size="xl" fw={700}>
                  {longestStreak}
                </Text>
                <Text size="xs" c="dimmed">
                  Best Current Streak
                </Text>
              </div>
            </Group>
          </Paper>
        </SimpleGrid>

        {/* Today's Habits */}
        <Paper withBorder p="md" radius="md">
          <TodayHabits />
        </Paper>

        {/* Overall Streak Calendar */}
        {completions && completions.length > 0 && (
          <Paper withBorder p="md" radius="md">
            <Stack gap="sm">
              <Text fw={500}>All Activity (Last 90 Days)</Text>
              <HabitStreakCalendar completions={completions} days={90} />
            </Stack>
          </Paper>
        )}

        {/* All Habits */}
        <Paper withBorder p="md" radius="md">
          <HabitList />
        </Paper>
      </Stack>
    </Container>
  );
}

// Helper function
function calculateCurrentStreak(
  completions: { completedDate: Date }[]
): number {
  if (completions.length === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sortedCompletions = [...completions].sort(
    (a, b) =>
      new Date(b.completedDate).getTime() - new Date(a.completedDate).getTime()
  );

  let streak = 0;
  let checkDate = today;

  for (const completion of sortedCompletions) {
    const completionDate = new Date(completion.completedDate);
    completionDate.setHours(0, 0, 0, 0);

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
