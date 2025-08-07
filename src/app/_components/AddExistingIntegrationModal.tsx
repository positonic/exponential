'use client';

import { useState } from 'react';
import {
  Modal,
  Stack,
  Text,
  Card,
  Group,
  Badge,
  Button,
  Alert,
  Loader,
  Checkbox,
} from '@mantine/core';
import {
  IconPlug,
  IconAlertCircle,
  IconCheck,
  IconBrandSlack,
  IconBrandNotion,
  IconCalendarEvent,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { api } from '~/trpc/react';

interface AddExistingIntegrationModalProps {
  opened: boolean;
  onClose: () => void;
  teamId: string;
  onIntegrationAdded: () => void;
}

const getProviderIcon = (provider: string) => {
  switch (provider.toLowerCase()) {
    case 'slack':
      return IconBrandSlack;
    case 'notion':
      return IconBrandNotion;
    case 'monday':
      return IconCalendarEvent;
    default:
      return IconPlug;
  }
};

const getProviderColor = (provider: string) => {
  switch (provider.toLowerCase()) {
    case 'slack':
      return 'blue';
    case 'notion':
      return 'violet';
    case 'monday':
      return 'orange';
    default:
      return 'gray';
  }
};

export function AddExistingIntegrationModal({ 
  opened, 
  onClose, 
  teamId, 
  onIntegrationAdded 
}: AddExistingIntegrationModalProps) {
  const [selectedIntegrations, setSelectedIntegrations] = useState<Set<string>>(new Set());
  

  // Get all accessible integrations that could be added to the team
  const { data: availableIntegrations, isLoading } = api.integrationPermission.getTeamMemberIntegrations.useQuery(
    { teamId },
    { enabled: opened }
  );

  // Mutation to add integrations to team
  const addIntegrationsToTeam = api.integrationPermission.addIntegrationsToTeam.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Integrations Added',
        message: 'Selected integrations have been added to the team successfully.',
        color: 'green',
      });
      setSelectedIntegrations(new Set());
      onIntegrationAdded();
      onClose();
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to add integrations to team',
        color: 'red',
      });
    },
  });

  const handleIntegrationToggle = (integrationId: string) => {
    const newSelection = new Set(selectedIntegrations);
    if (newSelection.has(integrationId)) {
      newSelection.delete(integrationId);
    } else {
      newSelection.add(integrationId);
    }
    setSelectedIntegrations(newSelection);
  };

  const handleAddIntegrations = () => {
    if (selectedIntegrations.size === 0) {
      notifications.show({
        title: 'No Selection',
        message: 'Please select at least one integration to add.',
        color: 'orange',
      });
      return;
    }

    addIntegrationsToTeam.mutate({
      teamId,
      integrationIds: Array.from(selectedIntegrations),
    });
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Add Existing Integrations"
      size="lg"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Select integrations from team members to add to this team. This will allow all team members to use these integrations in their projects.
        </Text>

        {isLoading ? (
          <Group>
            <Loader size="sm" />
            <Text size="sm">Loading available integrations...</Text>
          </Group>
        ) : !availableIntegrations || availableIntegrations.length === 0 ? (
          <Alert icon={<IconAlertCircle size={16} />} color="blue">
            <Text size="sm">
              No integrations are available to add. Team members need to create integrations first, or existing integrations are already added to this team.
            </Text>
          </Alert>
        ) : (
          <Stack gap="sm">
            {availableIntegrations.map((integration) => {
              const IconComponent = getProviderIcon(integration.provider);
              const providerColor = getProviderColor(integration.provider);
              const isSelected = selectedIntegrations.has(integration.id);
              
              return (
                <Card
                  key={integration.id}
                  withBorder
                  padding="md"
                  className={`cursor-pointer transition-colors ${
                    isSelected ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-950/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  }`}
                  onClick={() => handleIntegrationToggle(integration.id)}
                >
                  <Group justify="space-between" align="flex-start">
                    <Group align="flex-start" gap="md" style={{ flex: 1 }}>
                      <Checkbox
                        checked={isSelected}
                        onChange={() => handleIntegrationToggle(integration.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      
                      <IconComponent size={24} color={providerColor} />
                      
                      <Stack gap="xs" style={{ flex: 1 }}>
                        <Group gap="xs" align="center">
                          <Text fw={500} size="md">
                            {integration.name}
                          </Text>
                          <Badge size="sm" variant="light" color={providerColor}>
                            {integration.provider}
                          </Badge>
                          <Badge size="sm" variant="outline" color="gray">
                            {integration.status}
                          </Badge>
                        </Group>
                        
                        <Text size="sm" c="dimmed">
                          {integration.description || 'No description provided'}
                        </Text>
                        
                        <Text size="xs" c="dimmed">
                          Owner: {integration.user?.name || integration.user?.email}
                        </Text>
                      </Stack>
                    </Group>
                  </Group>
                </Card>
              );
            })}
          </Stack>
        )}

        <Group justify="flex-end" mt="md">
          <Button variant="light" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleAddIntegrations}
            loading={addIntegrationsToTeam.isPending}
            disabled={selectedIntegrations.size === 0}
            leftSection={<IconCheck size={16} />}
          >
            Add {selectedIntegrations.size > 0 ? `${selectedIntegrations.size} ` : ''}Integration{selectedIntegrations.size === 1 ? '' : 's'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}