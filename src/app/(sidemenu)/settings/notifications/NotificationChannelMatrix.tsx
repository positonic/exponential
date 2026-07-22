'use client';

import {
  Card,
  Title,
  Text,
  Stack,
  Group,
  Checkbox,
  Button,
  Skeleton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { api } from '~/trpc/react';

const CATEGORY_ORDER = [
  'assignment',
  'mention',
  'due_date',
  'summary',
  'meeting_ready',
] as const;
type Category = (typeof CATEGORY_ORDER)[number];

const CHANNEL_ORDER = ['push', 'email', 'matrix', 'whatsapp', 'zulip'] as const;
type Channel = (typeof CHANNEL_ORDER)[number];

const CATEGORY_LABELS: Record<Category, string> = {
  assignment: 'Assignments',
  mention: 'Mentions',
  due_date: 'Due-date reminders',
  summary: 'Summaries',
  meeting_ready: 'Meeting-ready',
};

const CHANNEL_LABELS: Record<Channel, string> = {
  push: 'Push',
  email: 'Email',
  matrix: 'Matrix (Zoe DM)',
  whatsapp: 'WhatsApp',
  zulip: 'Zulip',
};

const CHANNEL_HINTS: Partial<Record<Channel, string>> = {
  email: 'The per-workspace email setting below can still switch email off entirely.',
  matrix: 'Delivered to your direct message with the Zoe bot.',
};

/**
 * Channel-first notification preference matrix (ADR-0045). One card per channel
 * the user can use; within it, a checkbox per category. Opt-in channels
 * (Matrix/WhatsApp/Zulip) appear only once connected.
 */
export function NotificationChannelMatrix() {
  const utils = api.useUtils();
  const { data, isLoading } = api.notification.getChannelPreferences.useQuery();

  const setPref = api.notification.setChannelPreference.useMutation({
    onMutate: async (vars) => {
      await utils.notification.getChannelPreferences.cancel();
      const prev = utils.notification.getChannelPreferences.getData();
      utils.notification.getChannelPreferences.setData(undefined, (old) =>
        old
          ? {
              ...old,
              cells: old.cells.map((c) =>
                c.category === vars.category && c.channel === vars.channel
                  ? { ...c, enabled: vars.enabled }
                  : c,
              ),
            }
          : old,
      );
      return { prev };
    },
    onError: (_error, _vars, ctx) => {
      if (ctx?.prev) {
        utils.notification.getChannelPreferences.setData(undefined, ctx.prev);
      }
      notifications.show({
        title: 'Update failed',
        message: 'Could not save your preference. Please try again.',
        color: 'red',
        autoClose: 4000,
      });
    },
    onSettled: () => {
      void utils.notification.getChannelPreferences.invalidate();
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

  if (isLoading) {
    return <Skeleton height={240} radius="md" />;
  }
  if (!data) return null;

  const isEnabled = (category: Category, channel: Channel): boolean =>
    data.cells.find((c) => c.category === category && c.channel === channel)
      ?.enabled ?? false;

  const availableChannels = CHANNEL_ORDER.filter(
    (channel) => data.availability[channel],
  );

  return (
    <Stack gap="md">
      <div>
        <Title order={4} className="text-text-primary">
          Delivery preferences
        </Title>
        <Text size="sm" className="text-text-muted" maw={560}>
          Choose which notifications reach each channel. Opt-in channels appear
          once you&apos;ve connected them.
        </Text>
      </div>

      {availableChannels.map((channel) => (
        <Card
          key={channel}
          className="bg-surface-secondary border-border-primary"
          withBorder
        >
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <div>
              <Text fw={600} className="text-text-primary">
                {CHANNEL_LABELS[channel]}
              </Text>
              {CHANNEL_HINTS[channel] && (
                <Text size="xs" className="text-text-muted" mt={2} maw={480}>
                  {CHANNEL_HINTS[channel]}
                </Text>
              )}
            </div>
            {channel === 'matrix' && (
              <Button
                variant="light"
                size="xs"
                loading={sendMatrixTest.isPending}
                onClick={() => sendMatrixTest.mutate()}
              >
                Send test
              </Button>
            )}
          </Group>

          <Group gap="lg" mt="md">
            {CATEGORY_ORDER.map((category) => (
              <Checkbox
                key={category}
                label={CATEGORY_LABELS[category]}
                checked={isEnabled(category, channel)}
                disabled={setPref.isPending}
                onChange={(e) =>
                  setPref.mutate({
                    category,
                    channel,
                    enabled: e.currentTarget.checked,
                  })
                }
              />
            ))}
          </Group>
        </Card>
      ))}
    </Stack>
  );
}
