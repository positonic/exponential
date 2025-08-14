"use client";

import { useState } from "react";
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
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";
import { getAvatarColor, getInitial, getColorSeed, getTextColor } from "~/utils/avatarColors";

interface AssignTaskModalProps {
  opened: boolean;
  onClose: () => void;
  taskId: string;
  taskName: string;
  projectId?: string | null;
  currentAssignees: Array<{
    user: {
      id: string;
      name: string | null;
      email: string | null;
      image: string | null;
    };
  }>;
}

interface AssignableUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  isAIAgent?: boolean;
}

export function AssignTaskModal({
  opened,
  onClose,
  taskId,
  taskName,
  projectId,
  currentAssignees,
}: AssignTaskModalProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(
    new Set(currentAssignees.map(a => a.user.id))
  );

  // Get assignable users for this task
  const { data: assignableData, isLoading: isLoadingUsers } = api.action.getAssignableUsers.useQuery(
    { actionId: taskId },
    { enabled: opened }
  );

  const utils = api.useUtils();

  // Assign users mutation
  const assignMutation = api.action.assign.useMutation({
    onSuccess: () => {
      // Invalidate relevant queries to refresh the UI
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

  const assignableUsers = assignableData?.assignableUsers || [];

  // Create combined list including AI agents (simulated for now)
  const allUsers: AssignableUser[] = [
    ...assignableUsers,
    // Add some AI agents for demo
    {
      id: "ai-assistant-1",
      name: "AI Assistant",
      email: "ai@company.com",
      image: null,
      isAIAgent: true,
    },
    {
      id: "ai-reviewer-1", 
      name: "AI Code Reviewer",
      email: "reviewer@company.com",
      image: null,
      isAIAgent: true,
    }
  ];

  // Filter users based on search term
  const filteredUsers = allUsers.filter(user =>
    user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
    const currentIds = new Set(currentAssignees.map(a => a.user.id));
    const toAssign = Array.from(selectedUserIds).filter(id => !currentIds.has(id) && !id.startsWith('ai-'));
    const toUnassign = Array.from(currentIds).filter(id => !selectedUserIds.has(id));

    try {
      // Unassign removed users
      if (toUnassign.length > 0) {
        await unassignMutation.mutateAsync({
          actionId: taskId,
          userIds: toUnassign,
        });
      }

      // Assign new users
      if (toAssign.length > 0) {
        await assignMutation.mutateAsync({
          actionId: taskId,
          userIds: toAssign,
        });
      }

      // Handle AI agents separately (for demo purposes)
      const aiAgents = Array.from(selectedUserIds).filter(id => id.startsWith('ai-'));
      if (aiAgents.length > 0) {
        notifications.show({
          title: "AI Assignment",
          message: "AI agent assignments would be handled by the AI system",
          color: "blue",
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
      title="Assign Task"
      size="md"
      centered
    >
      <Stack gap="md">
        <div>
          <Text size="sm" fw={500} mb="xs">
            Task: {taskName}
          </Text>
          {projectId && assignableData?.actionContext && (
            <Text size="xs" c="dimmed">
              {assignableData.actionContext.projectName} • {assignableData.actionContext.teamName}
            </Text>
          )}
        </div>

        <TextInput
          placeholder="Search team members..."
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
            <Stack gap="xs">
              {filteredUsers.map((user) => (
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
                            (user.isAIAgent ? 'var(--mantine-color-blue-6)' : getAvatarColor(getColorSeed(user.name, user.email))) : 
                            undefined,
                          color: !user.image ? 
                            (user.isAIAgent ? 'white' : getTextColor(getAvatarColor(getColorSeed(user.name, user.email)))) : 
                            undefined,
                          fontWeight: !user.image ? 600 : undefined,
                          fontSize: '14px',
                        }
                      }}
                    >
                      {user.isAIAgent ? (
                        <IconRobot size={16} />
                      ) : !user.image ? (
                        getInitial(user.name, user.email)
                      ) : null}
                    </Avatar>
                    <div>
                      <Text size="sm" fw={500}>
                        {user.name || user.email}
                        {user.isAIAgent && (
                          <Badge size="xs" variant="light" color="blue" ml="xs">
                            AI
                          </Badge>
                        )}
                      </Text>
                      {user.name && user.email && (
                        <Text size="xs" c="dimmed">
                          {user.email}
                        </Text>
                      )}
                    </div>
                  </Group>
                  <Checkbox
                    checked={selectedUserIds.has(user.id)}
                    onChange={() => handleUserToggle(user.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </Group>
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