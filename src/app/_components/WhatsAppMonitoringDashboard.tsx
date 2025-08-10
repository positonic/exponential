'use client';

import { useState } from 'react';
import { Tabs, Container, Title, Stack } from '@mantine/core';
import { IconChartBar, IconActivity, IconShield } from '@tabler/icons-react';
import { WhatsAppAnalyticsDashboard } from './WhatsAppAnalyticsDashboard';
import { WhatsAppRealtimeMonitor } from './WhatsAppRealtimeMonitor';
import { WhatsAppSecurityDashboard } from './WhatsAppSecurityDashboard';

interface WhatsAppMonitoringDashboardProps {
  integrationId: string;
}

export function WhatsAppMonitoringDashboard({ integrationId }: WhatsAppMonitoringDashboardProps) {
  const [activeTab, setActiveTab] = useState<string | null>('realtime');

  return (
    <Container size="xl" py="md">
      <Stack gap="lg">
        <Title order={1}>WhatsApp Monitoring & Analytics</Title>
        
        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Tab value="realtime" leftSection={<IconActivity size={16} />}>
              Real-Time Monitor
            </Tabs.Tab>
            <Tabs.Tab value="analytics" leftSection={<IconChartBar size={16} />}>
              Analytics Dashboard
            </Tabs.Tab>
            <Tabs.Tab value="security" leftSection={<IconShield size={16} />}>
              Security Dashboard
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="realtime" pt="lg">
            <WhatsAppRealtimeMonitor integrationId={integrationId} />
          </Tabs.Panel>

          <Tabs.Panel value="analytics" pt="lg">
            <WhatsAppAnalyticsDashboard integrationId={integrationId} />
          </Tabs.Panel>

          <Tabs.Panel value="security" pt="lg">
            <WhatsAppSecurityDashboard 
              integrationId={integrationId} 
              opened={true} 
              onClose={() => setActiveTab('realtime')} 
            />
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Container>
  );
}