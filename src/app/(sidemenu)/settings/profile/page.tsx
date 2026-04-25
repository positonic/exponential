'use client';

import { useSession } from 'next-auth/react';
import {
  Container,
  Title,
  Text,
  Stack,
  Paper,
  Avatar,
  Group,
  Badge,
  Skeleton,
} from '@mantine/core';
import {
  IconBrandDiscord,
  IconBrandGoogle,
  IconBrandNotion,
} from '@tabler/icons-react';

const PROVIDERS = [
  { id: 'discord', label: 'Discord', icon: IconBrandDiscord, color: 'indigo' },
  { id: 'google', label: 'Google', icon: IconBrandGoogle, color: 'red' },
  { id: 'notion', label: 'Notion', icon: IconBrandNotion, color: 'gray' },
] as const;

export default function ProfileSettingsPage() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <Container size="md" py="xl">
        <Stack gap="lg">
          <Skeleton height={32} width={120} />
          <Skeleton height={200} />
        </Stack>
      </Container>
    );
  }

  const user = session?.user;

  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        <div>
          <Title order={2} className="text-text-primary">
            Profile
          </Title>
          <Text size="sm" c="dimmed" mt="xs">
            Your account information from your sign-in provider
          </Text>
        </div>

        {/* User Info */}
        <Paper p="lg" withBorder className="bg-surface-secondary">
          <Group gap="lg" align="flex-start">
            <Avatar
              src={user?.image}
              size={72}
              radius="xl"
              className="bg-brand-primary"
            >
              {user?.name
                ?.split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase() ?? 'U'}
            </Avatar>
            <Stack gap="sm" className="flex-1">
              <div>
                <Text size="xs" className="text-text-muted mb-1">
                  Name
                </Text>
                <Text size="lg" fw={500} className="text-text-primary">
                  {user?.name ?? 'Unknown'}
                </Text>
              </div>
              <div>
                <Text size="xs" className="text-text-muted mb-1">
                  Email
                </Text>
                <Text className="text-text-secondary">
                  {user?.email ?? 'No email'}
                </Text>
              </div>
            </Stack>
          </Group>
        </Paper>

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
