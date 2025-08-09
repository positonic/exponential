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
      className="w-full max-w-3xl mx-auto mb-6"
      p="lg"
      radius="md"
      style={{
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(147, 51, 234, 0.08) 100%)',
        border: '1px solid rgba(59, 130, 246, 0.2)',
        backdropFilter: 'blur(10px)'
      }}
    >
      <Group justify="space-between" align="center" wrap="nowrap">
        {/* Left side: Page title and date */}
        <div>
          <Title order={2} size="h3" className="text-gray-100">
            Today
          </Title>
          <Text size="sm" className="text-gray-400">
            {format(today, "EEEE, MMMM d, yyyy")}
          </Text>
        </div>

        {/* Right side: Navigation buttons */}
        <Group gap="sm" wrap="nowrap">
          <GoogleCalendarConnect isConnected={calendarConnected} />
          <TodayPageCalendar isConnected={calendarConnected} />
          {!todayExists && <TodayButton />}
        </Group>
      </Group>
    </Paper>
  );
}