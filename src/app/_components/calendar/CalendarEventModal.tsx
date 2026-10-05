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
import { format, isAfter, isSameDay, parseISO, subDays } from "date-fns";
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

const DAY_FORMAT = "EEE, MMM d";
const TIME_FORMAT = "h:mm a";

/** The event's whole span — this is what the user confirms a delete against. */
function formatEventWhen(event: CalendarEventWithSource): string {
  if (event.start.dateTime) {
    const start = parseISO(event.start.dateTime);
    const end = event.end.dateTime ? parseISO(event.end.dateTime) : null;
    const from = `${format(start, DAY_FORMAT)} · ${format(start, TIME_FORMAT)}`;
    if (!end) return from;
    // An event that runs past midnight names the day it ends on.
    return isSameDay(start, end)
      ? `${from} – ${format(end, TIME_FORMAT)}`
      : `${from} – ${format(end, DAY_FORMAT)} · ${format(end, TIME_FORMAT)}`;
  }
  if (!event.start.date) return "All day";
  const firstDay = parseISO(event.start.date);
  // An all-day event's end date is exclusive: a one-day event ends "tomorrow".
  const lastDay = event.end.date ? subDays(parseISO(event.end.date), 1) : firstDay;
  return isAfter(lastDay, firstDay)
    ? `${format(firstDay, DAY_FORMAT)} – ${format(lastDay, DAY_FORMAT)} · All day`
    : `${format(firstDay, DAY_FORMAT)} · All day`;
}

/** Why an event has no Delete button, in the user's terms — when we know why. */
function readOnlyReason(event: CalendarEventWithSource): string | null {
  if (event.provider === "ics") {
    return "This event comes from a calendar feed, which is read-only. Delete it in the calendar that publishes the feed.";
  }
  if (event.provider === "meeting") {
    return "This is a scheduled meeting. Its organizer can cancel it from Schedule meeting.";
  }
  // Only an explicit false is a known read-only calendar; undefined is a
  // producer that never computed it, and claiming view-only there would be a guess.
  return event.canDelete === false
    ? "You have view-only access to this calendar, so this event can't be deleted here."
    : null;
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
      // Every event query a mounted surface reads: this page, the Today rail,
      // and getEvents behind the drawer, project card and daily-plan importer.
      void utils.calendar.getEventsMultiCalendar.invalidate();
      void utils.calendar.getTodayEvents.invalidate();
      void utils.calendar.getEvents.invalidate();
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
        // No guests listed means no checkbox was shown, and nobody gets an
        // email the user wasn't offered a say in.
        notifyAttendees: guests.length > 0 && notifyGuests,
      },
      {
        onSuccess: ({ alreadyGone }) => {
          // Either way it should stop rendering here; only the claim differs.
          onDeleted?.(event);
          notifications.show(
            alreadyGone
              ? {
                  title: "Event was already gone",
                  message: `“${event.summary}” was no longer on that calendar in ${provider} — it may have been deleted or moved.`,
                  color: "yellow",
                }
              : {
                  title: "Event deleted",
                  message: `“${event.summary}” was removed from ${provider}.`,
                  color: "blue",
                },
          );
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
            {guests.length > 0 && (
              <>
                {/* We don't know who organized it, so say what each case does. */}
                <Text size="sm" c="dimmed">
                  If you organized it, this cancels it for everyone. If you were invited, it only
                  comes off your calendar.
                  {event.provider === "microsoft" &&
                    " Outlook emails the guests itself when the organizer deletes."}
                </Text>
                {event.provider !== "microsoft" && (
                  <Checkbox
                    size="sm"
                    label="Email the guests about it"
                    checked={notifyGuests}
                    onChange={(e) => setNotifyGuests(e.currentTarget.checked)}
                    disabled={deleteEvent.isPending}
                  />
                )}
              </>
            )}
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
