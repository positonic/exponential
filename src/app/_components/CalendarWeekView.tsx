"use client";

import { Text, Paper, Stack, Group, Tooltip, ScrollArea } from "@mantine/core";
import { format, parseISO, eachDayOfInterval, isToday } from "date-fns";
import { type CalendarEvent } from "~/server/services/GoogleCalendarService";
import type { DateRange } from "~/types/focus";
import { IconClock } from "@tabler/icons-react";

interface CalendarWeekViewProps {
  events: CalendarEvent[];
  dateRange: DateRange;
}

export function CalendarWeekView({ events, dateRange }: CalendarWeekViewProps) {
  // Get all days in the week
  const days = eachDayOfInterval({
    start: dateRange.startDate,
    end: dateRange.endDate,
  });

  // Group events by day
  const eventsByDay = new Map<string, CalendarEvent[]>();

  days.forEach(day => {
    const dayKey = format(day, "yyyy-MM-dd");
    eventsByDay.set(dayKey, []);
  });

  events.forEach(event => {
    let eventDate: Date | null = null;

    if (event.start.date) {
      eventDate = new Date(event.start.date);
    } else if (event.start.dateTime) {
      eventDate = parseISO(event.start.dateTime);
    }

    if (eventDate) {
      const dayKey = format(eventDate, "yyyy-MM-dd");
      const dayEvents = eventsByDay.get(dayKey);
      if (dayEvents) {
        dayEvents.push(event);
      }
    }
  });

  const formatEventTime = (event: CalendarEvent) => {
    if (event.start.dateTime) {
      const startTime = parseISO(event.start.dateTime);
      const endTime = event.end.dateTime ? parseISO(event.end.dateTime) : null;

      if (endTime) {
        return `${format(startTime, "h:mm a")} - ${format(endTime, "h:mm a")}`;
      } else {
        return format(startTime, "h:mm a");
      }
    }
    return "All day";
  };

  const getEventColor = (event: CalendarEvent) => {
    if (event.status === "cancelled") return "bg-red-900/40 border-red-700";
    if (event.status === "tentative") return "bg-yellow-900/40 border-yellow-700";

    const colors = [
      "bg-blue-900/40 border-blue-700",
      "bg-green-900/40 border-green-700",
      "bg-purple-900/40 border-purple-700",
      "bg-indigo-900/40 border-indigo-700",
    ];

    const colorIndex = event.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    return colors[colorIndex] ?? colors[0];
  };

  return (
    <Paper p="md" radius="md" withBorder className="border-border-primary bg-surface-secondary">
      <Text fw={600} size="lg" mb="md" className="text-text-primary">
        {format(dateRange.startDate, "MMMM d")} - {format(dateRange.endDate, "d, yyyy")}
      </Text>

      <div className="grid grid-cols-7 gap-2">
        {days.map(day => {
          const dayKey = format(day, "yyyy-MM-dd");
          const dayEvents = eventsByDay.get(dayKey) ?? [];
          const isTodayDate = isToday(day);

          return (
            <div key={dayKey} className="min-h-[200px]">
              {/* Day header */}
              <div
                className={`mb-2 rounded-md p-2 text-center ${
                  isTodayDate
                    ? "bg-brand-primary/20 border border-brand-primary"
                    : "bg-surface-hover"
                }`}
              >
                <Text size="xs" c="dimmed">
                  {format(day, "EEE")}
                </Text>
                <Text
                  size="lg"
                  fw={isTodayDate ? 700 : 500}
                  className={isTodayDate ? "text-brand-primary" : "text-text-primary"}
                >
                  {format(day, "d")}
                </Text>
              </div>

              {/* Day events */}
              <ScrollArea h={300} scrollbarSize={4}>
                <Stack gap="xs">
                  {dayEvents.length > 0 ? (
                    dayEvents
                      .sort((a, b) => {
                        // All-day events first
                        if (!a.start.dateTime && b.start.dateTime) return -1;
                        if (a.start.dateTime && !b.start.dateTime) return 1;
                        if (!a.start.dateTime && !b.start.dateTime) return 0;

                        const aTime = a.start.dateTime ? parseISO(a.start.dateTime) : new Date(0);
                        const bTime = b.start.dateTime ? parseISO(b.start.dateTime) : new Date(0);
                        return aTime.getTime() - bTime.getTime();
                      })
                      .map(event => (
                        <Tooltip
                          key={event.id}
                          label={
                            <Stack gap={4}>
                              <Text size="sm" fw={600}>
                                {event.summary}
                              </Text>
                              <Text size="xs">{formatEventTime(event)}</Text>
                              {event.location && (
                                <Text size="xs">📍 {event.location}</Text>
                              )}
                            </Stack>
                          }
                          multiline
                          position="right"
                          withArrow
                        >
                          <Paper
                            p="xs"
                            radius="sm"
                            className={`cursor-pointer border transition-all hover:brightness-110 ${getEventColor(event)}`}
                            onClick={() =>
                              event.htmlLink && window.open(event.htmlLink, "_blank")
                            }
                          >
                            <Text
                              size="xs"
                              fw={500}
                              className="text-text-primary"
                              lineClamp={2}
                            >
                              {event.summary}
                            </Text>
                            <Group gap={4} mt={2}>
                              <IconClock size={10} className="text-text-muted" />
                              <Text size="xs" c="dimmed" style={{ fontSize: "10px" }}>
                                {event.start.dateTime
                                  ? format(parseISO(event.start.dateTime), "h:mm a")
                                  : "All day"}
                              </Text>
                            </Group>
                          </Paper>
                        </Tooltip>
                      ))
                  ) : (
                    <Text size="xs" c="dimmed" ta="center" py="sm">
                      No events
                    </Text>
                  )}
                </Stack>
              </ScrollArea>
            </div>
          );
        })}
      </div>
    </Paper>
  );
}
