"use client";

import { useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { format, isSameDay } from "date-fns";

import { api } from "~/trpc/react";
import { DateTimeField } from "~/app/_components/DateTimeField";

/** The piece being edited: an existing entry's id, or "new" for an added one. */
type EditingId = string | null;

// Local rather than TimeDayView's copy: importing that module would pull
// recharts into every page that renders EditActionModal.
function formatMins(totalMins: number): string {
  if (totalMins <= 0) return "0m";
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
}

/** A fresh piece defaults to the half hour that just ended. */
function defaultNewRange(): [Date, Date] {
  const end = new Date();
  end.setSeconds(0, 0);
  return [new Date(end.getTime() - 30 * 60_000), end];
}

interface ActionTimeEntriesProps {
  actionId: string;
  /** Called after any piece is added, edited or deleted. */
  onChange?: () => void;
}

/**
 * The action editor's Time section: every piece of the caller's time logged
 * against one Action, each editable in place (start / end), deletable, plus
 * "Add time" for a piece that was never tracked. Saves are per piece and
 * immediate — they don't wait on the action form's "Save changes", which
 * edits the Action, not its time. Editing a proposed piece confirms it
 * (ADR-0061), as it does in TimeEntryModal.
 */
export function ActionTimeEntries({ actionId, onChange }: ActionTimeEntriesProps) {
  const utils = api.useUtils();
  const { data: entries = [], isLoading } = api.timeEntry.listByAction.useQuery({ actionId });

  const [editingId, setEditingId] = useState<EditingId>(null);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [endedAt, setEndedAt] = useState<Date | null>(null);

  const refresh = async () => {
    onChange?.();
    await Promise.all([
      utils.timeEntry.listByAction.invalidate({ actionId }),
      utils.timeEntry.listByDateRange.invalidate(),
      utils.timeEntry.dayReport.invalidate(),
      utils.timeEntry.listRecent.invalidate(),
      utils.timeEntry.getActive.invalidate(),
    ]);
  };

  const onError = (err: { message: string }) => {
    notifications.show({ title: "Could not save time", message: err.message, color: "red" });
  };

  const createMutation = api.timeEntry.create.useMutation({
    onSuccess: async () => {
      setEditingId(null);
      await refresh();
      notifications.show({ title: "Time added", message: "Time entry added", color: "green" });
    },
    onError,
  });

  const updateMutation = api.timeEntry.update.useMutation({
    onSuccess: async () => {
      setEditingId(null);
      await refresh();
      notifications.show({ title: "Saved", message: "Time entry updated", color: "green" });
    },
    onError,
  });

  const deleteMutation = api.timeEntry.delete.useMutation({
    onSuccess: async () => {
      await refresh();
      notifications.show({ title: "Deleted", message: "Time entry removed", color: "blue" });
    },
    onError,
  });

  const startEditing = (id: EditingId, start: Date | null, end: Date | null) => {
    setEditingId(id);
    setStartedAt(start);
    setEndedAt(end);
  };

  const handleSave = () => {
    if (!startedAt || !editingId) return;
    if (endedAt && endedAt.getTime() <= startedAt.getTime()) {
      notifications.show({
        title: "Invalid range",
        message: "End time must be after start time",
        color: "red",
      });
      return;
    }
    if (editingId !== "new") {
      updateMutation.mutate({ entryId: editingId, startedAt, endedAt });
      return;
    }
    if (!endedAt) {
      notifications.show({ title: "Missing end", message: "Set when this time ended", color: "red" });
      return;
    }
    createMutation.mutate({ actionId, startedAt, endedAt });
  };

  const totalMins = entries.reduce(
    (sum, e) => (e.endedAt ? sum + minutesBetween(new Date(e.startedAt), new Date(e.endedAt)) : sum),
    0,
  );
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const editor = (
    <Stack gap="xs" className="rounded border border-border-primary bg-surface-secondary p-2">
      <Group grow gap="xs" align="flex-start">
        <DateTimeField label="Started" size="xs" value={startedAt} onChange={setStartedAt} />
        <DateTimeField
          label="Ended"
          size="xs"
          value={endedAt}
          onChange={setEndedAt}
          placeholder="Running"
        />
      </Group>
      <Group justify="space-between">
        <Text size="xs" c="dimmed">
          {startedAt && endedAt ? formatMins(minutesBetween(startedAt, endedAt)) : "—"}
        </Text>
        <Group gap="xs">
          <Button size="compact-xs" variant="default" onClick={() => setEditingId(null)}>
            Cancel
          </Button>
          <Button
            size="compact-xs"
            onClick={handleSave}
            loading={isSaving}
            disabled={!startedAt}
            data-testid="action-time-save"
          >
            {editingId === "new" ? "Add" : "Save"}
          </Button>
        </Group>
      </Group>
    </Stack>
  );

  return (
    <div className="mx-4 mt-4" data-testid="action-time-entries">
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <Text size="sm" fw={600} className="text-text-primary">
            Time
          </Text>
          <Text size="xs" c="dimmed" className="font-mono">
            {formatMins(totalMins)}
          </Text>
        </Group>
        <Button
          size="compact-xs"
          variant="subtle"
          leftSection={<IconPlus size={12} />}
          disabled={editingId !== null}
          onClick={() => {
            const [start, end] = defaultNewRange();
            startEditing("new", start, end);
          }}
        >
          Add time
        </Button>
      </Group>

      <Stack gap={4} className="max-h-64 overflow-y-auto">
        {editingId === "new" && editor}
        {isLoading ? (
          <Text size="xs" c="dimmed">
            Loading…
          </Text>
        ) : entries.length === 0 && editingId !== "new" ? (
          <Text size="xs" c="dimmed">
            No time logged on this action yet.
          </Text>
        ) : (
          entries.map((e) => {
            if (editingId === e.id) return <div key={e.id}>{editor}</div>;
            const start = new Date(e.startedAt);
            const end = e.endedAt ? new Date(e.endedAt) : null;
            const crossesDay = end && !isSameDay(start, end);
            return (
              <Group
                key={e.id}
                justify="space-between"
                wrap="nowrap"
                data-status={e.status}
                className={`rounded border border-border-primary bg-background-primary px-2 py-1 ${
                  e.status === "PROPOSED" ? "border-dashed" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <Text size="xs" className="truncate text-text-primary">
                    {format(start, "EEE, MMM d")} · {format(start, "h:mm a")} –{" "}
                    {end ? format(end, crossesDay ? "MMM d, h:mm a" : "h:mm a") : "now"}
                    {e.status === "PROPOSED" && (
                      <Badge size="xs" variant="outline" color="yellow" ml={6} className="align-middle">
                        proposed
                      </Badge>
                    )}
                  </Text>
                  {e.note && (
                    <Text size="xs" c="dimmed" className="truncate">
                      {e.note}
                    </Text>
                  )}
                </div>
                <Group gap={2} wrap="nowrap">
                  <Text size="xs" c="dimmed" className="mr-1 font-mono">
                    {end ? formatMins(minutesBetween(start, end)) : "running"}
                  </Text>
                  <Tooltip label="Edit time" withArrow>
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      aria-label="Edit time"
                      disabled={editingId !== null}
                      onClick={() => startEditing(e.id, start, end)}
                    >
                      <IconPencil size={14} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Delete time" withArrow>
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      color="red"
                      aria-label="Delete time"
                      loading={deleteMutation.isPending && deleteMutation.variables?.entryId === e.id}
                      onClick={() => {
                        if (window.confirm("Delete this time entry?")) {
                          deleteMutation.mutate({ entryId: e.id });
                        }
                      }}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>
            );
          })
        )}
      </Stack>
    </div>
  );
}
