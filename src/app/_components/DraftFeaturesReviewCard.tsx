"use client";

import { useCallback, useState } from "react";
import {
  Badge,
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";

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

  if (isLoading) {
    return (
      <Paper p="sm" radius="md" withBorder mt="xs" className="bg-surface-secondary">
        <Text size="sm" c="dimmed">
          Loading draft features…
        </Text>
      </Paper>
    );
  }

  if (drafts.length === 0) {
    return (
      <Paper p="sm" radius="md" withBorder mt="xs" className="bg-surface-secondary">
        <Text size="sm" c="dimmed">
          All set — no draft features left to review.
        </Text>
      </Paper>
    );
  }

  return (
    <Paper p="sm" radius="md" withBorder mt="xs" className="bg-surface-secondary">
      <Stack gap="sm">
        {drafts.map((draft) => (
          <Paper key={draft.id} p="sm" radius="sm" withBorder>
            <Stack gap={6}>
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
                    Proposed tickets
                  </Text>
                  {draft.tickets.map((ticket, index) => (
                    <Group key={`${draft.id}-${index}`} gap="xs" wrap="nowrap">
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
            This meeting isn&apos;t in a workspace yet — assign it to a project
            first so its features have somewhere to go.
          </Text>
        )}

        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            Nothing is added to the product until you accept.
          </Text>
          <Button
            size="xs"
            onClick={() => {
              if (!productId) return;
              publishMutation.mutate({
                transcriptionId,
                draftIds: drafts.map((draft) => draft.id),
                productId,
              });
            }}
            loading={publishMutation.isPending}
            disabled={!productId || publishMutation.isPending}
          >
            Accept ({drafts.length})
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
