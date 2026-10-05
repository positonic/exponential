"use client";

import { useState } from "react";
import { Button, Checkbox, Group, Modal, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconCalendar,
  IconClock,
  IconExternalLink,
  IconMapPin,
  IconTrash,
  IconUsers,
} from "@tabler/icons-react";
import { format, parseISO } from "date-fns";
import { api } from "~/trpc/react";
import { stripHtml } from "~/lib/utils";
import type { CalendarEventWithSource } from "~/server/services/GoogleCalendarService";

interface CalendarEventModalProps {
  event: CalendarEventWithSource | null;
  onClose: () => void;
  onDeleted?: (event: CalendarEventWithSource) => void;
}

const MAX_GUESTS_SHOWN = 4;

function providerLabel(provider: CalendarEventWithSource["provider"]): string {
  return provider === "microsoft" ? "Outlook" : "Google Calendar";
}

function formatEventWhen(event: CalendarEventWithSource): string {
  if (event.start.dateTime) {
    const start = parseISO(event.start.dateTime);
    const day = format(start, "EEE, MMM d");
    const end = event.end.dateTime ? parseISO(event.end.dateTime) : null;
    return end
      ? `${day} · ${format(start, "h:mm a")} – ${format(end, "h:mm a")}`
      : `${day} · ${format(start, "h:mm a")}`;
  }
  return event.start.date
    ? `${format(parseISO(event.start.date), "EEE, MMM d")} · All day`
    : "All day";
}

/** Why an event has no Delete button, in the user's terms. */
function readOnlyReason(event: CalendarEventWithSource): string {
  if (event.provider === "ics") {
    return "This event comes from a calendar feed, which is read-only. Delete it in the calendar that publishes the feed.";
  }
  if (event.provider === "meeting") {
    return "This is a scheduled meeting. Its organizer can cancel it from Schedule meeting.";
  }
  return "You have view-only access to this calendar, so this event can't be deleted here.";
}

/**
 * Details for one calendar event, with a link out to its provider and — for
 * events on a Google/Outlook calendar the user can edit — a confirmed delete.
 */
export function CalendarEventModal({ event, onClose, onDeleted }: CalendarEventModalProps) {
  const utils = api.useUtils();
  const [isConfirming, setIsConfirming] = useState(false);
  const [notifyGuests, setNotifyGuests] = useState(true);

  const deleteEvent = api.calendar.deleteEvent.useMutation({
    // Not awaited: the mutate-level onSuccess below (which closes the modal)
    // only runs once this returns, and a calendar refetch can take seconds.
    onSuccess: () => {
      void utils.calendar.getEventsMultiCalendar.invalidate();
      void utils.calendar.getTodayEvents.invalidate();
      void utils.calendar.getUpcomingEvents.invalidate();
    },
    onError: (error) => {
      notifications.show({ title: "Couldn't delete event", message: error.message, color: "red" });
    },
  });

  if (!event) return null;

  const close = () => {
    setIsConfirming(false);
    setNotifyGuests(true);
    onClose();
  };

  const provider = providerLabel(event.provider);
  const accountEmail = event.accountEmail?.toLowerCase();
  const guests = (event.attendees ?? []).filter((a) => a.email.toLowerCase() !== accountEmail);
  const description = stripHtml(event.description).trim();
  const { accountId } = event;
  const canDelete = !!event.canDelete && !!accountId;
  const reason = canDelete ? null : readOnlyReason(event);

  const handleDelete = () => {
    if (!accountId) return;
    deleteEvent.mutate(
      {
        eventId: event.id,
        calendarId: event.calendarId,
        accountId,
        notifyAttendees: notifyGuests,
      },
      {
        onSuccess: () => {
          onDeleted?.(event);
          notifications.show({
            title: "Event deleted",
            message: `“${event.summary}” was removed from ${provider}.`,
            color: "blue",
          });
          close();
        },
      },
    );
  };

  return (
    <Modal
      opened
      onClose={close}
      title={
        <Text fw={600} className="break-words">
          {event.summary}
        </Text>
      }
      centered
      size="md"
      // Closing mid-delete would drop the success handling below.
      closeOnClickOutside={!deleteEvent.isPending}
      closeOnEscape={!deleteEvent.isPending}
      withCloseButton={!deleteEvent.isPending}
    >
      <Stack gap="sm">
        <Group gap="xs" wrap="nowrap" align="flex-start">
          <IconClock size={16} className="mt-0.5 shrink-0 text-text-muted" />
          <Text size="sm">{formatEventWhen(event)}</Text>
        </Group>

        {(event.calendarName ?? event.accountEmail) && (
          <Group gap="xs" wrap="nowrap" align="flex-start">
            <IconCalendar size={16} className="mt-0.5 shrink-0 text-text-muted" />
            <Text size="sm" className="break-words">
              {[event.calendarName, event.accountEmail]
                .filter((part, i, parts) => part && parts.indexOf(part) === i)
                .join(" · ")}
            </Text>
          </Group>
        )}

        {event.location && (
          <Group gap="xs" wrap="nowrap" align="flex-start">
            <IconMapPin size={16} className="mt-0.5 shrink-0 text-text-muted" />
            <Text size="sm" className="break-words">
              {event.location}
            </Text>
          </Group>
        )}

        {guests.length > 0 && (
          <Group gap="xs" wrap="nowrap" align="flex-start">
            <IconUsers size={16} className="mt-0.5 shrink-0 text-text-muted" />
            <Text size="sm" className="break-words">
              {guests
                .slice(0, MAX_GUESTS_SHOWN)
                .map((g) => g.displayName ?? g.email)
                .join(", ")}
              {guests.length > MAX_GUESTS_SHOWN && ` +${guests.length - MAX_GUESTS_SHOWN} more`}
            </Text>
          </Group>
        )}

        {description && (
          <Text size="sm" c="dimmed" lineClamp={6} className="whitespace-pre-wrap break-words">
            {description}
          </Text>
        )}

        {isConfirming ? (
          <Stack gap="xs" className="border-t border-border-primary pt-3">
            <Text size="sm">
              Delete this event? It is removed from {provider} too, not just from Exponential. If
              it repeats, only this occurrence is deleted.
            </Text>
            {guests.length > 0 &&
              (event.provider === "microsoft" ? (
                <Text size="sm" c="dimmed">
                  If you organized it, Outlook tells the guests it was cancelled.
                </Text>
              ) : (
                <Checkbox
                  size="sm"
                  label="Email guests that it was cancelled"
                  checked={notifyGuests}
                  onChange={(e) => setNotifyGuests(e.currentTarget.checked)}
                  disabled={deleteEvent.isPending}
                />
              ))}
            <Group justify="flex-end" gap="xs">
              <Button
                variant="default"
                size="xs"
                onClick={() => setIsConfirming(false)}
                disabled={deleteEvent.isPending}
              >
                Keep event
              </Button>
              <Button color="red" size="xs" loading={deleteEvent.isPending} onClick={handleDelete}>
                Delete event
              </Button>
            </Group>
          </Stack>
        ) : (
          <>
            {reason && (
              <Text size="xs" c="dimmed">
                {reason}
              </Text>
            )}
            {(!!event.htmlLink || canDelete) && (
              <Group
                justify="space-between"
                gap="xs"
                className="border-t border-border-primary pt-3"
              >
                {event.htmlLink ? (
                  <Button
                    component="a"
                    href={event.htmlLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="subtle"
                    size="xs"
                    leftSection={<IconExternalLink size={14} />}
                  >
                    Open in {provider}
                  </Button>
                ) : (
                  <span />
                )}
                {canDelete && (
                  <Button
                    color="red"
                    variant="light"
                    size="xs"
                    leftSection={<IconTrash size={14} />}
                    onClick={() => setIsConfirming(true)}
                  >
                    Delete
                  </Button>
                )}
              </Group>
            )}
          </>
        )}
      </Stack>
    </Modal>
  );
}
