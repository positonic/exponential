import { Container, Title, Text, SimpleGrid, Card, Button, Group, ThemeIcon, Stack, Paper, Badge } from '@mantine/core';
import { IconRocket, IconArrowRight, IconPresentation, IconGitBranch, IconMicrophone, IconWebhook, IconPlaylistAdd, IconBrandSlack } from '@tabler/icons-react';
import Link from 'next/link';

// Define automation workflows
const automationWorkflows = [
  {
    icon: IconMicrophone,
    title: 'Fireflies → Action Items',
    description: 'Automatically receive notifications when Fireflies processes a meeting, then fetch call details and create action items.',
    status: 'Active',
    enabled: true,
    steps: [
      'Fireflies sends webhook notification',
      'Fetch call transcript and summary',
      'Extract action items using AI',
      'Create tasks in your inbox'
    ]
  },
  {
    icon: IconBrandSlack,
    title: 'Slack → Actions',
    description: 'Create actions directly from Slack messages, receive notifications about meeting outcomes, and interact with your tasks via Slack commands.',
    status: 'Available',
    enabled: false,
    steps: [
      'Connect Slack workspace via OAuth',
      'Configure notification channels',
      'Set up slash commands and bot permissions',
      'Start creating actions from Slack!'
    ]
  },
  {
    icon: IconWebhook,
    title: 'Custom Webhook Handler',
    description: 'Set up custom webhooks to receive data from any service and automatically process it into actionable items.',
    status: 'Available',
    enabled: false,
    steps: [
      'Configure webhook endpoint',
      'Define data transformation rules',
      'Set up action creation logic',
      'Test and activate workflow'
    ]
  }
];

// Define guided workflows
const guidedWorkflows = [
  {
    icon: IconRocket,
    title: 'Launch Sprint',
    description: 'Generate a tailored 3-week plan to validate your idea, launch your MVP, or grow your existing product.',
    targetAudience: 'Startups, indie hackers, product managers',
    href: '/workflows/launch',
    cta: 'Start Launch Sprint',
  },
  {
    icon: IconPresentation,
    title: 'Elevator Pitch',
    description: 'Craft a compelling elevator pitch using a structured template focused on customer needs and your unique value proposition.',
    targetAudience: 'Entrepreneurs, founders, sales teams',
    href: '/workflows/elevator-pitch',
    cta: 'Craft Your Pitch',
  }
];

export default function WorkflowsPage() {
  return (
    <Container size="lg" py="xl">
      <Stack gap="xl">
        <div>
          <Title
            order={1}
            ta="center"
            className="mb-4 bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-4xl font-bold text-transparent"
          >
            Exponential Workflows
          </Title>
          <Text c="dimmed" size="xl" ta="center">
            Automate your productivity with intelligent workflows and guided processes.
          </Text>
        </div>

        {/* Automation Workflows */}
        <div>
          <Group mb="md" align="center">
            <ThemeIcon size="md" variant="light" color="teal">
              <IconGitBranch size={20} />
            </ThemeIcon>
            <Title order={2} size="h3">
              Automated Workflows
            </Title>
          </Group>
          <Text c="dimmed" size="sm" mb="lg">
            Set up intelligent automations that capture data from external services and create action items automatically.
          </Text>
          
          <SimpleGrid cols={{ base: 1, sm: 1 }} spacing="md">
            {automationWorkflows.map((workflow) => (
              <Card key={workflow.title} shadow="sm" padding="lg" radius="md" withBorder>
                <Group justify="space-between" align="flex-start" mb="md">
                  <Group align="center">
                    <ThemeIcon size="lg" variant="light" color="teal" radius="md">
                      <workflow.icon size={24} />
                    </ThemeIcon>
                    <div>
                      <Title order={4} className="text-lg font-semibold">
                        {workflow.title}
                      </Title>
                      <Badge 
                        color={workflow.enabled ? 'green' : 'gray'} 
                        variant="light" 
                        size="sm"
                      >
                        {workflow.status}
                      </Badge>
                    </div>
                  </Group>
                </Group>

                <Text size="sm" c="dimmed" mb="md">
                  {workflow.description}
                </Text>

                <Paper p="sm" radius="sm" className="bg-gray-50 dark:bg-gray-800/50 mb-md">
                  <Text size="xs" fw={500} mb="xs" c="dimmed">
                    Workflow Steps:
                  </Text>
                  <Stack gap="xs">
                    {workflow.steps.map((step, index) => (
                      <Group key={index} gap="xs" align="center">
                        <ThemeIcon size="xs" variant="filled" color="teal" radius="xl">
                          <Text size="xs">{index + 1}</Text>
                        </ThemeIcon>
                        <Text size="xs" c="dimmed">{step}</Text>
                      </Group>
                    ))}
                  </Stack>
                </Paper>

                <Button
                  variant={workflow.enabled ? "light" : "filled"}
                  color="teal"
                  size="sm"
                  leftSection={<IconPlaylistAdd size={16} />}
                >
                  {workflow.enabled ? 'Configure' : 'Set Up Workflow'}
                </Button>
              </Card>
            ))}
          </SimpleGrid>
        </div>

        {/* Guided Workflows */}
        <div>
          <Group mb="md" align="center">
            <ThemeIcon size="md" variant="light" color="violet">
              <IconRocket size={20} />
            </ThemeIcon>
            <Title order={2} size="h3">
              Guided Workflows
            </Title>
          </Group>
          <Text c="dimmed" size="sm" mb="lg">
            Streamline your product journey with guided processes designed to help you achieve specific goals, faster.
          </Text>
          
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xl">
            {guidedWorkflows.map((workflow) => (
              <Card key={workflow.title} shadow="sm" padding="lg" radius="md" withBorder className="flex flex-col">
                <Group justify="flex-start" align="center" mb="md">
                   <ThemeIcon size="lg" variant="light" color="violet" radius="md">
                     <workflow.icon size={24} />
                   </ThemeIcon>
                   <Title order={3} className="text-lg font-semibold">
                     {workflow.title}
                   </Title>
                </Group>

                <Text size="sm" c="dimmed" className="flex-grow">
                  {workflow.description}
                </Text>

                 <Text size="xs" c="dimmed" mt="sm">
                   Ideal for: {workflow.targetAudience}
                 </Text>

                <Button
                  component={Link}
                  href={workflow.href}
                  variant="gradient"
                  gradient={{ from: 'violet', to: 'indigo' }}
                  fullWidth
                  mt="md"
                  radius="md"
                  rightSection={<IconArrowRight size={16} />}
                >
                  {workflow.cta}
                </Button>
              </Card>
            ))}
          </SimpleGrid>
        </div>
      </Stack>
    </Container>
  );
}
