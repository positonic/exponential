"use client";

import { useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Text,
  TextInput,
} from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { api } from "~/trpc/react";

interface AreaManagementProps {
  productId: string;
}

/**
 * Manage a Product's Areas - the exclusive feature-registry buckets
 * (Features V2, see CONTEXT.md "Area"). Rename inline (blur saves), delete
 * (un-sorts its features, never deletes them), add. Deliberately flat: no
 * nesting, no colors, one carving axis per product. Lives in the product
 * settings page.
 */
export function AreaManagement({ productId }: AreaManagementProps) {
  const utils = api.useUtils();
  const [newName, setNewName] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const { data: areas } = api.product.feature.listAreas.useQuery(
    { productId },
    { enabled: !!productId },
  );

  const invalidate = async () => {
    await utils.product.feature.listAreas.invalidate({ productId });
    await utils.product.feature.list.invalidate({ productId });
  };

  const createArea = api.product.feature.createArea.useMutation({
    onSuccess: async () => {
      setNewName("");
      await invalidate();
    },
  });
  const updateArea = api.product.feature.updateArea.useMutation({ onSuccess: invalidate });
  const deleteArea = api.product.feature.deleteArea.useMutation({ onSuccess: invalidate });

  const submitNew = () => {
    const name = newName.trim();
    if (name) createArea.mutate({ productId, name });
  };

  return (
    <div className="space-y-3">
      {(areas ?? []).length > 0 && (
        <div className="border border-border-primary rounded-lg overflow-hidden">
          {(areas ?? []).map((area, i) => (
            <div
              key={area.id}
              className={`flex items-center gap-2 px-3 py-2 ${
                i < (areas?.length ?? 0) - 1 ? "border-b border-border-primary" : ""
              }`}
            >
              <TextInput
                value={drafts[area.id] ?? area.name}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [area.id]: e.currentTarget.value }))
                }
                onBlur={() => {
                  const next = (drafts[area.id] ?? area.name).trim();
                  if (next && next !== area.name) {
                    updateArea.mutate({ id: area.id, name: next });
                  }
                }}
                size="xs"
                variant="unstyled"
                className="flex-1"
              />
              <Badge size="xs" variant="light" color="gray">
                {area._count.features} feature{area._count.features === 1 ? "" : "s"}
              </Badge>
              <ActionIcon
                variant="subtle"
                color="red"
                size="xs"
                onClick={() =>
                  modals.openConfirmModal({
                    title: "Delete area",
                    children: (
                      <Text size="sm">
                        Delete &quot;{area.name}&quot;? Its {area._count.features}{" "}
                        feature(s) become unsorted - nothing is deleted.
                      </Text>
                    ),
                    labels: { confirm: "Delete", cancel: "Cancel" },
                    confirmProps: { color: "red" },
                    onConfirm: () => deleteArea.mutate({ id: area.id }),
                  })
                }
              >
                <IconTrash size={12} />
              </ActionIcon>
            </div>
          ))}
        </div>
      )}

      <Group gap="xs">
        <TextInput
          placeholder="New area (e.g. Meetings, Platform)"
          value={newName}
          onChange={(e) => setNewName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitNew();
            }
          }}
          size="xs"
          className="flex-1"
        />
        <Button
          size="xs"
          variant="light"
          leftSection={<IconPlus size={12} />}
          onClick={submitNew}
          loading={createArea.isPending}
          disabled={!newName.trim()}
        >
          Add
        </Button>
      </Group>
    </div>
  );
}
