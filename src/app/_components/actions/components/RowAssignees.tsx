import { Avatar, Group, HoverCard, Text, Tooltip } from "@mantine/core";
import {
  getAvatarColor,
  getColorSeed,
  getInitial,
  getTextColor,
} from "~/utils/avatarColors";
import type { Action } from "~/lib/actions/types";

interface RowAssigneesProps {
  assignees: Action["assignees"] | undefined;
}

export function RowAssignees({ assignees }: RowAssigneesProps) {
  if (!assignees || assignees.length === 0) return null;

  return (
    <Avatar.Group spacing="xs">
      {assignees.slice(0, 2).map((assignee) => {
        const colorSeed = getColorSeed(assignee.user.name, assignee.user.email);
        const backgroundColor = assignee.user.image ? undefined : getAvatarColor(colorSeed);
        const textColor = backgroundColor ? getTextColor(backgroundColor) : "white";
        const initial = getInitial(assignee.user.name, assignee.user.email);

        return (
          <HoverCard key={assignee.user.id} width={200} shadow="md">
            <HoverCard.Target>
              <Avatar
                size="sm"
                src={assignee.user.image}
                alt={assignee.user.name ?? assignee.user.email ?? "User"}
                radius="xl"
                className="cursor-pointer"
                styles={{
                  root: {
                    backgroundColor,
                    color: textColor,
                    fontWeight: 600,
                    fontSize: "12px",
                  },
                }}
              >
                {!assignee.user.image && initial}
              </Avatar>
            </HoverCard.Target>
            <HoverCard.Dropdown>
              <Group gap="sm">
                <Avatar
                  src={assignee.user.image}
                  alt={assignee.user.name ?? assignee.user.email ?? "User"}
                  radius="xl"
                  styles={{
                    root: {
                      backgroundColor,
                      color: textColor,
                      fontWeight: 600,
                      fontSize: "14px",
                    },
                  }}
                >
                  {!assignee.user.image && initial}
                </Avatar>
                <div>
                  <Text size="sm" fw={500}>
                    {assignee.user.name ?? "Unknown User"}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {assignee.user.email}
                  </Text>
                </div>
              </Group>
            </HoverCard.Dropdown>
          </HoverCard>
        );
      })}
      {assignees.length > 2 && (
        <Tooltip label={`${assignees.length - 2} more assignees`}>
          <Avatar
            size="sm"
            radius="xl"
            className="cursor-pointer"
            color="gray"
            styles={{
              root: {
                backgroundColor: "var(--mantine-color-gray-6)",
                color: "white",
                fontWeight: 600,
                fontSize: "10px",
              },
            }}
          >
            +{assignees.length - 2}
          </Avatar>
        </Tooltip>
      )}
    </Avatar.Group>
  );
}
