'use client';

import { useState } from 'react';
import { Container, Title, Text, SimpleGrid, Card, Button, Group, ThemeIcon, Stack, Paper, Badge, Alert, Modal, TextInput, Select, Textarea, Code, CopyButton, ActionIcon, Tabs } from '@mantine/core';
import { IconDownload, IconUpload, IconArrowRight, IconPresentation, IconGitBranch, IconMicrophone, IconWebhook, IconBrandSlack, IconCheck, IconAlertCircle, IconPlus, IconKey, IconBrandFirebase, IconCopy, IconBrandNotion, IconCalendarEvent, /* IconRefresh, */ IconBrandGoogle, IconFileText, IconBolt, IconRocket, IconArrowsLeftRight, IconInfoCircle } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { api } from "~/trpc/react";
import Link from 'next/link';

// Define workflow categories based on data flow
interface WorkflowItem {
  icon: any;
  title: string;
  description: string;
  status: 'active' | 'available' | 'coming-soon' | 'setup-required';
  enabled: boolean;
  href?: string;
  provider: string;
  configKey?: string;
}

const dataSourceWorkflows: WorkflowItem[] = [
  {
    icon: IconMicrophone,
    title: 'Fireflies Meeting Transcription',
    description: 'Automatically capture meeting transcripts and extract action items from Fireflies recordings.',
    status: 'setup-required',
    enabled: false,
    provider: 'Fireflies',
    configKey: 'fireflies'
  },
  {
    icon: IconWebhook,
    title: 'Browser Extension Capture',
    description: 'Capture actions and notes directly from your browser while working on any website.',
    status: 'active',
    enabled: true,
    provider: 'Browser Plugin'
  },
  {
    icon: IconBrandSlack,
    title: 'Slack Message Actions',
    description: 'Create action items directly from Slack messages and conversations.',
    status: 'available',
    enabled: false,
    provider: 'Slack'
  }
];

const taskManagementWorkflows: WorkflowItem[] = [
  {
    icon: IconBrandNotion,
    title: 'Notion Tasks Database',
    description: 'Sync your tasks with Notion databases. Keep everything in sync across platforms.',
    status: 'available',
    enabled: false,
    href: '/workflows/notion',
    provider: 'Notion'
  },
  {
    icon: IconCalendarEvent,
    title: 'Monday.com Boards',
    description: 'Push your action items to Monday.com boards for team collaboration.',
    status: 'available',
    enabled: false,
    href: '/workflows/monday',
    provider: 'Monday.com'
  }
];

const documentWorkflows: WorkflowItem[] = [
  {
    icon: IconBrandGoogle,
    title: 'Google Docs Meeting Summaries',
    description: 'Automatically create meeting summaries and action plans in Google Docs.',
    status: 'coming-soon',
    enabled: false,
    provider: 'Google Docs'
  },
  {
    icon: IconFileText,
    title: 'Document Context Import',
    description: 'Import meeting notes and context from Notion pages and Google Docs for AI assistance.',
    status: 'coming-soon',
    enabled: false,
    provider: 'Multi-platform'
  }
];

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
  const utils = api.useUtils();

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
      void utils.mastra.listApiTokens.invalidate();
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
      void utils.integration.listIntegrations.invalidate();
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

  // Get workflow status
  const getWorkflowStatus = (workflow: WorkflowItem) => {
    if (workflow.configKey === 'fireflies') {
      return isFirefliesConfigured ? 'active' : 'setup-required';
    }
    return workflow.status;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'green';
      case 'available': return 'blue';
      case 'setup-required': return 'orange';
      case 'coming-soon': return 'gray';
      default: return 'gray';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return 'Active';
      case 'available': return 'Available';
      case 'setup-required': return 'Setup Required';
      case 'coming-soon': return 'Coming Soon';
      default: return status;
    }
  };

  const renderWorkflowCard = (workflow: WorkflowItem) => {
    const status = getWorkflowStatus(workflow);
    const isConfigured = status === 'active';
    
    return (
      <Card key={workflow.title} shadow="sm" padding="lg" radius="md" withBorder>
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Group align="center" gap="md">
              <ThemeIcon size="xl" variant="light" color="teal" radius="md">
                <workflow.icon size={28} />
              </ThemeIcon>
              <div>
                <Group gap="xs" align="center" mb={4}>
                  <Text fw={600} size="md">
                    {workflow.title}
                  </Text>
                  <Badge 
                    color={getStatusColor(status)} 
                    variant="light" 
                    size="sm"
                  >
                    {getStatusText(status)}
                  </Badge>
                </Group>
                <Text size="xs" c="dimmed" fw={500}>
                  {workflow.provider}
                </Text>
              </div>
            </Group>
            
            {/* Action Button */}
            {workflow.configKey === 'fireflies' ? (
              <Group gap="xs">
                <Button
                  component={Link}
                  href="/docs/features/fireflies"
                  size="sm"
                  variant="subtle"
                  leftSection={<IconInfoCircle size={14} />}
                >
                  How it works
                </Button>
                {isConfigured ? (
                  <ThemeIcon size="lg" variant="light" color="green" radius="xl">
                    <IconCheck size={20} />
                  </ThemeIcon>
                ) : (
                  <Button
                    size="sm"
                    variant="filled"
                    onClick={() => {
                      if (!hasFirefliesToken) {
                        openTokenModal();
                      } else if (!hasFirefliesIntegration) {
                        openIntegrationModal();
                      }
                    }}
                  >
                    Setup
                  </Button>
                )}
              </Group>
            ) : workflow.href ? (
              <Button
                component={Link}
                href={workflow.href}
                size="sm"
                variant="light"
              >
                Configure
              </Button>
            ) : status === 'coming-soon' ? (
              <Button
                size="sm"
                variant="light"
                disabled
              >
                Coming Soon
              </Button>
            ) : (
              <Button
                size="sm"
                variant="light"
                disabled
              >
                Available Soon
              </Button>
            )}
          </Group>
          
          <Text size="sm" c="dimmed">
            {workflow.description}
          </Text>
        </Stack>
      </Card>
    );
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
            Workflows & Automation
          </Title>
          <Text c="dimmed" size="xl" ta="center" mb="md">
            Connect your tools and automate your productivity workflow
          </Text>
          
          {/* Data Flow Diagram */}
          <Paper p="xl" radius="md" className="bg-gradient-to-r from-blue-50 to-violet-50 dark:from-blue-900/20 dark:to-violet-900/20 border border-blue-200 dark:border-blue-800" mb="xl">
            <Group justify="center" align="center" gap="lg">
              <div className="text-center">
                <ThemeIcon size="lg" variant="light" color="blue" radius="xl" mb="xs">
                  <IconDownload size={20} />
                </ThemeIcon>
                <Text size="sm" fw={500}>Data Sources</Text>
                <Text size="xs" c="dimmed">Meetings, Browser, Slack</Text>
              </div>
              
              <IconArrowRight size={20} className="text-gray-400" />
              
              <div className="text-center">
                <ThemeIcon size="lg" variant="light" color="violet" radius="xl" mb="xs">
                  <IconBolt size={20} />
                </ThemeIcon>
                <Text size="sm" fw={500}>AI Processing</Text>
                <Text size="xs" c="dimmed">Extract & Organize</Text>
              </div>
              
              <IconArrowRight size={20} className="text-gray-400" />
              
              <div className="text-center">
                <ThemeIcon size="lg" variant="light" color="teal" radius="xl" mb="xs">
                  <IconUpload size={20} />
                </ThemeIcon>
                <Text size="sm" fw={500}>Task Management</Text>
                <Text size="xs" c="dimmed">Notion OR Monday.com</Text>
              </div>
            </Group>
          </Paper>
        </div>

        <Tabs defaultValue="automations" color="violet">
          <Tabs.List grow>
            <Tabs.Tab value="automations" leftSection={<IconGitBranch size={16} />}>
              Automated Workflows
            </Tabs.Tab>
            <Tabs.Tab value="guided" leftSection={<IconRocket size={16} />}>
              Guided Processes
            </Tabs.Tab>
          </Tabs.List>

          <div className="mt-8">
            <Tabs.Panel value="automations">
              <Stack gap="xl">
                {/* Data Sources Section */}
                <div>
                  <Group mb="md" align="center">
                    <ThemeIcon size="md" variant="light" color="blue">
                      <IconDownload size={20} />
                    </ThemeIcon>
                    <Title order={3} size="h4">
                      Data Input Sources
                    </Title>
                  </Group>
                  <Text c="dimmed" size="sm" mb="lg">
                    Capture data and actions from external sources automatically.
                  </Text>
                  
                  <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                    {dataSourceWorkflows.map(renderWorkflowCard)}
                  </SimpleGrid>
                </div>

                {/* Task Management Section */}
                <div>
                  <Group mb="md" align="center">
                    <ThemeIcon size="md" variant="light" color="teal">
                      <IconArrowsLeftRight size={20} />
                    </ThemeIcon>
                    <Title order={3} size="h4">
                      Task Management Sync
                    </Title>
                  </Group>
                  <Text c="dimmed" size="sm" mb="md">
                    Choose your primary task management system. You can sync with either Notion OR Monday.com (not both).
                  </Text>
                  
                  <Alert icon={<IconAlertCircle size={16} />} title="Important" color="blue" variant="light" mb="lg">
                    To avoid conflicts, you can only sync with one task management system at a time. 
                    Choose the one your team uses most actively.
                  </Alert>
                  
                  <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                    {taskManagementWorkflows.map(renderWorkflowCard)}
                  </SimpleGrid>
                </div>

                {/* Future Document Workflows */}
                <div>
                  <Group mb="md" align="center">
                    <ThemeIcon size="md" variant="light" color="gray">
                      <IconFileText size={20} />
                    </ThemeIcon>
                    <Title order={3} size="h4">
                      Document Integration
                    </Title>
                    <Badge color="gray" variant="light" size="sm">Coming Soon</Badge>
                  </Group>
                  <Text c="dimmed" size="sm" mb="lg">
                    Export meeting summaries and import context from documents for enhanced AI assistance.
                  </Text>
                  
                  <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                    {documentWorkflows.map(renderWorkflowCard)}
                  </SimpleGrid>
                </div>
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="guided">
              <Stack gap="md">
                <div>
                  <Text c="dimmed" size="sm" mb="lg">
                    Streamline your product journey with guided processes designed to help you achieve specific goals, faster.
                  </Text>
                </div>
                
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  {guidedWorkflows.map((workflow) => (
                    <Card key={workflow.title} shadow="sm" padding="lg" radius="md" withBorder>
                      <Group justify="space-between" align="center" mb="sm">
                        <Group align="center" gap="md">
                          <ThemeIcon size="xl" variant="light" color="violet" radius="md">
                            <workflow.icon size={28} />
                          </ThemeIcon>
                          <Text fw={600} size="md">
                            {workflow.title}
                          </Text>
                        </Group>
                        <Button
                          component={Link}
                          href={workflow.href}
                          size="sm"
                          variant="light"
                          rightSection={<IconArrowRight size={14} />}
                        >
                          {workflow.cta}
                        </Button>
                      </Group>
                      <Text size="sm" c="dimmed" mb="sm">
                        {workflow.description}
                      </Text>
                      <Text size="xs" c="dimmed">
                        Ideal for: {workflow.targetAudience}
                      </Text>
                    </Card>
                  ))}
                </SimpleGrid>
              </Stack>
            </Tabs.Panel>
          </div>
        </Tabs>

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
                    Your Fireflies webhook token has been generated. Copy it now and store it securely - you won&apos;t be able to see it again.
                  </Alert>

                  <div>
                    <Text size="sm" fw={500} mb="xs">Your API Token:</Text>
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