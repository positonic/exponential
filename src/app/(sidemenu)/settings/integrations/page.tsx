'use client';

import { useState } from 'react';
import {
  Container,
  Title,
  Text,
  Stack,
  Paper,
  Group,
  Button,
  Divider,
} from '@mantine/core';
import {
  IconCalendar,
  IconUnlink,
  IconCheck,
  IconAlertCircle,
  IconBrandWhatsapp,
  IconBrandTelegram,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { api } from '~/trpc/react';
import { GoogleCalendarConnect } from '~/app/_components/GoogleCalendarConnect';
import { CalendarMultiSelect } from '~/app/_components/calendar/CalendarMultiSelect';
import { FirefliesIntegrationsList } from '~/app/_components/integrations/FirefliesIntegrationsList';
import { FirefliesWizardModal } from '~/app/_components/integrations/FirefliesWizardModal';
import IntegrationsClient from '~/app/(sidemenu)/integrations/IntegrationsClient';
import { WhatsAppGatewayModal } from '~/app/_components/WhatsAppGatewayModal';
import { TelegramGatewayModal } from '~/app/_components/TelegramGatewayModal';

export default function IntegrationsSettingsPage() {
  const [firefliesModalOpened, setFirefliesModalOpened] = useState(false);
  const [whatsappModalOpened, setWhatsappModalOpened] = useState(false);
  const [telegramModalOpened, setTelegramModalOpened] = useState(false);
  const utils = api.useUtils();

  // Calendar connection status
  const { data: calendarStatus } = api.calendar.getConnectionStatus.useQuery();

  // Calendar disconnect mutation
  const disconnectCalendar = api.calendar.disconnect.useMutation({
    onSuccess: async () => {
      await utils.calendar.getConnectionStatus.invalidate();
      await utils.calendar.getCalendarPreferences.invalidate();
      notifications.show({
        title: 'Calendar Disconnected',
        message: 'Your Google Calendar has been disconnected.',
        color: 'blue',
        icon: <IconCheck size={16} />,
      });
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message ?? 'Failed to disconnect calendar',
        color: 'red',
        icon: <IconAlertCircle size={16} />,
      });
    },
  });

  // Calendar preferences
  const { data: calendarPreferences, isLoading: calendarPreferencesLoading } =
    api.calendar.getCalendarPreferences.useQuery(undefined, {
      enabled: calendarStatus?.isConnected ?? false,
    });

  // Update selected calendars
  const updateSelectedCalendars =
    api.calendar.updateSelectedCalendars.useMutation({
      onSuccess: async () => {
        await utils.calendar.getCalendarPreferences.invalidate();
        notifications.show({
          title: 'Calendars Updated',
          message: 'Your calendar selection has been saved.',
          color: 'green',
          icon: <IconCheck size={16} />,
        });
      },
      onError: (error) => {
        notifications.show({
          title: 'Error',
          message: error.message ?? 'Failed to update calendar selection',
          color: 'red',
          icon: <IconAlertCircle size={16} />,
        });
      },
    });

  const handleCalendarSelectionChange = (calendarIds: string[]) => {
    updateSelectedCalendars.mutate({ calendarIds });
  };

  // WhatsApp Gateway
  const { data: whatsappConfig } =
    api.whatsappGateway.isConfigured.useQuery();
  const { data: whatsappSessions } =
    api.whatsappGateway.listSessions.useQuery(undefined, {
      enabled: whatsappConfig?.configured ?? false,
    });
  const connectedWhatsAppSession = whatsappSessions?.find(
    (s: { status: string }) => s.status === 'CONNECTED',
  );

  // Telegram Gateway
  const { data: telegramStatus } =
    api.telegramGateway.getStatus.useQuery();

  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        <div>
          <Title order={2} className="text-text-primary">
            Integrations
          </Title>
          <Text size="sm" c="dimmed" mt="xs">
            Manage your connected services and external integrations
          </Text>
        </div>

        {/* Google Calendar */}
        <Paper p="lg" withBorder className="bg-surface-secondary">
          <Group justify="space-between" align="center" mb="sm">
            <Group gap="sm">
              <IconCalendar size={20} className="text-text-muted" />
              <div>
                <Text fw={500} className="text-text-primary">
                  Google Calendar
                </Text>
                <Text size="xs" c="dimmed">
                  {calendarStatus?.isConnected
                    ? 'Your calendar is connected'
                    : 'Connect to see your events and schedule'}
                </Text>
              </div>
            </Group>
            {calendarStatus?.isConnected ? (
              <Button
                variant="subtle"
                color="red"
                size="sm"
                onClick={() => disconnectCalendar.mutate()}
                loading={disconnectCalendar.isPending}
                leftSection={<IconUnlink size={16} />}
              >
                Disconnect
              </Button>
            ) : (
              <GoogleCalendarConnect isConnected={false} />
            )}
          </Group>

          {calendarStatus?.isConnected && (
            <div className="mt-4 pt-4 border-t border-border-primary">
              <Text size="sm" fw={500} mb="xs">
                Select calendars to display
              </Text>
              <Text size="xs" c="dimmed" mb="sm">
                Choose which calendars appear in your schedule view.
              </Text>
              <CalendarMultiSelect
                calendars={calendarPreferences?.allCalendars ?? []}
                selectedCalendarIds={
                  calendarPreferences?.selectedCalendarIds ?? []
                }
                onChange={handleCalendarSelectionChange}
                isLoading={
                  calendarPreferencesLoading ||
                  updateSelectedCalendars.isPending
                }
              />
            </div>
          )}
        </Paper>

        {/* Fireflies */}
        <Paper p="lg" withBorder className="bg-surface-secondary">
          <Group justify="space-between" align="center" mb="md">
            <Text fw={500} className="text-text-primary">
              Fireflies.ai
            </Text>
            <Button
              variant="light"
              size="sm"
              onClick={() => setFirefliesModalOpened(true)}
            >
              Add Fireflies
            </Button>
          </Group>
          <FirefliesIntegrationsList />
        </Paper>

        {/* WhatsApp */}
        <Paper p="lg" withBorder className="bg-surface-secondary">
          <Group justify="space-between" align="center">
            <Group gap="sm">
              <IconBrandWhatsapp size={20} className="text-brand-success" />
              <div>
                <Text fw={500} className="text-text-primary">
                  WhatsApp
                </Text>
                <Text size="xs" c="dimmed">
                  {connectedWhatsAppSession
                    ? `Connected — ${connectedWhatsAppSession.phoneNumber ?? 'Unknown number'}`
                    : 'Connect your WhatsApp to interact with agents'}
                </Text>
              </div>
            </Group>
            <Button
              variant={connectedWhatsAppSession ? 'light' : 'filled'}
              color="green"
              size="sm"
              leftSection={<IconBrandWhatsapp size={16} />}
              onClick={() => setWhatsappModalOpened(true)}
            >
              {connectedWhatsAppSession ? 'Manage' : 'Connect WhatsApp'}
            </Button>
          </Group>
        </Paper>

        {/* Telegram */}
        <Paper p="lg" withBorder className="bg-surface-secondary">
          <Group justify="space-between" align="center">
            <Group gap="sm">
              <IconBrandTelegram size={20} className="text-brand-primary" />
              <div>
                <Text fw={500} className="text-text-primary">
                  Telegram
                </Text>
                <Text size="xs" c="dimmed">
                  {telegramStatus?.paired
                    ? `Connected as @${telegramStatus.telegramUsername ?? 'unknown'}`
                    : 'Chat with AI agents directly from Telegram'}
                </Text>
              </div>
            </Group>
            <Button
              variant={telegramStatus?.paired ? 'light' : 'filled'}
              size="sm"
              leftSection={<IconBrandTelegram size={16} />}
              onClick={() => setTelegramModalOpened(true)}
            >
              {telegramStatus?.paired ? 'Manage' : 'Connect Telegram'}
            </Button>
          </Group>
        </Paper>

        <Divider />

        {/* Full Integrations Management */}
        <IntegrationsClient />
      </Stack>

      <FirefliesWizardModal
        opened={firefliesModalOpened}
        onClose={() => setFirefliesModalOpened(false)}
      />

      <WhatsAppGatewayModal
        opened={whatsappModalOpened}
        onClose={() => setWhatsappModalOpened(false)}
      />

      <TelegramGatewayModal
        opened={telegramModalOpened}
        onClose={() => setTelegramModalOpened(false)}
      />
    </Container>
  );
}
