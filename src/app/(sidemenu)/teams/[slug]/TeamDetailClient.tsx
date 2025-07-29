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
  Select,
  Alert,
  ActionIcon,
  Menu,
  Grid,
  Tabs,
  Paper,
  Divider,
  List,
  ListItem
} from '@mantine/core';
import {
  IconUsers,
  IconSettings,
  IconUserPlus,
  IconDots,
  IconTrash,
  IconEdit,
  IconCrown,
  IconShield,
  IconUser,
  IconFolders,
  IconPlug,
  IconArrowLeft,
  IconUserMinus
} from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { api } from "~/trpc/react";
import Link from 'next/link';
import { useRouter } from 'next/navigation';

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
  const [addMemberModalOpened, { open: openAddMemberModal, close: closeAddMemberModal }] = useDisclosure(false);

  // Get fresh team data
  const { data: team = initialTeam, refetch } = api.team.getBySlug.useQuery(
    { slug: initialTeam.slug },
    { initialData: initialTeam }
  );

  // Get current user's role in this team
  const currentMember = team.members.find((m: any) => m.userId === currentUserId);
  const isOwnerOrAdmin = currentMember?.role === 'owner' || currentMember?.role === 'admin';

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
            <Button
              leftSection={<IconUserPlus size={16} />}
              onClick={openAddMemberModal}
            >
              Add Member
            </Button>
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
        <Tabs defaultValue="members">
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
                  ))}
                </Stack>
              </Stack>
            </Card>
          </Tabs.Panel>

          <Tabs.Panel value="projects" pt="md">
            <Card withBorder>
              <Stack gap="md">
                <Title order={3}>Team Projects</Title>
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
                          href={`/projects/${project.slug}`}
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
                <Title order={3}>Team Integrations</Title>
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
      </Stack>
    </Container>
  );
}