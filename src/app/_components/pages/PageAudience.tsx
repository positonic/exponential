"use client";

import {
  Avatar,
  Button,
  Group,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import {
  IconBuilding,
  IconFolder,
  IconLock,
  IconWorld,
} from "@tabler/icons-react";
import type { ReactNode } from "react";
import { api } from "~/trpc/react";
import { MeetingProjectPicker } from "~/app/_components/meeting/MeetingProjectPicker";
import { usePageProjectPlacement } from "~/app/_components/pages/PageProjectPicker";

/** Avatars shown inline; the rest collapse into a "+N" chip. */
const AVATAR_LIMIT = 6;

interface PageAudienceProps {
  pageId: string;
  workspaceId: string;
  /** Editors get a "Change…" project picker; readers just see the audience. */
  canEdit: boolean;
}

/**
 * The Share popover's "General access" block: who can see this page right now
 * (from `page.audience`, which mirrors the page access resolver), and — for
 * editors — a one-click route to the only private-sharing lever Pages have
 * today: placing the page in a restricted project.
 */
export function PageAudience({ pageId, workspaceId, canEdit }: PageAudienceProps) {
  const { data: audience, isError } = api.page.audience.useQuery({ id: pageId });
  const placement = usePageProjectPlacement(pageId, workspaceId);

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

  if (!audience) {
    return (
      <Stack gap={6}>
        <SectionLabel />
        <Skeleton height={36} radius="sm" />
      </Stack>
    );
  }

  const { project, workspaceName, total } = audience;
  const peopleCount = `${total} ${total === 1 ? "person" : "people"}`;

  let icon: ReactNode;
  let headline: string;
  let detail: string;
  let note: string | null = null;
  if (audience.isInviteOnly) {
    icon = <IconLock size={16} />;
    headline = "Only people invited";
    detail = `Invite-only · ${peopleCount}`;
  } else if (!project) {
    icon = <IconBuilding size={16} />;
    headline = `Everyone in ${workspaceName}`;
    detail = peopleCount;
    note = canEdit
      ? "Anyone in the workspace can see this page. To limit who sees it, move it to a restricted project."
      : "Anyone in the workspace can see this page.";
  } else if (audience.isPublicProject) {
    icon = <IconWorld size={16} />;
    headline = "Anyone signed in";
    detail = `${project.name} is a public project`;
  } else if (project.isRestricted) {
    icon = <IconLock size={16} />;
    headline = `Members of ${project.name}`;
    detail = `Restricted · ${peopleCount}`;
    if (audience.includesAdminEscapeHatch) {
      note = "Workspace admins can also see restricted projects.";
    }
  } else {
    icon = <IconFolder size={16} />;
    headline = project.name;
    detail = peopleCount;
    note = `This project isn't restricted, so everyone in ${workspaceName} can see this page.`;
  }

  const extra = audience.total - Math.min(audience.people.length, AVATAR_LIMIT);

  return (
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
        {/* On an invite-only page the project grants nothing, so moving it
            doesn't change who can see it — no "Change…" here. */}
        {canEdit && !audience.isInviteOnly ? (
          <MeetingProjectPicker
            projects={placement.options}
            value={project?.id ?? null}
            onChange={(projectId) => placement.move(projectId, project?.id ?? null)}
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
              <Tooltip key={person.id} label={person.name ?? "Unnamed user"} withinPortal={false}>
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
        // `page.audience` withholds names from viewers outside the workspace.
        <Text size="xs" className="text-text-muted">
          Names are visible to workspace members only.
        </Text>
      ) : null}

      {note ? (
        <Text size="xs" className="text-text-muted">
          {note}
        </Text>
      ) : null}

      {/* Publishing overrides everything above, so say so — readers never see
          the Publish switch that would otherwise tell them. */}
      {audience.isPublishedToWeb ? (
        <Group gap={6} wrap="nowrap" data-testid="page-audience-published">
          <IconWorld size={14} className="shrink-0 text-text-secondary" />
          <Text size="xs" className="text-text-secondary">
            Also published to the web: anyone with the link can view it.
          </Text>
        </Group>
      ) : null}
    </Stack>
  );
}

function SectionLabel() {
  return (
    <Text size="xs" fw={600} className="uppercase tracking-wide text-text-muted">
      Who can see this page
    </Text>
  );
}
