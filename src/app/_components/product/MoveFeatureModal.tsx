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

        <Alert
          variant="light"
          color="yellow"
          icon={<IconAlertTriangle size={16} />}
        >
          <Text size="xs">
            Crossing a workspace boundary severs workspace- and product-scoped
            links (goal alignment, insights, workspace tags, and more). This
            can&apos;t be undone by moving the feature back.
          </Text>
        </Alert>

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
              move.mutate({ featureId, destinationProductId: productId })
            }
            loading={move.isPending}
            disabled={!productId}
          >
            Move feature
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
