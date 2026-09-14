"use client";

import { Button, Group, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";
import { CollapsibleSection } from "~/app/_components/product/CollapsibleSection";
import {
  LinkedActionsPanel,
  type LinkedAction,
} from "~/app/_components/shared/LinkedActionsPanel";

// Extracted from the ticket detail page so the ticket peek drawer renders the
// exact same Actions block. `LinkedAction` is the `ticket.getById` action row;
// the rows and the picker themselves now live in the shared panel, which the
// Decision Log renders too.
export type { LinkedAction };

export function LinkedActionsSection({
  ticketId,
  actions,
  workspaceId,
  onChanged,
}: {
  ticketId: string;
  actions: LinkedAction[];
  workspaceId: string | null;
  onChanged: () => void;
}) {
  const linkAction = api.product.ticket.linkAction.useMutation({
    onSuccess: () => onChanged(),
  });
  // Unlink is one unconfirmed click - the undo toast closes the loop
  // (re-linking is idempotent), matching the list's bulk-edit undo pattern.
  const unlinkAction = api.product.ticket.unlinkAction.useMutation({
    onSuccess: (_data, vars) => {
      onChanged();
      const nid = `action-unlinked-${vars.actionId}`;
      notifications.show({
        id: nid,
        message: (
          <Group justify="space-between" gap="sm" wrap="nowrap">
            <Text size="sm">Action unlinked</Text>
            <Button
              size="compact-xs"
              variant="light"
              onClick={() => {
                notifications.hide(nid);
                linkAction.mutate({ ticketId, actionId: vars.actionId });
              }}
            >
              Undo
            </Button>
          </Group>
        ),
      });
    },
  });

  return (
    <div>
      {/* The shared chevron + uppercase header (one implementation for
          Actions / Dependencies / Activity), count in the meta slot. */}
      <CollapsibleSection
        title="Actions"
        meta={actions.length > 0 ? String(actions.length) : undefined}
      >
        <LinkedActionsPanel
          actions={actions}
          workspaceId={workspaceId}
          viewName="ticket"
          onLink={(actionId) => linkAction.mutate({ ticketId, actionId })}
          onUnlink={(actionId) => unlinkAction.mutate({ actionId })}
          onChanged={onChanged}
          unlinkPending={unlinkAction.isPending}
        />
      </CollapsibleSection>
    </div>
  );
}
