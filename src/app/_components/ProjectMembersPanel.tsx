"use client";

import {
  Alert,
  Avatar,
  Button,
  Center,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconCrown,
  IconLock,
  IconSearch,
  IconUserMinus,
  IconUserPlus,
} from "@tabler/icons-react";
import { useState } from "react";
import { api } from "~/trpc/react";

type Role = "admin" | "editor" | "viewer";

const ROLE_OPTIONS: { value: Role; label: string; hint: string }[] = [
  { value: "admin", label: "Admin", hint: "Full control + manage members" },
  { value: "editor", label: "Editor", hint: "Edit project & actions" },
  { value: "viewer", label: "Viewer", hint: "Read-only access" },
];

interface ProjectMembersPanelProps {
  projectId: string;
}

export function ProjectMembersPanel({ projectId }: ProjectMembersPanelProps) {
  const utils = api.useUtils();

  const accessQuery = api.project.getMyAccess.useQuery({ projectId });
  const projectQuery = api.project.getById.useQuery({ id: projectId });
  const membersQuery = api.project.listMembers.useQuery({ projectId });

  const canManage = accessQuery.data?.canManageMembers ?? false;
  const creator = projectQuery.data?.createdBy ?? null;

  const invalidate = () => {
    void utils.project.listMembers.invalidate({ projectId });
    void utils.project.getMyAccess.invalidate({ projectId });
  };

  const addMember = api.project.addMember.useMutation({
    onSuccess: () => {
      invalidate();
      notifications.show({
        title: "Member added",
        message: "The member now has access to this project.",
        color: "green",
      });
    },
    onError: (err) => {
      notifications.show({
        title: "Could not add member",
        message: err.message,
        color: "red",
      });
    },
  });

  const removeMember = api.project.removeMember.useMutation({
    onSuccess: () => {
      invalidate();
      notifications.show({
        title: "Member removed",
        message: "The member no longer has project-level access.",
        color: "gray",
      });
    },
    onError: (err) => {
      notifications.show({
        title: "Could not remove member",
        message: err.message,
        color: "red",
      });
    },
  });

  const updateRole = api.project.updateMemberRole.useMutation({
    onSuccess: () => invalidate(),
    onError: (err) => {
      notifications.show({
        title: "Could not update role",
        message: err.message,
        color: "red",
      });
    },
  });

  if (membersQuery.isLoading || accessQuery.isLoading || projectQuery.isLoading) {
    return (
      <Center py="lg">
        <Loader size="sm" />
      </Center>
    );
  }

  const members = membersQuery.data ?? [];

  return (
    <Stack gap="md">
      {!canManage && (
        <Alert
          icon={<IconLock size={16} />}
          color="gray"
          variant="light"
          className="border-border-primary"
        >
          <Text size="sm" className="text-text-secondary">
            You are viewing the member list. Only the project creator, project
            admins, and workspace owners/admins can change membership.
          </Text>
        </Alert>
      )}

      {/* Synthetic creator row — creators are not stored in ProjectMember and
          cannot be removed. */}
      {creator && (
        <Paper p="sm" withBorder radius="md" className="border-border-primary bg-surface-secondary">
          <Group justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
              <Avatar src={creator.image} radius="xl" size="md">
                {creator.name?.charAt(0)?.toUpperCase() ??
                  creator.email?.charAt(0)?.toUpperCase() ??
                  "?"}
              </Avatar>
              <Stack gap={0}>
                <Group gap="xs">
                  <Text fw={600} className="text-text-primary">
                    {creator.name ?? creator.email ?? "Unnamed"}
                  </Text>
                  <Tooltip label="Project creator">
                    <IconCrown size={14} className="text-brand-primary" />
                  </Tooltip>
                </Group>
                <Text size="xs" className="text-text-muted">
                  {creator.email}
                </Text>
              </Stack>
            </Group>
            <Text size="sm" className="text-text-muted">
              Owner
            </Text>
          </Group>
        </Paper>
      )}

      {/* Existing members */}
      <Stack gap="xs">
        {members.length === 0 && (
          <Text size="sm" className="text-text-muted">
            No project members yet.
          </Text>
        )}
        {members.map((member) => {
          const displayName = member.user.name ?? member.user.email ?? "Unnamed";
          const isCreatorRow = creator?.id === member.user.id;
          return (
            <Paper
              key={member.id}
              p="sm"
              withBorder
              radius="md"
              className="border-border-primary bg-surface-primary"
            >
              <Group justify="space-between" wrap="nowrap">
                <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                  <Avatar src={member.user.image} radius="xl" size="md">
                    {displayName.charAt(0)?.toUpperCase() ?? "?"}
                  </Avatar>
                  <Stack gap={0} style={{ minWidth: 0 }}>
                    <Text fw={500} className="text-text-primary" truncate>
                      {displayName}
                    </Text>
                    <Text size="xs" className="text-text-muted" truncate>
                      {member.user.email}
                    </Text>
                  </Stack>
                </Group>

                <Group gap="xs" wrap="nowrap">
                  <Select
                    size="xs"
                    value={member.role as Role}
                    data={ROLE_OPTIONS.map((opt) => ({
                      value: opt.value,
                      label: opt.label,
                    }))}
                    disabled={!canManage || updateRole.isPending}
                    onChange={(value) => {
                      if (!value || value === member.role) return;
                      updateRole.mutate({
                        projectId,
                        userId: member.user.id,
                        role: value as Role,
                      });
                    }}
                    classNames={{
                      input:
                        "bg-surface-secondary border-border-primary text-text-primary",
                      dropdown: "bg-surface-secondary border-border-primary",
                    }}
                    style={{ width: 110 }}
                  />
                  <Tooltip
                    label={
                      isCreatorRow
                        ? "The creator is shown as a synthetic Owner row and cannot be removed"
                        : "Remove from project"
                    }
                  >
                    <span>
                      <Button
                        size="xs"
                        variant="subtle"
                        color="red"
                        disabled={!canManage || isCreatorRow}
                        loading={
                          removeMember.isPending &&
                          removeMember.variables?.userId === member.user.id
                        }
                        onClick={() =>
                          removeMember.mutate({
                            projectId,
                            userId: member.user.id,
                          })
                        }
                        leftSection={<IconUserMinus size={14} />}
                      >
                        Remove
                      </Button>
                    </span>
                  </Tooltip>
                </Group>
              </Group>
            </Paper>
          );
        })}
      </Stack>

      {/* Add member */}
      {canManage && (
        <AddMemberSection
          projectId={projectId}
          existingUserIds={new Set([
            ...(creator ? [creator.id] : []),
            ...members.map((m) => m.user.id),
          ])}
          onAdd={(userId, role) =>
            addMember.mutate({ projectId, userId, role })
          }
          isPending={addMember.isPending}
        />
      )}
    </Stack>
  );
}

interface AddMemberSectionProps {
  projectId: string;
  existingUserIds: Set<string>;
  onAdd: (userId: string, role: Role) => void;
  isPending: boolean;
}

function AddMemberSection({
  existingUserIds,
  onAdd,
  isPending,
}: AddMemberSectionProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery] = useDebouncedValue(query, 300);
  const [role, setRole] = useState<Role>("editor");

  const { data: results, isLoading: isSearching } =
    api.user.searchByEmail.useQuery(
      { query: debouncedQuery, limit: 5 },
      { enabled: debouncedQuery.length >= 2 },
    );

  const filteredResults = (results ?? []).filter(
    (user) => !existingUserIds.has(user.id),
  );

  return (
    <Paper p="md" withBorder radius="md" className="border-border-primary bg-surface-secondary">
      <Stack gap="sm">
        <Text size="sm" fw={600} className="text-text-primary">
          Add a member
        </Text>
        <Group gap="xs" align="flex-end" wrap="nowrap">
          <TextInput
            placeholder="Search by name or email…"
            leftSection={<IconSearch size={14} />}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            classNames={{
              input:
                "bg-surface-primary border-border-primary text-text-primary",
            }}
            style={{ flex: 1 }}
          />
          <Select
            size="sm"
            value={role}
            onChange={(value) => {
              if (value) setRole(value as Role);
            }}
            data={ROLE_OPTIONS.map((opt) => ({
              value: opt.value,
              label: opt.label,
            }))}
            classNames={{
              input:
                "bg-surface-primary border-border-primary text-text-primary",
              dropdown: "bg-surface-secondary border-border-primary",
            }}
            style={{ width: 130 }}
          />
        </Group>

        {isSearching && (
          <Center py="sm">
            <Loader size="xs" />
          </Center>
        )}

        {debouncedQuery.length >= 2 && !isSearching && filteredResults.length === 0 && (
          <Text size="xs" className="text-text-muted">
            No matching users found, or all matches are already members.
          </Text>
        )}

        {filteredResults.length > 0 && (
          <Stack gap="xs">
            {filteredResults.map((user) => (
              <Paper
                key={user.id}
                p="sm"
                withBorder
                radius="sm"
                className="border-border-primary bg-surface-primary"
              >
                <Group justify="space-between" wrap="nowrap">
                  <Group gap="sm" wrap="nowrap">
                    <Avatar src={user.image} radius="xl" size="sm">
                      {user.name?.charAt(0)?.toUpperCase() ??
                        user.email?.charAt(0)?.toUpperCase() ??
                        "?"}
                    </Avatar>
                    <Stack gap={0}>
                      <Text size="sm" fw={500} className="text-text-primary">
                        {user.name ?? "Unnamed"}
                      </Text>
                      <Text size="xs" className="text-text-muted">
                        {user.email}
                      </Text>
                    </Stack>
                  </Group>
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconUserPlus size={14} />}
                    loading={isPending}
                    onClick={() => {
                      onAdd(user.id, role);
                      setQuery("");
                    }}
                  >
                    Add as {role}
                  </Button>
                </Group>
              </Paper>
            ))}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
