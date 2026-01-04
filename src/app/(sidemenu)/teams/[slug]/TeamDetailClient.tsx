'use client';

// import { useState } from 'react';
import {
  Container,
  Title,
  Text,
  Button,
  Card,
  Group,
  Stack,
  Avatar,
  Badge,
  Modal,
  TextInput,
  Select,
  Alert,
  ActionIcon,
  Menu,
  Grid,
  Tabs,
  Paper,
  Switch,
  Tooltip,
  // Divider,
  // List,
  // ListItem
} from '@mantine/core';
import {
  IconUsers,
  IconSettings,
  IconUserPlus,
  IconDots,
  // IconTrash,
  // IconEdit,
  IconCrown,
  IconShield,
  IconUser,
  IconFolders,
  IconPlug,
  IconArrowLeft,
  IconUserMinus,
  IconPlus,
  IconCalendarWeek
} from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { api } from "~/trpc/react";
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useWorkspace } from '~/providers/WorkspaceProvider';
// import { useRouter } from 'next/navigation';
import { AddProjectToTeamModal } from '~/app/_components/AddProjectToTeamModal';
import { AssignProjectToTeamModal } from '~/app/_components/AssignProjectToTeamModal';
import { EditTeamModal } from '~/app/_components/EditTeamModal';
import { AddExistingIntegrationModal } from '~/app/_components/AddExistingIntegrationModal';

interface AddMemberForm {
  email: string;
  role: 'admin' | 'member';
}

interface TeamDetailClientProps {
  team: any; // TODO: Add proper type
  currentUserId: string;
}

export default function TeamDetailClient({ team: initialTeam, currentUserId }: TeamDetailClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { workspaceSlug } = useWorkspace();
  const [addMemberModalOpened, { open: openAddMemberModal, close: closeAddMemberModal }] = useDisclosure(false);
  const [addIntegrationModalOpened, { open: openAddIntegrationModal, close: closeAddIntegrationModal }] = useDisclosure(false);

  // Get fresh team data
  const { data: team = initialTeam, refetch } = api.team.getBySlug.useQuery(
    { slug: initialTeam.slug },
    { initialData: initialTeam }
  );

  // Get current user's role in this team
  const currentMember = team.members.find((m: any) => m.userId === currentUserId);
  const isOwnerOrAdmin = currentMember?.role === 'owner' || currentMember?.role === 'admin';

  // Get active tab from URL parameters
  const activeTab = searchParams.get('tab') ?? 'members';

  // Handle tab change by updating URL
  const handleTabChange = (value: string | null) => {
    if (!value) return;
    
    const newSearchParams = new URLSearchParams(searchParams.toString());
    if (value === 'members') {
      newSearchParams.delete('tab');
    } else {
      newSearchParams.set('tab', value);
    }
    
    const newUrl = `${pathname}${newSearchParams.toString() ? `?${newSearchParams.toString()}` : ''}`;
    router.push(newUrl);
  };

  // Add member mutation
  const addMember = api.team.addMember.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Member Added',
        message: 'Team member has been added successfully.',
        color: 'green',
      });
      closeAddMemberModal();
      addMemberForm.reset();
      void refetch();
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to add member',
        color: 'red',
      });
    },
  });

  // Remove member mutation
  const removeMember = api.team.removeMember.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Member Removed',
        message: 'Team member has been removed successfully.',
        color: 'green',
      });
      void refetch();
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to remove member',
        color: 'red',
      });
    },
  });

  // Set organization mutation
  const setOrganization = api.team.setAsOrganization.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Organization Settings Updated',
        message: 'Team organization settings have been updated successfully.',
        color: 'green',
      });
      void refetch();
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to update organization settings',
        color: 'red',
      });
    },
  });

  // Add member form
  const addMemberForm = useForm<AddMemberForm>({
    initialValues: {
      email: '',
      role: 'member',
    },
    validate: {
      email: (value) => {
        if (value.trim().length === 0) return 'Email is required';
        if (!/\S+@\S+\.\S+/.test(value)) return 'Invalid email format';
        return null;
      },
    },
  });

  const handleAddMember = (values: AddMemberForm) => {
    addMember.mutate({
      teamId: team.id,
      ...values,
    });
  };

  const handleRemoveMember = (userId: string) => {
    if (confirm('Are you sure you want to remove this member from the team?')) {
      removeMember.mutate({
        teamId: team.id,
        userId,
      });
    }
  };

  const handleOrganizationToggle = (isOrganization: boolean) => {
    setOrganization.mutate({
      teamId: team.id,
      isOrganization,
    });
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner':
        return <IconCrown size={16} color="gold" />;
      case 'admin':
        return <IconShield size={16} color="blue" />;
      default:
        return <IconUser size={16} color="gray" />;
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'owner':
        return 'yellow';
      case 'admin':
        return 'blue';
      default:
        return 'gray';
    }
  };

  return (
    <Container size="lg" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <Group justify="space-between">
          <Group>
            <Button
              variant="subtle"
              leftSection={<IconArrowLeft size={16} />}
              component={Link}
              href="/teams"
            >
              Back to Teams
            </Button>
            <div>
              <Title order={1}>{team.name}</Title>
              <Text c="dimmed">{team.description || 'No description provided.'}</Text>
            </div>
          </Group>
          
          {isOwnerOrAdmin && (
            <Group>
              <EditTeamModal 
                team={team}
                onTeamUpdated={() => void refetch()}
              />
              <Button
                leftSection={<IconUserPlus size={16} />}
                onClick={openAddMemberModal}
              >
                Add Member
              </Button>
            </Group>
          )}
        </Group>

        {/* Team Stats */}
        <Grid>
          <Grid.Col span={4}>
            <Paper p="md" withBorder>
              <Group gap="sm">
                <IconUsers size={24} className="text-blue-500" />
                <div>
                  <Text size="xl" fw={700}>{team.members.length}</Text>
                  <Text size="sm" c="dimmed">Members</Text>
                </div>
              </Group>
            </Paper>
          </Grid.Col>
          <Grid.Col span={4}>
            <Paper p="md" withBorder>
              <Group gap="sm">
                <IconFolders size={24} className="text-green-500" />
                <div>
                  <Text size="xl" fw={700}>{team.projects?.length || 0}</Text>
                  <Text size="sm" c="dimmed">Projects</Text>
                </div>
              </Group>
            </Paper>
          </Grid.Col>
          <Grid.Col span={4}>
            <Paper p="md" withBorder>
              <Group gap="sm">
                <IconPlug size={24} className="text-purple-500" />
                <div>
                  <Text size="xl" fw={700}>{team.integrations?.length || 0}</Text>
                  <Text size="sm" c="dimmed">Integrations</Text>
                </div>
              </Group>
            </Paper>
          </Grid.Col>
        </Grid>

        {/* Content Tabs */}
        <Tabs value={activeTab} onChange={handleTabChange}>
          <Tabs.List>
            <Tabs.Tab value="members" leftSection={<IconUsers size={16} />}>
              Members
            </Tabs.Tab>
            <Tabs.Tab value="projects" leftSection={<IconFolders size={16} />}>
              Projects
            </Tabs.Tab>
            <Tabs.Tab value="integrations" leftSection={<IconPlug size={16} />}>
              Integrations
            </Tabs.Tab>
            {team.isOrganization && (
              <Tabs.Tab value="weekly-reviews" leftSection={<IconCalendarWeek size={16} />}>
                Weekly Reviews
              </Tabs.Tab>
            )}
            {isOwnerOrAdmin && (
              <Tabs.Tab value="settings" leftSection={<IconSettings size={16} />}>
                Settings
              </Tabs.Tab>
            )}
          </Tabs.List>

          <Tabs.Panel value="members" pt="md">
            <Card withBorder>
              <Stack gap="md">
                <Title order={3}>Team Members</Title>
                <Stack gap="sm">
                  {team.members.map((member: any) => (
                    <Group key={member.id} justify="space-between" p="sm" className="border rounded">
                      <Group>
                        <Avatar
                          src={member.user.image}
                          name={member.user.name || member.user.email}
                          size="md"
                        />
                        <div>
                          <Group gap="xs">
                            <Text fw={500}>{member.user.name || member.user.email}</Text>
                            {getRoleIcon(member.role)}
                            <Badge
                              size="sm"
                              color={getRoleBadgeColor(member.role)}
                              variant="light"
                            >
                              {member.role}
                            </Badge>
                          </Group>
                          <Text size="sm" c="dimmed">{member.user.email}</Text>
                        </div>
                      </Group>
                      
                      <Group gap="xs">
                        {/* Weekly Review Link for Organization Teams */}
                        {team.isOrganization && (
                          <Tooltip label="View Weekly Review">
                            <ActionIcon
                              variant="light"
                              color="blue"
                              size="sm"
                              component={Link}
                              href={`/teams/${team.slug}/members/${member.userId}/weekly-review`}
                            >
                              <IconCalendarWeek size={16} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                        
                        {isOwnerOrAdmin && member.role !== 'owner' && member.userId !== currentUserId && (
                          <Menu shadow="md" width={200}>
                            <Menu.Target>
                              <ActionIcon variant="subtle" size="sm">
                                <IconDots size={16} />
                              </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                              <Menu.Item
                                leftSection={<IconUserMinus size={14} />}
                                color="red"
                                onClick={() => handleRemoveMember(member.userId)}
                              >
                                Remove Member
                              </Menu.Item>
                            </Menu.Dropdown>
                          </Menu>
                        )}
                      </Group>
                    </Group>
                  ))}
                </Stack>
              </Stack>
            </Card>
          </Tabs.Panel>

          <Tabs.Panel value="projects" pt="md">
            <Card withBorder>
              <Stack gap="md">
                <Group justify="space-between">
                  <Title order={3}>Team Projects</Title>
                  {isOwnerOrAdmin && (
                    <Group>
                      <AssignProjectToTeamModal teamId={team.id} onProjectsAssigned={() => void refetch()}>
                        <Button
                          size="sm"
                          variant="light"
                          leftSection={<IconFolders size={16} />}
                        >
                          Assign Existing
                        </Button>
                      </AssignProjectToTeamModal>
                      <AddProjectToTeamModal teamId={team.id} onProjectAdded={() => void refetch()}>
                        <Button
                          size="sm"
                          leftSection={<IconPlus size={16} />}
                        >
                          Create New
                        </Button>
                      </AddProjectToTeamModal>
                    </Group>
                  )}
                </Group>
                
                {team.projects && team.projects.length > 0 ? (
                  <Stack gap="sm">
                    {team.projects.map((project: any) => (
                      <Group key={project.id} justify="space-between" p="sm" className="border rounded">
                        <div>
                          <Text fw={500}>{project.name}</Text>
                          <Text size="sm" c="dimmed">
                            {project.description || 'No description'}
                          </Text>
                          <Group gap="xs" mt="xs">
                            <Badge size="xs" variant="light">{project.status}</Badge>
                            <Badge size="xs" variant="outline">{project.priority}</Badge>
                            <Text size="xs" c="dimmed">
                              {project._count?.actions || 0} actions
                            </Text>
                          </Group>
                        </div>
                        <Button
                          variant="light"
                          size="xs"
                          component={Link}
                          href={workspaceSlug
                            ? `/w/${workspaceSlug}/projects/${project.slug}-${project.id}`
                            : `/projects/${project.slug}-${project.id}`
                          }
                        >
                          View
                        </Button>
                      </Group>
                    ))}
                  </Stack>
                ) : (
                  <Text c="dimmed">No projects yet.</Text>
                )}
              </Stack>
            </Card>
          </Tabs.Panel>

          <Tabs.Panel value="integrations" pt="md">
            <Card withBorder>
              <Stack gap="md">
                <Group justify="space-between">
                  <Title order={3}>Team Integrations</Title>
                  {isOwnerOrAdmin && (
                    <Group>
                      <Button
                        size="sm"
                        variant="light"
                        leftSection={<IconPlus size={16} />}
                        onClick={openAddIntegrationModal}
                      >
                        Add Existing Integration
                      </Button>
                      <Button
                        size="sm"
                        leftSection={<IconPlus size={16} />}
                        component={Link}
                        href="/integrations"
                      >
                        Add New Integration
                      </Button>
                    </Group>
                  )}
                </Group>
                
                {team.integrations && team.integrations.length > 0 ? (
                  <Stack gap="sm">
                    {team.integrations.map((integration: any) => (
                      <Group key={integration.id} justify="space-between" p="sm" className="border rounded">
                        <div>
                          <Text fw={500}>{integration.name}</Text>
                          <Text size="sm" c="dimmed">
                            {integration.description || 'No description'}
                          </Text>
                          <Group gap="xs" mt="xs">
                            <Badge size="xs" variant="light">{integration.provider}</Badge>
                            <Badge size="xs" variant="outline">{integration.status}</Badge>
                          </Group>
                        </div>
                      </Group>
                    ))}
                  </Stack>
                ) : (
                  <Text c="dimmed">No integrations yet.</Text>
                )}
              </Stack>
            </Card>
          </Tabs.Panel>

          {team.isOrganization && (
            <Tabs.Panel value="weekly-reviews" pt="md">
              <Card withBorder>
                <Stack gap="md">
                  <Title order={3}>Shared Weekly Reviews</Title>
                  <TeamSharedReviewsList teamId={team.id} teamSlug={team.slug} />
                </Stack>
              </Card>
            </Tabs.Panel>
          )}

          {isOwnerOrAdmin && (
            <Tabs.Panel value="settings" pt="md">
              <Card withBorder>
                <Stack gap="lg">
                  <Title order={3}>Team Settings</Title>
                  
                  {/* Organization Settings */}
                  <Paper p="md" withBorder radius="md" className="bg-surface-secondary">
                    <Stack gap="md">
                      <Group justify="space-between" align="flex-start">
                        <div>
                          <Text fw={500} size="sm" className="text-text-primary">
                            Organization Team
                          </Text>
                          <Text size="xs" c="dimmed" style={{ maxWidth: 400 }}>
                            Organization teams can receive shared weekly reviews from members. 
                            Regular teams are for project collaboration only.
                          </Text>
                        </div>
                        <Switch
                          checked={team.isOrganization ?? false}
                          onChange={(event) => handleOrganizationToggle(event.currentTarget.checked)}
                          disabled={setOrganization.isPending}
                          label=""
                        />
                      </Group>
                      
                      {team.isOrganization && (
                        <Alert variant="light" color="blue">
                          <Text size="sm">
                            This team can now receive shared weekly reviews from members. 
                            Team members can choose to share their weekly reviews in their personal settings.
                          </Text>
                        </Alert>
                      )}
                    </Stack>
                  </Paper>

                  {/* Weekly Review Settings (for organization teams) */}
                  {team.isOrganization && (
                    <Paper p="md" withBorder radius="md" className="bg-surface-secondary">
                      <Stack gap="md">
                        <div>
                          <Text fw={500} size="sm" className="text-text-primary">
                            Weekly Review Sharing
                          </Text>
                          <Text size="xs" c="dimmed">
                            View and manage weekly review sharing for this organization team.
                          </Text>
                        </div>
                        
                        <TeamWeeklyReviewManagement teamId={team.id} />
                        
                        <Group>
                          <Button
                            variant="light"
                            size="sm"
                            leftSection={<IconUsers size={16} />}
                            component={Link}
                            href={`/teams/${team.slug}?tab=weekly-reviews`}
                          >
                            View Shared Reviews
                          </Button>
                        </Group>
                      </Stack>
                    </Paper>
                  )}
                </Stack>
              </Card>
            </Tabs.Panel>
          )}
        </Tabs>

        {/* Add Member Modal */}
        <Modal 
          opened={addMemberModalOpened} 
          onClose={closeAddMemberModal}
          title="Add Team Member"
          size="md"
        >
          <form onSubmit={addMemberForm.onSubmit(handleAddMember)}>
            <Stack gap="md">
              <TextInput
                label="Email Address"
                placeholder="colleague@company.com"
                required
                {...addMemberForm.getInputProps('email')}
              />

              <Select
                label="Role"
                description="Members have access to team projects. Admins can also manage team settings and members."
                data={[
                  { value: 'member', label: 'Member' },
                  { value: 'admin', label: 'Admin' },
                ]}
                {...addMemberForm.getInputProps('role')}
              />

              <Alert color="blue" title="Team Invitation">
                The user must already have an account to be added to the team.
              </Alert>

              <Group justify="flex-end">
                <Button variant="light" onClick={closeAddMemberModal}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  loading={addMember.isPending}
                  leftSection={<IconUserPlus size={16} />}
                >
                  Add Member
                </Button>
              </Group>
            </Stack>
          </form>
        </Modal>

        {/* Add Existing Integration Modal */}
        <AddExistingIntegrationModal
          opened={addIntegrationModalOpened}
          onClose={closeAddIntegrationModal}
          teamId={team.id}
          onIntegrationAdded={() => void refetch()}
        />
      </Stack>
    </Container>
  );
}

// Component for managing team weekly review sharing
interface TeamWeeklyReviewManagementProps {
  teamId: string;
}

function TeamWeeklyReviewManagement({ teamId }: TeamWeeklyReviewManagementProps) {
  const { data: sharedReviews, isLoading } = api.team.getWeeklyReviews.useQuery({
    teamId
  });

  if (isLoading) {
    return (
      <Group justify="center" py="sm">
        <Text size="sm" c="dimmed">Loading sharing status...</Text>
      </Group>
    );
  }

  const activeSharingCount = sharedReviews?.length ?? 0;

  return (
    <Group justify="space-between" align="center" py="xs">
      <div>
        <Text size="sm" fw={500} className="text-text-primary">
          {activeSharingCount} member{activeSharingCount !== 1 ? 's' : ''} sharing
        </Text>
        {activeSharingCount > 0 && (
          <Group gap="xs" mt={2}>
            {sharedReviews?.slice(0, 3).map((sharing: any) => (
              <Avatar
                key={sharing.user.id}
                src={sharing.user.image || undefined}
                alt={sharing.user.name || "Team member"}
                size="xs"
                radius="xl"
              >
                {sharing.user.name?.split(' ').map((n: string) => n[0]).join('') || '?'}
              </Avatar>
            ))}
            {activeSharingCount > 3 && (
              <Text size="xs" c="dimmed">
                +{activeSharingCount - 3} more
              </Text>
            )}
          </Group>
        )}
      </div>
      {activeSharingCount === 0 && (
        <Text size="xs" c="dimmed" fs="italic">
          No members sharing reviews yet
        </Text>
      )}
    </Group>
  );
}

// Component for displaying list of shared weekly reviews
interface TeamSharedReviewsListProps {
  teamId: string;
  teamSlug: string;
}

function TeamSharedReviewsList({ teamId, teamSlug }: TeamSharedReviewsListProps) {
  const { data: sharedReviews, isLoading } = api.team.getWeeklyReviews.useQuery({
    teamId
  });

  if (isLoading) {
    return (
      <Group justify="center" py="xl">
        <Text size="sm" c="dimmed">Loading shared reviews...</Text>
      </Group>
    );
  }

  if (!sharedReviews || sharedReviews.length === 0) {
    return (
      <Paper p="xl" withBorder radius="md" className="bg-surface-secondary">
        <Stack align="center" gap="md">
          <IconCalendarWeek size={48} className="text-text-muted" />
          <div style={{ textAlign: 'center' }}>
            <Text fw={500} size="sm" className="text-text-primary">
              No shared weekly reviews yet
            </Text>
            <Text size="xs" c="dimmed" mt="xs">
              Team members can enable weekly review sharing in their personal settings.
            </Text>
          </div>
        </Stack>
      </Paper>
    );
  }

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        {sharedReviews.length} member{sharedReviews.length !== 1 ? 's' : ''} sharing weekly reviews
      </Text>
      
      <Stack gap="sm">
        {sharedReviews.map((sharing: any) => (
          <Paper 
            key={sharing.user.id} 
            p="md" 
            withBorder 
            radius="sm" 
            className="bg-background-primary border-border-primary hover:bg-surface-hover transition-colors"
          >
            <Group justify="space-between" align="center">
              <Group gap="md">
                <Avatar
                  src={sharing.user.image || undefined}
                  alt={sharing.user.name || "Team member"}
                  size="md"
                  radius="xl"
                >
                  {sharing.user.name?.split(' ').map((n: string) => n[0]).join('') || '?'}
                </Avatar>
                <div>
                  <Text fw={500} className="text-text-primary">
                    {sharing.user.name || sharing.user.email}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {sharing.user.email}
                  </Text>
                </div>
              </Group>
              
              <Group gap="xs">
                <Button
                  variant="light"
                  size="sm"
                  leftSection={<IconCalendarWeek size={16} />}
                  component={Link}
                  href={`/teams/${teamSlug}/members/${sharing.user.id}/weekly-review`}
                >
                  View Weekly Review
                </Button>
              </Group>
            </Group>
          </Paper>
        ))}
      </Stack>
    </Stack>
  );
}