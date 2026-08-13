'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Loader,
  MultiSelect,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconAlertTriangle, IconCalendarOff, IconClockShare } from '@tabler/icons-react';
import { formatInTimeZone } from 'date-fns-tz';
import { api } from '~/trpc/react';

interface WorkspaceMemberOption {
  userId: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    isAgent: boolean;
  };
}

interface AvailabilityContentProps {
  workspaceId: string;
  members: WorkspaceMemberOption[];
}

const DURATION_OPTIONS = [
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '45', label: '45 minutes' },
  { value: '60', label: '1 hour' },
  { value: '90', label: '1.5 hours' },
  { value: '120', label: '2 hours' },
];

const RANGE_OPTIONS = [
  { value: '3', label: 'Next 3 days' },
  { value: '7', label: 'Next 7 days' },
  { value: '14', label: 'Next 14 days' },
  { value: '30', label: 'Next 30 days' },
];

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => ({
  value: String(hour),
  label: `${String(hour).padStart(2, '0')}:00`,
}));

export function AvailabilityContent({ workspaceId, members }: AvailabilityContentProps) {
  const memberOptions = useMemo(
    () =>
      members
        .filter((m) => !m.user.isAgent)
        .map((m) => ({
          value: m.user.id,
          label: m.user.name ?? m.user.email ?? 'Unknown member',
        })),
    [members],
  );

  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );

  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [durationMinutes, setDurationMinutes] = useState('30');
  const [rangeDays, setRangeDays] = useState('7');
  const [startHour, setStartHour] = useState('9');
  const [endHour, setEndHour] = useState('17');
  const [includeWeekends, setIncludeWeekends] = useState(false);
  // Pin "now" per search so the query key stays stable between renders.
  const [searchWindow, setSearchWindow] = useState<{ timeMin: Date; timeMax: Date } | null>(null);

  const hoursInvalid = Number(endHour) <= Number(startHour);
  const canSearch = selectedMemberIds.length > 0 && !hoursInvalid;

  const runSearch = () => {
    const timeMin = new Date();
    const timeMax = new Date(timeMin.getTime() + Number(rangeDays) * 24 * 60 * 60 * 1000);
    setSearchWindow({ timeMin, timeMax });
  };

  const { data, isFetching, error } = api.availability.getTeamAvailability.useQuery(
    {
      workspaceId,
      memberUserIds: selectedMemberIds,
      timeMin: searchWindow?.timeMin ?? new Date(0),
      timeMax: searchWindow?.timeMax ?? new Date(0),
      durationMinutes: Number(durationMinutes),
      timeZone,
      workdayStartHour: Number(startHour),
      // The service treats endHour as exclusive; 17 means "last slot ends by 17:00".
      workdayEndHour: Number(endHour),
      includeWeekends,
    },
    { enabled: !!searchWindow && selectedMemberIds.length > 0 },
  );

  const slotsByDay = useMemo(() => {
    if (!data?.slots) return [];
    const groups = new Map<string, { start: string; end: string }[]>();
    for (const slot of data.slots) {
      const day = formatInTimeZone(new Date(slot.start), timeZone, 'EEEE, MMM d');
      const existing = groups.get(day);
      if (existing) {
        existing.push(slot);
      } else {
        groups.set(day, [slot]);
      }
    }
    return [...groups.entries()];
  }, [data?.slots, timeZone]);

  const unknownMembers =
    data?.members.filter((m) => m.availabilityUnknown) ?? [];

  return (
    <Container size="lg" className="py-8">
      <Group gap="xs" mb="xs">
        <IconClockShare size={28} className="text-brand-primary" />
        <Title order={2}>Availability</Title>
      </Group>
      <Text className="text-text-secondary" mb="xl">
        Find times when everyone is free, based on their connected calendars.
        Only busy/free times are shared — never event details.
      </Text>

      <Paper className="border border-border-primary bg-surface-secondary" p="md" radius="md" mb="xl">
        <Stack gap="md">
          <MultiSelect
            label="People"
            description="Everyone selected must be a member of this workspace"
            placeholder={selectedMemberIds.length === 0 ? 'Pick workspace members' : undefined}
            data={memberOptions}
            value={selectedMemberIds}
            onChange={setSelectedMemberIds}
            maxValues={10}
            searchable
          />
          <Group grow>
            <Select
              label="Meeting length"
              data={DURATION_OPTIONS}
              value={durationMinutes}
              onChange={(value) => setDurationMinutes(value ?? '30')}
              allowDeselect={false}
            />
            <Select
              label="Search window"
              data={RANGE_OPTIONS}
              value={rangeDays}
              onChange={(value) => setRangeDays(value ?? '7')}
              allowDeselect={false}
            />
            <Select
              label="Workday starts"
              data={HOUR_OPTIONS}
              value={startHour}
              onChange={(value) => setStartHour(value ?? '9')}
              allowDeselect={false}
              error={hoursInvalid ? 'Must be before end' : undefined}
            />
            <Select
              label="Workday ends"
              data={HOUR_OPTIONS.slice(1)}
              value={endHour}
              onChange={(value) => setEndHour(value ?? '17')}
              allowDeselect={false}
              error={hoursInvalid ? 'Must be after start' : undefined}
            />
          </Group>
          <Group justify="space-between">
            <Group gap="lg">
              <Switch
                label="Include weekends"
                checked={includeWeekends}
                onChange={(event) => setIncludeWeekends(event.currentTarget.checked)}
              />
              <Text size="sm" className="text-text-muted">
                Times shown in {timeZone.replace(/_/g, ' ')}
              </Text>
            </Group>
            <Button onClick={runSearch} disabled={!canSearch} loading={isFetching}>
              Find times
            </Button>
          </Group>
        </Stack>
      </Paper>

      {error && (
        <Alert
          icon={<IconAlertTriangle size={16} />}
          color="red"
          title="Couldn't check availability"
          mb="lg"
        >
          {error.message}
        </Alert>
      )}

      {data && unknownMembers.length > 0 && (
        <Alert
          icon={<IconCalendarOff size={16} />}
          color="yellow"
          title="Some calendars are missing"
          mb="lg"
        >
          {unknownMembers.map((m) => m.name ?? 'A member').join(', ')}{' '}
          {unknownMembers.length === 1 ? 'has' : 'have'} no readable connected
          calendar, so the times below may conflict with their real schedule.
        </Alert>
      )}

      {data && (
        <Stack gap="lg">
          <Group gap="xs">
            {data.members.map((member) => (
              <Tooltip
                key={member.userId}
                label={
                  member.availabilityUnknown
                    ? 'No connected calendar — availability unknown'
                    : `${member.busy.length} busy ${member.busy.length === 1 ? 'block' : 'blocks'} in this window`
                }
              >
                <Badge
                  variant="light"
                  color={member.availabilityUnknown ? 'yellow' : 'brand'}
                >
                  {member.name ?? 'Member'}
                </Badge>
              </Tooltip>
            ))}
          </Group>

          {isFetching ? (
            <Group justify="center" py="xl">
              <Loader size="sm" />
            </Group>
          ) : slotsByDay.length === 0 ? (
            <Paper className="border border-border-primary" p="xl" radius="md">
              <Text ta="center" className="text-text-secondary">
                No common free slots in this window. Try a shorter meeting,
                a longer search window, or wider working hours.
              </Text>
            </Paper>
          ) : (
            slotsByDay.map(([day, slots]) => (
              <div key={day}>
                <Text fw={600} mb="xs">
                  {day}
                </Text>
                <Group gap="xs">
                  {slots.map((slot) => (
                    <Badge
                      key={slot.start}
                      size="lg"
                      variant="outline"
                      radius="sm"
                      className="border-border-primary text-text-primary"
                    >
                      {formatInTimeZone(new Date(slot.start), timeZone, 'HH:mm')}
                      {' – '}
                      {formatInTimeZone(new Date(slot.end), timeZone, 'HH:mm')}
                    </Badge>
                  ))}
                </Group>
              </div>
            ))
          )}
        </Stack>
      )}
    </Container>
  );
}
