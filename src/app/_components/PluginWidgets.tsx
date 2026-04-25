"use client";

import { Suspense } from "react";
import { Skeleton, SimpleGrid, Title, Stack } from "@mantine/core";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { pluginRegistry } from "~/plugins/registry";
import { initializePlugins } from "~/plugins/loader";
import { OkrProgressWidget } from "~/plugins/okr/client/components/OkrProgressWidget";

// Widget component map - maps widget IDs to their React components
const widgetComponents: Record<string, React.ComponentType<unknown>> = {
  "okr-progress-widget": OkrProgressWidget as React.ComponentType<unknown>,
  // Add more widget components here as plugins are created
};

export function PluginWidgets() {
  const { workspaceId } = useWorkspace();

  // Get enabled plugins
  const { data: enabledPlugins } = api.pluginConfig.getEnabled.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { staleTime: 5 * 60 * 1000 }
  );

  // Initialize and get widgets
  initializePlugins();
  const widgets = enabledPlugins
    ? pluginRegistry.getDashboardWidgets(enabledPlugins)
    : [];

  if (widgets.length === 0) {
    return null;
  }

  return (
    <Stack gap="md">
      <Title order={3} size="h4" className="text-text-primary">
        Plugin Widgets
      </Title>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        {widgets.map((widget) => {
          const WidgetComponent = widgetComponents[widget.id];
          if (!WidgetComponent) {
            return null;
          }

          return (
            <Suspense key={widget.id} fallback={<Skeleton height={150} />}>
              <WidgetComponent />
            </Suspense>
          );
        })}
      </SimpleGrid>
    </Stack>
  );
}
