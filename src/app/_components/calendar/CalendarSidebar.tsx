"use client";

import { Text, Stack, Checkbox, Group } from "@mantine/core";
import { IconBrandGoogle } from "@tabler/icons-react";
import { CalendarMiniWidget } from "./CalendarMiniWidget";

interface CalendarSidebarProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
}

export function CalendarSidebar({
  selectedDate,
  onDateSelect,
}: CalendarSidebarProps) {
  return (
    <div className="hidden w-64 flex-shrink-0 border-l border-border-primary bg-background-primary p-4 lg:block">
      <Stack gap="lg">
        {/* Mini Calendar */}
        <div>
          <CalendarMiniWidget
            selectedDate={selectedDate}
            onDateSelect={onDateSelect}
          />
        </div>

        {/* Calendars Section */}
        <div>
          <Text size="sm" fw={600} mb="sm" className="text-text-primary">
            Calendars
          </Text>
          <Stack gap="xs">
            <Group gap="xs">
              <Checkbox
                size="xs"
                defaultChecked
                color="blue"
                styles={{
                  input: {
                    cursor: "pointer",
                  },
                }}
              />
              <IconBrandGoogle size={14} className="text-text-muted" />
              <Text size="sm" className="text-text-secondary">
                Google Calendar
              </Text>
            </Group>
          </Stack>
        </div>
      </Stack>
    </div>
  );
}
