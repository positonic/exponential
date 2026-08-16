"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Checkbox,
  Group,
  Modal,
  MultiSelect,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import {
  IconCalendarPlus,
  IconCalendarX,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { modals } from "@mantine/modals";
import { api } from "~/trpc/react";
import { ActionIcon, Tooltip } from "@mantine/core";
import { useSession } from "next-auth/react";
import { MarkdownInput } from "~/app/_components/shared/MarkdownInput";
import { AvailabilityGrid, type GridSlot } from "./AvailabilityGrid";

/**
 * "Schedule meeting" (V3 workspace scheduling): pick a workspace, attendees
 * (members only — availability-unknown ones are labelled but invitable),
 * duration → pick a time from either a day-grouped suggestion list or the
 * LettuceMeet-style availability grid, over a pageable rolling week.
 * Confirming creates the Scheduled meeting and emails every attendee a
 * METHOD:REQUEST invite their mail client renders natively.
 *
 * Suggestions never leave the scheduling window (07:00–20:00 on each
 * attendee's wall clock) — the outside-hours checkbox relaxes work hours to
 * that window, not to 24/7.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** Server caps ranges at 30 days — 3 weeks ahead keeps us inside it. */
const MAX_WEEK_OFFSET = 3;
export function ScheduleMeetingModal({
  opened,
  onClose,
  defaultWorkspaceId,
}: {
  opened: boolean;
  onClose: () => void;
  /** Preselects the workspace — the workspace-page entry point sets this. */
  defaultWorkspaceId?: string;
}) {
  const utils = api.useUtils();

  const { data: workspaces } = api.workspace.list.useQuery(undefined, {
    enabled: opened,
  });
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  useEffect(() => {
    if (opened && defaultWorkspaceId) setWorkspaceId(defaultWorkspaceId);
  }, [opened, defaultWorkspaceId]);
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<GridSlot | null>(null);
  const [searching, setSearching] = useState(false);
  const [includeOutsideWorkHours, setIncludeOutsideWorkHours] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [weekOffset, setWeekOffset] = useState(0);

  const { data: projects } = api.project.getAll.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: opened && !!workspaceId },
  );

  const { data: members } = api.workspaceScheduling.listSchedulableMembers.useQuery(
    { workspaceId: workspaceId! },
    { enabled: opened && !!workspaceId },
  );

  const { data: session } = useSession();
  const { data: upcomingMeetings } = api.workspaceScheduling.listMeetings.useQuery(
    { workspaceId: workspaceId!, from: new Date() },
    { enabled: opened && !!workspaceId },
  );

  const cancelMeeting = api.workspaceScheduling.cancelMeeting.useMutation({
    onSuccess: async (result) => {
      await Promise.all([
        utils.workspaceScheduling.listMeetings.invalidate(),
        utils.calendar.getEventsMultiCalendar.invalidate(),
      ]);
      notifications.show({
        title: "Meeting cancelled",
        message: `${result.invitesSent} cancellation${result.invitesSent === 1 ? "" : "s"} sent to attendees' calendars.`,
        color: "blue",
      });
    },
    onError: (error) => {
      notifications.show({ title: "Couldn't cancel", message: error.message, color: "red" });
    },
  });

  const confirmCancel = (meeting: { id: string; title: string }) => {
    if (!workspaceId) return;
    modals.openConfirmModal({
      title: "Cancel meeting?",
      children: (
        <Text size="sm">
          Attendees will receive a cancellation that removes “{meeting.title}”
          from their calendars. Rescheduling means booking a new meeting.
        </Text>
      ),
      labels: { confirm: "Cancel meeting", cancel: "Keep meeting" },
      confirmProps: { color: "red" },
      onConfirm: () => cancelMeeting.mutate({ workspaceId, meetingId: meeting.id }),
    });
  };

  // Rolling week, pageable a week at a time with the ‹ › controls.
  const range = useMemo(() => {
    const base = Date.now() + weekOffset * WEEK_MS;
    return { rangeStart: new Date(base), rangeEnd: new Date(base + WEEK_MS) };
    // Recompute per open so a long-lived tab doesn't search the past.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, weekOffset]);

  const slotsQuery = api.workspaceScheduling.suggestSlots.useQuery(
    {
      workspaceId: workspaceId!,
      attendeeUserIds: attendeeIds,
      durationMinutes: Number(durationMinutes),
      includeOutsideWorkHours,
      ...range,
    },
    {
      enabled: searching && viewMode === "list" && !!workspaceId && attendeeIds.length > 0,
      retry: false,
    },
  );

  const gridQuery = api.workspaceScheduling.availabilityGrid.useQuery(
    {
      workspaceId: workspaceId!,
      attendeeUserIds: attendeeIds,
      includeOutsideWorkHours,
      ...range,
    },
    {
      enabled: opened && viewMode === "grid" && !!workspaceId && attendeeIds.length > 0,
      retry: false,
    },
  );

  const memberNameById = useMemo(
    () =>
      new Map((members ?? []).map((m) => [m.id, m.name ?? m.email ?? "Unknown member"])),
    [members],
  );

  /** Grid selection: partial-availability slots need an explicit override. */
  const selectSlotWithWarning = (slot: GridSlot, busyUserIds: string[]) => {
    if (busyUserIds.length === 0) {
      setSelectedSlot(slot);
      return;
    }
    const names = busyUserIds.map((id) => memberNameById.get(id) ?? "Unknown member");
    modals.openConfirmModal({
      title: "Book over a conflict?",
      children: (
        <Text size="sm">
          This time excludes {names.join(", ")} — they&apos;re busy then. Pick it
          anyway and they&apos;ll still be invited.
        </Text>
      ),
      labels: { confirm: "Pick this time", cancel: "Choose another" },
      onConfirm: () => setSelectedSlot(slot),
    });
  };

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
    setLocation("");
    setDescription("");
    setProjectId(null);
    setSelectedSlot(null);
    setSearching(false);
    setViewMode("list");
    setWeekOffset(0);
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

  const timeOnlyLabel = (slot: { startsAt: Date; endsAt: Date }) =>
    `${slot.startsAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} – ${slot.endsAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;

  // Day-grouped suggestions: the per-day server cap spreads them across the
  // week, and the headings make the week scannable.
  const slotsByDay = useMemo(() => {
    const groups = new Map<string, GridSlot[]>();
    for (const slot of slotsQuery.data?.slots ?? []) {
      const key = slot.startsAt.toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "short",
      });
      const existing = groups.get(key);
      if (existing) existing.push(slot);
      else groups.set(key, [slot]);
    }
    return [...groups.entries()];
  }, [slotsQuery.data]);

  const rangeLabel = `${range.rangeStart.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  })} – ${range.rangeEnd.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Schedule meeting"
      centered
      size={viewMode === "grid" ? "90%" : "lg"}
    >
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

        {workspaceId && (upcomingMeetings?.length ?? 0) > 0 && (
          <Stack gap={4}>
            <Text size="sm" fw={600}>
              Upcoming meetings
            </Text>
            {upcomingMeetings!.filter((m) => m.status !== "cancelled").map((meeting) => (
              <Group key={meeting.id} gap="xs" wrap="nowrap" className="rounded border border-border-primary px-3 py-2">
                <div className="min-w-0 flex-1">
                  <Text size="sm" className="truncate">
                    {meeting.title}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {meeting.startsAt.toLocaleString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {" · "}
                    {meeting.attendees.length} attendee{meeting.attendees.length === 1 ? "" : "s"}
                  </Text>
                </div>
                {meeting.organizer.id === session?.user?.id && (
                  <Tooltip label="Cancel meeting" withinPortal>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="sm"
                      aria-label={`Cancel ${meeting.title}`}
                      loading={cancelMeeting.isPending}
                      onClick={() => confirmCancel(meeting)}
                    >
                      <IconCalendarX size={16} />
                    </ActionIcon>
                  </Tooltip>
                )}
              </Group>
            ))}
          </Stack>
        )}

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
            Find times
          </Button>
        </Group>

        <Checkbox
          size="xs"
          label="Include times outside working hours (still 07:00–20:00 in each attendee's local time)"
          checked={includeOutsideWorkHours}
          onChange={(e) => {
            setIncludeOutsideWorkHours(e.currentTarget.checked);
            setSelectedSlot(null);
          }}
        />

        {workspaceId && attendeeIds.length > 0 && (
          <Group justify="space-between" wrap="nowrap">
            <SegmentedControl
              size="xs"
              value={viewMode}
              onChange={(value) => {
                setViewMode(value as "list" | "grid");
                setSelectedSlot(null);
              }}
              data={[
                { value: "list", label: "List" },
                { value: "grid", label: "Grid" },
              ]}
            />
            <Group gap={4} wrap="nowrap">
              <ActionIcon
                variant="subtle"
                size="sm"
                disabled={weekOffset === 0}
                aria-label="Previous week"
                onClick={() => {
                  setWeekOffset((offset) => offset - 1);
                  setSelectedSlot(null);
                }}
              >
                <IconChevronLeft size={16} />
              </ActionIcon>
              <Text size="xs" c="dimmed" className="whitespace-nowrap">
                {rangeLabel}
              </Text>
              <ActionIcon
                variant="subtle"
                size="sm"
                disabled={weekOffset >= MAX_WEEK_OFFSET}
                aria-label="Next week"
                onClick={() => {
                  setWeekOffset((offset) => offset + 1);
                  setSelectedSlot(null);
                }}
              >
                <IconChevronRight size={16} />
              </ActionIcon>
            </Group>
          </Group>
        )}

        {unknownCount > 0 && (
          <Text size="xs" c="dimmed">
            {unknownCount} attendee{unknownCount === 1 ? " has" : "s have"} no calendar
            connected — they can be invited, but their availability doesn&apos;t constrain
            the suggestions.
          </Text>
        )}

        {viewMode === "list" && searching && slotsQuery.data && (
          <Stack gap={4}>
            <Text size="sm" fw={600}>
              Suggested times
            </Text>
            <Text size="xs" c="dimmed">
              Availability can be up to ~15 minutes stale — a very recent booking may
              not show yet.
            </Text>
            {slotsByDay.length === 0 ? (
              <Text size="sm" c="dimmed">
                No free slots this week — page to next week, try a shorter duration,
                or fewer attendees.
              </Text>
            ) : (
              slotsByDay.map(([day, slots]) => (
                <div key={day}>
                  <Text size="xs" fw={600} c="dimmed" mt={4}>
                    {day}
                  </Text>
                  <Group gap={6} mt={4}>
                    {slots.map((slot) => (
                      <UnstyledButton
                        key={slot.startsAt.toISOString()}
                        onClick={() => setSelectedSlot(slot)}
                        className={`rounded border px-3 py-1.5 text-sm transition-colors ${
                          selectedSlot?.startsAt.getTime() === slot.startsAt.getTime()
                            ? "border-border-focus bg-surface-hover"
                            : "border-border-primary hover:bg-surface-hover"
                        }`}
                      >
                        {timeOnlyLabel(slot)}
                      </UnstyledButton>
                    ))}
                  </Group>
                </div>
              ))
            )}
          </Stack>
        )}

        {viewMode === "grid" && (
          <Stack gap={4}>
            <Text size="xs" c="dimmed">
              Click a cell to propose a {durationMinutes}-minute meeting starting
              there. Availability can be up to ~15 minutes stale.
            </Text>
            {gridQuery.isLoading ? (
              <Text size="sm" c="dimmed">
                Loading availability…
              </Text>
            ) : gridQuery.error ? (
              <Text size="sm" c="dimmed">
                Couldn&apos;t load availability: {gridQuery.error.message}
              </Text>
            ) : gridQuery.data ? (
              <AvailabilityGrid
                cellStartsAt={gridQuery.data.cellStartsAt}
                cellMinutes={gridQuery.data.cellMinutes}
                attendees={gridQuery.data.attendees}
                availabilityUnknownUserIds={gridQuery.data.availabilityUnknownUserIds}
                memberNameById={memberNameById}
                durationMinutes={Number(durationMinutes)}
                selectedSlot={selectedSlot}
                onSelectSlot={selectSlotWithWarning}
              />
            ) : null}
          </Stack>
        )}

        {selectedSlot && (
          <>
            <Text size="sm" fw={500}>
              Selected: {slotLabel(selectedSlot)}
            </Text>
            <TextInput
              label="Title"
              placeholder="What's the meeting about?"
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
              data-autofocus
            />
            <TextInput
              label="Location / meeting link"
              placeholder="Room, address, or a video-call link"
              value={location}
              onChange={(e) => setLocation(e.currentTarget.value)}
            />
            <Select
              label="Project"
              placeholder="Link to a project (optional)"
              data={(projects ?? []).map((p) => ({ value: p.id, label: p.name }))}
              value={projectId}
              onChange={setProjectId}
              searchable
              clearable
            />
            <div>
              <Text size="sm" fw={500} mb={4}>
                Description
              </Text>
              <MarkdownInput
                value={description}
                onChange={setDescription}
                placeholder="Agenda, links, context… (Markdown)"
                minRows={3}
              />
            </div>
          </>
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
                location: location.trim() || undefined,
                description: description.trim() || undefined,
                projectId: projectId ?? undefined,
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
