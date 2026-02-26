"use client";

import { Paper, Stack, Text, Title } from "@mantine/core";
import { IconCalendar } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { api } from "~/trpc/react";
import { useCalendarNavigation } from "./useCalendarNavigation";
import { CalendarHeader } from "./CalendarHeader";
import { CalendarSidebar } from "./CalendarSidebar";
import { CalendarDayTimeGrid } from "./CalendarDayTimeGrid";
import { CalendarWeekTimeGrid } from "./CalendarWeekTimeGrid";
import { GoogleCalendarConnect } from "~/app/_components/GoogleCalendarConnect";
import { MicrosoftCalendarConnect } from "~/app/_components/MicrosoftCalendarConnect";
import { EditActionModal } from "~/app/_components/EditActionModal";
import type { ScheduledAction } from "./types";

export function CalendarPageContent() {
  // Query connection status for all providers
  const { data: connectionStatuses, isLoading: statusLoading } =
    api.calendar.getAllConnectionStatuses.useQuery();

  // Query connected calendar account details
  const { data: connectedAccounts } =
    api.calendar.getConnectedCalendarAccounts.useQuery();

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

  // Edit Action Modal state
  const [selectedAction, setSelectedAction] = useState<ScheduledAction | null>(null);
  const [editModalOpened, setEditModalOpened] = useState(false);

  // Mutations for rescheduling actions via drag-and-drop (with optimistic updates)
  const scheduledQueryInput = { startDate: dateRange.start, endDate: dateRange.end };

  const updateAction = api.action.update.useMutation({
    onMutate: async (variables) => {
      await utils.action.getScheduledByDateRange.cancel();
      const previousData = utils.action.getScheduledByDateRange.getData(scheduledQueryInput);
      if (variables.scheduledStart) {
        utils.action.getScheduledByDateRange.setData(scheduledQueryInput, (old) => {
          if (!old) return old;
          return old.map((action) =>
            action.actionId === variables.id
              ? {
                  ...action,
                  scheduledStart: variables.scheduledStart!,
                  scheduledEnd: variables.scheduledEnd ?? action.scheduledEnd,
                }
              : action
          );
        });
      }
      return { previousData };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousData) {
        utils.action.getScheduledByDateRange.setData(scheduledQueryInput, context.previousData);
      }
    },
    onSettled: async () => {
      await utils.action.getScheduledByDateRange.invalidate();
      await utils.action.getToday.invalidate();
    },
  });

  const updateDailyPlanTask = api.dailyPlan.updateTask.useMutation({
    onMutate: async (variables) => {
      await utils.action.getScheduledByDateRange.cancel();
      const previousData = utils.action.getScheduledByDateRange.getData(scheduledQueryInput);
      if (variables.scheduledStart) {
        utils.action.getScheduledByDateRange.setData(scheduledQueryInput, (old) => {
          if (!old) return old;
          return old.map((action) =>
            action.dailyPlanActionId === variables.id
              ? {
                  ...action,
                  scheduledStart: variables.scheduledStart!,
                  scheduledEnd: variables.scheduledEnd ?? action.scheduledEnd,
                }
              : action
          );
        });
      }
      return { previousData };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousData) {
        utils.action.getScheduledByDateRange.setData(scheduledQueryInput, context.previousData);
      }
    },
    onSettled: async () => {
      await utils.action.getScheduledByDateRange.invalidate();
      await utils.dailyPlan.getOrCreateToday.invalidate();
    },
  });

  const handleActionClick = (action: ScheduledAction) => {
    if (action.source === "action" && action.actionId) {
      setSelectedAction(action);
      setEditModalOpened(true);
    }
  };

  const handleRescheduleAction = (action: ScheduledAction, newStart: Date, newEnd: Date) => {
    if (action.source === "daily-plan" && action.dailyPlanActionId) {
      updateDailyPlanTask.mutate({
        id: action.dailyPlanActionId,
        scheduledStart: newStart,
        scheduledEnd: newEnd,
      });
    } else if (action.source === "action" && action.actionId) {
      updateAction.mutate({
        id: action.actionId,
        scheduledStart: newStart,
        scheduledEnd: newEnd,
      });
    }
  };

  // Handle refresh - clear server cache then refetch
  const clearCache = api.calendar.clearCache.useMutation();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Clear server-side cache for each connected provider
      const clearPromises: Promise<unknown>[] = [];
      if (googleConnected) {
        clearPromises.push(clearCache.mutateAsync({ provider: "google" }));
      }
      if (microsoftConnected) {
        clearPromises.push(clearCache.mutateAsync({ provider: "microsoft" }));
      }
      await Promise.all(clearPromises);
      // Invalidate client-side cache to trigger refetch
      await utils.calendar.getEventsMultiCalendar.invalidate();
    } finally {
      setIsRefreshing(false);
    }
  };

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
          onActionClick={handleActionClick}
          onRescheduleAction={handleRescheduleAction}
        />
      );
    }

    return (
      <CalendarWeekTimeGrid
        events={events ?? []}
        scheduledActions={scheduledActions}
        dateRange={dateRange}
        onActionClick={handleActionClick}
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
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto p-4">{renderCalendarContent()}</div>
        <CalendarSidebar
          selectedDate={selectedDate}
          onDateSelect={setDate}
          googleConnected={googleConnected}
          microsoftConnected={microsoftConnected}
          connectedAccounts={connectedAccounts?.connectedAccounts ?? []}
        />
      </div>

      <EditActionModal
        action={
          selectedAction?.actionId
            ? {
                id: selectedAction.actionId,
                name: selectedAction.name,
                description: null,
                status: selectedAction.status,
                priority: "Quick",
                dueDate: null,
                projectId: selectedAction.project?.id ?? null,
                scheduledStart: selectedAction.scheduledStart,
                duration: selectedAction.duration,
              }
            : null
        }
        opened={editModalOpened}
        onClose={() => {
          setEditModalOpened(false);
          setSelectedAction(null);
        }}
        onSuccess={() => {
          void utils.action.getScheduledByDateRange.invalidate();
        }}
      />
    </div>
  );
}
