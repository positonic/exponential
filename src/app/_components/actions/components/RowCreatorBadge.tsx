import { Avatar, Badge, Group, HoverCard, Text } from "@mantine/core";
import { IconUserShare } from "@tabler/icons-react";
import {
  getAvatarColor,
  getColorSeed,
  getInitial,
  getTextColor,
} from "~/utils/avatarColors";
import type { Action } from "~/lib/actions/types";

interface RowCreatorBadgeProps {
  createdBy: Action["createdBy"] | undefined;
  createdById: string | null | undefined;
  currentUserId: string | undefined;
}

export function RowCreatorBadge({
  createdBy,
  createdById,
  currentUserId,
}: RowCreatorBadgeProps) {
  if (!currentUserId || createdById === currentUserId || !createdBy) {
    return null;
  }

  const seed = getColorSeed(createdBy.name, createdBy.email);
  const bg = createdBy.image ? undefined : getAvatarColor(seed);
  const fg = createdBy.image ? undefined : getTextColor(getAvatarColor(seed));

  return (
    <HoverCard width={200} shadow="md">
      <HoverCard.Target>
        <Badge
          size="sm"
          variant="light"
          color="blue"
          leftSection={<IconUserShare size={12} />}
          className="cursor-pointer"
        >
          From {createdBy.name?.split(" ")[0] ?? "Unknown"}
        </Badge>
      </HoverCard.Target>
      <HoverCard.Dropdown>
        <Group gap="sm">
          <Avatar
            src={createdBy.image}
            alt={createdBy.name ?? "User"}
            radius="xl"
            size="md"
            styles={{
              root: {
                backgroundColor: bg,
                color: fg,
                fontWeight: 600,
              },
            }}
          >
            {!createdBy.image && getInitial(createdBy.name, createdBy.email)}
          </Avatar>
          <div>
            <Text size="sm" fw={500}>
              {createdBy.name ?? "Unknown User"}
            </Text>
            <Text size="xs" c="dimmed">
              Assigned this to you
            </Text>
          </div>
        </Group>
      </HoverCard.Dropdown>
    </HoverCard>
  );
}
