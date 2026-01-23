"use client";

import { useState } from "react";
import {
  Drawer,
  Stack,
  Text,
  Button,
  Checkbox,
  Group,
  Badge,
  Loader,
  Alert,
} from "@mantine/core";
import { IconCalendar, IconAlertCircle } from "@tabler/icons-react";
import { format, differenceInMinutes } from "date-fns";
import { api } from "~/trpc/react";

interface CalendarEvent {
  id: string;
  summary: string | null;
  start: { dateTime?: string; date?: string } | null;
  end: { dateTime?: string; date?: string } | null;
  description?: string | null;
}

interface CalendarEventImporterProps {
  opened: boolean;
  onClose: () => void;
  planDate: Date;
  dailyPlanId: string;
  onImported: () => void;
}

function formatEventTime(event: CalendarEvent): string {
  if (!event.start?.dateTime) return "All day";
  const start = new Date(event.start.dateTime);
  const end = event.end?.dateTime ? new Date(event.end.dateTime) : null;

  const startStr = format(start, "h:mm a");
  const endStr = end ? format(end, "h:mm a") : "";

  return end ? `${startStr} - ${endStr}` : startStr;
}

function calculateDuration(event: CalendarEvent): number {
  if (!event.start?.dateTime || !event.end?.dateTime) return 60; // Default 1 hour for all-day events

  const start = new Date(event.start.dateTime);
  const end = new Date(event.end.dateTime);

  return Math.max(15, differenceInMinutes(end, start));
}

export function CalendarEventImporter({
  opened,
  onClose,
  planDate,
  dailyPlanId,
  onImported,
}: CalendarEventImporterProps) {
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);

  // Check calendar connection status
  const { data: connectionStatus, isLoading: statusLoading } =
    api.calendar.getConnectionStatus.useQuery();

  // Get events for the plan date
  const timeMin = new Date(planDate);
  timeMin.setHours(0, 0, 0, 0);
  const timeMax = new Date(planDate);
  timeMax.setHours(23, 59, 59, 999);

  const { data: events, isLoading: eventsLoading } = api.calendar.getEvents.useQuery(
    { timeMin, timeMax, maxResults: 50 },
    { enabled: opened && connectionStatus?.isConnected }
  );

  // Mutation to add tasks
  const addTaskMutation = api.dailyPlan.addTask.useMutation();

  const handleToggleEvent = (eventId: string) => {
    setSelectedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (!events) return;
    if (selectedEvents.size === events.length) {
      setSelectedEvents(new Set());
    } else {
      setSelectedEvents(new Set(events.map((e: CalendarEvent) => e.id)));
    }
  };

  const handleImport = async () => {
    if (!events || selectedEvents.size === 0) return;

    setIsImporting(true);
    try {
      const eventsToImport = events.filter((e: CalendarEvent) => selectedEvents.has(e.id));

      for (const event of eventsToImport) {
        await addTaskMutation.mutateAsync({
          dailyPlanId,
          name: event.summary ?? "Calendar Event",
          duration: calculateDuration(event),
          source: "calendar",
          sourceId: event.id,
        });
      }

      setSelectedEvents(new Set());
      onImported();
      onClose();
    } finally {
      setIsImporting(false);
    }
  };

  const isLoading = statusLoading || eventsLoading;

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title="Import from Calendar"
      position="right"
      size="md"
    >
      <Stack gap="md">
        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader size="md" />
          </div>
        )}

        {!isLoading && !connectionStatus?.isConnected && (
          <Alert
            icon={<IconAlertCircle size={16} />}
            title="Calendar not connected"
            color="yellow"
          >
            <Stack gap="sm">
              <Text size="sm">
                Connect your Google Calendar to import events as tasks.
              </Text>
              <Button
                component="a"
                href="/api/auth/signin"
                variant="filled"
                size="sm"
              >
                Connect Calendar
              </Button>
            </Stack>
          </Alert>
        )}

        {!isLoading && connectionStatus?.isConnected && events && (
          <>
            <Group justify="space-between" align="center">
              <Text size="sm" c="dimmed">
                {format(planDate, "EEEE, MMM d")}
              </Text>
              {events.length > 0 && (
                <Button variant="subtle" size="xs" onClick={handleSelectAll}>
                  {selectedEvents.size === events.length ? "Deselect all" : "Select all"}
                </Button>
              )}
            </Group>

            {events.length === 0 ? (
              <Text c="dimmed" ta="center" py="xl">
                No calendar events found for this day.
              </Text>
            ) : (
              <Stack gap="xs">
                {events.map((event: CalendarEvent) => (
                  <div
                    key={event.id}
                    className="flex items-start gap-3 rounded-md border border-border-primary p-3 hover:bg-surface-hover cursor-pointer"
                    onClick={() => handleToggleEvent(event.id)}
                  >
                    <Checkbox
                      checked={selectedEvents.has(event.id)}
                      onChange={() => handleToggleEvent(event.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <Stack gap={2} flex={1}>
                      <Text size="sm" fw={500} className="text-text-primary">
                        {event.summary ?? "Untitled Event"}
                      </Text>
                      <Group gap="xs">
                        <IconCalendar size={12} className="text-text-muted" />
                        <Text size="xs" c="dimmed">
                          {formatEventTime(event)}
                        </Text>
                        <Badge size="xs" variant="light" color="gray">
                          {calculateDuration(event)} min
                        </Badge>
                      </Group>
                    </Stack>
                  </div>
                ))}
              </Stack>
            )}

            {events.length > 0 && (
              <Button
                onClick={() => void handleImport()}
                disabled={selectedEvents.size === 0 || isImporting}
                loading={isImporting}
                fullWidth
              >
                Import {selectedEvents.size} event{selectedEvents.size !== 1 ? "s" : ""}
              </Button>
            )}
          </>
        )}
      </Stack>
    </Drawer>
  );
}
