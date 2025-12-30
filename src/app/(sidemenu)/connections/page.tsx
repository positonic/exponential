'use client';

import { Container, Title, Text, Tabs, Stack } from '@mantine/core';
import { IconKey, IconPlug } from '@tabler/icons-react';

// Import existing components
// import TokensContent from '../tokens/TokensContent';
// import IntegrationsContent from '../integrations/IntegrationsContent';

export default function ConnectionsPage() {
  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <div>
          <Title order={1} size="h2">Connections</Title>
          <Text c="dimmed" size="sm">
            Manage how Exponential connects with other services and applications
          </Text>
        </div>

        <Tabs defaultValue="outbound" variant="pills">
          <Tabs.List>
            <Tabs.Tab value="outbound" leftSection={<IconPlug size={16} />}>
              Connect to Services
            </Tabs.Tab>
            <Tabs.Tab value="inbound" leftSection={<IconKey size={16} />}>
              API Access
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="outbound" pt="lg">
            <Stack gap="md">
              <div>
                <Title order={3} size="h4">Connect to External Services</Title>
                <Text c="dimmed" size="sm">
                  Connect Exponential to external services like Fireflies, GitHub, etc. 
                  You&apos;ll need API keys from those services.
                </Text>
              </div>
              {/* <IntegrationsContent /> */}
              <Text c="dimmed" ta="center" py="xl">
                Integrations content would go here
              </Text>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="inbound" pt="lg">
            <Stack gap="md">
              <div>
                <Title order={3} size="h4">API Access Keys</Title>    
                <Text c="dimmed" size="sm">
                  Generate API keys for external applications to access your Exponential data.
                  Perfect for webhooks, browser extensions, and custom integrations.
                </Text>
              </div>
              {/* <TokensContent /> */}
              <Text c="dimmed" ta="center" py="xl">
                API tokens content would go here  
              </Text>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Container>
  );
}