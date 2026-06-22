"use client";

import {
  Modal,
  Select,
  Button,
  Stack,
  Group,
  Avatar,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconDeviceFloppy } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { api } from "~/trpc/react";

type EditableRole = "admin" | "member" | "viewer";

interface EditMemberRoleModalMember {
  userId: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
}

interface EditMemberRoleModalProps {
  workspaceId: string;
  member: EditMemberRoleModalMember | null;
  opened: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin - Can manage members and settings" },
  { value: "member", label: "Member - Can view and edit content" },
  { value: "viewer", label: "Viewer - Read-only access" },
];

function initials(label: string): string {
  return label.trim().charAt(0).toUpperCase() || "?";
}

function toEditableRole(role: string): EditableRole {
  return role === "admin" || role === "viewer" ? role : "member";
}

export function EditMemberRoleModal({
  workspaceId,
  member,
  opened,
  onClose,
  onSuccess,
}: EditMemberRoleModalProps) {
  const [role, setRole] = useState<EditableRole>("member");

  // Sync the select with the member being edited whenever the modal opens.
  useEffect(() => {
    if (member) {
      setRole(toEditableRole(member.role));
    }
  }, [member]);

  const updateRoleMutation = api.workspace.updateMemberRole.useMutation({
    onSuccess: () => {
      notifications.show({
        title: "Role updated",
        message: `${member?.name ?? member?.email ?? "Member"}'s role has been updated.`,
        color: "green",
      });
      onSuccess?.();
      onClose();
    },
    onError: (err) => {
      notifications.show({
        title: "Error",
        message: err.message,
        color: "red",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!member) return;
    updateRoleMutation.mutate({ workspaceId, userId: member.userId, role });
  };

  const unchanged = member ? role === toEditableRole(member.role) : true;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Edit Role"
      classNames={{
        header: "bg-surface-secondary",
        content: "bg-surface-secondary",
      }}
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          {member && (
            <Group gap="sm" wrap="nowrap">
              <Avatar src={member.image} size="md" radius="xl">
                {initials(member.name ?? member.email ?? "?")}
              </Avatar>
              <Stack gap={0} className="min-w-0">
                <Text size="sm" className="truncate text-text-primary">
                  {member.name ?? member.email ?? "Unnamed"}
                </Text>
                {member.name && member.email && (
                  <Text size="xs" className="truncate text-text-muted">
                    {member.email}
                  </Text>
                )}
              </Stack>
            </Group>
          )}

          <Select
            label="Role"
            value={role}
            onChange={(val) => setRole((val as EditableRole) ?? "member")}
            data={ROLE_OPTIONS}
            classNames={{
              input:
                "bg-surface-primary border-border-primary text-text-primary",
              label: "text-text-secondary",
              dropdown: "bg-surface-secondary border-border-primary",
            }}
          />

          <Group justify="flex-end">
            <Button
              variant="subtle"
              onClick={onClose}
              className="text-text-secondary"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={updateRoleMutation.isPending}
              disabled={!member || unchanged}
              leftSection={<IconDeviceFloppy size={16} />}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
