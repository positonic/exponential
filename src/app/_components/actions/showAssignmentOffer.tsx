"use client";

import { Button, Group, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import type { AssignmentOffer } from "~/lib/actions/assignmentOffer";

/**
 * The toast offering to assign the Assistants a comment mentioned but did not
 * start (decided 2026-10-11). The house toast-with-a-compact-Button pattern
 * (see `product/LinkedActionsSection.tsx`'s undo).
 */
export function showAssignmentOffer(
  offer: AssignmentOffer,
  { actionId, onAssign }: { actionId: string; onAssign: (userIds: string[]) => void },
): void {
  const id = `assignment-offer-${actionId}`;
  notifications.show({
    id,
    autoClose: 10_000,
    message: (
      <Group justify="space-between" gap="sm" wrap="nowrap">
        <Text size="sm">{offer.message}</Text>
        <Button
          size="compact-xs"
          variant="light"
          className="shrink-0"
          onClick={() => {
            notifications.hide(id);
            onAssign(offer.userIds);
          }}
        >
          {offer.buttonLabel}
        </Button>
      </Group>
    ),
  });
}
