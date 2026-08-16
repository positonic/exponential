"use client";

import { useMemo, useState } from "react";
import {
  Button,
  Group,
  Modal,
  MultiSelect,
  Select,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { IconCalendarPlus } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";

/**
 * "Schedule meeting" (V3 workspace scheduling), first cut: pick a workspace,
 * attendees (members only — availability-unknown ones are labelled but
 * invitable), duration → suggested slots over the next 7 days → confirm.
 * Confirming creates the Meeting and emails every attendee a METHOD:REQUEST
 * invite their mail client renders natively.
 */
export function ScheduleMeetingModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const utils = api.useUtils();

  const { data: workspaces } = api.workspace.list.useQuery(undefined, {
    enabled: opened,
  });
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [title, setTitle] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<{ startsAt: Date; endsAt: Date } | null>(null);
  const [searching, setSearching] = useState(false);

  const { data: members } = api.workspaceScheduling.listSchedulableMembers.useQuery(
    { workspaceId: workspaceId! },
    { enabled: opened && !!workspaceId },
  );

  // Rolling week starting "now" — good enough for the first cut.
  const range = useMemo(
    () => ({
      rangeStart: new Date(),
      rangeEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }),
    // Recompute per open so a long-lived tab doesn't search the past.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opened],
  );

  const slotsQuery = api.workspaceScheduling.suggestSlots.useQuery(
    {
      workspaceId: workspaceId!,
      attendeeUserIds: attendeeIds,
      durationMinutes: Number(durationMinutes),
      ...range,
    },
    { enabled: searching && !!workspaceId && attendeeIds.length > 0, retry: false },
  );

  const createMeeting = api.workspaceScheduling.createMeeting.useMutation({
    onSuccess: async (meeting) => {
      await utils.calendar.getEventsMultiCalendar.invalidate();
      notifications.show({
        title: "Meeting scheduled",
        message: `${meeting.title} — ${meeting.invitesSent} invite${meeting.invitesSent === 1 ? "" : "s"} sent.`,
        color: "blue",
      });
      handleClose();
    },
    onError: (error) => {
      notifications.show({ title: "Couldn't schedule", message: error.message, color: "red" });
    },
  });

  const handleClose = () => {
    setAttendeeIds([]);
    setTitle("");
    setSelectedSlot(null);
    setSearching(false);
    onClose();
  };

  const memberOptions = (members ?? []).map((member) => ({
    value: member.id,
    label:
      (member.name ?? member.email ?? "Unknown") +
      (member.availabilityKnown ? "" : " (no availability data)"),
  }));

  const unknownCount = (members ?? []).filter(
    (m) => attendeeIds.includes(m.id) && !m.availabilityKnown,
  ).length;

  const slotLabel = (slot: { startsAt: Date; endsAt: Date }) =>
    `${slot.startsAt.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })} – ${slot.endsAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;

  return (
    <Modal opened={opened} onClose={handleClose} title="Schedule meeting" centered size="lg">
      <Stack gap="sm">
        <Select
          label="Workspace"
          data={(workspaces ?? []).map((w) => ({ value: w.id, label: w.name }))}
          value={workspaceId}
          onChange={(value) => {
            setWorkspaceId(value);
            setAttendeeIds([]);
            setSearching(false);
            setSelectedSlot(null);
          }}
          searchable
          placeholder="Pick a workspace"
        />

        <MultiSelect
          label="Attendees"
          data={memberOptions}
          value={attendeeIds}
          onChange={(value) => {
            setAttendeeIds(value);
            setSearching(false);
            setSelectedSlot(null);
          }}
          searchable
          disabled={!workspaceId}
          placeholder={workspaceId ? "Pick workspace members" : "Pick a workspace first"}
        />

        <Group grow>
          <Select
            label="Duration"
            data={[
              { value: "30", label: "30 minutes" },
              { value: "60", label: "1 hour" },
            ]}
            value={durationMinutes}
            onChange={(value) => value && setDurationMinutes(value)}
          />
          <Button
            mt="xl"
            variant="light"
            onClick={() => setSearching(true)}
            disabled={!workspaceId || attendeeIds.length === 0}
            loading={searching && slotsQuery.isLoading}
          >
            Find times (next 7 days)
          </Button>
        </Group>

        {unknownCount > 0 && (
          <Text size="xs" c="dimmed">
            {unknownCount} attendee{unknownCount === 1 ? " has" : "s have"} no calendar
            connected — they can be invited, but their availability doesn&apos;t constrain
            the suggestions.
          </Text>
        )}

        {searching && slotsQuery.data && (
          <Stack gap={4}>
            <Text size="sm" fw={600}>
              Suggested times
            </Text>
            <Text size="xs" c="dimmed">
              Availability can be up to ~15 minutes stale — a very recent booking may
              not show yet.
            </Text>
            {slotsQuery.data.slots.length === 0 ? (
              <Text size="sm" c="dimmed">
                No free slots in the next 7 days — try a shorter duration or fewer
                attendees.
              </Text>
            ) : (
              slotsQuery.data.slots.slice(0, 8).map((slot) => (
                <UnstyledButton
                  key={slot.startsAt.toISOString()}
                  onClick={() => setSelectedSlot(slot)}
                  className={`rounded border px-3 py-2 text-sm transition-colors ${
                    selectedSlot?.startsAt.getTime() === slot.startsAt.getTime()
                      ? "border-border-focus bg-surface-hover"
                      : "border-border-primary hover:bg-surface-hover"
                  }`}
                >
                  {slotLabel(slot)}
                </UnstyledButton>
              ))
            )}
          </Stack>
        )}

        {selectedSlot && (
          <TextInput
            label="Title"
            placeholder="What's the meeting about?"
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            data-autofocus
          />
        )}

        <Group justify="flex-end" mt="xs">
          <Button variant="subtle" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            leftSection={<IconCalendarPlus size={16} />}
            disabled={!workspaceId || !selectedSlot || title.trim().length === 0}
            loading={createMeeting.isPending}
            onClick={() =>
              workspaceId &&
              selectedSlot &&
              createMeeting.mutate({
                workspaceId,
                title: title.trim(),
                startsAt: selectedSlot.startsAt,
                endsAt: selectedSlot.endsAt,
                attendeeUserIds: attendeeIds,
              })
            }
          >
            Schedule & send invites
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
