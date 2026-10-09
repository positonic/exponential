"use client";

import { useMemo, useState } from "react";
import {
  ActionIcon,
  Avatar,
  Button,
  Group,
  MultiSelect,
  Select,
  Stack,
  Switch,
  Text,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconX } from "@tabler/icons-react";
import { api } from "~/trpc/react";

type InviteRole = "viewer" | "editor";

const ROLE_OPTIONS: { value: InviteRole; label: string }[] = [
  { value: "viewer", label: "Can view" },
  { value: "editor", label: "Can edit" },
];

function isInviteRole(value: string | null): value is InviteRole {
  return value === "viewer" || value === "editor";
}

interface PageInvitesProps {
  pageId: string;
  workspaceId: string;
}

/**
 * The Share popover's invite-only controls (ADR-0067). The owner gets the
 * invite-only switch, the invite picker (workspace members only), the invitee
 * list with role changes and removal, and a one-off "Apply to sub-pages".
 * Everyone else sees nothing here — the audience block above already shows
 * who can see the page.
 */
export function PageInvites({ pageId, workspaceId }: PageInvitesProps) {
  const utils = api.useUtils();
  const { data: sharing } = api.page.sharing.useQuery({ id: pageId });
  const canManage = sharing?.canManage ?? false;
  const isInviteOnly = sharing?.isInviteOnly ?? false;
  const { data: members = [] } = api.workspace.listMembers.useQuery(
    { workspaceId },
    { enabled: canManage && isInviteOnly },
  );

  const [picked, setPicked] = useState<string[]>([]);
  const [role, setRole] = useState<InviteRole>("viewer");

  const refresh = () => {
    void utils.page.sharing.invalidate({ id: pageId });
    void utils.page.audience.invalidate({ id: pageId });
    void utils.page.get.invalidate({ id: pageId });
    void utils.page.list.invalidate();
    void utils.page.tree.invalidate();
  };
  const onError = (title: string) => (error: { message: string }) =>
    notifications.show({ color: "red", title, message: error.message });

  const setInviteOnly = api.page.setInviteOnly.useMutation({
    onSuccess: refresh,
    onError: onError("Could not change sharing"),
  });
  const invite = api.page.invite.useMutation({
    onSuccess: () => {
      setPicked([]);
      refresh();
    },
    onError: onError("Could not invite"),
  });
  const updateInvite = api.page.updateInvite.useMutation({
    onSuccess: refresh,
    onError: onError("Could not change role"),
  });
  const removeInvite = api.page.removeInvite.useMutation({
    onSuccess: refresh,
    onError: onError("Could not remove"),
  });
  const applyToSubpages = api.page.applySharingToSubpages.useMutation({
    onSuccess: ({ updated, skipped }) => {
      refresh();
      notifications.show({
        color: "teal",
        title: `Updated ${updated} sub-page${updated === 1 ? "" : "s"}`,
        message:
          skipped > 0
            ? `${skipped} skipped — you can only change pages you own.`
            : "They now have the same sharing as this page.",
      });
    },
    onError: onError("Could not update sub-pages"),
  });

  const invitedIds = useMemo(
    () => new Set(sharing?.invitees.map((i) => i.id) ?? []),
    [sharing],
  );
  const memberOptions = useMemo(() => {
    const seen = new Set<string>();
    return members
      .filter((m) => {
        if (seen.has(m.id) || invitedIds.has(m.id)) return false;
        seen.add(m.id);
        return true;
      })
      .map((m) => ({ value: m.id, label: m.name ?? m.email ?? "Unnamed user" }));
  }, [members, invitedIds]);

  if (!sharing || !canManage) return null;

  return (
    <Stack gap="xs" data-testid="page-invites">
      <Tooltip
        label={sharing.inviteOnlyBlockedReason}
        disabled={!sharing.inviteOnlyBlockedReason || isInviteOnly}
        withinPortal={false}
      >
        <div>
          <Switch
            label="Invite-only"
            description="Only you and the people you invite can see it. Workspace admins can't, and the page's project doesn't grant access."
            checked={isInviteOnly}
            disabled={
              setInviteOnly.isPending ||
              (!isInviteOnly && !!sharing.inviteOnlyBlockedReason)
            }
            onChange={(e) =>
              setInviteOnly.mutate({
                id: pageId,
                inviteOnly: e.currentTarget.checked,
              })
            }
          />
        </div>
      </Tooltip>

      {isInviteOnly ? (
        <>
          <Group gap="xs" wrap="nowrap" align="flex-end">
            <MultiSelect
              className="min-w-0 flex-1"
              size="xs"
              placeholder={picked.length ? undefined : "Add people from the workspace"}
              aria-label="People to invite"
              data={memberOptions}
              value={picked}
              onChange={setPicked}
              searchable
              nothingFoundMessage="No other workspace members"
              comboboxProps={{ withinPortal: false }}
            />
            <Select
              size="xs"
              w={100}
              aria-label="Role for new invitees"
              data={ROLE_OPTIONS}
              value={role}
              onChange={(value) => isInviteRole(value) && setRole(value)}
              allowDeselect={false}
              comboboxProps={{ withinPortal: false }}
            />
          </Group>
          {picked.length > 0 ? (
            <Button
              size="xs"
              loading={invite.isPending}
              onClick={() => invite.mutate({ id: pageId, userIds: picked, role })}
            >
              Invite {picked.length === 1 ? "1 person" : `${picked.length} people`}
            </Button>
          ) : null}

          {sharing.invitees.length > 0 ? (
            <Stack gap={4}>
              {sharing.invitees.map((person) => (
                <Group key={person.id} gap="xs" wrap="nowrap" justify="space-between">
                  <Group gap="xs" wrap="nowrap" className="min-w-0">
                    <Avatar src={person.image} size={22} radius="xl">
                      {(person.name ?? "?")[0]?.toUpperCase()}
                    </Avatar>
                    <div className="min-w-0">
                      <Text size="xs" className="truncate">
                        {person.name ?? person.email ?? "Unnamed user"}
                      </Text>
                      {!person.isWorkspaceMember ? (
                        <Text size="xs" className="text-text-muted">
                          Left the workspace — no access
                        </Text>
                      ) : null}
                    </div>
                  </Group>
                  <Group gap={4} wrap="nowrap">
                    <Select
                      size="xs"
                      w={96}
                      aria-label={`Role for ${person.name ?? "invitee"}`}
                      data={ROLE_OPTIONS}
                      value={person.role}
                      onChange={(value) =>
                        isInviteRole(value) &&
                        updateInvite.mutate({ id: pageId, userId: person.id, role: value })
                      }
                      allowDeselect={false}
                      comboboxProps={{ withinPortal: false }}
                    />
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="sm"
                      aria-label={`Remove ${person.name ?? "invitee"}`}
                      onClick={() => removeInvite.mutate({ id: pageId, userId: person.id })}
                    >
                      <IconX size={14} />
                    </ActionIcon>
                  </Group>
                </Group>
              ))}
            </Stack>
          ) : (
            <Text size="xs" className="text-text-muted">
              Nobody else can see this page yet.
            </Text>
          )}
        </>
      ) : null}

      {sharing.subpagesToApply > 0 ? (
        <Button
          size="xs"
          variant="subtle"
          loading={applyToSubpages.isPending}
          onClick={() => applyToSubpages.mutate({ id: pageId })}
          data-testid="page-apply-subpages"
        >
          Apply to {sharing.subpagesToApply} sub-page
          {sharing.subpagesToApply === 1 ? "" : "s"}
        </Button>
      ) : null}
    </Stack>
  );
}
