"use client";

import {
  Button,
  Avatar,
  Group,
  HoverCard,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { getAvatarColor, getInitial, getColorSeed, getTextColor } from "~/utils/avatarColors";

interface AssigneeSelectorProps {
  selectedAssigneeIds: string[];
  actionId?: string;
  onAssigneeClick: () => void;
}

export function AssigneeSelector({
  selectedAssigneeIds,
  actionId,
  onAssigneeClick,
}: AssigneeSelectorProps) {
  // Get assignable users (all users from teams the current user belongs to)
  const { data: assignableData } = api.action.getAssignableUsers.useQuery(
    { actionId: actionId || "temp" },
    {
      enabled: !!actionId,
    }
  );

  // For creation flow, we need project members - let's use a simplified approach
  // In a real implementation, you might want a separate API for getting project members
  const assignableUsers = assignableData?.assignableUsers || [];
  
  // Filter to get only selected users
  const selectedUsers = assignableUsers.filter(user => 
    selectedAssigneeIds.includes(user.id)
  );

  // If no assignees selected, show "Add assignee" button
  if (selectedAssigneeIds.length === 0) {
    return (
      <Button
        variant="subtle"
        size="sm"
        leftSection={<IconPlus size={14} />}
        onClick={onAssigneeClick}
        className="text-text-secondary hover:text-text-primary"
      >
        Add assignee
      </Button>
    );
  }

  // Show avatars for selected assignees
  return (
    <Group gap="xs" align="center">
      <Avatar.Group spacing="xs">
        {selectedUsers.slice(0, 2).map((user) => {
          const colorSeed = getColorSeed(user.name, user.email);
          const backgroundColor = user.image ? undefined : getAvatarColor(colorSeed);
          const textColor = backgroundColor ? getTextColor(backgroundColor) : 'white';
          const initial = getInitial(user.name, user.email);
          
          return (
            <HoverCard key={user.id} width={200} shadow="md">
              <HoverCard.Target>
                <Avatar
                  size="sm"
                  src={user.image}
                  alt={user.name || user.email || 'User'}
                  radius="xl"
                  className="cursor-pointer"
                  onClick={onAssigneeClick}
                  styles={{
                    root: {
                      backgroundColor: backgroundColor,
                      color: textColor,
                      fontWeight: 600,
                      fontSize: '12px',
                    }
                  }}
                >
                  {!user.image && initial}
                </Avatar>
              </HoverCard.Target>
              <HoverCard.Dropdown>
                <Group gap="sm">
                  <Avatar
                    src={user.image}
                    alt={user.name || user.email || 'User'}
                    radius="xl"
                    styles={{
                      root: {
                        backgroundColor: backgroundColor,
                        color: textColor,
                        fontWeight: 600,
                        fontSize: '14px',
                      }
                    }}
                  >
                    {!user.image && initial}
                  </Avatar>
                  <div>
                    <Text size="sm" fw={500}>
                      {user.name || "Unknown User"}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {user.email}
                    </Text>
                  </div>
                </Group>
              </HoverCard.Dropdown>
            </HoverCard>
          );
        })}
        {selectedUsers.length > 2 && (
          <Tooltip label={`${selectedUsers.length - 2} more assignees`}>
            <Avatar 
              size="sm" 
              radius="xl" 
              className="cursor-pointer"
              color="gray"
              onClick={onAssigneeClick}
              styles={{
                root: {
                  backgroundColor: 'var(--mantine-color-gray-6)',
                  color: 'white',
                  fontWeight: 600,
                  fontSize: '10px',
                }
              }}
            >
              +{selectedUsers.length - 2}
            </Avatar>
          </Tooltip>
        )}
      </Avatar.Group>
      <Button
        variant="subtle"
        size="xs"
        leftSection={<IconPlus size={12} />}
        onClick={onAssigneeClick}
        className="text-text-muted hover:text-text-primary"
      >
        Edit
      </Button>
    </Group>
  );
}