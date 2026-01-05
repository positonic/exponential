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
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconCopy, IconMail } from "@tabler/icons-react";
import { useState } from "react";
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

export function InviteMemberModal({
  workspaceId,
  opened,
  onClose,
  onSuccess,
}: InviteMemberModalProps) {
  const [result, setResult] = useState<InviteResult | null>(null);

  const form = useForm({
    initialValues: {
      email: "",
      role: "member" as "admin" | "member" | "viewer",
    },
    validate: {
      email: (value) =>
        /^\S+@\S+$/.test(value) ? null : "Invalid email address",
    },
  });

  const utils = api.useUtils();

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
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message,
        color: "red",
      });
    },
  });

  const handleSubmit = form.onSubmit((values) => {
    addMemberMutation.mutate({
      workspaceId,
      email: values.email,
      role: values.role,
    });
  });

  const handleClose = () => {
    form.reset();
    setResult(null);
    onClose();
  };

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
              <Button onClick={handleClose}>Done</Button>
            </>
          ) : (
            <>
              <Alert color="blue" icon={<IconMail size={16} />}>
                <Text className="text-text-primary">
                  An invitation has been created for{" "}
                  <strong>{result.email}</strong>. Share this link with them:
                </Text>
              </Alert>

              <Group gap="xs" className="bg-surface-primary p-3 rounded">
                <Text
                  size="sm"
                  className="text-text-secondary flex-1 break-all font-mono"
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
                    form.reset();
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
            <TextInput
              label="Email Address"
              placeholder="colleague@example.com"
              required
              {...form.getInputProps("email")}
              classNames={{
                input:
                  "bg-surface-primary border-border-primary text-text-primary",
                label: "text-text-secondary",
              }}
            />

            <Select
              label="Role"
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
              {...form.getInputProps("role")}
              classNames={{
                input:
                  "bg-surface-primary border-border-primary text-text-primary",
                label: "text-text-secondary",
                dropdown: "bg-surface-secondary border-border-primary",
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
              <Button type="submit" loading={addMemberMutation.isPending}>
                Send Invitation
              </Button>
            </Group>
          </Stack>
        </form>
      )}
    </Modal>
  );
}
