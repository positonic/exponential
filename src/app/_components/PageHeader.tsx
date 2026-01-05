"use client";

import { Group, Text, Title, SegmentedControl } from "@mantine/core";
import { GoogleCalendarConnect } from "./GoogleCalendarConnect";
import { TodayPageCalendar } from "./TodayPageCalendar";
import { TodayButton } from "./TodayButton";
import type { FocusPeriod } from "~/types/focus";
import { getDateRangeForFocus, formatFocusLabel, formatDateRangeDisplay } from "~/lib/dateUtils";

interface PageHeaderProps {
  calendarConnected: boolean;
  todayExists: boolean;
  focus: FocusPeriod;
  onFocusChange: (focus: FocusPeriod) => void;
  workspaceName?: string;
}

export function PageHeader({
  calendarConnected,
  todayExists,
  focus,
  onFocusChange,
  workspaceName,
}: PageHeaderProps) {
  const dateRange = getDateRangeForFocus(focus);

  return (
    <div className="mb-6 w-full">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left side: Page title and date */}
        <div>
          <Title order={2} size="h3" className="text-text-primary">
            {formatFocusLabel(focus)}
          </Title>
          <Text size="sm" className="text-text-secondary">
            {workspaceName && `${workspaceName} · `}
            {formatDateRangeDisplay(focus, dateRange)}
          </Text>
        </div>

        {/* Right side: Focus selector and navigation buttons */}
        <Group gap="sm" wrap="nowrap">
          <SegmentedControl
            value={focus}
            onChange={(value) => onFocusChange(value as FocusPeriod)}
            data={[
              { label: "Today", value: "today" },
              { label: "Week", value: "week" },
              { label: "Month", value: "month" },
            ]}
            size="sm"
          />
          <GoogleCalendarConnect isConnected={calendarConnected} />
          <TodayPageCalendar isConnected={calendarConnected} />
          {!todayExists && focus === "today" && <TodayButton />}
        </Group>
      </div>
    </div>
  );
}
