"use client";

import {
  Title,
  Text,
  SimpleGrid,
  Stack,
  Paper,
  Group,
  ThemeIcon,
} from "@mantine/core";
import { IconPlugConnected } from "@tabler/icons-react";
import { ServiceCard } from "./ServiceCard";

interface Integration {
  id: string;
  name: string;
  provider: string;
  status: string;
  createdAt: string;
  lastSyncAt?: string;
}

interface ConnectedServicesGridProps {
  integrations: Integration[];
  onServiceClick: (integration: Integration) => void;
  onProviderClick: (provider: string) => void;
  onTestConnection: (integrationId: string) => void;
  onRefresh: (integrationId: string) => void;
  onSettings: (integration: Integration) => void;
  loadingStates: {
    testing: string | null;
    refreshing: string | null;
  };
}

const formatLastSync = (lastSyncAt?: string, createdAt?: string) => {
  const date = lastSyncAt ? new Date(lastSyncAt) : new Date(createdAt || "");
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  // Convert to various time units
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};

export function ConnectedServicesGrid({
  integrations,
  onServiceClick,
  onProviderClick,
  onTestConnection,
  onRefresh,
  onSettings,
  loadingStates,
}: ConnectedServicesGridProps) {
  // Group integrations by provider
  const groupedIntegrations = integrations.reduce(
    (acc, integration) => {
      if (!acc[integration.provider]) {
        acc[integration.provider] = [];
      }
      acc[integration?.provider]?.push(integration);
      return acc;
    },
    {} as Record<string, Integration[]>,
  );

  // Create provider cards - one per provider
  const providerCards = Object.entries(groupedIntegrations).map(
    ([provider, providerIntegrations]) => {
      // Sort by most recent activity (lastSyncAt or createdAt)
      const sortedIntegrations = providerIntegrations.sort((a, b) => {
        const dateA = new Date(a.lastSyncAt || a.createdAt);
        const dateB = new Date(b.lastSyncAt || b.createdAt);
        return dateB.getTime() - dateA.getTime();
      });

      const mostRecentIntegration = sortedIntegrations[0];
      const allActive = providerIntegrations.every(
        (int) => int.status === "ACTIVE",
      );
      const activeCount = providerIntegrations.filter(
        (int) => int.status === "ACTIVE",
      ).length;

      return {
        provider,
        integrations: providerIntegrations,
        displayIntegration: mostRecentIntegration,
        count: providerIntegrations.length,
        status: allActive ? "ACTIVE" : "MIXED",
        activeCount,
        lastSync: formatLastSync(
          mostRecentIntegration?.lastSyncAt,
          mostRecentIntegration?.createdAt,
        ),
      };
    },
  );
  if (integrations.length === 0) {
    return (
      <Stack gap="lg">
        <Title order={2} size="h3">
          Connected Services
        </Title>
        <Paper withBorder p="xl" radius="md" className="text-center">
          <Stack align="center" gap="md">
            <ThemeIcon size="xl" variant="light" color="gray">
              <IconPlugConnected size={32} />
            </ThemeIcon>
            <div>
              <Text size="lg" fw={500} mb="xs">
                No connected services
              </Text>
              <Text c="dimmed" size="sm">
                Connect your first external service to start automating your
                workflow
              </Text>
            </div>
          </Stack>
        </Paper>
      </Stack>
    );
  }

  const totalServices = integrations.length;
  const uniqueProviders = providerCards.length;

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <div>
          <Title order={2} size="h3">
            Connected Services
          </Title>
          <Text c="dimmed" size="sm">
            {totalServices} service{totalServices !== 1 ? "s" : ""} across{" "}
            {uniqueProviders} provider{uniqueProviders !== 1 ? "s" : ""}
          </Text>
        </div>
      </Group>

      <SimpleGrid cols={2} spacing="md">
        {providerCards.map((providerCard) => {
          const {
            provider,
            integrations: providerIntegrations,
            displayIntegration,
            count,
            status,
            activeCount,
            lastSync,
          } = providerCard;

          // If only one integration for this provider, show individual integration
          if (count === 1 && displayIntegration) {
            const integration = displayIntegration;
            return (
              <ServiceCard
                key={`${provider}-${integration?.id}`}
                variant="connected"
                serviceName={integration.name}
                provider={integration.provider}
                status={integration.status}
                lastSync={lastSync}
                onCardClick={() => onServiceClick(integration)}
                onTestConnection={() => onTestConnection(integration.id)}
                onRefresh={
                  integration.provider === "slack"
                    ? () => onRefresh(integration.id)
                    : undefined
                }
                onSettings={() => onSettings(integration)}
                isLoading={{
                  test: loadingStates.testing === integration.id,
                  refresh: loadingStates.refreshing === integration.id,
                }}
              />
            );
          }

          // If multiple integrations for this provider, show grouped card
          return (
            <ServiceCard
              key={`${provider}-group`}
              variant="connected"
              serviceName={`${provider.charAt(0).toUpperCase() + provider.slice(1)} (${count} services)`}
              provider={provider}
              status={status as "ACTIVE" | "INACTIVE"}
              lastSync={lastSync}
              description={
                status === "ACTIVE"
                  ? `All ${count} services connected`
                  : `${activeCount}/${count} services connected`
              }
              onCardClick={() => onProviderClick(provider)}
              // For grouped cards, disable individual actions as they apply to the provider group
              onTestConnection={undefined}
              onRefresh={undefined}
              onSettings={undefined}
              isLoading={{}}
            />
          );
        })}
      </SimpleGrid>
    </Stack>
  );
}
