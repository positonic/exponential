"use client";

import { Checkbox, Group, Stack, Text, Paper, Loader, Badge } from "@mantine/core";
import { IconCalendar } from "@tabler/icons-react";
import type { GoogleCalendarInfo } from "~/server/services/GoogleCalendarService";

interface CalendarMultiSelectProps {
  calendars: GoogleCalendarInfo[];
  selectedCalendarIds: string[];
  onChange: (calendarIds: string[]) => void;
  isLoading?: boolean;
  maxSelections?: number;
}

export function CalendarMultiSelect({
  calendars,
  selectedCalendarIds,
  onChange,
  isLoading = false,
  maxSelections = 10,
}: CalendarMultiSelectProps) {
  const handleToggle = (calendarId: string) => {
    if (selectedCalendarIds.includes(calendarId)) {
      // Don't allow deselecting if it's the last one
      if (selectedCalendarIds.length > 1) {
        onChange(selectedCalendarIds.filter((id) => id !== calendarId));
      }
    } else {
      // Don't allow selecting more than max
      if (selectedCalendarIds.length < maxSelections) {
        onChange([...selectedCalendarIds, calendarId]);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader size="sm" />
        <Text size="sm" c="dimmed" ml="sm">
          Loading calendars...
        </Text>
      </div>
    );
  }

  if (calendars.length === 0) {
    return (
      <Paper p="md" className="bg-surface-tertiary text-center">
        <IconCalendar size={24} className="text-text-muted mx-auto mb-2" />
        <Text size="sm" c="dimmed">
          No calendars found
        </Text>
      </Paper>
    );
  }

  // Sort calendars: primary first, then alphabetically
  const sortedCalendars = [...calendars].sort((a, b) => {
    if (a.primary && !b.primary) return -1;
    if (!a.primary && b.primary) return 1;
    return a.summary.localeCompare(b.summary);
  });

  return (
    <Stack gap="xs">
      <Group justify="space-between" mb="xs">
        <Text size="xs" c="dimmed">
          {selectedCalendarIds.length} of {calendars.length} selected
        </Text>
        {selectedCalendarIds.length >= maxSelections && (
          <Badge size="xs" color="yellow" variant="light">
            Max {maxSelections} calendars
          </Badge>
        )}
      </Group>

      {sortedCalendars.map((calendar) => {
        const isSelected = selectedCalendarIds.includes(calendar.id);
        const isDisabled =
          !isSelected && selectedCalendarIds.length >= maxSelections;

        return (
          <Paper
            key={calendar.id}
            p="sm"
            withBorder
            className={`cursor-pointer transition-colors ${
              isSelected
                ? "bg-brand-primary/10 border-brand-primary/30"
                : "bg-surface-primary hover:bg-surface-hover"
            } ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
            onClick={() => !isDisabled && handleToggle(calendar.id)}
          >
            <Group gap="sm" wrap="nowrap">
              <Checkbox
                checked={isSelected}
                onChange={() => handleToggle(calendar.id)}
                disabled={isDisabled}
                styles={{
                  input: {
                    cursor: isDisabled ? "not-allowed" : "pointer",
                  },
                }}
              />

              {/* Color indicator */}
              {calendar.backgroundColor && (
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: calendar.backgroundColor }}
                />
              )}

              <div className="flex-1 min-w-0">
                <Group gap="xs" wrap="nowrap">
                  <Text size="sm" fw={500} truncate className="text-text-primary">
                    {calendar.summary}
                  </Text>
                  {calendar.primary && (
                    <Badge size="xs" variant="light" color="blue">
                      Primary
                    </Badge>
                  )}
                </Group>
                {calendar.description && (
                  <Text size="xs" c="dimmed" truncate>
                    {calendar.description}
                  </Text>
                )}
              </div>
            </Group>
          </Paper>
        );
      })}
    </Stack>
  );
}
