"use client";

import {
  Modal,
  TextInput,
  Select,
  Button,
  Stack,
  Alert,
  Text,
  Group,
  CopyButton,
  ActionIcon,
  Tooltip,
  SegmentedControl,
  Paper,
  Avatar,
  Loader,
  Center,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import {
  IconCheck,
  IconCopy,
  IconMail,
  IconSearch,
  IconUserPlus,
} from "@tabler/icons-react";
import { useState } from "react";
import { api } from "~/trpc/react";

interface AddTeamMemberModalProps {
  teamId: string;
  opened: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type InviteResult =
  | { type: "member_added"; memberName: string }
  | { type: "invitation_created"; inviteUrl: string; email: string };

export function AddTeamMemberModal({
  teamId,
  opened,
  onClose,
  onSuccess,
}: AddTeamMemberModalProps) {
  const [mode, setMode] = useState<"search" | "invite">("search");
  const [result, setResult] = useState<InviteResult | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch] = useDebouncedValue(searchQuery, 300);
  const [selectedRole, setSelectedRole] = useState<"member" | "admin">(
    "member"
  );

  const inviteForm = useForm({
    initialValues: {
      email: "",
    },
    validate: {
      email: (value) =>
        /^\S+@\S+$/.test(value) ? null : "Invalid email address",
    },
  });

  const utils = api.useUtils();

  const { data: searchResults, isLoading: isSearching } =
    api.user.searchByEmail.useQuery(
      { query: debouncedSearch, excludeTeamId: teamId },
      { enabled: debouncedSearch.length >= 2 && mode === "search" }
    );

  const addMemberMutation = api.team.addMember.useMutation({
    onSuccess: (data) => {
      if (data.type === "member_added") {
        setResult({
          type: "member_added",
          memberName:
            data.member.user.name ?? data.member.user.email ?? "User",
        });
        notifications.show({
          title: "Member added",
          message: `${data.member.user.name ?? data.member.user.email} has been added to the team`,
          color: "green",
        });
      } else {
        setResult({
          type: "invitation_created",
          inviteUrl: data.inviteUrl,
          email: data.invitation.email,
        });
        notifications.show({
          title: "Invitation created",
          message: `An invitation has been created for ${data.invitation.email}`,
          color: "blue",
        });
      }
      void utils.team.getBySlug.invalidate();
      void utils.team.listInvitations.invalidate();
      onSuccess?.();
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message,
        color: "red",
      });
    },
  });

  const handleAddUser = (email: string) => {
    addMemberMutation.mutate({
      teamId,
      email,
      role: selectedRole,
    });
  };

  const handleInviteSubmit = inviteForm.onSubmit((values) => {
    addMemberMutation.mutate({
      teamId,
      email: values.email,
      role: selectedRole,
    });
  });

  const handleClose = () => {
    inviteForm.reset();
    setResult(null);
    setSearchQuery("");
    setSelectedRole("member");
    onClose();
  };

  const handleReset = () => {
    inviteForm.reset();
    setResult(null);
    setSearchQuery("");
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Add Team Member"
      size="lg"
      classNames={{
        header: "bg-surface-secondary",
        content: "bg-surface-secondary",
      }}
    >
      {result ? (
        <Stack gap="md">
          {result.type === "member_added" ? (
            <>
              <Alert color="green" icon={<IconCheck size={16} />}>
                <Text className="text-text-primary">
                  <strong>{result.memberName}</strong> has been added to the
                  team.
                </Text>
              </Alert>
              <Group justify="flex-end">
                <Button
                  variant="subtle"
                  onClick={handleReset}
                  className="text-text-secondary"
                >
                  Add Another
                </Button>
                <Button onClick={handleClose}>Done</Button>
              </Group>
            </>
          ) : (
            <>
              <Alert color="blue" icon={<IconMail size={16} />}>
                <Text className="text-text-primary">
                  An invitation has been created for{" "}
                  <strong>{result.email}</strong>. Share this link with them:
                </Text>
              </Alert>

              <Group gap="xs" className="rounded bg-surface-primary p-3">
                <Text
                  size="sm"
                  className="flex-1 break-all font-mono text-text-secondary"
                >
                  {result.inviteUrl}
                </Text>
                <CopyButton value={result.inviteUrl}>
                  {({ copied, copy }) => (
                    <Tooltip label={copied ? "Copied!" : "Copy link"}>
                      <ActionIcon
                        color={copied ? "green" : "gray"}
                        onClick={copy}
                        variant="subtle"
                      >
                        {copied ? (
                          <IconCheck size={16} />
                        ) : (
                          <IconCopy size={16} />
                        )}
                      </ActionIcon>
                    </Tooltip>
                  )}
                </CopyButton>
              </Group>

              <Text size="xs" className="text-text-muted">
                This invitation expires in 7 days. The invitee will need to sign
                up or log in with this email address to accept.
              </Text>

              <Group justify="flex-end">
                <Button
                  variant="subtle"
                  onClick={handleReset}
                  className="text-text-secondary"
                >
                  Invite Another
                </Button>
                <Button onClick={handleClose}>Done</Button>
              </Group>
            </>
          )}
        </Stack>
      ) : (
        <Stack gap="lg">
          <SegmentedControl
            value={mode}
            onChange={(val) => setMode(val as "search" | "invite")}
            data={[
              { label: "Add Existing User", value: "search" },
              { label: "Invite by Email", value: "invite" },
            ]}
            fullWidth
          />

          <Select
            label="Role"
            value={selectedRole}
            onChange={(val) =>
              setSelectedRole((val as "member" | "admin") ?? "member")
            }
            data={[
              {
                value: "member",
                label: "Member - Can view and collaborate",
              },
              {
                value: "admin",
                label: "Admin - Can manage members and settings",
              },
            ]}
            classNames={{
              input:
                "bg-surface-primary border-border-primary text-text-primary",
              label: "text-text-secondary",
              dropdown: "bg-surface-secondary border-border-primary",
            }}
          />

          {mode === "search" ? (
            <Stack gap="md">
              <TextInput
                placeholder="Search by name or email..."
                leftSection={<IconSearch size={16} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.currentTarget.value)}
                classNames={{
                  input:
                    "bg-surface-primary border-border-primary text-text-primary",
                }}
              />

              {isSearching && (
                <Center py="md">
                  <Loader size="sm" />
                </Center>
              )}

              {debouncedSearch.length >= 2 &&
                !isSearching &&
                searchResults &&
                searchResults.length === 0 && (
                  <Text size="sm" className="py-4 text-center text-text-muted">
                    No users found. Try the &quot;Invite by Email&quot; tab to
                    invite someone new.
                  </Text>
                )}

              {searchResults && searchResults.length > 0 && (
                <Stack gap="xs">
                  {searchResults.map((user) => (
                    <Paper
                      key={user.id}
                      p="sm"
                      withBorder
                      className="border-border-primary bg-surface-primary"
                    >
                      <Group justify="space-between">
                        <Group gap="sm">
                          <Avatar src={user.image} size="sm" radius="xl">
                            {user.name?.charAt(0)?.toUpperCase() ?? "?"}
                          </Avatar>
                          <div>
                            <Text
                              size="sm"
                              fw={500}
                              className="text-text-primary"
                            >
                              {user.name ?? "Unnamed"}
                            </Text>
                            <Text size="xs" className="text-text-muted">
                              {user.email}
                            </Text>
                          </div>
                        </Group>
                        <Button
                          size="xs"
                          variant="light"
                          leftSection={<IconUserPlus size={14} />}
                          loading={addMemberMutation.isPending}
                          onClick={() => {
                            if (user.email) handleAddUser(user.email);
                          }}
                        >
                          Add
                        </Button>
                      </Group>
                    </Paper>
                  ))}
                </Stack>
              )}

              {debouncedSearch.length < 2 && (
                <Text size="sm" className="py-4 text-center text-text-muted">
                  Type at least 2 characters to search for users
                </Text>
              )}
            </Stack>
          ) : (
            <form onSubmit={handleInviteSubmit}>
              <Stack gap="md">
                <TextInput
                  label="Email Address"
                  placeholder="colleague@example.com"
                  required
                  {...inviteForm.getInputProps("email")}
                  classNames={{
                    input:
                      "bg-surface-primary border-border-primary text-text-primary",
                    label: "text-text-secondary",
                  }}
                />

                <Alert color="gray" variant="light">
                  <Text size="sm" className="text-text-secondary">
                    If the user already has an account, they will be added
                    immediately. Otherwise, an invitation link will be generated
                    that you can share with them.
                  </Text>
                </Alert>

                <Group justify="flex-end">
                  <Button
                    variant="subtle"
                    onClick={handleClose}
                    className="text-text-secondary"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    loading={addMemberMutation.isPending}
                    leftSection={<IconUserPlus size={16} />}
                  >
                    Send Invitation
                  </Button>
                </Group>
              </Stack>
            </form>
          )}
        </Stack>
      )}
    </Modal>
  );
}
