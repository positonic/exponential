'use client';

import {
  TextInput,
  Textarea,
  Button,
  Group,
  Stack,
  Skeleton,
  Avatar,
  Badge,
  ActionIcon,
  Tooltip,
  SegmentedControl,
  Switch,
  Modal,
  Select,
  Alert,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconTrash,
  IconUserPlus,
  IconPlug,
  IconFolder,
  IconUsers,
  IconRocket,
  IconMail,
  IconPlugConnected,
  IconCoin,
  IconSun,
  IconCalendarCheck,
  IconBrandSlack,
  IconBrandNotion,
  IconRefresh,
  IconArrowsExchange,
  IconMessageCircle,
  IconSettings,
  IconPalette,
  IconLayoutList,
  IconFlame,
  IconClock,
  IconPlus,
  IconShieldExclamation,
  type Icon as TablerIcon,
} from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';
import { InviteMemberModal } from '~/app/_components/InviteMemberModal';
import { PendingInvitationsTable } from '~/app/_components/PendingInvitationsTable';
import { WorkspaceTeamsSection } from '~/app/_components/WorkspaceTeamsSection';
import { SlackChannelSettings } from '~/app/_components/SlackChannelSettings';
import { ZulipSettings } from '~/app/_components/ZulipSettings';
import { FirefliesWizardModal } from '~/app/_components/integrations/FirefliesWizardModal';
import { FirefliesIntegrationsList } from '~/app/_components/integrations/FirefliesIntegrationsList';
import { EFFORT_UNIT_OPTIONS, type EffortUnit } from '~/types/effort';
import { notifications } from '@mantine/notifications';
import {
  SettingsShell,
  SettingsHero,
  SettingsLayout,
  SettingsSidebar,
  SettingsSection,
  SettingsField,
  SettingsPill,
  SettingsFieldButton,
  SettingsDangerRow,
  SettingsDangerZone,
  SettingsRowLink,
  type SidebarGroup,
} from '~/app/_components/settings/SettingsShell';

type SectionId =
  | 'general'
  | 'members'
  | 'teams'
  | 'features'
  | 'integrations'
  | 'plugins'
  | 'danger';

export default function WorkspaceSettingsPage() {
  const router = useRouter();
  const { workspace, workspaceId, isLoading, userRole, refetchWorkspace } = useWorkspace();
  const [section, setSection] = useState<SectionId>('general');
  const [editingField, setEditingField] = useState<'name' | 'description' | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] = useDisclosure(false);
  const [inviteModalOpened, { open: openInviteModal, close: closeInviteModal }] = useDisclosure(false);
  const [firefliesModalOpened, { open: openFirefliesModal, close: closeFirefliesModal }] = useDisclosure(false);
  const [emailModalOpened, { open: openEmailModal, close: closeEmailModal }] = useDisclosure(false);
  const [emailProvider, setEmailProvider] = useState<string>('gmail');
  const [emailAddress, setEmailAddress] = useState('');
  const [emailAppPassword, setEmailAppPassword] = useState('');
  const [emailImapHost, setEmailImapHost] = useState('');
  const [emailSmtpHost, setEmailSmtpHost] = useState('');

  const utils = api.useUtils();

  const deleteWorkspaceMutation = api.workspace.delete.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Workspace Deleted',
        message: 'The workspace has been permanently deleted.',
        color: 'red',
        autoClose: 3000,
      });
      router.push('/');
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message,
        color: 'red',
        autoClose: 5000,
      });
    },
  });

  const handleDeleteWorkspace = () => {
    if (!workspaceId || deleteConfirmName !== workspace?.name) return;
    deleteWorkspaceMutation.mutate({ workspaceId });
  };

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
  const emailNotificationsEnabled = workspaceData?.enableEmailNotifications ?? true;

  const featureSuccess = (message: string) => () => {
    void utils.workspace.getBySlug.invalidate();
    notifications.show({
      title: 'Settings Updated',
      message,
      color: 'green',
      autoClose: 3000,
    });
  };

  const updateAdvancedActionsMutation = api.workspace.update.useMutation({
    onSuccess: featureSuccess(
      advancedActionsEnabled
        ? 'Advanced action features have been disabled'
        : 'Advanced action features have been enabled'
    ),
  });
  const updateDetailedActionsMutation = api.workspace.update.useMutation({
    onSuccess: featureSuccess(
      detailedActionsEnabled
        ? 'Detailed action pages have been disabled'
        : 'Detailed action pages have been enabled'
    ),
  });
  const updateBountiesMutation = api.workspace.update.useMutation({
    onSuccess: featureSuccess(
      bountiesEnabled ? 'Bounties have been disabled' : 'Bounties have been enabled'
    ),
  });
  const updateDailyPlanBannerMutation = api.workspace.update.useMutation({
    onSuccess: featureSuccess(
      dailyPlanBannerEnabled
        ? 'Daily plan banner has been disabled'
        : 'Daily plan banner has been enabled'
    ),
  });
  const updateWeeklyReviewBannerMutation = api.workspace.update.useMutation({
    onSuccess: featureSuccess(
      weeklyReviewBannerEnabled
        ? 'Weekly review banner has been disabled'
        : 'Weekly review banner has been enabled'
    ),
  });
  const updateEmailNotificationsMutation = api.workspace.update.useMutation({
    onSuccess: featureSuccess(
      emailNotificationsEnabled
        ? 'Email notifications have been disabled'
        : 'Email notifications have been enabled'
    ),
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
      setEditingField(null);
    },
  });

  const removeMemberMutation = api.workspace.removeMember.useMutation({
    onSuccess: () => {
      refetchWorkspace();
    },
  });

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

  const { data: notionConfig, refetch: refetchNotionConfig } = api.workspace.getNotionConfig.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId }
  );

  const { data: notionConnections } = api.integration.listNotionConnections.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: !!workspaceId }
  );

  const updateNotionConfigMutation = api.workspace.updateNotionConfig.useMutation({
    onSuccess: () => {
      void refetchNotionConfig();
      notifications.show({
        title: 'Notion Settings Updated',
        message: 'Workspace Notion configuration has been saved.',
        color: 'green',
        autoClose: 3000,
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

  const { data: pendingInvites } = api.workspace.listInvitations.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId }
  );

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

  const handleStartEdit = (field: 'name' | 'description') => {
    if (!workspace) return;
    if (field === 'name') setName(workspace.name);
    if (field === 'description') setDescription(workspace.description ?? '');
    setEditingField(field);
  };

  const handleSave = () => {
    if (!workspaceId) return;
    updateMutation.mutate({
      workspaceId,
      name: editingField === 'name' ? (name || undefined) : undefined,
      description: editingField === 'description' ? (description || undefined) : undefined,
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
      <div className="mx-auto max-w-[1200px] p-10">
        <Skeleton height={40} width={300} mb="xl" />
        <Skeleton height={200} mb="lg" />
        <Skeleton height={300} />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="mx-auto max-w-[1200px] p-10">
        <div className="text-text-secondary">Workspace not found</div>
      </div>
    );
  }

  const canEdit = userRole === 'owner' || userRole === 'admin';
  const canManageMembers = userRole === 'owner' || userRole === 'admin';

  const memberCount = workspace.members?.length ?? 0;
  const pendingCount = pendingInvites?.length ?? 0;
  const featureList = [
    advancedActionsEnabled,
    detailedActionsEnabled,
    bountiesEnabled,
    dailyPlanBannerEnabled,
    weeklyReviewBannerEnabled,
    emailNotificationsEnabled,
  ];
  const featureOn = featureList.filter(Boolean).length;
  const featureTotal = featureList.length;

  const groups: SidebarGroup<SectionId>[] = [
    {
      title: 'Workspace',
      items: [
        { id: 'general', label: 'General', icon: IconFolder },
        { id: 'members', label: 'Members', icon: IconUsers, badge: memberCount },
        { id: 'teams', label: 'Teams', icon: IconUsers },
      ],
    },
    {
      title: 'Configuration',
      items: [
        { id: 'features', label: 'Features', icon: IconRocket, badge: `${featureOn}/${featureTotal}` },
        { id: 'integrations', label: 'Integrations', icon: IconPalette },
        { id: 'plugins', label: 'Plugins', icon: IconPlug },
      ],
    },
    ...(userRole === 'owner'
      ? [{ items: [{ id: 'danger' as const, label: 'Danger zone', icon: IconTrash }] }]
      : []),
  ];

  const workspaceTypeLabel = workspace.type === 'personal' ? 'Personal' : 'Team';

  return (
    <SettingsShell>
      <SettingsHero
        eyebrow={`Workspace · ${workspaceTypeLabel}`}
        icon={IconSettings}
        title={workspace.name}
        description="Configure identity, members, features, and integrations for this workspace. Changes apply to every project inside."
        stats={[
          { label: 'members', value: memberCount },
          { label: 'features on', value: `${featureOn}/${featureTotal}` },
          { label: 'pending invites', value: pendingCount },
        ]}
      />

      <SettingsLayout
        sidebar={
          <SettingsSidebar<SectionId>
            groups={groups}
            activeId={section}
            onSelect={setSection}
          />
        }
      >
        {section === 'general' && (
          <SettingsSection
            icon={IconFolder}
            title="General"
            description="Identity for this workspace. Visible to members and in shared links."
          >
            <SettingsField
              label="Name"
              action={
                canEdit ? (
                  <SettingsFieldButton
                    onClick={() => {
                      if (editingField === 'name') {
                        handleSave();
                      } else {
                        handleStartEdit('name');
                      }
                    }}
                  >
                    {editingField === 'name' ? 'Save' : 'Edit'}
                  </SettingsFieldButton>
                ) : null
              }
            >
              {editingField === 'name' ? (
                <TextInput
                  value={name}
                  onChange={(e) => setName(e.currentTarget.value)}
                  autoFocus
                  size="xs"
                  classNames={{
                    input: 'bg-background-primary border-border-primary text-text-primary',
                  }}
                />
              ) : (
                workspace.name
              )}
            </SettingsField>

            <SettingsField label="Slug" sublabel="Used in URLs" mono>
              exponential.im/<span className="text-text-primary">{workspace.slug}</span>
            </SettingsField>

            <SettingsField label="Type">
              <SettingsPill variant={workspace.type === 'personal' ? 'neutral' : 'team'}>
                {workspaceTypeLabel}
              </SettingsPill>
            </SettingsField>

            <SettingsField
              label="Description"
              sublabel="Injected into every AI agent conversation"
              action={
                canEdit ? (
                  <SettingsFieldButton
                    onClick={() => {
                      if (editingField === 'description') {
                        handleSave();
                      } else {
                        handleStartEdit('description');
                      }
                    }}
                  >
                    {editingField === 'description' ? 'Save' : 'Edit'}
                  </SettingsFieldButton>
                ) : null
              }
            >
              {editingField === 'description' ? (
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.currentTarget.value)}
                  autoFocus
                  size="xs"
                  autosize
                  minRows={2}
                  classNames={{
                    input: 'bg-background-primary border-border-primary text-text-primary',
                  }}
                />
              ) : (
                <span className="text-text-secondary">
                  {workspace.description ?? <span className="text-text-muted">—</span>}
                </span>
              )}
            </SettingsField>
          </SettingsSection>
        )}

        {section === 'members' && (
          <>
            <SettingsSection
              icon={IconUsers}
              title="Members"
              count={`${memberCount} · ${pendingCount} pending`}
              description="People with access to projects, goals, and integrations in this workspace."
              action={
                canManageMembers && (
                  <Button
                    size="xs"
                    leftSection={<IconUserPlus size={14} />}
                    onClick={openInviteModal}
                  >
                    Invite member
                  </Button>
                )
              }
              flush
            >
              <div className="grid grid-cols-[1fr_140px_auto] px-2 pt-3 text-[13px]">
                <div className="border-b border-border-primary px-3.5 pb-2.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                  Member
                </div>
                <div className="border-b border-border-primary px-3.5 pb-2.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                  Role
                </div>
                <div className="border-b border-border-primary px-3.5 pb-2.5" />

                {workspace.members?.map((member) => (
                  <div key={member.userId} className="contents group">
                    <div className="flex items-center gap-2.5 border-b border-border-primary px-3.5 py-2.5 group-hover:bg-background-elevated">
                      <Avatar src={member.user.image} size="sm" radius="xl">
                        {member.user.name?.charAt(0).toUpperCase() ?? 'U'}
                      </Avatar>
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-text-primary truncate">
                          {member.user.name ?? 'Unknown'}
                        </div>
                        <div className="text-[11.5px] text-text-muted truncate">
                          {member.user.email}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center border-b border-border-primary px-3.5 py-2.5 group-hover:bg-background-elevated">
                      <SettingsPill
                        variant={
                          member.role === 'owner'
                            ? 'owner'
                            : member.role === 'admin'
                              ? 'admin'
                              : 'neutral'
                        }
                      >
                        {member.role}
                      </SettingsPill>
                    </div>
                    <div className="flex items-center justify-end border-b border-border-primary px-3.5 py-2.5 group-hover:bg-background-elevated">
                      {canManageMembers && member.role !== 'owner' && (
                        <Tooltip label="Remove member">
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            onClick={() => handleRemoveMember(member.userId)}
                            loading={removeMemberMutation.isPending}
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </SettingsSection>

            {pendingInvites && pendingInvites.length > 0 && (
              <SettingsSection
                icon={IconClock}
                title="Pending invitations"
                count={pendingCount}
                description="Invitations that have not yet been accepted."
              >
                <PendingInvitationsTable
                  workspaceId={workspaceId!}
                  canManage={canManageMembers}
                />
              </SettingsSection>
            )}
          </>
        )}

        {section === 'teams' && (
          <div className="w-full [&>div]:w-full">
            <WorkspaceTeamsSection workspaceId={workspaceId!} canManage={canManageMembers} />
          </div>
        )}

        {section === 'features' && (
          <SettingsSection
            icon={IconRocket}
            title="Features"
            count={`${featureOn}/${featureTotal}`}
            description="Product behaviors and notifications. Members can override their own notifications."
            flush
          >
            <div className="grid grid-cols-[1fr_120px_70px] border-b border-border-primary px-[22px] py-3 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-text-muted">
              <div>Feature</div>
              <div>Last changed</div>
              <div className="text-right">Enabled</div>
            </div>

            <FeatureRow
              icon={IconRocket}
              tag="Product"
              title="Advanced Action Features"
              description="Enable epics, sprint assignment, effort estimates, and dependency tracking for actions in this workspace."
              enabled={advancedActionsEnabled}
              disabled={!canEdit || updateAdvancedActionsMutation.isPending}
              onToggle={(checked) => {
                if (!workspaceId) return;
                updateAdvancedActionsMutation.mutate({
                  workspaceId,
                  enableAdvancedActions: checked,
                });
              }}
            />

            {advancedActionsEnabled && (
              <div className="grid grid-cols-[1fr_120px_70px] items-center gap-3.5 border-t border-border-primary px-[22px] py-3">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-surface-tertiary text-text-secondary flex-shrink-0">
                    <IconFlame size={14} />
                  </span>
                  <div>
                    <div className="flex items-center gap-2 text-[13px] font-medium text-text-primary">
                      Effort Estimation
                      <span className="rounded-sm border border-border-primary px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-[0.04em] text-text-muted">
                        Product
                      </span>
                    </div>
                    <div className="mt-0.5 max-w-[520px] text-[11.5px] leading-[1.45] text-text-muted">
                      How your team estimates task effort. Changing this will not convert existing values.
                    </div>
                  </div>
                </div>
                <div className="text-[11px] tabular-nums text-text-muted">—</div>
                <div className="flex justify-end">
                  <SegmentedControl
                    size="xs"
                    value={currentEffortUnit}
                    onChange={(value) => {
                      if (!workspaceId) return;
                      updateEffortUnitMutation.mutate({
                        workspaceId,
                        effortUnit: value as EffortUnit,
                      });
                    }}
                    data={EFFORT_UNIT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                    disabled={!canEdit}
                  />
                </div>
              </div>
            )}

            <FeatureRow
              icon={IconLayoutList}
              tag="Product"
              title="Detailed Action Pages"
              description="Enable full detail pages for actions with activity threads, comments, and a properties sidebar. Projects can override."
              enabled={detailedActionsEnabled}
              disabled={!canEdit || updateDetailedActionsMutation.isPending}
              onToggle={(checked) => {
                if (!workspaceId) return;
                updateDetailedActionsMutation.mutate({
                  workspaceId,
                  enableDetailedActions: checked,
                });
              }}
            />
            <FeatureRow
              icon={IconCoin}
              tag="Product"
              title="Bounties"
              description="Enable bounty rewards on actions in public projects. Projects can override."
              enabled={bountiesEnabled}
              disabled={!canEdit || updateBountiesMutation.isPending}
              onToggle={(checked) => {
                if (!workspaceId) return;
                updateBountiesMutation.mutate({ workspaceId, enableBounties: checked });
              }}
            />
            <FeatureRow
              icon={IconSun}
              tag="Home"
              title="Daily Plan Banner"
              description="Show a daily planning reminder on the home page when the daily plan has not been completed."
              enabled={dailyPlanBannerEnabled}
              disabled={!canEdit || updateDailyPlanBannerMutation.isPending}
              onToggle={(checked) => {
                if (!workspaceId) return;
                updateDailyPlanBannerMutation.mutate({
                  workspaceId,
                  enableDailyPlanBanner: checked,
                });
              }}
            />
            <FeatureRow
              icon={IconCalendarCheck}
              tag="Home"
              title="Weekly Review Banner"
              description="Show a weekly review reminder on the home page when the weekly review has not been completed."
              enabled={weeklyReviewBannerEnabled}
              disabled={!canEdit || updateWeeklyReviewBannerMutation.isPending}
              onToggle={(checked) => {
                if (!workspaceId) return;
                updateWeeklyReviewBannerMutation.mutate({
                  workspaceId,
                  enableWeeklyReviewBanner: checked,
                });
              }}
            />
            <FeatureRow
              icon={IconMail}
              tag="Notifications"
              title="Email Notifications"
              description="Send emails on assignments and mentions. Members can override in personal settings."
              enabled={emailNotificationsEnabled}
              disabled={!canEdit || updateEmailNotificationsMutation.isPending}
              onToggle={(checked) => {
                if (!workspaceId) return;
                updateEmailNotificationsMutation.mutate({
                  workspaceId,
                  enableEmailNotifications: checked,
                });
              }}
            />
          </SettingsSection>
        )}

        {section === 'integrations' && (
          <>
            <SettingsSection
              icon={IconMail}
              title="Email Account"
              description="Configure which email address agents use when operating in this workspace."
            >
              <Stack gap="sm">
                {emailStatus?.isWorkspaceSpecific ? (
                  <Group justify="space-between">
                    <div>
                      <div className="text-[13px] text-text-secondary">{emailStatus.email}</div>
                      <div className="text-[11.5px] text-text-muted">Workspace-specific email</div>
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
                      <div className="text-[13px] text-text-secondary">
                        Using default email: {emailStatus.email}
                      </div>
                      <div className="text-[11.5px] text-text-muted">
                        From your account settings
                      </div>
                    </div>
                    <Button variant="light" size="xs" onClick={openEmailModal}>
                      Override for this workspace
                    </Button>
                  </Group>
                ) : (
                  <Group justify="space-between">
                    <div className="text-[13px] text-text-muted">No email configured</div>
                    <Button variant="light" size="xs" onClick={openEmailModal}>
                      Add email
                    </Button>
                  </Group>
                )}
              </Stack>
            </SettingsSection>

            {workspaceId && (
              <SettingsSection
                icon={IconBrandSlack}
                title="Slack"
                description="Link a Slack channel so Zoe can provide workspace-wide context including OKRs and project progress."
              >
                <SlackChannelSettings workspace={{ id: workspaceId, name: workspace.name }} />
              </SettingsSection>
            )}

            {workspaceId && (
              <SettingsSection
                icon={IconMessageCircle}
                title="Zulip"
                description="Send workspace notifications to a Zulip stream and direct message users for task assignments and mentions."
              >
                <ZulipSettings
                  workspace={{ id: workspaceId, name: workspace.name }}
                  workspaceSlug={workspace.slug}
                />
              </SettingsSection>
            )}

            <SettingsSection
              icon={IconBrandNotion}
              title="Notion"
              description="Configure default Notion settings for projects in this workspace. Individual projects can override."
            >
              <Stack gap="md">
                {notionConnections && notionConnections.length > 0 ? (
                  <>
                    <div>
                      <div className="mb-2 text-[12.5px] font-medium text-text-secondary">
                        Connected Accounts
                      </div>
                      <Stack gap="xs">
                        {notionConnections.map((connection) => (
                          <Group
                            key={connection.id}
                            gap="sm"
                            className="rounded-md border border-border-primary bg-surface-primary p-2"
                          >
                            <IconBrandNotion size={18} className="text-text-muted" />
                            <div className="flex-1">
                              <div className="text-[13px] text-text-primary">
                                {(connection as { notionWorkspaceName?: string }).notionWorkspaceName ??
                                  connection.name}
                              </div>
                            </div>
                            <Badge
                              size="xs"
                              color={
                                notionConfig?.defaultIntegrationId === connection.id
                                  ? 'green'
                                  : 'gray'
                              }
                              variant={
                                notionConfig?.defaultIntegrationId === connection.id
                                  ? 'filled'
                                  : 'light'
                              }
                            >
                              {notionConfig?.defaultIntegrationId === connection.id
                                ? 'Default'
                                : 'Connected'}
                            </Badge>
                          </Group>
                        ))}
                      </Stack>
                    </div>

                    {canEdit && (
                      <div>
                        <div className="mb-2 text-[12.5px] font-medium text-text-secondary">
                          Default Sync Preferences
                        </div>
                        <Group gap="md" grow>
                          <Select
                            label="Default Account"
                            placeholder="Select default account"
                            size="xs"
                            data={notionConnections.map((c) => ({
                              value: c.id,
                              label:
                                (c as { notionWorkspaceName?: string }).notionWorkspaceName ??
                                c.name,
                            }))}
                            value={notionConfig?.defaultIntegrationId ?? null}
                            onChange={(value) => {
                              if (!workspaceId) return;
                              updateNotionConfigMutation.mutate({
                                workspaceId,
                                notionDefaultConfig: {
                                  ...notionConfig,
                                  defaultIntegrationId: value ?? undefined,
                                },
                              });
                            }}
                          />
                          <Select
                            label="Sync Direction"
                            size="xs"
                            data={[
                              { value: 'pull', label: 'Pull from Notion' },
                              { value: 'push', label: 'Push to Notion' },
                              { value: 'bidirectional', label: 'Bidirectional' },
                            ]}
                            value={notionConfig?.syncDirection ?? 'pull'}
                            onChange={(value) => {
                              if (!workspaceId || !value) return;
                              updateNotionConfigMutation.mutate({
                                workspaceId,
                                notionDefaultConfig: {
                                  ...notionConfig,
                                  syncDirection: value as 'pull' | 'push' | 'bidirectional',
                                },
                              });
                            }}
                            leftSection={<IconArrowsExchange size={14} />}
                          />
                          <Select
                            label="Sync Frequency"
                            size="xs"
                            data={[
                              { value: 'manual', label: 'Manual' },
                              { value: 'hourly', label: 'Hourly' },
                              { value: 'daily', label: 'Daily' },
                            ]}
                            value={notionConfig?.syncFrequency ?? 'manual'}
                            onChange={(value) => {
                              if (!workspaceId || !value) return;
                              updateNotionConfigMutation.mutate({
                                workspaceId,
                                notionDefaultConfig: {
                                  ...notionConfig,
                                  syncFrequency: value as 'manual' | 'hourly' | 'daily',
                                },
                              });
                            }}
                            leftSection={<IconRefresh size={14} />}
                          />
                        </Group>
                      </div>
                    )}

                    {canEdit && (
                      <Button
                        variant="light"
                        size="xs"
                        leftSection={<IconPlus size={14} />}
                        className="w-fit"
                        onClick={() => {
                          const params = new URLSearchParams();
                          if (workspaceId) params.set('workspaceId', workspaceId);
                          params.set('redirectUrl', window.location.href);
                          window.location.href = `/api/auth/notion/authorize?${params.toString()}`;
                        }}
                      >
                        Connect another Notion account
                      </Button>
                    )}
                  </>
                ) : (
                  <Group justify="space-between" align="center">
                    <div className="text-[13px] text-text-muted">
                      No Notion accounts connected to this workspace.
                    </div>
                    {canEdit && (
                      <Button
                        variant="light"
                        size="xs"
                        leftSection={<IconBrandNotion size={14} />}
                        onClick={() => {
                          const params = new URLSearchParams();
                          if (workspaceId) params.set('workspaceId', workspaceId);
                          params.set('redirectUrl', window.location.href);
                          window.location.href = `/api/auth/notion/authorize?${params.toString()}`;
                        }}
                      >
                        Connect Notion
                      </Button>
                    )}
                  </Group>
                )}
              </Stack>
            </SettingsSection>

            <SettingsSection
              icon={IconPlug}
              title="Fireflies"
              description="Meeting transcription and insights. Connect one or more Fireflies accounts."
              action={
                <Button
                  variant="light"
                  size="xs"
                  leftSection={<IconPlus size={14} />}
                  onClick={openFirefliesModal}
                >
                  Add
                </Button>
              }
            >
              <FirefliesIntegrationsList />
            </SettingsSection>
          </>
        )}

        {section === 'plugins' && (
          <SettingsSection
            icon={IconPlug}
            title="Plugins"
            description="Enable or disable workspace plugins."
            flush
          >
            <SettingsRowLink
              href={`/w/${workspace.slug}/settings/plugins`}
              icon={IconPlug}
              title="Manage plugins"
              description="Toggle OKRs, CRM, notifications, and other plugins for this workspace."
            />
          </SettingsSection>
        )}

        {section === 'danger' && userRole === 'owner' && (
          <SettingsDangerZone icon={IconShieldExclamation}>
            <SettingsDangerRow
              title="Delete workspace"
              description="Permanently remove this workspace and all projects, actions, goals, outcomes, contacts, and deals. This action cannot be undone."
              action={
                <Button color="red" variant="outline" onClick={openDeleteModal}>
                  Delete workspace
                </Button>
              }
            />
          </SettingsDangerZone>
        )}
      </SettingsLayout>

      <InviteMemberModal
        workspaceId={workspaceId!}
        opened={inviteModalOpened}
        onClose={closeInviteModal}
        onSuccess={() => {
          refetchWorkspace();
        }}
      />

      <FirefliesWizardModal
        opened={firefliesModalOpened}
        onClose={closeFirefliesModal}
        teamId={workspaceId ?? undefined}
      />

      <Modal
        opened={emailModalOpened}
        onClose={closeEmailModal}
        title="Configure Workspace Email"
        size="md"
      >
        <Stack gap="md">
          <Alert icon={<IconPlugConnected size={16} />} title="Email Setup" color="blue">
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

      <Modal
        opened={deleteModalOpened}
        onClose={() => {
          closeDeleteModal();
          setDeleteConfirmName('');
        }}
        title="Delete Workspace"
        centered
      >
        <Stack>
          <Alert color="red" variant="light">
            This will permanently delete the workspace <strong>{workspace?.name}</strong> and all associated data. This action cannot be undone.
          </Alert>
          <TextInput
            label={`Type "${workspace?.name}" to confirm`}
            placeholder={workspace?.name ?? ''}
            value={deleteConfirmName}
            onChange={(e) => setDeleteConfirmName(e.currentTarget.value)}
          />
          <Group justify="flex-end" mt="md">
            <Button
              variant="subtle"
              onClick={() => {
                closeDeleteModal();
                setDeleteConfirmName('');
              }}
            >
              Cancel
            </Button>
            <Button
              color="red"
              onClick={handleDeleteWorkspace}
              loading={deleteWorkspaceMutation.isPending}
              disabled={deleteConfirmName !== workspace?.name}
            >
              Delete Workspace
            </Button>
          </Group>
        </Stack>
      </Modal>
    </SettingsShell>
  );
}

function FeatureRow({
  icon: Icon,
  tag,
  title,
  description,
  enabled,
  disabled,
  onToggle,
}: {
  icon: TablerIcon;
  tag: string;
  title: string;
  description: string;
  enabled: boolean;
  disabled?: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_120px_70px] items-center gap-3.5 border-t border-border-primary px-[22px] py-3 first:border-t-0">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-surface-tertiary text-text-secondary flex-shrink-0">
          <Icon size={14} />
        </span>
        <div>
          <div className="flex items-center gap-2 text-[13px] font-medium text-text-primary">
            {title}
            <span className="rounded-sm border border-border-primary px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-[0.04em] text-text-muted">
              {tag}
            </span>
          </div>
          <div className="mt-0.5 max-w-[520px] text-[11.5px] leading-[1.45] text-text-muted">
            {description}
          </div>
        </div>
      </div>
      <div className="text-[11px] tabular-nums text-text-muted">—</div>
      <div className="flex justify-end">
        <Switch
          checked={enabled}
          onChange={(e) => onToggle(e.currentTarget.checked)}
          disabled={disabled}
          size="sm"
        />
      </div>
    </div>
  );
}
