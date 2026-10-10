"use client";

import { useEffect, useState } from "react";
import {
  Modal,
  Text,
  Button,
  Stack,
  Group,
  Avatar,
  Checkbox,
  ScrollArea,
  Badge,
  Loader,
  TextInput
} from "@mantine/core";
import { IconSearch, IconRobot } from "@tabler/icons-react";
import { useSession } from "next-auth/react";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";
import { getAvatarColor, getInitial, getColorSeed, getTextColor } from "~/utils/avatarColors";
import { HTMLContent } from "./HTMLContent";

interface AssignActionModalProps {
  opened: boolean;
  onClose: () => void;
  // Required for edit mode; omit for create-mode (action not yet persisted).
  actionId?: string;
  actionName: string;
  projectId?: string | null;
  workspaceId?: string | null;
  currentAssignees: Array<{
    user: {
      id: string;
      name: string | null;
      email: string | null;
      image: string | null;
    };
  }>;
  // Create-mode: instead of calling the assign mutation, return the chosen
  // user IDs to the parent so they can be assigned after the action is created.
  onSelectionChange?: (userIds: string[]) => void;
}

interface AssignableUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  /** Real agent principal (ADR-0049 / ADR-0067) — the shadow user of an External agent. */
  isAgent: boolean;
  /** Set when the agent is someone's Assistant: whose. */
  assistantOwner: { id: string; name: string | null; emoji: string | null } | null;
}

/** "your assistant" / "Andi's assistant" / "External agent" — the picker's second line for an agent row. */
function agentSubtitle(user: AssignableUser, viewerId: string | undefined): string {
  if (!user.assistantOwner) return "External agent";
  if (viewerId && user.assistantOwner.id === viewerId) return "your assistant";
  const owner = user.assistantOwner.name?.trim();
  return owner ? `${owner}'s assistant` : "a teammate's assistant";
}

/**
 * The roster in picker order (ADR-0067): your own Assistant pinned first, then
 * teammates' Assistants (and any other agents) labelled by owner, then people.
 * One roster from the server, three groups here — membership is already real,
 * so nothing is filtered, only arranged.
 */
function groupAssignableUsers(users: AssignableUser[], viewerId: string | undefined) {
  const own: AssignableUser[] = [];
  const agents: AssignableUser[] = [];
  const people: AssignableUser[] = [];
  for (const user of users) {
    if (!user.isAgent) people.push(user);
    else if (viewerId && user.assistantOwner?.id === viewerId) own.push(user);
    else agents.push(user);
  }
  return [
    { key: "own", label: "Your assistant", users: own },
    { key: "agents", label: "Assistants", users: agents },
    { key: "people", label: "People", users: people },
  ].filter((group) => group.users.length > 0);
}

export function AssignActionModal({
  opened,
  onClose,
  actionId,
  actionName,
  projectId,
  workspaceId,
  currentAssignees,
  onSelectionChange,
}: AssignActionModalProps) {
  const isCreateMode = !actionId;
  const { data: session } = useSession();
  const viewerId = session?.user?.id;
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(
    new Set(currentAssignees.map(a => a.user.id))
  );

  // Re-sync selection from incoming assignees each time the modal opens so
  // reopening reflects the latest parent state (especially in create-mode).
  useEffect(() => {
    if (opened) {
      setSelectedUserIds(new Set(currentAssignees.map(a => a.user.id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  // Edit mode: fetch via existing actionId-scoped query.
  const { data: editAssignableData, isLoading: isLoadingEditUsers } =
    api.action.getAssignableUsers.useQuery(
      { actionId: actionId ?? "" },
      { enabled: opened && !isCreateMode }
    );

  // Create mode: fetch via project/workspace context.
  const { data: createAssignableData, isLoading: isLoadingCreateUsers } =
    api.action.getAssignableUsersForContext.useQuery(
      {
        projectId: projectId ?? undefined,
        workspaceId: workspaceId ?? undefined,
      },
      { enabled: opened && isCreateMode && (!!projectId || !!workspaceId) }
    );

  const assignableData = isCreateMode ? createAssignableData : editAssignableData;
  const isLoadingUsers = isCreateMode ? isLoadingCreateUsers : isLoadingEditUsers;

  const utils = api.useUtils();

  // Assign users mutation
  const assignMutation = api.action.assign.useMutation({
    onSuccess: () => {
      // Invalidate relevant queries to refresh the UI
      if (actionId) {
        void utils.action.getById.invalidate({ id: actionId });
        // Assigning an Assistant starts an Agent run (ADR-0067).
        void utils.agentRun.listForAction.invalidate({ actionId });
      }
      void utils.action.getAll.invalidate();
      void utils.action.getProjectActions.invalidate();
      void utils.action.getKanbanActions.invalidate();
      void utils.action.getToday.invalidate();
      
      notifications.show({
        title: "Assignment Updated",
        message: "Task assignments have been updated successfully",
        color: "green",
      });
      onClose();
    },
    onError: (error) => {
      notifications.show({
        title: "Assignment Failed",
        message: error.message || "Failed to update task assignments",
        color: "red",
      });
    },
  });

  // Unassign users mutation
  const unassignMutation = api.action.unassign.useMutation({
    onSuccess: () => {
      // Invalidate relevant queries to refresh the UI
      if (actionId) {
        void utils.action.getById.invalidate({ id: actionId });
        void utils.agentRun.listForAction.invalidate({ actionId });
      }
      void utils.action.getAll.invalidate();
      void utils.action.getProjectActions.invalidate();
      void utils.action.getKanbanActions.invalidate();
      void utils.action.getToday.invalidate();
      
      notifications.show({
        title: "Assignment Updated",
        message: "Task assignments have been updated successfully",
        color: "green",
      });
    },
    onError: (error) => {
      notifications.show({
        title: "Unassign Failed",
        message: error.message || "Failed to unassign users from task",
        color: "red",
      });
    },
  });

  const assignableUsers: AssignableUser[] = assignableData?.assignableUsers ?? [];

  // Filter users based on search term (an Assistant also matches its owner's name)
  const needle = searchTerm.toLowerCase();
  const filteredUsers = assignableUsers.filter(user =>
    user.name?.toLowerCase().includes(needle) ||
    user.email?.toLowerCase().includes(needle) ||
    user.assistantOwner?.name?.toLowerCase().includes(needle)
  );
  const groups = groupAssignableUsers(filteredUsers, viewerId);

  const handleUserToggle = (userId: string) => {
    const newSelected = new Set(selectedUserIds);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUserIds(newSelected);
  };

  const handleSave = async () => {
    // Create mode: bubble selection to parent; assignment happens after the
    // action is persisted by the parent's create mutation.
    if (isCreateMode) {
      onSelectionChange?.(Array.from(selectedUserIds));
      onClose();
      return;
    }

    const currentIds = new Set(currentAssignees.map(a => a.user.id));
    const toAssign = Array.from(selectedUserIds).filter(id => !currentIds.has(id));
    const toUnassign = Array.from(currentIds).filter(id => !selectedUserIds.has(id));

    try {
      // Unassign removed users
      if (toUnassign.length > 0) {
        await unassignMutation.mutateAsync({
          actionId,
          userIds: toUnassign,
        });
      }

      // Assign new users
      if (toAssign.length > 0) {
        await assignMutation.mutateAsync({
          actionId,
          userIds: toAssign,
        });
      }

    } catch {
      // Error handled by individual mutations
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Assign Action"
      size="md"
      centered
    >
      <Stack gap="md">
        <div className="pt-2">
          <Text size="sm" fw={500} mb="xs">
            Action: <HTMLContent html={actionName} className="inline" />
          </Text>
          {projectId && assignableData?.actionContext && (
            <Text size="xs" c="dimmed">
              {assignableData.actionContext.projectName} • {assignableData.actionContext.teamName}
            </Text>
          )}
        </div>

        <TextInput
          placeholder="Search people and assistants..."
          leftSection={<IconSearch size={16} />}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.currentTarget.value)}
        />

        <ScrollArea h={300}>
          {isLoadingUsers ? (
            <Group justify="center" p="xl">
              <Loader size="sm" />
            </Group>
          ) : (
            <Stack gap="xs" data-testid="assign-roster">
              {groups.map((group) => (
                <Stack key={group.key} gap={4} data-testid={`assign-group-${group.key}`}>
                  <Text size="xs" fw={600} tt="uppercase" className="text-text-muted" px="sm" pt="xs">
                    {group.label}
                  </Text>
                  {group.users.map((user) => (

                    <Group
                      key={user.id}
                      justify="space-between"
                      p="sm"
                      className="hover:bg-surface-hover rounded-md cursor-pointer"
                      onClick={() => handleUserToggle(user.id)}
                    >
                      <Group gap="sm">
                        <Avatar
                          size="md"
                          src={user.image}
                          radius="xl"
                          styles={{
                            root: {
                              backgroundColor: !user.image ? 
                                (user.isAgent ? 'var(--color-brand-primary)' : getAvatarColor(getColorSeed(user.name, user.email))) : 
                                undefined,
                              color: !user.image ? 
                                (user.isAgent ? 'var(--color-text-inverse)' : getTextColor(getAvatarColor(getColorSeed(user.name, user.email)))) : 
                                undefined,
                              fontWeight: !user.image ? 600 : undefined,
                              fontSize: '14px',
                            }
                          }}
                        >
                          {user.isAgent && !user.image ? (
                            user.assistantOwner?.emoji ? (
                              <span aria-hidden>{user.assistantOwner.emoji}</span>
                            ) : (
                              <IconRobot size={16} />
                            )
                          ) : !user.image ? (
                            getInitial(user.name, user.email)
                          ) : null}
                        </Avatar>
                        <div>
                          <Text size="sm" fw={500}>
                            {user.name || user.email}
                            {user.isAgent && (
                              <Badge size="xs" variant="light" color="blue" ml="xs">
                                {user.assistantOwner ? "Assistant" : "Agent"}
                              </Badge>
                            )}
                          </Text>
                          {user.isAgent ? (
                            <Text size="xs" c="dimmed">
                              {agentSubtitle(user, viewerId)}
                            </Text>
                          ) : user.name && user.email ? (
                            <Text size="xs" c="dimmed">
                              {user.email}
                            </Text>
                          ) : null}
                        </div>
                      </Group>
                      <Checkbox
                        checked={selectedUserIds.has(user.id)}
                        onChange={() => handleUserToggle(user.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </Group>
                  ))}
                  {group.key === "own" && (
                    <Text size="xs" className="text-text-muted" px="sm" pb="xs">
                      Assigning an action to your assistant hands it the work: it researches, delegates, or does it inside Exponential and asks you when stuck.
                    </Text>
                  )}
                </Stack>
              ))}

              {filteredUsers.length === 0 && (
                <Text c="dimmed" ta="center" py="xl">
                  No users found matching &quot;{searchTerm}&quot;
                </Text>
              )}
            </Stack>
          )}
        </ScrollArea>

        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave}
            loading={assignMutation.isPending || unassignMutation.isPending}
          >
            Save Changes
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}