"use client";

import {
  Modal,
  Select,
  Button,
  Stack,
  Alert,
  Text,
  Group,
  CopyButton,
  ActionIcon,
  Tooltip,
  Combobox,
  useCombobox,
  InputBase,
  Avatar,
  Loader,
  CloseButton,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconCheck,
  IconCopy,
  IconMail,
  IconSearch,
  IconUserPlus,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { api } from "~/trpc/react";

interface InviteMemberModalProps {
  workspaceId: string;
  opened: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type InviteResult =
  | { type: "member_added"; memberName: string }
  | { type: "invitation_created"; inviteUrl: string; email: string };

type MatchedUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

const EMAIL_RE = /^\S+@\S+$/;
const INVITE_OPTION_VALUE = "__invite__";

function initials(label: string): string {
  return label.trim().charAt(0).toUpperCase() || "?";
}

export function InviteMemberModal({
  workspaceId,
  opened,
  onClose,
  onSuccess,
}: InviteMemberModalProps) {
  const [result, setResult] = useState<InviteResult | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [selectedUser, setSelectedUser] = useState<MatchedUser | null>(null);
  const [role, setRole] = useState<"admin" | "member" | "viewer">("member");
  const [error, setError] = useState<string | null>(null);
  const [debouncedSearch] = useDebouncedValue(searchValue, 300);

  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const utils = api.useUtils();

  const trimmedDebounced = debouncedSearch.trim();
  const queryEnabled = trimmedDebounced.length >= 2 && !selectedUser;

  const { data: searchResults, isFetching } = api.user.searchByEmail.useQuery(
    { query: trimmedDebounced, excludeWorkspaceId: workspaceId, limit: 10 },
    { enabled: queryEnabled },
  );

  const trimmedSearch = searchValue.trim();
  const isValidEmail = EMAIL_RE.test(trimmedSearch);
  const showInviteFooter =
    !selectedUser &&
    isValidEmail &&
    !(searchResults ?? []).some(
      (u) => u.email?.toLowerCase() === trimmedSearch.toLowerCase(),
    );

  const addMemberMutation = api.workspace.addMember.useMutation({
    onSuccess: (data) => {
      if (data.type === "member_added") {
        setResult({
          type: "member_added",
          memberName: data.member.user.name ?? data.member.user.email ?? "User",
        });
        notifications.show({
          title: "Member added",
          message: `${data.member.user.name ?? data.member.user.email} has been added to the workspace`,
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
      void utils.workspace.getBySlug.invalidate();
      void utils.workspace.listInvitations.invalidate();
      onSuccess?.();
    },
    onError: (err) => {
      notifications.show({
        title: "Error",
        message: err.message,
        color: "red",
      });
    },
  });

  const resetForm = () => {
    setSearchValue("");
    setSelectedUser(null);
    setError(null);
    setRole("member");
  };

  const handleClose = () => {
    resetForm();
    setResult(null);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const email = selectedUser?.email ?? trimmedSearch;
    if (!email || !EMAIL_RE.test(email)) {
      setError(
        "Pick a user from the dropdown or enter a valid email address.",
      );
      return;
    }

    addMemberMutation.mutate({ workspaceId, email, role });
  };

  const options = useMemo(() => {
    if (!queryEnabled) return [] as MatchedUser[];
    return searchResults ?? [];
  }, [queryEnabled, searchResults]);

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Invite Member"
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
                  workspace.
                </Text>
              </Alert>
              <Group justify="flex-end">
                <Button
                  variant="subtle"
                  onClick={() => {
                    resetForm();
                    setResult(null);
                  }}
                  className="text-text-secondary"
                >
                  Invite Another
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
                  onClick={() => {
                    resetForm();
                    setResult(null);
                  }}
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
        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <Combobox
              store={combobox}
              withinPortal={false}
              onOptionSubmit={(value) => {
                if (value === INVITE_OPTION_VALUE) {
                  setSelectedUser(null);
                  combobox.closeDropdown();
                  return;
                }
                const user = options.find((u) => u.id === value);
                if (user) {
                  setSelectedUser(user);
                  setSearchValue(user.email ?? "");
                  setError(null);
                }
                combobox.closeDropdown();
              }}
            >
              <Combobox.Target>
                <InputBase
                  label="Member"
                  placeholder="Search by name or email…"
                  value={searchValue}
                  error={error}
                  leftSection={
                    selectedUser ? (
                      <Avatar
                        src={selectedUser.image}
                        size="sm"
                        radius="xl"
                      >
                        {initials(
                          selectedUser.name ?? selectedUser.email ?? "?",
                        )}
                      </Avatar>
                    ) : (
                      <IconSearch size={16} />
                    )
                  }
                  rightSection={
                    isFetching ? (
                      <Loader size="xs" />
                    ) : selectedUser || searchValue ? (
                      <CloseButton
                        size="sm"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setSelectedUser(null);
                          setSearchValue("");
                          setError(null);
                          combobox.openDropdown();
                        }}
                        aria-label="Clear"
                      />
                    ) : null
                  }
                  onChange={(e) => {
                    const value = e.currentTarget.value;
                    setSearchValue(value);
                    setError(null);
                    if (selectedUser) setSelectedUser(null);
                    combobox.openDropdown();
                    combobox.updateSelectedOptionIndex();
                  }}
                  onClick={() => combobox.openDropdown()}
                  onFocus={() => combobox.openDropdown()}
                  onBlur={() => combobox.closeDropdown()}
                  required
                  classNames={{
                    input:
                      "bg-surface-primary border-border-primary text-text-primary",
                    label: "text-text-secondary",
                  }}
                />
              </Combobox.Target>

              <Combobox.Dropdown className="border-border-primary bg-surface-secondary">
                <Combobox.Options>
                  {trimmedDebounced.length < 2 && !selectedUser ? (
                    <Combobox.Empty>
                      <Text size="sm" className="text-text-muted">
                        Type at least 2 characters to search…
                      </Text>
                    </Combobox.Empty>
                  ) : (
                    <>
                      {options.map((user) => (
                        <Combobox.Option value={user.id} key={user.id}>
                          <Group gap="sm" wrap="nowrap">
                            <Avatar src={user.image} size="sm" radius="xl">
                              {initials(user.name ?? user.email ?? "?")}
                            </Avatar>
                            <Stack gap={0}>
                              <Text size="sm" className="text-text-primary">
                                {user.name ?? user.email ?? "Unnamed"}
                              </Text>
                              {user.name && user.email && (
                                <Text size="xs" className="text-text-muted">
                                  {user.email}
                                </Text>
                              )}
                            </Stack>
                          </Group>
                        </Combobox.Option>
                      ))}

                      {options.length === 0 &&
                        !isFetching &&
                        !showInviteFooter && (
                          <Combobox.Empty>
                            <Text size="sm" className="text-text-muted">
                              No users found. Enter a valid email address to
                              send an invite.
                            </Text>
                          </Combobox.Empty>
                        )}

                      {showInviteFooter && (
                        <>
                          {options.length > 0 && <Combobox.Group label="" />}
                          <Combobox.Option value={INVITE_OPTION_VALUE}>
                            <Group gap="sm" wrap="nowrap">
                              <Avatar size="sm" radius="xl" color="blue">
                                <IconUserPlus size={14} />
                              </Avatar>
                              <Stack gap={0}>
                                <Text size="sm" className="text-text-primary">
                                  Send invite to{" "}
                                  <strong>{trimmedSearch}</strong>
                                </Text>
                                <Text size="xs" className="text-text-muted">
                                  They&apos;ll receive an invitation link
                                </Text>
                              </Stack>
                            </Group>
                          </Combobox.Option>
                        </>
                      )}
                    </>
                  )}
                </Combobox.Options>
              </Combobox.Dropdown>
            </Combobox>

            <Select
              label="Role"
              value={role}
              onChange={(val) =>
                setRole((val as "admin" | "member" | "viewer") ?? "member")
              }
              data={[
                {
                  value: "admin",
                  label: "Admin - Can manage members and settings",
                },
                {
                  value: "member",
                  label: "Member - Can view and edit content",
                },
                { value: "viewer", label: "Viewer - Read-only access" },
              ]}
              classNames={{
                input:
                  "bg-surface-primary border-border-primary text-text-primary",
                label: "text-text-secondary",
                dropdown: "bg-surface-secondary border-border-primary",
              }}
            />

            <Alert color="gray" variant="light">
              <Text size="sm" className="text-text-secondary">
                Pick an existing user from the dropdown, or type a new email
                address to send them an invitation link.
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
                disabled={!selectedUser && !isValidEmail}
              >
                {selectedUser ? "Add Member" : "Send Invitation"}
              </Button>
            </Group>
          </Stack>
        </form>
      )}
    </Modal>
  );
}
