"use client";

import React, { useState } from "react";
import { api } from "~/trpc/react";
import {
  Container,
  Title,
  Text,
  Card,
  Stack,
  Group,
  Switch,
  Avatar,
  Badge,
  Button,
  Alert,
  Loader,
  Paper,
  Divider
} from "@mantine/core";
import {
  IconUsers,
  IconCheck,
  IconAlertCircle,
  IconArrowLeft,
  IconShare
} from "@tabler/icons-react";
import Link from "next/link";
import { notifications } from "@mantine/notifications";
import { useWorkspace } from "~/providers/WorkspaceProvider";

export default function WeeklyTeamCheckinSettingsPage() {
  const { workspace, workspaceSlug, isLoading: workspaceLoading } = useWorkspace();
  const [loadingTeams, setLoadingTeams] = useState<Set<string>>(new Set());

  // Fetch user's current sharing settings
  const { data: sharingSettings, isLoading: loadingSettings, refetch: refetchSettings } =
    api.weeklyReview.getSharingSettings.useQuery();

  // Fetch organization teams the user can share with
  const { data: organizationTeams, isLoading: loadingOrganizationTeams } =
    api.weeklyReview.getOrganizationTeams.useQuery();

  // Update sharing mutation
  const updateSharing = api.weeklyReview.updateSharingWithTeam.useMutation({
    onMutate: ({ teamId }) => {
      setLoadingTeams(prev => new Set(prev).add(teamId));
    },
    onSuccess: (data) => {
      notifications.show({
        title: data.isEnabled ? 'Sharing Enabled' : 'Sharing Disabled',
        message: `Weekly review sharing ${data.isEnabled ? 'enabled' : 'disabled'} with ${data.team.name}`,
        color: 'green',
        icon: <IconCheck size={16} />
      });
      void refetchSettings();
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to update sharing settings',
        color: 'red',
        icon: <IconAlertCircle size={16} />
      });
    },
    onSettled: (data, error, variables) => {
      setLoadingTeams(prev => {
        const newSet = new Set(prev);
        newSet.delete(variables.teamId);
        return newSet;
      });
    }
  });

  // Bulk enable sharing mutation
  const enableBulkSharing = api.weeklyReview.enableSharingWithTeams.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Bulk Sharing Enabled',
        message: 'Weekly review sharing enabled for all organization teams',
        color: 'green',
        icon: <IconCheck size={16} />
      });
      void refetchSettings();
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to enable bulk sharing',
        color: 'red',
        icon: <IconAlertCircle size={16} />
      });
    }
  });

  const handleToggleSharing = (teamId: string, currentlyEnabled: boolean) => {
    updateSharing.mutate({
      teamId,
      isEnabled: !currentlyEnabled
    });
  };

  const handleEnableAllSharing = () => {
    if (!organizationTeams?.length) return;

    const teamIds = organizationTeams.map(team => team.id);
    enableBulkSharing.mutate({ teamIds });
  };

  const isTeamSharingEnabled = (teamId: string) => {
    return sharingSettings?.some((setting: { teamId: string; isEnabled: boolean }) =>
      setting.teamId === teamId && setting.isEnabled
    ) ?? false;
  };

  const enabledTeamsCount = sharingSettings?.filter((setting: { isEnabled: boolean }) => setting.isEnabled).length ?? 0;
  const availableTeamsCount = organizationTeams?.length ?? 0;

  if (workspaceLoading || loadingSettings || loadingOrganizationTeams) {
    return (
      <Container size="md" py="xl">
        <div className="flex justify-center py-12">
          <Loader size="lg" />
        </div>
      </Container>
    );
  }

  if (!workspace) {
    return (
      <Container size="md" py="xl">
        <Text className="text-text-secondary">Workspace not found</Text>
      </Container>
    );
  }

  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <Group>
          <Button
            variant="subtle"
            leftSection={<IconArrowLeft size={16} />}
            component={Link}
            href={`/w/${workspaceSlug}/weekly-team-checkin`}
          >
            Back to Weekly Team Check-in
          </Button>
        </Group>

        <div>
          <Title order={1} className="text-text-primary">
            Weekly Team Check-in Sharing Settings
          </Title>
          <Text c="dimmed" mt="xs">
            Choose which organization teams can see your weekly reviews
          </Text>
        </div>

        {/* Summary Card */}
        <Paper p="lg" withBorder radius="md" className="bg-surface-secondary">
          <Group justify="space-between" align="center">
            <div>
              <Text fw={500} className="text-text-primary">
                Sharing Status
              </Text>
              <Text size="sm" c="dimmed">
                {enabledTeamsCount} of {availableTeamsCount} organization teams
              </Text>
            </div>
            <Group gap="xs">
              <IconShare size={20} className="text-brand-primary" />
              <Text size="lg" fw={600} className="text-brand-primary">
                {enabledTeamsCount}
              </Text>
            </Group>
          </Group>

          {availableTeamsCount > 0 && enabledTeamsCount < availableTeamsCount && (
            <>
              <Divider my="md" />
              <Group justify="flex-end">
                <Button
                  variant="light"
                  size="sm"
                  leftSection={<IconUsers size={16} />}
                  onClick={handleEnableAllSharing}
                  loading={enableBulkSharing.isPending}
                >
                  Enable All Teams
                </Button>
              </Group>
            </>
          )}
        </Paper>

        {/* Organization Teams */}
        {availableTeamsCount > 0 ? (
          <Card withBorder>
            <Stack gap="md">
              <div>
                <Title order={3} className="text-text-primary">
                  Organization Teams
                </Title>
                <Text size="sm" c="dimmed">
                  Enable sharing to allow team members to see your weekly reviews
                </Text>
              </div>

              <Stack gap="sm">
                {organizationTeams?.map((team) => {
                  const isEnabled = isTeamSharingEnabled(team.id);
                  const isTeamLoading = loadingTeams.has(team.id);

                  return (
                    <Paper
                      key={team.id}
                      p="md"
                      withBorder
                      radius="md"
                      className="bg-surface-primary hover:bg-surface-hover transition-colors"
                    >
                      <Group justify="space-between" align="center">
                        <Group gap="md">
                          <Avatar size="md" color="blue" radius="xl">
                            {team.name.substring(0, 2).toUpperCase()}
                          </Avatar>
                          <div>
                            <Group gap="xs" align="center">
                              <Text fw={500} className="text-text-primary">
                                {team.name}
                              </Text>
                              <Badge variant="dot" color="blue" size="sm">
                                Organization
                              </Badge>
                            </Group>
                            <Text size="xs" c="dimmed">
                              Team members can view your weekly reviews
                            </Text>
                          </div>
                        </Group>

                        <Switch
                          checked={isEnabled}
                          onChange={() => handleToggleSharing(team.id, isEnabled)}
                          disabled={isTeamLoading}
                          size="md"
                        />
                      </Group>
                    </Paper>
                  );
                })}
              </Stack>
            </Stack>
          </Card>
        ) : (
          <Alert variant="light" color="blue" icon={<IconAlertCircle size={16} />}>
            <Stack gap="xs">
              <Text fw={500}>No Organization Teams Available</Text>
              <Text size="sm">
                You&apos;re not a member of any organization teams yet. Organization teams can receive
                shared weekly reviews from their members.
              </Text>
              <Group mt="sm">
                <Button
                  variant="light"
                  size="sm"
                  component={Link}
                  href="/teams"
                  leftSection={<IconUsers size={16} />}
                >
                  Browse Teams
                </Button>
              </Group>
            </Stack>
          </Alert>
        )}

        {/* Help Section */}
        <Paper p="lg" withBorder radius="md" className="bg-surface-secondary">
          <Stack gap="md">
            <Group gap="xs">
              <IconAlertCircle size={20} className="text-blue-500" />
              <Text fw={500} className="text-text-primary">
                About Weekly Review Sharing
              </Text>
            </Group>
            <Stack gap="xs">
              <Text size="sm" className="text-text-secondary">
                • Only <strong>organization teams</strong> can receive shared weekly reviews
              </Text>
              <Text size="sm" className="text-text-secondary">
                • Team members can view your weekly progress and outcomes
              </Text>
              <Text size="sm" className="text-text-secondary">
                • You can enable/disable sharing for each organization team individually
              </Text>
              <Text size="sm" className="text-text-secondary">
                • Your personal weekly review content remains private unless explicitly shared
              </Text>
            </Stack>
            <Group mt="sm">
              <Button
                variant="subtle"
                size="sm"
                component={Link}
                href="/productivity-methods/weekly-review"
              >
                Learn about Weekly Reviews →
              </Button>
            </Group>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}
