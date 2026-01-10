import type { PluginManifest } from "../types";

export const crmManifest: PluginManifest = {
  id: "crm",
  name: "CRM (Contact Management)",
  version: "1.0.0",
  description:
    "Manage contacts, organizations, and interactions with encrypted PII storage",
  author: "Exponential Team",

  capabilities: ["router", "navigation", "workspace-scoped"],

  entryPoints: {
    router: "~/server/api/routers/crmContact",

    navigation: [
      {
        id: "crm-dashboard",
        label: "CRM",
        icon: "IconUsers",
        href: "/w/:workspaceSlug/crm",
        section: "main",
        order: 3, // After Workspace (order ~2)
        workspaceScoped: true,
      },
    ],
  },

  dependencies: [],
  defaultEnabled: true,
};
