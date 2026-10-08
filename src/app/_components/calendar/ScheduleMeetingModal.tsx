"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Checkbox,
  Group,
  Input,
  Modal,
  Pill,
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
  IconUserPlus,
  IconUsers,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { modals } from "@mantine/modals";
import { api } from "~/trpc/react";
import { ActionIcon, Tooltip } from "@mantine/core";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { MarkdownInput } from "~/app/_components/shared/MarkdownInput";
import { AvailabilityGrid, type GridSlot } from "./AvailabilityGrid";
import {
  ParticipantPicker,
  type PendingParticipant,
} from "~/app/_components/meeting/ParticipantPicker";
import { OneOffAgendaFields, presetSectionTypes } from "./OneOffAgendaFields";
import {
  DEFAULT_ONE_OFF_PRESET,
  type OneOffSectionType,
} from "~/server/services/ceremonies/oneOffPresets";
import {
  SCHEDULING_WINDOW_START_MINUTES,
  SCHEDULING_WINDOW_END_MINUTES,
} from "~/server/services/calendar/slotEngine";

/**
 * "Schedule meeting" (V3 workspace scheduling): pick a workspace, attendees
 * (members, CRM contacts, or new people by name and email — only members
 * have availability, so only they constrain the suggestions; members with no
 * calendar are labelled but invitable), duration → pick a time from either a day-grouped suggestion list or the
 * LettuceMeet-style availability grid, over a pageable rolling week.
 * Confirming creates the Scheduled meeting and emails every attendee a
 * METHOD:REQUEST invite their mail client renders natively.
 *
 * Linked to a project, the meeting gets an agenda (a one-off, ADR-0059
 * amendment 2026-10-07): the description gives way to a purpose, a preset and
 * a previewed section checklist, and booking lands on the meeting's page.
 *
 * Suggestions never leave the scheduling window (07:00–20:00 on each
 * attendee's wall clock) — the outside-hours checkbox relaxes work hours to
 * that window, not to 24/7.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** Server caps ranges at 30 days — 3 weeks ahead keeps us inside it. */
const MAX_WEEK_OFFSET = 3;

const minutesAsHhMm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
/** e.g. "07:00–20:00" — derived from the engine's constants, never retyped. */
const WINDOW_LABEL = `${minutesAsHhMm(SCHEDULING_WINDOW_START_MINUTES)}–${minutesAsHhMm(SCHEDULING_WINDOW_END_MINUTES)}`;
export interface ScheduledMeetingResult {
  id: string;
  title: string;
  invitesSent: number;
  /** Set when the meeting was booked with a project: the one-off's ids. */
  ceremonyId: string | null;
  occurrenceId: string | null;
}

export function ScheduleMeetingModal({
  opened,
  onClose,
  defaultWorkspaceId,
  projectId: lockedProjectId,
  defaultAttendees,
  onCreated,
}: {
  opened: boolean;
  onClose: () => void;
  /** Preselects the workspace — the workspace-page entry point sets this. */
  defaultWorkspaceId?: string;
  /**
   * Opened from a project: the meeting is linked to it (and so becomes a
   * one-off with an agenda), and neither the project nor the workspace can
   * be changed. Pass the project's workspace as `defaultWorkspaceId`.
   */
  projectId?: string;
  /** Attendees preselected on open, e.g. the project's DRI. */
  defaultAttendees?: PendingParticipant[];
  /** Called after a successful booking, before the modal closes. */
  onCreated?: (meeting: ScheduledMeetingResult) => void;
}) {
  const utils = api.useUtils();
  const router = useRouter();

  const { data: workspaces } = api.workspace.list.useQuery(undefined, {
    enabled: opened,
  });
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  useEffect(() => {
    if (opened && defaultWorkspaceId) setWorkspaceId(defaultWorkspaceId);
  }, [opened, defaultWorkspaceId]);
  const [attendees, setAttendees] = useState<PendingParticipant[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => {
    if (opened && defaultAttendees?.length) setAttendees(defaultAttendees);
    // Seed once per open; later edits to the default list don't clobber picks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [purpose, setPurpose] = useState("");
  const [presetKey, setPresetKey] = useState(DEFAULT_ONE_OFF_PRESET);
  const [sectionTypes, setSectionTypes] = useState<OneOffSectionType[]>(() =>
    presetSectionTypes(DEFAULT_ONE_OFF_PRESET),
  );
  const [pickedProjectId, setProjectId] = useState<string | null>(null);
  const projectId = lockedProjectId ?? pickedProjectId;
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
  const organizerId = session?.user?.id;

  // Only members have availability. The organizer always constrains the
  // suggestions (the server adds them), so an externals-only meeting still
  // searches against the organizer's calendar.
  const attendeeIds = useMemo(() => {
    const ids = attendees.flatMap((a) => ("userId" in a.payload ? [a.payload.userId] : []));
    return ids.length > 0 ? ids : organizerId ? [organizerId] : [];
  }, [attendees, organizerId]);

  const existingAttendeeKeys = useMemo(() => {
    const keys = new Set<string>();
    // The organizer is always invited; offering them again would only confuse.
    if (organizerId) keys.add(`user:${organizerId}`);
    if (session?.user?.email) keys.add(`email:${session.user.email.toLowerCase()}`);
    for (const a of attendees) {
      keys.add(a.key);
      if (a.email) keys.add(`email:${a.email.toLowerCase()}`);
    }
    return keys;
  }, [attendees, organizerId, session?.user?.email]);

  const resetSearch = () => {
    setSearching(false);
    setSelectedSlot(null);
  };
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

  // Rolling week, pageable a week at a time with the ‹ › controls. The base
  // is quantized to the half hour so paging back to an already-fetched week
  // reuses the react-query cache instead of minting a fresh key.
  const range = useMemo(() => {
    const halfHourMs = 30 * 60 * 1000;
    const base =
      Math.floor(Date.now() / halfHourMs) * halfHourMs + weekOffset * WEEK_MS;
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
      enabled: searching && viewMode === "list" && !!workspaceId && attendees.length > 0 && attendeeIds.length > 0,
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
      enabled: opened && viewMode === "grid" && !!workspaceId && attendees.length > 0 && attendeeIds.length > 0,
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
      onCreated?.(meeting);
      // A meeting with a project has an agenda: land on it.
      const slug = workspaces?.find((w) => w.id === workspaceId)?.slug;
      const occurrenceHref =
        slug && meeting.ceremonyId && meeting.occurrenceId
          ? `/w/${slug}/ceremonies/${meeting.ceremonyId}/${meeting.occurrenceId}`
          : null;
      handleClose();
      if (occurrenceHref) router.push(occurrenceHref);
    },
    onError: (error) => {
      notifications.show({ title: "Couldn't schedule", message: error.message, color: "red" });
    },
  });

  const handleClose = () => {
    setAttendees([]);
    setPickerOpen(false);
    setTitle("");
    setLocation("");
    setDescription("");
    setPurpose("");
    setPresetKey(DEFAULT_ONE_OFF_PRESET);
    setSectionTypes(presetSectionTypes(DEFAULT_ONE_OFF_PRESET));
    setProjectId(null);
    setSelectedSlot(null);
    setSearching(false);
    setViewMode("list");
    setWeekOffset(0);
    onClose();
  };

  const availabilityUnknownIds = useMemo(
    () => new Set((members ?? []).filter((m) => !m.availabilityKnown).map((m) => m.id)),
    [members],
  );

  const unknownCount = attendees.filter(
    (a) => "userId" in a.payload && availabilityUnknownIds.has(a.payload.userId),
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
    <>
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Schedule meeting"
      // Escape in the stacked attendee picker must close only the picker,
      // not this modal and the draft with it.
      closeOnEscape={!pickerOpen}
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
            setAttendees([]);
            resetSearch();
          }}
          searchable
          disabled={!!lockedProjectId}
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

        <Input.Wrapper
          label="Attendees"
          description="Teammates, CRM contacts, or new people by name and email. Only teammates' calendars shape the suggested times."
        >
          <Stack gap="xs" mt={4}>
            {attendees.length > 0 && (
              <Pill.Group>
                {attendees.map((a) => (
                  <Pill
                    key={a.key}
                    withRemoveButton
                    onRemove={() => {
                      setAttendees((prev) => prev.filter((p) => p.key !== a.key));
                      resetSearch();
                    }}
                    title={
                      a.kind === "member"
                        ? `${a.email} · team member${"userId" in a.payload && availabilityUnknownIds.has(a.payload.userId) ? " · no availability data" : ""}`
                        : `${a.email} · invited by email`
                    }
                  >
                    <span className="inline-flex items-center gap-1">
                      {a.kind === "member" && <IconUsers size={11} />}
                      {a.name}
                    </span>
                  </Pill>
                ))}
              </Pill.Group>
            )}
            <Button
              variant="light"
              size="xs"
              leftSection={<IconUserPlus size={14} />}
              onClick={() => setPickerOpen(true)}
              disabled={!workspaceId}
              style={{ alignSelf: "flex-start" }}
            >
              Add attendee
            </Button>
            {!workspaceId && (
              <Text size="xs" c="dimmed">
                Pick a workspace first.
              </Text>
            )}
          </Stack>
        </Input.Wrapper>

        <Group grow>
          <Select
            label="Duration"
            data={[
              { value: "30", label: "30 minutes" },
              { value: "60", label: "1 hour" },
            ]}
            value={durationMinutes}
            onChange={(value) => {
              if (!value) return;
              setDurationMinutes(value);
              // The picked slot's end was computed with the old duration —
              // keeping it would book a meeting of the wrong length.
              setSelectedSlot(null);
            }}
          />
          <Button
            mt="xl"
            variant="light"
            onClick={() => setSearching(true)}
            disabled={!workspaceId || attendees.length === 0}
            loading={searching && slotsQuery.isLoading}
          >
            Find times
          </Button>
        </Group>

        <Checkbox
          size="xs"
          label={`Include times outside working hours (still ${WINDOW_LABEL} in each attendee's local time)`}
          checked={includeOutsideWorkHours}
          onChange={(e) => {
            setIncludeOutsideWorkHours(e.currentTarget.checked);
            setSelectedSlot(null);
          }}
        />

        {workspaceId && attendees.length > 0 && (
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

        {viewMode === "list" && searching && slotsQuery.error && (
          <Text size="sm" c="dimmed">
            Couldn&apos;t find times: {slotsQuery.error.message}
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
              clearable={!lockedProjectId}
              disabled={!!lockedProjectId}
            />
            {projectId && workspaceId ? (
              <OneOffAgendaFields
                workspaceId={workspaceId}
                projectId={projectId}
                scheduledStart={selectedSlot.startsAt}
                durationMinutes={Number(durationMinutes)}
                purpose={purpose}
                onPurposeChange={setPurpose}
                presetKey={presetKey}
                onPresetChange={setPresetKey}
                sectionTypes={sectionTypes}
                onSectionTypesChange={setSectionTypes}
              />
            ) : (
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
            )}
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
                // With a project, the purpose and agenda stand in for a description.
                description: projectId ? undefined : description.trim() || undefined,
                ...(projectId
                  ? {
                      purpose: purpose.trim() || undefined,
                      purposePreset: presetKey,
                      agendaSectionTypes: sectionTypes,
                    }
                  : {}),
                projectId: projectId ?? undefined,
                startsAt: selectedSlot.startsAt,
                endsAt: selectedSlot.endsAt,
                attendees: attendees.map((a) => a.payload),
              })
            }
          >
            Schedule & send invites
          </Button>
        </Group>
      </Stack>
    </Modal>

    <ParticipantPicker
      opened={pickerOpen}
      onClose={() => setPickerOpen(false)}
      workspaceId={workspaceId}
      existing={existingAttendeeKeys}
      noun="attendee"
      onAdd={(person) => {
        setAttendees((prev) => (prev.some((p) => p.key === person.key) ? prev : [...prev, person]));
        resetSearch();
      }}
    />
    </>
  );
}
