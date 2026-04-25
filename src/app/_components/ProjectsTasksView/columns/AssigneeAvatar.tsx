import { Avatar, Tooltip, Group } from '@mantine/core';
import { getAvatarColor, getInitial } from '~/utils/avatarColors';

interface User {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

interface Assignee {
  user: User;
}

interface AssigneeAvatarProps {
  assignees: Assignee[] | null | undefined;
  maxDisplay?: number;
}

export function AssigneeAvatar({ assignees, maxDisplay = 2 }: AssigneeAvatarProps) {
  if (!assignees || assignees.length === 0) {
    return <span className="text-text-muted">-</span>;
  }

  const displayAssignees = assignees.slice(0, maxDisplay);
  const remainingCount = assignees.length - maxDisplay;

  return (
    <Group gap={4}>
      {displayAssignees.map((assignee) => (
        <Tooltip
          key={assignee.user.id}
          label={assignee.user.name ?? assignee.user.email ?? 'Unknown'}
          withArrow
        >
          <Avatar
            src={assignee.user.image}
            size="sm"
            radius="xl"
            color={getAvatarColor(assignee.user.id)}
          >
            {getInitial(assignee.user.name ?? assignee.user.email)}
          </Avatar>
        </Tooltip>
      ))}
      {remainingCount > 0 && (
        <Tooltip
          label={assignees
            .slice(maxDisplay)
            .map((a) => a.user.name ?? a.user.email)
            .join(', ')}
          withArrow
        >
          <Avatar size="sm" radius="xl" color="gray">
            +{remainingCount}
          </Avatar>
        </Tooltip>
      )}
    </Group>
  );
}
