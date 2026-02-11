'use client';

import {
  Container,
  Title,
  Card,
  Text,
  TextInput,
  Textarea,
  Button,
  Group,
  Stack,
  Skeleton,
  Avatar,
  Badge,
  Table,
  ActionIcon,
  Tooltip,
  Divider,
  SegmentedControl,
  Switch,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconTrash, IconCrown, IconShield, IconUser, IconEye, IconUserPlus, IconPlug, IconChevronRight, IconFlame, IconRocket } from '@tabler/icons-react';
import Link from 'next/link';
import { useState } from 'react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';
import { InviteMemberModal } from '~/app/_components/InviteMemberModal';
import { PendingInvitationsTable } from '~/app/_components/PendingInvitationsTable';
import { WorkspaceTeamsSection } from '~/app/_components/WorkspaceTeamsSection';
import { FirefliesWizardModal } from '~/app/_components/integrations/FirefliesWizardModal';
import { FirefliesIntegrationsList } from '~/app/_components/integrations/FirefliesIntegrationsList';
import { EFFORT_UNIT_OPTIONS, type EffortUnit } from '~/types/effort';
import { notifications } from '@mantine/notifications';

const roleIcons = {
  owner: IconCrown,
  admin: IconShield,
  member: IconUser,
  viewer: IconEye,
};

const roleColors = {
  owner: 'yellow',
  admin: 'blue',
  member: 'gray',
  viewer: 'gray',
};

export default function WorkspaceSettingsPage() {
  const { workspace, workspaceId, isLoading, userRole, refetchWorkspace } = useWorkspace();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [inviteModalOpened, { open: openInviteModal, close: closeInviteModal }] = useDisclosure(false);
  const [firefliesModalOpened, { open: openFirefliesModal, close: closeFirefliesModal }] = useDisclosure(false);

  const utils = api.useUtils();

  // Workspace data for effort unit
  const { data: workspaceData } = api.workspace.getBySlug.useQuery(
    { slug: workspace?.slug ?? '' },
    { enabled: !!workspace?.slug }
  );
  const currentEffortUnit = (workspaceData?.effortUnit as EffortUnit | undefined) ?? 'STORY_POINTS';
  const advancedActionsEnabled = workspaceData?.enableAdvancedActions ?? false;

  const updateAdvancedActionsMutation = api.workspace.update.useMutation({
    onSuccess: () => {
      void utils.workspace.getBySlug.invalidate();
      notifications.show({
        title: 'Settings Updated',
        message: advancedActionsEnabled
          ? 'Advanced action features have been disabled'
          : 'Advanced action features have been enabled',
        color: 'green',
        autoClose: 3000,
      });
    },
  });

  const updateEffortUnitMutation = api.workspace.update.useMutation({
    onSuccess: () => {
      void utils.workspace.getBySlug.invalidate();
      notifications.show({
        title: 'Effort Unit Updated',
        message: 'Estimation method has been updated',
        color: 'green',
        autoClose: 3000,
      });
    },
  });

  const updateMutation = api.workspace.update.useMutation({
    onSuccess: () => {
      refetchWorkspace();
      void utils.workspace.list.invalidate();
      setIsEditing(false);
    },
  });

  const removeMemberMutation = api.workspace.removeMember.useMutation({
    onSuccess: () => {
      refetchWorkspace();
    },
  });

  const handleStartEdit = () => {
    if (workspace) {
      setName(workspace.name);
      setDescription(workspace.description ?? '');
      setIsEditing(true);
    }
  };

  const handleSave = () => {
    if (!workspaceId) return;
    updateMutation.mutate({
      workspaceId,
      name: name || undefined,
      description: description || undefined,
    });
  };

  const handleRemoveMember = (userId: string) => {
    if (!workspaceId) return;
    if (confirm('Are you sure you want to remove this member?')) {
      removeMemberMutation.mutate({ workspaceId, userId });
    }
  };

  if (isLoading) {
    return (
      <Container size="md" className="py-8">
        <Skeleton height={40} width={300} mb="xl" />
        <Skeleton height={200} mb="lg" />
        <Skeleton height={300} />
      </Container>
    );
  }

  if (!workspace) {
    return (
      <Container size="md" className="py-8">
        <Text className="text-text-secondary">Workspace not found</Text>
      </Container>
    );
  }

  const canEdit = userRole === 'owner' || userRole === 'admin';
  const canManageMembers = userRole === 'owner' || userRole === 'admin';

  return (
    <Container size="md" className="py-8">
      <Title order={1} className="text-3xl font-bold text-text-primary mb-8">
        Workspace Settings
      </Title>

      <Stack gap="lg">
        {/* General Settings */}
        <Card className="bg-surface-secondary border-border-primary" withBorder>
          <Title order={3} className="text-text-primary mb-4">
            General
          </Title>

          {isEditing ? (
            <Stack gap="md">
              <TextInput
                label="Workspace Name"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                classNames={{
                  input: 'bg-surface-primary border-border-primary text-text-primary',
                  label: 'text-text-secondary',
                }}
              />
              <Textarea
                label="Description"
                value={description}
                onChange={(e) => setDescription(e.currentTarget.value)}
                classNames={{
                  input: 'bg-surface-primary border-border-primary text-text-primary',
                  label: 'text-text-secondary',
                }}
              />
              <Group>
                <Button
                  onClick={handleSave}
                  loading={updateMutation.isPending}
                  color="brand"
                >
                  Save Changes
                </Button>
                <Button
                  variant="subtle"
                  onClick={() => setIsEditing(false)}
                  className="text-text-secondary"
                >
                  Cancel
                </Button>
              </Group>
            </Stack>
          ) : (
            <Stack gap="md">
              <div>
                <Text size="sm" className="text-text-muted mb-1">Name</Text>
                <Text className="text-text-primary">{workspace.name}</Text>
              </div>
              <div>
                <Text size="sm" className="text-text-muted mb-1">Slug</Text>
                <Text className="text-text-secondary font-mono">{workspace.slug}</Text>
              </div>
              <div>
                <Text size="sm" className="text-text-muted mb-1">Type</Text>
                <Badge color={workspace.type === 'personal' ? 'gray' : 'blue'}>
                  {workspace.type}
                </Badge>
              </div>
              {workspace.description && (
                <div>
                  <Text size="sm" className="text-text-muted mb-1">Description</Text>
                  <Text className="text-text-secondary">{workspace.description}</Text>
                </div>
              )}
              {canEdit && (
                <Button
                  variant="light"
                  onClick={handleStartEdit}
                  className="w-fit"
                >
                  Edit Settings
                </Button>
              )}
            </Stack>
          )}
        </Card>

        {/* Members */}
        <Card className="bg-surface-secondary border-border-primary" withBorder>
          <Group justify="space-between" className="mb-4">
            <Title order={3} className="text-text-primary">
              Members
            </Title>
            {canManageMembers && (
              <Button
                variant="light"
                leftSection={<IconUserPlus size={16} />}
                onClick={openInviteModal}
              >
                Invite Member
              </Button>
            )}
          </Group>

          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th className="text-text-muted">Member</Table.Th>
                <Table.Th className="text-text-muted">Role</Table.Th>
                {canManageMembers && <Table.Th className="text-text-muted">Actions</Table.Th>}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {workspace.members?.map((member) => {
                const RoleIcon = roleIcons[member.role as keyof typeof roleIcons] ?? IconUser;
                return (
                  <Table.Tr key={member.userId}>
                    <Table.Td>
                      <Group gap="sm">
                        <Avatar
                          src={member.user.image}
                          size="sm"
                          radius="xl"
                          className="bg-brand-primary"
                        >
                          {member.user.name?.charAt(0).toUpperCase() ?? 'U'}
                        </Avatar>
                        <div>
                          <Text size="sm" className="text-text-primary">
                            {member.user.name ?? 'Unknown'}
                          </Text>
                          <Text size="xs" className="text-text-muted">
                            {member.user.email}
                          </Text>
                        </div>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        color={roleColors[member.role as keyof typeof roleColors] ?? 'gray'}
                        leftSection={<RoleIcon size={12} />}
                      >
                        {member.role}
                      </Badge>
                    </Table.Td>
                    {canManageMembers && (
                      <Table.Td>
                        {member.role !== 'owner' && (
                          <Tooltip label="Remove member">
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              onClick={() => handleRemoveMember(member.userId)}
                              loading={removeMemberMutation.isPending}
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </Table.Td>
                    )}
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>

          {/* Pending Invitations */}
          <Divider my="lg" />
          <Title order={4} className="text-text-primary mb-3">
            Pending Invitations
          </Title>
          <PendingInvitationsTable
            workspaceId={workspaceId!}
            canManage={canManageMembers}
          />
        </Card>

        {/* Advanced Action Features */}
        <Card className="bg-surface-secondary border-border-primary" withBorder>
          <Group justify="space-between" align="flex-start">
            <Group gap="md">
              <IconRocket size={24} className="text-text-muted" />
              <div>
                <Title order={3} className="text-text-primary">
                  Advanced Action Features
                </Title>
                <Text size="sm" className="text-text-muted" maw={500}>
                  Enable epics, sprint assignment, effort estimates, and dependency tracking for actions in this workspace.
                </Text>
              </div>
            </Group>
            <Switch
              checked={advancedActionsEnabled}
              onChange={(event) => {
                if (!workspaceId) return;
                updateAdvancedActionsMutation.mutate({
                  workspaceId,
                  enableAdvancedActions: event.currentTarget.checked,
                });
              }}
              disabled={!canEdit || updateAdvancedActionsMutation.isPending}
              size="lg"
            />
          </Group>
        </Card>

        {/* Effort Estimation */}
        {advancedActionsEnabled && (
        <Card className="bg-surface-secondary border-border-primary" withBorder>
          <Group gap="md" mb="md">
            <IconFlame size={24} className="text-text-muted" />
            <div>
              <Title order={3} className="text-text-primary">
                Effort Estimation
              </Title>
              <Text size="sm" className="text-text-muted">
                Choose how your team estimates task effort
              </Text>
            </div>
          </Group>

          <SegmentedControl
            value={currentEffortUnit}
            onChange={(value) => {
              if (!workspaceId) return;
              updateEffortUnitMutation.mutate({
                workspaceId,
                effortUnit: value as EffortUnit,
              });
            }}
            data={EFFORT_UNIT_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
            fullWidth
            disabled={!canEdit}
          />

          <Text size="xs" className="text-text-muted mt-3">
            Changing the estimation method will not convert existing effort values on tasks.
          </Text>
        </Card>
        )}

        {/* Plugins */}
        <Card
          className="bg-surface-secondary border-border-primary cursor-pointer hover:bg-surface-hover transition-colors"
          withBorder
          component={Link}
          href={`/w/${workspace.slug}/settings/plugins`}
        >
          <Group justify="space-between">
            <Group gap="md">
              <IconPlug size={24} className="text-text-muted" />
              <div>
                <Title order={3} className="text-text-primary">
                  Plugins
                </Title>
                <Text size="sm" className="text-text-muted">
                  Enable or disable plugins for this workspace
                </Text>
              </div>
            </Group>
            <IconChevronRight size={20} className="text-text-muted" />
          </Group>
        </Card>

        {/* Integrations */}
        <Card className="bg-surface-secondary border-border-primary" withBorder>
          <Group justify="space-between" align="center" mb="md">
            <Title order={3} className="text-text-primary">
              Integrations
            </Title>
            <Button
              variant="light"
              size="sm"
              onClick={openFirefliesModal}
            >
              Add Fireflies
            </Button>
          </Group>
          <FirefliesIntegrationsList />
        </Card>

        {/* Teams */}
        <WorkspaceTeamsSection
          workspaceId={workspaceId!}
          canManage={canManageMembers}
        />
      </Stack>

      {/* Invite Member Modal */}
      <InviteMemberModal
        workspaceId={workspaceId!}
        opened={inviteModalOpened}
        onClose={closeInviteModal}
        onSuccess={() => {
          refetchWorkspace();
        }}
      />

      {/* Fireflies Wizard Modal */}
      <FirefliesWizardModal
        opened={firefliesModalOpened}
        onClose={closeFirefliesModal}
        teamId={workspaceId ?? undefined}
      />
    </Container>
  );
}
