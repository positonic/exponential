"use client";

import React from "react";
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
} from "@tabler/icons-react";
import Link from "next/link";
import { notifications } from "@mantine/notifications";

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
    ],
  },
} as const;

type SectionKey = keyof typeof MENU_STRUCTURE;

export default function NavigationSettingsPage() {
  const utils = api.useUtils();

  const { data: preferences, isLoading } =
    api.navigationPreference.getPreferences.useQuery();

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
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={2} className="text-text-primary">
              Navigation
            </Title>
            <Text c="dimmed" mt="xs">
              Customize which sections and items appear in your sidebar
            </Text>
          </div>
          <Button
            variant="light"
            leftSection={<IconRefresh size={16} />}
            onClick={() => resetToDefaults.mutate()}
            loading={resetToDefaults.isPending}
            size="sm"
          >
            Reset to Defaults
          </Button>
        </Group>

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
      </Stack>
    </Container>
  );
}
