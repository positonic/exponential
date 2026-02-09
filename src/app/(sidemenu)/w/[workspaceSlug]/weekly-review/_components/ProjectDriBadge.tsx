"use client";

import { Badge, Avatar, Tooltip, Select } from "@mantine/core";
import { IconUser } from "@tabler/icons-react";
import { useState } from "react";
import { getAvatarColor, getInitial, getColorSeed } from "~/utils/avatarColors";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";

interface ProjectDriBadgeProps {
  projectId: string;
  dri?: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  } | null;
  onUpdate: (driId: string | null) => void;
}

export function ProjectDriBadge({
  projectId: _projectId,
  dri,
  onUpdate,
}: ProjectDriBadgeProps) {
  const [isEditing, setIsEditing] = useState(false);
  const { workspaceId } = useWorkspace();

  // Get workspace members for DRI selection
  const { data: workspaces } = api.workspace.list.useQuery(undefined, {
    enabled: isEditing,
  });

  const activeWorkspace = workspaces?.find((ws: { id: string }) => ws.id === workspaceId);
  const workspaceMembers = activeWorkspace?.members ?? [];

  const getDriDisplayName = (driParam: typeof dri): string => {
    if (!driParam) return "No DRI";
    return driParam.name ?? driParam.email ?? "Unknown";
  };

  const getDriTooltip = (driParam: typeof dri): string => {
    if (!driParam) return "No DRI assigned - click to assign";
    const name = driParam.name ?? "Unknown";
    const email = driParam.email ?? "";
    return email ? `${name}\n${email}` : name;
  };

  if (isEditing) {
    return (
      <Select
        placeholder="Select DRI"
        data={[
          { value: "", label: "No DRI assigned" },
          ...workspaceMembers.map((member: { user: { id: string; name: string | null; email: string | null } }) => ({
            value: member.user.id,
            label: member.user.name ?? member.user.email ?? "Unknown user",
          })),
        ]}
        value={dri?.id ?? ""}
        onChange={(value) => {
          onUpdate(value === "" ? null : value);
          setIsEditing(false);
        }}
        searchable
        size="xs"
        w={200}
        leftSection={<IconUser size={14} />}
        onBlur={() => setIsEditing(false)}
      />
    );
  }

  const avatarColor = dri
    ? getAvatarColor(getColorSeed(dri.name, dri.email))
    : "gray";
  const avatarInitial = dri ? getInitial(dri.name, dri.email) : "?";
  const displayName = getDriDisplayName(dri);

  return (
    <Tooltip label={getDriTooltip(dri)} withArrow multiline>
      <Badge
        size="lg"
        variant="light"
        color={dri ? "blue" : "gray"}
        className="cursor-pointer"
        onClick={() => setIsEditing(true)}
        leftSection={
          <Avatar
            size="xs"
            radius="xl"
            src={dri?.image}
            alt={displayName}
            style={{ backgroundColor: avatarColor }}
          >
            {avatarInitial}
          </Avatar>
        }
      >
        DRI: {displayName.length > 20 ? `${displayName.slice(0, 20)}...` : displayName}
      </Badge>
    </Tooltip>
  );
}
