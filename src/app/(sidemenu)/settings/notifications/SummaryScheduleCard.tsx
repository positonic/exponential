'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Anchor,
  Button,
  Card,
  Group,
  Select,
  Skeleton,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core';
import { TimeInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { IconClock } from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { detectBrowserTimezone } from '~/app/_components/calendar/TimezonePromptModal';

const WEEKDAYS = [
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
  { value: '7', label: 'Sunday' },
];

interface Draft {
  dailySummary: boolean;
  dailySummaryTime: string;
  weeklySummary: boolean;
  weeklyDayOfWeek: string;
}

/**
 * Settings → Notifications: when the Daily and Weekly summaries fire. Sits
 * under the delivery matrix, whose "Summaries" checkbox decides *where* they
 * go; this card decides *when*. Times are read in the profile timezone
 * (Settings → Profile) — there is deliberately no second timezone picker here.
 */
export function SummaryScheduleCard() {
  const utils = api.useUtils();
  const { data, isLoading } = api.notification.getSummarySchedule.useQuery();
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (data && !draft) {
      setDraft({
        dailySummary: data.dailySummary,
        dailySummaryTime: data.dailySummaryTime,
        weeklySummary: data.weeklySummary,
        weeklyDayOfWeek: String(data.weeklyDayOfWeek),
      });
    }
  }, [data, draft]);

  const save = api.notification.updateSummarySchedule.useMutation({
    onSuccess: async () => {
      await utils.notification.getSummarySchedule.invalidate();
      notifications.show({
        title: 'Summary schedule saved',
        message: 'Your summaries will arrive at the new time from tomorrow.',
        color: 'green',
        autoClose: 3000,
      });
    },
    onError: (error) => {
      notifications.show({ title: 'Error', message: error.message, color: 'red' });
    },
  });

  const setTimezone = api.user.updateTimezone.useMutation({
    onSuccess: async (res) => {
      await Promise.all([
        utils.notification.getSummarySchedule.invalidate(),
        utils.user.getTimezone.invalidate(),
      ]);
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

  if (isLoading || !data || !draft) {
    return <Skeleton height={200} radius="md" />;
  }

  const browserTz = detectBrowserTimezone();
  const isDirty =
    draft.dailySummary !== data.dailySummary ||
    draft.dailySummaryTime !== data.dailySummaryTime ||
    draft.weeklySummary !== data.weeklySummary ||
    draft.weeklyDayOfWeek !== String(data.weeklyDayOfWeek);
  const isValidTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(draft.dailySummaryTime);

  return (
    <Card className="bg-surface-secondary border-border-primary" withBorder>
      <Group gap="md" align="flex-start" mb="md">
        <IconClock size={24} className="text-text-muted" />
        <div>
          <Title order={4} className="text-text-primary">
            Summary schedule
          </Title>
          <Text size="sm" className="text-text-muted" maw={520}>
            When your Daily and Weekly summaries are sent. The weekly summary
            goes out at the same time on the day you pick. Which channels
            receive them is the &quot;Summaries&quot; option above.
          </Text>
        </div>
      </Group>

      <Stack gap="md">
        <Group align="flex-end" gap="md" wrap="wrap">
          <Switch
            label="Daily summary"
            checked={draft.dailySummary}
            onChange={(e) =>
              setDraft({ ...draft, dailySummary: e.currentTarget.checked })
            }
            mb={6}
          />
          <TimeInput
            label="Send at"
            value={draft.dailySummaryTime}
            onChange={(e) =>
              setDraft({ ...draft, dailySummaryTime: e.currentTarget.value })
            }
            error={isValidTime ? undefined : 'Use a 24-hour time like 08:00'}
            disabled={!draft.dailySummary && !draft.weeklySummary}
            w={140}
          />
        </Group>

        <Group align="flex-end" gap="md" wrap="wrap">
          <Switch
            label="Weekly summary"
            checked={draft.weeklySummary}
            onChange={(e) =>
              setDraft({ ...draft, weeklySummary: e.currentTarget.checked })
            }
            mb={6}
          />
          <Select
            label="On"
            data={WEEKDAYS}
            value={draft.weeklyDayOfWeek}
            onChange={(v) => v && setDraft({ ...draft, weeklyDayOfWeek: v })}
            disabled={!draft.weeklySummary}
            allowDeselect={false}
            w={160}
          />
        </Group>

        {data.profileTimezone ? (
          <Text size="xs" className="text-text-muted">
            Times are in {data.profileTimezone}, your profile timezone.{' '}
            <Anchor component={Link} href="/settings/profile" size="xs">
              Change
            </Anchor>
          </Text>
        ) : (
          <Group gap="sm" align="center">
            <Text size="xs" className="text-text-muted">
              No timezone on your profile yet, so times are read in UTC.
              {browserTz ? ` Your browser reports ${browserTz}.` : ''}
            </Text>
            {browserTz && (
              <Button
                size="compact-xs"
                variant="light"
                loading={setTimezone.isPending}
                onClick={() => setTimezone.mutate({ timezone: browserTz })}
              >
                Use {browserTz}
              </Button>
            )}
          </Group>
        )}

        <Group justify="flex-end">
          <Button
            size="sm"
            disabled={!isDirty || !isValidTime}
            loading={save.isPending}
            onClick={() =>
              save.mutate({
                dailySummary: draft.dailySummary,
                dailySummaryTime: draft.dailySummaryTime,
                weeklySummary: draft.weeklySummary,
                weeklyDayOfWeek: Number(draft.weeklyDayOfWeek),
              })
            }
          >
            Save schedule
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
