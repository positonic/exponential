"use client";

import { Paper, Stack, Text } from "@mantine/core";
import { IconCalendar } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { useCalendarNavigation } from "./useCalendarNavigation";
import { CalendarHeader } from "./CalendarHeader";
import { CalendarSidebar } from "./CalendarSidebar";
import { CalendarDayTimeGrid } from "./CalendarDayTimeGrid";
import { CalendarWeekTimeGrid } from "./CalendarWeekTimeGrid";
import type { ScheduledAction } from "./types";

interface CalendarPageContentProps {
  calendarConnected: boolean;
}

export function CalendarPageContent({
  calendarConnected,
}: CalendarPageContentProps) {
  const {
    view,
    selectedDate,
    dateRange,
    setView,
    setDate,
    goToToday,
    goNext,
    goPrevious,
  } = useCalendarNavigation();

  // Fetch calendar events for the date range
  const { data: events, isLoading: eventsLoading } =
    api.calendar.getEvents.useQuery(
      {
        timeMin: dateRange.start,
        timeMax: dateRange.end,
        maxResults: view === "week" ? 100 : 50,
      },
      {
        enabled: calendarConnected,
        retry: false,
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
      }
    );

  // Fetch scheduled actions for the date range
  const { data: scheduledActionsData } =
    api.action.getScheduledByDateRange.useQuery(
      {
        startDate: dateRange.start,
        endDate: dateRange.end,
      },
      {
        staleTime: 2 * 60 * 1000,
      }
    );

  const utils = api.useUtils();

  // Handle action status change
  const updateAction = api.action.update.useMutation({
    onSuccess: async () => {
      await utils.action.getScheduledByDateRange.invalidate();
      await utils.action.getToday.invalidate();
    },
  });

  const handleActionStatusChange = (actionId: string, completed: boolean) => {
    updateAction.mutate({
      id: actionId,
      status: completed ? "COMPLETED" : "ACTIVE",
    });
  };

  // Transform scheduled actions to the expected format
  const scheduledActions: ScheduledAction[] =
    scheduledActionsData
      ?.filter((a) => a.scheduledStart)
      .map((a) => ({
        id: a.id,
        name: a.name,
        scheduledStart: a.scheduledStart!,
        scheduledEnd: a.scheduledEnd,
        duration: a.duration,
        status: a.status,
        project: a.project,
      })) ?? [];

  const renderCalendarContent = () => {
    if (!calendarConnected) {
      return (
        <Paper
          p="xl"
          radius="md"
          className="flex h-full items-center justify-center border-border-primary bg-surface-secondary"
        >
          <Stack align="center" gap="md">
            <IconCalendar size={48} className="text-text-muted" />
            <Text size="lg" fw={500} className="text-text-primary">
              Calendar not connected
            </Text>
            <Text size="sm" c="dimmed">
              Connect your Google Calendar from the header to see your events
            </Text>
          </Stack>
        </Paper>
      );
    }

    if (eventsLoading) {
      return (
        <Paper
          p="xl"
          radius="md"
          className="flex h-full items-center justify-center border-border-primary bg-surface-secondary"
        >
          <Text c="dimmed">Loading calendar events...</Text>
        </Paper>
      );
    }

    if (view === "day") {
      return (
        <CalendarDayTimeGrid
          events={events ?? []}
          scheduledActions={scheduledActions}
          selectedDate={selectedDate}
          onActionStatusChange={handleActionStatusChange}
        />
      );
    }

    return (
      <CalendarWeekTimeGrid
        events={events ?? []}
        scheduledActions={scheduledActions}
        dateRange={dateRange}
        onActionStatusChange={handleActionStatusChange}
      />
    );
  };

  return (
    <div className="flex h-full flex-col">
      <CalendarHeader
        view={view}
        selectedDate={selectedDate}
        onViewChange={setView}
        onToday={goToToday}
        onNext={goNext}
        onPrevious={goPrevious}
      />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto p-4">{renderCalendarContent()}</div>
        <CalendarSidebar selectedDate={selectedDate} onDateSelect={setDate} />
      </div>
    </div>
  );
}
