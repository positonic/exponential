"use client";

import { useState } from "react";
import {
  Card,
  Title,
  Text,
  Button,
  Group,
  Stack,
  Alert,
  Badge,
  Select,
  Checkbox,
  Modal,
  ActionIcon,
  Avatar,
  Divider,
} from "@mantine/core";
import {
  IconShare,
  IconTrash,
  IconUsers,
  IconAlertCircle,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";

interface IntegrationPermissionManagerProps {
  integrationId: string;
  integrationName: string;
  isOwner: boolean;
}

type PermissionType = 'CONFIGURE_CHANNELS' | 'VIEW_INTEGRATION' | 'USE_IN_WORKFLOWS';
type PermissionScope = 'global' | 'team' | 'project';

const PERMISSION_LABELS: Record<PermissionType, string> = {
  'CONFIGURE_CHANNELS': 'Configure Channels',
  'VIEW_INTEGRATION': 'View Integration',
  'USE_IN_WORKFLOWS': 'Use in Workflows',
};

const SCOPE_LABELS: Record<PermissionScope, string> = {
  'global': 'All projects and teams',
  'team': 'Specific team',
  'project': 'Specific project',
};

export function IntegrationPermissionManager({ 
  integrationId, 
  integrationName, 
  isOwner 
}: IntegrationPermissionManagerProps) {
  const [isGrantModalOpen, setIsGrantModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [selectedPermissions, setSelectedPermissions] = useState<PermissionType[]>(['CONFIGURE_CHANNELS']);
  const [selectedScope, setSelectedScope] = useState<PermissionScope>('global');
  const [scopeEntityId, setScopeEntityId] = useState<string>('');

  // Get existing permissions
  const { data: permissions, refetch: refetchPermissions } = api.integrationPermission.getIntegrationPermissions.useQuery(
    { integrationId },
    { enabled: isOwner }
  );

  // Get grantable entities (users and teams)
  const { data: grantableEntities } = api.integrationPermission.getGrantableEntities.useQuery(
    { integrationId },
    { enabled: isOwner }
  );

  // Get permission suggestions
  const { data: suggestions } = api.integrationPermission.getPermissionSuggestions.useQuery(
    { provider: 'slack' }
  );

  // Mutations
  const grantPermissionMutation = api.integrationPermission.grantPermission.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Success',
        message: 'Permission granted successfully',
        color: 'green',
      });
      setIsGrantModalOpen(false);
      void refetchPermissions();
      resetForm();
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to grant permission',
        color: 'red',
      });
    },
  });

  const revokePermissionMutation = api.integrationPermission.revokePermission.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Success',
        message: 'Permission revoked successfully',
        color: 'green',
      });
      void refetchPermissions();
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to revoke permission',
        color: 'red',
      });
    },
  });

  const resetForm = () => {
    setSelectedUserId('');
    setSelectedTeamId('');
    setSelectedPermissions(['CONFIGURE_CHANNELS']);
    setSelectedScope('global');
    setScopeEntityId('');
  };

  const handleGrantPermission = () => {
    if (!selectedUserId && !selectedTeamId) {
      notifications.show({
        title: 'Error',
        message: 'Please select either a user or team',
        color: 'red',
      });
      return;
    }

    if (selectedPermissions.length === 0) {
      notifications.show({
        title: 'Error',
        message: 'Please select at least one permission',
        color: 'red',
      });
      return;
    }

    grantPermissionMutation.mutate({
      integrationId,
      grantedToUserId: selectedUserId || undefined,
      grantedToTeamId: selectedTeamId || undefined,
      permissions: selectedPermissions,
      scope: selectedScope,
      scopeEntityId: scopeEntityId || undefined,
    });
  };

  const handleRevokePermission = (permissionId: string) => {
    revokePermissionMutation.mutate({ permissionId });
  };

  if (!isOwner) {
    return (
      <Alert icon={<IconAlertCircle size={16} />} color="orange">
        You must be the integration owner to manage permissions.
      </Alert>
    );
  }

  const userOptions = grantableEntities?.users.map(user => ({
    value: user.id,
    label: user.name || user.email || 'Unknown User',
  })) || [];

  const teamOptions = grantableEntities?.teams.map(team => ({
    value: team.id,
    label: team.name,
  })) || [];

  return (
    <Card>
      <Group mb="md" justify="space-between">
        <Group>
          <IconShare size={20} />
          <Title order={4}>Permission Management</Title>
        </Group>
        <Button
          leftSection={<IconUsers size={16} />}
          onClick={() => setIsGrantModalOpen(true)}
          size="sm"
        >
          Grant Access
        </Button>
      </Group>

      <Text size="sm" c="dimmed" mb="lg">
        Manage who can configure and use the {integrationName} integration.
      </Text>

      {/* Permission Suggestions */}
      {suggestions && suggestions.length > 0 && (
        <Stack mb="lg">
          <Text size="sm" fw={500}>Suggestions</Text>
          {suggestions.map((suggestion, index) => (
            <Alert key={index} color="blue" icon={<IconAlertCircle size={16} />}>
              <Group justify="space-between">
                <Stack gap={4}>
                  <Text size="sm" fw={500}>{suggestion.title}</Text>
                  <Text size="xs" c="dimmed">{suggestion.description}</Text>
                </Stack>
                <Button
                  size="xs"
                  onClick={() => {
                    setSelectedUserId(suggestion.suggestedAction.grantToUserId || '');
                    setSelectedPermissions([...suggestion.suggestedAction.permissions]);
                    setSelectedScope(suggestion.suggestedAction.scope);
                    setScopeEntityId(suggestion.suggestedAction.scopeEntityId || '');
                    setIsGrantModalOpen(true);
                  }}
                >
                  Grant Access
                </Button>
              </Group>
            </Alert>
          ))}
        </Stack>
      )}

      {/* Existing Permissions */}
      <Stack>
        <Text size="sm" fw={500}>Current Permissions</Text>
        {!permissions || permissions.length === 0 ? (
          <Text size="sm" c="dimmed">No permissions granted yet.</Text>
        ) : (
          permissions.map((permission) => (
            <Card key={permission.id} withBorder p="sm">
              <Group justify="space-between">
                <Group>
                  <Avatar
                    size="sm"
                    src={(permission as any).grantedToUser?.image}
                    name={(permission as any).grantedToUser?.name || (permission as any).grantedToTeam?.name}
                  />
                  <Stack gap={2}>
                    <Text size="sm" fw={500}>
                      {(permission as any).grantedToUser?.name || (permission as any).grantedToTeam?.name}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {(permission as any).grantedToUser?.email || `Team: ${(permission as any).grantedToTeam?.name}`}
                    </Text>
                  </Stack>
                  <Stack gap={2}>
                    <Group gap={4}>
                      {permission.permissions.map((perm) => (
                        <Badge key={perm} size="xs" variant="light">
                          {PERMISSION_LABELS[perm as PermissionType]}
                        </Badge>
                      ))}
                    </Group>
                    <Badge size="xs" variant="outline">
                      {SCOPE_LABELS[permission.scope as PermissionScope]}
                    </Badge>
                  </Stack>
                </Group>
                <ActionIcon
                  color="red"
                  variant="subtle"
                  onClick={() => handleRevokePermission(permission.id)}
                  loading={revokePermissionMutation.isPending}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            </Card>
          ))
        )}
      </Stack>

      {/* Grant Permission Modal */}
      <Modal
        opened={isGrantModalOpen}
        onClose={() => {
          setIsGrantModalOpen(false);
          resetForm();
        }}
        title="Grant Integration Access"
        size="md"
      >
        <Stack>
          <Text size="sm" c="dimmed">
            Give another user or team permission to use this integration.
          </Text>

          <Divider />

          <Select
            label="Grant to User"
            placeholder="Select a user"
            value={selectedUserId}
            onChange={(value) => {
              setSelectedUserId(value || '');
              if (value) setSelectedTeamId('');
            }}
            data={userOptions}
            searchable
            clearable
          />

          <Text size="xs" c="dimmed" ta="center">OR</Text>

          <Select
            label="Grant to Team"
            placeholder="Select a team"
            value={selectedTeamId}
            onChange={(value) => {
              setSelectedTeamId(value || '');
              if (value) setSelectedUserId('');
            }}
            data={teamOptions}
            searchable
            clearable
          />

          <Stack gap={8}>
            <Text size="sm" fw={500}>Permissions</Text>
            {Object.entries(PERMISSION_LABELS).map(([key, label]) => (
              <Checkbox
                key={key}
                label={label}
                checked={selectedPermissions.includes(key as PermissionType)}
                onChange={(event) => {
                  const perm = key as PermissionType;
                  if (event.currentTarget.checked) {
                    setSelectedPermissions([...selectedPermissions, perm]);
                  } else {
                    setSelectedPermissions(selectedPermissions.filter(p => p !== perm));
                  }
                }}
              />
            ))}
          </Stack>

          <Select
            label="Scope"
            value={selectedScope}
            onChange={(value) => setSelectedScope(value as PermissionScope)}
            data={Object.entries(SCOPE_LABELS).map(([key, label]) => ({
              value: key,
              label,
            }))}
          />

          <Group justify="flex-end">
            <Button
              variant="outline"
              onClick={() => {
                setIsGrantModalOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleGrantPermission}
              loading={grantPermissionMutation.isPending}
              disabled={(!selectedUserId && !selectedTeamId) || selectedPermissions.length === 0}
            >
              Grant Access
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
}