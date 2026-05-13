"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import {
  IconPencil,
  IconTrash,
  IconRefresh,
} from "@tabler/icons-react";

import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { EditActionModal } from "./EditActionModal";
import { formatElapsedClock } from "~/hooks/useActiveTimer";
import type { CalendarTimeEntry } from "./calendar/types";

interface TimeEntryModalProps {
  entry: CalendarTimeEntry | null;
  opened: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * Slim TimeEntry editor. Action-level edits delegate to the existing
 * `EditActionModal` via the pencil button (nested modal); this modal handles
 * only entry-level state: start/end pickers, action reassignment, and delete.
 */
export function TimeEntryModal({
  entry,
  opened,
  onClose,
  onSuccess,
}: TimeEntryModalProps) {
  const utils = api.useUtils();
  const { workspaceId } = useWorkspace();

  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [endedAt, setEndedAt] = useState<Date | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionName, setActionName] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [editActionOpened, setEditActionOpened] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!entry) return;
    setStartedAt(new Date(entry.startedAt));
    setEndedAt(entry.endedAt ? new Date(entry.endedAt) : null);
    setActionId(entry.action.id);
    setActionName(entry.action.name);
    setQuery("");
  }, [entry?.id]);

  const { data: suggestions = [] } = api.action.searchByTitle.useQuery(
    {
      query,
      workspaceId: workspaceId ?? undefined,
      limit: 8,
    },
    { enabled: pickerOpen && query.trim().length > 0 },
  );

  const updateMutation = api.timeEntry.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.timeEntry.listByDateRange.invalidate(),
        utils.timeEntry.listRecent.invalidate(),
        utils.timeEntry.getActive.invalidate(),
      ]);
      notifications.show({ title: "Saved", message: "Time entry updated", color: "green" });
      onSuccess?.();
      onClose();
    },
    onError: (err) => {
      notifications.show({ title: "Error", message: err.message, color: "red" });
    },
  });

  const deleteMutation = api.timeEntry.delete.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.timeEntry.listByDateRange.invalidate(),
        utils.timeEntry.listRecent.invalidate(),
        utils.timeEntry.getActive.invalidate(),
      ]);
      notifications.show({ title: "Deleted", message: "Time entry removed", color: "blue" });
      onSuccess?.();
      onClose();
    },
    onError: (err) => {
      notifications.show({ title: "Error", message: err.message, color: "red" });
    },
  });

  const durationLabel = useMemo(() => {
    if (!startedAt) return "—";
    if (!endedAt) return "running…";
    const ms = Math.max(0, endedAt.getTime() - startedAt.getTime());
    return formatElapsedClock(ms);
  }, [startedAt, endedAt]);

  const isDirty = useMemo(() => {
    if (!entry) return false;
    const startChanged =
      startedAt?.getTime() !== new Date(entry.startedAt).getTime();
    const endChanged =
      (endedAt?.getTime() ?? null) !==
      (entry.endedAt ? new Date(entry.endedAt).getTime() : null);
    const actionChanged = actionId !== entry.action.id;
    return startChanged || endChanged || actionChanged;
  }, [entry, startedAt, endedAt, actionId]);

  if (!entry) return null;

  const handleSave = () => {
    if (!startedAt) return;
    if (endedAt && endedAt.getTime() <= startedAt.getTime()) {
      notifications.show({
        title: "Invalid range",
        message: "End time must be after start time",
        color: "red",
      });
      return;
    }
    updateMutation.mutate({
      entryId: entry.id,
      startedAt,
      endedAt,
      actionId: actionId ?? undefined,
    });
  };

  return (
    <>
      <Modal
        opened={opened}
        onClose={onClose}
        title={
          <Group gap="xs">
            <Text fw={600}>Time entry</Text>
            <Tooltip label="Edit underlying action" withArrow>
              <ActionIcon
                variant="subtle"
                size="sm"
                aria-label="Edit action"
                onClick={() => setEditActionOpened(true)}
              >
                <IconPencil size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        }
        centered
        size="md"
      >
        <Stack gap="sm">
          <div>
            <Text size="xs" c="dimmed">
              Action
            </Text>
            <Group gap="xs" align="center">
              <Text fw={500}>{actionName || "Untitled"}</Text>
              <Tooltip
                label={pickerOpen ? "Cancel reassignment" : "Reassign to another action"}
                withArrow
              >
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  aria-label="Reassign"
                  onClick={() => setPickerOpen((v) => !v)}
                >
                  <IconRefresh size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
            {pickerOpen && (
              <Stack gap={4} mt="xs">
                <input
                  type="text"
                  className="rounded border border-border-primary bg-background-primary px-2 py-1 text-sm text-text-primary"
                  placeholder="Search actions…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
                {query.trim().length > 0 && suggestions.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded border border-border-primary bg-surface-secondary">
                    {suggestions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className="block w-full px-2 py-1 text-left text-sm text-text-primary hover:bg-surface-hover"
                        onClick={() => {
                          setActionId(s.id);
                          setActionName(s.name);
                          setPickerOpen(false);
                          setQuery("");
                        }}
                      >
                        {s.name}
                        {s.project?.name && (
                          <span className="ml-2 text-text-muted">
                            · {s.project.name}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </Stack>
            )}
          </div>

          <DateTimePicker
            label="Started"
            value={startedAt}
            onChange={(v) => setStartedAt(v ? new Date(v) : null)}
            withSeconds={false}
            popoverProps={{ withinPortal: true }}
          />

          <DateTimePicker
            label="Ended"
            value={endedAt}
            onChange={(v) => setEndedAt(v ? new Date(v) : null)}
            withSeconds={false}
            popoverProps={{ withinPortal: true }}
            description="Leave blank to keep this entry running"
          />

          <Text size="xs" c="dimmed">
            Duration: <span className="font-mono">{durationLabel}</span>
          </Text>

          <Group justify="space-between" mt="md">
            <Tooltip label="Delete entry" withArrow>
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label="Delete entry"
                onClick={() => {
                  if (window.confirm("Delete this time entry?")) {
                    deleteMutation.mutate({ entryId: entry.id });
                  }
                }}
                loading={deleteMutation.isPending}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
            <Group gap="xs">
              <Button variant="default" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={!isDirty || !startedAt}
                loading={updateMutation.isPending}
              >
                Save
              </Button>
            </Group>
          </Group>
        </Stack>
      </Modal>

      <EditActionModal
        action={
          entry.action.id
            ? {
                id: entry.action.id,
                name: actionName,
                description: null,
                status: "ACTIVE",
                priority: "Quick",
                dueDate: null,
                projectId: entry.action.projectId ?? null,
                scheduledStart: null,
                duration: null,
              }
            : null
        }
        opened={editActionOpened}
        onClose={() => setEditActionOpened(false)}
        onSuccess={() => {
          void utils.timeEntry.listByDateRange.invalidate();
        }}
      />
    </>
  );
}
