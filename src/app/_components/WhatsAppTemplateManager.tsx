'use client';

import { useState } from 'react';
import {
  Card,
  Stack,
  Title,
  Text,
  Group,
  Badge,
  Table,
  ScrollArea,
  Button,
  ActionIcon,
  Modal,
  TextInput,
  Textarea,
  Select,
  JsonInput,
  LoadingOverlay,
  Tooltip,
  Tabs,
  Alert,
  Box,
  SimpleGrid,
  RingProgress,
  ThemeIcon,
} from '@mantine/core';
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconCheck,
  IconClock,
  IconAlertCircle,
  IconMessage,
  IconChartBar,
  IconEye,
  IconSend,
  IconRefresh,
} from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { notifications } from '@mantine/notifications';
import { formatDistanceToNow } from 'date-fns';

const categoryOptions = [
  { value: 'UTILITY', label: 'Utility - Transactional messages' },
  { value: 'MARKETING', label: 'Marketing - Promotional messages' },
  { value: 'AUTHENTICATION', label: 'Authentication - OTP and verification' },
];

const statusColors = {
  APPROVED: 'green',
  PENDING: 'blue',
  REJECTED: 'red',
} as const;

const headerTypeOptions = [
  { value: 'TEXT', label: 'Text' },
  { value: 'IMAGE', label: 'Image' },
  { value: 'VIDEO', label: 'Video' },
  { value: 'DOCUMENT', label: 'Document' },
];

interface TemplateFormData {
  name: string;
  language: string;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
  headerType?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  headerText?: string;
  bodyText: string;
  footerText?: string;
  buttons?: any;
}

export function WhatsAppTemplateManager() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<string | null>('templates');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  // Get templates
  const { data: templates, refetch: refetchTemplates } = api.whatsapp.getTemplates.useQuery();

  // Get template metrics
  const { data: metrics } = api.whatsapp.getTemplateMetrics.useQuery();

  // Create template mutation
  const createTemplate = api.whatsapp.createTemplate.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Template created',
        message: 'Your template has been submitted for approval',
        color: 'green',
      });
      setIsCreateModalOpen(false);
      void refetchTemplates();
    },
    onError: (error) => {
      notifications.show({
        title: 'Failed to create template',
        message: error.message,
        color: 'red',
      });
    },
  });

  // Update template mutation
  const updateTemplate = api.whatsapp.updateTemplate.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Template updated',
        message: 'Your template has been updated successfully',
        color: 'green',
      });
      setIsEditModalOpen(false);
      void refetchTemplates();
    },
    onError: (error) => {
      notifications.show({
        title: 'Failed to update template',
        message: error.message,
        color: 'red',
      });
    },
  });

  // Delete template mutation
  const deleteTemplate = api.whatsapp.deleteTemplate.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Template deleted',
        message: 'Your template has been deleted',
        color: 'green',
      });
      void refetchTemplates();
    },
    onError: (error) => {
      notifications.show({
        title: 'Failed to delete template',
        message: error.message,
        color: 'red',
      });
    },
  });

  // Test template mutation
  const testTemplate = api.whatsapp.testTemplate.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Test sent',
        message: 'Test message has been sent to your WhatsApp',
        color: 'green',
      });
    },
    onError: (error) => {
      notifications.show({
        title: 'Failed to send test',
        message: error.message,
        color: 'red',
      });
    },
  });

  const filteredTemplates = templates?.filter((template) => {
    const matchesSearch = !searchQuery || 
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.bodyText.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = !statusFilter || template.status === statusFilter;
    const matchesCategory = !categoryFilter || template.category === categoryFilter;
    
    return matchesSearch && matchesStatus && matchesCategory;
  });

  const handleCreateTemplate = (data: TemplateFormData) => {
    createTemplate.mutate(data);
  };

  const handleUpdateTemplate = (data: TemplateFormData) => {
    if (!selectedTemplate) return;
    
    updateTemplate.mutate({
      templateId: selectedTemplate.id,
      ...data,
    });
  };

  const handleDeleteTemplate = (templateId: string) => {
    if (confirm('Are you sure you want to delete this template?')) {
      deleteTemplate.mutate({ templateId });
    }
  };

  const handleTestTemplate = (templateId: string) => {
    const variables = ['John Doe', 'Task Manager']; // Example variables
    testTemplate.mutate({ templateId, variables });
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={2}>WhatsApp Message Templates</Title>
        <Group>
          <Button
            leftSection={<IconRefresh size={16} />}
            variant="light"
            onClick={() => void refetchTemplates()}
          >
            Refresh
          </Button>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => setIsCreateModalOpen(true)}
          >
            Create Template
          </Button>
        </Group>
      </Group>

      {/* Metrics Cards */}
      <SimpleGrid cols={4}>
        <Card withBorder p="md">
          <Group justify="space-between">
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Total Templates
              </Text>
              <Text size="xl" fw={700}>{metrics?.total || 0}</Text>
            </div>
            <ThemeIcon color="gray" variant="light" size="xl">
              <IconMessage size={24} />
            </ThemeIcon>
          </Group>
        </Card>

        <Card withBorder p="md">
          <Group justify="space-between">
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Approved
              </Text>
              <Text size="xl" fw={700} c="green">{metrics?.approved || 0}</Text>
            </div>
            <ThemeIcon color="green" variant="light" size="xl">
              <IconCheck size={24} />
            </ThemeIcon>
          </Group>
        </Card>

        <Card withBorder p="md">
          <Group justify="space-between">
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Messages Sent
              </Text>
              <Text size="xl" fw={700}>{metrics?.totalSent || 0}</Text>
            </div>
            <ThemeIcon color="blue" variant="light" size="xl">
              <IconSend size={24} />
            </ThemeIcon>
          </Group>
        </Card>

        <Card withBorder p="md">
          <Group justify="space-between">
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Delivery Rate
              </Text>
              <RingProgress
                size={60}
                thickness={6}
                sections={[
                  { value: metrics?.deliveryRate || 0, color: 'green' },
                ]}
                label={
                  <Text size="xs" ta="center">
                    {metrics?.deliveryRate || 0}%
                  </Text>
                }
              />
            </div>
          </Group>
        </Card>
      </SimpleGrid>

      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="templates" leftSection={<IconMessage size={16} />}>
            Templates
          </Tabs.Tab>
          <Tabs.Tab value="usage" leftSection={<IconChartBar size={16} />}>
            Usage Analytics
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="templates" pt="md">
          <Card withBorder>
            <Stack gap="md">
              {/* Filters */}
              <Group>
                <TextInput
                  placeholder="Search templates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.currentTarget.value)}
                  style={{ flex: 1 }}
                />
                <Select
                  placeholder="Filter by status"
                  data={[
                    { value: '', label: 'All Status' },
                    { value: 'APPROVED', label: 'Approved' },
                    { value: 'PENDING', label: 'Pending' },
                    { value: 'REJECTED', label: 'Rejected' },
                  ]}
                  value={statusFilter}
                  onChange={setStatusFilter}
                  clearable
                  style={{ width: 150 }}
                />
                <Select
                  placeholder="Filter by category"
                  data={[
                    { value: '', label: 'All Categories' },
                    ...categoryOptions,
                  ]}
                  value={categoryFilter}
                  onChange={setCategoryFilter}
                  clearable
                  style={{ width: 200 }}
                />
              </Group>

              {/* Templates Table */}
              <ScrollArea h={500}>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Name</Table.Th>
                      <Table.Th>Category</Table.Th>
                      <Table.Th>Language</Table.Th>
                      <Table.Th>Status</Table.Th>
                      <Table.Th>Usage</Table.Th>
                      <Table.Th>Actions</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {filteredTemplates?.length === 0 ? (
                      <Table.Tr>
                        <Table.Td colSpan={6}>
                          <Text c="dimmed" ta="center" py="md">
                            No templates found
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ) : (
                      filteredTemplates?.map((template) => (
                        <Table.Tr key={template.id}>
                          <Table.Td>
                            <Stack gap={4}>
                              <Text fw={500}>{template.name}</Text>
                              <Text size="xs" c="dimmed" lineClamp={2}>
                                {template.bodyText}
                              </Text>
                            </Stack>
                          </Table.Td>
                          <Table.Td>
                            <Badge variant="light">
                              {template.category}
                            </Badge>
                          </Table.Td>
                          <Table.Td>{template.language}</Table.Td>
                          <Table.Td>
                            <Badge
                              color={statusColors[template.status as keyof typeof statusColors]}
                              variant="light"
                            >
                              {template.status}
                            </Badge>
                            {template.status === 'REJECTED' && template.rejectionReason && (
                              <Tooltip 
                                label={`Rejected: ${template.rejectionReason}`}
                                multiline
                              >
                                <ActionIcon
                                  size="xs"
                                  variant="subtle"
                                  color="red"
                                  ml={4}
                                >
                                  <IconAlertCircle size={14} />
                                </ActionIcon>
                              </Tooltip>
                            )}
                            {template.status === 'PENDING' && (
                              <Tooltip label="Waiting for administrator approval">
                                <ActionIcon
                                  size="xs"
                                  variant="subtle"
                                  color="blue"
                                  ml={4}
                                >
                                  <IconClock size={14} />
                                </ActionIcon>
                              </Tooltip>
                            )}
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm">{template._count?.usageMetrics || 0}</Text>
                          </Table.Td>
                          <Table.Td>
                            <Group gap="xs">
                              <Tooltip label="View details">
                                <ActionIcon
                                  variant="light"
                                  onClick={() => {
                                    setSelectedTemplate(template);
                                    setIsEditModalOpen(true);
                                  }}
                                >
                                  <IconEye size={16} />
                                </ActionIcon>
                              </Tooltip>
                              {template.status === 'APPROVED' && (
                                <Tooltip label="Send test">
                                  <ActionIcon
                                    variant="light"
                                    color="blue"
                                    onClick={() => handleTestTemplate(template.id)}
                                    loading={testTemplate.isPending}
                                  >
                                    <IconSend size={16} />
                                  </ActionIcon>
                                </Tooltip>
                              )}
                              {(template.status === 'PENDING' || template.status === 'REJECTED') && (
                                <Tooltip label="Edit template">
                                  <ActionIcon
                                    variant="light"
                                    color="blue"
                                    onClick={() => {
                                      setSelectedTemplate(template);
                                      setIsEditModalOpen(true);
                                    }}
                                  >
                                    <IconEdit size={16} />
                                  </ActionIcon>
                                </Tooltip>
                              )}
                              <Tooltip 
                                label={
                                  template.status === 'APPROVED' 
                                    ? "Cannot delete approved templates" 
                                    : "Delete template"
                                }
                              >
                                <ActionIcon
                                  variant="light"
                                  color="red"
                                  onClick={() => handleDeleteTemplate(template.id)}
                                  loading={deleteTemplate.isPending}
                                  disabled={template.status === 'APPROVED'}
                                >
                                  <IconTrash size={16} />
                                </ActionIcon>
                              </Tooltip>
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      ))
                    )}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Stack>
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="usage" pt="md">
          <TemplateUsageAnalytics templates={filteredTemplates || []} />
        </Tabs.Panel>
      </Tabs>

      {/* Create/Edit Template Modal */}
      <TemplateFormModal
        isOpen={isCreateModalOpen || isEditModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setIsEditModalOpen(false);
          setSelectedTemplate(null);
        }}
        onSubmit={isEditModalOpen ? handleUpdateTemplate : handleCreateTemplate}
        template={selectedTemplate}
        isLoading={createTemplate.isPending || updateTemplate.isPending}
        isEdit={isEditModalOpen}
      />
    </Stack>
  );
}

interface TemplateFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: TemplateFormData) => void;
  template?: any;
  isLoading: boolean;
  isEdit: boolean;
}

function TemplateFormModal({
  isOpen,
  onClose,
  onSubmit,
  template,
  isLoading,
  isEdit,
}: TemplateFormModalProps) {
  const [formData, setFormData] = useState<TemplateFormData>({
    name: '',
    language: 'en_US',
    category: 'UTILITY',
    headerType: undefined,
    headerText: '',
    bodyText: '',
    footerText: '',
    buttons: undefined,
  });

  // Update form when template changes
  useState(() => {
    if (template) {
      setFormData({
        name: template.name,
        language: template.language,
        category: template.category,
        headerType: template.headerType,
        headerText: template.headerText || '',
        bodyText: template.bodyText,
        footerText: template.footerText || '',
        buttons: template.buttons,
      });
    } else {
      setFormData({
        name: '',
        language: 'en_US',
        category: 'UTILITY',
        headerType: undefined,
        headerText: '',
        bodyText: '',
        footerText: '',
        buttons: undefined,
      });
    }
  });

  const handleSubmit = () => {
    // Validate required fields
    if (!formData.name || !formData.bodyText) {
      notifications.show({
        title: 'Validation error',
        message: 'Please fill in all required fields',
        color: 'red',
      });
      return;
    }

    onSubmit(formData);
  };

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={isEdit ? 'Edit Template' : 'Create Template'}
      size="lg"
    >
      <LoadingOverlay visible={isLoading} />
      <Stack gap="md">
        <TextInput
          label="Template Name"
          placeholder="e.g., task_reminder_notification"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.currentTarget.value })}
          required
          disabled={isEdit && template?.status === 'APPROVED'}
        />

        <Select
          label="Language"
          data={[
            { value: 'en_US', label: 'English (US)' },
            { value: 'es_ES', label: 'Spanish' },
            { value: 'fr_FR', label: 'French' },
            { value: 'pt_BR', label: 'Portuguese (BR)' },
          ]}
          value={formData.language}
          onChange={(value) => setFormData({ ...formData, language: value || 'en_US' })}
          required
        />

        <Select
          label="Category"
          data={categoryOptions}
          value={formData.category}
          onChange={(value) => setFormData({ ...formData, category: (value || 'UTILITY') as 'UTILITY' | 'MARKETING' | 'AUTHENTICATION' })}
          required
        />

        <Select
          label="Header Type (Optional)"
          data={headerTypeOptions}
          value={formData.headerType}
          onChange={(value) => setFormData({ ...formData, headerType: value as 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | undefined })}
          clearable
        />

        {formData.headerType === 'TEXT' && (
          <TextInput
            label="Header Text"
            placeholder="Header text with {{1}} variables"
            value={formData.headerText}
            onChange={(e) => setFormData({ ...formData, headerText: e.currentTarget.value })}
          />
        )}

        <Textarea
          label="Body Text"
          placeholder="Main message with {{1}}, {{2}} variables for dynamic content"
          value={formData.bodyText}
          onChange={(e) => setFormData({ ...formData, bodyText: e.currentTarget.value })}
          required
          minRows={4}
        />

        <TextInput
          label="Footer Text (Optional)"
          placeholder="e.g., Reply STOP to unsubscribe"
          value={formData.footerText}
          onChange={(e) => setFormData({ ...formData, footerText: e.currentTarget.value })}
        />

        <JsonInput
          label="Buttons (Optional)"
          placeholder='[{"type": "QUICK_REPLY", "text": "Yes"}, {"type": "QUICK_REPLY", "text": "No"}]'
          value={formData.buttons ? JSON.stringify(formData.buttons, null, 2) : ''}
          onChange={(value) => {
            try {
              setFormData({ ...formData, buttons: value ? JSON.parse(value) : undefined });
            } catch {
              // Invalid JSON, ignore
            }
          }}
          formatOnBlur
          minRows={4}
        />

        <Stack gap="xs">
          <Alert icon={<IconAlertCircle size={16} />} color="blue">
            <Text size="sm">
              Templates must be approved by WhatsApp before use. Use variables like {'{{1}}'}, {'{{2}}'} for dynamic content.
            </Text>
          </Alert>
          
          <Alert icon={<IconClock size={16} />} color="orange">
            <Stack gap="xs">
              <Text size="sm" fw={500}>Approval Workflow:</Text>
              <Text size="sm">
                1. Templates are submitted to administrators for review<br/>
                2. Administrators approve or reject based on content guidelines<br/>
                3. Approved templates are then submitted to WhatsApp for final approval<br/>
                4. Only approved templates can be used for notifications
              </Text>
            </Stack>
          </Alert>
        </Stack>

        <Group justify="flex-end">
          <Button variant="light" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={isLoading}>
            {isEdit ? 'Update' : 'Create'} Template
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function TemplateUsageAnalytics({ templates }: { templates: any[] }) {
  const { data: analytics } = api.whatsapp.getTemplateAnalytics.useQuery();

  if (!analytics || analytics.length === 0) {
    return (
      <Card withBorder>
        <Text c="dimmed" ta="center" py="xl">
          No usage data available yet
        </Text>
      </Card>
    );
  }

  return (
    <SimpleGrid cols={2}>
      {analytics.map((item) => {
        const template = templates.find((t) => t.id === item.templateId);
        if (!template) return null;

        return (
          <Card key={item.templateId} withBorder>
            <Stack gap="sm">
              <Group justify="space-between">
                <Title order={5}>{template.name}</Title>
                <Badge variant="light">{template.category}</Badge>
              </Group>

              <SimpleGrid cols={2}>
                <div>
                  <Text size="xs" c="dimmed">Total Sent</Text>
                  <Text size="lg" fw={600}>{item.totalSent}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">Delivered</Text>
                  <Text size="lg" fw={600} c="green">{item.delivered}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">Read</Text>
                  <Text size="lg" fw={600} c="blue">{item.read}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">Failed</Text>
                  <Text size="lg" fw={600} c="red">{item.failed}</Text>
                </div>
              </SimpleGrid>

              <Box>
                <Text size="xs" c="dimmed" mb={4}>Performance</Text>
                <Group gap="xs">
                  <Text size="sm">Delivery Rate:</Text>
                  <Badge color="green" variant="light">
                    {item.deliveryRate}%
                  </Badge>
                  <Text size="sm">Read Rate:</Text>
                  <Badge color="blue" variant="light">
                    {item.readRate}%
                  </Badge>
                </Group>
              </Box>

              {item.lastUsed && (
                <Text size="xs" c="dimmed">
                  Last used {formatDistanceToNow(new Date(item.lastUsed), { addSuffix: true })}
                </Text>
              )}
            </Stack>
          </Card>
        );
      })}
    </SimpleGrid>
  );
}