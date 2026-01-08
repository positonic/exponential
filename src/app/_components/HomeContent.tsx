'use client';

import { Container, Title, Text, Paper, SimpleGrid, Group, Button, Stack, List, ListItem, ThemeIcon, Alert, Badge } from '@mantine/core';
import {
  IconCheckbox,
  IconFolder,
  IconPlugConnected,
  IconMicrophone,
  IconBrowserCheck,
  IconSparkles,
  IconTarget,
  IconCalendar,
  IconChartLine,
  IconGitBranch,
  IconBrandSlack,
  IconConfetti,
  IconRocket
} from '@tabler/icons-react';
import Link from 'next/link';
import { PluginWidgets } from './PluginWidgets';

interface HomeContentProps {
  userName: string;
  isNewUser: boolean;
  userData: {
    usageType?: string | null;
    userRole?: string | null;
    selectedTools?: string[] | null;
  } | null;
  recentProject: {
    id: string;
    name: string;
    slug: string;
    workspace?: { slug: string } | null;
  } | null;
  workspaceSlug?: string;
  workspaceName?: string;
}

export function HomeContent({
  userName,
  isNewUser,
  userData,
  recentProject,
  workspaceSlug,
  workspaceName
}: HomeContentProps) {
  // Generate workspace-aware paths
  const projectsPath = workspaceSlug ? `/w/${workspaceSlug}/projects` : '/projects';
  const workspacePath = workspaceSlug ? `/w/${workspaceSlug}/workspace` : '/today';
  const goalsPath = workspaceSlug ? `/w/${workspaceSlug}/goals` : '/goals';
  const inboxPath = workspaceSlug ? `/w/${workspaceSlug}/inbox` : '/inbox';

  // For the recent project link, use workspace context if available, otherwise fall back to project's workspace
  const getProjectPath = (project: { id: string; slug: string; workspace?: { slug: string } | null }) => {
    const wsSlug = workspaceSlug ?? project.workspace?.slug;
    return wsSlug
      ? `/w/${wsSlug}/projects/${project.slug}-${project.id}`
      : `/projects/${project.slug}-${project.id}`;
  };

  // Display title based on workspace context
  const welcomeTitle = workspaceName
    ? `Welcome to ${workspaceName}!`
    : `Welcome to Exponential, ${userName}!`;

  return (
    <Container size="lg" py="xl">
      <Stack gap="xl">
        {/* New User Welcome Banner */}
        {isNewUser && (
          <Alert
            icon={<IconConfetti size={20} />}
            title="Welcome to Exponential!"
            color="green"
            variant="light"
            className="border-border-primary"
          >
            <Stack gap="xs">
              <Text size="sm">
                Congratulations on completing your onboarding! You&apos;re all set up for {userData?.usageType ?? 'productivity'} use
                {userData?.userRole && ` as a ${userData.userRole}`}.
              </Text>
              {recentProject && (
                <Text size="sm" className="font-medium">
                  Your first project &quot;{recentProject.name}&quot; is ready to go!
                </Text>
              )}
              {userData?.selectedTools && userData.selectedTools.length > 0 && (
                <Text size="sm">
                  We noticed you use {userData.selectedTools.slice(0, 3).join(', ')}
                  {userData.selectedTools.length > 3 && ` and ${userData.selectedTools.length - 3} more tools`}.
                  Check out our integrations to connect them!
                </Text>
              )}
            </Stack>
          </Alert>
        )}

        {/* Welcome Section */}
        <div>
          <Title order={1} size="h1" className="text-4xl font-bold mb-4">
            {welcomeTitle} {!workspaceName && '👋'}
          </Title>
          <Text size="lg" c="dimmed" className="max-w-3xl">
            {isNewUser ? (
              `You're ready to boost your ${userData?.usageType ?? 'personal'} productivity! Explore the features below to get started.`
            ) : workspaceName ? (
              `Your productivity hub for ${workspaceName}. Manage projects, track goals, and stay organized.`
            ) : (
              'Exponential is your AI-powered productivity assistant that helps you manage tasks, projects, and goals while learning from your meetings and daily activities.'
            )}
          </Text>
        </div>

        {/* Personalized Quick Actions for New Users */}
        {isNewUser && (
          <Paper shadow="sm" p="lg" radius="md" className="border-border-primary bg-surface-secondary">
            <Group justify="space-between" mb="md">
              <Title order={3} className="flex items-center gap-2">
                <IconRocket size={24} className="text-brand" />
                Next Steps
              </Title>
              <Badge color="brand" variant="light">Personalized for you</Badge>
            </Group>
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
              {recentProject && (
                <Button
                  component={Link}
                  href={getProjectPath(recentProject)}
                  variant="light"
                  leftSection={<IconFolder size={16} />}
                  size="sm"
                  fullWidth
                >
                  Open &quot;{recentProject.name}&quot;
                </Button>
              )}
              <Button
                component={Link}
                href="/actions/create"
                variant="light"
                leftSection={<IconTarget size={16} />}
                size="sm"
                fullWidth
              >
                Create Your First Action
              </Button>
              {userData?.selectedTools && userData.selectedTools.length > 0 && (
                <Button
                  component={Link}
                  href="/settings/integrations"
                  variant="light"
                  leftSection={<IconPlugConnected size={16} />}
                  size="sm"
                  fullWidth
                >
                  Connect {userData.selectedTools[0]}
                </Button>
              )}
              {userData?.usageType === 'work' && (
                <Button
                  component={Link}
                  href="/teams"
                  variant="light"
                  leftSection={<IconBrandSlack size={16} />}
                  size="sm"
                  fullWidth
                >
                  Invite Your Team
                </Button>
              )}
              <Button
                component={Link}
                href={goalsPath}
                variant="light"
                leftSection={<IconCheckbox size={16} />}
                size="sm"
                fullWidth
              >
                Set Your Goals
              </Button>
              <Button
                component={Link}
                href="/ai-chat"
                variant="light"
                leftSection={<IconSparkles size={16} />}
                size="sm"
                fullWidth
              >
                Chat with AI Assistant
              </Button>
            </SimpleGrid>
          </Paper>
        )}

        {/* Main Features Grid */}
        <SimpleGrid cols={{ base: 1, md: 2, lg: 4 }} spacing="lg">
          {/* Task Management */}
          <Paper
            shadow="sm"
            p="lg"
            radius="md"
            className="h-full bg-surface-secondary border border-border-primary hover:border-border-secondary transition-colors"
          >
            <ThemeIcon size={50} radius="md" variant="light" color="blue" className="mb-4">
              <IconCheckbox size={30} />
            </ThemeIcon>
            <Title order={3} size="h4" className="mb-2">
              Manage Your Tasks
            </Title>
            <Text c="dimmed" size="sm" className="mb-4">
              Organize your daily tasks with priorities, due dates, and project associations.
              Use our intelligent inbox to capture ideas quickly.
            </Text>

            <Group mt="md">
              <Button
                component={Link}
                href={workspacePath}
                size="sm"
                variant="light"
              >
                View Today&apos;s Tasks
              </Button>
              <Button
                component={Link}
                href={inboxPath}
                size="sm"
                variant="subtle"
              >
                Go to Inbox
              </Button>
            </Group>
          </Paper>

          {/* Project Management */}
          <Paper
            shadow="sm"
            p="lg"
            radius="md"
            className="h-full bg-surface-secondary border border-border-primary hover:border-border-secondary transition-colors"
          >
            <ThemeIcon size={50} radius="md" variant="light" color="green" className="mb-4">
              <IconFolder size={30} />
            </ThemeIcon>
            <Title order={3} size="h4" className="mb-2">
              Manage Your Projects
            </Title>
            <Text c="dimmed" size="sm" className="mb-4">
              Create projects to group related tasks, goals, and outcomes. Track progress
              and maintain focus on what matters most.
            </Text>
            <List size="sm" c="dimmed">
              <ListItem>Set project priorities and progress tracking</ListItem>
              <ListItem>Link goals and outcomes to projects</ListItem>
              <ListItem>View project timelines and plans</ListItem>
            </List>
            <Group mt="md">
              <Button
                component={Link}
                href={projectsPath}
                size="sm"
                variant="light"
                color="green"
              >
                View Projects
              </Button>
            </Group>
          </Paper>

          {/* External Services */}
          <Paper
            shadow="sm"
            p="lg"
            radius="md"
            className="h-full bg-surface-secondary border border-border-primary hover:border-border-secondary transition-colors"
          >
            <ThemeIcon size={50} radius="md" variant="light" color="violet" className="mb-4">
              <IconPlugConnected size={30} />
            </ThemeIcon>
            <Title order={3} size="h4" className="mb-2">
              Connect External Services
            </Title>
            <Text c="dimmed" size="sm" className="mb-4">
              Integrate with your favorite tools to automatically capture insights and
              create action items from your meetings and browsing.
            </Text>
            <Stack gap="sm">
              <Paper p="sm" radius="sm" className="bg-background-secondary">
                <Group gap="sm">
                  <ThemeIcon size={30} variant="filled" color="orange">
                    <IconMicrophone size={18} />
                  </ThemeIcon>
                  <div className="flex-1">
                    <Text size="sm" fw={500}>Fireflies.ai</Text>
                    <Text size="xs" c="dimmed">Auto-import meeting transcripts</Text>
                  </div>
                </Group>
              </Paper>
              <Paper p="sm" radius="sm" className="bg-background-secondary">
                <Group gap="sm">
                  <ThemeIcon size={30} variant="filled" color="blue">
                    <IconBrowserCheck size={18} />
                  </ThemeIcon>
                  <div className="flex-1">
                    <Text size="sm" fw={500}>Browser Extension</Text>
                    <Text size="xs" c="dimmed">Capture insights while browsing</Text>
                  </div>
                </Group>
              </Paper>
            </Stack>
            <Button
              component={Link}
              href="/integrations"
              size="sm"
              variant="light"
              color="violet"
              fullWidth
              mt="md"
            >
              Manage Integrations
            </Button>
          </Paper>

          {/* Workflows */}
          <Paper
            shadow="sm"
            p="lg"
            radius="md"
            className="h-full bg-surface-secondary border-border-primary hover:border-border-focus transition-colors cursor-pointer"
            component={Link}
            href="/workflows"
          >
            <ThemeIcon size={50} radius="md" variant="light" color="teal" className="mb-4">
              <IconGitBranch size={30} />
            </ThemeIcon>
            <Title order={3} size="h4" className="mb-2">
              Automated Workflows
            </Title>
            <Text c="dimmed" size="sm" className="mb-4">
              Set up intelligent automations that capture data from external services
              and create action items automatically.
            </Text>
            <Stack gap="sm">
              <Paper p="sm" radius="sm" className="bg-background-secondary">
                <Group gap="sm">
                  <ThemeIcon size={30} variant="filled" color="orange">
                    <IconMicrophone size={18} />
                  </ThemeIcon>
                  <div className="flex-1">
                    <Text size="sm" fw={500}>Fireflies → Actions</Text>
                    <Text size="xs" c="dimmed">Auto-create tasks from meetings</Text>
                  </div>
                </Group>
              </Paper>
              <Paper p="sm" radius="sm" className="bg-background-secondary">
                <Group gap="sm">
                  <ThemeIcon size={30} variant="filled" color="violet">
                    <IconBrandSlack size={18} />
                  </ThemeIcon>
                  <div className="flex-1">
                    <Text size="sm" fw={500}>Slack → Actions</Text>
                    <Text size="xs" c="dimmed">Create tasks via Slack commands</Text>
                  </div>
                </Group>
              </Paper>
            </Stack>
            <Button
              size="sm"
              variant="light"
              color="teal"
              fullWidth
              mt="md"
            >
              Manage Workflows
            </Button>
          </Paper>
        </SimpleGrid>

        {/* Additional Features */}
        <Paper
          shadow="sm"
          p="lg"
          radius="md"
          className="bg-surface-secondary border border-border-primary"
        >
          <Title order={3} size="h4" className="mb-4">
            More Powerful Features
          </Title>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
            <Group gap="sm" align="flex-start">
              <ThemeIcon size={40} variant="light" color="yellow">
                <IconTarget size={24} />
              </ThemeIcon>
              <div>
                <Text fw={500} size="sm">Goals & Outcomes</Text>
                <Text size="xs" c="dimmed">
                  Set meaningful goals and track measurable outcomes
                </Text>
              </div>
            </Group>
            <Group gap="sm" align="flex-start">
              <ThemeIcon size={40} variant="light" color="cyan">
                <IconCalendar size={24} />
              </ThemeIcon>
              <div>
                <Text fw={500} size="sm">Daily Planning</Text>
                <Text size="xs" c="dimmed">
                  Start your day with intention using our journal system
                </Text>
              </div>
            </Group>
            <Group gap="sm" align="flex-start">
              <ThemeIcon size={40} variant="light" color="pink">
                <IconSparkles size={24} />
              </ThemeIcon>
              <div>
                <Text fw={500} size="sm">AI Assistant</Text>
                <Text size="xs" c="dimmed">
                  Chat with AI to get insights from your data
                </Text>
              </div>
            </Group>
            <Group gap="sm" align="flex-start">
              <ThemeIcon size={40} variant="light" color="indigo">
                <IconChartLine size={24} />
              </ThemeIcon>
              <div>
                <Text fw={500} size="sm">Progress Tracking</Text>
                <Text size="xs" c="dimmed">
                  Visualize your productivity and growth over time
                </Text>
              </div>
            </Group>
          </SimpleGrid>
        </Paper>

        {/* Plugin Dashboard Widgets */}
        <PluginWidgets />

        {/* Getting Started */}
        <Paper
          shadow="sm"
          p="lg"
          radius="md"
          className="bg-surface-secondary border-border-focus"
        >
          <Title order={3} size="h4" className="mb-3">
            Ready to Get Started?
          </Title>
          <Text c="dimmed" size="sm" className="mb-4">
            Begin your productivity journey with these recommended first steps:
          </Text>
          <Group gap="md">
            <Button
              component={Link}
              href={projectsPath}
              variant="filled"
              color="blue"
            >
              Create Your First Project
            </Button>
            <Button
              component={Link}
              href="/journal"
              variant="light"
            >
              Start Today&apos;s Journal
            </Button>
            <Button
              component={Link}
              href="/integrations"
              variant="subtle"
            >
              Connect External Services
            </Button>
          </Group>
        </Paper>
      </Stack>
    </Container>
  );
}
