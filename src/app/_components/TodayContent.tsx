"use client";

import { useState } from "react";
import { Tabs, Stack, Paper, Text, Group, ScrollArea } from "@mantine/core";
import {
  IconHome,
  IconLayoutKanban,
  IconCalendar,
  IconClock,
  IconNotebook,
} from "@tabler/icons-react";
import { Actions } from "./Actions";
import { TodayOverview } from "./TodayOverview";
import { StartupRoutineForm } from "./StartupRoutineForm";
import { api } from "~/trpc/react";
import { format, parseISO, startOfDay, endOfDay } from "date-fns";
import { CalendarDayView } from "./CalendarDayView";

type TabValue = "overview" | "tasks" | "calendar" | "journal";

interface TodayContentProps {
  calendarConnected: boolean;
}

export function TodayContent({ calendarConnected }: TodayContentProps) {
  const [activeTab, setActiveTab] = useState<TabValue>("overview");
  const today = new Date();

  // Fetch calendar events for today
  const { data: events, isLoading: eventsLoading } = api.calendar.getEvents.useQuery(
    {
      timeMin: startOfDay(today),
      timeMax: endOfDay(today),
      maxResults: 20,
    },
    {
      enabled: calendarConnected && activeTab === "calendar",
      retry: false,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    }
  );

  const handleTabChange = (value: string | null) => {
    if (value) {
      setActiveTab(value as TabValue);
    }
  };

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

  return (
    <div className="w-full">
      <Tabs value={activeTab} onChange={handleTabChange}>
        <Stack gap="xl" align="stretch" justify="flex-start">
          {/* Tabs Navigation */}
          <Tabs.List>
            <Tabs.Tab value="overview" leftSection={<IconHome size={16} />}>
              Overview
            </Tabs.Tab>
            <Tabs.Tab value="tasks" leftSection={<IconLayoutKanban size={16} />}>
              Tasks
            </Tabs.Tab>
            <Tabs.Tab value="calendar" leftSection={<IconCalendar size={16} />}>
              Calendar
            </Tabs.Tab>
            <Tabs.Tab value="journal" leftSection={<IconNotebook size={16} />}>
              Journal
            </Tabs.Tab>
          </Tabs.List>

          {/* Content Area */}
          <Tabs.Panel value="overview">
            <TodayOverview />
          </Tabs.Panel>

          <Tabs.Panel value="tasks">
            <Actions viewName="today" />
          </Tabs.Panel>

          <Tabs.Panel value="calendar">
            {!calendarConnected ? (
              <Paper
                p="xl"
                radius="md"
                className="border-border-primary bg-surface-secondary text-center"
              >
                <Stack align="center" gap="md">
                  <IconCalendar
                    size={48}
                    className="text-text-muted"
                  />
                  <Text size="lg" fw={500} className="text-text-primary">
                    Calendar not connected
                  </Text>
                  <Text size="sm" c="dimmed">
                    Connect your Google Calendar from the header to see today&apos;s
                    events
                  </Text>
                </Stack>
              </Paper>
            ) : eventsLoading ? (
              <Paper
                p="xl"
                radius="md"
                className="border-border-primary bg-surface-secondary text-center"
              >
                <Text c="dimmed">Loading calendar events...</Text>
              </Paper>
            ) : events && events.length === 0 ? (
              <Paper
                p="xl"
                radius="md"
                className="border-border-primary bg-surface-secondary text-center"
              >
                <Stack align="center" gap="md">
                  <IconCalendar size={48} className="text-text-muted" />
                  <Text size="lg" fw={500} className="text-text-primary">
                    No events today
                  </Text>
                  <Text size="sm" c="dimmed">
                    Enjoy your free time!
                  </Text>
                </Stack>
              </Paper>
            ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                {/* Left Column - Day View */}
                <div className="lg:col-span-2">
                  <Paper
                    p="md"
                    radius="md"
                    withBorder
                    className="border-border-primary bg-surface-secondary"
                  >
                    <Text fw={600} size="lg" mb="md" className="text-text-primary">
                      {format(today, "EEEE, MMMM d")}
                    </Text>
                    <ScrollArea h={600}>
                      {events && <CalendarDayView events={events} selectedDate={today} />}
                    </ScrollArea>
                  </Paper>
                </div>

                {/* Right Column - Event List */}
                <div>
                  <Paper
                    p="md"
                    radius="md"
                    withBorder
                    className="border-border-primary bg-surface-secondary"
                  >
                    <Text fw={600} size="lg" mb="md" className="text-text-primary">
                      Today&apos;s Schedule
                    </Text>
                    <Stack gap="sm">
                      {events
                        ?.sort((a, b) => {
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
                            className="cursor-pointer border-border-primary bg-background-secondary hover:bg-surface-hover"
                            onClick={() =>
                              event.htmlLink && window.open(event.htmlLink, "_blank")
                            }
                          >
                            <Text size="sm" fw={500} className="text-text-primary" lineClamp={1}>
                              {event.summary}
                            </Text>
                            <Group gap="xs" mt={4}>
                              <IconClock size={12} className="text-text-muted" />
                              <Text size="xs" c="dimmed">
                                {formatEventTime(event)}
                              </Text>
                            </Group>
                          </Paper>
                        ))}
                    </Stack>
                  </Paper>
                </div>
              </div>
            )}
          </Tabs.Panel>

          <Tabs.Panel value="journal">
            <StartupRoutineForm />
          </Tabs.Panel>
        </Stack>
      </Tabs>
    </div>
  );
}
