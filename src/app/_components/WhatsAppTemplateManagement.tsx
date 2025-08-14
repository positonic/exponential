'use client';

import { useState } from 'react';
import {
  Container,
  Tabs,
  Stack,
  Title,
  Group,
  Badge,
  Alert,
} from '@mantine/core';
import {
  IconMessage,
  IconShieldCheck,
  IconAlertCircle,
} from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { WhatsAppTemplateManager } from './WhatsAppTemplateManager';
import { WhatsAppTemplateApprovalManager } from './WhatsAppTemplateApprovalManager';

export function WhatsAppTemplateManagement() {
  const [activeTab, setActiveTab] = useState<string | null>('templates');

  // Check admin permissions
  const { data: permissions, isLoading } = api.whatsapp.checkAdminPermissions.useQuery();

  if (isLoading) {
    return null; // Or a loading spinner
  }

  return (
    <Container size="xl">
      <Stack gap="lg">
        <Group justify="space-between">
          <Title order={1}>WhatsApp Template Management</Title>
          {permissions?.isAdmin && (
            <Badge leftSection={<IconShieldCheck size={16} />} variant="light" color="green">
              Administrator Access
            </Badge>
          )}
        </Group>

        {/* Show info about WhatsApp integration requirement */}
        <Alert icon={<IconAlertCircle size={16} />} color="blue">
          WhatsApp message templates require an active WhatsApp Business API integration. 
          Make sure you have configured your WhatsApp integration before creating templates.
        </Alert>

        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Tab value="templates" leftSection={<IconMessage size={16} />}>
              My Templates
            </Tabs.Tab>
            {permissions?.isAdmin && (
              <Tabs.Tab value="approval" leftSection={<IconShieldCheck size={16} />}>
                Admin: Template Approval
              </Tabs.Tab>
            )}
          </Tabs.List>

          <Tabs.Panel value="templates" pt="lg">
            <WhatsAppTemplateManager />
          </Tabs.Panel>

          {permissions?.isAdmin && (
            <Tabs.Panel value="approval" pt="lg">
              <WhatsAppTemplateApprovalManager />
            </Tabs.Panel>
          )}
        </Tabs>
      </Stack>
    </Container>
  );
}