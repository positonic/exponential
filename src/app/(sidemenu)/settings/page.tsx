"use client";

import React, { useState } from "react";
import { api } from "~/trpc/react";
import {
  Container,
  Title,
  Text,
  Stack,
  Group,
  Switch,
  Paper,
  Loader,
  Button,
  Accordion,
  Badge,
  Card,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconDeviceProjector,
  IconTarget,
  IconUsers,
  IconKey,
  IconRefresh,
  IconCheck,
  IconAlertCircle,
  IconHome,
  IconQuote,
  IconSparkles,
  IconChevronRight,
  IconCalendar,
  IconUnlink,
} from "@tabler/icons-react";
import Link from "next/link";
import { notifications } from "@mantine/notifications";
import { FirefliesIntegrationsList } from "~/app/_components/integrations/FirefliesIntegrationsList";
import { FirefliesWizardModal } from "~/app/_components/integrations/FirefliesWizardModal";
import { GoogleCalendarConnect } from "~/app/_components/GoogleCalendarConnect";
import { CalendarMultiSelect } from "~/app/_components/calendar/CalendarMultiSelect";

// Define menu structure for rendering
const MENU_STRUCTURE = {
  projects: {
    label: "Projects",
    icon: IconDeviceProjector,
    items: [
      { key: "projects/my-projects", label: "My Projects" },
      { key: "projects/project-list", label: "Project List" },
      { key: "projects/add-project", label: "Add Project Button" },
    ],
  },
  alignment: {
    label: "Alignment",
    icon: IconTarget,
    items: [
      { key: "alignment/goals", label: "Goals" },
      { key: "alignment/wheel-of-life", label: "Wheel of Life" },
    ],
  },
  teams: {
    label: "Teams",
    icon: IconUsers,
    items: [
      { key: "teams/my-teams", label: "My Teams" },
    ],
  },
  tools: {
    label: "Tools",
    icon: IconKey,
    items: [
      { key: "tools/days", label: "Days" },
      { key: "tools/media", label: "Media" },
      { key: "tools/journal", label: "Journal" },
      { key: "tools/meetings", label: "Meetings" },
      { key: "tools/workflows", label: "Workflows" },
      { key: "tools/ai-sales-demo", label: "AI Sales Demo" },
      { key: "tools/ai-automation", label: "AI Automation" },
      { key: "tools/connect-services", label: "Connect Services" },
      { key: "tools/ai-history", label: "AI History" },
      { key: "tools/api-access", label: "API Access" },
    ],
  },
} as const;

type SectionKey = keyof typeof MENU_STRUCTURE;

export default function NavigationSettingsPage() {
  const utils = api.useUtils();
  const [firefliesModalOpened, setFirefliesModalOpened] = useState(false);

  const { data: preferences, isLoading } =
    api.navigationPreference.getPreferences.useQuery();

  // Calendar connection status
  const { data: calendarStatus } = api.calendar.getConnectionStatus.useQuery();

  // Calendar disconnect mutation
  const disconnectCalendar = api.calendar.disconnect.useMutation({
    onSuccess: async () => {
      await utils.calendar.getConnectionStatus.invalidate();
      await utils.calendar.getCalendarPreferences.invalidate();
      notifications.show({
        title: "Calendar Disconnected",
        message: "Your Google Calendar has been disconnected.",
        color: "blue",
        icon: <IconCheck size={16} />,
      });
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message ?? "Failed to disconnect calendar",
        color: "red",
        icon: <IconAlertCircle size={16} />,
      });
    },
  });

  // Calendar preferences (for multi-calendar selection)
  const { data: calendarPreferences, isLoading: calendarPreferencesLoading } =
    api.calendar.getCalendarPreferences.useQuery(undefined, {
      enabled: calendarStatus?.isConnected ?? false,
    });

  // Update selected calendars mutation
  const updateSelectedCalendars = api.calendar.updateSelectedCalendars.useMutation({
    onSuccess: async () => {
      await utils.calendar.getCalendarPreferences.invalidate();
      notifications.show({
        title: "Calendars Updated",
        message: "Your calendar selection has been saved.",
        color: "green",
        icon: <IconCheck size={16} />,
      });
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message ?? "Failed to update calendar selection",
        color: "red",
        icon: <IconAlertCircle size={16} />,
      });
    },
  });

  const handleCalendarSelectionChange = (calendarIds: string[]) => {
    updateSelectedCalendars.mutate({ calendarIds });
  };

  const toggleSection = api.navigationPreference.toggleSection.useMutation({
    onSuccess: () => {
      void utils.navigationPreference.getPreferences.invalidate();
      notifications.show({
        title: "Updated",
        message: "Navigation preference saved",
        color: "green",
        icon: <IconCheck size={16} />,
      });
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message ?? "Failed to update preference",
        color: "red",
        icon: <IconAlertCircle size={16} />,
      });
    },
  });

  const toggleItem = api.navigationPreference.toggleItem.useMutation({
    onSuccess: () => {
      void utils.navigationPreference.getPreferences.invalidate();
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message ?? "Failed to update preference",
        color: "red",
        icon: <IconAlertCircle size={16} />,
      });
    },
  });

  const resetToDefaults = api.navigationPreference.resetToDefaults.useMutation({
    onSuccess: () => {
      void utils.navigationPreference.getPreferences.invalidate();
      notifications.show({
        title: "Reset Complete",
        message: "All menu items are now visible",
        color: "blue",
        icon: <IconCheck size={16} />,
      });
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message ?? "Failed to reset preferences",
        color: "red",
        icon: <IconAlertCircle size={16} />,
      });
    },
  });

  const toggleInspiringQuote =
    api.navigationPreference.toggleInspiringQuote.useMutation({
      onSuccess: () => {
        void utils.navigationPreference.getPreferences.invalidate();
        notifications.show({
          title: "Updated",
          message: "Home screen preference saved",
          color: "green",
          icon: <IconCheck size={16} />,
        });
      },
      onError: (error) => {
        notifications.show({
          title: "Error",
          message: error.message ?? "Failed to update preference",
          color: "red",
          icon: <IconAlertCircle size={16} />,
        });
      },
    });

  const toggleSuggestedFocus =
    api.navigationPreference.toggleSuggestedFocus.useMutation({
      onSuccess: () => {
        void utils.navigationPreference.getPreferences.invalidate();
        notifications.show({
          title: "Updated",
          message: "Home screen preference saved",
          color: "green",
          icon: <IconCheck size={16} />,
        });
      },
      onError: (error) => {
        notifications.show({
          title: "Error",
          message: error.message ?? "Failed to update preference",
          color: "red",
          icon: <IconAlertCircle size={16} />,
        });
      },
    });

  const isSectionHidden = (section: string) =>
    preferences?.hiddenSections?.includes(section) ?? false;

  const isItemHidden = (item: string) =>
    preferences?.hiddenItems?.includes(item) ?? false;

  if (isLoading) {
    return (
      <Container size="md" py="xl">
        <div className="flex justify-center py-12">
          <Loader size="lg" />
        </div>
      </Container>
    );
  }

  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <Group justify="space-between">
          <Button
            variant="subtle"
            leftSection={<IconArrowLeft size={16} />}
            component={Link}
            href="/home"
          >
            Back
          </Button>
          <Button
            variant="light"
            leftSection={<IconRefresh size={16} />}
            onClick={() => resetToDefaults.mutate()}
            loading={resetToDefaults.isPending}
          >
            Reset to Defaults
          </Button>
        </Group>

        <div>
          <Title order={1} className="text-text-primary">
            Navigation Settings
          </Title>
          <Text c="dimmed" mt="xs">
            Customize which sections and items appear in your sidebar navigation
          </Text>
        </div>

        {/* Info Card */}
        <Paper p="md" withBorder className="bg-surface-secondary">
          <Text size="sm" c="dimmed">
            Hidden sections and items will not appear in your sidebar. The
            primary navigation (Home, Inbox, Today, Upcoming) cannot be hidden.
          </Text>
        </Paper>

        {/* Section Cards */}
        <Accordion variant="separated" radius="md">
          {Object.entries(MENU_STRUCTURE).map(([sectionKey, section]) => {
            const SectionIcon = section.icon;
            const sectionHidden = isSectionHidden(sectionKey);
            const hiddenItemsCount = section.items.filter((item) =>
              isItemHidden(item.key)
            ).length;

            return (
              <Accordion.Item key={sectionKey} value={sectionKey}>
                <Accordion.Control>
                  <Group justify="space-between" wrap="nowrap" pr="md">
                    <Group gap="md">
                      <SectionIcon size={20} className="text-text-muted" />
                      <div>
                        <Text fw={500}>{section.label}</Text>
                        {hiddenItemsCount > 0 && !sectionHidden && (
                          <Text size="xs" c="dimmed">
                            {hiddenItemsCount} item(s) hidden
                          </Text>
                        )}
                      </div>
                    </Group>
                    <Group gap="sm" onClick={(e) => e.stopPropagation()}>
                      {sectionHidden && (
                        <Badge color="gray" variant="light" size="sm">
                          Hidden
                        </Badge>
                      )}
                      <Switch
                        checked={!sectionHidden}
                        onChange={() =>
                          toggleSection.mutate({
                            section: sectionKey as SectionKey,
                            visible: sectionHidden,
                          })
                        }
                        disabled={toggleSection.isPending}
                      />
                    </Group>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="xs" pt="xs">
                    {sectionHidden && (
                      <Text size="sm" c="dimmed" mb="xs">
                        Enable the section to customize individual items
                      </Text>
                    )}
                    {section.items.map((item) => (
                      <Paper
                        key={item.key}
                        p="sm"
                        withBorder
                        className={`bg-surface-primary ${
                          sectionHidden ? "opacity-50" : ""
                        }`}
                      >
                        <Group justify="space-between">
                          <Text size="sm">{item.label}</Text>
                          <Switch
                            checked={!isItemHidden(item.key)}
                            onChange={() =>
                              toggleItem.mutate({
                                item: item.key,
                                visible: isItemHidden(item.key),
                              })
                            }
                            disabled={sectionHidden || toggleItem.isPending}
                            size="sm"
                          />
                        </Group>
                      </Paper>
                    ))}
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            );
          })}
        </Accordion>

        {/* Home Screen Section */}
        <Card
          className="bg-surface-secondary border-border-primary"
          withBorder
          p="lg"
        >
          <Group gap="sm" mb="md">
            <IconHome size={20} className="text-text-muted" />
            <div>
              <Title order={4} className="text-text-primary">
                Home Screen
              </Title>
              <Text size="sm" c="dimmed">
                Customize what appears on your home screen
              </Text>
            </div>
          </Group>

          <Stack gap="sm">
            {/* Daily Quote Toggle */}
            <Paper p="sm" withBorder className="bg-surface-primary">
              <Group justify="space-between">
                <Group gap="sm">
                  <IconQuote size={18} className="text-text-muted" />
                  <div>
                    <Text size="sm" fw={500}>
                      Daily Inspiring Quote
                    </Text>
                    <Text size="xs" c="dimmed">
                      Show a motivational quote each day
                    </Text>
                  </div>
                </Group>
                <Switch
                  checked={preferences?.showInspiringQuote ?? true}
                  onChange={(e) =>
                    toggleInspiringQuote.mutate({
                      visible: e.currentTarget.checked,
                    })
                  }
                  disabled={toggleInspiringQuote.isPending}
                />
              </Group>
            </Paper>

            {/* Suggested Focus Toggle */}
            <Paper p="sm" withBorder className="bg-surface-primary">
              <Group justify="space-between">
                <Group gap="sm">
                  <IconSparkles size={18} className="text-text-muted" />
                  <div>
                    <Text size="sm" fw={500}>
                      AI Suggested Focus
                    </Text>
                    <Text size="xs" c="dimmed">
                      Show AI-powered daily focus suggestions
                    </Text>
                  </div>
                </Group>
                <Switch
                  checked={preferences?.showSuggestedFocus ?? true}
                  onChange={(e) =>
                    toggleSuggestedFocus.mutate({
                      visible: e.currentTarget.checked,
                    })
                  }
                  disabled={toggleSuggestedFocus.isPending}
                />
              </Group>
            </Paper>

            {/* Browse Quotes Link */}
            <Paper
              p="sm"
              withBorder
              className="bg-surface-primary cursor-pointer hover:bg-surface-secondary transition-colors"
              component={Link}
              href="/quotes"
            >
              <Group justify="space-between">
                <Group gap="sm">
                  <IconQuote size={18} className="text-text-muted" />
                  <div>
                    <Text size="sm" fw={500}>
                      Browse All Quotes
                    </Text>
                    <Text size="xs" c="dimmed">
                      View our collection of inspirational quotes
                    </Text>
                  </div>
                </Group>
                <IconChevronRight size={18} className="text-text-muted" />
              </Group>
            </Paper>
          </Stack>
        </Card>

        {/* Integrations Section */}
        <Card className="bg-surface-secondary border-border-primary" withBorder p="lg">
          <Group justify="space-between" align="center" mb="md">
            <div>
              <Title order={4} className="text-text-primary">
                Integrations
              </Title>
              <Text size="sm" c="dimmed">
                Manage your connected services
              </Text>
            </div>
            <Button
              variant="light"
              size="sm"
              onClick={() => setFirefliesModalOpened(true)}
            >
              Add Fireflies
            </Button>
          </Group>

          {/* Google Calendar Integration */}
          <Paper p="md" withBorder className="bg-surface-primary mb-md">
            <Group justify="space-between" align="center">
              <Group gap="sm">
                <IconCalendar size={20} className="text-text-muted" />
                <div>
                  <Text size="sm" fw={500}>
                    Google Calendar
                  </Text>
                  <Text size="xs" c="dimmed">
                    {calendarStatus?.isConnected
                      ? "Your calendar is connected"
                      : "Connect to see your events and schedule"}
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

            {/* Calendar Selection - shown when connected */}
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
                  selectedCalendarIds={calendarPreferences?.selectedCalendarIds ?? []}
                  onChange={handleCalendarSelectionChange}
                  isLoading={calendarPreferencesLoading || updateSelectedCalendars.isPending}
                />
              </div>
            )}
          </Paper>

          <FirefliesIntegrationsList />
        </Card>
      </Stack>

      {/* Fireflies Wizard Modal */}
      <FirefliesWizardModal
        opened={firefliesModalOpened}
        onClose={() => setFirefliesModalOpened(false)}
      />
    </Container>
  );
}
