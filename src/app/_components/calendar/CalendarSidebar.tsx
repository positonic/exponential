"use client";

import {
  Text,
  Stack,
  Group,
  UnstyledButton,
  Checkbox,
  Menu,
  ActionIcon,
  Loader,
} from "@mantine/core";
import {
  IconBrandGoogle,
  IconBrandWindows,
  IconPlus,
  IconDots,
  IconUnlink,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";
import { CalendarMiniWidget } from "./CalendarMiniWidget";
import { getEventHue, EVENT_HUE_DOT } from "./eventHue";

interface CalendarSidebarProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
}

export function CalendarSidebar({
  selectedDate,
  onDateSelect,
}: CalendarSidebarProps) {
  const utils = api.useUtils();

  const { data, isLoading } = api.calendar.getCalendarAccounts.useQuery();
  const accounts = data?.accounts ?? [];
  const hasMicrosoft = accounts.some((a) => a.provider === "microsoft");

  const startOAuth = (path: string) => {
    const returnUrl = encodeURIComponent(
      window.location.pathname + window.location.search,
    );
    window.location.href = `${path}?returnUrl=${returnUrl}`;
  };

  const updateSelected = api.calendar.updateSelectedCalendars.useMutation({
    onMutate: async ({ accountId, calendarIds }) => {
      await utils.calendar.getCalendarAccounts.cancel();
      const previous = utils.calendar.getCalendarAccounts.getData();
      utils.calendar.getCalendarAccounts.setData(undefined, (old) =>
        old
          ? {
              accounts: old.accounts.map((a) =>
                a.id === accountId
                  ? { ...a, selectedCalendarIds: calendarIds }
                  : a,
              ),
            }
          : old,
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        utils.calendar.getCalendarAccounts.setData(undefined, ctx.previous);
      }
      notifications.show({
        title: "Couldn't update calendars",
        message: "Your selection was reverted.",
        color: "red",
      });
    },
    onSettled: () => {
      void utils.calendar.getCalendarAccounts.invalidate();
      void utils.calendar.getEventsMultiCalendar.invalidate();
    },
  });

  const disconnect = api.calendar.disconnect.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.calendar.getCalendarAccounts.invalidate(),
        utils.calendar.getAllConnectionStatuses.invalidate(),
        utils.calendar.getEventsMultiCalendar.invalidate(),
      ]);
      notifications.show({
        title: "Calendar disconnected",
        message: "The account was removed from your calendar.",
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

  const toggleCalendar = (
    accountId: string,
    selectedCalendarIds: string[],
    calendarId: string,
    checked: boolean,
  ) => {
    const next = checked
      ? [...selectedCalendarIds, calendarId]
      : selectedCalendarIds.filter((id) => id !== calendarId);
    // updateSelectedCalendars requires at least one selected calendar.
    if (next.length === 0) {
      notifications.show({
        title: "Keep at least one calendar",
        message: "Select another calendar before hiding this one.",
        color: "yellow",
      });
      return;
    }
    updateSelected.mutate({ accountId, calendarIds: next });
  };

  return (
    <div className="hidden w-64 flex-shrink-0 border-l border-border-primary bg-background-primary p-4 lg:block">
      <Stack gap="lg">
        {/* Mini Calendar */}
        <div>
          <CalendarMiniWidget
            selectedDate={selectedDate}
            onDateSelect={onDateSelect}
          />
        </div>

        {/* Calendars Section */}
        <div>
          <Text size="sm" fw={600} mb="sm" className="text-text-primary">
            Calendars
          </Text>

          <Stack gap="md">
            {isLoading ? (
              <Group gap="xs">
                <Loader size="xs" />
                <Text size="sm" c="dimmed">
                  Loading calendars…
                </Text>
              </Group>
            ) : accounts.length === 0 ? (
              <Text size="sm" c="dimmed">
                No calendars connected
              </Text>
            ) : (
              accounts.map((account) => (
                <div key={account.id}>
                  {/* Account header */}
                  <Group gap="xs" wrap="nowrap" mb="xs">
                    {account.provider === "google" ? (
                      <IconBrandGoogle
                        size={14}
                        className="text-text-secondary flex-shrink-0"
                      />
                    ) : (
                      <IconBrandWindows
                        size={14}
                        className="text-text-secondary flex-shrink-0"
                      />
                    )}
                    <Text
                      size="xs"
                      fw={600}
                      className="text-text-secondary flex-1 truncate"
                      title={account.email ?? undefined}
                    >
                      {account.email ?? account.name ?? "Calendar account"}
                    </Text>
                    <Menu position="bottom-end" withinPortal>
                      <Menu.Target>
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          size="sm"
                          aria-label="Account options"
                        >
                          <IconDots size={14} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          leftSection={<IconUnlink size={14} />}
                          color="red"
                          onClick={() =>
                            disconnect.mutate({ accountId: account.id })
                          }
                        >
                          Disconnect
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Group>

                  {/* Per-calendar checkboxes */}
                  <Stack gap={6} pl="md">
                    {account.calendars.length === 0 ? (
                      <Text size="xs" c="dimmed">
                        No calendars found
                      </Text>
                    ) : (
                      account.calendars.map((cal) => (
                        <Checkbox
                          key={cal.id}
                          size="xs"
                          checked={account.selectedCalendarIds.includes(cal.id)}
                          onChange={(e) =>
                            toggleCalendar(
                              account.id,
                              account.selectedCalendarIds,
                              cal.id,
                              e.currentTarget.checked,
                            )
                          }
                          label={
                            <Group gap={6} wrap="nowrap">
                              {/* Legend dot shows the calendar's DEFAULT hue
                                  (the calendarId hash). Per-event overrides —
                                  cancelled→rose, tentative→amber, or a summary
                                  matching the low-signal regex→slate — are not
                                  reflected here, so an individual chip may
                                  differ from its calendar's dot. */}
                              <span
                                className={`inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ${
                                  EVENT_HUE_DOT[
                                    getEventHue({
                                      id: cal.id,
                                      calendarId: cal.id,
                                      calendarName: cal.summary,
                                      summary: cal.summary,
                                    })
                                  ]
                                }`}
                              />
                              <Text size="xs" className="truncate" title={cal.summary}>
                                {cal.summary}
                              </Text>
                            </Group>
                          }
                        />
                      ))
                    )}
                  </Stack>
                </div>
              ))
            )}

            <div className="border-t border-border-primary my-1" />

            {/* Add accounts. Google can always stack additional accounts. */}
            <UnstyledButton
              onClick={() => startOAuth("/api/auth/google-calendar")}
              className="flex items-center gap-2 text-text-secondary transition-colors hover:text-text-primary"
            >
              <IconPlus size={16} />
              <Text size="sm">Add Google account</Text>
            </UnstyledButton>

            {!hasMicrosoft && (
              <UnstyledButton
                onClick={() => startOAuth("/api/auth/microsoft-calendar")}
                className="flex items-center gap-2 text-text-secondary transition-colors hover:text-text-primary"
              >
                <IconPlus size={16} />
                <Text size="sm">Add Outlook</Text>
              </UnstyledButton>
            )}
          </Stack>
        </div>
      </Stack>
    </div>
  );
}
