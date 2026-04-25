"use client";

import {
  Table,
  Text,
  Badge,
  ActionIcon,
  Tooltip,
  Group,
  CopyButton,
  Skeleton,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconCopy,
  IconCheck,
  IconRefresh,
  IconX,
  IconClock,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";

interface PendingInvitationsTableProps {
  workspaceId: string;
  canManage: boolean;
}

export function PendingInvitationsTable({
  workspaceId,
  canManage,
}: PendingInvitationsTableProps) {
  const utils = api.useUtils();

  const { data: invitations, isLoading } =
    api.workspace.listInvitations.useQuery({ workspaceId });

  const cancelMutation = api.workspace.cancelInvitation.useMutation({
    onSuccess: () => {
      notifications.show({
        title: "Invitation cancelled",
        message: "The invitation has been cancelled",
        color: "green",
      });
      void utils.workspace.listInvitations.invalidate();
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message,
        color: "red",
      });
    },
  });

  const resendMutation = api.workspace.resendInvitation.useMutation({
    onSuccess: (data) => {
      notifications.show({
        title: "Invitation resent",
        message: "A new invitation link has been generated",
        color: "green",
      });
      void utils.workspace.listInvitations.invalidate();
      // Copy new link to clipboard
      void navigator.clipboard.writeText(data.inviteUrl);
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message,
        color: "red",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton height={40} />
        <Skeleton height={40} />
      </div>
    );
  }

  if (!invitations || invitations.length === 0) {
    return (
      <Text size="sm" className="text-text-muted py-4">
        No pending invitations
      </Text>
    );
  }

  const formatExpiry = (expiresAt: Date) => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffMs = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return "Expired";
    if (diffDays === 1) return "Expires tomorrow";
    return `Expires in ${diffDays} days`;
  };

  return (
    <Table>
      <Table.Thead>
        <Table.Tr>
          <Table.Th className="text-text-muted">Email</Table.Th>
          <Table.Th className="text-text-muted">Role</Table.Th>
          <Table.Th className="text-text-muted">Expires</Table.Th>
          <Table.Th className="text-text-muted">Invited by</Table.Th>
          {canManage && <Table.Th className="text-text-muted">Actions</Table.Th>}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {invitations.map((invitation) => {
          const baseUrl =
            process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
          const inviteUrl = `${baseUrl}/invite/${invitation.token}`;

          return (
            <Table.Tr key={invitation.id}>
              <Table.Td>
                <Text size="sm" className="text-text-primary">
                  {invitation.email}
                </Text>
              </Table.Td>
              <Table.Td>
                <Badge
                  color={
                    invitation.role === "admin"
                      ? "blue"
                      : invitation.role === "viewer"
                        ? "gray"
                        : "gray"
                  }
                  variant="light"
                >
                  {invitation.role}
                </Badge>
              </Table.Td>
              <Table.Td>
                <Group gap="xs">
                  <IconClock size={14} className="text-text-muted" />
                  <Text size="sm" className="text-text-secondary">
                    {formatExpiry(invitation.expiresAt)}
                  </Text>
                </Group>
              </Table.Td>
              <Table.Td>
                <Text size="sm" className="text-text-secondary">
                  {invitation.createdBy.name ?? invitation.createdBy.email}
                </Text>
              </Table.Td>
              {canManage && (
                <Table.Td>
                  <Group gap="xs">
                    <CopyButton value={inviteUrl}>
                      {({ copied, copy }) => (
                        <Tooltip label={copied ? "Copied!" : "Copy invite link"}>
                          <ActionIcon
                            variant="subtle"
                            color={copied ? "green" : "gray"}
                            onClick={copy}
                            size="sm"
                          >
                            {copied ? (
                              <IconCheck size={14} />
                            ) : (
                              <IconCopy size={14} />
                            )}
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </CopyButton>
                    <Tooltip label="Resend (generate new link)">
                      <ActionIcon
                        variant="subtle"
                        color="blue"
                        onClick={() =>
                          resendMutation.mutate({
                            invitationId: invitation.id,
                          })
                        }
                        loading={resendMutation.isPending}
                        size="sm"
                      >
                        <IconRefresh size={14} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Cancel invitation">
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        onClick={() =>
                          cancelMutation.mutate({
                            invitationId: invitation.id,
                          })
                        }
                        loading={cancelMutation.isPending}
                        size="sm"
                      >
                        <IconX size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Table.Td>
              )}
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}
