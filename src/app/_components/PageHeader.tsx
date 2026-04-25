"use client";

import { Group, Text, Title, SegmentedControl, ActionIcon } from "@mantine/core";
import { IconFilter } from "@tabler/icons-react";
import { TodayButton } from "./TodayButton";
import type { FocusPeriod } from "~/types/focus";
import { getDateRangeForFocus, formatFocusLabel, formatDateRangeDisplay } from "~/lib/dateUtils";

interface PageHeaderProps {
  todayExists: boolean;
  focus: FocusPeriod;
  onFocusChange: (focus: FocusPeriod) => void;
  workspaceName?: string;
}

export function PageHeader({
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
              { label: "Tomorrow", value: "tomorrow" },
              { label: "Week", value: "week" },
              { label: "Month", value: "month" },
            ]}
            size="sm"
          />
          <ActionIcon
            variant="subtle"
            size="lg"
            aria-label="Filter"
            className="text-text-secondary hover:text-text-primary"
          >
            <IconFilter size={18} />
          </ActionIcon>
          {!todayExists && focus === "today" && <TodayButton />}
        </Group>
      </div>
    </div>
  );
}
