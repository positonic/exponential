"use client";

import { useCallback, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Group,
  Paper,
  Stack,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import type { RouterOutputs } from "~/trpc/react";
import { EditActionModal } from "./EditActionModal";

type DraftAction =
  RouterOutputs["action"]["getDraftByTranscription"][number];

interface DraftActionsReviewCardProps {
  transcriptionId: string;
}

/**
 * Interactive in-chat review surface for draft Actions extracted from a meeting.
 *
 * This is the first interactive (not read-only) message payload in ManyChat —
 * it lets the user review, edit, deselect, and publish the deterministically
 * extracted drafts without leaving the drawer (ADR-0007). It is self-contained:
 * given only a transcriptionId it fetches its own drafts and publishes via the
 * existing transcription mutations, so publishing refreshes the meeting's
 * Actions section on the Overview tab automatically.
 */
export function DraftActionsReviewCard({
  transcriptionId,
}: DraftActionsReviewCardProps) {
  const utils = api.useUtils();
  const [editingAction, setEditingAction] = useState<DraftAction | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: draftActions = [], isLoading } =
    api.action.getDraftByTranscription.useQuery({ transcriptionId });

  const invalidateQueries = useCallback(async () => {
    await Promise.all([
      utils.action.getAll.invalidate(),
      utils.action.getProjectActions.invalidate(),
      utils.action.getDraftByTranscription.invalidate({ transcriptionId }),
      utils.action.getByTranscription.invalidate({ transcriptionId }),
      utils.transcription.getAllTranscriptions.invalidate(),
      utils.transcription.getById.invalidate({ id: transcriptionId }),
    ]);
  }, [utils, transcriptionId]);

  const publishDraftsMutation =
    api.transcription.publishDraftActions.useMutation({
      onSuccess: async (result) => {
        if (result.publishedCount === 0) {
          notifications.show({
            title: "No Drafts",
            message: "There are no draft actions to publish.",
            color: "gray",
          });
          return;
        }
        notifications.show({
          title: "Actions Created",
          message: `Created ${result.publishedCount} action${result.publishedCount === 1 ? "" : "s"}.`,
          color: "green",
        });
        setSelectedIds(new Set());
        await invalidateQueries();
      },
      onError: (error) => {
        notifications.show({
          title: "Error",
          message: error.message ?? "Failed to publish draft actions",
          color: "red",
        });
      },
    });

  const publishSelectedMutation =
    api.transcription.publishSelectedDraftActions.useMutation({
      onSuccess: async (result) => {
        if (result.publishedCount === 0) {
          notifications.show({
            title: "No Drafts",
            message: "No selected draft actions were published.",
            color: "gray",
          });
          return;
        }
        notifications.show({
          title: "Actions Created",
          message: `Created ${result.publishedCount} action${result.publishedCount === 1 ? "" : "s"}.`,
          color: "green",
        });
        setSelectedIds(new Set());
        await invalidateQueries();
      },
      onError: (error) => {
        notifications.show({
          title: "Error",
          message: error.message ?? "Failed to publish selected actions",
          color: "red",
        });
      },
    });

  const deleteDraftMutation = api.action.bulkDelete.useMutation({
    onSuccess: async () => {
      await invalidateQueries();
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message ?? "Failed to delete draft action",
        color: "red",
      });
    },
  });

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === draftActions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(draftActions.map((a) => a.id)));
    }
  };

  const handleDelete = (actionId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(actionId);
      return next;
    });
    deleteDraftMutation.mutate({ actionIds: [actionId] });
  };

  const allSelected =
    draftActions.length > 0 && selectedIds.size === draftActions.length;
  const someSelected = selectedIds.size > 0 && !allSelected;
  const isPublishing =
    publishDraftsMutation.isPending || publishSelectedMutation.isPending;

  if (isLoading) {
    return (
      <Paper p="sm" radius="md" withBorder mt="xs" className="bg-surface-secondary">
        <Text size="sm" c="dimmed">
          Loading draft actions…
        </Text>
      </Paper>
    );
  }

  if (draftActions.length === 0) {
    return (
      <Paper p="sm" radius="md" withBorder mt="xs" className="bg-surface-secondary">
        <Text size="sm" c="dimmed">
          All set — no draft actions left to review.
        </Text>
      </Paper>
    );
  }

  return (
    <>
      <Paper p="sm" radius="md" withBorder mt="xs" className="bg-surface-secondary">
        <Stack gap="sm">
          <Group gap="xs">
            <Checkbox
              size="sm"
              checked={allSelected}
              indeterminate={someSelected}
              onChange={toggleAll}
              label={`Select all (${draftActions.length})`}
            />
          </Group>
          {draftActions.map((action) => (
            <Paper key={action.id} p="sm" radius="sm" withBorder>
              <Group gap="sm" wrap="nowrap" align="flex-start">
                <Checkbox
                  size="sm"
                  checked={selectedIds.has(action.id)}
                  onChange={() => toggleSelection(action.id)}
                  className="mt-1"
                />
                <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
                  <Text fw={500}>{action.name}</Text>
                  {action.description && (
                    <Text size="sm" c="dimmed">
                      {action.description}
                    </Text>
                  )}
                  <Group gap="xs">
                    {action.priority && (
                      <Badge size="xs" variant="light" color="blue">
                        {action.priority}
                      </Badge>
                    )}
                    {action.dueDate && (
                      <Badge size="xs" variant="light" color="red">
                        Due: {new Date(action.dueDate).toLocaleDateString()}
                      </Badge>
                    )}
                  </Group>
                </Stack>
                <Group gap={4} wrap="nowrap">
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    aria-label="Edit draft action"
                    onClick={() => setEditingAction(action)}
                  >
                    <IconPencil size={14} />
                  </ActionIcon>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="red"
                    aria-label="Delete draft action"
                    onClick={() => handleDelete(action.id)}
                    loading={deleteDraftMutation.isPending}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Group>
              </Group>
            </Paper>
          ))}
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              Drafts won&apos;t appear in your task lists until you create them.
            </Text>
            <Group gap="xs">
              <Button
                size="xs"
                variant="light"
                onClick={() =>
                  publishSelectedMutation.mutate({
                    transcriptionId,
                    actionIds: Array.from(selectedIds),
                  })
                }
                loading={publishSelectedMutation.isPending}
                disabled={selectedIds.size === 0 || isPublishing}
              >
                Create selected ({selectedIds.size})
              </Button>
              <Button
                size="xs"
                onClick={() =>
                  publishDraftsMutation.mutate({ transcriptionId })
                }
                loading={publishDraftsMutation.isPending}
                disabled={draftActions.length === 0 || isPublishing}
              >
                Create all
              </Button>
            </Group>
          </Group>
        </Stack>
      </Paper>
      <EditActionModal
        action={editingAction}
        opened={Boolean(editingAction)}
        onClose={() => setEditingAction(null)}
        onSuccess={async () => {
          await utils.action.getDraftByTranscription.invalidate({
            transcriptionId,
          });
          setEditingAction(null);
        }}
      />
    </>
  );
}
