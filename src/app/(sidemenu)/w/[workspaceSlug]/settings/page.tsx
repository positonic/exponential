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
  Modal,
  Select,
  Alert,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconTrash, IconCrown, IconShield, IconUser, IconEye, IconUserPlus, IconPlug, IconChevronRight, IconFlame, IconRocket, IconMail, IconPlugConnected, IconLayoutList, IconCoin, IconSun, IconCalendarCheck } from '@tabler/icons-react';
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
  const [emailModalOpened, { open: openEmailModal, close: closeEmailModal }] = useDisclosure(false);
  const [emailProvider, setEmailProvider] = useState<string>('gmail');
  const [emailAddress, setEmailAddress] = useState('');
  const [emailAppPassword, setEmailAppPassword] = useState('');
  const [emailImapHost, setEmailImapHost] = useState('');
  const [emailSmtpHost, setEmailSmtpHost] = useState('');

  const utils = api.useUtils();

  // Workspace data for effort unit
  const { data: workspaceData } = api.workspace.getBySlug.useQuery(
    { slug: workspace?.slug ?? '' },
    { enabled: !!workspace?.slug }
  );
  const currentEffortUnit = (workspaceData?.effortUnit as EffortUnit | undefined) ?? 'STORY_POINTS';
  const advancedActionsEnabled = workspaceData?.enableAdvancedActions ?? false;
  const detailedActionsEnabled = workspaceData?.enableDetailedActions ?? false;
  const bountiesEnabled = workspaceData?.enableBounties ?? false;
  const dailyPlanBannerEnabled = workspaceData?.enableDailyPlanBanner ?? true;
  const weeklyReviewBannerEnabled = workspaceData?.enableWeeklyReviewBanner ?? true;

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

  const updateDetailedActionsMutation = api.workspace.update.useMutation({
    onSuccess: () => {
      void utils.workspace.getBySlug.invalidate();
      notifications.show({
        title: 'Settings Updated',
        message: detailedActionsEnabled
          ? 'Detailed action pages have been disabled'
          : 'Detailed action pages have been enabled',
        color: 'green',
        autoClose: 3000,
      });
    },
  });

  const updateBountiesMutation = api.workspace.update.useMutation({
    onSuccess: () => {
      void utils.workspace.getBySlug.invalidate();
      notifications.show({
        title: 'Settings Updated',
        message: bountiesEnabled
          ? 'Bounties have been disabled'
          : 'Bounties have been enabled',
        color: 'green',
        autoClose: 3000,
      });
    },
  });

  const updateDailyPlanBannerMutation = api.workspace.update.useMutation({
    onSuccess: () => {
      void utils.workspace.getBySlug.invalidate();
      notifications.show({
        title: 'Settings Updated',
        message: dailyPlanBannerEnabled
          ? 'Daily plan banner has been disabled'
          : 'Daily plan banner has been enabled',
        color: 'green',
        autoClose: 3000,
      });
    },
  });

  const updateWeeklyReviewBannerMutation = api.workspace.update.useMutation({
    onSuccess: () => {
      void utils.workspace.getBySlug.invalidate();
      notifications.show({
        title: 'Settings Updated',
        message: weeklyReviewBannerEnabled
          ? 'Weekly review banner has been disabled'
          : 'Weekly review banner has been enabled',
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

  // Workspace email configuration
  const { data: emailStatus, refetch: refetchEmailStatus } = api.integration.getWorkspaceEmailStatus.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId }
  );

  const createEmailMutation = api.integration.createEmailIntegration.useMutation({
    onSuccess: () => {
      void refetchEmailStatus();
      closeEmailModal();
      setEmailAddress('');
      setEmailAppPassword('');
      setEmailImapHost('');
      setEmailSmtpHost('');
      setEmailProvider('gmail');
      notifications.show({
        title: 'Email Connected',
        message: 'Workspace email has been configured successfully.',
        color: 'green',
        autoClose: 3000,
      });
    },
    onError: (error) => {
      notifications.show({
        title: 'Email Connection Failed',
        message: error.message,
        color: 'red',
      });
    },
  });

  const removeEmailMutation = api.integration.removeWorkspaceEmail.useMutation({
    onSuccess: () => {
      void refetchEmailStatus();
      notifications.show({
        title: 'Email Removed',
        message: 'Workspace-specific email has been removed. Agents will use your default email.',
        color: 'blue',
        autoClose: 3000,
      });
    },
  });

  const handleSaveEmail = () => {
    if (!workspaceId || !emailAddress || !emailAppPassword) return;
    createEmailMutation.mutate({
      name: `${workspace?.name ?? 'Workspace'} Email`,
      emailAddress,
      appPassword: emailAppPassword,
      emailProvider: emailProvider as 'gmail' | 'outlook' | 'custom',
      imapHost: emailImapHost || undefined,
      smtpHost: emailSmtpHost || undefined,
      workspaceId,
    });
  };

  const handleRemoveWorkspaceEmail = () => {
    if (!workspaceId) return;
    removeEmailMutation.mutate({ workspaceId });
  };

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

        {/* Detailed Action Pages */}
        <Card className="bg-surface-secondary border-border-primary" withBorder>
          <Group justify="space-between" align="flex-start">
            <Group gap="md">
              <IconLayoutList size={24} className="text-text-muted" />
              <div>
                <Title order={3} className="text-text-primary">
                  Detailed Action Pages
                </Title>
                <Text size="sm" className="text-text-muted" maw={500}>
                  Enable full detail pages for actions with activity threads, comments,
                  and a properties sidebar. Individual projects can override this setting.
                </Text>
              </div>
            </Group>
            <Switch
              checked={detailedActionsEnabled}
              onChange={(event) => {
                if (!workspaceId) return;
                updateDetailedActionsMutation.mutate({
                  workspaceId,
                  enableDetailedActions: event.currentTarget.checked,
                });
              }}
              disabled={!canEdit || updateDetailedActionsMutation.isPending}
              size="lg"
            />
          </Group>
        </Card>

        {/* Bounties */}
        <Card className="bg-surface-secondary border-border-primary" withBorder>
          <Group justify="space-between" align="flex-start">
            <Group gap="md">
              <IconCoin size={24} className="text-text-muted" />
              <div>
                <Title order={3} className="text-text-primary">
                  Bounties
                </Title>
                <Text size="sm" className="text-text-muted" maw={500}>
                  Enable bounty rewards on actions in public projects.
                  Individual projects can override this setting.
                </Text>
              </div>
            </Group>
            <Switch
              checked={bountiesEnabled}
              onChange={(event) => {
                if (!workspaceId) return;
                updateBountiesMutation.mutate({
                  workspaceId,
                  enableBounties: event.currentTarget.checked,
                });
              }}
              disabled={!canEdit || updateBountiesMutation.isPending}
              size="lg"
            />
          </Group>
        </Card>

        {/* Daily Plan Banner */}
        <Card className="bg-surface-secondary border-border-primary" withBorder>
          <Group justify="space-between" align="flex-start">
            <Group gap="md">
              <IconSun size={24} className="text-text-muted" />
              <div>
                <Title order={3} className="text-text-primary">
                  Daily Plan Banner
                </Title>
                <Text size="sm" className="text-text-muted" maw={500}>
                  Show a daily planning reminder on the home page when the daily plan has not been completed.
                </Text>
              </div>
            </Group>
            <Switch
              checked={dailyPlanBannerEnabled}
              onChange={(event) => {
                if (!workspaceId) return;
                updateDailyPlanBannerMutation.mutate({
                  workspaceId,
                  enableDailyPlanBanner: event.currentTarget.checked,
                });
              }}
              disabled={!canEdit || updateDailyPlanBannerMutation.isPending}
              size="lg"
            />
          </Group>
        </Card>

        {/* Weekly Review Banner */}
        <Card className="bg-surface-secondary border-border-primary" withBorder>
          <Group justify="space-between" align="flex-start">
            <Group gap="md">
              <IconCalendarCheck size={24} className="text-text-muted" />
              <div>
                <Title order={3} className="text-text-primary">
                  Weekly Review Banner
                </Title>
                <Text size="sm" className="text-text-muted" maw={500}>
                  Show a weekly review reminder on the home page when the weekly review has not been completed.
                </Text>
              </div>
            </Group>
            <Switch
              checked={weeklyReviewBannerEnabled}
              onChange={(event) => {
                if (!workspaceId) return;
                updateWeeklyReviewBannerMutation.mutate({
                  workspaceId,
                  enableWeeklyReviewBanner: event.currentTarget.checked,
                });
              }}
              disabled={!canEdit || updateWeeklyReviewBannerMutation.isPending}
              size="lg"
            />
          </Group>
        </Card>

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

        {/* Email Account */}
        <Card className="bg-surface-secondary border-border-primary" withBorder>
          <Group justify="space-between" align="flex-start">
            <Group gap="md">
              <IconMail size={24} className="text-text-muted" />
              <div>
                <Title order={3} className="text-text-primary">
                  Email Account
                </Title>
                <Text size="sm" className="text-text-muted" maw={500}>
                  Configure which email address agents use when operating in this workspace.
                </Text>
              </div>
            </Group>
          </Group>

          <Stack gap="sm" mt="md">
            {emailStatus?.isWorkspaceSpecific ? (
              <Group justify="space-between">
                <div>
                  <Text size="sm" className="text-text-secondary">
                    {emailStatus.email}
                  </Text>
                  <Text size="xs" className="text-text-muted">
                    Workspace-specific email
                  </Text>
                </div>
                <Group gap="xs">
                  <Button variant="light" size="xs" onClick={openEmailModal}>
                    Change
                  </Button>
                  <Button
                    variant="subtle"
                    size="xs"
                    color="red"
                    onClick={handleRemoveWorkspaceEmail}
                    loading={removeEmailMutation.isPending}
                  >
                    Remove
                  </Button>
                </Group>
              </Group>
            ) : emailStatus ? (
              <Group justify="space-between">
                <div>
                  <Text size="sm" className="text-text-secondary">
                    Using default email: {emailStatus.email}
                  </Text>
                  <Text size="xs" className="text-text-muted">
                    From your account settings
                  </Text>
                </div>
                <Button variant="light" size="xs" onClick={openEmailModal}>
                  Override for this workspace
                </Button>
              </Group>
            ) : (
              <Group justify="space-between">
                <Text size="sm" className="text-text-muted">
                  No email configured
                </Text>
                <Button variant="light" size="xs" onClick={openEmailModal}>
                  Add email
                </Button>
              </Group>
            )}
          </Stack>
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

      {/* Email Configuration Modal */}
      <Modal
        opened={emailModalOpened}
        onClose={closeEmailModal}
        title="Configure Workspace Email"
        size="md"
      >
        <Stack gap="md">
          <Alert
            icon={<IconPlugConnected size={16} />}
            title="Email Setup"
            color="blue"
          >
            Connect an email for agents to use in this workspace. You&apos;ll need an App Password — not your regular password.
            For Gmail: Google Account &rarr; Security &rarr; 2-Step Verification &rarr; App Passwords.
          </Alert>

          <Select
            label="Email Provider"
            data={[
              { value: 'gmail', label: 'Gmail / Google Workspace' },
              { value: 'outlook', label: 'Outlook / Microsoft 365' },
              { value: 'custom', label: 'Custom (IMAP/SMTP)' },
            ]}
            value={emailProvider}
            onChange={(v) => setEmailProvider(v ?? 'gmail')}
          />

          <TextInput
            label="Email Address"
            placeholder="you@example.com"
            required
            value={emailAddress}
            onChange={(e) => setEmailAddress(e.currentTarget.value)}
          />

          <TextInput
            label="App Password"
            placeholder="xxxx-xxxx-xxxx-xxxx"
            required
            type="password"
            value={emailAppPassword}
            onChange={(e) => setEmailAppPassword(e.currentTarget.value)}
          />

          {emailProvider === 'custom' && (
            <>
              <TextInput
                label="IMAP Host"
                placeholder="imap.example.com"
                value={emailImapHost}
                onChange={(e) => setEmailImapHost(e.currentTarget.value)}
              />
              <TextInput
                label="SMTP Host"
                placeholder="smtp.example.com"
                value={emailSmtpHost}
                onChange={(e) => setEmailSmtpHost(e.currentTarget.value)}
              />
            </>
          )}

          <Group justify="flex-end" mt="md">
            <Button variant="subtle" onClick={closeEmailModal}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveEmail}
              loading={createEmailMutation.isPending}
              disabled={!emailAddress || !emailAppPassword}
            >
              Connect Email
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
