import { z } from "zod";

// Plugin capability enum
export const PluginCapabilitySchema = z.enum([
  "router", // Provides tRPC routes
  "navigation", // Adds sidebar navigation items
  "dashboard", // Adds dashboard sections to home page
  "settings", // Adds settings pages
  "workspace-scoped", // Requires workspace context
]);

export type PluginCapability = z.infer<typeof PluginCapabilitySchema>;

// Navigation item definition
export const NavigationItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  icon: z.string(), // Tabler icon name e.g., "IconTargetArrow"
  href: z.string(), // Route path (supports :workspaceSlug placeholder)
  section: z.string(), // Which accordion section: "alignment", "tools", etc.
  order: z.number().default(0),
  workspaceScoped: z.boolean().default(false),
});

export type NavigationItem = z.infer<typeof NavigationItemSchema>;

// Dashboard widget definition
export const DashboardWidgetSchema = z.object({
  id: z.string(),
  title: z.string(),
  component: z.string(), // Component identifier for dynamic loading
  order: z.number().default(0),
  gridSpan: z.enum(["full", "half", "quarter"]).default("half"),
});

export type DashboardWidget = z.infer<typeof DashboardWidgetSchema>;

// Plugin manifest schema
export const PluginManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().optional(),
  author: z.string().optional(),
  capabilities: z.array(PluginCapabilitySchema),

  // Entry points
  entryPoints: z.object({
    router: z.string().optional(), // Path to router export
    navigation: z.array(NavigationItemSchema).optional(),
    dashboardWidgets: z.array(DashboardWidgetSchema).optional(),
    settingsComponent: z.string().optional(), // Path to settings component
  }),

  // Dependencies on other plugins
  dependencies: z.array(z.string()).default([]),

  // Default enabled state
  defaultEnabled: z.boolean().default(true),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

// Plugin instance (loaded plugin)
export interface PluginInstance {
  manifest: PluginManifest;
  router?: unknown;
  isLoaded: boolean;
}

// Plugin configuration (per-workspace) - matches Prisma model
export interface PluginConfigData {
  pluginId: string;
  workspaceId: string | null; // null = user-level default
  enabled: boolean;
  settings: Record<string, unknown>;
}
