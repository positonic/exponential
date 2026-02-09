"use client";

import { useState } from "react";
import { Text, Paper, Stack, Group, Tooltip, Badge, ScrollArea } from "@mantine/core";
import { Calendar } from "@mantine/dates";
import { format, parseISO, isSameDay } from "date-fns";
import { type CalendarEvent } from "~/server/services/GoogleCalendarService";
import type { DateRange } from "~/types/focus";
import { IconClock, IconMapPin } from "@tabler/icons-react";

interface CalendarMonthViewProps {
  events: CalendarEvent[];
  dateRange: DateRange;
}

export function CalendarMonthView({ events, dateRange }: CalendarMonthViewProps) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Group events by day
  const getEventsForDate = (date: Date): CalendarEvent[] => {
    return events.filter(event => {
      let eventDate: Date | null = null;

      if (event.start.date) {
        eventDate = new Date(event.start.date);
      } else if (event.start.dateTime) {
        eventDate = parseISO(event.start.dateTime);
      }

      return eventDate && isSameDay(eventDate, date);
    });
  };

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
    if (event.status === "cancelled") return "red";
    if (event.status === "tentative") return "yellow";

    const colors = ["blue", "green", "violet", "indigo"];
    const colorIndex = event.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    return colors[colorIndex] ?? "blue";
  };

  const selectedDateEvents = selectedDate ? getEventsForDate(selectedDate) : [];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Left: Month Calendar */}
      <div className="lg:col-span-2">
        <Paper p="md" radius="md" withBorder className="border-border-primary bg-surface-secondary">
          <Text fw={600} size="lg" mb="md" className="text-text-primary">
            {format(dateRange.startDate, "MMMM yyyy")}
          </Text>

          <div className="flex justify-center">
            <Calendar
              size="xl"
              defaultDate={dateRange.startDate}
              getDayProps={(date) => ({
                onClick: () => setSelectedDate(date),
                selected: selectedDate ? isSameDay(date, selectedDate) : false,
              })}
              renderDay={(date) => {
                const day = date.getDate();
                const dayEvents = getEventsForDate(date);
                const hasEvents = dayEvents.length > 0;

                return (
                  <Tooltip
                    label={
                      hasEvents ? (
                        <Stack gap={4}>
                          <Text size="xs" fw={600}>
                            {dayEvents.length} event{dayEvents.length > 1 ? "s" : ""}
                          </Text>
                          {dayEvents.slice(0, 3).map(event => (
                            <Text key={event.id} size="xs" lineClamp={1}>
                              {event.summary}
                            </Text>
                          ))}
                          {dayEvents.length > 3 && (
                            <Text size="xs" c="dimmed">
                              +{dayEvents.length - 3} more
                            </Text>
                          )}
                        </Stack>
                      ) : null
                    }
                    disabled={!hasEvents}
                    withArrow
                    multiline
                    w={200}
                  >
                    <div className="relative">
                      <div>{day}</div>
                      {hasEvents && (
                        <div className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 gap-0.5">
                          {dayEvents.slice(0, 3).map((event, idx) => (
                            <div
                              key={idx}
                              className={`h-1 w-1 rounded-full bg-${getEventColor(event)}-500`}
                              style={{
                                backgroundColor: `var(--mantine-color-${getEventColor(event)}-6)`,
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </Tooltip>
                );
              }}
            />
          </div>
        </Paper>
      </div>

      {/* Right: Selected Day Events */}
      <div>
        <Paper p="md" radius="md" withBorder className="border-border-primary bg-surface-secondary">
          <Text fw={600} size="lg" mb="md" className="text-text-primary">
            {selectedDate ? format(selectedDate, "EEEE, MMMM d") : "Select a day"}
          </Text>

          <ScrollArea h={400}>
            <Stack gap="sm">
              {selectedDate ? (
                selectedDateEvents.length > 0 ? (
                  selectedDateEvents
                    .sort((a, b) => {
                      if (!a.start.dateTime && b.start.dateTime) return -1;
                      if (a.start.dateTime && !b.start.dateTime) return 1;
                      if (!a.start.dateTime && !b.start.dateTime) return 0;

                      const aTime = a.start.dateTime ? parseISO(a.start.dateTime) : new Date(0);
                      const bTime = b.start.dateTime ? parseISO(b.start.dateTime) : new Date(0);
                      return aTime.getTime() - bTime.getTime();
                    })
                    .map(event => (
                      <Paper
                        key={event.id}
                        p="sm"
                        radius="sm"
                        className="cursor-pointer border-border-primary bg-background-secondary hover:bg-surface-hover"
                        onClick={() =>
                          event.htmlLink && window.open(event.htmlLink, "_blank")
                        }
                      >
                        <Group justify="space-between" wrap="nowrap" mb={4}>
                          <Text size="sm" fw={500} className="text-text-primary" lineClamp={2}>
                            {event.summary}
                          </Text>
                          <Badge size="xs" color={getEventColor(event)} variant="light">
                            {event.start.date ? "All day" : "Timed"}
                          </Badge>
                        </Group>

                        <Group gap="xs">
                          <IconClock size={12} className="text-text-muted" />
                          <Text size="xs" c="dimmed">
                            {formatEventTime(event)}
                          </Text>
                        </Group>

                        {event.location && (
                          <Group gap="xs" mt={4}>
                            <IconMapPin size={12} className="text-text-muted" />
                            <Text size="xs" c="dimmed" lineClamp={1}>
                              {event.location}
                            </Text>
                          </Group>
                        )}
                      </Paper>
                    ))
                ) : (
                  <Text size="sm" c="dimmed" ta="center" py="xl">
                    No events on this day
                  </Text>
                )
              ) : (
                <Text size="sm" c="dimmed" ta="center" py="xl">
                  Click on a day to see events
                </Text>
              )}
            </Stack>
          </ScrollArea>
        </Paper>
      </div>
    </div>
  );
}
