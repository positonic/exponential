'use client';

import {
  Container,
  Title,
  Text,
  Stack,
  Paper,
  Group,
  Badge,
} from '@mantine/core';
import {
  IconBrandDiscord,
  IconBrandGoogle,
  IconBrandNotion,
} from '@tabler/icons-react';
import { ProfileCard } from './ProfileCard';
import { WorkHoursCard } from './WorkHoursCard';
import { TimezoneCard } from './TimezoneCard';

const PROVIDERS = [
  { id: 'discord', label: 'Discord', icon: IconBrandDiscord, color: 'indigo' },
  { id: 'google', label: 'Google', icon: IconBrandGoogle, color: 'red' },
  { id: 'notion', label: 'Notion', icon: IconBrandNotion, color: 'gray' },
] as const;

export default function ProfileSettingsPage() {
  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        <div>
          <Title order={2} className="text-text-primary">
            Profile
          </Title>
          <Text size="sm" c="dimmed" mt="xs">
            Your account information and work preferences
          </Text>
        </div>

        {/* User Info */}
        <ProfileCard />

        {/* Work Hours */}
        <TimezoneCard />

        <WorkHoursCard />

        {/* Connected Accounts */}
        <div>
          <Title order={4} className="text-text-primary mb-3">
            Connected Accounts
          </Title>
          <Text size="sm" c="dimmed" mb="md">
            Sign-in providers linked to your account
          </Text>
          <Stack gap="sm">
            {PROVIDERS.map((provider) => {
              const ProviderIcon = provider.icon;
              return (
                <Paper
                  key={provider.id}
                  p="md"
                  withBorder
                  className="bg-surface-primary"
                >
                  <Group justify="space-between">
                    <Group gap="sm">
                      <ProviderIcon size={20} className="text-text-muted" />
                      <Text size="sm" fw={500}>
                        {provider.label}
                      </Text>
                    </Group>
                    <Badge variant="light" color="gray" size="sm">
                      Available
                    </Badge>
                  </Group>
                </Paper>
              );
            })}
          </Stack>
        </div>
      </Stack>
    </Container>
  );
}
