import {
  Group,
  UnstyledButton,
  Text,
  Popover,
  Stack,
} from "@mantine/core";
import { DatePicker } from '@mantine/dates';
import { useMediaQuery } from "@mantine/hooks";
import {
  IconCalendar,
  IconX,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useState, type ReactNode } from "react";

interface RenderTriggerArgs {
  opened: boolean;
  toggle: () => void;
  value: Date | null;
}

interface UnifiedDatePickerProps {
  // Core functionality
  value: Date | null;
  onChange: (date: Date | null) => void;

  // Display modes
  mode?: 'single' | 'bulk';

  // Bulk mode specific
  selectedCount?: number;

  // Customization
  triggerText?: string; // For bulk: "Reschedule Selected", for single: auto-generate from date
  placeholder?: string; // Text shown in the pill when no value is selected (default "Date")
  leftSection?: ReactNode; // Override the trigger icon (e.g. IconCalendarEvent vs IconCalendarDue)
  disabled?: boolean;
  notificationContext?: string; // "task", "bulk actions", etc.

  // Constraints
  minDate?: Date;
  maxDate?: Date;

  // Custom trigger — render your own Popover target (e.g. a coloured Badge) while reusing
  // the standard calendar popover. Receives { opened, toggle, value }; wire toggle to onClick.
  renderTrigger?: (args: RenderTriggerArgs) => ReactNode;

  // Legacy support
  onClear?: () => void; // For backwards compatibility
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

// Function to get fresh date options each time (fixes stale date issue when tab is kept open overnight)
const getQuickOptions = () => [
  { label: "Today", date: new Date(), icon: "📅", color: "var(--color-brand-success)" },
  {
    label: "Tomorrow",
    date: new Date(Date.now() + 86400000),
    icon: "☀️",
    color: "var(--color-brand-warning)",
  },
  { label: "Next week", date: getNextWeekDate(), icon: "📝", color: "var(--color-brand-primary)" },
  {
    label: "Next weekend",
    date: getNextWeekendDate(),
    icon: "🛋️",
    color: "var(--color-brand-info)",
  },
  { label: "No Date", date: null, icon: "⭕", color: "var(--color-text-muted)" },
];

export function UnifiedDatePicker({
  value,
  onChange,
  mode = 'single',
  selectedCount = 1,
  triggerText,
  placeholder = "Date",
  leftSection,
  disabled = false,
  notificationContext = 'task',
  minDate,
  maxDate,
  renderTrigger,
  onClear
}: UnifiedDatePickerProps) {
  const [opened, setOpened] = useState(false);
  const isMobile = useMediaQuery('(max-width: 640px)');

  const isToday = value?.toDateString() === new Date().toDateString();
  const isBulkMode = mode === 'bulk';

  // Keep a date-only copy outside [minDate, maxDate] from being offered as a quick option.
  const isWithinRange = (date: Date): boolean => {
    if (minDate && date < minDate) return false;
    if (maxDate && date > maxDate) return false;
    return true;
  };

  const handleDateSelect = (date: Date | null) => {
    onChange(date);
    setOpened(false);

    // Call legacy onClear callback if provided and date is null
    if (!date && onClear) {
      onClear();
    }

    // Show appropriate notifications based on mode
    if (isBulkMode) {
      if (date) {
        notifications.show({
          title: "Bulk Reschedule",
          message: `${selectedCount} ${notificationContext}${selectedCount !== 1 ? 's' : ''} will be rescheduled to ${date.toLocaleDateString(
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
          message: `Due date will be removed from ${selectedCount} ${notificationContext}${selectedCount !== 1 ? 's' : ''}`,
          color: "gray",
          withBorder: true,
        });
      }
    } else {
      // Single mode notifications
      notifications.show({
        title: "Date Updated",
        message: date
          ? `${notificationContext.charAt(0).toUpperCase() + notificationContext.slice(1)} scheduled for ${date.toLocaleDateString(
              "en-US",
              {
                weekday: "long",
                day: "numeric",
                month: "long",
              },
            )}`
          : `Date removed from ${notificationContext}`,
        color: date ? "blue" : "gray",
        icon: date ? "📅" : "⭕",
        withBorder: true,
      });
    }
  };

  const triggerIcon = leftSection ?? <IconCalendar size={16} />;

  // Generate trigger button content based on mode
  const getTriggerContent = () => {
    if (isBulkMode || triggerText) {
      // Bulk mode or custom text
      return (
        <Group gap="xs">
          {triggerIcon}
          <Text size="sm">{triggerText ?? "Reschedule Selected"}</Text>
        </Group>
      );
    }

    // Single mode - show selected date
    if (!value) {
      return (
        <Group gap="xs">
          {triggerIcon}
          <Text size="sm">{placeholder}</Text>
        </Group>
      );
    }

    if (isToday) {
      return (
        <Group gap="xs">
          <IconCalendar size={16} style={{ color: "var(--color-brand-success)" }} />
          <Text size="sm" style={{ color: "var(--color-brand-success)" }}>
            Today
          </Text>
          {onClear && <IconX size={14} />}
        </Group>
      );
    }

    return (
      <Group gap="xs">
        {triggerIcon}
        <Text size="sm">
          {value.toLocaleDateString("en-US", {
            day: "numeric",
            month: "short",
          })}
        </Text>
        {onClear && <IconX size={14} />}
      </Group>
    );
  };

  const toggle = () => setOpened((o) => !o);

  return (
    <Popover
      width={isMobile ? 'calc(100vw - 48px)' : 300}
      position="bottom-start"
      opened={opened}
      onClose={() => setOpened(false)}
      disabled={disabled}
      middlewares={{ flip: true, shift: true }}
    >
      <Popover.Target>
        {renderTrigger ? (
          renderTrigger({ opened, toggle, value })
        ) : (
          <UnstyledButton
            onClick={toggle}
            disabled={disabled}
            className={`rounded px-3 py-1.5 ${
              disabled
                ? 'bg-surface-tertiary cursor-not-allowed opacity-50'
                : isBulkMode
                  ? 'bg-surface-secondary hover:bg-surface-hover'
                  : !value
                    ? "bg-surface-secondary hover:bg-surface-hover"
                    : "bg-surface-tertiary hover:bg-surface-hover"
            } flex items-center transition-colors`}
          >
            {getTriggerContent()}
          </UnstyledButton>
        )}
      </Popover.Target>

      <Popover.Dropdown p={0}>
        <Stack gap="xs" p="md">
          {getQuickOptions()
            .filter((option) => !option.date || isWithinRange(option.date))
            .map((option) => (
              <UnstyledButton
                key={option.label}
                onClick={() => handleDateSelect(option.date)}
                className="flex items-center justify-between rounded p-2 hover:bg-surface-hover"
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

          <div className="mt-2 border-t border-border-primary pt-2">
            <DatePicker
              value={value}
              onChange={(date) => {
                if (date) {
                  handleDateSelect(date);
                }
              }}
              size="sm"
              highlightToday={true}
              minDate={minDate}
              maxDate={maxDate}
              classNames={{
                day: 'unified-datepicker-day'
              }}
              styles={{
                calendarHeader: {
                  backgroundColor: 'var(--color-bg-secondary)',
                },
                month: {
                  backgroundColor: 'var(--color-bg-secondary)',
                }
              }}
            />
          </div>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}