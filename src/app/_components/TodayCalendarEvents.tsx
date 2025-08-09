"use client";

import { Text, Paper, Group, Stack, Badge, Loader, Alert } from "@mantine/core";
import { IconCalendar, IconClock, IconMapPin, IconAlertCircle } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { format, parseISO } from "date-fns";

export function TodayCalendarEvents() {
  const { data: events, isLoading, error } = api.calendar.getTodayEvents.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <Paper p="md" className="bg-[#1E1E1E]">
        <Group>
          <Loader size="sm" />
          <Text size="sm" c="dimmed">Loading today's calendar events...</Text>
        </Group>
      </Paper>
    );
  }

  if (error) {
    return (
      <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
        <Text size="sm">
          {error.message.includes("No Google Calendar access token") 
            ? "Please connect your Google Calendar to see events."
            : "Failed to load calendar events. Please try again."}
        </Text>
      </Alert>
    );
  }

  if (!events || events.length === 0) {
    return (
      <Paper p="md" className="bg-[#1E1E1E]">
        <Group>
          <IconCalendar size={16} className="text-gray-400" />
          <Text size="sm" c="dimmed">No calendar events today</Text>
        </Group>
      </Paper>
    );
  }

  const formatEventTime = (event: typeof events[0]) => {
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

  return (
    <Stack gap="xs">
      <Group gap="xs">
        <IconCalendar size={16} className="text-blue-400" />
        <Text size="sm" fw={500} c="C1C2C5">Today's Calendar ({events.length})</Text>
      </Group>
      
      {events.map((event) => (
        <Paper
          key={event.id}
          p="sm"
          className="bg-[#252525] border border-gray-700 hover:bg-[#2a2a2a] transition-colors"
        >
          <Stack gap={4}>
            <Group justify="space-between" wrap="nowrap">
              <Text size="sm" fw={500} className="flex-1 min-w-0 truncate">
                {event.summary}
              </Text>
              {event.status === 'confirmed' && (
                <Badge size="xs" color="green" variant="light">
                  Confirmed
                </Badge>
              )}
            </Group>
            
            <Group gap="md" wrap="nowrap">
              <Group gap={4}>
                <IconClock size={12} className="text-gray-400" />
                <Text size="xs" c="dimmed">
                  {formatEventTime(event)}
                </Text>
              </Group>
              
              {event.location && (
                <Group gap={4}>
                  <IconMapPin size={12} className="text-gray-400" />
                  <Text size="xs" c="dimmed" className="truncate max-w-[200px]">
                    {event.location}
                  </Text>
                </Group>
              )}
            </Group>
            
            {event.description && (
              <Text size="xs" c="dimmed" className="line-clamp-2">
                {event.description}
              </Text>
            )}
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}