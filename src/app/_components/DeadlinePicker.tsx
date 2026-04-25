"use client";

import {
  Group,
  UnstyledButton,
  Text,
  Popover,
  Stack,
  Select,
} from "@mantine/core";
import { DatePicker } from "@mantine/dates";
import { useMediaQuery } from "@mantine/hooks";
import { IconCalendar, IconX } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useState, useMemo } from "react";

interface DeadlinePickerProps {
  value: Date | null;
  onChange: (date: Date | null) => void;
  disabled?: boolean;
  notificationContext?: string;
}

// Date helper functions
const getEndOfWeek = (date: Date): Date => {
  const result = new Date(date);
  const day = result.getDay();
  // If today is Saturday (6) or Sunday (0), go to next Friday
  // Otherwise, go to Friday of current week
  const daysUntilFriday = day <= 5 ? 5 - day : 5 + (7 - day);
  result.setDate(result.getDate() + daysUntilFriday);
  return result;
};

const getNextWeekFriday = (date: Date): Date => {
  const result = new Date(date);
  const day = result.getDay();
  // Go to next week's Friday
  const daysUntilNextFriday = day <= 5 ? 5 - day + 7 : 5 + (14 - day);
  result.setDate(result.getDate() + daysUntilNextFriday);
  return result;
};

const getEndOfMonth = (date: Date): Date => {
  const result = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return result;
};

const getEndOfNextMonth = (date: Date): Date => {
  const result = new Date(date.getFullYear(), date.getMonth() + 2, 0);
  return result;
};

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

// Generate time options with 30-minute intervals
const generateTimeOptions = (): Array<{ value: string; label: string }> => {
  const options = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const date = new Date();
      date.setHours(hour, minute, 0, 0);
      options.push({
        value: `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`,
        label: date.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }),
      });
    }
  }
  return options;
};

const TIME_OPTIONS = generateTimeOptions();

// Format date for quick options display
const formatQuickOptionDate = (date: Date): string => {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

// Get quick date options (fresh each time to handle overnight tab usage)
const getQuickDateOptions = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return [
    { label: "Today", date: new Date(today), icon: "📅", color: "var(--color-brand-success)" },
    { label: "Tomorrow", date: addDays(today, 1), icon: "☀️", color: "var(--color-brand-warning)" },
    { label: "This week", date: getEndOfWeek(today), icon: "📝", color: "var(--color-brand-primary)" },
    { label: "7 days from now", date: addDays(today, 7), icon: "📆", color: "var(--color-brand-info)" },
    { label: "Next week", date: getNextWeekFriday(today), icon: "🗓️", color: "var(--color-brand-primary)" },
    { label: "This month", date: getEndOfMonth(today), icon: "🗒️", color: "var(--color-text-muted)" },
    { label: "In 2 weeks", date: addDays(today, 14), icon: "⏳", color: "var(--color-brand-info)" },
    { label: "Next month", date: getEndOfNextMonth(today), icon: "📋", color: "var(--color-text-muted)" },
  ];
};

export function DeadlinePicker({
  value,
  onChange,
  disabled = false,
  notificationContext = "task",
}: DeadlinePickerProps) {
  const [opened, setOpened] = useState(false);
  const isMobile = useMediaQuery("(max-width: 640px)");

  // Extract date and time from value
  const selectedDate = useMemo(() => {
    if (!value) return null;
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
  }, [value]);

  const selectedTime = useMemo(() => {
    if (!value) return "14:00"; // Default to 2:00 PM
    const hours = value.getHours().toString().padStart(2, "0");
    const minutes = value.getMinutes().toString().padStart(2, "0");
    return `${hours}:${minutes}`;
  }, [value]);

  // Combine date and time into a single Date object
  const combineDateAndTime = (date: Date | null, timeStr: string): Date | null => {
    if (!date) return null;
    const [hours, minutes] = timeStr.split(":").map(Number);
    const result = new Date(date);
    result.setHours(hours ?? 14, minutes ?? 0, 0, 0);
    return result;
  };

  const handleDateSelect = (date: Date | null) => {
    const combined = date ? combineDateAndTime(date, selectedTime) : null;
    onChange(combined);

    if (!date) {
      setOpened(false);
      notifications.show({
        title: "Date Removed",
        message: `Deadline removed from ${notificationContext}`,
        color: "gray",
        withBorder: true,
      });
    }
  };

  const handleTimeChange = (timeStr: string | null) => {
    if (!timeStr || !selectedDate) return;
    const combined = combineDateAndTime(selectedDate, timeStr);
    onChange(combined);
  };

  const handleQuickOptionClick = (date: Date) => {
    const combined = combineDateAndTime(date, selectedTime);
    onChange(combined);
    setOpened(false);

    notifications.show({
      title: "Deadline Set",
      message: `${notificationContext.charAt(0).toUpperCase() + notificationContext.slice(1)} deadline set to ${date.toLocaleDateString(
        "en-US",
        {
          weekday: "long",
          day: "numeric",
          month: "long",
        }
      )}`,
      color: "blue",
      withBorder: true,
    });
  };

  const handleClearDeadline = () => {
    onChange(null);
    setOpened(false);
    notifications.show({
      title: "Deadline Removed",
      message: `Deadline removed from ${notificationContext}`,
      color: "gray",
      withBorder: true,
    });
  };

  // Format trigger button display - consistent with UnifiedDatePicker
  const getTriggerContent = () => {
    if (!value) {
      return (
        <Group gap="xs">
          <IconCalendar size={16} />
          <Text size="sm">Deadline</Text>
        </Group>
      );
    }

    const isToday = value.toDateString() === new Date().toDateString();

    if (isToday) {
      return (
        <Group gap="xs">
          <IconCalendar size={16} style={{ color: "var(--color-brand-error)" }} />
          <Text size="sm" style={{ color: "var(--color-brand-error)" }}>
            Due Today
          </Text>
          <IconX
            size={14}
            onClick={(e) => {
              e.stopPropagation();
              handleClearDeadline();
            }}
            style={{ cursor: "pointer" }}
          />
        </Group>
      );
    }

    return (
      <Group gap="xs">
        <IconCalendar size={16} style={{ color: "var(--color-brand-warning)" }} />
        <Text size="sm">
          Due{" "}
          {value.toLocaleDateString("en-US", {
            day: "numeric",
            month: "short",
          })}
        </Text>
        <IconX
          size={14}
          onClick={(e) => {
            e.stopPropagation();
            handleClearDeadline();
          }}
          style={{ cursor: "pointer" }}
        />
      </Group>
    );
  };

  const quickOptions = getQuickDateOptions();

  return (
    <Popover
      width={isMobile ? "calc(100vw - 48px)" : "auto"}
      position="bottom-start"
      opened={opened}
      onClose={() => setOpened(false)}
      disabled={disabled}
      middlewares={{ flip: true, shift: true }}
    >
      <Popover.Target>
        <UnstyledButton
          onClick={() => setOpened((o) => !o)}
          disabled={disabled}
          className={`rounded px-3 py-1.5 ${
            disabled
              ? "cursor-not-allowed bg-surface-tertiary opacity-50"
              : !value
                ? "bg-surface-secondary hover:bg-surface-hover"
                : "bg-surface-tertiary hover:bg-surface-hover"
          } flex items-center transition-colors`}
        >
          {getTriggerContent()}
        </UnstyledButton>
      </Popover.Target>

      <Popover.Dropdown p={0}>
        <div className={`flex ${isMobile ? "flex-col" : "flex-row"}`}>
          {/* Left column: Calendar */}
          <div className={`p-4 ${isMobile ? "border-b" : "border-r"} border-border-primary`}>
            <DatePicker
              value={selectedDate}
              onChange={handleDateSelect}
              size="md"
              highlightToday={true}
              firstDayOfWeek={1}
              styles={{
                calendarHeader: {
                  backgroundColor: "var(--color-bg-secondary)",
                },
                month: {
                  backgroundColor: "var(--color-bg-secondary)",
                },
                day: {
                  width: 36,
                  height: 36,
                },
              }}
            />
          </div>

          {/* Right column: Time + Quick Options */}
          <div className="flex flex-col p-4">
            {/* Time selector */}
            <div className="mb-3 flex items-center gap-2">
              <Text size="sm" c="dimmed">
                {selectedDate
                  ? selectedDate.toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })
                  : "Today"}
              </Text>
              <Select
                value={selectedTime}
                onChange={handleTimeChange}
                data={TIME_OPTIONS}
                size="xs"
                w={100}
                searchable
                styles={{
                  input: {
                    backgroundColor: "var(--color-surface-secondary)",
                    color: "var(--color-text-primary)",
                    borderColor: "var(--color-border-primary)",
                  },
                  dropdown: {
                    backgroundColor: "var(--color-surface-secondary)",
                    borderColor: "var(--color-border-primary)",
                  },
                }}
              />
            </div>

            {/* Quick date options */}
            <Stack gap={0}>
              {quickOptions.map((option) => (
                <UnstyledButton
                  key={option.label}
                  onClick={() => handleQuickOptionClick(option.date)}
                  className="flex items-center justify-between rounded px-2 py-2.5 hover:bg-surface-hover"
                >
                  <Group gap="sm">
                    <Text size="lg" style={{ color: option.color }}>
                      {option.icon}
                    </Text>
                    <Text size="sm">{option.label}</Text>
                  </Group>
                  <Text size="sm" c="dimmed">
                    {formatQuickOptionDate(option.date)}
                  </Text>
                </UnstyledButton>
              ))}

              {/* Clear deadline option */}
              <UnstyledButton
                onClick={handleClearDeadline}
                className="mt-2 flex items-center gap-2 rounded border-t border-border-primary px-2 py-2.5 pt-3 hover:bg-surface-hover"
              >
                <Text size="lg" style={{ color: "var(--color-text-muted)" }}>
                  ⭕
                </Text>
                <Text size="sm" c="dimmed">
                  No deadline
                </Text>
              </UnstyledButton>
            </Stack>
          </div>
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}
