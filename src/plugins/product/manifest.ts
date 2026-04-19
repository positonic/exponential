import type { PluginManifest } from "../types";

export const productManifest: PluginManifest = {
  id: "product",
  name: "Product Management",
  version: "0.1.0",
  description:
    "Manage products, features, tickets, research insights, cycles, and retrospectives.",
  author: "Exponential",

  capabilities: ["router", "navigation", "workspace-scoped"],

  entryPoints: {
    router: "~/plugins/product/server/routers",

    navigation: [
      {
        id: "product-dashboard",
        label: "Products",
        icon: "IconLayoutGrid",
        href: "/w/:workspaceSlug/products",
        section: "workspace",
        order: 3,
        workspaceScoped: true,
      },
    ],
  },

  dependencies: [],
  defaultEnabled: false,
};
