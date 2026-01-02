"use client";

import { Stack, Text, SegmentedControl, Group, Loader, Center } from "@mantine/core";
import { useState } from "react";
import { api } from "~/trpc/react";
import { HabitCard } from "./HabitCard";
import { startOfDay } from "date-fns";

type FilterType = "all" | "active" | "inactive";

export function HabitList() {
  const [filter, setFilter] = useState<FilterType>("active");

  const { data: habits, isLoading } = api.habit.getMyHabits.useQuery();

  if (isLoading) {
    return (
      <Center py="xl">
        <Loader size="md" />
      </Center>
    );
  }

  if (!habits || habits.length === 0) {
    return (
      <Center py="xl">
        <Text c="dimmed">No habits yet. Create your first habit to get started!</Text>
      </Center>
    );
  }

  const filteredHabits = habits.filter((habit) => {
    if (filter === "all") return true;
    if (filter === "active") return habit.isActive;
    if (filter === "inactive") return !habit.isActive;
    return true;
  });

  // Check if each habit is completed today
  const today = startOfDay(new Date());
  const habitsWithTodayStatus = filteredHabits.map((habit) => {
    const isCompletedToday = habit.completions.some(
      (c) => startOfDay(new Date(c.completedDate)).getTime() === today.getTime()
    );
    return { ...habit, isCompletedToday };
  });

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={500}>Your Habits ({filteredHabits.length})</Text>
        <SegmentedControl
          size="xs"
          value={filter}
          onChange={(value) => setFilter(value as FilterType)}
          data={[
            { label: "Active", value: "active" },
            { label: "Inactive", value: "inactive" },
            { label: "All", value: "all" },
          ]}
        />
      </Group>

      {filteredHabits.length === 0 ? (
        <Center py="md">
          <Text c="dimmed">No {filter} habits found.</Text>
        </Center>
      ) : (
        <Stack gap="sm">
          {habitsWithTodayStatus.map((habit) => (
            <HabitCard
              key={habit.id}
              habit={habit}
              isCompletedToday={habit.isCompletedToday}
              showCalendar
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

// Today's habits quick view
export function TodayHabits() {
  const { data: todayHabits, isLoading } = api.habit.getTodayStatus.useQuery();

  if (isLoading) {
    return (
      <Center py="md">
        <Loader size="sm" />
      </Center>
    );
  }

  if (!todayHabits || todayHabits.length === 0) {
    return (
      <Center py="md">
        <Text c="dimmed" size="sm">
          No habits scheduled for today.
        </Text>
      </Center>
    );
  }

  const completedCount = todayHabits.filter((h) => h.isCompletedToday).length;
  const totalCount = todayHabits.length;

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text fw={500}>Today&apos;s Habits</Text>
        <Text size="sm" c="dimmed">
          {completedCount} / {totalCount} completed
        </Text>
      </Group>

      <Stack gap="xs">
        {todayHabits.map((habit) => (
          <HabitCard
            key={habit.id}
            habit={habit}
            isCompletedToday={habit.isCompletedToday}
            showCalendar={false}
          />
        ))}
      </Stack>
    </Stack>
  );
}
