"use client";

import { Drawer, Text, ScrollArea, Stack, Paper, Group, Badge, ActionIcon, Button } from "@mantine/core";
import { IconCalendar, IconClock, IconMapPin, IconExternalLink, IconList, IconCalendarTime } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { format, parseISO, startOfDay, endOfDay } from "date-fns";
import { useState, useRef, useEffect } from "react";
import { CalendarDayView } from "./CalendarDayView";
import { CalendarDrawerSkeleton, CalendarDayViewSkeleton } from "./CalendarSkeleton";
import { ErrorBoundary } from "./ErrorBoundary";
import { stripHtml } from "~/lib/utils";

interface CalendarDrawerProps {
  opened: boolean;
  onClose: () => void;
  selectedDate?: Date;
}

function CalendarDrawerContent({ opened, onClose, selectedDate = new Date() }: CalendarDrawerProps) {
  const [viewMode, setViewMode] = useState<'list' | 'dayview'>('list');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  
  // Scroll to center on current time when day view is opened
  useEffect(() => {
    if (viewMode === 'dayview' && opened && scrollAreaRef.current) {
      // Calculate current time position
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinutes = now.getMinutes();
      const currentTimeInMinutes = currentHour * 60 + currentMinutes;
      
      // Convert to pixels (60 pixels per hour)
      const currentTimePosition = (currentTimeInMinutes / 60) * 60;
      
      // Small delay to ensure content is rendered
      setTimeout(() => {
        const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
        if (viewport) {
          // Get viewport height to center the current time
          const viewportHeight = viewport.clientHeight;
          // Calculate scroll position to center current time
          const scrollPosition = currentTimePosition - (viewportHeight / 2);
          viewport.scrollTop = Math.max(0, scrollPosition);
        }
      }, 100);
    }
  }, [viewMode, opened]);
  
  // Fetch events for the selected date
  const { data: events, isLoading, error } = api.calendar.getEvents.useQuery(
    {
      timeMin: startOfDay(selectedDate),
      timeMax: endOfDay(selectedDate),
      maxResults: 20,
    },
    {
      enabled: opened, // Only fetch when drawer is opened
      retry: false,
      staleTime: 5 * 60 * 1000, // 5 minutes - data considered fresh
      refetchOnWindowFocus: false,
    }
  );

  const formatEventTime = (event: NonNullable<typeof events>[0]) => {
    if (event.start.dateTime) {
      const startTime = parseISO(event.start.dateTime);
      const endTime = event.end.dateTime ? parseISO(event.end.dateTime) : null;
      
      if (endTime) {
        return `${format(startTime, 'h:mm a')} - ${format(endTime, 'h:mm a')}`;
      } else {
        return format(startTime, 'h:mm a');
      }
    } else if (event.start.date) {
      return 'All day';
    }
    return '';
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

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="20%"
      trapFocus={false}
      lockScroll={false}
      withOverlay={false}
      title={
        <Group gap="sm">
          <IconCalendar size={20} style={{ color: 'var(--mantine-color-blue-4)' }} />
          <Text size="lg" fw={600}>
            {format(selectedDate, 'EEEE, MMM d, yyyy')}
          </Text>
        </Group>
      }
      styles={{
        content: {
          backgroundColor: 'var(--color-bg-elevated)',
        },
        header: {
          backgroundColor: 'var(--color-bg-elevated)',
          borderBottom: '1px solid var(--mantine-color-dark-6)',
          color: 'var(--mantine-color-white)',
        },
        title: {
          color: 'var(--mantine-color-white)',
        },
        close: {
          color: 'var(--mantine-color-gray-4)',
          '&:hover': {
            backgroundColor: 'var(--mantine-color-dark-6)',
          }
        }
      }}
    >
      <ScrollArea h="calc(100vh - 80px)" ref={scrollAreaRef} scrollbarSize={6}>
        <Stack gap="lg" p="md">
          {/* View Mode Toggle */}
          <Button.Group>
            <Button
              size="md"
              variant={viewMode === 'list' ? 'filled' : 'default'}
              onClick={() => setViewMode('list')}
              leftSection={<IconList size={18} />}
              color={viewMode === 'list' ? 'blue' : 'gray'}
              styles={{ root: { flex: 1 } }}
            >
              List
            </Button>
            <Button
              size="md"
              variant={viewMode === 'dayview' ? 'filled' : 'default'}
              onClick={() => setViewMode('dayview')}
              leftSection={<IconCalendarTime size={18} />}
              color={viewMode === 'dayview' ? 'blue' : 'gray'}
              styles={{ root: { flex: 1 } }}
            >
              Day View
            </Button>
          </Button.Group>

          {isLoading && (
            viewMode === 'dayview' ? <CalendarDayViewSkeleton /> : <CalendarDrawerSkeleton />
          )}

          {error && (
            <Paper p="lg" radius="md" style={{ backgroundColor: 'rgba(250, 82, 82, 0.1)' }}>
              <Group gap="sm">
                <IconCalendar size={20} style={{ color: 'var(--mantine-color-red-4)' }} />
                <Text c="red.4" size="sm" fw={500}>
                  {error.message.includes("No Google Calendar access token") 
                    ? "Please connect your Google Calendar to see events."
                    : "Failed to load calendar events. Please try again."}
                </Text>
              </Group>
            </Paper>
          )}

          {events && events.length === 0 && !isLoading && !error && (
            <Paper p="xl" bg="dark.6" radius="md" style={{ textAlign: 'center' }}>
              <Stack align="center" gap="md">
                <IconCalendar size={32} style={{ color: 'var(--mantine-color-gray-6)' }} />
                <div>
                  <Text size="lg" fw={500} c="white">No events today</Text>
                  <Text size="sm" c="dimmed" mt={4}>Enjoy your free time!</Text>
                </div>
              </Stack>
            </Paper>
          )}

          {/* Day View */}
          {events && events.length > 0 && viewMode === 'dayview' && (
            <Paper withBorder bg="dark.7" p="sm">
              <CalendarDayView 
                events={events} 
                selectedDate={selectedDate}
              />
            </Paper>
          )}

          {/* List View */}
          {events && events.length > 0 && viewMode === 'list' && (
            <Stack gap="md">
              <Text size="sm" fw={500} c="dimmed">
                {events.length} event{events.length !== 1 ? 's' : ''}
              </Text>

              {events
                .sort((a, b) => {
                  // Sort by start time, with all-day events first
                  if (!a.start.dateTime && b.start.dateTime) return -1;
                  if (a.start.dateTime && !b.start.dateTime) return 1;
                  if (!a.start.dateTime && !b.start.dateTime) return 0;
                  
                  const aTime = a.start.dateTime ? parseISO(a.start.dateTime) : new Date(0);
                  const bTime = b.start.dateTime ? parseISO(b.start.dateTime) : new Date(0);
                  return aTime.getTime() - bTime.getTime();
                })
                .map((event) => (
                  <Paper
                    key={event.id}
                    p="lg"
                    bg="dark.6"
                    radius="md"
                    className="hover:bg-[var(--mantine-color-dark-5)] transition-all cursor-pointer"
                    onClick={() => event.htmlLink && window.open(event.htmlLink, '_blank')}
                  >
                    <Stack gap="xs">
                      {/* Event Title */}
                      <Group justify="space-between" align="start" wrap="nowrap">
                        <Text size="lg" fw={600} c="white" style={{ lineHeight: 1.3 }}>
                          {event.summary}
                        </Text>
                        {event.htmlLink && (
                          <ActionIcon
                            size="md"
                            variant="subtle"
                            color="blue"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(event.htmlLink, '_blank');
                            }}
                          >
                            <IconExternalLink size={18} />
                          </ActionIcon>
                        )}
                      </Group>

                      {/* Time and Status Row */}
                      <Group justify="space-between" align="center">
                        <Group gap="xs">
                          <IconClock size={16} style={{ color: 'var(--mantine-color-gray-5)' }} />
                          <Text size="md" c="gray.3">
                            {formatEventTime(event)}
                          </Text>
                          {getEventDuration(event) && (
                            <Text size="sm" c="blue.4" fw={600}>
                              {getEventDuration(event)}
                            </Text>
                          )}
                        </Group>
                        {event.status === 'confirmed' && (
                          <Badge size="md" variant="dot" color="green">
                            CONFIRMED
                          </Badge>
                        )}
                      </Group>

                      {/* Location */}
                      {event.location && (
                        <Group gap="xs" mt="xs">
                          <IconMapPin size={16} style={{ color: 'var(--mantine-color-gray-5)' }} />
                          <Text size="sm" c="gray.4">
                            {event.location}
                          </Text>
                        </Group>
                      )}

                      {/* Attendees */}
                      {event.attendees && event.attendees.length > 0 && (
                        <Stack gap={4} mt="xs">
                          <Text size="xs" c="gray.5" fw={500}>
                            {event.attendees.length} attendee{event.attendees.length !== 1 ? 's' : ''}
                          </Text>
                          <Group gap={4}>
                            {event.attendees.slice(0, 3).map((attendee, index) => (
                              <Badge key={index} size="sm" variant="light" color="gray" radius="sm">
                                {attendee.displayName || attendee.email.split('@')[0]}
                              </Badge>
                            ))}
                            {event.attendees.length > 3 && (
                              <Text size="xs" c="gray.5">
                                +{event.attendees.length - 3} more
                              </Text>
                            )}
                          </Group>
                        </Stack>
                      )}

                      {/* Event Description */}
                      {event.description && (
                        <Text size="sm" c="gray.4" mt="sm" lineClamp={3}>
                          {stripHtml(event.description)}
                        </Text>
                      )}
                    </Stack>
                  </Paper>
                ))}
            </Stack>
          )}
        </Stack>
      </ScrollArea>
    </Drawer>
  );
}

// Wrap with error boundary
export function CalendarDrawer(props: CalendarDrawerProps) {
  return (
    <ErrorBoundary>
      <CalendarDrawerContent {...props} />
    </ErrorBoundary>
  );
}