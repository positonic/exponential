"use client";

import { useState } from "react";
import { TextInput, Kbd, Group, Text, Paper, Stack, Badge } from "@mantine/core";
import { IconStar } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";

export function DailyOutcomeCapture() {
  const [value, setValue] = useState("");
  const { workspaceId } = useWorkspace();
  const utils = api.useUtils();

  const createOutcome = api.outcome.createOutcome.useMutation({
    onSuccess: () => {
      setValue("");
      void utils.outcome.getMyOutcomes.invalidate();
      void utils.outcome.getByDateRange.invalidate();
    },
  });

  const handleSubmit = () => {
    if (!value.trim()) return;

    createOutcome.mutate({
      description: value.trim(),
      dueDate: new Date(),
      type: "daily",
      workspaceId: workspaceId ?? undefined,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Submit on Enter (without Shift) or Cmd/Ctrl + Enter
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Get today's outcomes to show below input
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const { data: todayOutcomes } = api.outcome.getByDateRange.useQuery({
    startDate: today,
    endDate: tomorrow,
    workspaceId: workspaceId ?? undefined,
  });

  const dailyOutcomes = todayOutcomes?.filter((o) => o.type === "daily") ?? [];

  return (
    <Paper
      p="md"
      radius="md"
      className="mb-6 border border-border-primary bg-surface-secondary"
    >
      <Group gap="sm" mb="sm">
        <IconStar size={18} className="text-yellow-500" />
        <Text size="sm" fw={500} className="text-text-secondary">
          What would make today great?
        </Text>
      </Group>

      <TextInput
        placeholder="Enter an outcome you'd love to achieve today..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={createOutcome.isPending}
        rightSection={
          <Group gap={4}>
            <Kbd size="xs">Enter</Kbd>
          </Group>
        }
        rightSectionWidth={60}
        size="md"
        radius="md"
        classNames={{
          input:
            "border-border-primary bg-background-primary focus:border-border-focus",
        }}
      />

      {/* Show today's daily outcomes */}
      {dailyOutcomes.length > 0 && (
        <Stack gap="xs" mt="md">
          <Text size="xs" className="text-text-muted">
            Today&apos;s outcomes:
          </Text>
          {dailyOutcomes.map((outcome) => (
            <Group key={outcome.id} gap="xs">
              <Badge size="xs" variant="dot" color="yellow">
                Today
              </Badge>
              <Text size="sm" className="text-text-primary">
                {outcome.description}
              </Text>
            </Group>
          ))}
        </Stack>
      )}
    </Paper>
  );
}
