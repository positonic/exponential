import {
  Group,
  UnstyledButton,
  Text,
  ActionIcon,
  Popover,
  Stack,
} from "@mantine/core";
import {
  IconCalendar,
  IconX,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";

interface DateWidgetProps {
  date: Date | null;
  onClear?: () => void;
  setDueDate: (date: Date | null) => void;
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

export default function DateWidget({ date, onClear, setDueDate }: DateWidgetProps) {
  const isToday = date?.toDateString() === new Date().toDateString();

  const getContent = () => {
    if (!date) {
      return (
        <Group gap="xs">
          <IconCalendar size={16} /><Text size="sm">Date</Text>
        </Group>
      );
    }

    if (isToday) {
      return (
        <Group gap="xs">
          <IconCalendar size={16} style={{ color: "#22c55e" }} />
          <Text size="sm" c="#22c55e">
            Today
          </Text>
          {onClear && <IconX size={14} />}
        </Group>
      );
    }

    return (
      <Group gap="xs">
        <IconCalendar size={16} />
        <Text size="sm">
          {date.toLocaleDateString("en-US", {
            day: "numeric",
            month: "short",
          })}
        </Text>
        {onClear && <IconX size={14} />}
      </Group>
    );
  };

  return (
    <>
      <Popover width={300} position="bottom-start">
        {/* <Popover.Target>
          <ActionIcon variant="subtle" color="gray" radius="xl">
            <IconCalendar size={20} />
          </ActionIcon>
        </Popover.Target> */}
        <Popover.Target>
          <UnstyledButton
            className={`rounded px-3 py-1.5 ${!date ? "bg-dark-700" : "bg-dark-800"} hover:bg-dark-600 flex items-center transition-colors`}
          >
            {getContent()}
          </UnstyledButton>
        </Popover.Target>
        <Popover.Dropdown bg="#1a1b1e" p={0}>
          <Stack gap="xs" p="md">
            {quickOptions.map((option) => (
              <UnstyledButton
                key={option.label}
                onClick={() => {
                  setDueDate(option.date);
                  notifications.show({
                    title: "Date Updated",
                    message: option.date
                      ? `Task scheduled for ${option.date.toLocaleDateString(
                          "en-US",
                          {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                          },
                        )}`
                      : "Date removed from task",
                    color: option.date ? "blue" : "gray",
                    icon: option.icon,
                    withBorder: true,
                  });
                }}
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
              <Group justify="space-between" mb="xs">
                <Text>February 2025</Text>
                <Group gap="xs">
                  <ActionIcon variant="subtle" size="sm">
                    <IconChevronLeft size={16} />
                  </ActionIcon>
                  <ActionIcon variant="subtle" size="sm">
                    <IconChevronRight size={16} />
                  </ActionIcon>
                </Group>
              </Group>

              {/* Calendar grid here */}
              {/* Add calendar implementation */}

              <UnstyledButton className="mt-2 flex w-full items-center justify-center gap-2 border-t border-[#2C2E33] p-3 hover:bg-[#25262b]">
                <IconClock size={16} />
                <Text>Time</Text>
              </UnstyledButton>
            </div>
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </>
  );
}
