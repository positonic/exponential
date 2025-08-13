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
  Textarea,
  LoadingOverlay,
  Tooltip,
  Tabs,
  Alert,
  Box,
  SimpleGrid,
  ThemeIcon,
  Divider,
  Timeline,
  Avatar,
} from '@mantine/core';
import {
  IconCheck,
  IconX,
  IconClock,
  IconAlertCircle,
  IconEye,
  IconShieldCheck,
  IconHistory,
  IconUser,
} from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { notifications } from '@mantine/notifications';
import { formatDistanceToNow } from 'date-fns';

const statusColors = {
  APPROVED: 'green',
  PENDING: 'blue',
  REJECTED: 'red',
} as const;

export function WhatsAppTemplateApprovalManager() {
  const [activeTab, setActiveTab] = useState<string | null>('pending');
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  // Check admin permissions
  const { data: permissions } = api.whatsapp.checkAdminPermissions.useQuery();

  // Get pending templates
  const { data: pendingTemplates, refetch: refetchPending } = api.whatsapp.getPendingTemplatesForReview.useQuery(
    undefined,
    { enabled: permissions?.isAdmin }
  );

  // Get approval history
  const { data: approvalHistory } = api.whatsapp.getTemplateApprovalHistory.useQuery(
    { limit: 50 },
    { enabled: permissions?.isAdmin }
  );

  // Approve template mutation
  const approveTemplate = api.whatsapp.approveTemplate.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Template approved',
        message: 'The template has been approved successfully',
        color: 'green',
      });
      void refetchPending();
      setIsViewModalOpen(false);
    },
    onError: (error) => {
      notifications.show({
        title: 'Failed to approve template',
        message: error.message,
        color: 'red',
      });
    },
  });

  // Reject template mutation
  const rejectTemplate = api.whatsapp.rejectTemplate.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Template rejected',
        message: 'The template has been rejected',
        color: 'orange',
      });
      void refetchPending();
      setIsRejectModalOpen(false);
      setRejectionReason('');
    },
    onError: (error) => {
      notifications.show({
        title: 'Failed to reject template',
        message: error.message,
        color: 'red',
      });
    },
  });

  if (!permissions?.isAdmin) {
    return (
      <Card withBorder>
        <Alert icon={<IconShieldCheck size={16} />} title="Access Denied" color="red">
          You don&apos;t have permission to access the template approval system. 
          Only administrators can approve or reject WhatsApp message templates.
        </Alert>
      </Card>
    );
  }

  const handleApprove = (templateId: string) => {
    approveTemplate.mutate({ templateId });
  };

  const handleReject = (template: any) => {
    setSelectedTemplate(template);
    setIsRejectModalOpen(true);
  };

  const handleRejectConfirm = () => {
    if (!selectedTemplate || !rejectionReason.trim()) {
      notifications.show({
        title: 'Rejection reason required',
        message: 'Please provide a reason for rejecting this template',
        color: 'red',
      });
      return;
    }

    rejectTemplate.mutate({
      templateId: selectedTemplate.id,
      reason: rejectionReason.trim(),
    });
  };

  const handleViewTemplate = (template: any) => {
    setSelectedTemplate(template);
    setIsViewModalOpen(true);
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={2}>Template Approval Manager</Title>
        <Badge leftSection={<IconShieldCheck size={16} />} variant="light">
          Administrator
        </Badge>
      </Group>

      {/* Summary Cards */}
      <SimpleGrid cols={3}>
        <Card withBorder p="md">
          <Group justify="space-between">
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Pending Review
              </Text>
              <Text size="xl" fw={700} c="blue">{pendingTemplates?.length || 0}</Text>
            </div>
            <ThemeIcon color="blue" variant="light" size="xl">
              <IconClock size={24} />
            </ThemeIcon>
          </Group>
        </Card>

        <Card withBorder p="md">
          <Group justify="space-between">
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Recent Actions
              </Text>
              <Text size="xl" fw={700}>{approvalHistory?.length || 0}</Text>
            </div>
            <ThemeIcon color="gray" variant="light" size="xl">
              <IconHistory size={24} />
            </ThemeIcon>
          </Group>
        </Card>

        <Card withBorder p="md">
          <Group justify="space-between">
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Your Role
              </Text>
              <Text size="lg" fw={600} c="green">Admin</Text>
            </div>
            <ThemeIcon color="green" variant="light" size="xl">
              <IconShieldCheck size={24} />
            </ThemeIcon>
          </Group>
        </Card>
      </SimpleGrid>

      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="pending" leftSection={<IconClock size={16} />}>
            Pending Review ({pendingTemplates?.length || 0})
          </Tabs.Tab>
          <Tabs.Tab value="history" leftSection={<IconHistory size={16} />}>
            Approval History
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="pending" pt="md">
          <Card withBorder>
            <Stack gap="md">
              <Title order={4}>Templates Awaiting Approval</Title>
              
              {pendingTemplates?.length === 0 ? (
                <Alert icon={<IconCheck size={16} />} color="green">
                  <Text>No templates pending approval. Great job!</Text>
                </Alert>
              ) : (
                <ScrollArea h={500}>
                  <Table striped highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Template</Table.Th>
                        <Table.Th>Submitted By</Table.Th>
                        <Table.Th>Category</Table.Th>
                        <Table.Th>Submitted</Table.Th>
                        <Table.Th>Actions</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {pendingTemplates?.map((template) => (
                        <Table.Tr key={template.id}>
                          <Table.Td>
                            <Stack gap={4}>
                              <Text fw={500}>{template.name}</Text>
                              <Text size="xs" c="dimmed" lineClamp={2}>
                                {template.bodyText}
                              </Text>
                              <Text size="xs" c="dimmed">
                                Language: {template.language}
                              </Text>
                            </Stack>
                          </Table.Td>
                          <Table.Td>
                            <Group gap="xs">
                              <Avatar size="sm" radius="xl">
                                <IconUser size={16} />
                              </Avatar>
                              <div>
                                <Text size="sm">{template.whatsappConfig?.integration?.user?.name || 'Unknown User'}</Text>
                                <Text size="xs" c="dimmed">{template.whatsappConfig?.integration?.user?.email || 'No email'}</Text>
                              </div>
                            </Group>
                          </Table.Td>
                          <Table.Td>
                            <Badge variant="light">
                              {template.category}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <Tooltip label={new Date(template.createdAt).toLocaleString()}>
                              <Text size="sm">
                                {formatDistanceToNow(new Date(template.createdAt), { addSuffix: true })}
                              </Text>
                            </Tooltip>
                          </Table.Td>
                          <Table.Td>
                            <Group gap="xs">
                              <Tooltip label="View details">
                                <ActionIcon
                                  variant="light"
                                  onClick={() => handleViewTemplate(template)}
                                >
                                  <IconEye size={16} />
                                </ActionIcon>
                              </Tooltip>
                              <Tooltip label="Approve template">
                                <ActionIcon
                                  variant="light"
                                  color="green"
                                  onClick={() => handleApprove(template.id)}
                                  loading={approveTemplate.isPending}
                                >
                                  <IconCheck size={16} />
                                </ActionIcon>
                              </Tooltip>
                              <Tooltip label="Reject template">
                                <ActionIcon
                                  variant="light"
                                  color="red"
                                  onClick={() => handleReject(template)}
                                >
                                  <IconX size={16} />
                                </ActionIcon>
                              </Tooltip>
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              )}
            </Stack>
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="history" pt="md">
          <Card withBorder>
            <Stack gap="md">
              <Title order={4}>Approval History</Title>
              
              {approvalHistory?.length === 0 ? (
                <Text c="dimmed" ta="center" py="md">
                  No approval history found
                </Text>
              ) : (
                <Timeline active={-1} bulletSize={24} lineWidth={2}>
                  {approvalHistory?.map((item) => {
                    const isApproval = item.intent === 'template_approval';
                    const metadata = (item as any).metadata;
                    
                    return (
                      <Timeline.Item
                        key={item.id}
                        bullet={
                          <ThemeIcon
                            size={24}
                            variant="light"
                            color={isApproval ? 'green' : 'red'}
                          >
                            {isApproval ? <IconCheck size={14} /> : <IconX size={14} />}
                          </ThemeIcon>
                        }
                        title={
                          <Text fw={500}>
                            {isApproval ? 'Approved' : 'Rejected'}: {metadata?.templateName}
                          </Text>
                        }
                      >
                        <Stack gap="xs">
                          <Group gap="xs">
                            <Text size="sm" c="dimmed">By:</Text>
                            <Text size="sm">{item.user?.name}</Text>
                          </Group>
                          {metadata?.reason && (
                            <Group gap="xs" align="flex-start">
                              <Text size="sm" c="dimmed">Reason:</Text>
                              <Text size="sm">{metadata.reason}</Text>
                            </Group>
                          )}
                          <Text size="xs" c="dimmed">
                            {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                          </Text>
                        </Stack>
                      </Timeline.Item>
                    );
                  })}
                </Timeline>
              )}
            </Stack>
          </Card>
        </Tabs.Panel>
      </Tabs>

      {/* Template Details Modal */}
      <Modal
        opened={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        title="Template Details"
        size="lg"
      >
        {selectedTemplate && (
          <Stack gap="md">
            <Group justify="space-between">
              <Title order={4}>{selectedTemplate.name}</Title>
              <Badge
                color={statusColors[selectedTemplate.status as keyof typeof statusColors]}
                variant="light"
              >
                {selectedTemplate.status}
              </Badge>
            </Group>

            <Divider />

            <SimpleGrid cols={2}>
              <div>
                <Text size="sm" fw={500} mb={4}>Language</Text>
                <Text size="sm">{selectedTemplate.language}</Text>
              </div>
              <div>
                <Text size="sm" fw={500} mb={4}>Category</Text>
                <Text size="sm">{selectedTemplate.category}</Text>
              </div>
            </SimpleGrid>

            {selectedTemplate.headerText && (
              <Box>
                <Text size="sm" fw={500} mb={4}>Header ({selectedTemplate.headerType})</Text>
                <Text size="sm" p="sm" bg="gray.0" style={{ borderRadius: 4 }}>
                  {selectedTemplate.headerText}
                </Text>
              </Box>
            )}

            <Box>
              <Text size="sm" fw={500} mb={4}>Body Text</Text>
              <Text size="sm" p="sm" bg="blue.0" style={{ borderRadius: 4 }}>
                {selectedTemplate.bodyText}
              </Text>
            </Box>

            {selectedTemplate.footerText && (
              <Box>
                <Text size="sm" fw={500} mb={4}>Footer</Text>
                <Text size="sm" p="sm" bg="gray.0" style={{ borderRadius: 4 }}>
                  {selectedTemplate.footerText}
                </Text>
              </Box>
            )}

            {selectedTemplate.buttons && (
              <Box>
                <Text size="sm" fw={500} mb={4}>Buttons</Text>
                <Text size="xs" p="sm" bg="gray.1" style={{ borderRadius: 4, fontFamily: 'monospace' }}>
                  {JSON.stringify(selectedTemplate.buttons, null, 2)}
                </Text>
              </Box>
            )}

            <Divider />

            <Group justify="flex-end">
              <Button variant="light" onClick={() => setIsViewModalOpen(false)}>
                Close
              </Button>
              <Button
                color="green"
                leftSection={<IconCheck size={16} />}
                onClick={() => handleApprove(selectedTemplate.id)}
                loading={approveTemplate.isPending}
              >
                Approve
              </Button>
              <Button
                color="red"
                leftSection={<IconX size={16} />}
                onClick={() => handleReject(selectedTemplate)}
              >
                Reject
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>

      {/* Rejection Modal */}
      <Modal
        opened={isRejectModalOpen}
        onClose={() => {
          setIsRejectModalOpen(false);
          setRejectionReason('');
        }}
        title="Reject Template"
      >
        <LoadingOverlay visible={rejectTemplate.isPending} />
        <Stack gap="md">
          <Alert icon={<IconAlertCircle size={16} />} color="red">
            You are about to reject the template &quot;{selectedTemplate?.name}&quot;. 
            Please provide a clear reason for the rejection to help the user improve their template.
          </Alert>

          <Textarea
            label="Rejection Reason"
            placeholder="e.g., Template contains prohibited content, formatting issues, missing required information..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.currentTarget.value)}
            required
            minRows={3}
          />

          <Group justify="flex-end">
            <Button
              variant="light"
              onClick={() => {
                setIsRejectModalOpen(false);
                setRejectionReason('');
              }}
            >
              Cancel
            </Button>
            <Button
              color="red"
              leftSection={<IconX size={16} />}
              onClick={handleRejectConfirm}
              loading={rejectTemplate.isPending}
            >
              Reject Template
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}