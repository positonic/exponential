"use client";

import { Paper, Stack, Text, Title } from "@mantine/core";
import { IconCalendar } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";
import { useCalendarNavigation } from "./useCalendarNavigation";
import { CalendarHeader } from "./CalendarHeader";
import { CalendarSidebar } from "./CalendarSidebar";
import { CalendarDayTimeGrid } from "./CalendarDayTimeGrid";
import { CalendarWeekTimeGrid } from "./CalendarWeekTimeGrid";
import { GoogleCalendarConnect } from "~/app/_components/GoogleCalendarConnect";
import { MicrosoftCalendarConnect } from "~/app/_components/MicrosoftCalendarConnect";
import type { ScheduledAction } from "./types";

export function CalendarPageContent() {
  // Query connection status for all providers
  const { data: connectionStatuses, isLoading: statusLoading } =
    api.calendar.getAllConnectionStatuses.useQuery();

  const googleConnected = connectionStatuses?.google?.isConnected ?? false;
  const microsoftConnected = connectionStatuses?.microsoft?.isConnected ?? false;
  const calendarConnected = googleConnected || microsoftConnected;
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

  // Fetch calendar events from all selected calendars
  const { data: events, isLoading: eventsLoading } =
    api.calendar.getEventsMultiCalendar.useQuery(
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

  const updateDailyPlanTask = api.dailyPlan.updateTask.useMutation({
    onSuccess: async () => {
      await utils.action.getScheduledByDateRange.invalidate();
      await utils.dailyPlan.getOrCreateToday.invalidate();
    },
  });

  // Handle calendar disconnect
  const disconnectCalendar = api.calendar.disconnect.useMutation({
    onSuccess: async () => {
      await utils.calendar.getAllConnectionStatuses.invalidate();
      await utils.calendar.getEventsMultiCalendar.invalidate();
      await utils.calendar.getCalendarPreferences.invalidate();
      notifications.show({
        title: "Calendar Disconnected",
        message: "Calendar has been disconnected.",
        color: "blue",
      });
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message ?? "Failed to disconnect calendar",
        color: "red",
      });
    },
  });

  const handleActionStatusChange = (action: ScheduledAction, completed: boolean) => {
    if (action.source === "daily-plan" && action.dailyPlanActionId) {
      updateDailyPlanTask.mutate({
        id: action.dailyPlanActionId,
        completed,
      });
      return;
    }

    updateAction.mutate({
      id: action.actionId ?? action.id,
      status: completed ? "COMPLETED" : "ACTIVE",
    });
  };

  // Transform scheduled actions to the expected format
  const scheduledActions: ScheduledAction[] = scheduledActionsData ?? [];

  const renderCalendarContent = () => {
    // Show loading state while checking connection
    if (statusLoading) {
      return (
        <Paper
          p="xl"
          radius="md"
          className="flex h-full items-center justify-center border-border-primary bg-surface-secondary"
        >
          <Text c="dimmed">Checking calendar connection...</Text>
        </Paper>
      );
    }

    if (!calendarConnected) {
      return (
        <Paper
          p="xl"
          radius="md"
          className="flex h-full items-center justify-center border-border-primary bg-surface-secondary"
        >
          <Stack align="center" gap="lg">
            <IconCalendar size={64} className="text-text-muted" />
            <div className="text-center">
              <Title order={3} className="text-text-primary mb-2">
                Connect Your Calendar
              </Title>
              <Text size="sm" c="dimmed" className="max-w-md">
                Connect your calendar to view your events, manage your
                schedule, and see your day at a glance alongside your tasks.
              </Text>
            </div>
            <Stack gap="sm">
              <GoogleCalendarConnect isConnected={false} />
              <MicrosoftCalendarConnect isConnected={false} />
            </Stack>
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
        isConnected={calendarConnected}
        googleConnected={googleConnected}
        microsoftConnected={microsoftConnected}
        onDisconnect={(provider) => disconnectCalendar.mutate({ provider })}
        isDisconnecting={disconnectCalendar.isPending}
      />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto p-4">{renderCalendarContent()}</div>
        <CalendarSidebar selectedDate={selectedDate} onDateSelect={setDate} />
      </div>
    </div>
  );
}
