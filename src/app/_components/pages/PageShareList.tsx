"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  ActionIcon,
  Avatar,
  Button,
  Group,
  MultiSelect,
  Select,
  Skeleton,
  Stack,
  Switch,
  Text,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconBuilding,
  IconFolder,
  IconLock,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import { api, type RouterOutputs } from "~/trpc/react";
import { MeetingProjectPicker } from "~/app/_components/meeting/MeetingProjectPicker";
import { usePageProjectPlacement } from "~/app/_components/pages/PageProjectPicker";

type Sharing = RouterOutputs["page"]["sharing"];
type GrantRole = Sharing["invitees"][number]["role"];

const ROLE_OPTIONS: { value: GrantRole; label: string }[] = [
  { value: "viewer", label: "Can view" },
  { value: "editor", label: "Can edit" },
];

function roleLabel(role: GrantRole): string {
  return ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role;
}

function isGrantRole(value: string | null): value is GrantRole {
  return ROLE_OPTIONS.some((o) => o.value === value);
}

/** Avatars shown inline; the rest collapse into a "+N" chip. */
const AVATAR_LIMIT = 6;

interface PageShareListProps {
  pageId: string;
  workspaceId: string;
}

/**
 * The Share popover's one list (ADR-0080): who can see the page through its
 * placement (workspace, project, or nobody when restricted), then the people
 * it is shared with by name and their roles, then Add people, then the
 * "Restrict to people listed" switch and "Apply to sub-pages".
 *
 * Everything comes from `page.sharing`, which mirrors the page access
 * resolver; the server enforces every rule the controls reflect — anyone who
 * can edit may add people, only the owner restricts, and a non-owner changes
 * only the grants they added (`canChange`).
 */
export function PageShareList({ pageId, workspaceId }: PageShareListProps) {
  const utils = api.useUtils();
  const { data: sharing, isError } = api.page.sharing.useQuery({ id: pageId });
  const canShare = sharing?.canShare ?? false;
  const { data: members = [] } = api.workspace.listMembers.useQuery(
    { workspaceId },
    { enabled: canShare },
  );
  const placement = usePageProjectPlacement(pageId, workspaceId);

  const [picked, setPicked] = useState<string[]>([]);
  const [role, setRole] = useState<GrantRole>("viewer");

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
    onSuccess: ({ unchanged }) => {
      setPicked([]);
      refresh();
      if (unchanged > 0) {
        notifications.show({
          color: "gray",
          title: "Some roles left as they were",
          message: "Only the page's owner can change people someone else added.",
        });
      }
    },
    onError: onError("Could not share"),
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
            ? `${skipped} skipped — pages you can't share, or that can't be restricted.`
            : "This page's people can see them too.",
      });
    },
    onError: onError("Could not update sub-pages"),
  });

  const memberOptions = useMemo(() => {
    // The owner always has access; people already listed are shown below.
    const seen = new Set<string>(sharing ? [sharing.ownerId] : []);
    for (const person of sharing?.invitees ?? []) seen.add(person.id);
    return members
      .filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      })
      .map((m) => ({ value: m.id, label: m.name ?? m.email ?? "Unnamed user" }));
  }, [members, sharing]);

  if (isError) {
    return (
      <Stack gap={6}>
        <SectionLabel />
        <Text size="xs" className="text-text-muted">
          Couldn&apos;t load who can see this page.
        </Text>
      </Stack>
    );
  }
  if (!sharing) {
    return (
      <Stack gap={6}>
        <SectionLabel />
        <Skeleton height={36} radius="sm" />
      </Stack>
    );
  }

  const { audience, isInviteOnly } = sharing;
  const { headline, detail, icon, note } = describeAudience(sharing);
  const extra = audience.total - Math.min(audience.people.length, AVATAR_LIMIT);

  return (
    <Stack gap="sm" data-testid="page-share-list">
      <Stack gap={6} data-testid="page-audience">
        <SectionLabel />
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Group gap="xs" wrap="nowrap" className="min-w-0">
            <ThemeIcon variant="light" color="gray" size="lg" radius="md">
              {icon}
            </ThemeIcon>
            <div className="min-w-0">
              <Text size="sm" fw={500} className="truncate" title={headline}>
                {headline}
              </Text>
              <Text size="xs" className="text-text-muted">
                {detail}
              </Text>
            </div>
          </Group>
          {/* On a restricted page the project grants nothing, so moving it
              doesn't change who can see it — no "Change…" here. */}
          {canShare && !isInviteOnly ? (
            <MeetingProjectPicker
              projects={placement.options}
              value={audience.project?.id ?? null}
              onChange={(projectId) =>
                placement.move(projectId, audience.project?.id ?? null)
              }
              noneLabel="No project (everyone in the workspace)"
              allowNone={placement.canDetach}
              loading={placement.isLoading}
              onOpen={placement.loadOptions}
              withinPortal={false}
            >
              {() => (
                <Button
                  variant="subtle"
                  size="compact-xs"
                  loading={placement.isPending}
                  data-testid="page-audience-change"
                >
                  Change…
                </Button>
              )}
            </MeetingProjectPicker>
          ) : null}
        </Group>

        {audience.people.length > 0 ? (
          <Tooltip.Group openDelay={200} closeDelay={50}>
            <Avatar.Group spacing="xs">
              {audience.people.slice(0, AVATAR_LIMIT).map((person) => (
                <Tooltip
                  key={person.id}
                  label={person.name ?? "Unnamed user"}
                  withinPortal={false}
                >
                  <Avatar src={person.image} size={24} radius="xl">
                    {(person.name ?? "?")[0]?.toUpperCase()}
                  </Avatar>
                </Tooltip>
              ))}
              {extra > 0 ? (
                <Avatar size={24} radius="xl">
                  +{extra}
                </Avatar>
              ) : null}
            </Avatar.Group>
          </Tooltip.Group>
        ) : audience.total > 0 && !audience.isPublicProject ? (
          // `page.sharing` withholds names from viewers outside the workspace.
          <Text size="xs" className="text-text-muted">
            Names are visible to workspace members only.
          </Text>
        ) : null}

        {note ? (
          <Text size="xs" className="text-text-muted">
            {note}
          </Text>
        ) : null}

        {/* Publishing overrides everything above, so say so — readers never
            see the Publish switch that would otherwise tell them. */}
        {audience.isPublishedToWeb ? (
          <Group gap={6} wrap="nowrap" data-testid="page-audience-published">
            <IconWorld size={14} className="shrink-0 text-text-secondary" />
            <Text size="xs" className="text-text-secondary">
              Also published to the web: anyone with the link can view it.
            </Text>
          </Group>
        ) : null}
      </Stack>

      {sharing.invitees.length > 0 ? (
        <Stack gap={4} data-testid="page-grantees">
          <Text size="xs" fw={500} className="text-text-secondary">
            Shared with
          </Text>
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
              {person.canChange ? (
                <Group gap={4} wrap="nowrap">
                  <Select
                    size="xs"
                    w={96}
                    aria-label={`Role for ${person.name ?? "this person"}`}
                    data={ROLE_OPTIONS}
                    value={person.role}
                    onChange={(value) =>
                      isGrantRole(value) &&
                      updateInvite.mutate({ id: pageId, userId: person.id, role: value })
                    }
                    allowDeselect={false}
                    comboboxProps={{ withinPortal: false }}
                  />
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label={`Remove ${person.name ?? "this person"}`}
                    onClick={() => removeInvite.mutate({ id: pageId, userId: person.id })}
                  >
                    <IconX size={14} />
                  </ActionIcon>
                </Group>
              ) : (
                <Text size="xs" className="shrink-0 text-text-muted">
                  {roleLabel(person.role)}
                </Text>
              )}
            </Group>
          ))}
        </Stack>
      ) : isInviteOnly ? (
        <Text size="xs" className="text-text-muted">
          Nobody else can see this page yet.
        </Text>
      ) : null}

      {canShare ? (
        // One row, so the people dropdown (which opens below the input) never
        // covers the Add button.
        <Group gap={6} wrap="nowrap" align="flex-start" data-testid="page-add-people">
          <MultiSelect
            className="min-w-0 flex-1"
            size="xs"
            placeholder={picked.length ? undefined : "Add people"}
            aria-label="People to share with"
            data={memberOptions}
            value={picked}
            onChange={setPicked}
            searchable
            hidePickedOptions
            nothingFoundMessage="No other workspace members"
            comboboxProps={{ withinPortal: false }}
          />
          <Select
            size="xs"
            w={92}
            aria-label="Role for new people"
            data={ROLE_OPTIONS}
            value={role}
            onChange={(value) => isGrantRole(value) && setRole(value)}
            allowDeselect={false}
            comboboxProps={{ withinPortal: false }}
          />
          <Button
            size="xs"
            disabled={picked.length === 0}
            loading={invite.isPending}
            onClick={() => invite.mutate({ id: pageId, userIds: picked, role })}
          >
            Add
          </Button>
        </Group>
      ) : null}

      <Tooltip
        label={sharing.inviteOnlyBlockedReason}
        disabled={!sharing.inviteOnlyBlockedReason || isInviteOnly}
        withinPortal={false}
      >
        <div>
          <Switch
            label="Restrict to people listed"
            description={
              sharing.canManage
                ? "Only you and the people listed can see it. Workspace admins can't, and the page's project doesn't grant access."
                : "Only the page's owner can change this."
            }
            checked={isInviteOnly}
            disabled={
              !sharing.canManage ||
              setInviteOnly.isPending ||
              (!isInviteOnly && !!sharing.inviteOnlyBlockedReason)
            }
            onChange={(e) =>
              setInviteOnly.mutate({ id: pageId, inviteOnly: e.currentTarget.checked })
            }
            data-testid="page-restrict-switch"
          />
        </div>
      </Tooltip>

      {sharing.subpagesToApply > 0 ? (
        <Button
          size="xs"
          variant="subtle"
          loading={applyToSubpages.isPending}
          onClick={() => applyToSubpages.mutate({ id: pageId })}
          data-testid="page-apply-subpages"
        >
          Also share {sharing.subpagesToApply} sub-page
          {sharing.subpagesToApply === 1 ? "" : "s"} this way
        </Button>
      ) : null}
    </Stack>
  );
}

/** The inherited-audience row: who sees the page through its placement. */
function describeAudience(sharing: Sharing): {
  icon: ReactNode;
  headline: string;
  detail: string;
  note: string | null;
} {
  const { audience } = sharing;
  const { project, workspaceName, total } = audience;
  const peopleCount = `${total} ${total === 1 ? "person" : "people"} in all`;
  if (audience.isInviteOnly) {
    return {
      icon: <IconLock size={16} />,
      headline: "Only people listed",
      detail: `Restricted · ${peopleCount}`,
      note: null,
    };
  }
  if (!project) {
    return {
      icon: <IconBuilding size={16} />,
      headline: `Everyone in ${workspaceName}`,
      detail: peopleCount,
      note: null,
    };
  }
  if (audience.isPublicProject) {
    return {
      icon: <IconWorld size={16} />,
      headline: "Anyone signed in",
      detail: `${project.name} is a public project`,
      note: null,
    };
  }
  if (project.isRestricted) {
    return {
      icon: <IconLock size={16} />,
      headline: `Members of ${project.name}`,
      detail: `Restricted project · ${peopleCount}`,
      note: audience.includesAdminEscapeHatch
        ? "Workspace admins can also see restricted projects."
        : null,
    };
  }
  return {
    icon: <IconFolder size={16} />,
    headline: project.name,
    detail: peopleCount,
    note: `This project isn't restricted, so everyone in ${workspaceName} can see this page.`,
  };
}

function SectionLabel() {
  return (
    <Text size="xs" fw={600} className="uppercase tracking-wide text-text-muted">
      Who can see this page
    </Text>
  );
}
