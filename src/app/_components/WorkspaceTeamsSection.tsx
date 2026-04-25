"use client";

import {
  Card,
  Title,
  Text,
  Button,
  Stack,
  Group,
  Avatar,
  Badge,
  Skeleton,
  Tooltip,
  AvatarGroup,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconLink,
  IconLinkOff,
  IconUsers,
  IconBriefcase,
} from "@tabler/icons-react";
import Link from "next/link";
import { api } from "~/trpc/react";

interface WorkspaceTeamsSectionProps {
  workspaceId: string;
  canManage: boolean;
}

export function WorkspaceTeamsSection({
  workspaceId,
  canManage,
}: WorkspaceTeamsSectionProps) {
  const utils = api.useUtils();

  const { data: teams, isLoading } = api.workspace.getUserTeamsForLinking.useQuery(
    { workspaceId },
    { enabled: !!workspaceId }
  );

  const linkMutation = api.workspace.linkTeam.useMutation({
    onSuccess: () => {
      notifications.show({
        title: "Team linked",
        message: "The team has been linked to this workspace",
        color: "green",
      });
      void utils.workspace.getUserTeamsForLinking.invalidate();
      void utils.workspace.getBySlug.invalidate();
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message,
        color: "red",
      });
    },
  });

  const unlinkMutation = api.workspace.unlinkTeam.useMutation({
    onSuccess: () => {
      notifications.show({
        title: "Team unlinked",
        message: "The team has been unlinked from this workspace",
        color: "green",
      });
      void utils.workspace.getUserTeamsForLinking.invalidate();
      void utils.workspace.getBySlug.invalidate();
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
      <Card className="bg-surface-secondary border-border-primary" withBorder>
        <Title order={3} className="text-text-primary mb-4">
          Teams
        </Title>
        <Stack gap="sm">
          <Skeleton height={60} />
          <Skeleton height={60} />
        </Stack>
      </Card>
    );
  }

  const linkedTeams = teams?.filter((t) => t.isLinkedToThisWorkspace) ?? [];
  const availableTeams =
    teams?.filter(
      (t) => !t.isLinkedToThisWorkspace && !t.isLinkedToOtherWorkspace
    ) ?? [];
  const linkedElsewhereTeams =
    teams?.filter((t) => t.isLinkedToOtherWorkspace) ?? [];

  return (
    <Card className="bg-surface-secondary border-border-primary" withBorder>
      <Title order={3} className="text-text-primary mb-4">
        Teams
      </Title>

      {teams?.length === 0 ? (
        <Stack gap="md" align="center" className="py-8">
          <IconUsers size={48} className="text-text-muted" />
          <Text className="text-text-secondary text-center">
            You are not a member of any teams yet.
          </Text>
          <Button
            component={Link}
            href="/teams"
            variant="light"
            leftSection={<IconUsers size={16} />}
          >
            Create or Join a Team
          </Button>
        </Stack>
      ) : (
        <Stack gap="lg">
          {/* Linked Teams */}
          {linkedTeams.length > 0 && (
            <div>
              <Text size="sm" className="text-text-muted mb-2 font-medium">
                Linked to this workspace
              </Text>
              <Stack gap="sm">
                {linkedTeams.map((team) => (
                  <TeamRow
                    key={team.id}
                    team={team}
                    action={
                      canManage && team.canLink ? (
                        <Tooltip label="Unlink from workspace">
                          <Button
                            variant="subtle"
                            color="red"
                            size="xs"
                            leftSection={<IconLinkOff size={14} />}
                            onClick={() =>
                              unlinkMutation.mutate({
                                workspaceId,
                                teamId: team.id,
                              })
                            }
                            loading={unlinkMutation.isPending}
                          >
                            Unlink
                          </Button>
                        </Tooltip>
                      ) : null
                    }
                  />
                ))}
              </Stack>
            </div>
          )}

          {/* Available Teams */}
          {availableTeams.length > 0 && (
            <div>
              <Text size="sm" className="text-text-muted mb-2 font-medium">
                Available to link
              </Text>
              <Stack gap="sm">
                {availableTeams.map((team) => (
                  <TeamRow
                    key={team.id}
                    team={team}
                    action={
                      canManage && team.canLink ? (
                        <Tooltip label="Link to this workspace">
                          <Button
                            variant="light"
                            color="blue"
                            size="xs"
                            leftSection={<IconLink size={14} />}
                            onClick={() =>
                              linkMutation.mutate({
                                workspaceId,
                                teamId: team.id,
                              })
                            }
                            loading={linkMutation.isPending}
                          >
                            Link
                          </Button>
                        </Tooltip>
                      ) : !team.canLink ? (
                        <Tooltip label="Only team owners can link teams">
                          <Badge color="gray" variant="light">
                            Member
                          </Badge>
                        </Tooltip>
                      ) : null
                    }
                  />
                ))}
              </Stack>
            </div>
          )}

          {/* Teams linked elsewhere */}
          {linkedElsewhereTeams.length > 0 && (
            <div>
              <Text size="sm" className="text-text-muted mb-2 font-medium">
                Linked to other workspaces
              </Text>
              <Stack gap="sm">
                {linkedElsewhereTeams.map((team) => (
                  <TeamRow
                    key={team.id}
                    team={team}
                    action={
                      <Badge color="gray" variant="light">
                        Linked elsewhere
                      </Badge>
                    }
                    muted
                  />
                ))}
              </Stack>
            </div>
          )}
        </Stack>
      )}
    </Card>
  );
}

interface TeamRowProps {
  team: {
    id: string;
    name: string;
    members: Array<{
      user: {
        id: string;
        name: string | null;
        email: string | null;
        image: string | null;
      };
    }>;
    _count: {
      projects: number;
    };
    userRole: string | null;
  };
  action: React.ReactNode;
  muted?: boolean;
}

function TeamRow({ team, action, muted }: TeamRowProps) {
  return (
    <Group
      justify="space-between"
      className={`p-3 rounded bg-surface-primary ${muted ? "opacity-60" : ""}`}
    >
      <Group gap="md">
        <Avatar color="brand" radius="md">
          {team.name.charAt(0).toUpperCase()}
        </Avatar>
        <div>
          <Group gap="xs">
            <Text
              size="sm"
              className="text-text-primary font-medium"
              component={Link}
              href={`/teams/${team.id}`}
            >
              {team.name}
            </Text>
            {team.userRole === "owner" && (
              <Badge size="xs" color="yellow" variant="light">
                Owner
              </Badge>
            )}
          </Group>
          <Group gap="md">
            <Group gap="xs">
              <IconUsers size={12} className="text-text-muted" />
              <Text size="xs" className="text-text-muted">
                {team.members.length} members
              </Text>
            </Group>
            <Group gap="xs">
              <IconBriefcase size={12} className="text-text-muted" />
              <Text size="xs" className="text-text-muted">
                {team._count.projects} projects
              </Text>
            </Group>
          </Group>
        </div>
      </Group>

      <Group gap="sm">
        <AvatarGroup>
          {team.members.slice(0, 3).map((member) => (
            <Tooltip key={member.user.id} label={member.user.name ?? member.user.email}>
              <Avatar size="sm" src={member.user.image} radius="xl">
                {(member.user.name ?? member.user.email)?.charAt(0).toUpperCase()}
              </Avatar>
            </Tooltip>
          ))}
          {team.members.length > 3 && (
            <Avatar size="sm" radius="xl">
              +{team.members.length - 3}
            </Avatar>
          )}
        </AvatarGroup>
        {action}
      </Group>
    </Group>
  );
}
