'use client';

import { useState } from 'react';
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
  Textarea,
  Alert,
  ActionIcon,
  Menu,
  Grid,
  Paper,
  Divider
} from '@mantine/core';
import { 
  IconUsers, 
  IconPlus, 
  IconSettings, 
  IconUserPlus,
  IconDots,
  IconTrash,
  IconEdit,
  IconCrown,
  IconShield,
  IconUser,
  IconFolders,
  IconPlug
} from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { api } from "~/trpc/react";
import Link from 'next/link';

interface CreateTeamForm {
  name: string;
  slug: string;
  description?: string;
}

interface AddMemberForm {
  email: string;
  role: 'admin' | 'member';
}

interface TeamsClientProps {
  currentUserId: string;
}

export default function TeamsClient({ currentUserId }: TeamsClientProps) {
  const [createModalOpened, { open: openCreateModal, close: closeCreateModal }] = useDisclosure(false);
  const [addMemberModalOpened, { open: openAddMemberModal, close: closeAddMemberModal }] = useDisclosure(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  // API calls
  const { data: teams = [], refetch } = api.team.list.useQuery();
  const utils = api.useUtils();

  // Create team mutation
  const createTeam = api.team.create.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Team Created',
        message: 'Your team has been created successfully.',
        color: 'green',
      });
      closeCreateModal();
      createForm.reset();
      void refetch();
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to create team',
        color: 'red',
      });
    },
  });

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

  // Forms
  const createForm = useForm<CreateTeamForm>({
    initialValues: {
      name: '',
      slug: '',
      description: '',
    },
    validate: {
      name: (value) => value.trim().length === 0 ? 'Team name is required' : null,
      slug: (value) => {
        if (value.trim().length === 0) return 'Slug is required';
        if (!/^[a-z0-9-]+$/.test(value)) return 'Slug can only contain lowercase letters, numbers, and hyphens';
        return null;
      },
    },
  });

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

  const handleCreateTeam = (values: CreateTeamForm) => {
    createTeam.mutate(values);
  };

  const handleAddMember = (values: AddMemberForm) => {
    if (!selectedTeamId) return;
    addMember.mutate({
      teamId: selectedTeamId,
      ...values,
    });
  };

  const openAddMemberModalForTeam = (teamId: string) => {
    setSelectedTeamId(teamId);
    openAddMemberModal();
  };

  // Generate slug from name
  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
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
        {/* Page Header */}
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={1} className="mb-2">Teams</Title>
            <Text c="dimmed" size="lg">
              Collaborate with your team members on projects and share integrations.
            </Text>
          </div>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={openCreateModal}
          >
            Create Team
          </Button>
        </Group>

        {/* Teams Grid */}
        {teams.length === 0 ? (
          <Paper p="xl" radius="md" className="text-center">
            <IconUsers size={48} className="mx-auto mb-4 text-gray-400" />
            <Title order={3} className="mb-2">No teams yet</Title>
            <Text c="dimmed" className="mb-4">
              Create your first team to start collaborating with others.
            </Text>
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={openCreateModal}
            >
              Create Your First Team
            </Button>
          </Paper>
        ) : (
          <Grid>
            {teams.map((team) => (
              <Grid.Col key={team.id} span={{ base: 12, md: 6, lg: 4 }}>
                <Card shadow="sm" padding="lg" radius="md" withBorder h="100%">
                  <Group justify="space-between" align="flex-start" mb="md">
                    <div style={{ flex: 1 }}>
                      <Group gap="sm" mb="xs">
                        <Title order={4}>{team.name}</Title>
                        {/* Team owner/admin badge */}
                        {team.members.find(m => m.userId === currentUserId)?.role === 'owner' && (
                          <Badge size="xs" color="yellow" variant="light">Owner</Badge>
                        )}
                      </Group>
                      <Text size="sm" c="dimmed" lineClamp={2}>
                        {team.description || 'No description provided.'}
                      </Text>
                    </div>
                    
                    <Menu shadow="md" width={200}>
                      <Menu.Target>
                        <ActionIcon variant="subtle" size="sm">
                          <IconDots size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          leftSection={<IconUserPlus size={14} />}
                          onClick={() => openAddMemberModalForTeam(team.id)}
                        >
                          Add Member
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<IconSettings size={14} />}
                          component={Link}
                          href={`/teams/${team.slug}`}
                        >
                          Team Settings
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Group>

                  <Divider mb="md" />

                  {/* Team Stats */}
                  <Group mb="md">
                    <Group gap="xs">
                      <IconUsers size={16} className="text-gray-500" />
                      <Text size="sm">{team.members.length} member{team.members.length !== 1 ? 's' : ''}</Text>
                    </Group>
                    <Group gap="xs">
                      <IconFolders size={16} className="text-gray-500" />
                      <Text size="sm">{team._count.projects} project{team._count.projects !== 1 ? 's' : ''}</Text>
                    </Group>
                    <Group gap="xs">
                      <IconPlug size={16} className="text-gray-500" />
                      <Text size="sm">{team._count.integrations} integration{team._count.integrations !== 1 ? 's' : ''}</Text>
                    </Group>
                  </Group>

                  {/* Team Members Preview */}
                  <div>
                    <Text size="sm" fw={500} mb="xs">Members</Text>
                    <Group gap="xs">
                      {team.members.slice(0, 5).map((member) => (
                        <Group key={member.id} gap="xs">
                          <Avatar
                            size="sm"
                            src={member.user.image}
                            name={member.user.name || member.user.email}
                          />
                          <div>
                            <Text size="xs" truncate maw={100}>
                              {member.user.name || member.user.email}
                            </Text>
                            <Group gap="xs">
                              {getRoleIcon(member.role)}
                              <Badge
                                size="xs"
                                color={getRoleBadgeColor(member.role)}
                                variant="light"
                              >
                                {member.role}
                              </Badge>
                            </Group>
                          </div>
                        </Group>
                      ))}
                      {team.members.length > 5 && (
                        <Text size="xs" c="dimmed">
                          +{team.members.length - 5} more
                        </Text>
                      )}
                    </Group>
                  </div>

                  <Button
                    component={Link}
                    href={`/teams/${team.slug}`}
                    variant="light"
                    fullWidth
                    mt="md"
                  >
                    View Team
                  </Button>
                </Card>
              </Grid.Col>
            ))}
          </Grid>
        )}

        {/* Create Team Modal */}
        <Modal 
          opened={createModalOpened} 
          onClose={closeCreateModal}
          title="Create New Team"
          size="md"
        >
          <form onSubmit={createForm.onSubmit(handleCreateTeam)}>
            <Stack gap="md">
              <TextInput
                label="Team Name"
                placeholder="e.g., Marketing Team"
                required
                {...createForm.getInputProps('name')}
                onChange={(event) => {
                  createForm.setFieldValue('name', event.currentTarget.value);
                  // Auto-generate slug
                  if (!createForm.isDirty('slug')) {
                    createForm.setFieldValue('slug', generateSlug(event.currentTarget.value));
                  }
                }}
              />

              <TextInput
                label="Team Slug"
                placeholder="e.g., marketing-team"
                description="Used in URLs. Only lowercase letters, numbers, and hyphens."
                required
                {...createForm.getInputProps('slug')}
              />

              <Textarea
                label="Description"
                placeholder="What does this team work on?"
                {...createForm.getInputProps('description')}
                minRows={3}
              />

              <Alert color="blue" title="Team Creation">
                You will be automatically added as the team owner and can invite other members after creation.
              </Alert>

              <Group justify="flex-end">
                <Button variant="light" onClick={closeCreateModal}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  loading={createTeam.isPending}
                  leftSection={<IconPlus size={16} />}
                >
                  Create Team
                </Button>
              </Group>
            </Stack>
          </form>
        </Modal>

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

              <TextInput
                label="Role"
                value={addMemberForm.values.role === 'admin' ? 'Admin' : 'Member'}
                readOnly
                description="Members have access to team projects. Admins can also manage team settings and members."
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
      </Stack>
    </Container>
  );
}