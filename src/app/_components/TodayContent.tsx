"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, Stack, Paper, Text, Group, ScrollArea, ActionIcon, Drawer } from "@mantine/core";
import {
  IconHome,
  IconLayoutKanban,
  IconCalendar,
  IconClock,
  IconNotebook,
  IconMessageCircle,
  IconX,
} from "@tabler/icons-react";
import { Actions } from "./Actions";
import { TodayOverview } from "./TodayOverview";
import { StartupRoutineForm } from "./StartupRoutineForm";
import ManyChat from "./ManyChat";
import { api } from "~/trpc/react";
import { format, parseISO, startOfDay, endOfDay } from "date-fns";
import { CalendarDayView } from "./CalendarDayView";

type TabValue = "overview" | "tasks" | "calendar" | "journal";

const VALID_TABS: TabValue[] = ["overview", "tasks", "calendar", "journal"];

function isValidTab(tab: string | null | undefined): tab is TabValue {
  return tab != null && VALID_TABS.includes(tab as TabValue);
}

interface TodayContentProps {
  calendarConnected: boolean;
  initialTab?: string;
}

export function TodayContent({ calendarConnected, initialTab }: TodayContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [chatOpened, setChatOpened] = useState(false);
  const today = new Date();

  // Get tab from URL or use initial/default
  const tabFromUrl = searchParams.get("tab");
  const activeTab: TabValue = isValidTab(tabFromUrl)
    ? tabFromUrl
    : isValidTab(initialTab)
      ? initialTab
      : "overview";

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

  const handleTabChange = useCallback((value: string | null) => {
    if (value && isValidTab(value)) {
      const params = new URLSearchParams(searchParams.toString());
      if (value === "overview") {
        params.delete("tab");
      } else {
        params.set("tab", value);
      }
      const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
      router.push(newUrl, { scroll: false });
    }
  }, [router, searchParams]);

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
          <Group justify="space-between" align="center">
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
            <ActionIcon
              variant={chatOpened ? "gradient" : "filled"}
              gradient={chatOpened ? { from: "blue", to: "indigo", deg: 45 } : undefined}
              size="lg"
              onClick={() => setChatOpened(!chatOpened)}
              title={chatOpened ? "Close Chat" : "Open Chat"}
              style={{
                transition: "all 0.2s ease",
                transform: chatOpened ? "scale(1.05)" : "scale(1)",
                boxShadow: chatOpened ? "0 4px 12px rgba(59, 130, 246, 0.3)" : undefined,
              }}
            >
              <IconMessageCircle size={20} />
            </ActionIcon>
          </Group>

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

      {/* Chat Drawer */}
      <Drawer.Root
        opened={chatOpened}
        onClose={() => setChatOpened(false)}
        position="right"
        size="lg"
        trapFocus={false}
        lockScroll={false}
      >
        <Drawer.Content
          style={{
            height: "100vh",
            backgroundColor: "transparent",
          }}
        >
          <div className="bg-primary flex h-full flex-col">
            {/* Custom Header */}
            <div className="border-border-primary/30 bg-background-secondary/90 border-b p-4 backdrop-blur-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-brand-success h-2 w-2 animate-pulse rounded-full"></div>
                  <Text size="lg" fw={600} className="text-primary">
                    Daily Chat
                  </Text>
                </div>
                <ActionIcon
                  variant="subtle"
                  size="lg"
                  onClick={() => setChatOpened(false)}
                  c="dimmed"
                  className="hover:bg-surface-hover/50 transition-colors"
                >
                  <IconX size={20} />
                </ActionIcon>
              </div>
            </div>

            <div className="h-full flex-1 overflow-hidden">
              <ManyChat />
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Root>
    </div>
  );
}
