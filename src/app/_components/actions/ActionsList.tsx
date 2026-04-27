"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Accordion,
  ActionIcon,
  Badge,
  Group,
  Text,
} from "@mantine/core";
import { IconChevronRight, IconList } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { useDayRollover } from "~/hooks/useDayRollover";
import type { Action } from "~/lib/actions/types";
import { EditActionModal } from "../EditActionModal";
import { AssignActionModal } from "../AssignActionModal";
import { InboxZeroCelebration } from "../InboxZeroCelebration";
import { EmptyState } from "../EmptyState";
import type { SchedulingSuggestionData } from "../SchedulingSuggestion";
import { ActionRow } from "./components/ActionRow";
import {
  BulkEditToolbar,
  type BulkActionDef,
} from "./components/BulkEditToolbar";
import type { RescheduleChoice } from "./components/ReschedulePopover";
import { useActionMutations } from "./hooks/useActionMutations";
import { useActionPartition } from "./hooks/useActionPartition";
import { useBulkSelection } from "./hooks/useBulkSelection";

interface ActionsListProps {
  viewName: string;
  actions: Action[];
  isLoading?: boolean;
  showProject?: boolean;
  showCheckboxes?: boolean;
  bulkActions?: BulkActionDef[];
  completedSection?: "hidden" | "collapsed" | "expanded";
  schedulingSuggestions?: Map<string, SchedulingSuggestionData>;
  schedulingSuggestionsLoading?: boolean;
  onApplySchedulingSuggestion?: (
    actionId: string,
    suggestedDate: string,
    suggestedTime: string,
  ) => void;
  onDismissSchedulingSuggestion?: (actionId: string) => void;
  deepLinkActionId?: string | null;
  onActionOpen?: (id: string) => void;
  onActionClose?: () => void;
  onTagClick?: (tagId: string) => void;
  workspaceProjects?: Array<{ id: string; name: string }>;
}

export function ActionsList({
  viewName,
  actions,
  isLoading = false,
  bulkActions,
  completedSection = "hidden",
  deepLinkActionId,
  onActionOpen,
  onActionClose,
  workspaceProjects,
}: ActionsListProps) {
  const today = useDayRollover();
  const partition = useActionPartition(actions, { today });

  const { workspaceId } = useWorkspace();
  const { data: workspaceLists } = api.list.list.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId },
  );
  const utils = api.useUtils();
  const addToList = api.list.addAction.useMutation({
    onSettled: async () => {
      await Promise.all([
        utils.action.getAll.invalidate(),
        utils.list.list.invalidate(),
      ]);
    },
  });
  const removeFromList = api.list.removeAction.useMutation({
    onSettled: async () => {
      await Promise.all([
        utils.action.getAll.invalidate(),
        utils.list.list.invalidate(),
      ]);
    },
  });

  const { updateAction } = useActionMutations({ viewName });

  // Modal state
  const [selectedAction, setSelectedAction] = useState<Action | null>(null);
  const [editModalOpened, setEditModalOpened] = useState(false);
  const [assignModalOpened, setAssignModalOpened] = useState(false);
  const [assignSelectedAction, setAssignSelectedAction] = useState<Action | null>(
    null,
  );

  // Bulk-edit mode + selection (single bulk mode for the new shell)
  const [bulkMode, setBulkMode] = useState(false);
  const lower = viewName.toLowerCase();

  // Pick the right partition for the main "active" list
  const activeActions: Action[] = useMemo(() => {
    if (lower === "today") return partition.todays;
    if (lower === "inbox") return partition.inbox;
    if (lower === "upcoming") return partition.upcoming;
    return actions
      .filter(
        (a) =>
          a.status === "ACTIVE" &&
          !partition.overdue.some((o) => o.id === a.id),
      )
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [actions, lower, partition]);

  const selection = useBulkSelection(activeActions);

  // Deep-link fallback: fetch by id if not in current list
  const deepLinkHandled = useRef(false);
  const deepLinkInList = useMemo(
    () => actions.find((a) => a.id === deepLinkActionId) ?? null,
    [actions, deepLinkActionId],
  );
  const { data: deepLinkedAction } = api.action.getById.useQuery(
    { id: deepLinkActionId! },
    {
      enabled:
        !!deepLinkActionId && !deepLinkInList && !deepLinkHandled.current,
    },
  );

  useEffect(() => {
    if (!deepLinkActionId || deepLinkHandled.current) return;
    if (deepLinkInList) {
      setSelectedAction(deepLinkInList);
      setEditModalOpened(true);
      deepLinkHandled.current = true;
      return;
    }
    if (deepLinkedAction) {
      setSelectedAction(deepLinkedAction as unknown as Action);
      setEditModalOpened(true);
      deepLinkHandled.current = true;
    }
  }, [deepLinkActionId, deepLinkInList, deepLinkedAction]);

  useEffect(() => {
    deepLinkHandled.current = false;
  }, [deepLinkActionId]);

  // Row handlers
  const handleOpen = (a: Action) => {
    if (onActionOpen) {
      onActionOpen(a.id);
      return;
    }
    setSelectedAction(a);
    setEditModalOpened(true);
  };

  const handleComplete = (id: string) => {
    const a = actions.find((x) => x.id === id);
    const nextStatus = a?.status === "COMPLETED" ? "ACTIVE" : "COMPLETED";
    updateAction({
      id,
      status: nextStatus,
      ...(a?.projectId
        ? { kanbanStatus: nextStatus === "COMPLETED" ? "DONE" : "TODO" }
        : {}),
    });
  };

  const handleReschedule = (id: string, choice: RescheduleChoice) => {
    const newDate = choice.date ?? null;
    updateAction({ id, scheduledStart: newDate, dueDate: newDate });
  };

  const handleAssign = (a: Action) => {
    setAssignSelectedAction(a);
    setAssignModalOpened(true);
  };

  const handleListToggle = (listId: string, isInList: boolean) => {
    const target = selectedAction ?? assignSelectedAction;
    if (!target) return;
    if (isInList) {
      removeFromList.mutate({ listId, actionId: target.id });
    } else {
      addToList.mutate({ listId, actionId: target.id });
    }
  };

  // Sections
  const showOverdueSection =
    partition.overdue.length > 0 && lower !== "inbox";
  const completedList = partition.completed;
  const showCompleted = completedSection !== "hidden" && completedList.length > 0;

  // Empty states
  if (isLoading) {
    return (
      <Text size="sm" c="dimmed">
        Loading…
      </Text>
    );
  }
  if (actions.length === 0) {
    if (lower === "inbox") return <InboxZeroCelebration />;
    return (
      <EmptyState
        icon={IconList}
        title="No actions"
        message="Nothing here yet."
      />
    );
  }

  const renderRow = (a: Action, isOverdue: boolean) => (
    <ActionRow
      key={a.id}
      action={a}
      isOverdue={isOverdue}
      bulkMode={bulkMode}
      bulkSelected={selection.isSelected(a.id)}
      onBulkToggle={selection.toggle}
      onComplete={handleComplete}
      onReschedule={handleReschedule}
      onOpen={handleOpen}
      onAssign={handleAssign}
      onListToggle={handleListToggle}
      workspaceLists={workspaceLists?.map((l) => ({ id: l.id, name: l.name }))}
    />
  );

  return (
    <div>
      {bulkActions && bulkActions.length > 0 && (
        <Group gap="xs" mb="sm">
          <ActionIcon
            variant={bulkMode ? "filled" : "subtle"}
            onClick={() => setBulkMode((v) => !v)}
            aria-label="Toggle bulk edit"
            title="Bulk edit"
          >
            <IconChevronRight size={14} />
          </ActionIcon>
          <Text size="sm" c="dimmed">
            {bulkMode ? "Exit bulk" : "Bulk edit"}
          </Text>
        </Group>
      )}

      {bulkMode && bulkActions && bulkActions.length > 0 && (
        <BulkEditToolbar
          selection={selection}
          allItems={activeActions}
          actions={bulkActions}
          workspaceProjects={workspaceProjects}
        />
      )}

      {showOverdueSection && (
        <Accordion defaultValue="overdue" radius="md" className="mb-4">
          <Accordion.Item value="overdue">
            <Accordion.Control>
              <Group gap="xs">
                <Text fw={600}>Overdue</Text>
                <Badge color="red" variant="light">
                  {partition.overdue.length}
                </Badge>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              {partition.overdue.map((a) => renderRow(a, true))}
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      )}

      <div>{activeActions.map((a) => renderRow(a, false))}</div>

      {showCompleted && (
        <Accordion
          defaultValue={completedSection === "expanded" ? "completed" : null}
          radius="md"
          className="mt-4"
        >
          <Accordion.Item value="completed">
            <Accordion.Control>
              <Group gap="xs">
                <Text fw={600}>Completed</Text>
                <Badge color="green" variant="light">
                  {completedList.length}
                </Badge>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              {completedList.map((a) => renderRow(a, false))}
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      )}

      <EditActionModal
        action={selectedAction}
        opened={editModalOpened}
        onClose={() => {
          setEditModalOpened(false);
          setSelectedAction(null);
          onActionClose?.();
        }}
      />

      {assignSelectedAction && (
        <AssignActionModal
          opened={assignModalOpened}
          onClose={() => {
            setAssignModalOpened(false);
            setAssignSelectedAction(null);
          }}
          actionId={assignSelectedAction.id}
          actionName={assignSelectedAction.name}
          projectId={assignSelectedAction.projectId ?? null}
          currentAssignees={assignSelectedAction.assignees ?? []}
        />
      )}
    </div>
  );
}
