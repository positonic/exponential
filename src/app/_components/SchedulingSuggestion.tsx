"use client";

import { Badge, Button, Group, Text, Tooltip, Loader } from "@mantine/core";
import { IconSparkles, IconCheck, IconX, IconCalendarEvent } from "@tabler/icons-react";

export interface SchedulingSuggestionData {
  actionId: string;
  suggestedDate: string; // "YYYY-MM-DD"
  suggestedTime: string; // "HH:MM"
  duration?: number;
  reasoning: string;
  priority: "high" | "medium" | "low";
  conflictWarning?: string;
}

interface SchedulingSuggestionProps {
  suggestion: SchedulingSuggestionData;
  onApply: (actionId: string, date: string, time: string) => void;
  onDismiss: (actionId: string) => void;
  isApplying?: boolean;
}

function formatSuggestedDate(dateStr: string, timeStr: string): string {
  const date = new Date(dateStr + "T" + timeStr);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const isToday = date.toDateString() === today.toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const timeFormatted = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (isToday) {
    return `Today ${timeFormatted}`;
  } else if (isTomorrow) {
    return `Tomorrow ${timeFormatted}`;
  } else {
    const dateFormatted = date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    return `${dateFormatted} ${timeFormatted}`;
  }
}

function getPriorityColor(priority: "high" | "medium" | "low"): string {
  switch (priority) {
    case "high":
      return "red";
    case "medium":
      return "yellow";
    case "low":
      return "green";
    default:
      return "gray";
  }
}

export function SchedulingSuggestion({
  suggestion,
  onApply,
  onDismiss,
  isApplying = false,
}: SchedulingSuggestionProps) {
  const formattedDateTime = formatSuggestedDate(
    suggestion.suggestedDate,
    suggestion.suggestedTime
  );

  return (
    <div
      className="mt-2 p-2 rounded-md bg-surface-secondary border border-border-primary"
      onClick={(e) => e.stopPropagation()}
    >
      <Group gap="xs" align="center" wrap="nowrap">
        <IconSparkles size={14} className="text-brand-primary flex-shrink-0" />
        <Text size="xs" className="text-text-secondary">
          AI suggests:
        </Text>
        <Tooltip
          label={
            <div>
              <Text size="xs" fw={500}>
                {suggestion.reasoning}
              </Text>
              {suggestion.conflictWarning && (
                <Text size="xs" c="yellow" mt={4}>
                  {suggestion.conflictWarning}
                </Text>
              )}
            </div>
          }
          multiline
          w={250}
          withArrow
        >
          <Badge
            size="sm"
            variant="light"
            color={getPriorityColor(suggestion.priority)}
            leftSection={<IconCalendarEvent size={10} />}
            className="cursor-help"
          >
            {formattedDateTime}
          </Badge>
        </Tooltip>

        <Group gap={4} ml="auto">
          <Button
            size="compact-xs"
            variant="light"
            color="green"
            leftSection={isApplying ? <Loader size={10} /> : <IconCheck size={12} />}
            onClick={() =>
              onApply(
                suggestion.actionId,
                suggestion.suggestedDate,
                suggestion.suggestedTime
              )
            }
            disabled={isApplying}
          >
            Apply
          </Button>
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            leftSection={<IconX size={12} />}
            onClick={() => onDismiss(suggestion.actionId)}
            disabled={isApplying}
          >
            Dismiss
          </Button>
        </Group>
      </Group>
    </div>
  );
}

interface SchedulingSuggestionsLoaderProps {
  isLoading: boolean;
  error?: string | null;
  calendarConnected?: boolean;
}

export function SchedulingSuggestionsLoader({
  isLoading,
  error,
  calendarConnected = true,
}: SchedulingSuggestionsLoaderProps) {
  if (error) {
    return (
      <div className="mt-2 p-2 rounded-md bg-surface-secondary border border-border-primary">
        <Group gap="xs">
          <IconSparkles size={14} className="text-text-muted" />
          <Text size="xs" c="dimmed">
            Unable to generate suggestions
          </Text>
        </Group>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mt-2 p-2 rounded-md bg-surface-secondary border border-border-primary">
        <Group gap="xs">
          <Loader size={14} />
          <Text size="xs" c="dimmed">
            Generating AI scheduling suggestions...
          </Text>
        </Group>
      </div>
    );
  }

  if (!calendarConnected) {
    return (
      <div className="mt-2 p-2 rounded-md bg-surface-secondary border border-border-primary">
        <Group gap="xs">
          <IconSparkles size={14} className="text-text-muted" />
          <Text size="xs" c="dimmed">
            Connect Google Calendar for smarter scheduling suggestions
          </Text>
        </Group>
      </div>
    );
  }

  return null;
}
