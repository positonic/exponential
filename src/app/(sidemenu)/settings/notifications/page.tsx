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
  Switch,
  Button,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBell, IconMail, IconMessageCircle } from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { PushNotificationToggle } from '~/app/_components/PushNotificationToggle';

type OverrideValue = 'default' | 'on' | 'off';

export default function NotificationSettingsPage() {
  const utils = api.useUtils();

  const { data, isLoading } = api.notification.getAllWorkspaceOverrides.useQuery();

  // Matrix opt-in: only surfaced when the user has paired a Matrix account.
  const { data: matrixOptIn } = api.notification.getMatrixOptIn.useQuery();
  const { data: preferences } = api.notification.getPreferences.useQuery();

  const updatePreferences = api.notification.updatePreferences.useMutation({
    onSuccess: () => {
      void utils.notification.getPreferences.invalidate();
      notifications.show({
        title: 'Notification preferences updated',
        message: 'Your Matrix delivery preference has been saved.',
        color: 'green',
        autoClose: 3000,
      });
    },
  });

  const sendMatrixTest = api.notification.sendMatrixTest.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Test sent',
        message: 'Check your Zoe DM in Matrix.',
        color: 'green',
        autoClose: 4000,
      });
    },
    onError: (error) => {
      notifications.show({
        title: 'Test failed',
        message: error.message,
        color: 'red',
        autoClose: 5000,
      });
    },
  });

  const matrixSelected =
    !!matrixOptIn?.integrationId &&
    preferences?.integrationId === matrixOptIn.integrationId;

  function handleMatrixToggle(on: boolean) {
    updatePreferences.mutate(
      on
        ? {
            integrationId: matrixOptIn?.integrationId ?? undefined,
            enabled: true,
            dailySummary: true,
            weeklySummary: true,
          }
        : { integrationId: undefined },
    );
  }

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

        {/* Matrix (Zoe DM) — only shown when the user has paired a Matrix account */}
        {matrixOptIn?.available && (
          <Card className="bg-surface-secondary border-border-primary" withBorder>
            <Group justify="space-between" align="flex-start">
              <Group gap="md">
                <IconMessageCircle size={24} className="text-text-muted" />
                <div>
                  <Title order={4} className="text-text-primary">
                    Matrix (Zoe DM)
                  </Title>
                  <Text size="sm" className="text-text-muted" maw={500}>
                    Deliver your daily &amp; weekly task summaries to your direct
                    message with the Zoe bot on Matrix.
                  </Text>
                  <Button
                    variant="light"
                    size="xs"
                    mt="sm"
                    loading={sendMatrixTest.isPending}
                    onClick={() => sendMatrixTest.mutate()}
                  >
                    Send test message
                  </Button>
                </div>
              </Group>
              <Switch
                checked={matrixSelected}
                onChange={(e) => handleMatrixToggle(e.currentTarget.checked)}
                disabled={updatePreferences.isPending}
                aria-label="Deliver task summaries to Matrix"
              />
            </Group>
          </Card>
        )}

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
