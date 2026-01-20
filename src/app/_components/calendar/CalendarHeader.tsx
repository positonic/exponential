"use client";

import {
  Button,
  Group,
  SegmentedControl,
  ActionIcon,
  Tooltip,
} from "@mantine/core";
import {
  IconChevronLeft,
  IconChevronRight,
  IconUnlink,
} from "@tabler/icons-react";
import { format } from "date-fns";
import type { CalendarView } from "./types";

interface CalendarHeaderProps {
  view: CalendarView;
  selectedDate: Date;
  onViewChange: (view: CalendarView) => void;
  onToday: () => void;
  onNext: () => void;
  onPrevious: () => void;
  isConnected?: boolean;
  onDisconnect?: () => void;
  isDisconnecting?: boolean;
}

export function CalendarHeader({
  view,
  selectedDate,
  onViewChange,
  onToday,
  onNext,
  onPrevious,
  isConnected,
  onDisconnect,
  isDisconnecting,
}: CalendarHeaderProps) {
  // Format the header text based on view
  const headerText =
    view === "day"
      ? format(selectedDate, "EEE, MMM d, yyyy")
      : format(selectedDate, "MMMM yyyy");

  return (
    <div className="flex items-center justify-between border-b border-border-primary bg-background-primary px-4 py-3">
      <Group gap="md">
        <Button
          variant="subtle"
          size="sm"
          onClick={onToday}
          className="text-text-primary"
        >
          Today
        </Button>

        <Group gap={4}>
          <ActionIcon
            variant="subtle"
            size="md"
            onClick={onPrevious}
            aria-label="Previous"
          >
            <IconChevronLeft size={18} />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            size="md"
            onClick={onNext}
            aria-label="Next"
          >
            <IconChevronRight size={18} />
          </ActionIcon>
        </Group>

        <span className="text-lg font-semibold text-text-primary">
          {headerText}
        </span>
      </Group>

      <Group gap="md">
        <SegmentedControl
          value={view}
          onChange={(value) => onViewChange(value as CalendarView)}
          data={[
            { label: "Week", value: "week" },
            { label: "Day", value: "day" },
          ]}
          size="sm"
        />
        {isConnected && onDisconnect && (
          <Tooltip label="Disconnect Google Calendar" position="bottom">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="md"
              onClick={onDisconnect}
              loading={isDisconnecting}
              aria-label="Disconnect calendar"
            >
              <IconUnlink size={18} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    </div>
  );
}
