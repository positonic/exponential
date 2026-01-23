"use client";

import { Stack, Title, Text, Button, SegmentedControl, Paper } from "@mantine/core";
import { IconSun, IconMoon } from "@tabler/icons-react";
import { addDays, format } from "date-fns";

type PlanDate = "today" | "tomorrow";

interface WelcomeStepProps {
  selectedDate: PlanDate;
  onDateChange: (date: PlanDate) => void;
  onStart: () => void;
}

export function WelcomeStep({ selectedDate, onDateChange, onStart }: WelcomeStepProps) {
  const currentHour = new Date().getHours();
  const isAfternoon = currentHour >= 14;

  const today = new Date();
  const tomorrow = addDays(today, 1);

  return (
    <Stack align="flex-start" gap="xl" py={60} maw={500}>
      <div>
        <Title
          order={2}
          className="text-text-primary"
          style={{ fontStyle: "italic" }}
        >
          Welcome to your new daily planning routine
        </Title>
        <Text c="dimmed" mt="md">
          Once per day, we will help you plan your day.
        </Text>
      </div>

      {/* Date Selection */}
      <Paper p="md" className="w-full bg-surface-secondary border border-border-primary">
        <Text fw={500} size="sm" className="text-text-primary" mb="sm">
          Which day would you like to plan?
        </Text>

        <SegmentedControl
          value={selectedDate}
          onChange={(value) => onDateChange(value as PlanDate)}
          fullWidth
          data={[
            {
              value: "today",
              label: (
                <div className="flex items-center gap-2 py-1">
                  <IconSun size={16} />
                  <div className="text-left">
                    <div className="font-medium">Today</div>
                    <div className="text-xs opacity-70">{format(today, "EEEE, MMM d")}</div>
                  </div>
                </div>
              ),
            },
            {
              value: "tomorrow",
              label: (
                <div className="flex items-center gap-2 py-1">
                  <IconMoon size={16} />
                  <div className="text-left">
                    <div className="font-medium">Tomorrow</div>
                    <div className="text-xs opacity-70">{format(tomorrow, "EEEE, MMM d")}</div>
                  </div>
                </div>
              ),
            },
          ]}
          styles={{
            root: { backgroundColor: 'var(--background-primary)' },
          }}
        />

        {isAfternoon && selectedDate === "today" && (
          <Text size="xs" c="dimmed" mt="sm">
            It&apos;s afternoon already. Consider planning for tomorrow instead.
          </Text>
        )}
      </Paper>

      <Button
        size="lg"
        variant="default"
        onClick={onStart}
        className="border-border-primary"
      >
        Plan {selectedDate === "today" ? "today" : "tomorrow"}
      </Button>
    </Stack>
  );
}
