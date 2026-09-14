"use client";

import { Button, Group, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";
import {
  LinkedActionsPanel,
  type LinkedAction,
} from "~/app/_components/shared/LinkedActionsPanel";

/**
 * "Actions" on a decision (ADR-0060): the work the decision put in motion,
 * through the `actionId` arm of DecisionLink. Same block the ticket detail
 * page and the "Log a decision" modal render — the modal stages its links
 * and this panel writes them one at a time.
 */

export interface DecisionActionLink {
  id: string;
  action: LinkedAction | null;
}

export function DecisionActionsPanel({
  workspaceId,
  decisionId,
  links,
  canEdit,
}: {
  workspaceId: string;
  decisionId: string;
  /** Every link on the decision; the ticket/feature arms are ignored here. */
  links: DecisionActionLink[];
  canEdit: boolean;
}) {
  const utils = api.useUtils();

  const invalidate = async () => {
    await utils.decision.get.invalidate({ workspaceId, decisionId });
  };
  const onError = (title: string) => (error: { message: string }) =>
    notifications.show({ title, message: error.message, color: "red" });

  const linkAction = api.decision.linkAction.useMutation({
    onSuccess: async (result) => {
      await invalidate();
      // Adoption moves an action onto a ticket. Say so — a silent change of
      // an action's ticket is the kind the user only finds out about later.
      if (result.adoptedActions > 0) {
        notifications.show({
          message:
            result.adoptedActions === 1
              ? "Also added to the ticket this decision implements"
              : `${result.adoptedActions} actions added to the ticket this decision implements`,
        });
      }
    },
    onError: onError("Couldn't link the action"),
  });
  // One unconfirmed click, closed by an undo toast — re-linking is
  // idempotent, the same loop the ticket's Actions block uses.
  const unlink = api.decision.unlink.useMutation({
    onSuccess: invalidate,
    onError: onError("Couldn't unlink the action"),
  });

  const showUndo = (actionId: string) => {
    const nid = `decision-action-unlinked-${actionId}`;
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
              linkAction.mutate({ workspaceId, decisionId, actionId });
            }}
          >
            Undo
          </Button>
        </Group>
      ),
    });
  };

  const actionLinks = links.filter(
    (l): l is DecisionActionLink & { action: LinkedAction } => l.action !== null,
  );
  const actions = actionLinks.map((l) => l.action);

  const handleUnlink = (actionId: string) => {
    const link = actionLinks.find((l) => l.action.id === actionId);
    if (!link) return;
    unlink.mutate(
      { workspaceId, linkId: link.id },
      { onSuccess: () => showUndo(actionId) },
    );
  };

  return (
    <Stack gap="xs">
      <Title order={5} className="text-text-secondary">
        Actions
        {actions.length > 0 ? (
          <Text span fz={11} ml={6} className="text-text-muted">
            {actions.length}
          </Text>
        ) : null}
      </Title>
      {actions.length === 0 && !canEdit ? (
        <Text size="sm" className="text-text-muted">
          No linked actions yet.
        </Text>
      ) : (
        <LinkedActionsPanel
          actions={actions}
          workspaceId={workspaceId}
          viewName="decision"
          canEdit={canEdit}
          onLink={(actionId) => linkAction.mutate({ workspaceId, decisionId, actionId })}
          onUnlink={handleUnlink}
          onChanged={() => void invalidate()}
          unlinkPending={unlink.isPending}
        />
      )}
    </Stack>
  );
}
