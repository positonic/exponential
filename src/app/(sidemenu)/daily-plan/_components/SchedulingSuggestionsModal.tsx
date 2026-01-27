"use client";

import { useState, useEffect } from "react";
import {
  Modal,
  Stack,
  Group,
  Text,
  Button,
  Checkbox,
  Paper,
  Badge,
  Loader,
  Alert,
} from "@mantine/core";
import {
  IconSparkles,
  IconClock,
  IconCalendarEvent,
  IconAlertCircle,
} from "@tabler/icons-react";
import { format } from "date-fns";

export interface SchedulingSuggestion {
  taskId: string;
  taskName: string;
  duration: number;
  suggestedStart: Date;
  suggestedEnd: Date;
  reasoning: string;
  score: number;
}

interface SchedulingSuggestionsModalProps {
  opened: boolean;
  onClose: () => void;
  suggestions: SchedulingSuggestion[];
  isLoading: boolean;
  calendarConnected: boolean;
  onApply: (suggestions: SchedulingSuggestion[]) => Promise<void>;
  isApplying: boolean;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours} hr`;
  return `${hours}:${mins.toString().padStart(2, "0")}`;
}

export function SchedulingSuggestionsModal({
  opened,
  onClose,
  suggestions,
  isLoading,
  calendarConnected,
  onApply,
  isApplying,
}: SchedulingSuggestionsModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Initialize all suggestions as selected when modal opens
  useEffect(() => {
    if (opened && suggestions.length > 0) {
      setSelectedIds(new Set(suggestions.map((s) => s.taskId)));
    }
  }, [opened, suggestions]);

  const toggleSelection = (taskId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(suggestions.map((s) => s.taskId)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleApply = async () => {
    const selectedSuggestions = suggestions.filter((s) =>
      selectedIds.has(s.taskId)
    );
    await onApply(selectedSuggestions);
    onClose();
  };

  const selectedCount = selectedIds.size;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <IconSparkles size={20} className="text-brand-primary" />
          <Text fw={600}>AI Scheduling Suggestions</Text>
          <Badge size="xs" variant="light" color="violet">AI-Powered</Badge>
        </Group>
      }
      size="lg"
    >
      <Stack gap="md">
        {!calendarConnected && (
          <Alert
            icon={<IconAlertCircle size={16} />}
            color="yellow"
            variant="light"
          >
            Calendar not connected. Suggestions may overlap with your meetings.
          </Alert>
        )}

        {isLoading ? (
          <Stack align="center" py="xl">
            <Loader size="md" />
            <Text size="sm" c="dimmed">
              AI is analyzing your schedule...
            </Text>
            <Text size="xs" c="dimmed">
              Finding optimal time slots based on your calendar and task priorities
            </Text>
          </Stack>
        ) : suggestions.length === 0 ? (
          <Stack align="center" py="xl">
            <IconCalendarEvent size={48} className="text-text-muted" />
            <Text c="dimmed">No unscheduled tasks to suggest times for.</Text>
          </Stack>
        ) : (
          <>
            {/* Selection controls */}
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                {selectedCount} of {suggestions.length} selected
              </Text>
              <Group gap="xs">
                <Button
                  variant="subtle"
                  size="xs"
                  onClick={selectAll}
                  disabled={selectedCount === suggestions.length}
                >
                  Select all
                </Button>
                <Button
                  variant="subtle"
                  size="xs"
                  onClick={deselectAll}
                  disabled={selectedCount === 0}
                >
                  Deselect all
                </Button>
              </Group>
            </Group>

            {/* Suggestions list */}
            <Stack gap="xs" mah={400} style={{ overflowY: "auto" }}>
              {suggestions.map((suggestion) => (
                <Paper
                  key={suggestion.taskId}
                  p="sm"
                  className={`border transition-colors cursor-pointer ${
                    selectedIds.has(suggestion.taskId)
                      ? "bg-brand-primary/5 border-brand-primary/30"
                      : "bg-surface-secondary border-border-primary hover:bg-surface-hover"
                  }`}
                  onClick={() => toggleSelection(suggestion.taskId)}
                >
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Group gap="sm" wrap="nowrap" flex={1}>
                      <Checkbox
                        checked={selectedIds.has(suggestion.taskId)}
                        onChange={() => toggleSelection(suggestion.taskId)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Stack gap={4} flex={1}>
                        <Text size="sm" fw={500} className="text-text-primary">
                          {suggestion.taskName}
                        </Text>
                        <Group gap="xs">
                          <Badge
                            size="xs"
                            variant="light"
                            color="blue"
                            leftSection={<IconClock size={10} />}
                          >
                            {format(suggestion.suggestedStart, "h:mm a")} -{" "}
                            {format(suggestion.suggestedEnd, "h:mm a")}
                          </Badge>
                          <Badge size="xs" variant="light" color="gray">
                            {formatDuration(suggestion.duration)}
                          </Badge>
                        </Group>
                        {suggestion.reasoning.includes("⚠️") ? (
                          <>
                            <Text size="xs" c="dimmed" lineClamp={2}>
                              {suggestion.reasoning.split("⚠️")[0]}
                            </Text>
                            <Text size="xs" c="yellow" lineClamp={1}>
                              ⚠️ {suggestion.reasoning.split("⚠️")[1]}
                            </Text>
                          </>
                        ) : (
                          <Text size="xs" c="dimmed" lineClamp={2}>
                            {suggestion.reasoning}
                          </Text>
                        )}
                      </Stack>
                    </Group>
                  </Group>
                </Paper>
              ))}
            </Stack>

            {/* Apply button */}
            <Group justify="flex-end" mt="sm">
              <Button variant="subtle" onClick={onClose} disabled={isApplying}>
                Cancel
              </Button>
              <Button
                leftSection={<IconSparkles size={16} />}
                onClick={() => void handleApply()}
                disabled={selectedCount === 0}
                loading={isApplying}
              >
                Apply Selected ({selectedCount})
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}
