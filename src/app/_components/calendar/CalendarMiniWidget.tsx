"use client";

import { Calendar } from "@mantine/dates";
import { isSameDay, isSameWeek } from "date-fns";

interface CalendarMiniWidgetProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
}

export function CalendarMiniWidget({
  selectedDate,
  onDateSelect,
}: CalendarMiniWidgetProps) {
  return (
    <Calendar
      size="xs"
      defaultDate={selectedDate}
      getDayProps={(date) => {
        const isSelected = isSameDay(date, selectedDate);
        const isInSelectedWeek = isSameWeek(date, selectedDate, {
          weekStartsOn: 0,
        });

        return {
          onClick: () => onDateSelect(date),
          selected: isSelected,
          style: isInSelectedWeek && !isSelected
            ? {
                backgroundColor: "var(--mantine-color-blue-light)",
              }
            : undefined,
        };
      }}
      styles={{
        calendarHeader: {
          maxWidth: "100%",
        },
        day: {
          fontSize: "12px",
        },
      }}
    />
  );
}
