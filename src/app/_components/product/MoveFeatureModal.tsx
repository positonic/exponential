"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import type { MoveLossSummary } from "~/plugins/product/server/services/featureMove";

/** Pluralize a count: `count(2, "ticket")` → "2 tickets". */
function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/**
 * Enumerate the lossy consequences of a move from its loss summary. Only
 * non-empty categories are listed; an otherwise-clean move says so.
 */
function consequenceLines(loss: MoveLossSummary): string[] {
  const lines: string[] = [];
  if (loss.ticketsRenumbered > 0)
    lines.push(`${count(loss.ticketsRenumbered, "ticket")} renumbered into the destination product`);
  if (loss.cyclesDropped > 0)
    lines.push(`${count(loss.cyclesDropped, "ticket")} unlinked from their cycle`);
  if (loss.dependenciesDropped > 0)
    lines.push(`${count(loss.dependenciesDropped, "ticket dependency")} dropped (crosses the move boundary)`);
  if (loss.assigneesCleared > 0)
    lines.push(`${count(loss.assigneesCleared, "assignee")} cleared (not in the destination workspace)`);
  if (loss.childActionsUnlinked > 0)
    lines.push(`${count(loss.childActionsUnlinked, "child action")} unlinked (left in the source workspace)`);
  if (loss.insightLinksDropped > 0)
    lines.push(`${count(loss.insightLinksDropped, "insight link")} dropped`);
  if (loss.tagsDropped > 0)
    lines.push(`${count(loss.tagsDropped, "workspace tag")} dropped`);
  if (loss.goalAlignmentRemoved) lines.push("Goal alignment removed");
  if (lines.length === 0) lines.push("No workspace- or product-scoped links to sever.");
  return lines;
}

/**
 * Two-step "move this Feature to another workspace" confirm modal (ADR-0027).
 *
 * A Feature has no workspace of its own — its only container link is
 * `productId` — so moving "to a workspace" means re-pointing it at a Product in
 * that workspace. Step 1 picks the destination workspace (only those the caller
 * can write to, i.e. owner/admin/member); step 2 picks a Product within it. The
 * move is a lossy cross-workspace cascade, so it lives behind an explicit
 * button + confirm rather than an always-live inline dropdown.
 */
export function MoveFeatureModal({
  opened,
  onClose,
  featureId,
  currentProductId,
  currentWorkspaceId,
}: {
  opened: boolean;
  onClose: () => void;
  featureId: string;
  currentProductId: string;
  currentWorkspaceId: string;
}) {
  const router = useRouter();
  const utils = api.useUtils();

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);

  // Reset the picker each time the modal opens.
  useEffect(() => {
    if (opened) {
      setWorkspaceId(null);
      setProductId(null);
    }
  }, [opened]);

  const { data: workspaces } = api.workspace.list.useQuery(undefined, {
    enabled: opened,
  });
  const { data: products, isLoading: productsLoading } =
    api.product.product.list.useQuery(
      { workspaceId: workspaceId ?? "" },
      { enabled: opened && !!workspaceId },
    );

  // Only workspaces the caller can write to (owner/admin/member), excluding the
  // Feature's current workspace. Viewer-only / guest workspaces are hidden.
  const writableRoles = new Set(["owner", "admin", "member"]);
  const workspaceOptions = (workspaces ?? [])
    .filter(
      (w) =>
        w.id !== currentWorkspaceId &&
        w.currentUserRole != null &&
        writableRoles.has(w.currentUserRole),
    )
    .map((w) => ({ value: w.id, label: w.name }));

  const productOptions = (products ?? [])
    .filter((p) => p.id !== currentProductId)
    .map((p) => ({ value: p.id, label: p.name }));

  // Loss preview — same planFeatureMove the move runs, so the dialog can never
  // disagree with what actually happens (ADR-0027).
  const { data: preview, isFetching: previewLoading } =
    api.product.feature.getMovePreview.useQuery(
      { featureId, destinationProductId: productId ?? "" },
      { enabled: opened && !!productId },
    );

  const move = api.product.feature.move.useMutation({
    onSuccess: async (res) => {
      await utils.product.feature.getById.invalidate({ id: featureId });
      onClose();
      if (res.workspaceSlug) {
        router.push(
          `/w/${res.workspaceSlug}/products/${res.productSlug}/features/${res.featureId}`,
        );
      }
    },
  });

  return (
    <Modal opened={opened} onClose={onClose} title="Move feature" centered>
      <Stack gap="md">
        <Text size="sm" className="text-text-muted">
          Move this feature to a Product in another workspace. Its PRD, scopes,
          user stories, and comments come along.
        </Text>

        <Select
          label="Destination workspace"
          placeholder="Choose a workspace"
          data={workspaceOptions}
          value={workspaceId}
          onChange={(val) => {
            setWorkspaceId(val);
            setProductId(null);
          }}
          searchable
          nothingFoundMessage="No workspaces you can write to"
          comboboxProps={{ withinPortal: true }}
        />

        <Select
          label="Destination product"
          placeholder={
            workspaceId ? "Choose a product" : "Pick a workspace first"
          }
          data={productOptions}
          value={productId}
          onChange={setProductId}
          disabled={!workspaceId || productsLoading}
          searchable
          nothingFoundMessage="No products in this workspace"
          comboboxProps={{ withinPortal: true }}
        />

        {productId && (
          <Alert
            variant="light"
            color="yellow"
            icon={<IconAlertTriangle size={16} />}
            title="This move is lossy and can't be undone"
          >
            {previewLoading || !preview ? (
              <Text size="xs" className="text-text-muted">
                Calculating consequences…
              </Text>
            ) : (
              <Stack gap={2}>
                {consequenceLines(preview).map((line) => (
                  <Text key={line} size="xs">
                    {line}
                  </Text>
                ))}
                <Text size="xs" className="text-text-muted">
                  PRD body, scopes, user stories, and comments move unchanged.
                </Text>
              </Stack>
            )}
          </Alert>
        )}

        {move.isError && (
          <Text size="sm" className="text-brand-error">
            {move.error.message}
          </Text>
        )}

        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose} disabled={move.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              productId &&
              move.mutate({
                featureId,
                destinationProductId: productId,
                expectedSourceProductId: currentProductId,
              })
            }
            loading={move.isPending}
            disabled={!productId || previewLoading}
          >
            Move feature
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
