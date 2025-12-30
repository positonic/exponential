"use client";

import { Group, Paper, Text, Title } from "@mantine/core";
import { format } from "date-fns";
import { GoogleCalendarConnect } from "./GoogleCalendarConnect";
import { TodayPageCalendar } from "./TodayPageCalendar";
import { TodayButton } from "./TodayButton";

interface PageHeaderProps {
  calendarConnected: boolean;
  todayExists: boolean;
}

export function PageHeader({ calendarConnected, todayExists }: PageHeaderProps) {
  const today = new Date();

  return (
    <Paper
      className="w-full max-w-3xl mx-auto mb-6 bg-surface-primary border border-border-primary"
      p="lg"
      radius="md"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left side: Page title and date */}
        <div>
          <Title order={2} size="h3" className="text-text-primary">
            Today
          </Title>
          <Text size="sm" className="text-text-secondary">
            {format(today, "EEEE, MMMM d, yyyy")}
          </Text>
        </div>

        {/* Right side: Navigation buttons */}
        <Group gap="sm" wrap="nowrap">
          <GoogleCalendarConnect isConnected={calendarConnected} />
          <TodayPageCalendar isConnected={calendarConnected} />
          {!todayExists && <TodayButton />}
        </Group>
      </div>
    </Paper>
  );
}