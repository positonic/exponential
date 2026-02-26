"use client";

import { useState, useEffect } from "react";
import {
  Card,
  Title,
  Text,
  Select,
  Button,
  Group,
  Stack,
  Switch,
  Alert,
  Loader,
  Badge,
  TextInput,
} from "@mantine/core";
import {
  IconBrandSlack,
  IconAlertCircle,
  IconCheck,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";

interface SlackChannelSettingsProps {
  project?: {
    id: string;
    name: string;
    teamId?: string | null;
  };
  team?: {
    id: string;
    name: string;
  };
  workspace?: {
    id: string;
    name: string;
  };
}

interface SlackChannelConfig {
  id: string;
  slackChannel: string;
  isActive: boolean;
  integration: {
    id: string;
    name: string;
  };
}

export function SlackChannelSettings({ project, team, workspace }: SlackChannelSettingsProps) {
  const [selectedIntegration, setSelectedIntegration] = useState<string>('');
  const [selectedChannel, setSelectedChannel] = useState<string>('');
  const [isActive, setIsActive] = useState<boolean>(true);
  const [availableChannels, setAvailableChannels] = useState<Array<{ value: string; label: string }>>([]);
  const [config, setConfig] = useState<SlackChannelConfig | null>(null);

  const entityId = project?.id ?? team?.id ?? workspace?.id;
  const entityName = project?.name ?? team?.name ?? workspace?.name;
  const entityType = project ? 'project' : team ? 'team' : 'workspace';
  const isProject = !!project;
  const isWorkspace = !!workspace;
  
  // Get user's accessible Slack integrations
  const { data: integrations, isLoading: loadingIntegrations } = api.integrationPermission.getAccessibleIntegrations.useQuery({
    provider: 'slack'
  });
  
  // Get existing config
  const configQueryInput = isProject
    ? { projectId: entityId! }
    : isWorkspace
      ? { workspaceId: entityId! }
      : { teamId: entityId! };
  const { data: existingConfig, refetch: refetchConfig } = api.slack.getChannelConfig.useQuery(
    configQueryInput,
    { enabled: !!entityId }
  );

  // Check if user has permission to view channels for selected integration
  // For workspace-level config, skip permission check (handled by workspace membership on the server)
  const { data: hasChannelPermission } = api.integrationPermission.hasPermission.useQuery(
    {
      integrationId: selectedIntegration,
      permission: 'CONFIGURE_CHANNELS',
      context: isProject ? { projectId: entityId } : { teamId: entityId }
    },
    { enabled: !!selectedIntegration && !!entityId && !isWorkspace }
  );

  // Get available channels for selected integration (only if user owns or has been granted access)
  const selectedIntegrationData = integrations?.find(i => i.id === selectedIntegration);
  const canFetchChannels = selectedIntegrationData?.accessType === 'owned';
  
  const { data: channels, isLoading: loadingChannels } = api.slack.getAvailableChannelsForIntegration.useQuery(
    { integrationId: selectedIntegration },
    { enabled: !!selectedIntegration && canFetchChannels }
  );

  // Mutations
  const configureChannelMutation = api.slack.configureChannel.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Success',
        message: 'Slack channel configuration updated successfully',
        color: 'green',
      });
      void refetchConfig();
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to update Slack configuration',
        color: 'red',
      });
    },
  });

  const removeConfigMutation = api.slack.removeChannelConfig.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Success',
        message: 'Slack channel configuration removed',
        color: 'green',
      });
      setConfig(null);
      setSelectedIntegration('');
      setSelectedChannel('');
      void refetchConfig();
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to remove Slack configuration',
        color: 'red',
      });
    },
  });

  // Update form when existing config loads
  useEffect(() => {
    if (existingConfig) {
      setConfig(existingConfig);
      setSelectedIntegration(existingConfig.integration.id);
      setSelectedChannel(existingConfig.slackChannel);
      setIsActive(existingConfig.isActive);
    }
  }, [existingConfig]);

  // Update available channels when channels data loads
  useEffect(() => {
    if (channels) {
      setAvailableChannels(
        channels.map(channel => ({
          value: channel.name,
          label: `${channel.name} (${channel.type})`
        }))
      );
    }
  }, [channels]);

  const handleSave = () => {
    if (!selectedIntegration || !selectedChannel) {
      notifications.show({
        title: 'Error',
        message: 'Please select both an integration and a channel',
        color: 'red',
      });
      return;
    }

    if (!isWorkspace && !hasChannelPermission) {
      notifications.show({
        title: 'Permission Error',
        message: 'You do not have permission to configure channels for this integration',
        color: 'red',
      });
      return;
    }

    // Ensure channel starts with #
    let channel = selectedChannel;
    if (!channel.startsWith('#')) {
      channel = `#${channel}`;
    }

    const entityInput = isProject
      ? { projectId: entityId! }
      : isWorkspace
        ? { workspaceId: entityId! }
        : { teamId: entityId! };

    configureChannelMutation.mutate({
      integrationId: selectedIntegration,
      channel,
      isActive,
      ...entityInput
    });
  };

  const handleRemove = () => {
    if (config) {
      removeConfigMutation.mutate({ configId: config.id });
    }
  };

  if (loadingIntegrations) {
    return (
      <Card>
        <Group>
          <Loader size="sm" />
          <Text>Loading Slack integrations...</Text>
        </Group>
      </Card>
    );
  }

  if (!integrations || integrations.length === 0) {
    return (
      <Card>
        <Group mb="md">
          <IconBrandSlack size={24} />
          <Title order={4}>Slack Notifications</Title>
        </Group>
        <Alert icon={<IconAlertCircle size={16} />} color="orange">
          No Slack integrations found. Please set up a Slack integration first to configure notifications for this {entityType}.
        </Alert>
      </Card>
    );
  }

  const integrationOptions = integrations?.map((integration) => ({
    value: integration.id,
    label: `${integration.name} (${integration.accessType})`
  })) || [];

  return (
    <Card>
      <Group mb="md">
        <IconBrandSlack size={24} />
        <Title order={4}>Slack Notifications</Title>
        {config && (
          <Badge color="green" variant="light">
            <Group gap={4}>
              <IconCheck size={12} />
              Configured
            </Group>
          </Badge>
        )}
      </Group>

      <Text size="sm" c="dimmed" mb="lg">
        {isWorkspace
          ? 'Link a Slack channel to this workspace so Zoe can provide workspace-wide context including OKRs and project progress.'
          : `Configure where Slack notifications for this ${entityType} should be sent.`}
        {isProject && project?.teamId && (
          <Text size="xs" c="dimmed" mt="xs">
            If not configured, notifications will use the team&apos;s default channel.
          </Text>
        )}
      </Text>

      <Stack>
        <Switch
          label={`Enable Slack notifications for ${entityName}`}
          checked={isActive}
          onChange={(event) => setIsActive(event.currentTarget.checked)}
        />

        {isActive && (
          <>
            <Select
              label="Slack Integration"
              placeholder="Select a Slack workspace"
              value={selectedIntegration}
              onChange={(value) => setSelectedIntegration(value || '')}
              data={integrationOptions}
              required
            />

            {selectedIntegration && (
              <>
                {canFetchChannels ? (
                  <Select
                    label="Channel"
                    placeholder={loadingChannels ? "Loading channels..." : "Select a channel"}
                    value={selectedChannel}
                    onChange={(value) => setSelectedChannel(value || '')}
                    data={availableChannels}
                    searchable
                    disabled={loadingChannels}
                    required
                  />
                ) : (
                  <TextInput
                    label="Channel Name"
                    placeholder="#general"
                    value={selectedChannel}
                    onChange={(event) => setSelectedChannel(event.currentTarget.value)}
                    description={
                      selectedIntegrationData?.accessType === 'shared' || selectedIntegrationData?.accessType === 'team'
                        ? `Enter the channel name for ${selectedIntegrationData.name}. You have ${selectedIntegrationData.accessType} access to this integration.`
                        : "Enter the Slack channel name (e.g., #general)"
                    }
                    required
                  />
                )}

                {selectedIntegrationData && selectedIntegrationData.accessType !== 'owned' && (
                  <Alert icon={<IconAlertCircle size={16} />} color="blue">
                    <Text size="sm">
                      You have <strong>{selectedIntegrationData.accessType}</strong> access to this integration.
                      {selectedIntegrationData.grantedBy && (
                        <> Shared by <strong>{selectedIntegrationData.grantedBy.name || selectedIntegrationData.grantedBy.email}</strong>.</>
                      )}
                    </Text>
                  </Alert>
                )}
              </>
            )}

            {selectedChannel && !selectedChannel.startsWith('#') && selectedChannel.length > 0 && (
              <Alert icon={<IconAlertCircle size={16} />} color="orange">
                Channel names should start with # (e.g., #general)
              </Alert>
            )}
          </>
        )}

        <Group mt="md">
          <Button
            onClick={handleSave}
            loading={configureChannelMutation.isPending}
            disabled={
              !isActive ||
              !selectedIntegration ||
              !selectedChannel ||
              (!isWorkspace && hasChannelPermission === false)
            }
          >
            {config ? 'Update Configuration' : 'Save Configuration'}
          </Button>
          
          {config && (
            <Button
              variant="outline"
              color="red"
              onClick={handleRemove}
              loading={removeConfigMutation.isPending}
            >
              Remove Configuration
            </Button>
          )}
        </Group>
      </Stack>
    </Card>
  );
}