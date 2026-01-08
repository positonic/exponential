import type { PluginManifest } from "../types";

export const okrManifest: PluginManifest = {
  id: "okr",
  name: "OKRs (Objectives & Key Results)",
  version: "1.0.0",
  description:
    "Track objectives and measurable key results aligned with your goals",
  author: "Exponential Team",

  capabilities: ["router", "navigation", "dashboard", "workspace-scoped"],

  entryPoints: {
    router: "~/plugins/okr/server/routers/keyResult",

    navigation: [
      {
        id: "okr-dashboard",
        label: "OKRs",
        icon: "IconTargetArrow",
        href: "/w/:workspaceSlug/okrs",
        section: "alignment",
        order: 5,
        workspaceScoped: true,
      },
    ],

    dashboardWidgets: [
      {
        id: "okr-progress-widget",
        title: "OKR Progress",
        component: "OkrProgressWidget",
        order: 10,
        gridSpan: "half",
      },
    ],
  },

  dependencies: [],
  defaultEnabled: true,
};
