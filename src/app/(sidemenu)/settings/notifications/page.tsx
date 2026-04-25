'use client';

import {
  Container,
  Title,
  Card,
  Text,
  Stack,
  Group,
  SegmentedControl,
  Skeleton,
  Badge,
  Divider,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBell, IconMail } from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { PushNotificationToggle } from '~/app/_components/PushNotificationToggle';

type OverrideValue = 'default' | 'on' | 'off';

export default function NotificationSettingsPage() {
  const utils = api.useUtils();

  const { data, isLoading } = api.notification.getAllWorkspaceOverrides.useQuery();

  const setOverrideMutation = api.notification.setWorkspaceOverride.useMutation({
    onSuccess: () => {
      void utils.notification.getAllWorkspaceOverrides.invalidate();
      notifications.show({
        title: 'Notification preferences updated',
        message: 'Your email notification preferences have been saved.',
        color: 'green',
        autoClose: 3000,
      });
    },
  });

  function getOverrideValue(workspaceId: string): OverrideValue {
    const override = data?.overrides.find(
      (o) => o.workspaceId === workspaceId,
    );
    if (!override) return 'default';
    return override.emailNotifications ? 'on' : 'off';
  }

  function handleOverrideChange(workspaceId: string, value: string) {
    if (value === 'default') {
      setOverrideMutation.mutate({
        workspaceId,
        emailNotifications: null,
      });
    } else {
      setOverrideMutation.mutate({
        workspaceId,
        emailNotifications: value === 'on',
      });
    }
  }

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <div>
          <Title order={2} className="text-text-primary">
            Notifications
          </Title>
          <Text size="sm" className="text-text-muted" mt={4}>
            Manage how and where you receive notifications.
          </Text>
        </div>

        {/* Push Notifications */}
        <Card className="bg-surface-secondary border-border-primary" withBorder>
          <Group justify="space-between" align="flex-start">
            <Group gap="md">
              <IconBell size={24} className="text-text-muted" />
              <div>
                <Title order={4} className="text-text-primary">
                  Push Notifications
                </Title>
                <Text size="sm" className="text-text-muted" maw={500}>
                  Receive push notifications on this device for daily plan reminders, task updates, and more.
                </Text>
              </div>
            </Group>
            <PushNotificationToggle />
          </Group>
        </Card>

        <Divider />

        {/* Email Notifications */}
        <Group gap="md">
          <IconMail size={24} className="text-text-muted" />
          <div>
            <Title order={4} className="text-text-primary">
              Email Notifications
            </Title>
            <Text size="sm" className="text-text-muted">
              Control email notifications per workspace. Each workspace has a
              default setting that you can override here.
            </Text>
          </div>
        </Group>

        {isLoading ? (
          <Stack gap="sm">
            <Skeleton height={80} radius="md" />
            <Skeleton height={80} radius="md" />
          </Stack>
        ) : !data?.memberships.length ? (
          <Card className="bg-surface-secondary border-border-primary" withBorder>
            <Text className="text-text-muted">
              You are not a member of any workspaces yet.
            </Text>
          </Card>
        ) : (
          data.memberships.map((membership) => {
            const ws = membership.workspace;
            const overrideValue = getOverrideValue(ws.id);

            return (
              <Card
                key={ws.id}
                className="bg-surface-secondary border-border-primary"
                withBorder
              >
                <Group justify="space-between" wrap="nowrap">
                  <div>
                    <Group gap="xs">
                      <Text fw={500} className="text-text-primary">
                        {ws.name}
                      </Text>
                      <Badge
                        size="xs"
                        variant="light"
                        color={ws.enableEmailNotifications ? 'green' : 'gray'}
                      >
                        Workspace default:{' '}
                        {ws.enableEmailNotifications ? 'On' : 'Off'}
                      </Badge>
                    </Group>
                    <Text size="xs" className="text-text-muted" mt={4}>
                      {overrideValue === 'default'
                        ? 'Using workspace default'
                        : overrideValue === 'on'
                          ? 'You will receive email notifications'
                          : 'Email notifications are turned off for you'}
                    </Text>
                  </div>
                  <SegmentedControl
                    value={overrideValue}
                    onChange={(val) => handleOverrideChange(ws.id, val)}
                    data={[
                      { value: 'default', label: 'Default' },
                      { value: 'on', label: 'On' },
                      { value: 'off', label: 'Off' },
                    ]}
                    size="xs"
                    disabled={setOverrideMutation.isPending}
                  />
                </Group>
              </Card>
            );
          })
        )}
      </Stack>
    </Container>
  );
}
