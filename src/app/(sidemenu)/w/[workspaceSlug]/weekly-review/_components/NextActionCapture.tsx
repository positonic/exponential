"use client";

import { useState } from "react";
import { TextInput, Button, Group, Text, Stack, Tabs, Badge } from "@mantine/core";
import { IconPlus, IconPlayerPlay } from "@tabler/icons-react";
import { api, type RouterOutputs } from "~/trpc/react";
import { notifications } from "@mantine/notifications";
import { ActionItem, type Action } from "~/app/_components/ActionItem";
import { EditActionModal } from "~/app/_components/EditActionModal";

// Use the full action type from the query for proper EditActionModal support
type ExistingAction = RouterOutputs["project"]["getActiveWithDetails"][0]["actions"][0];

interface CreatedAction {
  id: string;
  name: string;
}

interface NextActionCaptureProps {
  projectId: string;
  workspaceId: string | null;
  existingActions?: ExistingAction[];
  onActionAdded: (newAction: { id: string; name: string; status: string }) => void;
  onActionUpdated?: () => void;
}

// Priority order for determining "next action" (lower index = higher priority)
const PRIORITY_ORDER = [
  "1st Priority",
  "2nd Priority",
  "3rd Priority",
  "4th Priority",
  "5th Priority",
  "Quick",
  "Scheduled",
  "Errand",
  "Remember",
  "Watch",
];

export function NextActionCapture({
  projectId,
  workspaceId,
  existingActions = [],
  onActionAdded,
  onActionUpdated,
}: NextActionCaptureProps) {
  const [actionTitle, setActionTitle] = useState("");
  const [createdActions, setCreatedActions] = useState<CreatedAction[]>([]);
  const [selectedAction, setSelectedAction] = useState<ExistingAction | null>(null);
  const [editModalOpened, setEditModalOpened] = useState(false);

  const utils = api.useUtils();

  // Split actions into open and recently completed (last 7 days)
  const openActions = existingActions.filter(
    (a) => a.status === "ACTIVE" || a.status === "TODO" || a.status === "IN_PROGRESS"
  );

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const completedActions = existingActions.filter(
    (a) => (a.status === "DONE" || a.status === "COMPLETED") &&
           a.completedAt && new Date(a.completedAt) > sevenDaysAgo
  );

  // Determine "next action" IDs - actions with the highest priority
  const nextActionIds = new Set<string>();
  if (openActions.length > 0) {
    // Find the highest priority among open actions
    let highestPriorityIndex = PRIORITY_ORDER.length;
    for (const action of openActions) {
      const priorityIndex = PRIORITY_ORDER.indexOf(action.priority);
      if (priorityIndex !== -1 && priorityIndex < highestPriorityIndex) {
        highestPriorityIndex = priorityIndex;
      }
    }
    // Mark all actions with that priority as "next"
    for (const action of openActions) {
      if (PRIORITY_ORDER.indexOf(action.priority) === highestPriorityIndex) {
        nextActionIds.add(action.id);
      }
    }
  }

  const updateAction = api.action.update.useMutation({
    onSuccess: () => {
      void utils.project.getActiveWithDetails.invalidate();
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message,
        color: "red",
      });
    },
  });

  const createAction = api.action.create.useMutation({
    onSuccess: (data) => {
      setCreatedActions((prev) => [...prev, { id: data.id, name: data.name }]);
      setActionTitle("");
      onActionAdded({ id: data.id, name: data.name, status: "ACTIVE" });
      void utils.project.getActiveWithDetails.invalidate();
      notifications.show({
        title: "Action added",
        message: "Next action has been created",
        color: "green",
      });
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message,
        color: "red",
      });
    },
  });

  const handleSubmit = () => {
    if (!actionTitle.trim()) return;

    createAction.mutate({
      name: actionTitle.trim(),
      projectId,
      workspaceId: workspaceId ?? undefined,
      status: "ACTIVE",
      priority: "1st Priority",
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleActionClick = (action: Action) => {
    setSelectedAction(action as ExistingAction);
    setEditModalOpened(true);
  };

  const handleCheckboxChange = (actionId: string, checked: boolean) => {
    const action = existingActions.find(a => a.id === actionId);
    const newStatus = checked ? "COMPLETED" : "ACTIVE";

    const updatePayload: any = {
      id: actionId,
      status: newStatus,
    };

    // If action is in a project and we're completing it, update kanban status to DONE
    if (action?.projectId && checked) {
      updatePayload.kanbanStatus = "DONE";
    } else if (action?.projectId && !checked) {
      updatePayload.kanbanStatus = "TODO";
    }

    updateAction.mutate(updatePayload);
  };

  return (
    <>
      <Stack gap="md">
        {/* Actions Section with Tabs */}
        {existingActions.length > 0 && (
          <div>
            <Text size="sm" fw={500} className="mb-2 text-text-secondary">
              Actions
            </Text>
            <Tabs defaultValue="open" variant="outline">
              <Tabs.List>
                <Tabs.Tab value="open">
                  Open ({openActions.length + createdActions.length})
                </Tabs.Tab>
                <Tabs.Tab value="completed">
                  Completed ({completedActions.length})
                </Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="open" pt="xs">
                {openActions.length === 0 && createdActions.length === 0 ? (
                  <Text size="sm" c="dimmed" className="py-2">
                    No open actions
                  </Text>
                ) : (
                  <>
                    {openActions.map((action) => (
                      <ActionItem
                        key={action.id}
                        action={action as Action}
                        onClick={handleActionClick}
                        onCheckboxChange={handleCheckboxChange}
                        showCheckbox={true}
                        showAssignees={false}
                        showCreator={false}
                        showSyncStatus={false}
                        disabled={updateAction.isPending}
                        rightSlot={nextActionIds.has(action.id) ? (
                          <Badge
                            size="sm"
                            variant="light"
                            color="blue"
                            leftSection={<IconPlayerPlay size={10} />}
                          >
                            Next
                          </Badge>
                        ) : undefined}
                      />
                    ))}
                    {/* Newly created actions (shown with green styling) */}
                    {createdActions.map((action) => (
                      <div
                        key={action.id}
                        className="py-2 px-1 border-b border-border-primary"
                      >
                        <Group gap="xs">
                          <Text size="sm" className="text-green-500">
                            {action.name}
                          </Text>
                          <Text size="xs" className="text-green-500/70">
                            (just added)
                          </Text>
                        </Group>
                      </div>
                    ))}
                  </>
                )}
              </Tabs.Panel>

              <Tabs.Panel value="completed" pt="xs">
                {completedActions.length === 0 ? (
                  <Text size="sm" c="dimmed" className="py-2">
                    No completed actions
                  </Text>
                ) : (
                  completedActions.map((action) => (
                    <ActionItem
                      key={action.id}
                      action={action as Action}
                      onClick={handleActionClick}
                      onCheckboxChange={handleCheckboxChange}
                      showCheckbox={true}
                      showAssignees={false}
                      showCreator={false}
                      showSyncStatus={false}
                      disabled={updateAction.isPending}
                    />
                  ))
                )}
              </Tabs.Panel>
            </Tabs>
          </div>
        )}

        {/* Add Action Input */}
        <div>
          <Text size="sm" fw={500} className="mb-2 text-text-secondary">
            Add Action
          </Text>
          <Group gap="sm">
            <TextInput
              placeholder="What's the next step for this project?"
              value={actionTitle}
              onChange={(e) => setActionTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{ flex: 1 }}
            />
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={handleSubmit}
              loading={createAction.isPending}
              disabled={!actionTitle.trim()}
            >
              Add
            </Button>
          </Group>
        </div>
      </Stack>

      <EditActionModal
        action={selectedAction as any}
        opened={editModalOpened}
        onClose={() => {
          setEditModalOpened(false);
          setSelectedAction(null);
        }}
        onSuccess={() => {
          void utils.project.getActiveWithDetails.invalidate();
          onActionUpdated?.();
        }}
      />
    </>
  );
}
