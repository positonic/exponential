import { api } from "~/trpc/react";
import { pluginRegistry } from "~/plugins/registry";
import { initializePlugins } from "~/plugins/loader";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import type { NavigationItem } from "~/plugins/types";

export function usePluginNavigation() {
  const { workspaceId, workspaceSlug } = useWorkspace();

  // Get enabled plugins
  const { data: enabledPlugins, isLoading } =
    api.pluginConfig.getEnabled.useQuery(
      { workspaceId: workspaceId ?? undefined },
      { staleTime: 5 * 60 * 1000 } // 5 minutes
    );

  // Ensure plugins are initialized
  initializePlugins();

  // Get navigation items from enabled plugins
  const navigationItems: NavigationItem[] = enabledPlugins
    ? pluginRegistry.getNavigationItems(enabledPlugins)
    : [];

  // Replace :workspaceSlug placeholder with actual slug
  const resolvedItems = navigationItems.map((item) => ({
    ...item,
    href:
      item.workspaceScoped && workspaceSlug
        ? item.href.replace(":workspaceSlug", workspaceSlug)
        : item.href,
  }));

  // Group items by section
  const itemsBySection = resolvedItems.reduce<Record<string, NavigationItem[]>>(
    (acc, item) => {
      const section = item.section;
      const existing = acc[section] ?? [];
      return {
        ...acc,
        [section]: [...existing, item],
      };
    },
    {}
  );

  return {
    navigationItems: resolvedItems,
    itemsBySection,
    isLoading,
    enabledPlugins: enabledPlugins ?? [],
  };
}
