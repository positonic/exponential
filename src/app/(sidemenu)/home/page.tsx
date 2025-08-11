import { Container, Title, Text, Paper, SimpleGrid, Group, Button, Stack, List, ListItem, ThemeIcon } from '@mantine/core';
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
  IconBrandSlack
} from '@tabler/icons-react';
import Link from 'next/link';
import { auth } from "~/server/auth";

export default async function HomePage() {
  const session = await auth();
  const userName = session?.user?.name || 'there';

  return (
    <Container size="lg" py="xl">
      <Stack gap="xl">
        {/* Welcome Section */}
        <div>
          <Title order={1} size="h1" className="text-4xl font-bold mb-4">
            Welcome to Exponential, {userName}! 👋
          </Title>
          <Text size="lg" c="dimmed" className="max-w-3xl">
            Exponential is your AI-powered productivity assistant that helps you manage tasks, 
            projects, and goals while learning from your meetings and daily activities.
          </Text>
        </div>

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
                href="/today"
                size="sm"
                variant="light"
              >
                View Today&apos;s Tasks
              </Button>
              <Button
                component={Link}
                href="/inbox"
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
                href="/projects"
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
            className="h-full bg-[#262626] border border-gray-800 hover:border-gray-700 transition-colors cursor-pointer"
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

        {/* Getting Started */}
        <Paper
          shadow="sm"
          p="lg"
          radius="md"
          className="bg-gradient-to-r from-brand-primary/20 to-violet-900/20 border border-brand-primary/30"
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
              href="/projects"
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