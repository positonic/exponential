'use client';

import { useState } from 'react';
import {
  Modal,
  Stack,
  Switch,
  Select,
  MultiSelect,
  TimeInput,
  Text,
  Group,
  Button,
  Card,
  Title,
  Alert,
  LoadingOverlay,
  NumberInput,
  Divider,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import {
  IconBell,
  IconClock,
  IconCalendar,
  IconCheck,
  IconAlertCircle,
  IconBellOff,
} from '@tabler/icons-react';
import { api } from '~/trpc/react';

interface NotificationPreferencesProps {
  opened: boolean;
  onClose: () => void;
}

const timezones = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'Eastern Time' },
  { value: 'America/Chicago', label: 'Central Time' },
  { value: 'America/Denver', label: 'Mountain Time' },
  { value: 'America/Los_Angeles', label: 'Pacific Time' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Paris', label: 'Paris' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Asia/Shanghai', label: 'Shanghai' },
  { value: 'Australia/Sydney', label: 'Sydney' },
];

const daysOfWeek = [
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
  { value: '7', label: 'Sunday' },
];

const reminderOptions = [
  { value: '5', label: '5 minutes before' },
  { value: '15', label: '15 minutes before' },
  { value: '30', label: '30 minutes before' },
  { value: '60', label: '1 hour before' },
  { value: '120', label: '2 hours before' },
  { value: '1440', label: '1 day before' },
  { value: '2880', label: '2 days before' },
];

export function NotificationPreferences({ opened, onClose }: NotificationPreferencesProps) {
  const [isLoading, setIsLoading] = useState(false);

  // Get current preferences
  const { data: preferences, refetch } = api.notification.getPreferences.useQuery(
    undefined,
    { enabled: opened }
  );

  // Get available integrations
  const { data: integrations } = api.integration.list.useQuery(
    { provider: 'whatsapp' },
    { enabled: opened }
  );

  // Update preferences mutation
  const updatePreferences = api.notification.updatePreferences.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Preferences Saved',
        message: 'Your notification preferences have been updated',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      void refetch();
    },
    onError: (error) => {
      notifications.show({
        title: 'Failed to Save',
        message: error.message,
        color: 'red',
        icon: <IconAlertCircle size={16} />,
      });
    },
  });

  const form = useForm({
    initialValues: {
      enabled: preferences?.enabled ?? true,
      integrationId: preferences?.integrationId ?? '',
      taskReminders: preferences?.taskReminders ?? true,
      projectUpdates: preferences?.projectUpdates ?? true,
      dailySummary: preferences?.dailySummary ?? true,
      weeklySummary: preferences?.weeklySummary ?? false,
      timezone: preferences?.timezone ?? 'UTC',
      dailySummaryTime: preferences?.dailySummaryTime ?? '09:00',
      weeklyDayOfWeek: String(preferences?.weeklyDayOfWeek ?? 1),
      reminderMinutesBefore: preferences?.reminderMinutesBefore?.map(String) ?? ['15', '60', '1440'],
      quietHoursEnabled: preferences?.quietHoursEnabled ?? false,
      quietHoursStart: preferences?.quietHoursStart ?? '22:00',
      quietHoursEnd: preferences?.quietHoursEnd ?? '08:00',
    },
  });

  const handleSubmit = async (values: typeof form.values) => {
    setIsLoading(true);
    try {
      await updatePreferences.mutateAsync({
        ...values,
        weeklyDayOfWeek: parseInt(values.weeklyDayOfWeek),
        reminderMinutesBefore: values.reminderMinutesBefore.map(v => parseInt(v)),
        integrationId: values.integrationId || undefined,
      });
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Notification Preferences"
      size="lg"
    >
      <LoadingOverlay visible={isLoading} />
      
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="lg">
          <Alert
            icon={<IconBell size={16} />}
            color="blue"
          >
            Configure how and when you receive notifications via WhatsApp. 
            All times are in your selected timezone.
          </Alert>

          <Card withBorder>
            <Stack gap="md">
              <Title order={5}>General Settings</Title>
              
              <Switch
                label="Enable Notifications"
                description="Master switch for all notifications"
                leftSection={form.values.enabled ? <IconBell size={16} /> : <IconBellOff size={16} />}
                {...form.getInputProps('enabled', { type: 'checkbox' })}
              />

              <Select
                label="WhatsApp Integration"
                placeholder="Select integration to use"
                description="Choose which WhatsApp number to send from"
                data={[
                  { value: '', label: 'Use default' },
                  ...(integrations?.integrations.map(i => ({
                    value: i.id,
                    label: i.name,
                  })) || []),
                ]}
                {...form.getInputProps('integrationId')}
              />

              <Select
                label="Timezone"
                placeholder="Select your timezone"
                searchable
                data={timezones}
                {...form.getInputProps('timezone')}
              />
            </Stack>
          </Card>

          <Card withBorder>
            <Stack gap="md">
              <Title order={5}>Notification Types</Title>
              
              <Switch
                label="Task Reminders"
                description="Get reminded before tasks are due"
                {...form.getInputProps('taskReminders', { type: 'checkbox' })}
              />

              {form.values.taskReminders && (
                <MultiSelect
                  label="Reminder Times"
                  placeholder="When to remind you"
                  data={reminderOptions}
                  {...form.getInputProps('reminderMinutesBefore')}
                />
              )}

              <Divider />

              <Switch
                label="Daily Summary"
                description="Receive a summary of today's tasks"
                {...form.getInputProps('dailySummary', { type: 'checkbox' })}
              />

              {form.values.dailySummary && (
                <TimeInput
                  label="Daily Summary Time"
                  description="When to send daily summary"
                  leftSection={<IconClock size={16} />}
                  {...form.getInputProps('dailySummaryTime')}
                />
              )}

              <Divider />

              <Switch
                label="Weekly Summary"
                description="Receive a weekly performance summary"
                {...form.getInputProps('weeklySummary', { type: 'checkbox' })}
              />

              {form.values.weeklySummary && (
                <Select
                  label="Weekly Summary Day"
                  placeholder="Select day"
                  data={daysOfWeek}
                  {...form.getInputProps('weeklyDayOfWeek')}
                />
              )}

              <Divider />

              <Switch
                label="Project Updates"
                description="Get notified about project status changes"
                {...form.getInputProps('projectUpdates', { type: 'checkbox' })}
              />
            </Stack>
          </Card>

          <Card withBorder>
            <Stack gap="md">
              <Title order={5}>Quiet Hours</Title>
              
              <Switch
                label="Enable Quiet Hours"
                description="Don't send notifications during specified hours"
                {...form.getInputProps('quietHoursEnabled', { type: 'checkbox' })}
              />

              {form.values.quietHoursEnabled && (
                <Group grow>
                  <TimeInput
                    label="Start Time"
                    leftSection={<IconClock size={16} />}
                    {...form.getInputProps('quietHoursStart')}
                  />
                  <TimeInput
                    label="End Time"
                    leftSection={<IconClock size={16} />}
                    {...form.getInputProps('quietHoursEnd')}
                  />
                </Group>
              )}
            </Stack>
          </Card>

          <Group justify="flex-end">
            <Button variant="light" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={updatePreferences.isPending}>
              Save Preferences
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}