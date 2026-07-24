"use client";

import { useCallback, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Group,
  Paper,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import { api, type RouterOutputs } from "~/trpc/react";
import { EditDraftFeatureModal } from "./EditDraftFeatureModal";

type DraftFeature =
  RouterOutputs["transcription"]["getDraftFeaturesByTranscription"][number];

interface DraftFeaturesReviewCardProps {
  transcriptionId: string;
}

/**
 * In-chat review surface for draft product Features ideated from a meeting.
 *
 * Self-contained in the same way `DraftActionsReviewCard` is: given only a
 * transcriptionId it fetches its own drafts and publishes through the
 * transcription mutations, so no state threads through the chat and the card
 * survives a page reload (ADR-0007).
 *
 * The one thing the Actions card doesn't need is a **product selector**. A
 * workspace can hold several products and the target is never inferred — a
 * meeting must not be able to write features into a product nobody chose — so
 * accepting is blocked until one is picked.
 */
export function DraftFeaturesReviewCard({
  transcriptionId,
}: DraftFeaturesReviewCardProps) {
  const utils = api.useUtils();
  const [productId, setProductId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingDraft, setEditingDraft] = useState<DraftFeature | null>(null);

  const { data: drafts = [], isLoading } =
    api.transcription.getDraftFeaturesByTranscription.useQuery({
      transcriptionId,
    });

  // The meeting knows its workspace; the workspace knows its products.
  const { data: meeting } = api.transcription.getById.useQuery({
    id: transcriptionId,
  });
  const workspaceId = meeting?.workspaceId ?? null;

  const { data: products = [] } = api.product.product.list.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: Boolean(workspaceId) },
  );

  const invalidateQueries = useCallback(async () => {
    await Promise.all([
      utils.transcription.getDraftFeaturesByTranscription.invalidate({
        transcriptionId,
      }),
      utils.product.feature.list.invalidate(),
      utils.product.ticket.list.invalidate(),
    ]);
  }, [utils, transcriptionId]);

  const publishMutation =
    api.transcription.publishSelectedDraftFeatures.useMutation({
      onSuccess: async (result) => {
        notifications.show({
          title: "Features created",
          message: `Created ${result.featuresCreated} feature${
            result.featuresCreated === 1 ? "" : "s"
          } and ${result.ticketsCreated} backlog ticket${
            result.ticketsCreated === 1 ? "" : "s"
          }.`,
          color: "green",
        });
        setSelectedIds(new Set());
        await invalidateQueries();
      },
      onError: (error) => {
        notifications.show({
          title: "Error",
          message: error.message ?? "Failed to create features",
          color: "red",
        });
      },
    });

  // Rejecting writes nothing to the registry — it deletes the holding row.
  const discardMutation = api.transcription.discardDraftFeatures.useMutation({
    onSuccess: async () => {
      await invalidateQueries();
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message ?? "Failed to discard drafts",
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
    if (selectedIds.size === drafts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(drafts.map((draft) => draft.id)));
    }
  };

  const discard = (draftIds: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of draftIds) next.delete(id);
      return next;
    });
    discardMutation.mutate({ transcriptionId, draftIds });
  };

  const accept = (draftIds: string[]) => {
    if (!productId || draftIds.length === 0) return;
    publishMutation.mutate({ transcriptionId, draftIds, productId });
  };

  const allSelected = drafts.length > 0 && selectedIds.size === drafts.length;
  const someSelected = selectedIds.size > 0 && !allSelected;
  const isBusy = publishMutation.isPending || discardMutation.isPending;

  if (isLoading) {
    return (
      <Paper
        p="sm"
        radius="md"
        withBorder
        mt="xs"
        className="bg-surface-secondary"
      >
        <Text size="sm" c="dimmed">
          Loading draft features…
        </Text>
      </Paper>
    );
  }

  if (drafts.length === 0) {
    return (
      <Paper
        p="sm"
        radius="md"
        withBorder
        mt="xs"
        className="bg-surface-secondary"
      >
        <Text size="sm" c="dimmed">
          All set — no draft features left to review.
        </Text>
      </Paper>
    );
  }

  return (
    <>
      <Paper
        p="sm"
        radius="md"
        withBorder
        mt="xs"
        className="bg-surface-secondary"
      >
        <Stack gap="sm">
          <Group gap="xs">
            <Checkbox
              size="sm"
              checked={allSelected}
              indeterminate={someSelected}
              onChange={toggleAll}
              label={`Select all (${drafts.length})`}
            />
          </Group>

          {drafts.map((draft) => (
            <Paper key={draft.id} p="sm" radius="sm" withBorder>
              <Group gap="sm" wrap="nowrap" align="flex-start">
                <Checkbox
                  size="sm"
                  checked={selectedIds.has(draft.id)}
                  onChange={() => toggleSelection(draft.id)}
                  className="mt-1"
                  aria-label={`Select ${draft.name}`}
                />
                <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
                  <Text fw={500}>{draft.name}</Text>
                  {draft.description && (
                    <Text size="sm" c="dimmed">
                      {draft.description}
                    </Text>
                  )}
                  {draft.vision && (
                    <Text size="sm" fs="italic" c="dimmed">
                      {draft.vision}
                    </Text>
                  )}
                  {draft.tickets.length > 0 && (
                    <Stack gap={4} mt={4}>
                      <Text size="xs" c="dimmed" fw={500}>
                        Proposed tickets ({draft.tickets.length})
                      </Text>
                      {draft.tickets.map((ticket, index) => (
                        <Group
                          key={`${draft.id}-${index}`}
                          gap="xs"
                          wrap="nowrap"
                        >
                          <Badge size="xs" variant="light">
                            {ticket.type}
                          </Badge>
                          <Text size="sm" style={{ minWidth: 0 }}>
                            {ticket.title}
                          </Text>
                        </Group>
                      ))}
                    </Stack>
                  )}
                </Stack>
                <Group gap={4} wrap="nowrap">
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    aria-label={`Edit ${draft.name}`}
                    onClick={() => setEditingDraft(draft)}
                  >
                    <IconPencil size={14} />
                  </ActionIcon>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="red"
                    aria-label={`Discard ${draft.name}`}
                    onClick={() => discard([draft.id])}
                    loading={discardMutation.isPending}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Group>
              </Group>
            </Paper>
          ))}

          {workspaceId ? (
            <Select
              size="xs"
              label="Target product"
              placeholder="Choose a product"
              data={products.map((product) => ({
                value: product.id,
                label: product.name,
              }))}
              value={productId}
              onChange={setProductId}
              searchable
              nothingFoundMessage="No products in this workspace"
            />
          ) : (
            <Text size="xs" c="dimmed">
              This meeting isn&apos;t in a workspace yet — assign it to a
              project first so its features have somewhere to go.
            </Text>
          )}

          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              {productId
                ? "Nothing is added to the product until you accept."
                : "Pick a target product to accept into."}
            </Text>
            <Group gap="xs">
              <Button
                size="xs"
                variant="subtle"
                color="red"
                onClick={() => discard(Array.from(selectedIds))}
                loading={discardMutation.isPending}
                disabled={selectedIds.size === 0 || isBusy}
              >
                Discard ({selectedIds.size})
              </Button>
              <Button
                size="xs"
                variant="light"
                onClick={() => accept(Array.from(selectedIds))}
                loading={publishMutation.isPending}
                disabled={!productId || selectedIds.size === 0 || isBusy}
              >
                Accept selected ({selectedIds.size})
              </Button>
              <Button
                size="xs"
                onClick={() => accept(drafts.map((draft) => draft.id))}
                loading={publishMutation.isPending}
                disabled={!productId || isBusy}
              >
                Accept all
              </Button>
            </Group>
          </Group>
        </Stack>
      </Paper>
      <EditDraftFeatureModal
        draft={editingDraft}
        transcriptionId={transcriptionId}
        opened={Boolean(editingDraft)}
        onClose={() => setEditingDraft(null)}
        onSaved={async () => {
          await utils.transcription.getDraftFeaturesByTranscription.invalidate({
            transcriptionId,
          });
          setEditingDraft(null);
        }}
      />
    </>
  );
}
