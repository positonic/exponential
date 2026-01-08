import { pluginRegistry } from "./registry";
import type { PluginManifest } from "./types";

// Import all plugin manifests statically for type safety
import { okrManifest } from "./okr/manifest";

// List of all available plugins
const AVAILABLE_PLUGINS: PluginManifest[] = [
  okrManifest,
  // Add more plugins here as they are created
];

export function initializePlugins(): void {
  if (pluginRegistry.isInitialized()) {
    return;
  }

  // Register all available plugins
  for (const manifest of AVAILABLE_PLUGINS) {
    pluginRegistry.register(manifest);
  }

  pluginRegistry.setInitialized();
}

// Get list of all available plugin IDs
export function getAvailablePluginIds(): string[] {
  initializePlugins();
  return pluginRegistry.getAllPluginIds();
}

// Get default enabled plugin IDs
export function getDefaultEnabledPluginIds(): string[] {
  initializePlugins();
  return pluginRegistry.getDefaultEnabledPluginIds();
}
