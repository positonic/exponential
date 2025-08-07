import {
  Group,
  UnstyledButton,
  Text,
  Popover,
  Stack,
} from "@mantine/core";
import { DatePicker } from '@mantine/dates';
import {
  IconCalendar,
  IconClock,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useState } from "react";

interface BulkDatePickerProps {
  onDateSelected: (date: Date | null) => void;
  selectedCount: number;
  disabled?: boolean;
}

// Helper functions
const getNextWeekDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date;
};

const getNextWeekendDate = () => {
  const date = new Date();
  while (date.getDay() !== 6) {
    date.setDate(date.getDate() + 1);
  }
  return date;
};

const quickOptions = [
  { label: "Today", date: new Date(), icon: "📅", color: "#22c55e" },
  {
    label: "Tomorrow",
    date: new Date(Date.now() + 86400000),
    icon: "☀️",
    color: "#f97316",
  },
  { label: "Next week", date: getNextWeekDate(), icon: "📝", color: "#a855f7" },
  {
    label: "Next weekend",
    date: getNextWeekendDate(),
    icon: "🛋️",
    color: "#3b82f6",
  },
  { label: "No Date", date: null, icon: "⭕", color: "#6b7280" },
];

export function BulkDatePicker({ onDateSelected, selectedCount, disabled = false }: BulkDatePickerProps) {
  const [opened, setOpened] = useState(false);
  const [calendarDate, setCalendarDate] = useState<Date | null>(null);

  const handleDateSelect = (date: Date | null) => {
    onDateSelected(date);
    setOpened(false);
    
    if (date) {
      notifications.show({
        title: "Bulk Reschedule",
        message: `${selectedCount} action${selectedCount !== 1 ? 's' : ''} will be rescheduled to ${date.toLocaleDateString(
          "en-US",
          {
            weekday: "long",
            day: "numeric",
            month: "long",
          },
        )}`,
        color: "blue",
        withBorder: true,
      });
    } else {
      notifications.show({
        title: "Date Removed",
        message: `Due date will be removed from ${selectedCount} action${selectedCount !== 1 ? 's' : ''}`,
        color: "gray",
        withBorder: true,
      });
    }
  };

  const handleCalendarSelect = (date: Date | null) => {
    if (date) {
      handleDateSelect(date);
    }
  };

  return (
    <Popover 
      width={300} 
      position="bottom-start"
      opened={opened}
      onClose={() => setOpened(false)}
      disabled={disabled}
    >
      <Popover.Target>
        <UnstyledButton
          onClick={() => setOpened((o) => !o)}
          disabled={disabled}
          className={`rounded px-3 py-1.5 ${disabled ? 'bg-gray-700 cursor-not-allowed opacity-50' : 'bg-dark-700 hover:bg-dark-600'} flex items-center transition-colors`}
        >
          <Group gap="xs">
            <IconCalendar size={16} />
            <Text size="sm">Reschedule Selected</Text>
          </Group>
        </UnstyledButton>
      </Popover.Target>
      
      <Popover.Dropdown bg="#1a1b1e" p={0}>
        <Stack gap="xs" p="md">
          {quickOptions.map((option) => (
            <UnstyledButton
              key={option.label}
              onClick={() => handleDateSelect(option.date)}
              className="flex items-center justify-between rounded p-2 hover:bg-[#25262b]"
            >
              <Group gap="sm">
                <Text size="lg" style={{ color: option.color }}>
                  {option.icon}
                </Text>
                <Text>{option.label}</Text>
              </Group>
              {option.date && (
                <Text size="sm" c="dimmed">
                  {option.date.toLocaleDateString("en-US", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}
                </Text>
              )}
            </UnstyledButton>
          ))}

          <div className="mt-2 border-t border-[#2C2E33] pt-2">
            <DatePicker
              value={calendarDate}
              onChange={(date) => {
                setCalendarDate(date);
                if (date) {
                  handleCalendarSelect(date);
                }
              }}
              size="sm"
              styles={{
                calendarHeader: {
                  backgroundColor: 'transparent',
                  color: '#C1C2C5',
                },
                calendarHeaderControl: {
                  color: '#C1C2C5',
                  '&:hover': {
                    backgroundColor: '#25262b',
                  },
                },
                calendarHeaderLevel: {
                  color: '#C1C2C5',
                  '&:hover': {
                    backgroundColor: '#25262b',
                  },
                },
                day: {
                  color: '#C1C2C5',
                  '&:hover': {
                    backgroundColor: '#25262b',
                  },
                  '&[data-selected]': {
                    backgroundColor: '#228be6',
                    color: 'white',
                  },
                  '&[data-today]': {
                    backgroundColor: '#22c55e',
                    color: 'white',
                  },
                },
                weekday: {
                  color: '#909296',
                },
              }}
            />

            <UnstyledButton className="mt-2 flex w-full items-center justify-center gap-2 border-t border-[#2C2E33] p-3 hover:bg-[#25262b]">
              <IconClock size={16} />
              <Text>Time</Text>
            </UnstyledButton>
          </div>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}