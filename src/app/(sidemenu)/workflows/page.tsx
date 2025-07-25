'use client';

import { useState } from 'react';
import { Container, Title, Text, SimpleGrid, Card, Button, Group, ThemeIcon, Stack, Paper, Badge, Accordion, Alert, Modal, TextInput, Select, Textarea, Code, CopyButton, ActionIcon } from '@mantine/core';
import { IconRocket, IconArrowRight, IconPresentation, IconGitBranch, IconMicrophone, IconWebhook, IconPlaylistAdd, IconBrandSlack, IconCheck, IconX, IconAlertCircle, IconPlus, IconKey, IconBrandFirebase, IconCopy } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { api } from "~/trpc/react";
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

interface CreateTokenForm {
  name: string;
  expiresIn: string;
  description?: string;
}

interface CreateIntegrationForm {
  name: string;
  provider: string;
  apiKey: string;
  description?: string;
}

export default function WorkflowsPage() {
  const [tokenModalOpened, { open: openTokenModal, close: closeTokenModal }] = useDisclosure(false);
  const [integrationModalOpened, { open: openIntegrationModal, close: closeIntegrationModal }] = useDisclosure(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);

  // API calls for checking configuration status
  const { data: tokens = [] } = api.mastra.listApiTokens.useQuery();
  const { data: integrations = [] } = api.integration.listIntegrations.useQuery();

  // API mutations for creating tokens and integrations
  const generateToken = api.mastra.generateApiToken.useMutation({
    onSuccess: (data) => {
      setGeneratedToken(data.token);
      setShowToken(true);
      notifications.show({
        title: 'API Token Generated',
        message: 'Your Fireflies webhook token has been created successfully. Make sure to copy it now!',
        color: 'green',
      });
      tokenForm.reset();
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to generate token',
        color: 'red',
      });
    },
  });

  const createIntegration = api.integration.createIntegration.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Integration Created',
        message: 'Your Fireflies integration has been created successfully.',
        color: 'green',
      });
      closeIntegrationModal();
      integrationForm.reset();
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to create integration',
        color: 'red',
      });
    },
  });

  // Forms
  const tokenForm = useForm<CreateTokenForm>({
    initialValues: {
      name: 'Fireflies Webhook Token',
      expiresIn: '90d',
      description: 'Token for Fireflies webhook integration',
    },
    validate: {
      name: (value) => value.trim().length === 0 ? 'Token name is required' : null,
    },
  });

  const integrationForm = useForm<CreateIntegrationForm>({
    initialValues: {
      name: 'Fireflies Integration',
      provider: 'fireflies',
      apiKey: '',
      description: 'API key for Fireflies integration',
    },
    validate: {
      name: (value) => value.trim().length === 0 ? 'Integration name is required' : null,
      apiKey: (value) => value.trim().length === 0 ? 'API key is required' : null,
    },
  });

  // Check if Fireflies workflow is properly configured
  const hasFirefliesToken = tokens.some(token => 
    token.name.toLowerCase().includes('fireflies') && 
    new Date(token.expiresAt) > new Date()
  );
  
  const hasFirefliesIntegration = integrations.some(integration => 
    integration.provider === 'fireflies' && 
    integration.status === 'ACTIVE'
  );

  const isFirefliesConfigured = hasFirefliesToken && hasFirefliesIntegration;

  const handleCreateToken = async (values: CreateTokenForm) => {
    await generateToken.mutateAsync({
      name: values.name,
      expiresIn: values.expiresIn,
    });
  };

  const handleCreateIntegration = async (values: CreateIntegrationForm) => {
    await createIntegration.mutateAsync({
      name: values.name,
      provider: values.provider as 'fireflies',
      apiKey: values.apiKey,
      description: values.description,
    });
  };

  const handleCloseTokenModal = () => {
    closeTokenModal();
    setShowToken(false);
    setGeneratedToken(null);
  };
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
            {automationWorkflows.map((workflow) => {
              // Special handling for Fireflies workflow
              if (workflow.title === 'Fireflies → Action Items') {
                return (
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
                            color={isFirefliesConfigured ? 'green' : 'orange'} 
                            variant="light" 
                            size="sm"
                          >
                            {isFirefliesConfigured ? 'Ready' : 'Setup Required'}
                          </Badge>
                        </div>
                      </Group>
                      {isFirefliesConfigured && (
                        <ThemeIcon size="md" variant="light" color="green" radius="xl">
                          <IconCheck size={16} />
                        </ThemeIcon>
                      )}
                    </Group>

                    <Text size="sm" c="dimmed" mb="md">
                      {workflow.description}
                    </Text>

                    {/* Configuration Status Alert */}
                    {isFirefliesConfigured ? (
                      <Alert 
                        icon={<IconCheck size={16} />}
                        title="Ready to Go!"
                        color="green"
                        variant="light"
                        mb="md"
                      >
                        Your Fireflies workflow is fully configured and ready to receive webhooks.
                      </Alert>
                    ) : (
                      <Alert 
                        icon={<IconAlertCircle size={16} />}
                        title="Setup Required"
                        color="orange"
                        variant="light"
                        mb="md"
                      >
                        Complete the setup steps below to activate this workflow.
                      </Alert>
                    )}

                    {/* Setup Steps Accordion */}
                    <Accordion variant="contained" mb="md">
                      <Accordion.Item value="setup">
                        <Accordion.Control>
                          <Group gap="sm">
                            <Text fw={500}>Workflow Setup Steps</Text>
                            {isFirefliesConfigured && (
                              <Badge color="green" size="sm" variant="filled">Complete</Badge>
                            )}
                          </Group>
                        </Accordion.Control>
                        <Accordion.Panel>
                          <Stack gap="md">
                            {/* Step 1: API Token */}
                            <Paper p="sm" radius="sm" className="bg-gray-50 dark:bg-gray-800/50">
                              <Group justify="space-between" align="center" mb="xs">
                                <Group gap="sm">
                                  <ThemeIcon 
                                    size="sm" 
                                    variant="filled" 
                                    color={hasFirefliesToken ? 'green' : 'gray'} 
                                    radius="xl"
                                  >
                                    {hasFirefliesToken ? <IconCheck size={12} /> : <Text size="xs">1</Text>}
                                  </ThemeIcon>
                                  <Text size="sm" fw={500}>Create Fireflies Webhook Token</Text>
                                </Group>
                                {hasFirefliesToken ? (
                                  <Badge color="green" size="xs" variant="light">Configured</Badge>
                                ) : (
                                  <Button 
                                    size="xs" 
                                    variant="light" 
                                    leftSection={<IconPlus size={12} />}
                                    onClick={openTokenModal}
                                  >
                                    Create Token
                                  </Button>
                                )}
                              </Group>
                              <Text size="xs" c="dimmed" ml="xl">
                                Generate an API token that Fireflies can use to send webhook data to your account.
                              </Text>
                            </Paper>

                            {/* Step 2: Fireflies Integration */}
                            <Paper p="sm" radius="sm" className="bg-gray-50 dark:bg-gray-800/50">
                              <Group justify="space-between" align="center" mb="xs">
                                <Group gap="sm">
                                  <ThemeIcon 
                                    size="sm" 
                                    variant="filled" 
                                    color={hasFirefliesIntegration ? 'green' : 'gray'} 
                                    radius="xl"
                                  >
                                    {hasFirefliesIntegration ? <IconCheck size={12} /> : <Text size="xs">2</Text>}
                                  </ThemeIcon>
                                  <Text size="sm" fw={500}>Add Fireflies API Key</Text>
                                </Group>
                                {hasFirefliesIntegration ? (
                                  <Badge color="green" size="xs" variant="light">Configured</Badge>
                                ) : (
                                  <Button 
                                    size="xs" 
                                    variant="light" 
                                    leftSection={<IconPlus size={12} />}
                                    onClick={openIntegrationModal}
                                  >
                                    Add Integration
                                  </Button>
                                )}
                              </Group>
                              <Text size="xs" c="dimmed" ml="xl">
                                Connect your Fireflies account so we can fetch meeting transcripts and summaries.
                              </Text>
                            </Paper>

                            {/* Additional Steps */}
                            <Paper p="sm" radius="sm" className="bg-gray-50 dark:bg-gray-800/50">
                              <Group gap="sm" mb="xs">
                                <ThemeIcon size="sm" variant="filled" color="blue" radius="xl">
                                  <Text size="xs">3</Text>
                                </ThemeIcon>
                                <Text size="sm" fw={500}>Configure Fireflies Webhook (External)</Text>
                              </Group>
                              <Text size="xs" c="dimmed" ml="xl">
                                In your Fireflies account, set up a webhook to notify this application when meetings are processed.
                              </Text>
                            </Paper>
                          </Stack>
                        </Accordion.Panel>
                      </Accordion.Item>
                    </Accordion>

                    <Button
                      variant={isFirefliesConfigured ? "light" : "filled"}
                      color="teal"
                      size="sm"
                      leftSection={<IconPlaylistAdd size={16} />}
                      disabled={!isFirefliesConfigured}
                    >
                      {isFirefliesConfigured ? 'Workflow Active' : 'Complete Setup First'}
                    </Button>
                  </Card>
                );
              }

              // Regular workflow cards for other workflows
              return (
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
              );
            })}
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

        {/* Token Creation Modal */}
        <Modal 
          opened={tokenModalOpened} 
          onClose={handleCloseTokenModal}
          title="Create Fireflies Webhook Token"
          size="md"
        >
          <form onSubmit={tokenForm.onSubmit(handleCreateToken)}>
            <Stack gap="md">
              {!showToken ? (
                <>
                  <TextInput
                    label="Token Name"
                    placeholder="e.g., Fireflies Webhook Token"
                    required
                    {...tokenForm.getInputProps('name')}
                  />

                  <Select
                    label="Expires In"
                    data={[
                      { value: '24h', label: '24 hours' },
                      { value: '7d', label: '7 days' },
                      { value: '30d', label: '30 days' },
                      { value: '90d', label: '90 days' },
                    ]}
                    {...tokenForm.getInputProps('expiresIn')}
                  />

                  <Textarea
                    label="Description"
                    placeholder="Token for Fireflies webhook integration"
                    {...tokenForm.getInputProps('description')}
                    minRows={2}
                  />

                  <Alert 
                    icon={<IconKey size={16} />}
                    title="Webhook Token"
                    color="blue"
                  >
                    This token will be used by Fireflies to authenticate webhook requests to your account.
                  </Alert>

                  <Group justify="flex-end">
                    <Button variant="light" onClick={handleCloseTokenModal}>
                      Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      loading={generateToken.isPending}
                      leftSection={<IconPlus size={16} />}
                    >
                      Generate Token
                    </Button>
                  </Group>
                </>
              ) : (
                <>
                  <Alert 
                    icon={<IconCheck size={16} />}
                    title="API Token Generated Successfully"
                    color="green"
                  >
                    Your Fireflies webhook token has been generated. Copy it now and store it securely - you won't be able to see it again.
                  </Alert>

                  <div>
                    <Text size="sm" fw={500} mb="xs">Your API Token (32 characters):</Text>
                    <Paper withBorder p="sm" bg="gray.0">
                      <Group justify="space-between" wrap="nowrap">
                        <Code 
                          style={{ 
                            wordBreak: 'break-all',
                            fontSize: '12px',
                            flex: 1
                          }}
                        >
                          {generatedToken}
                        </Code>
                        <CopyButton value={generatedToken || ''}>
                          {({ copied, copy }) => (
                            <ActionIcon 
                              color={copied ? 'teal' : 'gray'} 
                              onClick={copy}
                              variant="light"
                            >
                              {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                            </ActionIcon>
                          )}
                        </CopyButton>
                      </Group>
                    </Paper>
                  </div>

                  <Alert 
                    icon={<IconAlertCircle size={16} />}
                    title="Security Notice"
                    color="red"
                  >
                    This API token will not be shown again. Save it securely - it's perfect for webhook configurations!
                  </Alert>

                  <Group justify="flex-end">
                    <Button onClick={handleCloseTokenModal}>
                      Done
                    </Button>
                  </Group>
                </>
              )}
            </Stack>
          </form>
        </Modal>

        {/* Integration Creation Modal */}
        <Modal 
          opened={integrationModalOpened} 
          onClose={closeIntegrationModal}
          title="Add Fireflies Integration"
          size="md"
        >
          <form onSubmit={integrationForm.onSubmit(handleCreateIntegration)}>
            <Stack gap="md">
              <TextInput
                label="Integration Name"
                placeholder="e.g., Fireflies Integration"
                required
                {...integrationForm.getInputProps('name')}
              />

              <TextInput
                label="Fireflies API Key"
                placeholder="Enter your Fireflies API key"
                required
                type="password"
                {...integrationForm.getInputProps('apiKey')}
              />

              <Textarea
                label="Description"
                placeholder="API key for Fireflies integration"
                {...integrationForm.getInputProps('description')}
                minRows={2}
              />

              <Alert 
                icon={<IconBrandFirebase size={16} />}
                title="Fireflies API Key"
                color="blue"
              >
                Your Fireflies API key will be tested during creation. Get your API key from your Fireflies account settings.
              </Alert>

              <Group justify="flex-end">
                <Button variant="light" onClick={closeIntegrationModal}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  loading={createIntegration.isPending}
                  leftSection={<IconPlus size={16} />}
                >
                  Create Integration
                </Button>
              </Group>
            </Stack>
          </form>
        </Modal>
      </Stack>
    </Container>
  );
}
