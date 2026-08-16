'use client';

import { useMemo, useState } from 'react';
import { Paper, Text, Group, Select, Button } from '@mantine/core';
import { IconWorld } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { api } from '~/trpc/react';
import { detectBrowserTimezone } from '~/app/_components/calendar/TimezonePromptModal';

/**
 * Settings → Profile card for User.timezone. Usually first set by the
 * timezone checkpoint when a calendar source is connected; this is the
 * change-it-later surface.
 */
export function TimezoneCard() {
  const utils = api.useUtils();
  const { data, isLoading } = api.user.getTimezone.useQuery();

  const timezones = useMemo(() => Intl.supportedValuesOf('timeZone'), []);
  const [draft, setDraft] = useState<string | null>(null);

  const current = data?.timezone ?? null;
  const value = draft ?? current;

  const updateTimezone = api.user.updateTimezone.useMutation({
    onSuccess: async (res) => {
      await utils.user.getTimezone.invalidate();
      setDraft(null);
      notifications.show({
        title: 'Timezone saved',
        message: `Your timezone is set to ${res.timezone}.`,
        color: 'blue',
      });
    },
    onError: (error) => {
      notifications.show({ title: 'Error', message: error.message, color: 'red' });
    },
  });

  const browserTz = detectBrowserTimezone();

  return (
    <Paper p="lg" withBorder className="bg-surface-secondary">
      <Group gap="sm" mb="md">
        <IconWorld size={20} className="text-text-muted" />
        <div>
          <Text fw={500} className="text-text-primary">
            Timezone
          </Text>
          <Text size="xs" c="dimmed">
            Calendar events and working hours are interpreted in this timezone
          </Text>
        </div>
      </Group>

      <Group align="flex-end" gap="sm">
        <Select
          data={timezones}
          value={value}
          onChange={setDraft}
          searchable
          placeholder={isLoading ? 'Loading…' : 'Select a timezone'}
          nothingFoundMessage="No matching timezone"
          maxDropdownHeight={240}
          className="flex-1"
          disabled={isLoading}
        />
        <Button
          onClick={() => value && updateTimezone.mutate({ timezone: value })}
          disabled={!value || value === current}
          loading={updateTimezone.isPending}
        >
          Save
        </Button>
      </Group>

      {!current && browserTz && (
        <Text size="xs" c="dimmed" mt="xs">
          Your browser reports {browserTz}.
        </Text>
      )}
    </Paper>
  );
}
