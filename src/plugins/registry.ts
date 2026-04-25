import type {
  PluginManifest,
  PluginInstance,
  NavigationItem,
  DashboardWidget,
} from "./types";

class PluginRegistry {
  private static instance: PluginRegistry;
  private plugins = new Map<string, PluginInstance>();
  private initialized = false;

  // Private constructor for singleton pattern
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  public static getInstance(): PluginRegistry {
    if (!PluginRegistry.instance) {
      PluginRegistry.instance = new PluginRegistry();
    }
    return PluginRegistry.instance;
  }

  // Register a plugin
  public register(manifest: PluginManifest): void {
    if (this.plugins.has(manifest.id)) {
      console.warn(`Plugin ${manifest.id} is already registered. Skipping.`);
      return;
    }

    this.plugins.set(manifest.id, {
      manifest,
      isLoaded: false,
    });
  }

  // Get plugin by ID
  public getPlugin(id: string): PluginInstance | undefined {
    return this.plugins.get(id);
  }

  // Get all registered plugins
  public getAllPlugins(): PluginInstance[] {
    return Array.from(this.plugins.values());
  }

  // Get all plugin IDs
  public getAllPluginIds(): string[] {
    return Array.from(this.plugins.keys());
  }

  // Get all navigation items from enabled plugins
  public getNavigationItems(enabledPluginIds: string[]): NavigationItem[] {
    const items: NavigationItem[] = [];

    for (const pluginId of enabledPluginIds) {
      const plugin = this.plugins.get(pluginId);
      if (plugin?.manifest.entryPoints.navigation) {
        items.push(...plugin.manifest.entryPoints.navigation);
      }
    }

    return items.sort((a, b) => a.order - b.order);
  }

  // Get all dashboard widgets from enabled plugins
  public getDashboardWidgets(enabledPluginIds: string[]): DashboardWidget[] {
    const widgets: DashboardWidget[] = [];

    for (const pluginId of enabledPluginIds) {
      const plugin = this.plugins.get(pluginId);
      if (plugin?.manifest.entryPoints.dashboardWidgets) {
        widgets.push(...plugin.manifest.entryPoints.dashboardWidgets);
      }
    }

    return widgets.sort((a, b) => a.order - b.order);
  }

  // Mark plugin as loaded with its router
  public setPluginLoaded(id: string, router?: unknown): void {
    const plugin = this.plugins.get(id);
    if (plugin) {
      plugin.router = router;
      plugin.isLoaded = true;
    }
  }

  // Check if registry is initialized
  public isInitialized(): boolean {
    return this.initialized;
  }

  // Mark registry as initialized
  public setInitialized(): void {
    this.initialized = true;
  }

  // Get plugins that are enabled by default
  public getDefaultEnabledPluginIds(): string[] {
    return Array.from(this.plugins.values())
      .filter((p) => p.manifest.defaultEnabled)
      .map((p) => p.manifest.id);
  }
}

export const pluginRegistry = PluginRegistry.getInstance();
