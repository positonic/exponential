"use client";

import {
  Card,
  Text,
  ScrollArea,
  Stack,
  Paper,
  Group,
  Badge,
  ActionIcon,
  Button,
  Tooltip,
} from "@mantine/core";
import {
  IconCalendar,
  IconClock,
  IconMapPin,
  IconExternalLink,
  IconList,
  IconCalendarTime,
  IconPlus,
  IconUnlink,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";
import { format, parseISO, startOfDay, endOfDay, isToday } from "date-fns";
import { useState, useRef, useEffect } from "react";
import { CalendarDayView } from "./CalendarDayView";
import { CalendarDayViewSkeleton, CalendarEventsSkeleton } from "./CalendarSkeleton";
import { GoogleCalendarConnect } from "./GoogleCalendarConnect";
import { CreateMeetingModal } from "./CreateMeetingModal";
import { stripHtml } from "~/lib/utils";

interface ProjectCalendarCardProps {
  projectId?: string;
  projectName?: string;
  selectedDate?: Date;
}

export function ProjectCalendarCard({ projectId, projectName, selectedDate: propSelectedDate }: ProjectCalendarCardProps) {
  const [viewMode, setViewMode] = useState<"list" | "dayview">("list");
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const selectedDate = propSelectedDate ?? new Date();

  // Check calendar connection status
  const { data: connectionStatus, isLoading: statusLoading } =
    api.calendar.getConnectionStatus.useQuery();

  const utils = api.useUtils();

  // Disconnect calendar mutation
  const disconnectCalendar = api.calendar.disconnect.useMutation({
    onSuccess: () => {
      void utils.calendar.getConnectionStatus.invalidate();
      notifications.show({
        title: "Calendar Disconnected",
        message: "Your Google Calendar has been disconnected.",
        color: "blue",
      });
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message || "Failed to disconnect calendar",
        color: "red",
      });
    },
  });

  // Fetch events for today
  const {
    data: events,
    isLoading,
    error,
  } = api.calendar.getEvents.useQuery(
    {
      timeMin: startOfDay(selectedDate),
      timeMax: endOfDay(selectedDate),
      maxResults: 20,
    },
    {
      enabled: connectionStatus?.isConnected ?? false,
      retry: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    }
  );

  // Scroll to center on current time when day view is opened
  useEffect(() => {
    if (viewMode === "dayview" && scrollAreaRef.current) {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinutes = now.getMinutes();
      const currentTimeInMinutes = currentHour * 60 + currentMinutes;
      const currentTimePosition = (currentTimeInMinutes / 60) * 60;

      setTimeout(() => {
        const viewport = scrollAreaRef.current?.querySelector(
          "[data-radix-scroll-area-viewport]"
        );
        if (viewport) {
          const viewportHeight = viewport.clientHeight;
          const scrollPosition = currentTimePosition - viewportHeight / 2;
          viewport.scrollTop = Math.max(0, scrollPosition);
        }
      }, 100);
    }
  }, [viewMode]);

  const formatEventTime = (event: NonNullable<typeof events>[0]) => {
    if (event.start.dateTime) {
      const startTime = parseISO(event.start.dateTime);
      const endTime = event.end.dateTime ? parseISO(event.end.dateTime) : null;

      if (endTime) {
        return `${format(startTime, "h:mm a")} - ${format(endTime, "h:mm a")}`;
      } else {
        return format(startTime, "h:mm a");
      }
    } else if (event.start.date) {
      return "All day";
    }
    return "";
  };

  const getEventDuration = (event: NonNullable<typeof events>[0]) => {
    if (event.start.dateTime && event.end.dateTime) {
      const start = parseISO(event.start.dateTime);
      const end = parseISO(event.end.dateTime);
      const durationMs = end.getTime() - start.getTime();
      const durationMins = Math.round(durationMs / (1000 * 60));

      if (durationMins < 60) {
        return `${durationMins}m`;
      } else {
        const hours = Math.floor(durationMins / 60);
        const mins = durationMins % 60;
        return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
      }
    }
    return null;
  };

  const isConnected = connectionStatus?.isConnected ?? false;

  return (
    <Card
      withBorder
      radius="md"
      p="sm"
      mt="md"
      className="border-border-primary bg-surface-secondary"
    >
      {/* Header */}
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          <IconCalendar
            size={18}
            style={{ color: "var(--mantine-color-blue-4)" }}
          />
          <Text size="sm" fw={600} className="text-text-primary">
            {isToday(selectedDate) ? "Today's Schedule" : format(selectedDate, "EEE, MMM d")}
          </Text>
        </Group>
        {isConnected && (
          <Group gap={4}>
            <CreateMeetingModal projectId={projectId} projectName={projectName ?? undefined}>
              <ActionIcon variant="subtle" size="sm" aria-label="Create meeting">
                <IconPlus size={14} />
              </ActionIcon>
            </CreateMeetingModal>
            <Tooltip label="Disconnect calendar" position="bottom">
              <ActionIcon
                variant="subtle"
                size="sm"
                color="gray"
                aria-label="Disconnect calendar"
                onClick={() => disconnectCalendar.mutate()}
                loading={disconnectCalendar.isPending}
              >
                <IconUnlink size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        )}
      </Group>

      {/* Loading connection status */}
      {statusLoading && (
        <Stack align="center" py="md">
          <Text size="sm" c="dimmed">
            Checking calendar...
          </Text>
        </Stack>
      )}

      {/* Not connected */}
      {!statusLoading && !isConnected && (
        <Stack gap="sm" py="sm">
          <Text size="xs" c="dimmed" ta="center">
            Connect your Google Calendar to see your schedule
          </Text>
          <GoogleCalendarConnect isConnected={false} />
        </Stack>
      )}

      {/* Connected - Show calendar content */}
      {!statusLoading && isConnected && (
        <Stack gap="sm">
          {/* View Mode Toggle */}
          <Button.Group>
            <Button
              size="xs"
              variant={viewMode === "list" ? "filled" : "default"}
              onClick={() => setViewMode("list")}
              leftSection={<IconList size={14} />}
              color={viewMode === "list" ? "blue" : "gray"}
              styles={{ root: { flex: 1 } }}
            >
              List
            </Button>
            <Button
              size="xs"
              variant={viewMode === "dayview" ? "filled" : "default"}
              onClick={() => setViewMode("dayview")}
              leftSection={<IconCalendarTime size={14} />}
              color={viewMode === "dayview" ? "blue" : "gray"}
              styles={{ root: { flex: 1 } }}
            >
              Day
            </Button>
          </Button.Group>

          {/* Loading events */}
          {isLoading && (viewMode === "dayview" ? <CalendarDayViewSkeleton /> : <CalendarEventsSkeleton />)}

          {/* Error */}
          {error && (
            <Paper
              p="sm"
              radius="md"
              style={{ backgroundColor: "rgba(250, 82, 82, 0.1)" }}
            >
              <Text c="red.4" size="xs">
                {error.message.includes("No Google Calendar access token")
                  ? "Please reconnect your calendar."
                  : "Failed to load events."}
              </Text>
            </Paper>
          )}

          {/* No events */}
          {events && events.length === 0 && !isLoading && !error && (
            <Paper
              p="md"
              radius="md"
              className="bg-surface-tertiary"
              style={{ textAlign: "center" }}
            >
              <Stack align="center" gap="xs">
                <IconCalendar
                  size={24}
                  style={{ color: "var(--mantine-color-gray-6)" }}
                />
                <Text size="sm" c="dimmed">
                  {isToday(selectedDate) ? "No events today" : `No events on ${format(selectedDate, "MMM d")}`}
                </Text>
              </Stack>
            </Paper>
          )}

          {/* Day View */}
          {events && events.length > 0 && viewMode === "dayview" && (
            <ScrollArea h={300} ref={scrollAreaRef} scrollbarSize={6}>
              <Paper withBorder className="bg-surface-tertiary" p="xs">
                <CalendarDayView events={events} selectedDate={selectedDate} />
              </Paper>
            </ScrollArea>
          )}

          {/* List View */}
          {events && events.length > 0 && viewMode === "list" && (
            <ScrollArea h={300} scrollbarSize={6}>
              <Stack gap="xs">
                <Text size="xs" c="dimmed">
                  {events.length} event{events.length !== 1 ? "s" : ""}
                </Text>

                {events
                  .sort((a, b) => {
                    if (!a.start.dateTime && b.start.dateTime) return -1;
                    if (a.start.dateTime && !b.start.dateTime) return 1;
                    if (!a.start.dateTime && !b.start.dateTime) return 0;

                    const aTime = a.start.dateTime
                      ? parseISO(a.start.dateTime)
                      : new Date(0);
                    const bTime = b.start.dateTime
                      ? parseISO(b.start.dateTime)
                      : new Date(0);
                    return aTime.getTime() - bTime.getTime();
                  })
                  .map((event) => (
                    <Paper
                      key={event.id}
                      p="sm"
                      radius="sm"
                      className="cursor-pointer border-border-primary bg-surface-tertiary transition-all hover:bg-surface-hover"
                      onClick={() =>
                        event.htmlLink && window.open(event.htmlLink, "_blank")
                      }
                    >
                      <Stack gap={4}>
                        {/* Event Title */}
                        <Group
                          justify="space-between"
                          align="start"
                          wrap="nowrap"
                        >
                          <Text
                            size="sm"
                            fw={500}
                            className="text-text-primary"
                            lineClamp={1}
                          >
                            {event.summary}
                          </Text>
                          {event.htmlLink && (
                            <ActionIcon
                              size="xs"
                              variant="subtle"
                              color="blue"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(event.htmlLink, "_blank");
                              }}
                            >
                              <IconExternalLink size={12} />
                            </ActionIcon>
                          )}
                        </Group>

                        {/* Time */}
                        <Group gap="xs">
                          <IconClock
                            size={12}
                            style={{ color: "var(--mantine-color-gray-5)" }}
                          />
                          <Text size="xs" c="dimmed">
                            {formatEventTime(event)}
                          </Text>
                          {getEventDuration(event) && (
                            <Badge size="xs" variant="light" color="blue">
                              {getEventDuration(event)}
                            </Badge>
                          )}
                        </Group>

                        {/* Location */}
                        {event.location && (
                          <Group gap="xs">
                            <IconMapPin
                              size={12}
                              style={{ color: "var(--mantine-color-gray-5)" }}
                            />
                            <Text size="xs" c="dimmed" lineClamp={1}>
                              {event.location}
                            </Text>
                          </Group>
                        )}

                        {/* Description preview */}
                        {event.description && (
                          <Text size="xs" c="dimmed" lineClamp={1}>
                            {stripHtml(event.description)}
                          </Text>
                        )}
                      </Stack>
                    </Paper>
                  ))}
              </Stack>
            </ScrollArea>
          )}
        </Stack>
      )}
    </Card>
  );
}
