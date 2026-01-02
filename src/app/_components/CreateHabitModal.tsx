"use client";

import {
  Modal,
  Button,
  Group,
  TextInput,
  Select,
  Text,
  Textarea,
  MultiSelect,
} from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { useState, useEffect } from "react";
import { api } from "~/trpc/react";
import { UnifiedDatePicker } from "./UnifiedDatePicker";

interface CreateHabitModalProps {
  children?: React.ReactNode;
  habit?: {
    id: string;
    title: string;
    description: string | null;
    frequency: string;
    daysOfWeek: number[];
    timeOfDay: string | null;
    startDate: Date;
    endDate: Date | null;
    goalId: number | null;
  };
  trigger?: React.ReactNode;
  defaultGoalId?: number;
}

const FREQUENCY_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "3x_week", label: "3x per week" },
  { value: "weekly", label: "Weekly" },
  { value: "bi_weekly", label: "Bi-weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "custom", label: "Custom days" },
];

const DAY_OPTIONS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

export function CreateHabitModal({
  children,
  habit,
  trigger,
  defaultGoalId,
}: CreateHabitModalProps) {
  const [opened, { open, close }] = useDisclosure(false);
  const [title, setTitle] = useState(habit?.title ?? "");
  const [description, setDescription] = useState(habit?.description ?? "");
  const [frequency, setFrequency] = useState(habit?.frequency ?? "daily");
  const [daysOfWeek, setDaysOfWeek] = useState<string[]>(
    habit?.daysOfWeek?.map(String) ?? []
  );
  const [timeOfDay, setTimeOfDay] = useState(habit?.timeOfDay ?? "");
  const [startDate, setStartDate] = useState<Date | null>(
    habit?.startDate ?? null
  );
  const [endDate, setEndDate] = useState<Date | null>(habit?.endDate ?? null);
  const [goalId, setGoalId] = useState<string | null>(
    habit?.goalId?.toString() ?? defaultGoalId?.toString() ?? null
  );

  const utils = api.useUtils();
  const { data: goals } = api.goal.getAllMyGoals.useQuery();

  const createHabit = api.habit.createHabit.useMutation({
    onSuccess: () => {
      void utils.habit.getMyHabits.invalidate();
      void utils.habit.getTodayStatus.invalidate();
      resetForm();
      close();
    },
  });

  const updateHabit = api.habit.updateHabit.useMutation({
    onSuccess: () => {
      void utils.habit.getMyHabits.invalidate();
      void utils.habit.getTodayStatus.invalidate();
      resetForm();
      close();
    },
  });

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setFrequency("daily");
    setDaysOfWeek([]);
    setTimeOfDay("");
    setStartDate(null);
    setEndDate(null);
    setGoalId(defaultGoalId?.toString() ?? null);
  };

  useEffect(() => {
    if (habit) {
      setTitle(habit.title);
      setDescription(habit.description ?? "");
      setFrequency(habit.frequency);
      setDaysOfWeek(habit.daysOfWeek.map(String));
      setTimeOfDay(habit.timeOfDay ?? "");
      setStartDate(habit.startDate);
      setEndDate(habit.endDate);
      setGoalId(habit.goalId?.toString() ?? null);
    }
  }, [habit]);

  useEffect(() => {
    if (defaultGoalId && !habit) {
      setGoalId(defaultGoalId.toString());
    }
  }, [defaultGoalId, habit]);

  const showDaysOfWeek = frequency === "3x_week" || frequency === "custom";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;

    const habitData = {
      title,
      description: description || undefined,
      frequency: frequency as
        | "daily"
        | "3x_week"
        | "weekly"
        | "bi_weekly"
        | "monthly"
        | "custom",
      daysOfWeek: showDaysOfWeek ? daysOfWeek.map(Number) : undefined,
      timeOfDay: timeOfDay || undefined,
      startDate: startDate ?? undefined,
      endDate: endDate ?? undefined,
      goalId: goalId ? parseInt(goalId) : undefined,
    };

    if (habit?.id) {
      updateHabit.mutate({
        id: habit.id,
        ...habitData,
      });
    } else {
      createHabit.mutate(habitData);
    }
  };

  return (
    <>
      {trigger ? (
        <div onClick={open}>{trigger}</div>
      ) : children ? (
        <div onClick={open}>{children}</div>
      ) : (
        <Button leftSection={<IconPlus size={16} />} onClick={open}>
          Add Habit
        </Button>
      )}

      <Modal
        opened={opened}
        onClose={close}
        size="lg"
        radius="md"
        padding="lg"
        styles={{
          header: { display: "none" },
          body: { padding: 0 },
        }}
      >
        <form onSubmit={handleSubmit} className="p-4">
          <TextInput
            placeholder="What habit do you want to build?"
            variant="unstyled"
            size="xl"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            styles={{
              input: {
                fontSize: "24px",
              },
            }}
          />

          <Textarea
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            mt="md"
            minRows={2}
            autosize
          />

          <Select
            label="Frequency"
            data={FREQUENCY_OPTIONS}
            value={frequency}
            onChange={(value) => setFrequency(value ?? "daily")}
            required
            mt="md"
          />

          {showDaysOfWeek && (
            <MultiSelect
              label="Days of the week"
              placeholder="Select days"
              data={DAY_OPTIONS}
              value={daysOfWeek}
              onChange={setDaysOfWeek}
              mt="md"
            />
          )}

          <TextInput
            label="Reminder time (optional)"
            placeholder="08:00"
            value={timeOfDay}
            onChange={(e) => setTimeOfDay(e.target.value)}
            mt="md"
            description="Format: HH:MM (24-hour)"
          />

          <div className="mt-4">
            <Text size="sm" fw={500} mb={4}>
              Start date (optional)
            </Text>
            <UnifiedDatePicker
              value={startDate}
              onChange={setStartDate}
              notificationContext="habit"
            />
          </div>

          <div className="mt-4">
            <Text size="sm" fw={500} mb={4}>
              End date (optional)
            </Text>
            <UnifiedDatePicker
              value={endDate}
              onChange={setEndDate}
              notificationContext="habit"
            />
          </div>

          <Select
            label="Link to goal (optional)"
            placeholder="Select a goal"
            data={goals?.map((g) => ({ value: g.id.toString(), label: g.title })) ?? []}
            value={goalId}
            onChange={setGoalId}
            clearable
            mt="md"
          />

          <Group justify="flex-end" mt="xl">
            <Button variant="subtle" color="gray" onClick={close}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={createHabit.isPending || updateHabit.isPending}
              disabled={!title}
            >
              {habit ? "Update Habit" : "Create Habit"}
            </Button>
          </Group>
        </form>
      </Modal>
    </>
  );
}
