"use client";

import { useState, useEffect } from "react";
import { Card, Text, Stack, Group, Button, ActionIcon } from "@mantine/core";
import {
  IconPlug,
  IconX,
  IconBrandSlack,
  IconBrandGithub,
  IconFlame,
  IconCalendarEvent,
} from "@tabler/icons-react";
import Link from "next/link";
import { api } from "~/trpc/react";

// Mapping from onboarding tool names to integration providers
const TOOL_TO_INTEGRATION: Record<
  string,
  {
    provider: string;
    name: string;
    description: string;
    icon: React.ElementType;
    color: string;
  }
> = {
  Fireflies: {
    provider: "fireflies",
    name: "Fireflies.ai",
    description: "Auto-capture meeting notes and transcriptions",
    icon: IconFlame,
    color: "orange",
  },
  GitHub: {
    provider: "github",
    name: "GitHub",
    description: "Sync issues and pull requests with your projects",
    icon: IconBrandGithub,
    color: "gray",
  },
  Slack: {
    provider: "slack",
    name: "Slack",
    description: "Get notifications and manage tasks from Slack",
    icon: IconBrandSlack,
    color: "violet",
  },
  Monday: {
    provider: "monday",
    name: "Monday.com",
    description: "Sync boards and items with your projects",
    icon: IconCalendarEvent,
    color: "yellow",
  },
};

const STORAGE_KEY = "dismissedIntegrationSuggestions";

function getDismissedSuggestions(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as string[]) : [];
  } catch {
    return [];
  }
}

function dismissSuggestion(provider: string): void {
  const current = getDismissedSuggestions();
  if (!current.includes(provider)) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...current, provider]));
  }
}

export function IntegrationSuggestions() {
  const [dismissedProviders, setDismissedProviders] = useState<string[]>([]);

  // Load dismissed providers from localStorage on mount
  useEffect(() => {
    setDismissedProviders(getDismissedSuggestions());
  }, []);

  // Fetch user's selected tools from onboarding
  const { data: selectedTools = [], isLoading: toolsLoading } =
    api.user.getSelectedTools.useQuery();

  // Fetch user's current integrations
  const { data: integrations = [], isLoading: integrationsLoading } =
    api.integration.listIntegrations.useQuery();

  // Get connected provider names
  const connectedProviders = integrations.map((i) => i.provider.toLowerCase());

  // Calculate suggestions: tools that have integrations but aren't connected yet
  const suggestions = selectedTools
    .filter((tool) => {
      const mapping = TOOL_TO_INTEGRATION[tool];
      if (!mapping) return false; // No integration available for this tool

      const isConnected = connectedProviders.includes(mapping.provider);
      const isDismissed = dismissedProviders.includes(mapping.provider);

      return !isConnected && !isDismissed;
    })
    .map((tool) => ({
      tool,
      ...TOOL_TO_INTEGRATION[tool]!,
    }));

  const handleDismiss = (provider: string) => {
    dismissSuggestion(provider);
    setDismissedProviders((prev) => [...prev, provider]);
  };

  // Don't render if loading or no suggestions
  if (toolsLoading || integrationsLoading) {
    return null;
  }

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="mb-6">
      <Text size="sm" fw={500} className="text-text-secondary mb-3">
        Connect your tools
      </Text>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {suggestions.map((suggestion) => {
          const Icon = suggestion.icon;
          return (
            <Card
              key={suggestion.provider}
              withBorder
              radius="md"
              className="border-border-primary bg-surface-secondary"
            >
              <Stack gap="sm">
                <Group justify="space-between">
                  <Group gap="xs">
                    <Icon size={20} className="text-text-primary" />
                    <Text fw={500} size="sm" className="text-text-primary">
                      {suggestion.name}
                    </Text>
                  </Group>
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    onClick={() => handleDismiss(suggestion.provider)}
                    aria-label={`Dismiss ${suggestion.name} suggestion`}
                  >
                    <IconX size={14} />
                  </ActionIcon>
                </Group>

                <Text size="xs" className="text-text-secondary">
                  {suggestion.description}
                </Text>

                <Button
                  component={Link}
                  href="/integrations"
                  variant="light"
                  size="xs"
                  leftSection={<IconPlug size={14} />}
                  fullWidth
                >
                  Connect
                </Button>
              </Stack>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
