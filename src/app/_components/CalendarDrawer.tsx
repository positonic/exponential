"use client";

import { Drawer, Text, ScrollArea, Stack, Paper, Group, Badge, ActionIcon, Button } from "@mantine/core";
import { IconCalendar, IconClock, IconMapPin, IconX, IconExternalLink, IconList, IconCalendarTime } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { format, parseISO, startOfDay, endOfDay } from "date-fns";
import { useState } from "react";
import { CalendarDayView } from "./CalendarDayView";
import { CalendarDrawerSkeleton, CalendarDayViewSkeleton } from "./CalendarSkeleton";
import { ErrorBoundary } from "./ErrorBoundary";

interface CalendarDrawerProps {
  opened: boolean;
  onClose: () => void;
  selectedDate?: Date;
}

function CalendarDrawerContent({ opened, onClose, selectedDate = new Date() }: CalendarDrawerProps) {
  const [viewMode, setViewMode] = useState<'list' | 'dayview' | 'week'>('list');
  
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
      size="lg"
      trapFocus={false}
      lockScroll={false}
      withOverlay={false}
      title={
        <Group gap="sm">
          <IconCalendar size={20} className="text-blue-400" />
          <Text size="lg" fw={600}>
            Calendar - {format(selectedDate, 'EEEE, MMM d, yyyy')}
          </Text>
        </Group>
      }
      styles={{
        content: {
          backgroundColor: '#1A1B1E',
        },
        header: {
          backgroundColor: '#1A1B1E',
          borderBottom: '1px solid #373A40',
          color: '#C1C2C5',
        },
        title: {
          color: '#C1C2C5',
        },
        close: {
          color: '#C1C2C5',
          '&:hover': {
            backgroundColor: '#25262B',
          }
        }
      }}
    >
      <ScrollArea h="calc(100vh - 80px)">
        <Stack gap="md">
          {/* View Mode Toggle */}
          <Group gap="xs">
            <Button
              size="xs"
              variant={viewMode === 'list' ? 'filled' : 'light'}
              onClick={() => setViewMode('list')}
              leftSection={<IconList size={14} />}
            >
              List
            </Button>
            <Button
              size="xs"
              variant={viewMode === 'dayview' ? 'filled' : 'light'}
              onClick={() => setViewMode('dayview')}
              leftSection={<IconCalendarTime size={14} />}
            >
              Day View
            </Button>
            <Button
              size="xs"
              variant={viewMode === 'week' ? 'filled' : 'light'}
              onClick={() => setViewMode('week')}
              disabled // Week view not implemented yet
            >
              Week View
            </Button>
          </Group>

          {isLoading && (
            viewMode === 'dayview' ? <CalendarDayViewSkeleton /> : <CalendarDrawerSkeleton />
          )}

          {error && (
            <Paper p="lg" className="bg-red-900/20 border border-red-700">
              <Text c="red" size="sm">
                {error.message.includes("No Google Calendar access token") 
                  ? "Please connect your Google Calendar to see events."
                  : "Failed to load calendar events. Please try again."}
              </Text>
            </Paper>
          )}

          {events && events.length === 0 && !isLoading && !error && (
            <Paper p="lg" className="bg-[#25262B] text-center">
              <Group justify="center" gap="sm">
                <IconCalendar size={24} className="text-gray-400" />
                <Text c="dimmed">No events on this day</Text>
              </Group>
            </Paper>
          )}

          {/* Day View */}
          {events && events.length > 0 && viewMode === 'dayview' && (
            <CalendarDayView 
              events={events} 
              selectedDate={selectedDate}
              className="bg-[#25262B] rounded-lg border border-gray-700"
            />
          )}

          {/* List View */}
          {events && events.length > 0 && viewMode === 'list' && (
            <Stack gap="md">
              <Group gap="xs">
                <Text size="sm" fw={500} c="C1C2C5">
                  {events.length} event{events.length !== 1 ? 's' : ''}
                </Text>
              </Group>

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
                    p="md"
                    className="bg-[#25262B] border border-gray-700 hover:bg-[#2C2E33] transition-colors"
                  >
                    <Stack gap="sm">
                      {/* Event Header */}
                      <Group justify="space-between" align="start">
                        <Text size="md" fw={500} className="flex-1 min-w-0">
                          {event.summary}
                        </Text>
                        <Group gap="xs">
                          {event.status === 'confirmed' && (
                            <Badge size="sm" color="green" variant="light">
                              Confirmed
                            </Badge>
                          )}
                          {event.htmlLink && (
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              color="blue"
                              onClick={() => window.open(event.htmlLink, '_blank')}
                            >
                              <IconExternalLink size={14} />
                            </ActionIcon>
                          )}
                        </Group>
                      </Group>

                      {/* Event Details */}
                      <Stack gap="xs">
                        <Group gap="md">
                          <Group gap={6}>
                            <IconClock size={14} className="text-gray-400" />
                            <Text size="sm" c="dimmed">
                              {formatEventTime(event)}
                            </Text>
                            {getEventDuration(event) && (
                              <Badge size="xs" color="blue" variant="light">
                                {getEventDuration(event)}
                              </Badge>
                            )}
                          </Group>
                        </Group>

                        {event.location && (
                          <Group gap={6}>
                            <IconMapPin size={14} className="text-gray-400" />
                            <Text size="sm" c="dimmed">
                              {event.location}
                            </Text>
                          </Group>
                        )}

                        {event.attendees && event.attendees.length > 0 && (
                          <Group gap="xs">
                            <Text size="xs" c="dimmed">
                              {event.attendees.length} attendee{event.attendees.length !== 1 ? 's' : ''}
                            </Text>
                            {event.attendees.slice(0, 3).map((attendee, index) => (
                              <Badge key={index} size="xs" variant="outline" color="gray">
                                {attendee.displayName || attendee.email.split('@')[0]}
                              </Badge>
                            ))}
                            {event.attendees.length > 3 && (
                              <Text size="xs" c="dimmed">
                                +{event.attendees.length - 3} more
                              </Text>
                            )}
                          </Group>
                        )}
                      </Stack>

                      {/* Event Description */}
                      {event.description && (
                        <Paper p="sm" className="bg-[#1A1B1E] border border-gray-800">
                          <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
                            {event.description.length > 200 
                              ? `${event.description.substring(0, 200)}...`
                              : event.description
                            }
                          </Text>
                        </Paper>
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