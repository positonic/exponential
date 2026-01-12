"use client";

import { Stack, Text, Group, Paper, Badge } from "@mantine/core";
import { IconCalendarEvent, IconClock, IconMapPin } from "@tabler/icons-react";
import { api } from "~/trpc/react";

function formatEventTime(start: { dateTime?: string; date?: string }): string {
  if (start.dateTime) {
    return new Date(start.dateTime).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
  // All-day event
  return "All day";
}

function isEventNow(
  start: { dateTime?: string; date?: string },
  end: { dateTime?: string; date?: string }
): boolean {
  const now = new Date();
  if (start.dateTime && end.dateTime) {
    const startTime = new Date(start.dateTime);
    const endTime = new Date(end.dateTime);
    return now >= startTime && now <= endTime;
  }
  return false;
}

function isEventNext(
  start: { dateTime?: string; date?: string },
  allEvents: Array<{ start: { dateTime?: string; date?: string } }>
): boolean {
  const now = new Date();
  if (!start.dateTime) return false;

  const startTime = new Date(start.dateTime);
  if (startTime <= now) return false;

  // Find the next upcoming event
  const upcomingEvents = allEvents
    .filter((e) => e.start.dateTime && new Date(e.start.dateTime) > now)
    .sort(
      (a, b) =>
        new Date(a.start.dateTime!).getTime() -
        new Date(b.start.dateTime!).getTime()
    );

  return (
    upcomingEvents.length > 0 &&
    upcomingEvents[0]!.start.dateTime === start.dateTime
  );
}

export function CalendarEventsToday() {
  const { data: events, isLoading, error } = api.calendar.getTodayEvents.useQuery();
  const { data: connectionStatus } = api.calendar.getConnectionStatus.useQuery();

  if (isLoading) {
    return (
      <Paper p="md" className="rounded-md bg-background-primary">
        <div className="animate-pulse space-y-2">
          <div className="h-4 w-3/4 rounded bg-surface-hover" />
          <div className="h-8 rounded bg-surface-hover" />
        </div>
      </Paper>
    );
  }

  // Show connection prompt if not connected
  if (!connectionStatus?.isConnected) {
    return (
      <Paper p="md" className="rounded-md bg-background-primary">
        <Stack gap="sm">
          <Group gap="xs">
            <IconCalendarEvent size={16} className="text-text-muted" />
            <Text size="sm" fw={500} className="text-text-secondary">
              Calendar
            </Text>
          </Group>
          <Text size="sm" className="text-text-muted">
            Connect your calendar in settings to see today&apos;s events
          </Text>
        </Stack>
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper p="md" className="rounded-md bg-background-primary">
        <Stack gap="sm">
          <Group gap="xs">
            <IconCalendarEvent size={16} className="text-text-muted" />
            <Text size="sm" fw={500} className="text-text-secondary">
              Calendar
            </Text>
          </Group>
          <Text size="sm" className="text-text-muted">
            Unable to load calendar events
          </Text>
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper p="md" className="rounded-md bg-background-primary">
      <Stack gap="sm">
        <Group gap="xs">
          <IconCalendarEvent size={16} className="text-text-muted" />
          <Text size="sm" fw={500} className="text-text-secondary">
            Calendar {events && events.length > 0 && `(${events.length})`}
          </Text>
        </Group>

        {!events || events.length === 0 ? (
          <Text size="sm" className="text-text-muted">
            No events scheduled for today
          </Text>
        ) : (
          <Stack gap="xs">
            {events.slice(0, 4).map((event) => {
              const isNow = isEventNow(event.start, event.end);
              const isNext = !isNow && isEventNext(event.start, events);

              return (
                <div key={event.id} className="space-y-1">
                  <Group gap="xs" wrap="nowrap">
                    <Group gap={4} wrap="nowrap">
                      <IconClock size={12} className="text-text-muted" />
                      <Text size="xs" className="text-text-muted">
                        {formatEventTime(event.start)}
                      </Text>
                    </Group>
                    {isNow && (
                      <Badge size="xs" color="green" variant="light">
                        Now
                      </Badge>
                    )}
                    {isNext && (
                      <Badge size="xs" color="blue" variant="light">
                        Next
                      </Badge>
                    )}
                  </Group>
                  <Text size="sm" className="text-text-primary" lineClamp={1}>
                    {event.summary}
                  </Text>
                  {event.location && (
                    <Group gap={4} wrap="nowrap">
                      <IconMapPin size={12} className="text-text-muted" />
                      <Text size="xs" className="text-text-muted" lineClamp={1}>
                        {event.location}
                      </Text>
                    </Group>
                  )}
                </div>
              );
            })}

            {events.length > 4 && (
              <Text size="xs" className="text-text-muted">
                +{events.length - 4} more events
              </Text>
            )}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
