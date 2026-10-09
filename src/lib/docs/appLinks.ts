/**
 * Which docs page explains the app screen at a given path.
 *
 * Used by the `?` help link in page headers. Keys are matched against the
 * path with the workspace prefix (`/w/<slug>`) removed, longest prefix
 * first, so `/settings/plugins` wins over `/settings`. Keep targets in sync
 * with `content/docs`; `src/lib/docs/__tests__/appLinks.test.ts` fails if a
 * target page does not exist.
 */
export const APP_DOCS: Record<string, string> = {
  "/home": "/docs/quickstart",
  "/inbox": "/docs/do/inbox-and-today",
  "/today": "/docs/do/inbox-and-today",
  "/upcoming": "/docs/do/inbox-and-today",
  "/time": "/docs/do/time-tracking",
  "/daily-plan": "/docs/do/daily-plan",
  "/actions": "/docs/do/actions",
  "/projects": "/docs/do/projects",
  "/projects-tasks": "/docs/do/actions",
  "/timeline": "/docs/do/activity-views-timeline",
  "/views": "/docs/do/activity-views-timeline",
  "/activity": "/docs/do/activity-views-timeline",
  "/pages": "/docs/do/pages",
  "/goals": "/docs/plan/goals",
  "/okrs": "/docs/plan/okrs",
  "/okr-checkin": "/docs/plan/okrs",
  "/decisions": "/docs/plan/decisions",
  "/wheel-of-life": "/docs/plan/wheel-of-life",
  "/products": "/docs/build/products",
  "/products-grid": "/docs/build/products",
  "/products-projects": "/docs/build/products",
  "/products-roadmap": "/docs/build/products",
  "/metrics": "/docs/build/retros-insights-metrics",
  "/meetings": "/docs/meet/meetings",
  "/recording": "/docs/meet/meetings",
  "/ceremonies": "/docs/meet/ceremonies",
  "/calendar": "/docs/meet/calendar",
  "/crm": "/docs/crm/contacts",
  "/crm/pipeline": "/docs/crm/pipeline-forms-broadcasts",
  "/crm/forms": "/docs/crm/pipeline-forms-broadcasts",
  "/crm/broadcasts": "/docs/crm/pipeline-forms-broadcasts",
  "/crm/lists": "/docs/crm/lists-pipelines-automations",
  "/crm/automations": "/docs/crm/lists-pipelines-automations",
  "/agent": "/docs/zoe/assistant",
  "/knowledge-base": "/docs/zoe/knowledge-base",
  "/journal": "/docs/reflect/journal",
  "/days": "/docs/reflect/journal",
  "/habits": "/docs/reflect/habits",
  "/startup-routine": "/docs/reflect/routines",
  "/wind-down": "/docs/reflect/routines",
  "/weekly-plan": "/docs/reflect/weekly-plan",
  "/weekly-team-checkin": "/docs/reflect/weekly-plan",
  "/teams": "/docs/collaborate/teams",
  "/workspaces": "/docs/collaborate/workspaces",
  "/workflows": "/docs/integrations",
  "/wiki": "/docs/capture/desktop-app",
  // Account settings live at /settings/*; workspace settings at /w/<slug>/settings/*.
  "/settings": "/docs/reference/your-settings",
  "/settings/notifications": "/docs/collaborate/notifications",
  "/settings/integrations": "/docs/integrations",
  "/settings/api-keys": "/docs/developers/api-tokens",
  "/settings/agents": "/docs/developers/external-agents",
  "/settings/assistant": "/docs/zoe/chat-gateways",
};

/** Workspace-scoped overrides where the same suffix means something else under /w/<slug>. */
const WORKSPACE_DOCS: Record<string, string> = {
  "/settings": "/docs/reference/workspace-settings",
  "/settings/plugins": "/docs/reference/plugins",
  "/settings/ceremonies": "/docs/meet/ceremonies",
  "/settings/decisions": "/docs/plan/decisions",
};

/** The docs page for an app path, or null when none fits. */
export function docsHrefForPath(pathname: string): string | null {
  const match = /^\/w\/[^/]+(\/.*)?$/.exec(pathname);
  const inWorkspace = !!match;
  const rest = inWorkspace ? (match[1] ?? "/home") : pathname;
  const tables = inWorkspace ? [WORKSPACE_DOCS, APP_DOCS] : [APP_DOCS];
  for (const table of tables) {
    const key = Object.keys(table)
      .filter((k) => rest === k || rest.startsWith(`${k}/`))
      .sort((a, b) => b.length - a.length)[0];
    if (key) return table[key]!;
  }
  return null;
}

export const ALL_APP_DOC_TARGETS = [...new Set([...Object.values(APP_DOCS), ...Object.values(WORKSPACE_DOCS)])];
